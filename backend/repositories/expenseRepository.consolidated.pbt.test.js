/**
 * Consolidated Property-Based Tests for Expense Repository
 * Merged from: categoryFrequency, merchantRanking, insurance
 * 
 * Features: smart-expense-entry, merchant-analytics, medical-insurance-tracking
  *
 * @invariant Expense Query Consistency: For any set of stored expenses, category frequency queries return accurate counts; merchant ranking reflects actual spending patterns; insurance status filters correctly partition results. Randomization covers diverse category distributions, merchant names, and insurance states.
 */

const { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } = require('@jest/globals');
const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const expenseRepository = require('./expenseRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

// ============================================================================
// Category Frequency Tests (from expenseRepository.categoryFrequency.pbt.test.js)
// ============================================================================

describe('ExpenseRepository - Property-Based Tests for Category Frequency', () => {
  let db;
  const testRunId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  beforeAll(async () => {
    db = await getDatabase();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  async function createExpense(expense) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date, expense.place, expense.notes || null,
        expense.amount, expense.type, expense.week, expense.method
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...expense });
      });
    });
  }

  // **Feature: smart-expense-entry, Property 1: Most Frequent Category Suggestion**
  // **Validates: Requirements 1.4, 2.1, 4.1**
  test('Property 1: Most frequent category is returned first in frequency results', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom(...CATEGORIES),
          { minLength: 1, maxLength: 20 }
        ),
        async (categoryList) => {
          testCounter++;
          const placeName = `PBT_FREQ_${testRunId}_${testCounter}_${Date.now()}`;
          
          const baseDate = new Date('2025-01-01');
          for (let i = 0; i < categoryList.length; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + i);
            await createExpense({
              date: date.toISOString().split('T')[0],
              place: placeName,
              amount: 10.00,
              type: categoryList[i],
              week: 1,
              method: 'Cash'
            });
          }

          const frequencyResults = await expenseRepository.getCategoryFrequencyByPlace(placeName);

          const expectedFrequencies = {};
          categoryList.forEach(cat => {
            expectedFrequencies[cat] = (expectedFrequencies[cat] || 0) + 1;
          });

          const maxFrequency = Math.max(...Object.values(expectedFrequencies));

          expect(frequencyResults.length).toBeGreaterThan(0);
          expect(frequencyResults[0].count).toBe(maxFrequency);

          const categoriesWithMaxFreq = Object.entries(expectedFrequencies)
            .filter(([_, count]) => count === maxFrequency)
            .map(([cat, _]) => cat);
          expect(categoriesWithMaxFreq).toContain(frequencyResults[0].category);

          frequencyResults.forEach(result => {
            expect(result.count).toBe(expectedFrequencies[result.category]);
          });

          for (let i = 1; i < frequencyResults.length; i++) {
            expect(frequencyResults[i - 1].count).toBeGreaterThanOrEqual(frequencyResults[i].count);
          }
        }
      ),
      dbPbtOptions()
    );
  }, 120000);

  // **Feature: smart-expense-entry, Property 1 (case-insensitivity): Case-insensitive place matching**
  // **Validates: Requirements 1.4, 4.1**
  test('Property 1 (case-insensitivity): Place matching is case-insensitive', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        async (category) => {
          testCounter++;
          const basePlaceName = `PBT_FREQ_CASE_${testRunId}_${testCounter}_${Date.now()}`;
          
          await createExpense({
            date: '2025-01-01',
            place: basePlaceName,
            amount: 10.00,
            type: category,
            week: 1,
            method: 'Cash'
          });

          const lowerResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName.toLowerCase());
          const upperResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName.toUpperCase());
          const originalResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName);

          expect(lowerResults.length).toBe(originalResults.length);
          expect(upperResults.length).toBe(originalResults.length);
          
          if (originalResults.length > 0) {
            expect(lowerResults[0].category).toBe(originalResults[0].category);
            expect(upperResults[0].category).toBe(originalResults[0].category);
            expect(lowerResults[0].count).toBe(originalResults[0].count);
            expect(upperResults[0].count).toBe(originalResults[0].count);
          }
        }
      ),
      dbPbtOptions()
    );
  }, 60000);

  test('Empty or null place returns empty array', async () => {
    const emptyResult = await expenseRepository.getCategoryFrequencyByPlace('');
    const nullResult = await expenseRepository.getCategoryFrequencyByPlace(null);
    const whitespaceResult = await expenseRepository.getCategoryFrequencyByPlace('   ');

    expect(emptyResult).toEqual([]);
    expect(nullResult).toEqual([]);
    expect(whitespaceResult).toEqual([]);
  });

  test('Property 1 (last_used): Results include correct last_used date', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        async (category) => {
          testCounter++;
          const placeName = `PBT_FREQ_DATE_${testRunId}_${testCounter}_${Date.now()}`;
          
          const dates = ['2025-01-01', '2025-01-15', '2025-01-20'];
          for (const date of dates) {
            await createExpense({
              date,
              place: placeName,
              amount: 10.00,
              type: category,
              week: 1,
              method: 'Cash'
            });
          }

          const results = await expenseRepository.getCategoryFrequencyByPlace(placeName);

          expect(results.length).toBe(1);
          expect(results[0].last_used).toBe('2025-01-20');
          expect(results[0].count).toBe(3);
        }
      ),
      dbPbtOptions()
    );
  }, 60000);
});

