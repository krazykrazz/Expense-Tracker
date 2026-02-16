/**
 * Consolidated Property-Based Tests for Expense Controller
 * Merged from: expenseController.pbt.test.js, expenseController.insurance.pbt.test.js
 * 
 * Features: expanded-expense-categories, personal-care-category, medical-insurance-tracking
  *
 * @invariant Category Validation: For any string input, the expense controller accepts it as a category if and only if it appears in the approved CATEGORIES list; insurance claim status fields accept only valid enum values. Randomization tests the full input space beyond hand-picked examples, catching edge cases in validation logic.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const { CATEGORIES } = require('../utils/categories');
const { isValid: isValidCategory } = require('../utils/categories');

// ============================================================================
// Category Validation Tests (from expenseController.pbt.test.js)
// ============================================================================

describe('Category Validation - Property-Based Tests', () => {
  /**
   * Feature: expanded-expense-categories, Property 9: Category validation
   * Validates: Requirements 5.1, 5.3, 5.4
   */
  test('Property 9: Category validation - valid categories accepted, invalid rejected', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          const isValid = isValidCategory(category);
          expect(isValid).toBe(true);
          expect(CATEGORIES.includes(category)).toBe(true);
          return true;
        }
      ),
      dbPbtOptions()
    );

    const invalidCategoryArbitrary = fc.string({ minLength: 1, maxLength: 50 })
      .filter(str => !CATEGORIES.includes(str) && str.trim().length > 0);

    fc.assert(
      fc.property(
        invalidCategoryArbitrary,
        (category) => {
          const isValid = isValidCategory(category);
          expect(isValid).toBe(false);
          expect(CATEGORIES.includes(category)).toBe(false);
          return true;
        }
      ),
      dbPbtOptions()
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          const uppercase = category.toUpperCase();
          if (uppercase !== category && !CATEGORIES.includes(uppercase)) {
            expect(isValidCategory(uppercase)).toBe(false);
          }
          const lowercase = category.toLowerCase();
          if (lowercase !== category && !CATEGORIES.includes(lowercase)) {
            expect(isValidCategory(lowercase)).toBe(false);
          }
          return true;
        }
      ),
      dbPbtOptions()
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          const withLeadingSpace = ' ' + category;
          const withTrailingSpace = category + ' ';
          const withBothSpaces = ' ' + category + ' ';
          if (!CATEGORIES.includes(withLeadingSpace)) {
            expect(isValidCategory(withLeadingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withTrailingSpace)) {
            expect(isValidCategory(withTrailingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withBothSpaces)) {
            expect(isValidCategory(withBothSpaces)).toBe(false);
          }
          return true;
        }
      ),
      dbPbtOptions()
    );

    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
  });

  test('Property: Category validation matches categories module', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (category) => {
          const isValidInModule = isValidCategory(category);
          if (isValidInModule) {
            expect(CATEGORIES.includes(category)).toBe(true);
          }
          if (CATEGORIES.includes(category)) {
            expect(isValidInModule).toBe(true);
          }
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property: Legacy "Food" category is rejected', () => {
    expect(CATEGORIES.includes('Food')).toBe(false);
    expect(isValidCategory('Food')).toBe(false);
    expect(CATEGORIES.includes('Dining Out')).toBe(true);
    expect(isValidCategory('Dining Out')).toBe(true);
  });

  /**
   * Feature: personal-care-category, Property 6: Personal Care category validation
   * Validates: Requirements 4.1, 4.2
   */
  test('Property 6: Personal Care is a valid category', () => {
    expect(CATEGORIES.includes('Personal Care')).toBe(true);
    expect(isValidCategory('Personal Care')).toBe(true);
    
    fc.assert(
      fc.property(
        fc.array(fc.constant('Personal Care'), { minLength: 1, maxLength: 100 }),
        (categories) => {
          const allValid = categories.every(cat => isValidCategory(cat));
          expect(allValid).toBe(true);
          const allInList = categories.every(cat => CATEGORIES.includes(cat));
          expect(allInList).toBe(true);
          return true;
        }
      ),
      dbPbtOptions()
    );
    
    const personalCareIndex = CATEGORIES.indexOf('Personal Care');
    const insuranceIndex = CATEGORIES.indexOf('Insurance');
    const petCareIndex = CATEGORIES.indexOf('Pet Care');
    
    expect(personalCareIndex).toBeGreaterThan(-1);
    expect(insuranceIndex).toBeGreaterThan(-1);
    expect(petCareIndex).toBeGreaterThan(-1);
    expect(personalCareIndex).toBeGreaterThan(insuranceIndex);
    expect(personalCareIndex).toBeLessThan(petCareIndex);
  });
});

