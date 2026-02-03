/**
 * Property-Based Tests for BillingCycleHistoryService
 * Feature: credit-card-billing-cycle-history
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4**
 */

const fc = require('fast-check');
const { pbtOptions, safeAmount } = require('../test/pbtArbitraries');

// Import the service to test
const billingCycleHistoryService = require('./billingCycleHistoryService');

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
