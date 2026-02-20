/**
 * Property-Based Tests for Reminder Service - Record Classification
 * 
 * Consolidated from:
 * - reminderService.isUserEntered.pbt.test.js
 * 
 * Tests the is_user_entered flag logic for determining which billing cycle
 * records are authoritative for alert suppression.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  *
 * @invariant Record Classification: For any billing cycle record, the is_user_entered flag correctly distinguishes between manually entered and auto-generated records; this classification determines which records are authoritative for alert suppression. Randomization covers diverse flag combinations and record sources.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Mock dependencies before requiring the service
jest.mock('../repositories/reminderRepository');
jest.mock('./statementBalanceService');
jest.mock('../repositories/billingCycleRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanPaymentRepository');
jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');

const reminderRepository = require('../repositories/reminderRepository');
const statementBalanceService = require('./statementBalanceService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const timeBoundaryService = require('./timeBoundaryService');
const reminderService = require('./reminderService');

// Get the real calculatePreviousCycleDates (not affected by mock)
const realStatementBalanceService = jest.requireActual('./statementBalanceService');
const calculatePreviousCycleDates = (billingCycleDay, referenceDate) =>
  realStatementBalanceService.calculatePreviousCycleDates(billingCycleDay, referenceDate);

// Arbitrary: billing cycle day (1-28 to avoid month-end edge cases)
const billingCycleDayArb = fc.integer({ min: 1, max: 28 });

// Arbitrary: payment due day (1-28)
const paymentDueDayArb = fc.integer({ min: 1, max: 28 });

// Arbitrary: non-negative balance rounded to 2 decimals
const balanceArb = fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
  .map(n => Math.round(n * 100) / 100);

// Arbitrary: positive balance (> 0)
const positiveBalanceArb = fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true })
  .map(n => Math.round(n * 100) / 100);

// Arbitrary: is_user_entered flag (0 or 1)
const isUserEnteredArb = fc.constantFrom(0, 1);

/**
 * Helper to build a mock credit card object as returned by reminderRepository
 */
function buildMockCard(id, paymentDueDay, billingCycleDay, currentBalance) {
  return {
    id,
    display_name: `Card ${id}`,
    full_name: `Test Credit Card ${id}`,
    current_balance: currentBalance,
    credit_limit: 10000,
    payment_due_day: paymentDueDay,
    billing_cycle_day: billingCycleDay,
    is_active: 1
  };
}

/**
 * Helper to set up mocks for a single credit card scenario
 */
function setupMocks({ card, billingCycleRecord, calculatedStatementBalance, referenceDate }) {
  const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);

  reminderRepository.getCreditCardsWithDueDates.mockResolvedValue([card]);

  statementBalanceService.calculateStatementBalance.mockResolvedValue({
    statementBalance: calculatedStatementBalance,
    cycleStartDate: cycleDates.startDate,
    cycleEndDate: cycleDates.endDate,
    isPaid: calculatedStatementBalance === 0
  });

  billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(
    billingCycleRecord
  );
}

