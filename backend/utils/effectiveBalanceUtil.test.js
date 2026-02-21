/**
 * Unit Tests for Effective Balance Utility
 * Tests specific edge cases for calculateEffectiveBalance.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */

const { calculateEffectiveBalance } = require('./effectiveBalanceUtil');

describe('effectiveBalanceUtil - calculateEffectiveBalance', () => {
  // Requirement 1.5: null input
  test('null input returns effectiveBalance 0 with balanceType calculated', () => {
    const result = calculateEffectiveBalance(null);
    expect(result).toEqual({ effectiveBalance: 0, balanceType: 'calculated' });
  });

  // Requirement 1.5: undefined input
  test('undefined input returns effectiveBalance 0 with balanceType calculated', () => {
    const result = calculateEffectiveBalance(undefined);
    expect(result).toEqual({ effectiveBalance: 0, balanceType: 'calculated' });
  });

  // Requirement 1.2: is_user_entered=1 returns actual balance with type actual
  test('is_user_entered=1 returns actual_statement_balance with type actual', () => {
    const cycle = {
      actual_statement_balance: 150.75,
      calculated_statement_balance: 200.00,
      is_user_entered: 1
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 150.75, balanceType: 'actual' });
  });

  // Requirement 1.4: is_user_entered=0, actual_statement_balance=0 → calculated
  test('is_user_entered=0 with zero actual balance returns calculated balance', () => {
    const cycle = {
      actual_statement_balance: 0,
      calculated_statement_balance: 300.50,
      is_user_entered: 0
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 300.50, balanceType: 'calculated' });
  });

  // Requirement 1.4: is_user_entered=0, actual_statement_balance=null → calculated
  test('is_user_entered=0 with null actual balance returns calculated balance', () => {
    const cycle = {
      actual_statement_balance: null,
      calculated_statement_balance: 450.00,
      is_user_entered: 0
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 450.00, balanceType: 'calculated' });
  });

  // Requirement 1.3: is_user_entered=0, non-zero actual → actual (legacy support)
  test('is_user_entered=0 with non-zero actual balance returns actual balance (legacy)', () => {
    const cycle = {
      actual_statement_balance: 500.25,
      calculated_statement_balance: 600.00,
      is_user_entered: 0
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 500.25, balanceType: 'actual' });
  });

  // Requirement 1.4: is_user_entered=null, actual_statement_balance=0 → calculated
  test('is_user_entered=null with zero actual balance returns calculated balance', () => {
    const cycle = {
      actual_statement_balance: 0,
      calculated_statement_balance: 125.00,
      is_user_entered: null
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 125.00, balanceType: 'calculated' });
  });

  // Requirement 1.4: calculated_statement_balance=0 when falling through to calculated
  test('returns 0 when falling through to calculated and calculated_statement_balance is 0', () => {
    const cycle = {
      actual_statement_balance: 0,
      calculated_statement_balance: 0,
      is_user_entered: 0
    };
    const result = calculateEffectiveBalance(cycle);
    expect(result).toEqual({ effectiveBalance: 0, balanceType: 'calculated' });
  });
});
