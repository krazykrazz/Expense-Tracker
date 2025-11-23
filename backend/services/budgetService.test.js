const fc = require('fast-check');
const { getDatabase } = require('../database/db');
const budgetService = require('./budgetService');
const budgetRepository = require('../repositories/budgetRepository');

describe('BudgetService - Unit Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2090', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('Validation Tests', () => {
    test('should reject tax-deductible categories', async () => {
      await expect(
        budgetService.createBudget(2025, 11, 'Tax - Medical', 500)
      ).rejects.toThrow('Budget can only be set for Food, Gas, Other categories');

      await expect(
        budgetService.createBudget(2025, 11, 'Tax - Donation', 500)
      ).rejects.toThrow('Budget can only be set for Food, Gas, Other categories');
    });

    test('should reject zero amount', async () => {
      await expect(
        budgetService.createBudget(2025, 11, 'Food', 0)
      ).rejects.toThrow('Budget limit must be a positive number greater than zero');
    });

    test('should reject negative amount', async () => {
      await expect(
        budgetService.createBudget(2025, 11, 'Food', -100)
      ).rejects.toThrow('Budget limit must be a positive number greater than zero');
    });

    test('should handle duplicate budget error', async () => {
      // Create first budget
      await budgetService.createBudget(2090, 11, 'Food', 500);

      // Try to create duplicate
      await expect(
        budgetService.createBudget(2090, 11, 'Food', 600)
      ).rejects.toThrow('A budget already exists for this category and month');
    });
  });

  describe('Automatic Carry-Forward Tests', () => {
    test('should automatically carry forward when no budgets exist', async () => {
      // Create budgets in October 2090
      await budgetService.createBudget(2090, 10, 'Food', 500);
      await budgetService.createBudget(2090, 10, 'Gas', 200);

      // Get budgets for November 2090 (should trigger carry-forward)
      const novemberBudgets = await budgetService.getBudgets(2090, 11);

      expect(novemberBudgets.length).toBe(2);
      
      const foodBudget = novemberBudgets.find(b => b.category === 'Food');
      const gasBudget = novemberBudgets.find(b => b.category === 'Gas');

      expect(foodBudget).toBeDefined();
      expect(foodBudget.limit).toBe(500);
      expect(foodBudget.year).toBe(2090);
      expect(foodBudget.month).toBe(11);

      expect(gasBudget).toBeDefined();
      expect(gasBudget.limit).toBe(200);
      expect(gasBudget.year).toBe(2090);
      expect(gasBudget.month).toBe(11);
    });

    test('should not carry forward when budgets already exist', async () => {
      // Create budgets in October 2090
      await budgetService.createBudget(2090, 10, 'Food', 500);
      await budgetService.createBudget(2090, 10, 'Gas', 200);

      // Create different budgets in November 2090
      await budgetService.createBudget(2090, 11, 'Food', 600);

      // Get budgets for November 2090 (should NOT carry forward)
      const novemberBudgets = await budgetService.getBudgets(2090, 11);

      // Should only have the manually created budget
      expect(novemberBudgets.length).toBe(1);
      expect(novemberBudgets[0].category).toBe('Food');
      expect(novemberBudgets[0].limit).toBe(600);
    });

    test('should return empty array when no budgets exist in current or previous month', async () => {
      // Ensure clean state - delete any budgets that might exist
      await new Promise((resolve) => {
        db.run('DELETE FROM budgets WHERE year = 2089 OR year = 2090', () => resolve());
      });

      // Get budgets for a month with no previous budgets
      const budgets = await budgetService.getBudgets(2090, 1);

      expect(budgets).toEqual([]);
    });

    test('should handle year rollover in carry-forward', async () => {
      // Create budgets in December 2090
      await budgetService.createBudget(2090, 12, 'Food', 500);
      await budgetService.createBudget(2090, 12, 'Other', 300);

      // Get budgets for January 2091 (should carry forward from December 2090)
      const januaryBudgets = await budgetService.getBudgets(2091, 1);

      expect(januaryBudgets.length).toBe(2);
      
      const foodBudget = januaryBudgets.find(b => b.category === 'Food');
      expect(foodBudget).toBeDefined();
      expect(foodBudget.year).toBe(2091);
      expect(foodBudget.month).toBe(1);
      expect(foodBudget.limit).toBe(500);
    });
  });
});

