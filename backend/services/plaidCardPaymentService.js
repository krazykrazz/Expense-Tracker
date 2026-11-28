const plaidRepository = require('../repositories/plaidRepository');
const plaidCardPaymentRepository = require('../repositories/plaidCardPaymentRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const creditCardPaymentService = require('./creditCardPaymentService');
const plaidConfig = require('../config/plaid');
const logger = require('../config/logger');
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
  paymentMethodId: row.paymentMethodId,
  date: row.date,
  amount: row.amount,
  accountName: row.accountName,
  accountMask: row.accountMask,
  paymentMethodName: row.paymentMethodName
});

/**
 * Credit card payments in the Import Inbox. A payment leaves a funding account (chequing) as a debit and
 * reaches the card as a credit; both bank rows resolve to ONE credit_card_payments row. Whichever side is seen
 * first records it (owner, 2026-11-27: waiting for a slow card's credit hid the payment):
 * - a card credit records it on its card (`record`), optionally taking the paying debit along;
 * - a funding debit records it on the card the user picks (`recordFromFunding`), taking that card's credit along
 *   when it is already in the inbox;
 * - the other side, arriving later, links itself (`autoLink`) when exactly one recorded payment fits it and it is
 *   the only row that fits that payment; anything less certain stays for the user (`link`). A payment entered by
 *   hand in the card view is linked the same way.
 * Text and category never decide anything here: they label rows. Pairing (same cents, opposite sides, within
 * 5 days) is the evidence, and the user always chooses between several candidates.
 */
/** Words of a card's name worth looking for in a debit's text ("CIBC MC" → cibc, mc). */
const nameWords = (name) => String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 2);

/**
 * The card a debit most likely paid: the card of its only card credit in the inbox, else the only card whose name
 * shares the most words with the debit's text ("CIBC MASTERCARD - Bill payment" → CIBC MC), else none.
 */
function suggestCard(row, pairCandidates, creditCards) {
  const pairCards = [...new Set(pairCandidates.map(pair => pair.paymentMethodId).filter(Boolean))];
  if (pairCards.length === 1) return pairCards[0];
  const text = new Set(nameWords([row.name, row.merchantName].filter(Boolean).join(' ')));
  const scored = creditCards
    .map(card => ({ id: card.id, score: nameWords(card.name).filter(word => text.has(word)).length }))
    .filter(card => card.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || (scored.length > 1 && scored[0].score === scored[1].score)) return null;
  return scored[0].id;
}

