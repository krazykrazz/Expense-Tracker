/**
 * Property-Based Tests for Insurance Claim Status Filtering
 * Feature: medical-insurance-tracking
 * Property 9: Claim Status Filtering
 * 
 * Using fast-check library for property-based testing
 * 
 * **Validates: Requirements 6.5, 7.4**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('../services/expenseService');
const { getDatabase } = require('../database/db');

// Valid claim statuses
const VALID_CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

// Generate unique test prefix for each test run
const generateTestPrefix = () => `PBT_FILTER_${Date.now()}_${Math.random().toString(36).substring(7)}_`;

// Test data generators
const claimStatusArb = fc.constantFrom(...VALID_CLAIM_STATUSES);

// Helper to safely format date to ISO string
const safeFormatDate = (d) => {
  try {
    // Ensure we have a valid date
    const date = new Date(d);
    if (isNaN(date.getTime())) {
      return '2024-06-15'; // Fallback to a valid date
    }
    return date.toISOString().split('T')[0];
  } catch {
    return '2024-06-15'; // Fallback to a valid date
  }
};

const createMedicalExpenseArb = (testPrefix) => fc.record({
  date: fc.integer({ min: 0, max: 364 })
    .map(dayOffset => {
      const baseDate = new Date('2024-01-01');
      baseDate.setDate(baseDate.getDate() + dayOffset);
      return safeFormatDate(baseDate);
    }),
  place: fc.constant(testPrefix),
  amount: fc.integer({ min: 10, max: 500 }).map(n => n + 0.00),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: null }),
  type: fc.constant('Tax - Medical'),
  method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
});

const insuranceDataArb = fc.record({
  insurance_eligible: fc.constant(true),
  claim_status: claimStatusArb,
  original_cost: fc.integer({ min: 50, max: 1000 }).map(n => n + 0.00)
}).chain(data => {
  return fc.integer({ min: 10, max: Math.floor(data.original_cost) })
    .map(amount => ({
      ...data,
      amount: amount + 0.00
    }));
});

describe('ExpenseController Insurance Property-Based Tests', () => {
  let db;
  let createdExpenseIds = [];

  beforeAll(async () => {
    db = await getDatabase();
    // Clean up any leftover test data from previous runs
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM expenses WHERE place LIKE 'PBT_FILTER_%'`, [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up expenses created during each test
    if (createdExpenseIds.length > 0) {
      const placeholders = createdExpenseIds.map(() => '?').join(',');
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM expenses WHERE id IN (${placeholders})`, createdExpenseIds, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      createdExpenseIds = [];
    }
  });

  afterAll(async () => {
    // Final cleanup of any remaining test data
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM expenses WHERE place LIKE 'PBT_FILTER_%'`, [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('Property 9: Claim Status Filtering', () => {
    /**
     * **Validates: Requirements 6.5, 7.4**
     * 
     * For any claim status filter value, filtering expenses by that status 
     * SHALL return only expenses where claim_status matches the filter value,
     * and the count of filtered results SHALL be less than or equal to the total count.
     */
    test('filtering by claim status should return only expenses with matching status', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          // Generate a list of expenses with various claim statuses
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 3, maxLength: 10 }
          ),
          // Generate a status to filter by
          claimStatusArb,
          async (expenseDataList, filterStatus) => {
            const year = 2024;
            const createdExpenses = [];

            try {
              // Create expenses with different claim statuses
              for (const [expenseData, insuranceData] of expenseDataList) {
                const fullExpenseData = {
                  ...expenseData,
                  insurance_eligible: insuranceData.insurance_eligible,
                  claim_status: insuranceData.claim_status,
                  original_cost: insuranceData.original_cost,
                  amount: insuranceData.amount
                };

                const expense = await expenseService.createExpense(fullExpenseData);
                createdExpenses.push(expense);
                createdExpenseIds.push(expense.id);
              }

              // Filter expenses by the selected status
              const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, filterStatus);

              // Property 1: All filtered expenses should have the matching claim status
              const allMatchStatus = filteredExpenses.every(exp => exp.claimStatus === filterStatus);
              expect(allMatchStatus).toBe(true);

              // Property 2: Count of filtered results should match expected count
              const expectedCount = createdExpenses.filter(exp => 
                exp.claim_status === filterStatus
              ).length;
              
              // Filter to only our test expenses (those with our unique prefix)
              const ourFilteredExpenses = filteredExpenses.filter(exp => 
                exp.place === testPrefix
              );
              
              expect(ourFilteredExpenses.length).toBe(expectedCount);

              // Property 3: No expense with a different status should be in the results
              const noWrongStatus = ourFilteredExpenses.every(exp => exp.claimStatus === filterStatus);
              expect(noWrongStatus).toBe(true);

              return true;
            } finally {
              // Cleanup created expenses immediately
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        pbtOptions({ timeout: 30000 })
      );
    });

    test('filtered count should be less than or equal to total insurance-eligible count', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          // Generate expenses with mixed statuses
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 5, maxLength: 15 }
          ),
          async (expenseDataList) => {
            const year = 2024;
            const createdExpenses = [];

            try {
              // Create all expenses
              for (const [expenseData, insuranceData] of expenseDataList) {
                const fullExpenseData = {
                  ...expenseData,
                  insurance_eligible: insuranceData.insurance_eligible,
                  claim_status: insuranceData.claim_status,
                  original_cost: insuranceData.original_cost,
                  amount: insuranceData.amount
                };

                const expense = await expenseService.createExpense(fullExpenseData);
                createdExpenses.push(expense);
                createdExpenseIds.push(expense.id);
              }

              // Get total count of our test expenses
              const totalCreated = createdExpenses.length;

              // For each status, verify filtered count <= total
              for (const status of VALID_CLAIM_STATUSES) {
                const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, status);
                
                // Filter to only our test expenses
                const ourFilteredExpenses = filteredExpenses.filter(exp => 
                  exp.place === testPrefix
                );

                expect(ourFilteredExpenses.length).toBeLessThanOrEqual(totalCreated);
              }

              return true;
            } finally {
              // Cleanup created expenses immediately
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        pbtOptions({ timeout: 30000 })
      );
    });

    test('sum of filtered counts across all statuses should equal total insurance-eligible count', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          // Generate expenses with mixed statuses
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 4, maxLength: 12 }
          ),
          async (expenseDataList) => {
            const year = 2024;
            const createdExpenses = [];

            try {
              // Create all expenses
              for (const [expenseData, insuranceData] of expenseDataList) {
                const fullExpenseData = {
                  ...expenseData,
                  insurance_eligible: insuranceData.insurance_eligible,
                  claim_status: insuranceData.claim_status,
                  original_cost: insuranceData.original_cost,
                  amount: insuranceData.amount
                };

                const expense = await expenseService.createExpense(fullExpenseData);
                createdExpenses.push(expense);
                createdExpenseIds.push(expense.id);
              }

              // Get total count of our test expenses
              const totalCreated = createdExpenses.length;

              // Sum filtered counts across all statuses
              let totalFiltered = 0;
              for (const status of VALID_CLAIM_STATUSES) {
                const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, status);
                
                // Filter to only our test expenses
                const ourFilteredExpenses = filteredExpenses.filter(exp => 
                  exp.place === testPrefix
                );

                totalFiltered += ourFilteredExpenses.length;
              }

              // Sum of all filtered counts should equal total created
              expect(totalFiltered).toBe(totalCreated);

              return true;
            } finally {
              // Cleanup created expenses immediately
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        pbtOptions({ timeout: 30000 })
      );
    });

    test('filtering should only return insurance-eligible medical expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          claimStatusArb,
          async (filterStatus) => {
            const year = 2024;

            // Get filtered expenses
            const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, filterStatus);

            // All filtered expenses should be:
            // 1. Medical expenses (type = 'Tax - Medical')
            // 2. Insurance eligible
            // 3. Have the matching claim status
            for (const expense of filteredExpenses) {
              expect(expense.type).toBe('Tax - Medical');
              expect(expense.insuranceEligible).toBe(true);
              expect(expense.claimStatus).toBe(filterStatus);
            }

            return true;
          }
        ),
        pbtOptions({ timeout: 15000 })
      );
    });
  });
});
