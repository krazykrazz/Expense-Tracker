const { kindFor, bucketFor, looksLikeCardPayment, CARD_PAYMENT_PFC } = require('./plaidClassification');

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

  describe('Inbox bucket (spec 3.1)', () => {
    const pfc = (pfcPrimary, pfcDetailed = null) => ({ pfcPrimary, pfcDetailed });
    test.each([
      ['transfer out of chequing', funding(300, 'To savings', pfc('TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER')), 'transfer', 'not_expense'],
      ['loan payment out of chequing (stays to review: often a fixed expense)', funding(900, 'MORTGAGE', pfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_MORTGAGE_PAYMENT')), 'loan_payment', 'spending'],
      ['e-Transfer to a person (usually spending)', funding(12, 'Joliet Cutler - INTERAC e-Transfer®', pfc('TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER')), null, 'spending'],
      ['card payment out of chequing', funding(4104.59, 'CIBC MASTERCARD - Bill payment', pfc('LOAN_PAYMENTS', CARD_PAYMENT_PFC)), 'card_payment', 'not_expense'],
      ['card payment credit on the card', card(-3471.31, 'Credit Card Payment - From: Cash'), 'card_payment', 'not_expense'],
      ['insurer payout (TRANSFER_IN deposit)', funding(-105.3, 'DSF - Direct deposit', pfc('TRANSFER_IN', 'TRANSFER_IN_DEPOSIT')), null, 'spending'],
      ['salary', funding(-2000, 'PAYROLL', pfc('INCOME', 'INCOME_WAGES')), null, 'spending'],
      ['transfer in to chequing', funding(-300, 'From savings', pfc('TRANSFER_IN', 'TRANSFER_IN_ACCOUNT_TRANSFER')), null, 'spending'],
      ['refund on the card', card(-25, 'AMAZON.CA REFUND', pfc('GENERAL_MERCHANDISE')), null, 'spending'],
      ['transfer category on a card credit', card(-25, 'E-TRANSFER', pfc('TRANSFER_IN')), null, 'spending'],
      ['transfer category on a card charge', card(25, 'E-TRANSFER', pfc('TRANSFER_OUT')), null, 'spending'],
      ['bank fee', funding(4, 'MONTHLY FEE', pfc('BANK_FEES', 'BANK_FEES_OTHER_BANK_FEES')), null, 'spending'],
      ['interest charged', card(12, 'INTEREST', pfc('BANK_FEES', 'BANK_FEES_INTEREST_CHARGE')), null, 'spending'],
      ['a purchase', funding(12, 'COFFEE SHOP', pfc('FOOD_AND_DRINK')), null, 'spending'],
      ['no category (staged before it was stored)', funding(300, 'To savings'), null, 'spending']
    ])('%s', (_label, txn, kind, bucket) => {
      expect(kindFor(txn)).toBe(kind);
      expect(bucketFor(txn)).toBe(bucket);
    });
  });
});