class PlaidCardPaymentService {
  /**
   * What the inbox shows for card payments on each `new` row.
   * @param {Array} rows inbox rows (findInbox)
   * @returns {Promise<{byRow: Map<number, object>, creditCards: Array<{id: number, name: string, connected: boolean}>}>}
   */
  async describeRows(rows) {
    // A pending credit on a card is listed too (it can't be recorded yet, and the inbox says so)
    const sides = rows.filter(row => isCardPaymentSide(row) || (row.pending && isCardCredit(row)));
    const byRow = new Map();
    if (sides.length === 0) return { byRow, creditCards: [] };

    const dates = sides.map(row => row.date).sort();
    const [payments, creditCards] = await Promise.all([
      plaidCardPaymentRepository.findPaymentsInRange(shiftDate(dates[0], -PAYMENT_WINDOW_DAYS), shiftDate(dates[dates.length - 1], PAYMENT_WINDOW_DAYS)),
      plaidCardPaymentRepository.findCreditCards()
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
      const side = isCardCredit(row) ? 'card' : 'funding';
      byRow.set(row.id, {
        side,
        kind,
        looksLikeCardPayment: looksLike,
        pairCandidates,
        paymentCandidates,
        ...(side === 'funding' ? { suggestedCardId: suggestCard(row, pairCandidates, creditCards) } : {})
      });
    }
    return { byRow, creditCards: sides.some(isFundingDebit) ? creditCards : [] };
  }

  /**
   * Handle `POST /inbox/:id/card-payment`. The row's side decides what the body may carry:
   * - `{ creditCardPaymentId }` on either side: link to a recorded payment;
   * - `{ alsoLinkId? }` on a card credit: record the payment (and link the paying debit);
   * - `{ paymentMethodId }` on a funding debit: record the payment to that card;
   * - `{ alsoLinkId }` on a funding debit: record it from that card credit, linking both (the credit's card).
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
    if (has('alsoLinkId')) {
      if (has('paymentMethodId')) throw fail('Choose either the card credit or a card, not both', 400);
      const creditId = parseInt(body.alsoLinkId, 10);
      if (Number.isNaN(creditId) || creditId === id) throw fail('Choose the card credit from the list', 400);
      return this.record(creditId, { alsoLinkId: id });
    }
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
   * Record the debit that paid a card as a payment on that card. When the card is connected to a bank its credit
   * arrives later and links itself to this payment (`autoLink`), so it is never recorded twice.
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
      return this._record(txn, null, card);
    });
  }

  /**
   * Link a bank row to a payment that is already recorded (by hand, or from the other side). Creates nothing.
   * @param {{automatic?: boolean}} [options] `automatic` when autoLink chose it (said so in the activity log)
   */
  async link(id, creditCardPaymentId, { automatic = false } = {}) {
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
      await logReview(txn, 'card_payment', `${automatic ? 'Automatically linked' : 'Linked'} bank transaction ${describeTxn(txn)} to the ${money(payment.amount)} payment to ${payment.paymentMethodName} on ${payment.date}`, {
        creditCardPaymentId: payment.id, side, ...(automatic ? { automatic: true } : {})
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
   * Link bank rows to payments already recorded, without asking, where it can't be wrong: a settled card payment
   * row (by its category or text) still to review that exactly one recorded payment fits (same cents within the
   * window, its card for a credit, that side not linked yet), when it is also the only such row that payment fits.
   * Run after a sync, a bank file import and a payment entered by hand. Nothing without Plaid; never throws.
   * @returns {Promise<Array<{transactionId: number, creditCardPaymentId: number}>>}
   */
  async autoLink() {
    try {
      if (!plaidConfig.isEnabled()) return [];
      const rows = (await plaidRepository.findInbox('new')).filter(row => {
        if (!isCardPaymentSide(row)) return false;
        const classified = { pfcDetailed: row.pfcDetailed, amount: row.amount, isCard: isCardRow(row), name: row.name, merchantName: row.merchantName };
        return kindFor(classified) === 'card_payment' || looksLikeCardPayment(classified);
      });
      if (rows.length === 0) return [];

      const dates = rows.map(row => row.date).sort();
      const payments = await plaidCardPaymentRepository.findPaymentsInRange(
        shiftDate(dates[0], -PAYMENT_WINDOW_DAYS), shiftDate(dates[dates.length - 1], PAYMENT_WINDOW_DAYS)
      );
      const fits = rows.map(row => ({ row, candidates: findPaymentCandidates(row, payments) }));
      // How many rows of each side every payment fits: a payment two rows fit is left for the user
      const claims = new Map();
      for (const { row, candidates } of fits) {
        for (const payment of candidates) {
          const key = `${payment.id}:${isCardCredit(row) ? 'card' : 'funding'}`;
          claims.set(key, (claims.get(key) || 0) + 1);
        }
      }

      const linked = [];
      for (const { row, candidates } of fits) {
        if (candidates.length !== 1) continue;
        const [payment] = candidates;
        if (claims.get(`${payment.id}:${isCardCredit(row) ? 'card' : 'funding'}`) !== 1) continue;
        try {
          await this.link(row.id, payment.id, { automatic: true });
          linked.push({ transactionId: row.id, creditCardPaymentId: payment.id });
        } catch (err) {
          // Reviewed or linked meanwhile: the user's choice stands
          logger.debug('Card payment not linked automatically', { plaidTransactionId: row.id, error: err.message });
        }
      }
      if (linked.length > 0) logger.info('Card payments linked automatically', { linked: linked.length });
      return linked;
    } catch (err) {
      logger.warn('Linking card payments automatically failed', { error: err.message });
      return [];
    }
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
