const plaidRepository = require('../repositories/plaidRepository');
const plaidCardPaymentRepository = require('../repositories/plaidCardPaymentRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const creditCardPaymentService = require('./creditCardPaymentService');
const {
  PAYMENT_WINDOW_DAYS, shiftDate, isCardRow, isCardCredit, isFundingDebit, isCardPaymentSide, isPaymentPair,
  pairCardPayments, findPaymentCandidates
} = require('../utils/plaidMatching');
const { kindFor, looksLikeCardPayment } = require('../utils/plaidClassification');
const {
  fail, asInputError, round2, defaultPlace, money, describeTxn, exclusive, requireNew, logReview
} = require('./plaidInboxSupport');

const pairShape = (row) => ({
  id: row.id,
  date: row.date,
  amount: row.amount,
  accountName: row.accountName,
  accountMask: row.accountMask,
  paymentMethodName: row.paymentMethodName
});

/**
 * Credit card payments in the Import Inbox. A payment leaves a funding account (chequing) as a debit and
 * reaches the card as a credit; both bank rows resolve to ONE credit_card_payments row:
 * - the card side records it (`record`), optionally taking the paying debit along;
 * - the funding side links to it (`link`), and only records when the card has no bank connection
 *   (`recordFromFunding`), because no card row will ever arrive for it.
 * Text and category never decide anything here: they label rows. Pairing (same cents, opposite sides, within
 * 5 days) is the evidence, and the user always chooses between several candidates.
 */
class PlaidCardPaymentService {
  /**
   * What the inbox shows for card payments on each `new` row.
   * @param {Array} rows inbox rows (findInbox)
   * @returns {Promise<{byRow: Map<number, object>, unconnectedCards: Array<{id: number, name: string}>}>}
   */
  async describeRows(rows) {
    // A pending credit on a card is listed too (it can't be recorded yet, and the inbox says so)
    const sides = rows.filter(row => isCardPaymentSide(row) || (row.pending && isCardCredit(row)));
    const byRow = new Map();
    if (sides.length === 0) return { byRow, unconnectedCards: [] };

    const dates = sides.map(row => row.date).sort();
    const [payments, unconnectedCards] = await Promise.all([
      plaidCardPaymentRepository.findPaymentsInRange(shiftDate(dates[0], -PAYMENT_WINDOW_DAYS), shiftDate(dates[dates.length - 1], PAYMENT_WINDOW_DAYS)),
      plaidCardPaymentRepository.findUnconnectedCreditCards()
    ]);
    const pairs = pairCardPayments(rows);

    for (const row of sides) {
      const classified = { pfcDetailed: row.pfcDetailed, amount: row.amount, isCard: isCardRow(row), name: row.name, merchantName: row.merchantName };
      const kind = kindFor(classified);
      const looksLike = looksLikeCardPayment(classified);
      const pairCandidates = (pairs.get(row.id) || []).map(pairShape);
      const paymentCandidates = findPaymentCandidates(row, payments).map(({ id, paymentMethodId, paymentMethodName, date, amount, notes }) => (
        { id, paymentMethodId, paymentMethodName, date, amount, notes }
      ));
      // Every credit on a card can be recorded as a payment (a missed label never blocks); a debit elsewhere
      // only shows anything when something says it could be one
      if (!isCardCredit(row) && !kind && !looksLike && pairCandidates.length === 0 && paymentCandidates.length === 0) continue;
      byRow.set(row.id, {
        side: isCardCredit(row) ? 'card' : 'funding',
        kind,
        looksLikeCardPayment: looksLike,
        pairCandidates,
        paymentCandidates
      });
    }
    return { byRow, unconnectedCards: sides.some(isFundingDebit) ? unconnectedCards : [] };
  }

  /**
   * Handle `POST /inbox/:id/card-payment`. The row's side decides what the body may carry:
   * - `{ creditCardPaymentId }` on either side: link to a recorded payment;
   * - `{ alsoLinkId? }` on a card credit: record the payment (and link the paying debit);
   * - `{ paymentMethodId }` on a funding debit: record the payment to a card with no bank connection.
   * @returns {Promise<{created: boolean, payment: object, transaction: object, linkedTransactionIds: number[]}>}
   */
  async act(id, body = {}) {
    const txn = await plaidRepository.findTransactionById(id);
    if (!txn) throw fail('Bank transaction not found', 404);
    const has = (key) => body[key] !== undefined && body[key] !== null;

    if (has('creditCardPaymentId')) {
      if (has('alsoLinkId') || has('paymentMethodId')) throw fail('Choose either an existing payment or a new one, not both', 400);
      return this.link(id, body.creditCardPaymentId);
    }
    if (isCardRow(txn)) {
      if (has('paymentMethodId')) throw fail('A credit on a card is recorded on that card', 400);
      return this.record(id, { alsoLinkId: body.alsoLinkId });
    }
    if (has('alsoLinkId')) throw fail('Record a card payment from the credit on the card', 400);
    return this.recordFromFunding(id, { paymentMethodId: body.paymentMethodId });
  }

  /**
   * Record the credit on a card as a payment on that card (bank amount, the credit's posted date), and link it.
   * With `alsoLinkId`, the debit that paid it is linked to the same payment, all in one transaction.
   */
  async record(id, { alsoLinkId } = {}) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      if (!isCardCredit(txn)) {
        throw fail('Only a credit on a credit card can be recorded as a payment to it', 400);
      }
      if (alsoLinkId === undefined || alsoLinkId === null) {
        return this._record(txn, null);
      }
      const parsedId = parseInt(alsoLinkId, 10);
      if (Number.isNaN(parsedId) || parsedId === id) throw fail('Choose the paying debit from the list', 400);
      return exclusive(parsedId, async () => {
        const funding = await requireNew(parsedId, { settled: true });
        if (!isPaymentPair(txn, funding)) {
          throw fail(`That debit doesn't match this payment: it must be the same amount, within ${PAYMENT_WINDOW_DAYS} days, from an account that isn't a card`, 400);
        }
        return this._record(txn, funding);
      });
    });
  }

  /**
   * Record the debit that paid a card the bank doesn't report on. Refused for a connected card: its credit will
   * arrive in the inbox and record the payment there, so it is never recorded twice.
   */
  async recordFromFunding(id, { paymentMethodId } = {}) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      if (!isFundingDebit(txn)) {
        throw fail('Only a debit from a bank account can be recorded as a payment to a card', 400);
      }
      const cardId = parseInt(paymentMethodId, 10);
      const card = Number.isNaN(cardId) ? null : await paymentMethodRepository.findById(cardId);
      if (!card || card.type !== 'credit_card' || !card.is_active) {
        throw fail('Choose an active credit card', 400);
      }
      if (await plaidCardPaymentRepository.isCardConnected(card.id)) {
        throw fail(`${card.display_name} is connected to a bank. Record the payment from its credit when it arrives in the inbox.`, 400);
      }
      return this._record(txn, null, card);
    });
  }

  /** Link a bank row to a payment that is already recorded (by hand, or from the other side). Creates nothing. */
  async link(id, creditCardPaymentId) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      if (!isCardPaymentSide(txn)) {
        throw fail('Only a credit on a credit card, or a debit from another account, can be linked to a card payment', 400);
      }
      const parsedId = parseInt(creditCardPaymentId, 10);
      const payment = Number.isNaN(parsedId) ? null : await plaidCardPaymentRepository.findPaymentById(parsedId);
      if (!payment) throw fail('Payment not found', 404);

      const side = isCardCredit(txn) ? 'card' : 'funding';
      if (side === 'card' && payment.paymentMethodId !== txn.paymentMethodId) {
        throw fail(`That payment is on ${payment.paymentMethodName}, not the card this credit is on`, 400);
      }
      if (side === 'card' ? payment.cardLinked : payment.fundingLinked) {
        throw fail(`That payment already has a bank transaction on the ${side === 'card' ? 'card' : 'paying account'} side`, 409);
      }
      if (findPaymentCandidates(txn, [payment]).length === 0) {
        throw fail(`That payment doesn't match: it must be the same amount, within ${PAYMENT_WINDOW_DAYS} days`, 400);
      }

      await plaidCardPaymentRepository.link(null, txn.id, payment.id, side);
      await logReview(txn, 'card_payment', `Linked bank transaction ${describeTxn(txn)} to the ${money(payment.amount)} payment to ${payment.paymentMethodName} on ${payment.date}`, {
        creditCardPaymentId: payment.id, side
      });
      return {
        created: false,
        payment,
        transaction: await plaidRepository.findTransactionById(id),
        linkedTransactionIds: [txn.id]
      };
    });
  }

  /**
   * Create the payment and link `txn` (and `funding`) to it in one transaction: nothing is left half done when a
   * row was reviewed meanwhile.
   * @param {object} txn the row being recorded: the card credit, or the funding debit when `card` is given
   * @param {object|null} funding the paying debit to link as well
   * @param {object} [card] the card (funding side only; otherwise the credit's own card)
   */
  async _record(txn, funding, card = null) {
    const side = card ? 'funding' : 'card';
    const target = card || await paymentMethodRepository.findById(txn.paymentMethodId);
    const raw = (txn.name || defaultPlace(txn) || 'bank payment').trim();

    let payment;
    try {
      payment = await creditCardPaymentService.recordPayment({
        payment_method_id: target.id,
        amount: round2(Math.abs(txn.amount)),
        payment_date: txn.date,
        notes: `Bank: ${raw}`.slice(0, 500)
      }, {
        withinTransaction: async (tx, created) => {
          await plaidCardPaymentRepository.link(tx, txn.id, created.id, side);
          if (funding) await plaidCardPaymentRepository.link(tx, funding.id, created.id, 'funding');
        }
      });
    } catch (err) {
      throw asInputError(err);
    }

    const rows = funding ? [[txn, side], [funding, 'funding']] : [[txn, side]];
    for (const [row, rowSide] of rows) {
      await logReview(row, 'card_payment', `Recorded bank transaction ${describeTxn(row)} as a ${money(payment.amount)} payment to ${target.display_name}`, {
        creditCardPaymentId: payment.id, side: rowSide
      });
    }
    return {
      created: true,
      payment: { ...payment, paymentMethodName: target.display_name },
      transaction: await plaidRepository.findTransactionById(txn.id),
      linkedTransactionIds: rows.map(([row]) => row.id)
    };
  }
}

module.exports = new PlaidCardPaymentService();