// ============================================================================
// Insurance Claim Status Filtering Tests (from expenseController.insurance.pbt.test.js)
// ============================================================================

const expenseRepository = require('../repositories/expenseRepository');
const expenseService = require('../services/expenseService');
const { getDatabase } = require('../database/db');

const VALID_CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

const generateTestPrefix = () => `PBT_FILTER_${Date.now()}_${Math.random().toString(36).substring(7)}_`;

const claimStatusArb = fc.constantFrom(...VALID_CLAIM_STATUSES);

const safeFormatDate = (d) => {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) {
      return '2024-06-15';
    }
    return date.toISOString().split('T')[0];
  } catch {
    return '2024-06-15';
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
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM expenses WHERE place LIKE 'PBT_FILTER_%'`, [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
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
     */
    test('filtering by claim status should return only expenses with matching status', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 3, maxLength: 10 }
          ),
          claimStatusArb,
          async (expenseDataList, filterStatus) => {
            const year = 2024;
            const createdExpenses = [];

            try {
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

              const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, filterStatus);

              const allMatchStatus = filteredExpenses.every(exp => exp.claimStatus === filterStatus);
              expect(allMatchStatus).toBe(true);

              const expectedCount = createdExpenses.filter(exp => 
                exp.claim_status === filterStatus
              ).length;
              
              const ourFilteredExpenses = filteredExpenses.filter(exp => 
                exp.place === testPrefix
              );
              
              expect(ourFilteredExpenses.length).toBe(expectedCount);

              const noWrongStatus = ourFilteredExpenses.every(exp => exp.claimStatus === filterStatus);
              expect(noWrongStatus).toBe(true);

              return true;
            } finally {
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        dbPbtOptions({ timeout: 30000 })
      );
    });

    test('filtered count should be less than or equal to total insurance-eligible count', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 5, maxLength: 15 }
          ),
          async (expenseDataList) => {
            const year = 2024;
            const createdExpenses = [];

            try {
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

              const totalCreated = createdExpenses.length;

              for (const status of VALID_CLAIM_STATUSES) {
                const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, status);
                const ourFilteredExpenses = filteredExpenses.filter(exp => 
                  exp.place === testPrefix
                );
                expect(ourFilteredExpenses.length).toBeLessThanOrEqual(totalCreated);
              }

              return true;
            } finally {
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        dbPbtOptions({ timeout: 30000 })
      );
    });

    test('sum of filtered counts across all statuses should equal total insurance-eligible count', async () => {
      const testPrefix = generateTestPrefix();
      const medicalExpenseArb = createMedicalExpenseArb(testPrefix);
      
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(medicalExpenseArb, insuranceDataArb),
            { minLength: 4, maxLength: 12 }
          ),
          async (expenseDataList) => {
            const year = 2024;
            const createdExpenses = [];

            try {
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

              const totalCreated = createdExpenses.length;

              let totalFiltered = 0;
              for (const status of VALID_CLAIM_STATUSES) {
                const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, status);
                const ourFilteredExpenses = filteredExpenses.filter(exp => 
                  exp.place === testPrefix
                );
                totalFiltered += ourFilteredExpenses.length;
              }

              expect(totalFiltered).toBe(totalCreated);

              return true;
            } finally {
              for (const expense of createdExpenses) {
                await new Promise((resolve) => {
                  db.run(`DELETE FROM expenses WHERE id = ?`, [expense.id], () => resolve());
                });
              }
              createdExpenseIds = createdExpenseIds.filter(id => !createdExpenses.some(e => e.id === id));
            }
          }
        ),
        dbPbtOptions({ timeout: 30000 })
      );
    });

    test('filtering should only return insurance-eligible medical expenses', async () => {
      await fc.assert(
        fc.asyncProperty(
          claimStatusArb,
          async (filterStatus) => {
            const year = 2024;
            const filteredExpenses = await expenseRepository.getExpensesByClaimStatus(year, filterStatus);

            for (const expense of filteredExpenses) {
              expect(expense.type).toBe('Tax - Medical');
              expect(expense.insuranceEligible).toBe(true);
              expect(expense.claimStatus).toBe(filterStatus);
            }

            return true;
          }
        ),
        dbPbtOptions({ timeout: 15000 })
      );
    });
  });
});
