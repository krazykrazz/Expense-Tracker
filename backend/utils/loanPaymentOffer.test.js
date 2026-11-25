const { pickExistingPayment, LOAN_PAYMENT_WINDOW_DAYS } = require('./loanPaymentOffer');

describe('pickExistingPayment', () => {
  const payment = (id, payment_date, amount = 1500) => ({ id, payment_date, amount });
  const txn = { date: '2026-10-03', amount: 1500 };

  test('only a payment within the window can be the bank payment', () => {
    expect(LOAN_PAYMENT_WINDOW_DAYS).toBe(5);
    expect(pickExistingPayment([payment(1, '2026-09-28')], txn).id).toBe(1);
    expect(pickExistingPayment([payment(1, '2026-10-08')], txn).id).toBe(1);
    expect(pickExistingPayment([payment(1, '2026-09-27'), payment(2, '2026-10-09')], txn)).toBeNull();
    expect(pickExistingPayment([], txn)).toBeNull();
  });

  test('an exact amount wins over a closer date, then the closest date, then the newest', () => {
    expect(pickExistingPayment([payment(1, '2026-10-03', 1499.99), payment(2, '2026-10-07', 1500)], txn).id).toBe(2);
    expect(pickExistingPayment([payment(1, '2026-10-01'), payment(2, '2026-10-02')], txn).id).toBe(2);
    expect(pickExistingPayment([payment(1, '2026-10-02'), payment(2, '2026-10-04')], txn).id).toBe(2);
  });

  test('a debit is compared by its size, whichever sign the bank gives it', () => {
    expect(pickExistingPayment([payment(1, '2026-10-03', 1500)], { date: '2026-10-03', amount: -1500 }).id).toBe(1);
  });
});
