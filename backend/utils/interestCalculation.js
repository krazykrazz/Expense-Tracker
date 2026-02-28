/**
 * Calculate monthly interest on a balance.
 * @param {number} balance - Current balance (must be >= 0)
 * @param {number} annualRate - Annual interest rate as percentage (e.g., 5.25 for 5.25%)
 * @returns {number} Monthly interest amount (rounded to 2 decimal places)
 */
function calculateMonthlyInterest(balance, annualRate) {
  if (!balance || balance <= 0 || !annualRate || annualRate <= 0) {
    return 0;
  }
  return Math.round(balance * (annualRate / 100) / 12 * 100) / 100;
}

module.exports = { calculateMonthlyInterest };