describe('Reminder Service - is_user_entered Alert Suppression Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
    timeBoundaryService.getBusinessDate.mockReturnValue('2025-01-20');
  });

  /**
   * Feature: credit-card-billing-fixes, Property 1: Auto-generated records are not authoritative for alert suppression
   *
   * When is_user_entered = 0, the record's actual_statement_balance must NOT
   * set has_actual_balance = true, regardless of the balance value.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  test('Property 1: Auto-generated records (is_user_entered=0) never set has_actual_balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentDueDayArb,
        billingCycleDayArb,
        balanceArb, // actual_statement_balance on the auto-generated record
        positiveBalanceArb, // calculated statement balance (fallback)
        positiveBalanceArb, // current_balance on the card
        async (paymentDueDay, billingCycleDay, actualBalance, calculatedBalance, currentBalance) => {
          const referenceDate = new Date('2025-01-20');
          const card = buildMockCard(1, paymentDueDay, billingCycleDay, currentBalance);
          const cycleDates = calculatePreviousCycleDates(billingCycleDay, referenceDate);

          // Auto-generated record: is_user_entered = 0
          const billingCycleRecord = {
            id: 100,
            payment_method_id: 1,
            cycle_start_date: cycleDates.startDate,
            cycle_end_date: cycleDates.endDate,
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 0
          };

          setupMocks({ card, billingCycleRecord, calculatedStatementBalance: calculatedBalance, referenceDate });

          const result = await reminderService.getCreditCardReminders(referenceDate);
          const cardResult = result.allCreditCards[0];

          // Property: auto-generated record must NOT be treated as authoritative
          expect(cardResult.has_actual_balance).toBe(false);

          // The balance used for alerts should be the calculated balance, not the record's actual balance
          expect(cardResult.required_payment).toBe(calculatedBalance);
          expect(cardResult.statement_balance).toBe(calculatedBalance);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-fixes, Property 1: Auto-generated records are not authoritative for alert suppression
   *
   * When is_user_entered = 1, the record's actual_statement_balance MUST
   * set has_actual_balance = true and be used for alert logic.
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  test('Property 1: User-entered records (is_user_entered=1) set has_actual_balance and use actual balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentDueDayArb,
        billingCycleDayArb,
        balanceArb, // actual_statement_balance on the user-entered record
        positiveBalanceArb, // calculated statement balance (should be ignored)
        positiveBalanceArb, // current_balance on the card
        async (paymentDueDay, billingCycleDay, actualBalance, calculatedBalance, currentBalance) => {
          const referenceDate = new Date('2025-01-20');
          const card = buildMockCard(1, paymentDueDay, billingCycleDay, currentBalance);
          const cycleDates = calculatePreviousCycleDates(billingCycleDay, referenceDate);

          // User-entered record: is_user_entered = 1
          const billingCycleRecord = {
            id: 100,
            payment_method_id: 1,
            cycle_start_date: cycleDates.startDate,
            cycle_end_date: cycleDates.endDate,
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: 1
          };

          setupMocks({ card, billingCycleRecord, calculatedStatementBalance: calculatedBalance, referenceDate });

          const result = await reminderService.getCreditCardReminders(referenceDate);
          const cardResult = result.allCreditCards[0];

          // Property: user-entered record MUST be treated as authoritative
          expect(cardResult.has_actual_balance).toBe(true);

          // The balance used for alerts should be the actual_statement_balance from the record
          expect(cardResult.required_payment).toBe(actualBalance);
          expect(cardResult.statement_balance).toBe(actualBalance);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-fixes, Property 1: Auto-generated records are not authoritative for alert suppression
   *
   * Edge case: is_user_entered = 1 with balance 0 SHOULD suppress alerts.
   * is_user_entered = 0 with balance 0 should NOT suppress alerts.
   *
   * **Validates: Requirements 1.2, 1.3**
   */
  test('Property 1: Zero balance suppression depends on is_user_entered flag', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentDueDayArb,
        billingCycleDayArb,
        isUserEnteredArb,
        positiveBalanceArb, // calculated balance (non-zero so we can see suppression effect)
        positiveBalanceArb, // current_balance
        async (paymentDueDay, billingCycleDay, isUserEntered, calculatedBalance, currentBalance) => {
          const referenceDate = new Date('2025-01-20');
          const card = buildMockCard(1, paymentDueDay, billingCycleDay, currentBalance);
          const cycleDates = calculatePreviousCycleDates(billingCycleDay, referenceDate);

          // Record with actual_statement_balance = 0
          const billingCycleRecord = {
            id: 100,
            payment_method_id: 1,
            cycle_start_date: cycleDates.startDate,
            cycle_end_date: cycleDates.endDate,
            actual_statement_balance: 0,
            calculated_statement_balance: calculatedBalance,
            is_user_entered: isUserEntered
          };

          setupMocks({ card, billingCycleRecord, calculatedStatementBalance: calculatedBalance, referenceDate });

          const result = await reminderService.getCreditCardReminders(referenceDate);
          const cardResult = result.allCreditCards[0];

          if (isUserEntered === 1) {
            // User-entered with balance 0: SHOULD suppress, is_statement_paid = true
            expect(cardResult.has_actual_balance).toBe(true);
            expect(cardResult.is_statement_paid).toBe(true);
            expect(cardResult.required_payment).toBe(0);
            // Should not appear in overdue or due soon lists
            expect(result.overdueCards).not.toContainEqual(expect.objectContaining({ id: 1 }));
            expect(result.dueSoonCards).not.toContainEqual(expect.objectContaining({ id: 1 }));
          } else {
            // Auto-generated with balance 0: should NOT suppress, falls back to calculated balance
            expect(cardResult.has_actual_balance).toBe(false);
            expect(cardResult.required_payment).toBe(calculatedBalance);
            // is_statement_paid depends on calculated balance, not the auto-generated record
            expect(cardResult.is_statement_paid).toBe(false); // calculatedBalance > 0
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-fixes, Property 1: Auto-generated records are not authoritative for alert suppression
   *
   * When no billing cycle record exists at all, the service falls back to
   * calculated statement balance and has_actual_balance = false.
   *
   * **Validates: Requirements 1.4**
   */
  test('Property 1: No billing cycle record falls back to calculated balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        paymentDueDayArb,
        billingCycleDayArb,
        positiveBalanceArb, // calculated statement balance
        positiveBalanceArb, // current_balance
        async (paymentDueDay, billingCycleDay, calculatedBalance, currentBalance) => {
          const referenceDate = new Date('2025-01-20');
          const card = buildMockCard(1, paymentDueDay, billingCycleDay, currentBalance);

          setupMocks({ card, billingCycleRecord: null, calculatedStatementBalance: calculatedBalance, referenceDate });

          const result = await reminderService.getCreditCardReminders(referenceDate);
          const cardResult = result.allCreditCards[0];

          // No record: has_actual_balance must be false
          expect(cardResult.has_actual_balance).toBe(false);

          // Falls back to calculated statement balance
          expect(cardResult.required_payment).toBe(calculatedBalance);
          expect(cardResult.statement_balance).toBe(calculatedBalance);
        }
      ),
      pbtOptions()
    );
  });
});
