const mortgageService = require('./mortgageService');

describe('mortgageService.getRemainingAmortizationMonths', () => {
  const asOf = new Date(2026, 10, 12); // 2026-11-12 local

  it('treats amortization_period as years and counts down from the start month', () => {
    // 25 years = 300 months; Jan 2024 -> Nov 2026 is 34 months elapsed
    expect(mortgageService.getRemainingAmortizationMonths(
      { amortization_period: 25, start_date: '2024-01-01' }, asOf
    )).toBe(266);
  });

  it('returns the full period for a mortgage starting this month or in the future', () => {
    expect(mortgageService.getRemainingAmortizationMonths({ amortization_period: 25, start_date: '2026-11-01' }, asOf)).toBe(300);
    expect(mortgageService.getRemainingAmortizationMonths({ amortization_period: 25, start_date: '2027-03-01' }, asOf)).toBe(300);
    expect(mortgageService.getRemainingAmortizationMonths({ amortization_period: 25 }, asOf)).toBe(300);
  });

  it('never drops below 1 month once the period has elapsed', () => {
    expect(mortgageService.getRemainingAmortizationMonths({ amortization_period: 1, start_date: '2020-01-01' }, asOf)).toBe(1);
  });

  it('returns null without an amortization period', () => {
    expect(mortgageService.getRemainingAmortizationMonths({ amortization_period: null, start_date: '2024-01-01' }, asOf)).toBeNull();
    expect(mortgageService.getRemainingAmortizationMonths(null, asOf)).toBeNull();
  });
});

describe('mortgageService.calculatePaymentAmount', () => {
  it('uses the fixed-rate periodic rate and remaining months', () => {
    const r = Math.pow(1.025, 1 / 6) - 1;
    const factor = Math.pow(1 + r, 300);
    const expected = 300000 * r * factor / (factor - 1);
    expect(mortgageService.calculatePaymentAmount({
      balance: 300000, rate: 5, remainingMonths: 300, paymentFrequency: 'monthly', rateType: 'fixed'
    })).toBeCloseTo(expected, 6);
  });

  it('makes accelerated bi-weekly half of the monthly payment', () => {
    const params = { balance: 300000, rate: 5, amortizationYears: 25, rateType: 'fixed' };
    const monthly = mortgageService.calculatePaymentAmount({ ...params, paymentFrequency: 'monthly' });
    expect(mortgageService.calculatePaymentAmount({ ...params, paymentFrequency: 'accelerated_bi-weekly' }))
      .toBeCloseTo(monthly / 2, 8);
  });
});

describe('mortgageService.getNextPaymentDate', () => {
  it.each([
    ['later this month', new Date(2026, 10, 12), 20, new Date(2026, 10, 20)],
    ['today', new Date(2026, 10, 12), 12, new Date(2026, 10, 12)],
    ['next month when already past', new Date(2026, 10, 12), 5, new Date(2026, 11, 5)],
    ['clamped to month length', new Date(2027, 1, 10), 31, new Date(2027, 1, 28)]
  ])('returns %s', (_label, asOf, dueDay, expected) => {
    expect(mortgageService.getNextPaymentDate(dueDay, asOf)).toEqual(expected);
  });
});
