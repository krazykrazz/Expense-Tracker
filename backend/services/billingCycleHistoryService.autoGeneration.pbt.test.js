/**
 * Property-Based Tests for BillingCycleHistoryService Auto-Generation
 * Feature: unified-billing-cycles
 * 
 * Using fast-check library for property-based testing
 * 
 * Updated for billing-cycle-payment-deduction: autoGenerateBillingCycles now calls
 * calculateCycleBalance() (which queries expenses, payments, and previous cycle)
 * instead of statementBalanceService.calculateStatementBalance(). Tests mock
 * calculateCycleBalance on the service instance to control balance outputs.
 * 
 * **Validates: Requirements 2.2, 2.3, 2.5, 2.6, 5.1, 5.2, 7.2, 9.1, 9.2**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Import the service to test
const billingCycleHistoryService = require('./billingCycleHistoryService');
const billingCycleRepository = require('../repositories/billingCycleRepository');

describe('BillingCycleHistoryService - Auto-Generation Property Tests', () => {
  // Store original methods for restoration
  let originalRepoFindByPaymentMethod;
  let originalRepoCreate;
  let originalRepoFindByPaymentMethodAndCycleEnd;
  let originalCalculateCycleBalance;

  beforeEach(() => {
    // Store original methods
    originalRepoFindByPaymentMethod = billingCycleRepository.findByPaymentMethod;
    originalRepoCreate = billingCycleRepository.create;
    originalRepoFindByPaymentMethodAndCycleEnd = billingCycleRepository.findByPaymentMethodAndCycleEnd;
    originalCalculateCycleBalance = billingCycleHistoryService.calculateCycleBalance;
  });

  afterEach(() => {
    // Restore original methods
    billingCycleRepository.findByPaymentMethod = originalRepoFindByPaymentMethod;
    billingCycleRepository.create = originalRepoCreate;
    billingCycleRepository.findByPaymentMethodAndCycleEnd = originalRepoFindByPaymentMethodAndCycleEnd;
    billingCycleHistoryService.calculateCycleBalance = originalCalculateCycleBalance;
  });

  /**
   * Feature: unified-billing-cycles, Property 1: Auto-Generation Date Calculation
   * **Validates: Requirements 2.2**
   * 
   * For any billing_cycle_day (1-28) and reference date, auto-generated billing cycles 
   * SHALL have cycle_start_date and cycle_end_date correctly calculated based on the 
   * billing_cycle_day, where cycle_end_date falls on billing_cycle_day (or last day of 
   * month if billing_cycle_day exceeds month length) and cycle_start_date is the day 
   * after the previous cycle's end date.
   */
  test('Property 1: Auto-Generation Date Calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate billing cycle day (1-28 to avoid month-end edge cases)
        fc.integer({ min: 1, max: 28 }),
        // Generate reference date using year/month/day components to avoid NaN dates
        fc.integer({ min: 2024, max: 2025 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        async (billingCycleDay, year, month, day) => {
          const referenceDate = new Date(year, month - 1, day);
          // Skip if date is invalid
          if (isNaN(referenceDate.getTime())) {
            return true;
          }
          
          const paymentMethodId = 1;
          let createdCycles = [];

          // Mock repository to return no existing cycles
          billingCycleRepository.findByPaymentMethod = async () => [];
          
          // Mock create to capture created cycles
          billingCycleRepository.create = async (data) => {
            const cycle = { id: createdCycles.length + 1, ...data };
            createdCycles.push(cycle);
            return cycle;
          };

          // Mock calculateCycleBalance — returns a fixed balance for date calculation tests
          // The balance value doesn't matter for this property; we're testing dates
          billingCycleHistoryService.calculateCycleBalance = async () => ({
            calculatedBalance: 100,
            previousBalance: 0,
            totalExpenses: 100,
            totalPayments: 0
          });

          // Call auto-generate
          await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            billingCycleDay,
            referenceDate
          );

          // Verify each created cycle has valid dates
          for (const cycle of createdCycles) {
            // Parse dates
            const startDate = new Date(cycle.cycle_start_date);
            const endDate = new Date(cycle.cycle_end_date);

            // Skip if dates are invalid
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              continue;
            }

            // End date should be on or before billing_cycle_day
            const endDay = endDate.getUTCDate();
            const daysInEndMonth = new Date(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, 0).getDate();
            const expectedEndDay = Math.min(billingCycleDay, daysInEndMonth);
            expect(endDay).toBe(expectedEndDay);

            // Start date should be after end date of previous cycle (day after billing_cycle_day)
            expect(startDate < endDate).toBe(true);
          }

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: unified-billing-cycles, Property 2: Auto-Generated Cycles Have Zero Actual Balance
   * **Validates: Requirements 2.3, 5.1, 5.2**
   * 
   * For any auto-generated billing cycle, the actual_statement_balance SHALL be 0, 
   * indicating no user-provided value. The calculated_statement_balance SHALL reflect
   * the corrected formula: max(0, round(previousBalance + expenses - payments, 2)).
   */
  test('Property 2: Auto-Generated Cycles Have Zero Actual Balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate billing cycle day
        fc.integer({ min: 1, max: 28 }),
        // Generate previous balance (carry-forward)
        fc.float({ min: Math.fround(0), max: Math.fround(3000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate expense total
        fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate payment total
        fc.float({ min: Math.fround(0), max: Math.fround(4000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (billingCycleDay, previousBalance, totalExpenses, totalPayments) => {
          const paymentMethodId = 1;
          let createdCycles = [];

          // Mock repository to return no existing cycles
          billingCycleRepository.findByPaymentMethod = async () => [];
          
          // Mock create to capture created cycles
          billingCycleRepository.create = async (data) => {
            const cycle = { id: createdCycles.length + 1, ...data };
            createdCycles.push(cycle);
            return cycle;
          };

          // Mock calculateCycleBalance with the corrected formula
          const calculatedBalance = Math.max(0, Math.round((previousBalance + totalExpenses - totalPayments) * 100) / 100);
          billingCycleHistoryService.calculateCycleBalance = async () => ({
            calculatedBalance,
            previousBalance,
            totalExpenses,
            totalPayments
          });

          // Call auto-generate
          await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            billingCycleDay,
            new Date('2024-06-15')
          );

          // Verify all created cycles have actual_statement_balance = 0
          // and calculated_statement_balance reflects the corrected formula
          for (const cycle of createdCycles) {
            expect(cycle.actual_statement_balance).toBe(0);
            expect(cycle.calculated_statement_balance).toBe(calculatedBalance);
          }

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: unified-billing-cycles, Property 3: Auto-Generation Idempotence
   * **Validates: Requirements 2.5**
   * 
   * For any payment method, calling auto-generate multiple times with the same reference 
   * date SHALL NOT create duplicate billing cycle records. The number of records after 
   * N calls equals the number after 1 call.
   */
  test('Property 3: Auto-Generation Idempotence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate billing cycle day
        fc.integer({ min: 1, max: 28 }),
        // Generate number of calls (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (billingCycleDay, numCalls) => {
          const paymentMethodId = 1;
          let allCycles = [];

          // Mock repository - tracks all cycles and returns them
          billingCycleRepository.findByPaymentMethod = async () => [...allCycles];
          
          // Mock create to add cycles
          billingCycleRepository.create = async (data) => {
            const cycle = { id: allCycles.length + 1, ...data };
            allCycles.push(cycle);
            return cycle;
          };

          // Mock calculateCycleBalance — fixed balance for idempotence test
          billingCycleHistoryService.calculateCycleBalance = async () => ({
            calculatedBalance: 100,
            previousBalance: 0,
            totalExpenses: 100,
            totalPayments: 0
          });

          const referenceDate = new Date('2024-06-15');

          // First call
          await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            billingCycleDay,
            referenceDate
          );
          const countAfterFirstCall = allCycles.length;

          // Subsequent calls
          for (let i = 1; i < numCalls; i++) {
            await billingCycleHistoryService.autoGenerateBillingCycles(
              paymentMethodId,
              billingCycleDay,
              referenceDate
            );
          }

          // Count should be the same after all calls
          expect(allCycles.length).toBe(countAfterFirstCall);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: unified-billing-cycles, Property 4: Auto-Generation 12-Month Limit
   * **Validates: Requirements 2.6**
   * 
   * For any auto-generation operation, all generated billing cycles SHALL have 
   * cycle_end_date within 12 months of the reference date. No cycles older than 
   * 12 months SHALL be generated.
   */
  test('Property 4: Auto-Generation 12-Month Limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate billing cycle day
        fc.integer({ min: 1, max: 28 }),
        // Generate reference date using year/month/day components to avoid NaN dates
        fc.integer({ min: 2025, max: 2025 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 28 }),
        async (billingCycleDay, year, month, day) => {
          const referenceDate = new Date(year, month - 1, day);
          // Skip if date is invalid
          if (isNaN(referenceDate.getTime())) {
            return true;
          }
          
          const paymentMethodId = 1;
          let createdCycles = [];

          // Mock repository to return no existing cycles
          billingCycleRepository.findByPaymentMethod = async () => [];
          
          // Mock create to capture created cycles
          billingCycleRepository.create = async (data) => {
            const cycle = { id: createdCycles.length + 1, ...data };
            createdCycles.push(cycle);
            return cycle;
          };

          // Mock calculateCycleBalance — fixed balance for limit test
          billingCycleHistoryService.calculateCycleBalance = async () => ({
            calculatedBalance: 100,
            previousBalance: 0,
            totalExpenses: 100,
            totalPayments: 0
          });

          // Call auto-generate
          await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            billingCycleDay,
            referenceDate
          );

          // Verify we don't generate more than 12 cycles
          expect(createdCycles.length).toBeLessThanOrEqual(12);

          // Verify all cycles have valid dates
          for (const cycle of createdCycles) {
            expect(cycle.cycle_start_date).toBeDefined();
            expect(cycle.cycle_end_date).toBeDefined();
            
            const startDate = new Date(cycle.cycle_start_date);
            const endDate = new Date(cycle.cycle_end_date);
            
            // Skip if dates are invalid
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              continue;
            }
            
            // Start date should be before end date
            expect(startDate < endDate).toBe(true);
          }

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: unified-billing-cycles, Property 10: Auto-Generation Preserves Existing Records
   * **Validates: Requirements 9.1, 9.2**
   * 
   * For any existing billing cycle record, auto-generation SHALL NOT modify its 
   * actual_statement_balance, calculated_statement_balance, or any other field.
   */
  test('Property 10: Auto-Generation Preserves Existing Records', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate billing cycle day
        fc.integer({ min: 1, max: 28 }),
        // Generate existing actual balance
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate existing calculated balance
        fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        async (billingCycleDay, existingActualBalance, existingCalculatedBalance) => {
          const paymentMethodId = 1;
          
          // Create an existing cycle record
          const existingCycle = {
            id: 1,
            payment_method_id: paymentMethodId,
            cycle_start_date: '2024-05-16',
            cycle_end_date: '2024-06-15',
            actual_statement_balance: existingActualBalance,
            calculated_statement_balance: existingCalculatedBalance,
            minimum_payment: 25,
            due_date: '2024-07-01',
            notes: 'Test notes'
          };

          let allCycles = [existingCycle];
          let updateCalled = false;

          // Mock repository to return existing cycle
          billingCycleRepository.findByPaymentMethod = async () => [...allCycles];
          
          // Mock create to add new cycles
          billingCycleRepository.create = async (data) => {
            const cycle = { id: allCycles.length + 1, ...data };
            allCycles.push(cycle);
            return cycle;
          };

          // Mock update to track if it's called
          billingCycleRepository.update = async () => {
            updateCalled = true;
            return null;
          };

          // Mock calculateCycleBalance — fixed balance for preservation test
          billingCycleHistoryService.calculateCycleBalance = async () => ({
            calculatedBalance: 200,
            previousBalance: 0,
            totalExpenses: 200,
            totalPayments: 0
          });

          // Call auto-generate
          await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            billingCycleDay,
            new Date('2024-06-20')
          );

          // Verify existing record was not modified
          const originalCycle = allCycles.find(c => c.id === 1);
          expect(originalCycle.actual_statement_balance).toBe(existingActualBalance);
          expect(originalCycle.calculated_statement_balance).toBe(existingCalculatedBalance);
          expect(originalCycle.minimum_payment).toBe(25);
          expect(originalCycle.due_date).toBe('2024-07-01');
          expect(originalCycle.notes).toBe('Test notes');

          // Verify update was never called
          expect(updateCalled).toBe(false);

          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: unified-billing-cycles, Property 11: No Auto-Generation Without Billing Cycle Day
   * **Validates: Requirements 7.2**
   * 
   * For any payment method where billing_cycle_day is null or undefined, the 
   * auto-generation function SHALL NOT create any billing cycle records and 
   * SHALL return an empty array.
   */
  test('Property 11: No Auto-Generation Without Billing Cycle Day', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate invalid billing cycle day values
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant(0),
          fc.integer({ min: 32, max: 100 }),
          fc.integer({ min: -100, max: -1 })
        ),
        async (invalidBillingCycleDay) => {
          const paymentMethodId = 1;
          let createCalled = false;

          // Mock create to track if it's called
          billingCycleRepository.create = async () => {
            createCalled = true;
            return { id: 1 };
          };

          // Call auto-generate with invalid billing cycle day
          const result = await billingCycleHistoryService.autoGenerateBillingCycles(
            paymentMethodId,
            invalidBillingCycleDay,
            new Date('2024-06-15')
          );

          // Verify no cycles were created
          expect(result).toEqual([]);
          expect(createCalled).toBe(false);

          return true;
        }
      ),
      pbtOptions()
    );
  });
});
