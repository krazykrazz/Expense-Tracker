/**
 * Property-Based Tests for ExpenseService Insurance Validation
 * Tests universal properties of insurance data validation
 * 
 * **Feature: medical-insurance-tracking**
 */

const { describe, test, expect, beforeEach, afterEach } = require('@jest/globals');
const fc = require('fast-check');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');

describe('ExpenseService Insurance Property-Based Tests', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data if needed
  });

  // Arbitraries for testing
  const validClaimStatusArb = fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied');
  
  // Generate invalid claim statuses (strings that are not in the valid set)
  const invalidClaimStatusArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => !['not_claimed', 'in_progress', 'paid', 'denied', null, undefined].includes(s));

  const validDateArb = fc.integer({ min: 2020, max: 2030 })
    .chain(year => fc.integer({ min: 1, max: 12 })
      .chain(month => fc.integer({ min: 1, max: 28 })
        .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

  const paymentMethodArb = fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA');

  /**
   * **Property 4: Claim Status Enum Validation**
   * **Validates: Requirements 2.2**
   */
  describe('Property 4: Claim Status Enum Validation', () => {
    test('should accept all valid claim status values', () => {
      return fc.assert(
        fc.property(
          validClaimStatusArb,
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (claimStatus, amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: claimStatus, original_cost: amount * 2 },
                amount
              );
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should accept null claim status', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: null, original_cost: amount * 2 },
                amount
              );
            }).not.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should reject invalid claim status values', () => {
      return fc.assert(
        fc.property(
          invalidClaimStatusArb,
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (invalidStatus, amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { claim_status: invalidStatus, original_cost: amount * 2 },
                amount
              );
            }).toThrow(/Claim status must be one of/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle undefined insurance data gracefully', () => {
      expect(() => {
        expenseService.validateInsuranceData(undefined, 100);
      }).not.toThrow();

      expect(() => {
        expenseService.validateInsuranceData(null, 100);
      }).not.toThrow();
    });
  });

  /**
   * **Property 5: Amount Validation Invariant**
   * **Validates: Requirements 3.5, 4.4**
   */
  describe('Property 5: Amount Validation Invariant', () => {
    test('should accept amount <= original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (originalCost) => {
            const amount = Math.round((originalCost * Math.random()) * 100) / 100;
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: originalCost },
                amount
              );
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should accept amount equal to original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (amount) => {
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: amount },
                amount
              );
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should reject amount > original_cost', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 5000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          fc.double({ min: 0.01, max: 1000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          (originalCost, excess) => {
            const amount = originalCost + excess;
            expect(() => {
              expenseService.validateInsuranceData(
                { original_cost: originalCost },
                amount
              );
            }).toThrow(/Out-of-pocket amount cannot exceed original cost/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should accept person allocation amount <= original_amount', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 5000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          fc.integer({ min: 1, max: 100 }),
          (originalAmount, personId) => {
            const amount = Math.round((originalAmount * Math.random()) * 100) / 100 || 0.01;
            const allocations = [{ personId, amount, originalAmount }];
            expect(() => {
              expenseService.validateInsurancePersonAllocations(allocations);
            }).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should reject person allocation amount > original_amount', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 10, max: 5000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          fc.double({ min: 0.01, max: 1000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          fc.integer({ min: 1, max: 100 }),
          (originalAmount, excess, personId) => {
            const amount = originalAmount + excess;
            const allocations = [{ personId, amount, originalAmount }];
            expect(() => {
              expenseService.validateInsurancePersonAllocations(allocations);
            }).toThrow(/Person allocation amount.*cannot exceed their original cost allocation/);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should handle allocations without originalAmount (non-insurance expenses)', () => {
      return fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          fc.integer({ min: 1, max: 100 }),
          (amount, personId) => {
            const allocations = [{ personId, amount }];
            expect(() => {
              expenseService.validateInsurancePersonAllocations(allocations);
            }).not.toThrow();
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * **Property 2: Insurance Data Defaults**
   * **Validates: Requirements 1.2, 2.4, 2.5**
   */
  describe('Property 2: Insurance Data Defaults', () => {
    beforeEach(async () => {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expense_people', (err) => {
          if (err) reject(err);
          else {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_people', () => {
          db.run('DELETE FROM expenses', () => {
            resolve();
          });
        });
      });
    });

    test('should default insurance_eligible to false for new medical expenses', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb
          }),
          async (expenseData) => {
            const expense = await expenseService.createExpense({
              ...expenseData,
              type: 'Tax - Medical'
            });
            expect(expense.insurance_eligible).toBe(0);
            expect(expense.claim_status).toBeNull();
            expect(expense.original_cost).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should default claim_status to not_claimed when insurance_eligible is true', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb
          }),
          async (expenseData) => {
            const expense = await expenseService.createExpense({
              ...expenseData,
              type: 'Tax - Medical',
              insurance_eligible: true
            });
            expect(expense.insurance_eligible).toBe(1);
            expect(expense.claim_status).toBe('not_claimed');
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should default original_cost to amount when insurance_eligible is true', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb
          }),
          async (expenseData) => {
            const expense = await expenseService.createExpense({
              ...expenseData,
              type: 'Tax - Medical',
              insurance_eligible: true
            });
            expect(expense.original_cost).toBeCloseTo(expenseData.amount, 2);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should keep amount equal to original_cost when claim_status is not_claimed or in_progress', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb,
            claim_status: fc.constantFrom('not_claimed', 'in_progress')
          }),
          async (expenseData) => {
            const differentAmount = Math.round((expenseData.original_cost * 0.5) * 100) / 100;
            const expense = await expenseService.createExpense({
              date: expenseData.date,
              place: expenseData.place,
              amount: differentAmount,
              type: 'Tax - Medical',
              method: expenseData.method,
              insurance_eligible: true,
              claim_status: expenseData.claim_status,
              original_cost: expenseData.original_cost
            });
            expect(expense.amount).toBeCloseTo(expenseData.original_cost, 2);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('should allow amount different from original_cost when claim_status is paid or denied', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb,
            claim_status: fc.constantFrom('paid', 'denied')
          }),
          async (expenseData) => {
            const outOfPocket = Math.round((expenseData.original_cost * 0.3) * 100) / 100;
            const expense = await expenseService.createExpense({
              date: expenseData.date,
              place: expenseData.place,
              amount: outOfPocket,
              type: 'Tax - Medical',
              method: expenseData.method,
              insurance_eligible: true,
              claim_status: expenseData.claim_status,
              original_cost: expenseData.original_cost
            });
            expect(expense.amount).toBeCloseTo(outOfPocket, 2);
            expect(expense.original_cost).toBeCloseTo(expenseData.original_cost, 2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Property 6: Reimbursement Calculation**
   * **Validates: Requirements 3.6**
   * 
   * For any insurance-eligible expense with original_cost and amount values, 
   * the calculated reimbursement SHALL equal (original_cost - amount), 
   * and this value SHALL be non-negative.
   */
  describe('Property 6: Reimbursement Calculation', () => {
    beforeEach(async () => {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expense_people', (err) => {
          if (err) reject(err);
          else {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_people', () => {
          db.run('DELETE FROM expenses', () => {
            resolve();
          });
        });
      });
    });

    test('reimbursement should equal original_cost minus amount', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb
          }),
          async (expenseData) => {
            // Generate out-of-pocket amount that is <= original_cost
            const outOfPocket = Math.round((expenseData.original_cost * Math.random()) * 100) / 100 || 0.01;
            
            const expense = await expenseService.createExpense({
              date: expenseData.date,
              place: expenseData.place,
              amount: outOfPocket,
              type: 'Tax - Medical',
              method: expenseData.method,
              insurance_eligible: true,
              claim_status: 'paid',
              original_cost: expenseData.original_cost
            });

            // Retrieve the expense from tax deductible summary to get computed reimbursement
            const year = parseInt(expenseData.date.split('-')[0]);
            const summary = await expenseService.getTaxDeductibleSummary(year);
            const foundExpense = summary.expenses.medical.find(e => e.id === expense.id);

            expect(foundExpense).toBeDefined();
            
            // Verify reimbursement = original_cost - amount
            const expectedReimbursement = expenseData.original_cost - outOfPocket;
            expect(foundExpense.reimbursement).toBeCloseTo(expectedReimbursement, 2);
            
            // Verify reimbursement is non-negative
            expect(foundExpense.reimbursement).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('reimbursement should be zero when amount equals original_cost', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb
          }),
          async (expenseData) => {
            // Create expense where amount equals original_cost (no reimbursement)
            const expense = await expenseService.createExpense({
              ...expenseData,
              type: 'Tax - Medical',
              insurance_eligible: true,
              claim_status: 'denied', // Denied claim - no reimbursement
              original_cost: expenseData.amount
            });

            // Retrieve the expense from tax deductible summary
            const year = parseInt(expenseData.date.split('-')[0]);
            const summary = await expenseService.getTaxDeductibleSummary(year);
            const foundExpense = summary.expenses.medical.find(e => e.id === expense.id);

            expect(foundExpense).toBeDefined();
            
            // Verify reimbursement is zero
            expect(foundExpense.reimbursement).toBeCloseTo(0, 2);
          }
        ),
        { numRuns: 50 }
      );
    });

    test('reimbursement should be non-negative for all valid insurance expenses', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.record({
            date: validDateArb,
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
            method: paymentMethodArb,
            claim_status: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied')
          }),
          async (expenseData) => {
            // Generate valid out-of-pocket amount (<= original_cost)
            const outOfPocket = Math.round((expenseData.original_cost * Math.random()) * 100) / 100 || 0.01;
            
            const expense = await expenseService.createExpense({
              date: expenseData.date,
              place: expenseData.place,
              amount: outOfPocket,
              type: 'Tax - Medical',
              method: expenseData.method,
              insurance_eligible: true,
              claim_status: expenseData.claim_status,
              original_cost: expenseData.original_cost
            });

            // Retrieve the expense from tax deductible summary
            const year = parseInt(expenseData.date.split('-')[0]);
            const summary = await expenseService.getTaxDeductibleSummary(year);
            const foundExpense = summary.expenses.medical.find(e => e.id === expense.id);

            expect(foundExpense).toBeDefined();
            
            // Verify reimbursement is non-negative
            expect(foundExpense.reimbursement).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Property 8: Insurance Totals Aggregation**
   * **Validates: Requirements 6.3, 6.4**
   * 
   * For any year, the total original costs SHALL equal the sum of original_cost for all 
   * insurance-eligible medical expenses, and the total out-of-pocket SHALL equal the sum 
   * of amount for all medical expenses in that year.
   */
  describe('Property 8: Insurance Totals Aggregation', () => {
    beforeEach(async () => {
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM expense_people', (err) => {
          if (err) reject(err);
          else {
            db.run('DELETE FROM expenses', (err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_people', () => {
          db.run('DELETE FROM expenses', () => {
            resolve();
          });
        });
      });
    });

    test('total original costs should equal sum of original_cost for insurance-eligible expenses', () => {
      return fc.assert(
        fc.asyncProperty(
          // Generate multiple insurance-eligible expenses
          fc.array(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              original_cost: fc.double({ min: 10, max: 1000, noNaN: true }).map(v => Math.round(v * 100) / 100),
              method: paymentMethodArb,
              claim_status: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied')
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (expensesData) => {
            // Use a unique year for this test run to avoid conflicts
            const year = 2025;
            
            // Clean up any existing data for this year first
            await new Promise((resolve) => {
              db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
            });
            
            // Create expenses for the same year
            let expectedTotalOriginalCost = 0;

            for (let i = 0; i < expensesData.length; i++) {
              const data = expensesData[i];
              const month = (i % 12) + 1;
              const day = Math.min(28, (i % 28) + 1);
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const outOfPocket = Math.round((data.original_cost * 0.5) * 100) / 100;
              
              await expenseService.createExpense({
                date: date,
                place: data.place,
                amount: outOfPocket,
                type: 'Tax - Medical',
                method: data.method,
                insurance_eligible: true,
                claim_status: data.claim_status,
                original_cost: data.original_cost
              });
              
              expectedTotalOriginalCost += data.original_cost;
            }

            // Get the summary
            const summary = await expenseService.getTaxDeductibleSummary(year);

            // Verify total original costs
            expect(summary.insuranceSummary.totalOriginalCost).toBeCloseTo(expectedTotalOriginalCost, 2);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('total out-of-pocket should equal sum of amount for insurance-eligible expenses', () => {
      return fc.assert(
        fc.asyncProperty(
          // Generate multiple insurance-eligible expenses
          fc.array(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              original_cost: fc.double({ min: 10, max: 1000, noNaN: true }).map(v => Math.round(v * 100) / 100),
              method: paymentMethodArb,
              claim_status: fc.constantFrom('paid', 'denied')
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (expensesData) => {
            // Use a unique year for this test run to avoid conflicts
            const year = 2024;
            
            // Clean up any existing data for this year first
            await new Promise((resolve) => {
              db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
            });
            
            // Create expenses for the same year
            let expectedTotalOutOfPocket = 0;

            for (let i = 0; i < expensesData.length; i++) {
              const data = expensesData[i];
              const month = (i % 12) + 1;
              const day = Math.min(28, (i % 28) + 1);
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const outOfPocket = Math.round((data.original_cost * 0.3) * 100) / 100;
              
              await expenseService.createExpense({
                date: date,
                place: data.place,
                amount: outOfPocket,
                type: 'Tax - Medical',
                method: data.method,
                insurance_eligible: true,
                claim_status: data.claim_status,
                original_cost: data.original_cost
              });
              
              expectedTotalOutOfPocket += outOfPocket;
            }

            // Get the summary
            const summary = await expenseService.getTaxDeductibleSummary(year);

            // Verify total out-of-pocket
            expect(summary.insuranceSummary.totalOutOfPocket).toBeCloseTo(expectedTotalOutOfPocket, 2);
          }
        ),
        { numRuns: 30 }
      );
    });

    test('byStatus counts should match actual expense counts per status', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No random input needed
          async () => {
            // Use a unique year for this test run to avoid conflicts
            const year = 2023;
            
            // Clean up any existing data for this year first
            await new Promise((resolve) => {
              db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
            });
            
            // Create one expense for each status
            const statuses = ['not_claimed', 'in_progress', 'paid', 'denied'];
            
            for (let i = 0; i < statuses.length; i++) {
              const status = statuses[i];
              const month = (i % 12) + 1;
              const date = `${year}-${String(month).padStart(2, '0')}-15`;
              
              await expenseService.createExpense({
                date: date,
                place: `Provider ${i}`,
                amount: 50,
                type: 'Tax - Medical',
                method: 'Cash',
                insurance_eligible: true,
                claim_status: status,
                original_cost: 100
              });
            }

            // Get the summary
            const summary = await expenseService.getTaxDeductibleSummary(year);

            // Verify counts per status
            expect(summary.insuranceSummary.byStatus.not_claimed.count).toBe(1);
            expect(summary.insuranceSummary.byStatus.in_progress.count).toBe(1);
            expect(summary.insuranceSummary.byStatus.paid.count).toBe(1);
            expect(summary.insuranceSummary.byStatus.denied.count).toBe(1);
            expect(summary.insuranceSummary.eligibleCount).toBe(4);
          }
        ),
        { numRuns: 5 }
      );
    });

    test('total reimbursement should equal sum of individual reimbursements', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              original_cost: fc.double({ min: 10, max: 1000, noNaN: true }).map(v => Math.round(v * 100) / 100),
              method: paymentMethodArb
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (expensesData) => {
            // Use a unique year for this test run to avoid conflicts
            const year = 2022;
            
            // Clean up any existing data for this year first
            await new Promise((resolve) => {
              db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
            });
            
            let expectedTotalReimbursement = 0;

            for (let i = 0; i < expensesData.length; i++) {
              const data = expensesData[i];
              const month = (i % 12) + 1;
              const day = Math.min(28, (i % 28) + 1);
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const outOfPocket = Math.round((data.original_cost * 0.4) * 100) / 100;
              const reimbursement = data.original_cost - outOfPocket;
              
              await expenseService.createExpense({
                date: date,
                place: data.place,
                amount: outOfPocket,
                type: 'Tax - Medical',
                method: data.method,
                insurance_eligible: true,
                claim_status: 'paid',
                original_cost: data.original_cost
              });
              
              expectedTotalReimbursement += reimbursement;
            }

            // Get the summary
            const summary = await expenseService.getTaxDeductibleSummary(year);

            // Verify total reimbursement
            expect(summary.insuranceSummary.totalReimbursement).toBeCloseTo(expectedTotalReimbursement, 2);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
