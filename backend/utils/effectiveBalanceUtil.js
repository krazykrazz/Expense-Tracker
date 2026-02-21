/**
 * Shared utility for determining which balance to use for a billing cycle.
 * Extracted from BillingCycleHistoryService.calculateEffectiveBalance to
 * provide a single source of truth across all services.
 *
 * @param {Object|null|undefined} cycle - Billing cycle record
 * @returns {{ effectiveBalance: number, balanceType: 'actual'|'calculated' }}
 */
function calculateEffectiveBalance(cycle) {
  if (!cycle) {
    return { effectiveBalance: 0, balanceType: 'calculated' };
  }

  const calculatedBalance = cycle.calculated_statement_balance || 0;

  // Use is_user_entered flag to determine if actual balance should be used
  // is_user_entered = 1 means user explicitly entered/updated this cycle
  // is_user_entered = 0 (or null/undefined) means auto-generated
  const isUserEntered = cycle.is_user_entered === 1;

  if (isUserEntered) {
    return {
      effectiveBalance: cycle.actual_statement_balance,
      balanceType: 'actual'
    };
  }

  // For non-user-entered cycles, also check if actual_statement_balance differs from 0
  // This handles legacy data before is_user_entered was added
  if (cycle.actual_statement_balance !== null && 
      cycle.actual_statement_balance !== undefined &&
      cycle.actual_statement_balance !== 0) {
    return {
      effectiveBalance: cycle.actual_statement_balance,
      balanceType: 'actual'
    };
  }

  return {
    effectiveBalance: calculatedBalance,
    balanceType: 'calculated'
  };
}

module.exports = { calculateEffectiveBalance };
