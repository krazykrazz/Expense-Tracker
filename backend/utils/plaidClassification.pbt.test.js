/**
 * @invariant Card payment classification follows the direction of the money and never lets text alone decide off
 * the card: (1) nothing moving the wrong way (a debit on a card, a credit on any other account) is ever a card
 * payment or looks like one, whatever its category or description; (2) away from the card, `kindFor` is
 * `card_payment` exactly when Plaid's detailed category says so; (3) `kindFor` implies `looksLikeCardPayment`.
 * @invariant Inbox buckets (spec 3.1): money into an account that isn't a card (deposits, `TRANSFER_IN`, `INCOME`)
 * and money out of a card are always To review ('spending'); a row is Not expenses ('not_expense') exactly when
 * `kindFor` names a card payment or a transfer (never an e-Transfer; loan payments stay To review).
 * Randomizing signs, amounts, sides, categories and descriptions built from payment/issuer/bill words (in any
 * case and order) explores combinations a fixed table would miss.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { kindFor, bucketFor, looksLikeCardPayment, CARD_PAYMENT_PFC } = require('./plaidClassification');

const WORDS = ['payment', 'PAYMENT', 'Paiement', 'pmt', 'credit card', 'Bill', 'visa', 'MASTERCARD', 'mc', 'amex',
  'thank', 'you', 'cibc', 'hydro', 'reversal', 'refund', '-', '/', 'from:', 'cash', 'payments', 'transfer', 'INTERAC e-Transfer®'];
const arbText = fc.option(fc.array(fc.constantFrom(...WORDS), { maxLength: 6 }).map(words => words.join(' ')), { nil: null });
const arbPfc = fc.option(fc.constantFrom(CARD_PAYMENT_PFC, 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'GENERAL_MERCHANDISE_OTHER', 'LOAN_PAYMENTS_CAR_PAYMENT'), { nil: null });
const arbAmount = fc.integer({ min: -1_000_000, max: 1_000_000 }).filter(cents => cents !== 0).map(cents => cents / 100);
const arbTxn = fc.record({ amount: arbAmount, isCard: fc.boolean(), name: arbText, merchantName: arbText, pfcDetailed: arbPfc });
const arbPrimary = fc.option(fc.constantFrom('TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'LOAN_PAYMENTS', 'BANK_FEES', 'FOOD_AND_DRINK'), { nil: null });
const arbCategorised = fc.record({ amount: arbAmount, isCard: fc.boolean(), name: arbText, merchantName: arbText, pfcDetailed: arbPfc, pfcPrimary: arbPrimary });

describe('plaidClassification', () => {
  test('direction gates every result; off the card only the category decides; kindFor implies the hint', () => {
    fc.assert(
      fc.property(arbTxn, (txn) => {
        const kind = kindFor(txn);
        const looks = looksLikeCardPayment(txn);
        const rightDirection = txn.isCard ? txn.amount < 0 : txn.amount > 0;

        if (!rightDirection) {
          expect(kind).toBeNull();
          expect(looks).toBe(false);
        }
        if (!txn.isCard) {
          expect(kind).toBe(rightDirection && txn.pfcDetailed === CARD_PAYMENT_PFC ? 'card_payment' : null);
        }
        if (kind === 'card_payment') expect(looks).toBe(true);
      }),
      pbtOptions()
    );
  });

  test('deposits and card charges are always To review; Not expenses exactly for card payments and transfers', () => {
    fc.assert(
      fc.property(arbCategorised, (txn) => {
        const bucket = bucketFor(txn);
        const kind = kindFor(txn);
        const moneyIn = txn.amount < 0;
        const eTransfer = /e-?transfer/i.test([txn.name, txn.merchantName].filter(Boolean).join(' '));

        if (!txn.isCard && moneyIn) expect(bucket).toBe('spending');
        if (txn.isCard && !moneyIn) expect(bucket).toBe('spending');
        expect(bucket).toBe(['card_payment', 'transfer'].includes(kind) ? 'not_expense' : 'spending');
        if (kind === 'transfer' || kind === 'loan_payment') expect(txn.isCard).toBe(false);
        if (kind === 'transfer') expect(eTransfer).toBe(false);
        if (!txn.isCard && !moneyIn && txn.pfcPrimary === 'TRANSFER_OUT' && !eTransfer) expect(bucket).toBe('not_expense');
        if (txn.pfcPrimary === 'LOAN_PAYMENTS' && txn.pfcDetailed !== CARD_PAYMENT_PFC && !txn.isCard) expect(bucket).toBe('spending');
      }),
      pbtOptions()
    );
  });
});