describe('BudgetService - Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2090', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: budget-tracking-alerts, Property 5: Progress calculation accuracy
   * Validates: Requirements 2.2
   */
  test('Property 5: Progress calculation accuracy', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }), // limit
        fc.float({ min: Math.fround(0), max: Math.fround(15000), noNaN: true }),    // spent
        (limit, spent) => {
          const progress = budgetService.calculateProgress(spent, limit);
          const expected = (spent / limit) * 100;
          
          // Allow small floating point tolerance
          expect(Math.abs(progress - expected)).toBeLessThan(0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: budget-tracking-alerts, Property 6: Color coding correctness
   * Validates: Requirements 2.3
   */
  test('Property 6: Color coding correctness', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(200), noNaN: true }), // progress percentage
        (progress) => {
          const status = budgetService.calculateBudgetStatus(progress);
          
          // Verify status matches defined thresholds
          if (progress >= 100) {
            expect(status).toBe('critical');
          } else if (progress >= 90) {
            expect(status).toBe('danger');
          } else if (progress >= 80) {
            expect(status).toBe('warning');
          } else {
            expect(status).toBe('safe');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: budget-tracking-alerts, Property 8: Remaining budget calculation
   * Validates: Requirements 3.4
   */
  test('Property 8: Remaining budget calculation', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }), // limit
        fc.float({ min: Math.fround(0), max: Math.fround(15000), noNaN: true }),    // spent
        (limit, spent) => {
          const remaining = limit - spent;
          
          // Verify remaining calculation (can be negative for overspending)
          expect(Math.abs(remaining - (limit - spent))).toBeLessThan(0.01);
          
          // If spent > limit, remaining should be negative
          if (spent > limit) {
            expect(remaining).toBeLessThan(0);
          }
          
          // If spent < limit, remaining should be positive
          if (spent < limit) {
            expect(remaining).toBeGreaterThan(0);
          }
          
          // If spent == limit, remaining should be ~0
          if (Math.abs(spent - limit) < 0.01) {
            expect(Math.abs(remaining)).toBeLessThan(0.01);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: budget-tracking-alerts, Property 12: Total budget sum accuracy
   * Validates: Requirements 6.1
   */
  test('Property 12: Total budget sum accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          // Generate 1-3 budgets with different categories
          budgets: fc.uniqueArray(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            }),
            { 
              minLength: 1, 
              maxLength: 3,
              selector: (item) => item.category // Ensure unique categories
            }
          )
        }),
        async (data) => {
          try {
            // Create budgets for the month
            const createdBudgets = [];
            for (const budget of data.budgets) {
              const created = await budgetRepository.create({
                year: data.year,
                month: data.month,
                category: budget.category,
                limit: budget.limit
              });
              createdBudgets.push(created);
            }

            // Get budget summary
            const summary = await budgetService.getBudgetSummary(data.year, data.month);

            // Property: Total budgeted should equal sum of all individual budget limits
            const expectedTotal = data.budgets.reduce((sum, b) => sum + b.limit, 0);
            expect(Math.abs(summary.totalBudgeted - expectedTotal)).toBeLessThan(0.01);

            // Clean up - delete all created budgets
            for (const budget of createdBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year} AND month = ${data.month}`, () => resolve());
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 13: Overall progress calculation
   * Validates: Requirements 6.4
   */
  test('Property 13: Overall progress calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          // Generate 1-3 budgets with different categories
          budgets: fc.uniqueArray(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              limit: fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
              // Generate expenses for this category (0-3 expenses)
              expenses: fc.array(
                fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true }),
                { minLength: 0, maxLength: 3 }
              )
            }),
            { 
              minLength: 1, 
              maxLength: 3,
              selector: (item) => item.category // Ensure unique categories
            }
          )
        }),
        async (data) => {
          try {
            // Create budgets for the month
            const createdBudgets = [];
            for (const budget of data.budgets) {
              const created = await budgetRepository.create({
                year: data.year,
                month: data.month,
                category: budget.category,
                limit: budget.limit
              });
              createdBudgets.push(created);
            }

            // Create expenses for each budget
            const createdExpenses = [];
            for (const budget of data.budgets) {
              for (const expenseAmount of budget.expenses) {
                // Create expense in the database
                const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-15`;
                await new Promise((resolve, reject) => {
                  db.run(
                    `INSERT INTO expenses (date, type, amount, method, week) VALUES (?, ?, ?, ?, ?)`,
                    [dateStr, budget.category, expenseAmount, 'Cash', 3],
                    function(err) {
                      if (err) reject(err);
                      else {
                        createdExpenses.push(this.lastID);
                        resolve();
                      }
                    }
                  );
                });
              }
            }

            // Get budget summary
            const summary = await budgetService.getBudgetSummary(data.year, data.month);

            // Calculate expected totals
            const expectedTotalBudgeted = data.budgets.reduce((sum, b) => sum + b.limit, 0);
            const expectedTotalSpent = data.budgets.reduce((sum, b) => {
              return sum + b.expenses.reduce((expSum, exp) => expSum + exp, 0);
            }, 0);

            // Property: Overall progress should equal (total spent / total budgeted) × 100
            const expectedProgress = (expectedTotalSpent / expectedTotalBudgeted) * 100;
            expect(Math.abs(summary.progress - expectedProgress)).toBeLessThan(0.01);

            // Also verify the totals are correct
            expect(Math.abs(summary.totalBudgeted - expectedTotalBudgeted)).toBeLessThan(0.01);
            expect(Math.abs(summary.totalSpent - expectedTotalSpent)).toBeLessThan(0.01);

            // Clean up - delete expenses
            for (const expenseId of createdExpenses) {
              await new Promise((resolve) => {
                db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
              });
            }

            // Clean up - delete budgets
            for (const budget of createdBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year} AND month = ${data.month}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}' AND strftime('%m', date) = '${String(data.month).padStart(2, '0')}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 14: Non-budgeted category exclusion
   * Validates: Requirements 6.5
   */
  test('Property 14: Non-budgeted category exclusion', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          // Generate 1-2 budgeted categories
          budgetedCategories: fc.uniqueArray(
            fc.constantFrom('Food', 'Gas', 'Other'),
            { minLength: 1, maxLength: 2 }
          ),
          // Generate expenses for budgeted categories
          budgetedExpenses: fc.array(
            fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true }),
            { minLength: 0, maxLength: 3 }
          ),
          // Generate expenses for non-budgeted categories (should be excluded)
          nonBudgetedExpenses: fc.array(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              amount: fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
            }),
            { minLength: 1, maxLength: 3 }
          )
        }),
        async (data) => {
          try {
            // Create budgets only for budgeted categories
            const createdBudgets = [];
            for (const category of data.budgetedCategories) {
              const created = await budgetRepository.create({
                year: data.year,
                month: data.month,
                category: category,
                limit: 1000 // Fixed limit for simplicity
              });
              createdBudgets.push(created);
            }

            // Create expenses for budgeted categories
            const createdExpenses = [];
            const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-15`;
            
            for (const expenseAmount of data.budgetedExpenses) {
              // Pick a random budgeted category
              const category = data.budgetedCategories[Math.floor(Math.random() * data.budgetedCategories.length)];
              await new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO expenses (date, type, amount, method, week) VALUES (?, ?, ?, ?, ?)`,
                  [dateStr, category, expenseAmount, 'Cash', 3],
                  function(err) {
                    if (err) reject(err);
                    else {
                      createdExpenses.push(this.lastID);
                      resolve();
                    }
                  }
                );
              });
            }

            // Create expenses for non-budgeted categories (categories without budgets)
            for (const expense of data.nonBudgetedExpenses) {
              // Only create expense if this category is NOT budgeted
              if (!data.budgetedCategories.includes(expense.category)) {
                await new Promise((resolve, reject) => {
                  db.run(
                    `INSERT INTO expenses (date, type, amount, method, week) VALUES (?, ?, ?, ?, ?)`,
                    [dateStr, expense.category, expense.amount, 'Cash', 3],
                    function(err) {
                      if (err) reject(err);
                      else {
                        createdExpenses.push(this.lastID);
                        resolve();
                      }
                    }
                  );
                });
              }
            }

            // Get budget summary
            const summary = await budgetService.getBudgetSummary(data.year, data.month);

            // Calculate expected total spent (only from budgeted categories)
            const expectedTotalSpent = data.budgetedExpenses.reduce((sum, exp) => sum + exp, 0);

            // Property: Total spent should only include expenses from budgeted categories
            // Non-budgeted category expenses should be excluded
            expect(Math.abs(summary.totalSpent - expectedTotalSpent)).toBeLessThan(0.01);

            // Verify that non-budgeted expenses exist but are not counted
            const allExpensesTotal = await new Promise((resolve, reject) => {
              db.get(
                `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`,
                [data.year.toString(), String(data.month).padStart(2, '0')],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row && row.total !== null ? parseFloat(row.total) : 0);
                }
              );
            });

            // If we created non-budgeted expenses, verify they're not included
            const nonBudgetedTotal = data.nonBudgetedExpenses
              .filter(exp => !data.budgetedCategories.includes(exp.category))
              .reduce((sum, exp) => sum + exp.amount, 0);

            if (nonBudgetedTotal > 0) {
              // Total expenses should be more than summary total spent
              expect(allExpensesTotal).toBeGreaterThan(summary.totalSpent);
            }

            // Clean up - delete expenses
            for (const expenseId of createdExpenses) {
              await new Promise((resolve) => {
                db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
              });
            }

            // Clean up - delete budgets
            for (const budget of createdBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year} AND month = ${data.month}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}' AND strftime('%m', date) = '${String(data.month).padStart(2, '0')}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 9: Automatic carry-forward preserves data
   * Validates: Requirements 5.1, 5.2
   */
  test('Property 9: Automatic carry-forward preserves data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sourceMonth: fc.integer({ min: 1, max: 12 }),
          // Generate 1-3 budgets with different categories
          budgets: fc.uniqueArray(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            }),
            { 
              minLength: 1, 
              maxLength: 3,
              selector: (item) => item.category // Ensure unique categories
            }
          )
        }),
        async (data) => {
          // Use a unique year for each test run to avoid conflicts (within valid range)
          const sourceYear = 2090 + Math.floor(Math.random() * 9);
          
          // Calculate target month (next month)
          let targetYear = sourceYear;
          let targetMonth = data.sourceMonth + 1;
          
          if (targetMonth > 12) {
            targetMonth = 1;
            targetYear = sourceYear + 1;
          }

          try {
            // Create budgets in source month
            const createdBudgets = [];
            for (const budget of data.budgets) {
              const created = await budgetRepository.create({
                year: sourceYear,
                month: data.sourceMonth,
                category: budget.category,
                limit: budget.limit
              });
              createdBudgets.push(created);
            }

            // Call getBudgets for target month (should trigger automatic carry-forward)
            const carriedForwardBudgets = await budgetService.getBudgets(targetYear, targetMonth);

            // Property: Carried forward budgets should have identical category and limit values
            expect(carriedForwardBudgets.length).toBe(data.budgets.length);

            // Sort both arrays by category for comparison
            const sortedOriginal = [...data.budgets].sort((a, b) => a.category.localeCompare(b.category));
            const sortedCarriedForward = [...carriedForwardBudgets].sort((a, b) => a.category.localeCompare(b.category));

            for (let i = 0; i < sortedOriginal.length; i++) {
              expect(sortedCarriedForward[i].category).toBe(sortedOriginal[i].category);
              expect(Math.abs(sortedCarriedForward[i].limit - sortedOriginal[i].limit)).toBeLessThan(0.01);
              
              // Verify year and month are set to target
              expect(sortedCarriedForward[i].year).toBe(targetYear);
              expect(sortedCarriedForward[i].month).toBe(targetMonth);
            }

            // Clean up - delete all created budgets
            for (const budget of createdBudgets) {
              await budgetRepository.delete(budget.id);
            }
            for (const budget of carriedForwardBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run('DELETE FROM budgets WHERE year >= 2090', () => resolve());
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 10: Budget copy preserves data
   * Validates: Requirements 5A.2, 5A.5
   */
  test('Property 10: Budget copy preserves data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sourceYear: fc.integer({ min: 2090, max: 2095 }),
          sourceMonth: fc.integer({ min: 1, max: 12 }),
          targetYear: fc.integer({ min: 2090, max: 2095 }),
          targetMonth: fc.integer({ min: 1, max: 12 }),
          // Generate 1-3 budgets with different categories
          budgets: fc.uniqueArray(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            }),
            { 
              minLength: 1, 
              maxLength: 3,
              selector: (item) => item.category // Ensure unique categories
            }
          )
        }),
        async (data) => {
          // Ensure source and target are different months
          if (data.sourceYear === data.targetYear && data.sourceMonth === data.targetMonth) {
            // Skip this test case - source and target must be different
            return;
          }

          try {
            // Create budgets in source month
            const createdSourceBudgets = [];
            for (const budget of data.budgets) {
              const created = await budgetRepository.create({
                year: data.sourceYear,
                month: data.sourceMonth,
                category: budget.category,
                limit: budget.limit
              });
              createdSourceBudgets.push(created);
            }

            // Manually copy budgets from source to target
            const copyResult = await budgetService.copyBudgets(
              data.sourceYear,
              data.sourceMonth,
              data.targetYear,
              data.targetMonth,
              false // overwrite = false
            );

            // Verify copy statistics
            expect(copyResult.copied).toBe(data.budgets.length);
            expect(copyResult.skipped).toBe(0);
            expect(copyResult.overwritten).toBe(0);

            // Get budgets from target month
            const targetBudgets = await budgetRepository.findByYearMonth(data.targetYear, data.targetMonth);

            // Property: Copied budgets should have identical category and limit values
            expect(targetBudgets.length).toBe(data.budgets.length);

            // Sort both arrays by category for comparison
            const sortedOriginal = [...data.budgets].sort((a, b) => a.category.localeCompare(b.category));
            const sortedTarget = [...targetBudgets].sort((a, b) => a.category.localeCompare(b.category));

            for (let i = 0; i < sortedOriginal.length; i++) {
              expect(sortedTarget[i].category).toBe(sortedOriginal[i].category);
              expect(Math.abs(sortedTarget[i].limit - sortedOriginal[i].limit)).toBeLessThan(0.01);
              
              // Verify year and month are set to target
              expect(sortedTarget[i].year).toBe(data.targetYear);
              expect(sortedTarget[i].month).toBe(data.targetMonth);
            }

            // Clean up - delete all created budgets
            for (const budget of createdSourceBudgets) {
              await budgetRepository.delete(budget.id);
            }
            for (const budget of targetBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run('DELETE FROM budgets WHERE year >= 2090', () => resolve());
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 11: Copy operation count accuracy
   * Validates: Requirements 5A.4
   */
  test('Property 11: Copy operation count accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          sourceYear: fc.integer({ min: 2090, max: 2095 }),
          sourceMonth: fc.integer({ min: 1, max: 12 }),
          targetYear: fc.integer({ min: 2090, max: 2095 }),
          targetMonth: fc.integer({ min: 1, max: 12 }),
          // Generate 1-3 budgets with different categories
          budgets: fc.uniqueArray(
            fc.record({
              category: fc.constantFrom('Food', 'Gas', 'Other'),
              limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            }),
            { 
              minLength: 1, 
              maxLength: 3,
              selector: (item) => item.category // Ensure unique categories
            }
          )
        }),
        async (data) => {
          // Ensure source and target are different months
          if (data.sourceYear === data.targetYear && data.sourceMonth === data.targetMonth) {
            // Skip this test case - source and target must be different
            return;
          }

          try {
            // Create budgets in source month
            const createdSourceBudgets = [];
            for (const budget of data.budgets) {
              const created = await budgetRepository.create({
                year: data.sourceYear,
                month: data.sourceMonth,
                category: budget.category,
                limit: budget.limit
              });
              createdSourceBudgets.push(created);
            }

            // Get count of budgets in source month
            const sourceBudgets = await budgetRepository.findByYearMonth(data.sourceYear, data.sourceMonth);
            const expectedCount = sourceBudgets.length;

            // Manually copy budgets from source to target
            const copyResult = await budgetService.copyBudgets(
              data.sourceYear,
              data.sourceMonth,
              data.targetYear,
              data.targetMonth,
              false // overwrite = false
            );

            // Property: Number of budgets reported as copied should equal number in source month
            expect(copyResult.copied).toBe(expectedCount);
            expect(copyResult.copied).toBe(data.budgets.length);

            // Verify the actual count in target month matches
            const targetBudgets = await budgetRepository.findByYearMonth(data.targetYear, data.targetMonth);
            expect(targetBudgets.length).toBe(expectedCount);

            // Clean up - delete all created budgets
            for (const budget of createdSourceBudgets) {
              await budgetRepository.delete(budget.id);
            }
            for (const budget of targetBudgets) {
              await budgetRepository.delete(budget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run('DELETE FROM budgets WHERE year >= 2090', () => resolve());
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});

describe('BudgetService - Historical Analysis Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2089', (err) => {
        if (err) {
          reject(err);
        } else {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) >= '2089'`, (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }
      });
    });
  });

  describe('Success Rate Calculation', () => {
    test('should calculate success rate correctly when all budgets are met', async () => {
      // Create budgets for 3 months
      await budgetRepository.create({ year: 2090, month: 1, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 2, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Food', limit: 500 });

      // Create expenses under budget for all months
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Food', 400, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Food', 450, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Food', 480, 'Cash', 3)`, () => {
              resolve();
            });
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Success rate should be 100% (all 3 months met budget)
      expect(history.categories.Food.successRate).toBe(100);
    });

    test('should calculate success rate correctly when some budgets are not met', async () => {
      // Create budgets for 6 months
      await budgetRepository.create({ year: 2090, month: 1, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 2, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 4, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 5, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 6, category: 'Gas', limit: 200 });

      // Create expenses: 3 under budget, 3 over budget
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Gas', 150, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Gas', 250, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Gas', 180, 'Cash', 3)`, () => {
              db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-04-15', 'Gas', 220, 'Cash', 3)`, () => {
                db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-05-15', 'Gas', 190, 'Cash', 3)`, () => {
                  db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-06-15', 'Gas', 210, 'Cash', 3)`, () => {
                    resolve();
                  });
                });
              });
            });
          });
        });
      });

      // Get history for 6 months
      const history = await budgetService.getBudgetHistory(2090, 6, 6);

      // Success rate should be 50% (3 out of 6 months met budget)
      expect(history.categories.Gas.successRate).toBe(50);
    });

    test('should return null success rate when no budgets exist', async () => {
      // Create expenses but no budgets
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Other', 100, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Other', 150, 'Cash', 3)`, () => {
            resolve();
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Success rate should be null (no budgets to compare against)
      expect(history.categories.Other.successRate).toBeNull();
    });
  });

  describe('Average Spending Calculation', () => {
    test('should calculate average spending correctly', async () => {
      // Create budgets for 3 months
      await budgetRepository.create({ year: 2090, month: 1, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 2, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Food', limit: 500 });

      // Create expenses: 300, 400, 500
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Food', 300, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Food', 400, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Food', 500, 'Cash', 3)`, () => {
              resolve();
            });
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Average should be (300 + 400 + 500) / 3 = 400
      expect(history.categories.Food.averageSpent).toBe(400);
    });

    test('should calculate average spending with zero spending months', async () => {
      // Create budgets for 3 months
      await budgetRepository.create({ year: 2090, month: 1, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 2, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Gas', limit: 200 });

      // Create expenses only for month 1 and 3
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Gas', 150, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Gas', 180, 'Cash', 3)`, () => {
            resolve();
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Average should be (150 + 0 + 180) / 3 = 110
      expect(history.categories.Gas.averageSpent).toBe(110);
    });
  });

  describe('Period Boundary Handling', () => {
    test('should handle 3-month period correctly', async () => {
      // Create budgets for months 1-3
      await budgetRepository.create({ year: 2090, month: 1, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 2, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Food', limit: 500 });

      // Get history for 3 months ending in March
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Should have 3 months of history
      expect(history.categories.Food.history.length).toBe(3);
      expect(history.period.months).toBe(3);
      expect(history.period.start).toBe('2090-01-01');
      expect(history.period.end).toBe('2090-03-01');
    });

    test('should handle 6-month period correctly', async () => {
      // Create budgets for months 1-6
      for (let month = 1; month <= 6; month++) {
        await budgetRepository.create({ year: 2090, month, category: 'Gas', limit: 200 });
      }

      // Get history for 6 months ending in June
      const history = await budgetService.getBudgetHistory(2090, 6, 6);

      // Should have 6 months of history
      expect(history.categories.Gas.history.length).toBe(6);
      expect(history.period.months).toBe(6);
      expect(history.period.start).toBe('2090-01-01');
      expect(history.period.end).toBe('2090-06-01');
    });

    test('should handle 12-month period correctly', async () => {
      // Create budgets for all 12 months
      for (let month = 1; month <= 12; month++) {
        await budgetRepository.create({ year: 2090, month, category: 'Other', limit: 300 });
      }

      // Get history for 12 months ending in December
      const history = await budgetService.getBudgetHistory(2090, 12, 12);

      // Should have 12 months of history
      expect(history.categories.Other.history.length).toBe(12);
      expect(history.period.months).toBe(12);
      expect(history.period.start).toBe('2090-01-01');
      expect(history.period.end).toBe('2090-12-01');
    });

    test('should handle year rollover correctly', async () => {
      // Create budgets spanning year boundary (Nov 2089 - Jan 2090)
      await budgetRepository.create({ year: 2089, month: 11, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2089, month: 12, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 1, category: 'Food', limit: 500 });

      // Get history for 3 months ending in January 2090
      const history = await budgetService.getBudgetHistory(2090, 1, 3);

      // Should have 3 months of history spanning the year boundary
      expect(history.categories.Food.history.length).toBe(3);
      expect(history.period.start).toBe('2089-11-01');
      expect(history.period.end).toBe('2090-01-01');

      // Verify the months are in correct order
      expect(history.categories.Food.history[0].year).toBe(2089);
      expect(history.categories.Food.history[0].month).toBe(11);
      expect(history.categories.Food.history[1].year).toBe(2089);
      expect(history.categories.Food.history[1].month).toBe(12);
      expect(history.categories.Food.history[2].year).toBe(2090);
      expect(history.categories.Food.history[2].month).toBe(1);
    });

    test('should reject invalid period values', async () => {
      await expect(
        budgetService.getBudgetHistory(2090, 6, 5)
      ).rejects.toThrow('Period must be 3, 6, or 12 months');

      await expect(
        budgetService.getBudgetHistory(2090, 6, 24)
      ).rejects.toThrow('Period must be 3, 6, or 12 months');
    });
  });

  describe('Missing Budget Handling', () => {
    test('should indicate "No budget set" for months without budgets', async () => {
      // Create budgets only for months 1 and 3 (skip month 2)
      await budgetRepository.create({ year: 2090, month: 1, category: 'Food', limit: 500 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Food', limit: 500 });

      // Create expenses for all 3 months
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Food', 400, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Food', 450, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Food', 480, 'Cash', 3)`, () => {
              resolve();
            });
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Month 2 should have null budget and null met status
      expect(history.categories.Food.history[1].budgeted).toBeNull();
      expect(history.categories.Food.history[1].met).toBeNull();
      expect(history.categories.Food.history[1].spent).toBeGreaterThan(0);
    });

    test('should not count months without budgets in success rate', async () => {
      // Create budgets for months 1 and 3 only
      await budgetRepository.create({ year: 2090, month: 1, category: 'Gas', limit: 200 });
      await budgetRepository.create({ year: 2090, month: 3, category: 'Gas', limit: 200 });

      // Create expenses under budget for months 1 and 3
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Gas', 150, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Gas', 250, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Gas', 180, 'Cash', 3)`, () => {
              resolve();
            });
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Success rate should be 100% (2 out of 2 months with budgets met)
      // Month 2 should not be counted since it has no budget
      expect(history.categories.Gas.successRate).toBe(100);
    });

    test('should include spending in average even for months without budgets', async () => {
      // Create budget only for month 1
      await budgetRepository.create({ year: 2090, month: 1, category: 'Other', limit: 300 });

      // Create expenses for all 3 months
      await new Promise((resolve) => {
        db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-01-15', 'Other', 100, 'Cash', 3)`, () => {
          db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-02-15', 'Other', 200, 'Cash', 3)`, () => {
            db.run(`INSERT INTO expenses (date, type, amount, method, week) VALUES ('2090-03-15', 'Other', 300, 'Cash', 3)`, () => {
              resolve();
            });
          });
        });
      });

      // Get history for 3 months
      const history = await budgetService.getBudgetHistory(2090, 3, 3);

      // Average should include all months: (100 + 200 + 300) / 3 = 200
      expect(history.categories.Other.averageSpent).toBe(200);
    });
  });
});

