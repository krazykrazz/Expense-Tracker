/**
 * @invariant Card payment classification follows the direction of the money and never lets text alone decide off
 * the card: (1) nothing moving the wrong way (a debit on a card, a credit on any other account) is ever a card
 * payment or looks like one, whatever its category or description; (2) away from the card, `kindFor` is
 * `card_payment` exactly when Plaid's detailed category says so; (3) `kindFor` implies `looksLikeCardPayment`.
 * Randomizing signs, amounts, sides, categories and descriptions built from payment/issuer/bill words (in any
 * case and order) explores combinations a fixed table would miss.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { kindFor, looksLikeCardPayment, CARD_PAYMENT_PFC } = require('./plaidClassification');

const WORDS = ['payment', 'PAYMENT', 'Paiement', 'pmt', 'credit card', 'Bill', 'visa', 'MASTERCARD', 'mc', 'amex',
  'thank', 'you', 'cibc', 'hydro', 'reversal', 'refund', '-', '/', 'from:', 'cash', 'payments', 'transfer'];
const arbText = fc.option(fc.array(fc.constantFrom(...WORDS), { maxLength: 6 }).map(words => words.join(' ')), { nil: null });
const arbPfc = fc.option(fc.constantFrom(CARD_PAYMENT_PFC, 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'GENERAL_MERCHANDISE_OTHER', 'LOAN_PAYMENTS_CAR_PAYMENT'), { nil: null });
const arbAmount = fc.integer({ min: -1_000_000, max: 1_000_000 }).filter(cents => cents !== 0).map(cents => cents / 100);
const arbTxn = fc.record({ amount: arbAmount, isCard: fc.boolean(), name: arbText, merchantName: arbText, pfcDetailed: arbPfc });

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
});
