const { kindFor, looksLikeCardPayment, CARD_PAYMENT_PFC } = require('./plaidClassification');

const card = (amount, name, extra = {}) => ({ amount, isCard: true, name, merchantName: null, pfcDetailed: null, ...extra });
const funding = (amount, name, extra = {}) => ({ amount, isCard: false, name, merchantName: null, pfcDetailed: null, ...extra });

describe('plaidClassification', () => {
  describe('card payments seen in production (no category: rows staged before it was stored)', () => {
    test.each([
      ['WS VISA credit', card(-3471.31, 'Credit Card Payment - From: Cash'), 'card_payment', true],
      ['CIBC MC credit', card(-4104.59, 'PAYMENT THANK YOU/PAIEMEN T MERCI'), 'card_payment', true],
      // Chequing text alone never makes a card payment; it only hints
      ['WS chequing debit, generic text', funding(3471.31, 'Credit Card Payment'), null, true],
      ['WS chequing debit to CIBC', funding(4104.59, 'CIBC MASTERCARD - Bill payment', { merchantName: 'CIBC' }), null, true]
    ])('%s', (_label, txn, kind, looks) => {
      expect(kindFor(txn)).toBe(kind);
      expect(looksLikeCardPayment(txn)).toBe(looks);
    });
  });

  test.each([
    ['a bill payment to a utility', funding(120.5, 'HYDRO ONE - Bill payment')],
    ['a phone bill payment', funding(80, 'ROGERS - Bill payment')],
    ['a purchase', funding(12, 'COFFEE SHOP')],
    ['a deposit mentioning a card payment', funding(-50, 'Credit Card Payment')]
  ])('%s is not a card payment', (_label, txn) => {
    expect(kindFor(txn)).toBeNull();
    expect(looksLikeCardPayment(txn)).toBe(false);
  });

  test.each([
    ['a payment reversal (debit on the card)', card(500, 'PAYMENT REVERSAL')],
    ['a returned payment', card(500, 'RETURNED PAYMENT')],
    ['a refund', card(-25, 'AMAZON.CA REFUND')],
    ['"payments" inside another word', card(-25, 'PAYMENTSENSE')]
  ])('%s on a card is not a card payment', (_label, txn) => {
    expect(kindFor(txn)).toBeNull();
    expect(looksLikeCardPayment(txn)).toBe(false);
  });

  test("Plaid's category decides on either side, whatever the text", () => {
    const pfc = { pfcDetailed: CARD_PAYMENT_PFC };
    expect(kindFor(card(-100, 'ONLINE TRANSFER', pfc))).toBe('card_payment');
    expect(kindFor(funding(100, 'ONLINE TRANSFER', pfc))).toBe('card_payment');
  });

  test("Plaid's category never overrides the direction of the money", () => {
    const pfc = { pfcDetailed: CARD_PAYMENT_PFC };
    expect(kindFor(card(100, 'PAYMENT', pfc))).toBeNull();
    expect(kindFor(funding(-100, 'PAYMENT', pfc))).toBeNull();
  });

  test('the merchant name counts as description too', () => {
    expect(kindFor(card(-60, 'ONLINE', { merchantName: 'Payment - Thank You' }))).toBe('card_payment');
    expect(looksLikeCardPayment(funding(60, 'ONLINE', { merchantName: 'Visa payment' }))).toBe(true);
  });

  test('a missing description is not a card payment', () => {
    expect(kindFor(card(-60, null))).toBeNull();
    expect(looksLikeCardPayment(funding(60, null))).toBe(false);
  });
});
