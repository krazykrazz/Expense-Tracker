jest.mock('./activityLogService');

const creditCardPaymentService = require('./creditCardPaymentService');

const valid = { payment_method_id: 4, amount: 100.5, payment_date: '2026-10-30', notes: 'Bank: Credit Card Payment' };

describe('creditCardPaymentService.validatePayment', () => {
  test('accepts a normal payment, with or without notes', () => {
    expect(creditCardPaymentService.validatePayment(valid)).toEqual({ isValid: true, errors: [] });
    expect(creditCardPaymentService.validatePayment({ ...valid, notes: undefined }).isValid).toBe(true);
    expect(creditCardPaymentService.validatePayment({ ...valid, notes: null }).isValid).toBe(true);
  });

  test.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative', -5],
    ['a numeric string', '100']
  ])('rejects an amount that is %s', (_label, amount) => {
    expect(creditCardPaymentService.validatePayment({ ...valid, amount })).toEqual({
      isValid: false,
      errors: ['Payment amount must be greater than zero']
    });
  });

  test.each([
    ['a number', 12],
    ['an object', { text: 'x' }],
    ['an array', ['x']]
  ])('rejects notes that are %s instead of throwing later', (_label, notes) => {
    expect(creditCardPaymentService.validatePayment({ ...valid, notes })).toEqual({ isValid: false, errors: ['Notes must be text'] });
  });

  test('rejects notes over 500 characters', () => {
    expect(creditCardPaymentService.validatePayment({ ...valid, notes: 'x'.repeat(501) }).errors).toEqual(['Notes must not exceed 500 characters']);
    expect(creditCardPaymentService.validatePayment({ ...valid, notes: 'x'.repeat(500) }).isValid).toBe(true);
  });
});
