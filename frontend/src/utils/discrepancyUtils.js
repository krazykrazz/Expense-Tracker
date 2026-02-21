/**
 * Calculate discrepancy between actual and calculated statement balances.
 * Mirrors backend BillingCycleHistoryService.calculateDiscrepancy exactly.
 *
 * @param {number} actualBalance
 * @param {number} calculatedBalance
 * @returns {{ amount: number, type: 'higher'|'lower'|'match', description: string }}
 */
export function calculateDiscrepancy(actualBalance, calculatedBalance) {
  const amount = actualBalance - calculatedBalance;
  const roundedAmount = Math.round(amount * 100) / 100;

  let type, description;

  if (roundedAmount > 0) {
    type = 'higher';
    description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} higher than tracked (potential untracked expenses)`;
  } else if (roundedAmount < 0) {
    type = 'lower';
    description = `Actual balance is $${Math.abs(roundedAmount).toFixed(2)} lower than tracked (potential untracked returns/credits)`;
  } else {
    type = 'match';
    description = 'Tracking is accurate';
  }

  return { amount: roundedAmount, type, description };
}
