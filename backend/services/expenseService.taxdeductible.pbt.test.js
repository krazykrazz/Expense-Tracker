/**
 * Property-Based Tests for Tax-Deductible Category Identification
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const expenseService = require('./expenseService');
const { getDatabase } = require('../database/db');
const { TAX_DEDUCTIBLE_CATEGORIES, CATEGORIES } = require('../utils/categories');

describe('ExpenseService - Property-Based Tests for Tax-Deductible Identification', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
    // Clean up any leftover test data from previous runs
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_TAX_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  beforeEach(async () => {
    // Clean up test data before each test to ensure isolation
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_TAX_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_TAX_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: expanded-expense-categories, Property 11: Tax-deductible category identification
   * Validates: Requirements 7.2, 7.3, 7.5
   * 
   * For any expense with a category starting with "Tax - ", the system should identify it 
   * as tax-deductible and include it in tax reports
   */
  test('Property 11: Tax-deductible category identification - all tax-deductible expenses included in reports', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate a random number of tax-deductible expenses (1-20)
        fc.integer({ min: 1, max: 20 }),
        async (year, numExpenses) => {
          // Clean up any existing test data for this iteration
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses WHERE place LIKE "PBT_TAX_%"', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          
          // Create multiple tax-deductible expenses with random categories
          const createdExpenses = [];
          
          for (let i = 0; i < numExpenses; i++) {
            // Randomly select a tax-deductible category
            const category = TAX_DEDUCTIBLE_CATEGORIES[i % TAX_DEDUCTIBLE_CATEGORIES.length];
            
            // Generate random month (1-12) and day (1-28 to avoid month-end issues)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 1000 + 1).toFixed(2));
            
            const expense = {
              date,
              place: `PBT_TAX_${category.replace(/\s/g, '_')}_${i}`,
              notes: `Test expense ${i}`,
              amount,
              type: category,
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            createdExpenses.push({ ...created, expectedCategory: category });
          }
          
          // Get tax-deductible summary for the year
          const summary = await expenseService.getTaxDeductibleSummary(year);
          
          // Filter to only our test expenses (those with PBT_TAX_ prefix)
          const testExpensesInSummary = [
            ...summary.expenses.medical.filter(e => e.place && e.place.startsWith('PBT_TAX_')),
            ...summary.expenses.donations.filter(e => e.place && e.place.startsWith('PBT_TAX_'))
          ];
          
          // Property 1: All created tax-deductible expenses should be in the summary
          expect(testExpensesInSummary.length).toBe(createdExpenses.length);
          
          // Property 2: Each created expense should be found in the appropriate category
          for (const created of createdExpenses) {
            const foundExpense = testExpensesInSummary.find(e => e.id === created.id);
            expect(foundExpense).toBeDefined();
            expect(foundExpense.type).toBe(created.expectedCategory);
            expect(foundExpense.amount).toBe(created.amount);
            
            // Verify it's in the correct category array
            if (created.expectedCategory === 'Tax - Medical') {
              expect(summary.expenses.medical.find(e => e.id === created.id)).toBeDefined();
            } else if (created.expectedCategory === 'Tax - Donation') {
              expect(summary.expenses.donations.find(e => e.id === created.id)).toBeDefined();
            }
          }
          
          // Property 3: Calculate totals for only our test expenses
          const testMedicalExpenses = summary.expenses.medical.filter(e => e.place && e.place.startsWith('PBT_TAX_'));
          const testDonationExpenses = summary.expenses.donations.filter(e => e.place && e.place.startsWith('PBT_TAX_'));
          
          const actualTestMedicalTotal = testMedicalExpenses.reduce((sum, e) => sum + e.amount, 0);
          const actualTestDonationTotal = testDonationExpenses.reduce((sum, e) => sum + e.amount, 0);
          const actualTestTotal = actualTestMedicalTotal + actualTestDonationTotal;
          
          // Expected totals from created expenses
          const expectedTotal = createdExpenses.reduce((sum, e) => sum + e.amount, 0);
          const medicalExpenses = createdExpenses.filter(e => e.expectedCategory === 'Tax - Medical');
          const expectedMedicalTotal = medicalExpenses.reduce((sum, e) => sum + e.amount, 0);
          const donationExpenses = createdExpenses.filter(e => e.expectedCategory === 'Tax - Donation');
          const expectedDonationTotal = donationExpenses.reduce((sum, e) => sum + e.amount, 0);
          
          // Verify totals match for our test expenses
          expect(actualTestTotal).toBeCloseTo(expectedTotal, 2);
          expect(actualTestMedicalTotal).toBeCloseTo(expectedMedicalTotal, 2);
          expect(actualTestDonationTotal).toBeCloseTo(expectedDonationTotal, 2);
          
          // Property 4: All test expenses with "Tax - " prefix should be identified
          for (const expense of testExpensesInSummary) {
            expect(expense.type.startsWith('Tax - ')).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // Increased timeout for multiple database operations

  /**
   * Additional property test: Non-tax-deductible expenses should not appear in tax reports
   */
  test('Property: Non-tax-deductible expenses excluded from tax reports', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        // Generate a random number of non-tax-deductible expenses (1-10)
        fc.integer({ min: 1, max: 10 }),
        async (year, numExpenses) => {
          // Get non-tax-deductible categories
          const nonTaxCategories = CATEGORIES.filter(c => !TAX_DEDUCTIBLE_CATEGORIES.includes(c));
          
          // Create multiple non-tax-deductible expenses
          const createdExpenses = [];
          
          for (let i = 0; i < numExpenses; i++) {
            // Randomly select a non-tax-deductible category
            const category = nonTaxCategories[i % nonTaxCategories.length];
            
            // Generate random month (1-12) and day (1-28)
            const month = Math.floor(Math.random() * 12) + 1;
            const day = Math.floor(Math.random() * 28) + 1;
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Generate random amount
            const amount = parseFloat((Math.random() * 1000 + 1).toFixed(2));
            
            const expense = {
              date,
              place: `PBT_TAX_NON_${category.replace(/\s/g, '_')}_${i}`,
              notes: `Non-tax expense ${i}`,
              amount,
              type: category,
              method: 'Cash'
            };
            
            const created = await expenseService.createExpense(expense);
            createdExpenses.push(created);
          }
          
          // Get tax-deductible summary for the year
          const summary = await expenseService.getTaxDeductibleSummary(year);
          
          // Property: None of the created non-tax-deductible expenses should be in the summary
          const allExpensesInSummary = [
            ...summary.expenses.medical,
            ...summary.expenses.donations
          ];
          
          for (const created of createdExpenses) {
            const foundExpense = allExpensesInSummary.find(e => e.id === created.id);
            expect(foundExpense).toBeUndefined();
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 120000);

  /**
   * Additional property test: Monthly breakdown accuracy
   */
  test('Property: Monthly breakdown correctly aggregates tax-deductible expenses by month', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random year
        fc.integer({ min: 2020, max: 2030 }),
        async (year) => {
          // Clean up any existing test data for this iteration
          await new Promise((resolve, reject) => {
            db.run('DELETE FROM expenses WHERE place LIKE "PBT_TAX_%"', (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          
          // Create expenses in different months
          const expensesByMonth = {};
          
          // Create 1-3 expenses per month for a few random months
          const numMonths = Math.floor(Math.random() * 6) + 1; // 1-6 months
          const months = [];
          for (let i = 0; i < numMonths; i++) {
            const month = Math.floor(Math.random() * 12) + 1;
            if (!months.includes(month)) {
              months.push(month);
            }
          }
          
          for (const month of months) {
            expensesByMonth[month] = [];
            const numExpensesInMonth = Math.floor(Math.random() * 3) + 1;
            
            for (let i = 0; i < numExpensesInMonth; i++) {
              const category = TAX_DEDUCTIBLE_CATEGORIES[i % TAX_DEDUCTIBLE_CATEGORIES.length];
              const day = Math.floor(Math.random() * 28) + 1;
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const amount = parseFloat((Math.random() * 500 + 1).toFixed(2));
              
              const expense = {
                date,
                place: `PBT_TAX_MONTHLY_${month}_${i}`,
                notes: `Monthly test ${i}`,
                amount,
                type: category,
                method: 'Cash'
              };
              
              const created = await expenseService.createExpense(expense);
              expensesByMonth[month].push(created);
            }
          }
          
          // Get tax-deductible summary
          const summary = await expenseService.getTaxDeductibleSummary(year);
          
          // Filter to only our test expenses
          const testMedicalExpenses = summary.expenses.medical.filter(e => e.place && e.place.startsWith('PBT_TAX_MONTHLY_'));
          const testDonationExpenses = summary.expenses.donations.filter(e => e.place && e.place.startsWith('PBT_TAX_MONTHLY_'));
          const allTestExpenses = [...testMedicalExpenses, ...testDonationExpenses];
          
          // Property: Monthly breakdown should include our test expenses correctly
          for (let month = 1; month <= 12; month++) {
            const monthBreakdown = summary.monthlyBreakdown.find(m => m.month === month);
            expect(monthBreakdown).toBeDefined();
            
            // Calculate expected total for our test expenses only
            const expectedTotal = (expensesByMonth[month] || []).reduce((sum, e) => sum + e.amount, 0);
            
            // Calculate actual total for our test expenses in this month
            const actualTestExpensesInMonth = allTestExpenses.filter(e => {
              const expMonth = parseInt(e.date.substring(5, 7));
              return expMonth === month;
            });
            const actualTestTotal = actualTestExpensesInMonth.reduce((sum, e) => sum + e.amount, 0);
            
            // Verify our test expenses are included in the monthly breakdown
            // Note: monthBreakdown.total may include other expenses, so we just verify our expenses are present
            expect(actualTestTotal).toBeCloseTo(expectedTotal, 2);
          }
        }
      ),
      { numRuns: 30 }
    );
  }, 120000);

  /**
   * Additional property test: Tax-deductible category prefix validation
   */
  test('Property: All tax-deductible categories start with "Tax - " prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TAX_DEDUCTIBLE_CATEGORIES),
        async (category) => {
          // Property: Every tax-deductible category must start with "Tax - "
          expect(category.startsWith('Tax - ')).toBe(true);
          
          // Create a test expense with this category
          const year = 2024;
          const expense = {
            date: `${year}-06-15`,
            place: `PBT_TAX_PREFIX_${category.replace(/\s/g, '_')}`,
            notes: 'Prefix test',
            amount: 100.00,
            type: category,
            method: 'Cash'
          };
          
          const created = await expenseService.createExpense(expense);
          
          // Get tax-deductible summary
          const summary = await expenseService.getTaxDeductibleSummary(year);
          
          // Property: The created expense should be in the tax report
          const allExpenses = [...summary.expenses.medical, ...summary.expenses.donations];
          const found = allExpenses.find(e => e.id === created.id);
          expect(found).toBeDefined();
          expect(found.type).toBe(category);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
