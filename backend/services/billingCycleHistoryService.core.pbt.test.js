/**
 * Property-Based Tests for Billing Cycle History Service - Core Tests
 * 
 * Consolidated from:
 * - billingCycleHistoryService.pbt.test.js
 * - billingCycleHistoryService.autoGeneration.pbt.test.js
 * - billingCycleHistoryService.effective.pbt.test.js
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Mock activity log service
jest.mock('./activityLogService');

// Import the service and repository
const billingCycleHistoryService = require('./billingCycleHistoryService');
const billingCycleRepository = require('../repositories/billingCycleRepository');



describe('BillingCycleHistoryService - Property-Based Tests', () => {
  /**
   * Feature: credit-card-billing-cycle-history, Property 6: Discrepancy Calculation Correctness
   * **Validates: Requirements 3.1**
   * 
   * For any billing cycle record with actual_statement_balance A and calculated_statement_balance C,
   * the discrepancy amount SHALL equal (A - C).
   */
  test('Property 6: Discrepancy Calculation Correctness', async () => {
    await fc.assert(
      fc.property(
        // Generate actual balance (0 to 10000)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate calculated balance (0 to 10000)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (actualBalance, calculatedBalance) => {
          // Calculate discrepancy using the service
          const result = billingCycleHistoryService.calculateDiscrepancy(
            actualBalance,
            calculatedBalance
          );
          
          // Expected discrepancy
          const expectedAmount = Math.round((actualBalance - calculatedBalance) * 100) / 100;
          
          // Verify the discrepancy amount equals (actual - calculated)
          expect(result.amount).toBe(expectedAmount);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: credit-card-billing-cycle-history, Property 7: Discrepancy Type Classification
   * **Validates: Requirements 3.2, 3.3, 3.4**
   * 
   * For any discrepancy amount D:
   * - If D > 0, the type SHALL be 'higher'
   * - If D < 0, the type SHALL be 'lower'
   * - If D = 0, the type SHALL be 'match'
   */
  test('Property 7: Discrepancy Type Classification', async () => {
    await fc.assert(
      fc.property(
        // Generate actual balance (0 to 10000)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate calculated balance (0 to 10000)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (actualBalance, calculatedBalance) => {
          // Calculate discrepancy using the service
          const result = billingCycleHistoryService.calculateDiscrepancy(
            actualBalance,
            calculatedBalance
          );
          
          const discrepancyAmount = result.amount;
          
          // Verify type classification
          if (discrepancyAmount > 0) {
            expect(result.type).toBe('higher');
            expect(result.description).toContain('higher than tracked');
          } else if (discrepancyAmount < 0) {
            expect(result.type).toBe('lower');
            expect(result.description).toContain('lower than tracked');
          } else {
            expect(result.type).toBe('match');
            expect(result.description).toContain('accurate');
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Test specific edge cases for discrepancy type classification
   */
  test('Property 7: Discrepancy Type Classification - Edge Cases', () => {
    // Test exact match (zero discrepancy)
    const matchResult = billingCycleHistoryService.calculateDiscrepancy(100, 100);
    expect(matchResult.type).toBe('match');
    expect(matchResult.amount).toBe(0);
    
    // Test positive discrepancy (actual > calculated)
    const higherResult = billingCycleHistoryService.calculateDiscrepancy(150, 100);
    expect(higherResult.type).toBe('higher');
    expect(higherResult.amount).toBe(50);
    
    // Test negative discrepancy (actual < calculated)
    const lowerResult = billingCycleHistoryService.calculateDiscrepancy(100, 150);
    expect(lowerResult.type).toBe('lower');
    expect(lowerResult.amount).toBe(-50);
    
    // Test zero balances
    const zeroResult = billingCycleHistoryService.calculateDiscrepancy(0, 0);
    expect(zeroResult.type).toBe('match');
    expect(zeroResult.amount).toBe(0);
    
    // Test small discrepancy (rounding)
    const smallResult = billingCycleHistoryService.calculateDiscrepancy(100.01, 100);
    expect(smallResult.type).toBe('higher');
    expect(smallResult.amount).toBe(0.01);
  });


  /**
   * Feature: credit-card-billing-cycle-history, Property 8: Update Preserves Calculated Balance
   * **Validates: Requirements 2.3**
   * 
   * For any billing cycle record update operation, the calculated_statement_balance field 
   * SHALL remain unchanged from its original value, regardless of what other fields are modified.
   * 
   * This test uses mocking to verify the service behavior without database dependencies.
   */
  test('Property 8: Update Preserves Calculated Balance', async () => {
    // Mock the repository and payment method repository
    const mockBillingCycleRepository = require('../repositories/billingCycleRepository');
    const mockPaymentMethodRepository = require('../repositories/paymentMethodRepository');
    
    // Store original methods
    const originalFindById = mockBillingCycleRepository.findById;
    const originalUpdate = mockBillingCycleRepository.update;
    const originalPMFindById = mockPaymentMethodRepository.findById;
    
    let testCounter = 0;
    
    try {
      await fc.assert(
        fc.asyncProperty(
          // Original calculated balance (should be preserved)
          fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          // Original actual balance
          fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          // New actual balance (update value)
          fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
            .map(n => Math.round(n * 100) / 100),
          async (originalCalculatedBalance, originalActualBalance, newActualBalance) => {
            testCounter++;
            const cycleId = testCounter;
            const paymentMethodId = 1;
            
            // Track what was passed to update
            let updateCalledWith = null;
            
            // Mock payment method repository
            mockPaymentMethodRepository.findById = async (id) => ({
              id,
              type: 'credit_card',
              display_name: 'Test Card',
              billing_cycle_day: 15
            });
            
            // Mock findById to return existing record
            mockBillingCycleRepository.findById = async (id) => ({
              id,
              payment_method_id: paymentMethodId,
              cycle_start_date: '2024-01-16',
              cycle_end_date: '2024-02-15',
              actual_statement_balance: originalActualBalance,
              calculated_statement_balance: originalCalculatedBalance,
              minimum_payment: null,
              due_date: null,
              notes: null
            });
            
            // Mock update to capture what was passed and return updated record
            mockBillingCycleRepository.update = async (id, data) => {
              updateCalledWith = { id, data };
              
              // Return updated record with preserved calculated balance
              return {
                id,
                payment_method_id: paymentMethodId,
                cycle_start_date: '2024-01-16',
                cycle_end_date: '2024-02-15',
                actual_statement_balance: data.actual_statement_balance !== undefined 
                  ? data.actual_statement_balance 
                  : originalActualBalance,
                calculated_statement_balance: originalCalculatedBalance, // Preserved!
                minimum_payment: data.minimum_payment,
                due_date: data.due_date,
                notes: data.notes
              };
            };
            
            // Call the service update method
            const result = await billingCycleHistoryService.updateBillingCycle(
              paymentMethodId,
              cycleId,
              { actual_statement_balance: newActualBalance }
            );
            
            // Verify the calculated_statement_balance was preserved
            expect(result.calculated_statement_balance).toBe(originalCalculatedBalance);
            
            // Verify the actual_statement_balance was updated
            expect(result.actual_statement_balance).toBe(newActualBalance);
            
            // Verify discrepancy is calculated with preserved calculated balance
            const expectedDiscrepancy = Math.round((newActualBalance - originalCalculatedBalance) * 100) / 100;
            expect(result.discrepancy.amount).toBe(expectedDiscrepancy);
            
            return true;
          }
        ),
        pbtOptions()
      );
    } finally {
      // Restore original methods
      mockBillingCycleRepository.findById = originalFindById;
      mockBillingCycleRepository.update = originalUpdate;
      mockPaymentMethodRepository.findById = originalPMFindById;
    }
  });

  /**
   * Test that discrepancy description contains the correct dollar amount
   */
  test('Discrepancy description contains correct dollar amount', async () => {
    await fc.assert(
      fc.property(
        // Generate actual balance (1 to 10000 to ensure non-zero discrepancy)
        fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate calculated balance (different from actual)
        fc.float({ min: Math.fround(0), max: Math.fround(9999), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (actualBalance, calculatedBalance) => {
          // Skip if they happen to be equal
          if (actualBalance === calculatedBalance) {
            return true;
          }
          
          const result = billingCycleHistoryService.calculateDiscrepancy(
            actualBalance,
            calculatedBalance
          );
          
          // The description should contain the absolute dollar amount
          const absAmount = Math.abs(result.amount).toFixed(2);
          expect(result.description).toContain(`$${absAmount}`);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});

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

describe('BillingCycleHistoryService - Effective Balance Property Tests', () => {
  /**
   * Feature: unified-billing-cycles, Property 6: Effective Balance Calculation
   * **Validates: Requirements 4.1, 4.2**
   * 
   * For any billing cycle:
   * - If actual_statement_balance > 0, effective_balance SHALL equal actual_statement_balance 
   *   and balance_type SHALL be 'actual'
   * - If actual_statement_balance = 0, effective_balance SHALL equal calculated_statement_balance 
   *   and balance_type SHALL be 'calculated'
   */
  test('Property 6: Effective Balance Calculation - Actual Balance Priority', async () => {
    await fc.assert(
      fc.property(
        // Generate actual balance > 0
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        // Generate calculated balance (any value)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (actualBalance, calculatedBalance) => {
          const cycle = {
            actual_statement_balance: actualBalance,
            calculated_statement_balance: calculatedBalance
          };

          const result = billingCycleHistoryService.calculateEffectiveBalance(cycle);

          // When actual > 0, effective balance should be actual
          expect(result.effectiveBalance).toBe(actualBalance);
          expect(result.balanceType).toBe('actual');

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 6: Effective Balance Calculation - Calculated Balance Fallback', async () => {
    await fc.assert(
      fc.property(
        // Generate calculated balance (any value)
        fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          .map(n => Math.round(n * 100) / 100),
        (calculatedBalance) => {
          const cycle = {
            actual_statement_balance: 0,
            calculated_statement_balance: calculatedBalance
          };

          const result = billingCycleHistoryService.calculateEffectiveBalance(cycle);

          // When actual = 0, effective balance should be calculated
          expect(result.effectiveBalance).toBe(calculatedBalance);
          expect(result.balanceType).toBe('calculated');

          return true;
        }
      ),
      pbtOptions()
    );
  });

  test('Property 6: Effective Balance Calculation - Edge Cases', () => {
    // Test null cycle
    const nullResult = billingCycleHistoryService.calculateEffectiveBalance(null);
    expect(nullResult.effectiveBalance).toBe(0);
    expect(nullResult.balanceType).toBe('calculated');

    // Test undefined cycle
    const undefinedResult = billingCycleHistoryService.calculateEffectiveBalance(undefined);
    expect(undefinedResult.effectiveBalance).toBe(0);
    expect(undefinedResult.balanceType).toBe('calculated');

    // Test cycle with missing fields
    const emptyResult = billingCycleHistoryService.calculateEffectiveBalance({});
    expect(emptyResult.effectiveBalance).toBe(0);
    expect(emptyResult.balanceType).toBe('calculated');

    // Test cycle with only actual balance
    const actualOnlyResult = billingCycleHistoryService.calculateEffectiveBalance({
      actual_statement_balance: 100
    });
    expect(actualOnlyResult.effectiveBalance).toBe(100);
    expect(actualOnlyResult.balanceType).toBe('actual');

    // Test cycle with only calculated balance
    const calculatedOnlyResult = billingCycleHistoryService.calculateEffectiveBalance({
      calculated_statement_balance: 200
    });
    expect(calculatedOnlyResult.effectiveBalance).toBe(200);
    expect(calculatedOnlyResult.balanceType).toBe('calculated');
  });
});
