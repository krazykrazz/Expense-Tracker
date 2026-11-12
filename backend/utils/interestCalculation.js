/**
 * Convert a quoted annual rate to the effective rate per payment period.
 *
 * Canadian fixed-rate mortgages are quoted with semi-annual compounding (Interest Act),
 * so the periodic rate is (1 + r/2)^(2/n) - 1. Variable-rate mortgages and other loans
 * use the nominal rate r/n.
 * @param {number} annualRate - Annual interest rate as percentage (e.g., 5.25 for 5.25%)
 * @param {number} [periodsPerYear=12] - Payment periods per year (12, 26, ...)
 * @param {string} [rateType] - 'fixed' applies semi-annual compounding; anything else is nominal
 * @returns {number} Periodic rate as a decimal (0 when the rate is missing or not positive)
 */
function periodicRate(annualRate, periodsPerYear = 12, rateType = null) {
  if (!annualRate || annualRate <= 0 || !periodsPerYear) {
    return 0;
  }
  const r = annualRate / 100;
  if (rateType === 'fixed') {
    return Math.pow(1 + r / 2, 2 / periodsPerYear) - 1;
  }
  return r / periodsPerYear;
}

/**
 * Calculate monthly interest on a balance.
 * @param {number} balance - Current balance (must be >= 0)
 * @param {number} annualRate - Annual interest rate as percentage (e.g., 5.25 for 5.25%)
 * @param {string} [rateType] - Mortgage rate type; 'fixed' uses semi-annual compounding
 * @returns {number} Monthly interest amount (rounded to 2 decimal places)
 */
function calculateMonthlyInterest(balance, annualRate, rateType = null) {
  if (!balance || balance <= 0 || !annualRate || annualRate <= 0) {
    return 0;
  }
  return Math.round(balance * periodicRate(annualRate, 12, rateType) * 100) / 100;
}

module.exports = { calculateMonthlyInterest, periodicRate };