// ============================================================================
// Merchant Ranking Tests (from expenseRepository.merchantRanking.pbt.test.js)
// ============================================================================

/**
 * **Feature: merchant-analytics, Property 1: Merchant ranking by total spend is correctly sorted**
 * **Validates: Requirements 1.1**
 */
describe('ExpenseRepository - Merchant Ranking Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    const tables = ['expense_people', 'expenses', 'monthly_gross', 'income_sources', 'fixed_expenses', 'loans', 'loan_balances', 'budgets', 'investments', 'investment_values', 'people'];
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table}`, (err) => {
          if (err && !err.message.includes('no such table')) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM sqlite_sequence', (err) => {
        if (err && !err.message.includes('no such table')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Simple test to verify basic functionality', async () => {
    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-01-01', 'Store A', 'Test', 100.00, 'Groceries', 1, 'Cash'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      const sql = `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      db.run(sql, ['2024-01-02', 'Store B', 'Test', 50.00, 'Groceries', 1, 'Cash'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const results = await expenseRepository.getMerchantAnalytics();
    
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Store A');
    expect(results[0].totalSpend).toBe(100.00);
    expect(results[1].name).toBe('Store B');
    expect(results[1].totalSpend).toBe(50.00);
  });

  test('Property 1: Merchant ranking by total spend is correctly sorted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            expenses: fc.array(
              fc.record({
                amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true })
                  .filter(n => !isNaN(n) && isFinite(n) && n > 0),
                date: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
                  .map(d => {
                    try {
                      return d.toISOString().split('T')[0];
                    } catch (e) {
                      return '2024-01-01';
                    }
                  }),
                type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment'),
                method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'VISA'),
                week: fc.integer({ min: 1, max: 5 })
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          { minLength: 2, maxLength: 5, selector: (item) => item.place }
        ),
        async (merchantData) => {
          for (const merchant of merchantData) {
            for (const expense of merchant.expenses) {
              await new Promise((resolve, reject) => {
                const sql = `
                  INSERT INTO expenses (date, place, notes, amount, type, week, method)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                db.run(sql, [
                  expense.date, merchant.place, 'Test expense',
                  expense.amount, expense.type, expense.week, expense.method
                ], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });
            }
          }

          const results = await expenseRepository.getMerchantAnalytics();

          for (let i = 0; i < results.length - 1; i++) {
            expect(results[i].totalSpend).toBeGreaterThanOrEqual(results[i + 1].totalSpend);
          }

          const testMerchants = results.filter(r => merchantData.some(m => m.place === r.name));
          
          for (let i = 0; i < testMerchants.length - 1; i++) {
            expect(testMerchants[i].totalSpend).toBeGreaterThanOrEqual(testMerchants[i + 1].totalSpend);
          }

          expect(testMerchants.length).toBe(merchantData.length);
        }
      ),
      dbPbtOptions()
    );
  });
});

// ============================================================================
// Insurance Tests (from expenseRepository.insurance.pbt.test.js)
// ============================================================================

describe('Expense Repository Insurance Property-Based Tests', () => {
  let db;

  beforeEach(async () => {
    db = await getDatabase();
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
    if (db) {
      await new Promise((resolve) => {
        db.run('DELETE FROM expense_people', () => {
          db.run('DELETE FROM expenses', () => {
            resolve();
          });
        });
      });
    }
  });

  const claimStatusArb = fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied', null);
  
  const validDateArb = fc.date({ 
    min: new Date('2020-01-01'), 
    max: new Date('2030-12-31') 
  }).map(d => d.toISOString().split('T')[0]);

  const paymentMethodArb = fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA');

  /**
   * **Property 3: Insurance Data Persistence Round-Trip**
   * **Validates: Requirements 1.3, 2.3, 5.4**
   */
  test('Property 3: Insurance Data Persistence Round-Trip', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.record({
          date: validDateArb,
          place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          notes: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
          original_cost: fc.double({ min: 10, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
          method: paymentMethodArb,
          claim_status: claimStatusArb
        }).chain(data => {
          return fc.double({ min: 0.01, max: data.original_cost, noNaN: true })
            .map(amount => ({
              ...data,
              amount: Math.round(amount * 100) / 100,
              insurance_eligible: true
            }));
        }),
        async (insuranceData) => {
          const dateObj = new Date(insuranceData.date);
          const dayOfMonth = dateObj.getDate();
          const week = Math.min(5, Math.ceil(dayOfMonth / 7));

          const expenseId = await new Promise((resolve, reject) => {
            db.run(
              `INSERT INTO expenses (date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                insuranceData.date, insuranceData.place, insuranceData.notes,
                insuranceData.amount, 'Tax - Medical', week, insuranceData.method,
                insuranceData.insurance_eligible ? 1 : 0, insuranceData.claim_status,
                insuranceData.original_cost
              ],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });

          const retrievedExpense = await expenseRepository.findById(expenseId);

          expect(retrievedExpense).not.toBeNull();
          expect(retrievedExpense.insurance_eligible).toBe(insuranceData.insurance_eligible ? 1 : 0);
          expect(retrievedExpense.claim_status).toBe(insuranceData.claim_status);
          expect(retrievedExpense.original_cost).toBeCloseTo(insuranceData.original_cost, 2);
          expect(retrievedExpense.amount).toBeCloseTo(insuranceData.amount, 2);

          expect(retrievedExpense.date).toBe(insuranceData.date);
          expect(retrievedExpense.place).toBe(insuranceData.place);
          expect(retrievedExpense.type).toBe('Tax - Medical');
          expect(retrievedExpense.method).toBe(insuranceData.method);

          const year = parseInt(insuranceData.date.split('-')[0]);
          const taxDeductibleExpenses = await expenseRepository.getTaxDeductibleExpenses(year);
          const foundExpense = taxDeductibleExpenses.find(e => e.id === expenseId);
          
          expect(foundExpense).toBeDefined();
          expect(foundExpense.insuranceEligible).toBe(insuranceData.insurance_eligible);
          expect(foundExpense.claimStatus).toBe(insuranceData.claim_status);
          expect(foundExpense.originalCost).toBeCloseTo(insuranceData.original_cost, 2);
          expect(foundExpense.amount).toBeCloseTo(insuranceData.amount, 2);
          
          const expectedReimbursement = insuranceData.original_cost - insuranceData.amount;
          expect(foundExpense.reimbursement).toBeCloseTo(expectedReimbursement, 2);

          const newClaimStatus = insuranceData.claim_status === 'paid' ? 'denied' : 'paid';
          const newAmount = Math.round((insuranceData.original_cost * 0.5) * 100) / 100;
          
          const updatedExpense = await expenseRepository.updateInsuranceFields(expenseId, {
            claim_status: newClaimStatus,
            amount: newAmount
          });

          expect(updatedExpense).not.toBeNull();
          expect(updatedExpense.claim_status).toBe(newClaimStatus);
          expect(updatedExpense.amount).toBeCloseTo(newAmount, 2);
          expect(updatedExpense.original_cost).toBeCloseTo(insuranceData.original_cost, 2);

          await new Promise((resolve) => {
            db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
          });
        }
      ),
      dbPbtOptions()
    );
  });
});