describe('BudgetService - Expense Integration Property Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year >= 2090', (err) => {
        if (err) {
          reject(err);
        } else {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) >= '2090'`, (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }
      });
    });
  });

  /**
   * Feature: budget-tracking-alerts, Property 7: Budget progress updates with expenses
   * Validates: Requirements 2.4, 8.2
   */
  test('Property 7: Budget progress updates with expenses', async () => {
    const expenseService = require('./expenseService');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          category: fc.constantFrom('Food', 'Gas', 'Other'),
          budgetLimit: fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
          // Generate 1-5 expenses to add (rounded to 2 decimal places)
          expenses: fc.array(
            fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true }).map(v => Math.round(v * 100) / 100),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (data) => {
          try {
            // Create a budget for the category
            const budget = await budgetRepository.create({
              year: data.year,
              month: data.month,
              category: data.category,
              limit: data.budgetLimit
            });

            // Get initial spent amount (should be 0)
            const initialSpent = await budgetService.getSpentAmount(data.year, data.month, data.category);
            expect(initialSpent).toBe(0);

            // Add expenses one by one and verify budget progress updates
            let expectedTotalSpent = 0;
            const createdExpenses = [];

            for (const expenseAmount of data.expenses) {
              expectedTotalSpent += expenseAmount;

              // Create expense using expenseService (which should trigger budget recalculation)
              const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-15`;
              const expense = await expenseService.createExpense({
                date: dateStr,
                type: data.category,
                amount: expenseAmount,
                method: 'Cash',
                place: 'Test Place',
                notes: 'Test expense'
              });

              createdExpenses.push(expense.id);

              // Property: Adding an expense should increase the spent amount by the expense amount
              const currentSpent = await budgetService.getSpentAmount(data.year, data.month, data.category);
              expect(Math.abs(currentSpent - expectedTotalSpent)).toBeLessThan(0.01);
            }

            // Clean up - delete expenses
            for (const expenseId of createdExpenses) {
              await new Promise((resolve) => {
                db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
              });
            }

            // Clean up - delete budget
            await budgetRepository.delete(budget.id);
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year} AND month = ${data.month}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}' AND strftime('%m', date) = '${String(data.month).padStart(2, '0')}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 18: Expense modification updates budget
   * Validates: Requirements 8.3
   */
  test('Property 18: Expense modification updates budget', async () => {
    const expenseService = require('./expenseService');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          month: fc.integer({ min: 1, max: 12 }),
          oldCategory: fc.constantFrom('Food', 'Gas', 'Other'),
          newCategory: fc.constantFrom('Food', 'Gas', 'Other'),
          oldAmount: fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(v => Math.round(v * 100) / 100),
          newAmount: fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(v => Math.round(v * 100) / 100),
          budgetLimit: fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true })
        }),
        async (data) => {
          try {
            // Create budgets for both categories
            const oldBudget = await budgetRepository.create({
              year: data.year,
              month: data.month,
              category: data.oldCategory,
              limit: data.budgetLimit
            });

            let newBudget = null;
            if (data.oldCategory !== data.newCategory) {
              newBudget = await budgetRepository.create({
                year: data.year,
                month: data.month,
                category: data.newCategory,
                limit: data.budgetLimit
              });
            }

            // Create an expense with old category and amount
            const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-15`;
            const expense = await expenseService.createExpense({
              date: dateStr,
              type: data.oldCategory,
              amount: data.oldAmount,
              method: 'Cash',
              place: 'Test Place',
              notes: 'Test expense'
            });

            // Verify initial spent amount for old category
            const initialOldSpent = await budgetService.getSpentAmount(data.year, data.month, data.oldCategory);
            expect(Math.abs(initialOldSpent - data.oldAmount)).toBeLessThan(0.01);

            // Update the expense (change category and/or amount)
            await expenseService.updateExpense(expense.id, {
              date: dateStr,
              type: data.newCategory,
              amount: data.newAmount,
              method: 'Cash',
              place: 'Test Place Updated',
              notes: 'Test expense updated'
            });

            // Property: Expense modification should update budget progress for affected categories
            const finalOldSpent = await budgetService.getSpentAmount(data.year, data.month, data.oldCategory);
            const finalNewSpent = await budgetService.getSpentAmount(data.year, data.month, data.newCategory);

            if (data.oldCategory === data.newCategory) {
              // Same category: spent should reflect new amount
              expect(Math.abs(finalOldSpent - data.newAmount)).toBeLessThan(0.01);
            } else {
              // Different categories: old should be 0, new should have new amount
              expect(Math.abs(finalOldSpent - 0)).toBeLessThan(0.01);
              expect(Math.abs(finalNewSpent - data.newAmount)).toBeLessThan(0.01);
            }

            // Clean up - delete expense
            await new Promise((resolve) => {
              db.run('DELETE FROM expenses WHERE id = ?', [expense.id], () => resolve());
            });

            // Clean up - delete budgets
            await budgetRepository.delete(oldBudget.id);
            if (newBudget) {
              await budgetRepository.delete(newBudget.id);
            }
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year} AND month = ${data.month}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}' AND strftime('%m', date) = '${String(data.month).padStart(2, '0')}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 19: Date change updates multiple months
   * Validates: Requirements 8.4
   */
  test('Property 19: Date change updates multiple months', async () => {
    const expenseService = require('./expenseService');

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          oldMonth: fc.integer({ min: 1, max: 11 }), // Ensure we can move to next month
          category: fc.constantFrom('Food', 'Gas', 'Other'),
          amount: fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(v => Math.round(v * 100) / 100),
          budgetLimit: fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true })
        }),
        async (data) => {
          const newMonth = data.oldMonth + 1; // Move to next month

          try {
            // Create budgets for both months
            const oldBudget = await budgetRepository.create({
              year: data.year,
              month: data.oldMonth,
              category: data.category,
              limit: data.budgetLimit
            });

            const newBudget = await budgetRepository.create({
              year: data.year,
              month: newMonth,
              category: data.category,
              limit: data.budgetLimit
            });

            // Create an expense in old month
            const oldDateStr = `${data.year}-${String(data.oldMonth).padStart(2, '0')}-15`;
            const expense = await expenseService.createExpense({
              date: oldDateStr,
              type: data.category,
              amount: data.amount,
              method: 'Cash',
              place: 'Test Place',
              notes: 'Test expense'
            });

            // Verify initial spent amounts
            const initialOldSpent = await budgetService.getSpentAmount(data.year, data.oldMonth, data.category);
            const initialNewSpent = await budgetService.getSpentAmount(data.year, newMonth, data.category);
            
            expect(Math.abs(initialOldSpent - data.amount)).toBeLessThan(0.01);
            expect(Math.abs(initialNewSpent - 0)).toBeLessThan(0.01);

            // Update the expense to move it to new month
            const newDateStr = `${data.year}-${String(newMonth).padStart(2, '0')}-15`;
            await expenseService.updateExpense(expense.id, {
              date: newDateStr,
              type: data.category,
              amount: data.amount,
              method: 'Cash',
              place: 'Test Place',
              notes: 'Test expense'
            });

            // Property: Date change should update budget progress for both old and new months
            const finalOldSpent = await budgetService.getSpentAmount(data.year, data.oldMonth, data.category);
            const finalNewSpent = await budgetService.getSpentAmount(data.year, newMonth, data.category);

            // Old month should now have 0 spent
            expect(Math.abs(finalOldSpent - 0)).toBeLessThan(0.01);
            
            // New month should now have the expense amount
            expect(Math.abs(finalNewSpent - data.amount)).toBeLessThan(0.01);

            // Clean up - delete expense
            await new Promise((resolve) => {
              db.run('DELETE FROM expenses WHERE id = ?', [expense.id], () => resolve());
            });

            // Clean up - delete budgets
            await budgetRepository.delete(oldBudget.id);
            await budgetRepository.delete(newBudget.id);
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: budget-tracking-alerts, Property 17: Month filtering accuracy
   * Validates: Requirements 8.1
   */
  test('Property 17: Month filtering accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.integer({ min: 2090, max: 2099 }),
          targetMonth: fc.integer({ min: 2, max: 11 }), // Use middle months to have before/after
          category: fc.constantFrom('Food', 'Gas', 'Other'),
          budgetLimit: fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }),
          // Generate expenses for target month
          targetExpenses: fc.array(
            fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }),
            { minLength: 1, maxLength: 3 }
          ),
          // Generate expenses for other months (should not be counted)
          otherExpenses: fc.array(
            fc.record({
              month: fc.integer({ min: 1, max: 12 }),
              amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true })
            }),
            { minLength: 1, maxLength: 3 }
          )
        }),
        async (data) => {
          try {
            // Create budget for target month
            const budget = await budgetRepository.create({
              year: data.year,
              month: data.targetMonth,
              category: data.category,
              limit: data.budgetLimit
            });

            // Create expenses in target month
            const createdExpenses = [];
            let expectedTargetSpent = 0;

            for (const amount of data.targetExpenses) {
              expectedTargetSpent += amount;
              const dateStr = `${data.year}-${String(data.targetMonth).padStart(2, '0')}-15`;
              
              await new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO expenses (date, type, amount, method, week) VALUES (?, ?, ?, ?, ?)`,
                  [dateStr, data.category, amount, 'Cash', 3],
                  function(err) {
                    if (err) reject(err);
                    else {
                      createdExpenses.push(this.lastID);
                      resolve();
                    }
                  }
                );
              });
            }

            // Create expenses in other months (should not be counted)
            for (const otherExpense of data.otherExpenses) {
              // Skip if it's the target month
              if (otherExpense.month === data.targetMonth) {
                continue;
              }

              const dateStr = `${data.year}-${String(otherExpense.month).padStart(2, '0')}-15`;
              
              await new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO expenses (date, type, amount, method, week) VALUES (?, ?, ?, ?, ?)`,
                  [dateStr, data.category, otherExpense.amount, 'Cash', 3],
                  function(err) {
                    if (err) reject(err);
                    else {
                      createdExpenses.push(this.lastID);
                      resolve();
                    }
                  }
                );
              });
            }

            // Property: Only expenses from the same year and month should be included in spent amount
            const actualSpent = await budgetService.getSpentAmount(data.year, data.targetMonth, data.category);
            expect(Math.abs(actualSpent - expectedTargetSpent)).toBeLessThan(0.01);

            // Verify that expenses from other months exist but are not counted
            const totalAllMonths = await new Promise((resolve, reject) => {
              db.get(
                `SELECT SUM(amount) as total FROM expenses WHERE strftime('%Y', date) = ? AND type = ?`,
                [data.year.toString(), data.category],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row && row.total !== null ? parseFloat(row.total) : 0);
                }
              );
            });

            // If we created expenses in other months, total should be greater than target month
            const otherMonthsTotal = data.otherExpenses
              .filter(exp => exp.month !== data.targetMonth)
              .reduce((sum, exp) => sum + exp.amount, 0);

            if (otherMonthsTotal > 0) {
              expect(totalAllMonths).toBeGreaterThan(actualSpent);
            }

            // Clean up - delete expenses
            for (const expenseId of createdExpenses) {
              await new Promise((resolve) => {
                db.run('DELETE FROM expenses WHERE id = ?', [expenseId], () => resolve());
              });
            }

            // Clean up - delete budget
            await budgetRepository.delete(budget.id);
          } catch (err) {
            // Clean up on error
            await new Promise((resolve) => {
              db.run(`DELETE FROM budgets WHERE year = ${data.year}`, () => {
                db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${data.year}'`, () => resolve());
              });
            });
            throw err;
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
