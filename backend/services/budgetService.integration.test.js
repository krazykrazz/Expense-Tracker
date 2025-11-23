const { getDatabase } = require('../database/db');
const budgetService = require('./budgetService');
const expenseService = require('./expenseService');
const budgetRepository = require('../repositories/budgetRepository');

/**
 * End-to-End Integration Tests for Budget Tracking & Alerts
 * 
 * These tests verify the complete budget flow from creation through
 * expense tracking, modifications, and historical analysis.
 */

describe('Budget Service - End-to-End Integration Tests', () => {
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
   * Test 20.1: Complete budget flow
   * Requirements: All core requirements
   * 
   * This test verifies the complete lifecycle of a budget:
   * 1. Create budget
   * 2. Add expenses
   * 3. Verify progress updates
   * 4. Modify expense
   * 5. Verify recalculation
   * 6. Delete expense
   * 7. Verify update
   */
  describe('20.1 Complete Budget Flow', () => {
    test('should handle complete budget lifecycle with expense operations', async () => {
      const year = 2090;
      const month = 6;
      const category = 'Food';
      const budgetLimit = 500;

      // Step 1: Create budget
      const budget = await budgetService.createBudget(year, month, category, budgetLimit);
      
      expect(budget).toBeDefined();
      expect(budget.id).toBeDefined();
      expect(budget.category).toBe(category);
      expect(budget.limit).toBe(budgetLimit);
      expect(budget.year).toBe(year);
      expect(budget.month).toBe(month);

      // Verify initial state - no spending
      const initialProgress = await budgetService.getBudgetProgress(budget.id);
      expect(initialProgress.spent).toBe(0);
      expect(initialProgress.progress).toBe(0);
      expect(initialProgress.remaining).toBe(budgetLimit);
      expect(initialProgress.status).toBe('safe');

      // Step 2: Add first expense
      const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;
      const expense1 = await expenseService.createExpense({
        date: dateStr,
        type: category,
        amount: 150,
        method: 'Debit',
        place: 'Grocery Store',
        notes: 'Weekly groceries'
      });

      // Step 3: Verify progress updates after adding expense
      const progressAfterAdd = await budgetService.getBudgetProgress(budget.id);
      expect(progressAfterAdd.spent).toBe(150);
      expect(progressAfterAdd.progress).toBe(30); // 150/500 * 100
      expect(progressAfterAdd.remaining).toBe(350);
      expect(progressAfterAdd.status).toBe('safe'); // < 80%

      // Add second expense to push into warning zone
      const expense2 = await expenseService.createExpense({
        date: dateStr,
        type: category,
        amount: 250,
        method: 'Cash',
        place: 'Restaurant',
        notes: 'Dinner'
      });

      // Verify progress after second expense
      const progressAfterSecond = await budgetService.getBudgetProgress(budget.id);
      expect(progressAfterSecond.spent).toBe(400);
      expect(progressAfterSecond.progress).toBe(80); // 400/500 * 100
      expect(progressAfterSecond.remaining).toBe(100);
      expect(progressAfterSecond.status).toBe('warning'); // >= 80%

      // Step 4: Modify first expense (increase amount)
      await expenseService.updateExpense(expense1.id, {
        date: dateStr,
        type: category,
        amount: 200, // Changed from 150 to 200
        method: 'Debit',
        place: 'Grocery Store',
        notes: 'Weekly groceries - updated'
      });

      // Step 5: Verify recalculation after modification
      const progressAfterModify = await budgetService.getBudgetProgress(budget.id);
      expect(progressAfterModify.spent).toBe(450); // 200 + 250
      expect(progressAfterModify.progress).toBe(90); // 450/500 * 100
      expect(progressAfterModify.remaining).toBe(50);
      expect(progressAfterModify.status).toBe('danger'); // >= 90%

      // Step 6: Delete second expense
      await expenseService.deleteExpense(expense2.id);

      // Step 7: Verify update after deletion
      const progressAfterDelete = await budgetService.getBudgetProgress(budget.id);
      expect(progressAfterDelete.spent).toBe(200); // Only expense1 remains
      expect(progressAfterDelete.progress).toBe(40); // 200/500 * 100
      expect(progressAfterDelete.remaining).toBe(300);
      expect(progressAfterDelete.status).toBe('safe'); // < 80%

      // Additional verification: Test budget over limit
      const expense3 = await expenseService.createExpense({
        date: dateStr,
        type: category,
        amount: 400,
        method: 'CIBC MC',
        place: 'Special Event',
        notes: 'Large purchase'
      });

      const progressOverLimit = await budgetService.getBudgetProgress(budget.id);
      expect(progressOverLimit.spent).toBe(600); // 200 + 400
      expect(progressOverLimit.progress).toBe(120); // 600/500 * 100
      expect(progressOverLimit.remaining).toBe(-100); // Negative = overage
      expect(progressOverLimit.status).toBe('critical'); // >= 100%

      // Clean up
      await expenseService.deleteExpense(expense1.id);
      await expenseService.deleteExpense(expense3.id);
      await budgetService.deleteBudget(budget.id);
    });

    test('should handle expense category changes affecting multiple budgets', async () => {
      const year = 2090;
      const month = 7;

      // Create budgets for two categories
      const foodBudget = await budgetService.createBudget(year, month, 'Food', 500);
      const gasBudget = await budgetService.createBudget(year, month, 'Gas', 200);

      // Create expense in Food category
      const dateStr = `${year}-${String(month).padStart(2, '0')}-10`;
      const expense = await expenseService.createExpense({
        date: dateStr,
        type: 'Food',
        amount: 100,
        method: 'Debit',
        place: 'Store',
        notes: 'Test'
      });

      // Verify initial state
      let foodProgress = await budgetService.getBudgetProgress(foodBudget.id);
      let gasProgress = await budgetService.getBudgetProgress(gasBudget.id);
      
      expect(foodProgress.spent).toBe(100);
      expect(gasProgress.spent).toBe(0);

      // Change expense category from Food to Gas
      await expenseService.updateExpense(expense.id, {
        date: dateStr,
        type: 'Gas',
        amount: 100,
        method: 'Debit',
        place: 'Store',
        notes: 'Test - changed to Gas'
      });

      // Verify both budgets updated correctly
      foodProgress = await budgetService.getBudgetProgress(foodBudget.id);
      gasProgress = await budgetService.getBudgetProgress(gasBudget.id);
      
      expect(foodProgress.spent).toBe(0); // Removed from Food
      expect(gasProgress.spent).toBe(100); // Added to Gas

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await budgetService.deleteBudget(foodBudget.id);
      await budgetService.deleteBudget(gasBudget.id);
    });

    test('should handle expense date changes affecting multiple months', async () => {
      const year = 2090;
      const month1 = 8;
      const month2 = 9;
      const category = 'Other';

      // Create budgets for two months
      const budget1 = await budgetService.createBudget(year, month1, category, 300);
      const budget2 = await budgetService.createBudget(year, month2, category, 300);

      // Create expense in month 1
      const date1Str = `${year}-${String(month1).padStart(2, '0')}-15`;
      const expense = await expenseService.createExpense({
        date: date1Str,
        type: category,
        amount: 150,
        method: 'Debit',
        place: 'Store',
        notes: 'Test'
      });

      // Verify initial state
      let progress1 = await budgetService.getBudgetProgress(budget1.id);
      let progress2 = await budgetService.getBudgetProgress(budget2.id);
      
      expect(progress1.spent).toBe(150);
      expect(progress2.spent).toBe(0);

      // Change expense date to month 2
      const date2Str = `${year}-${String(month2).padStart(2, '0')}-15`;
      await expenseService.updateExpense(expense.id, {
        date: date2Str,
        type: category,
        amount: 150,
        method: 'Debit',
        place: 'Store',
        notes: 'Test - moved to next month'
      });

      // Verify both months updated correctly
      progress1 = await budgetService.getBudgetProgress(budget1.id);
      progress2 = await budgetService.getBudgetProgress(budget2.id);
      
      expect(progress1.spent).toBe(0); // Removed from month 1
      expect(progress2.spent).toBe(150); // Added to month 2

      // Clean up
      await expenseService.deleteExpense(expense.id);
      await budgetService.deleteBudget(budget1.id);
      await budgetService.deleteBudget(budget2.id);
    });
  });

  /**
   * Test 20.2: Budget copy flow
   * Requirements: 5.2, 5.5
   * 
   * This test verifies the manual budget copy functionality:
   * 1. Create budgets in month A
   * 2. Copy to month B
   * 3. Verify budgets in month B
   * 4. Verify month A unchanged
   */
  describe('20.2 Budget Copy Flow', () => {
    test('should copy budgets from one month to another', async () => {
      const sourceYear = 2090;
      const sourceMonth = 3;
      const targetYear = 2090;
      const targetMonth = 4;

      // Step 1: Create budgets in month A (source)
      const foodBudget = await budgetService.createBudget(sourceYear, sourceMonth, 'Food', 600);
      const gasBudget = await budgetService.createBudget(sourceYear, sourceMonth, 'Gas', 250);
      const otherBudget = await budgetService.createBudget(sourceYear, sourceMonth, 'Other', 400);

      // Verify source budgets exist
      const sourceBudgets = await budgetService.getBudgets(sourceYear, sourceMonth);
      expect(sourceBudgets.length).toBe(3);

      // Step 2: Copy to month B (target)
      const copyResult = await budgetService.copyBudgets(
        sourceYear,
        sourceMonth,
        targetYear,
        targetMonth,
        false // overwrite = false
      );

      // Verify copy statistics
      expect(copyResult.copied).toBe(3);
      expect(copyResult.skipped).toBe(0);
      expect(copyResult.overwritten).toBe(0);

      // Step 3: Verify budgets in month B
      const targetBudgets = await budgetService.getBudgets(targetYear, targetMonth);
      expect(targetBudgets.length).toBe(3);

      // Verify each budget was copied correctly
      const targetFood = targetBudgets.find(b => b.category === 'Food');
      const targetGas = targetBudgets.find(b => b.category === 'Gas');
      const targetOther = targetBudgets.find(b => b.category === 'Other');

      expect(targetFood).toBeDefined();
      expect(targetFood.limit).toBe(600);
      expect(targetFood.year).toBe(targetYear);
      expect(targetFood.month).toBe(targetMonth);

      expect(targetGas).toBeDefined();
      expect(targetGas.limit).toBe(250);
      expect(targetGas.year).toBe(targetYear);
      expect(targetGas.month).toBe(targetMonth);

      expect(targetOther).toBeDefined();
      expect(targetOther.limit).toBe(400);
      expect(targetOther.year).toBe(targetYear);
      expect(targetOther.month).toBe(targetMonth);

      // Step 4: Verify month A unchanged
      const sourceBudgetsAfter = await budgetService.getBudgets(sourceYear, sourceMonth);
      expect(sourceBudgetsAfter.length).toBe(3);

      const sourceFood = sourceBudgetsAfter.find(b => b.category === 'Food');
      const sourceGas = sourceBudgetsAfter.find(b => b.category === 'Gas');
      const sourceOther = sourceBudgetsAfter.find(b => b.category === 'Other');

      expect(sourceFood.limit).toBe(600);
      expect(sourceGas.limit).toBe(250);
      expect(sourceOther.limit).toBe(400);

      // Verify source budgets have different IDs than target budgets
      expect(sourceFood.id).not.toBe(targetFood.id);
      expect(sourceGas.id).not.toBe(targetGas.id);
      expect(sourceOther.id).not.toBe(targetOther.id);

      // Clean up
      await budgetService.deleteBudget(foodBudget.id);
      await budgetService.deleteBudget(gasBudget.id);
      await budgetService.deleteBudget(otherBudget.id);
      await budgetService.deleteBudget(targetFood.id);
      await budgetService.deleteBudget(targetGas.id);
      await budgetService.deleteBudget(targetOther.id);
    });

    test('should handle copy with overwrite option', async () => {
      const sourceYear = 2090;
      const sourceMonth = 5;
      const targetYear = 2090;
      const targetMonth = 6;

      // Create budgets in source month
      await budgetService.createBudget(sourceYear, sourceMonth, 'Food', 500);
      await budgetService.createBudget(sourceYear, sourceMonth, 'Gas', 200);

      // Create different budgets in target month (to be overwritten)
      const existingFood = await budgetService.createBudget(targetYear, targetMonth, 'Food', 700);
      const existingOther = await budgetService.createBudget(targetYear, targetMonth, 'Other', 300);

      // Copy with overwrite = true
      const copyResult = await budgetService.copyBudgets(
        sourceYear,
        sourceMonth,
        targetYear,
        targetMonth,
        true // overwrite = true
      );

      // Verify copy statistics
      expect(copyResult.copied).toBe(1); // Gas was copied (new)
      expect(copyResult.overwritten).toBe(1); // Food was overwritten
      expect(copyResult.skipped).toBe(0);

      // Verify target budgets
      const targetBudgets = await budgetService.getBudgets(targetYear, targetMonth);
      
      // Should have Food (overwritten), Gas (copied), and Other (unchanged)
      expect(targetBudgets.length).toBe(3);

      const targetFood = targetBudgets.find(b => b.category === 'Food');
      const targetGas = targetBudgets.find(b => b.category === 'Gas');
      const targetOther = targetBudgets.find(b => b.category === 'Other');

      expect(targetFood.limit).toBe(500); // Overwritten from 700 to 500
      expect(targetGas.limit).toBe(200); // Newly copied
      expect(targetOther.limit).toBe(300); // Unchanged

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${sourceYear} AND month = ${sourceMonth}`, () => {
          db.run(`DELETE FROM budgets WHERE year = ${targetYear} AND month = ${targetMonth}`, () => resolve());
        });
      });
    });

    test('should reject copy without overwrite when target has budgets', async () => {
      const sourceYear = 2090;
      const sourceMonth = 7;
      const targetYear = 2090;
      const targetMonth = 8;

      // Create budgets in source month
      await budgetService.createBudget(sourceYear, sourceMonth, 'Food', 500);
      await budgetService.createBudget(sourceYear, sourceMonth, 'Gas', 200);
      await budgetService.createBudget(sourceYear, sourceMonth, 'Other', 300);

      // Create conflicting budget in target month
      await budgetService.createBudget(targetYear, targetMonth, 'Food', 700);

      // Copy with overwrite = false should fail
      await expect(
        budgetService.copyBudgets(
          sourceYear,
          sourceMonth,
          targetYear,
          targetMonth,
          false // overwrite = false
        )
      ).rejects.toThrow('Target month already has budgets. Set overwrite=true to replace.');

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${sourceYear} AND month = ${sourceMonth}`, () => {
          db.run(`DELETE FROM budgets WHERE year = ${targetYear} AND month = ${targetMonth}`, () => resolve());
        });
      });
    });

    test('should handle copy across year boundary', async () => {
      const sourceYear = 2090;
      const sourceMonth = 12;
      const targetYear = 2091;
      const targetMonth = 1;

      // Create budgets in December 2090
      await budgetService.createBudget(sourceYear, sourceMonth, 'Food', 550);
      await budgetService.createBudget(sourceYear, sourceMonth, 'Gas', 220);

      // Copy to January 2091
      const copyResult = await budgetService.copyBudgets(
        sourceYear,
        sourceMonth,
        targetYear,
        targetMonth,
        false
      );

      expect(copyResult.copied).toBe(2);

      // Verify budgets in January 2091
      const targetBudgets = await budgetService.getBudgets(targetYear, targetMonth);
      expect(targetBudgets.length).toBe(2);
      expect(targetBudgets[0].year).toBe(2091);
      expect(targetBudgets[0].month).toBe(1);

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${sourceYear} AND month = ${sourceMonth}`, () => {
          db.run(`DELETE FROM budgets WHERE year = ${targetYear} AND month = ${targetMonth}`, () => resolve());
        });
      });
    });

    test('should fail when copying from empty source month', async () => {
      const sourceYear = 2090;
      const sourceMonth = 10;
      const targetYear = 2090;
      const targetMonth = 11;

      // Don't create any budgets in source month

      // Attempt to copy
      await expect(
        budgetService.copyBudgets(sourceYear, sourceMonth, targetYear, targetMonth, false)
      ).rejects.toThrow('No budgets found in source month');
    });
  });

  /**
   * Test 20.3: Historical analysis flow
   * Requirements: 4.1, 4.2, 4.3
   * 
   * This test verifies the historical budget analysis functionality:
   * 1. Create budgets and expenses for multiple months
   * 2. Request historical data
   * 3. Verify calculations
   */
  describe('20.3 Historical Analysis Flow', () => {
    test('should provide accurate historical analysis over 6 months', async () => {
      const year = 2090;
      const endMonth = 6;
      const periodMonths = 6;

      // Step 1: Create budgets and expenses for 6 months (Jan-Jun)
      const monthlyData = [
        { month: 1, foodBudget: 500, foodSpent: 450, gasBudget: 200, gasSpent: 180 },
        { month: 2, foodBudget: 500, foodSpent: 520, gasBudget: 200, gasSpent: 190 },
        { month: 3, foodBudget: 500, foodSpent: 480, gasBudget: 200, gasSpent: 210 },
        { month: 4, foodBudget: 550, foodSpent: 500, gasBudget: 200, gasSpent: 195 },
        { month: 5, foodBudget: 550, foodSpent: 530, gasBudget: 200, gasSpent: 185 },
        { month: 6, foodBudget: 550, foodSpent: 540, gasBudget: 200, gasSpent: 200 }
      ];

      // Create budgets and expenses for each month
      for (const data of monthlyData) {
        // Create budgets
        await budgetService.createBudget(year, data.month, 'Food', data.foodBudget);
        await budgetService.createBudget(year, data.month, 'Gas', data.gasBudget);

        // Create expenses
        const dateStr = `${year}-${String(data.month).padStart(2, '0')}-15`;
        
        await expenseService.createExpense({
          date: dateStr,
          type: 'Food',
          amount: data.foodSpent,
          method: 'Debit',
          place: 'Store',
          notes: `Food expense for month ${data.month}`
        });

        await expenseService.createExpense({
          date: dateStr,
          type: 'Gas',
          amount: data.gasSpent,
          method: 'Debit',
          place: 'Gas Station',
          notes: `Gas expense for month ${data.month}`
        });
      }

      // Step 2: Request historical data
      const history = await budgetService.getBudgetHistory(year, endMonth, periodMonths);

      // Step 3: Verify calculations
      
      // Verify period information
      expect(history.period.months).toBe(6);
      expect(history.period.start).toBe('2090-01-01');
      expect(history.period.end).toBe('2090-06-01');

      // Verify Food category history
      expect(history.categories.Food).toBeDefined();
      expect(history.categories.Food.history.length).toBe(6);

      // Verify each month's data for Food
      for (let i = 0; i < monthlyData.length; i++) {
        const monthData = monthlyData[i];
        const historyEntry = history.categories.Food.history[i];

        expect(historyEntry.year).toBe(year);
        expect(historyEntry.month).toBe(monthData.month);
        expect(historyEntry.budgeted).toBe(monthData.foodBudget);
        expect(historyEntry.spent).toBe(monthData.foodSpent);
        expect(historyEntry.met).toBe(monthData.foodSpent <= monthData.foodBudget);
      }

      // Calculate expected Food success rate
      // Month 1: 450 <= 500 ✓
      // Month 2: 520 > 500 ✗
      // Month 3: 480 <= 500 ✓
      // Month 4: 500 <= 550 ✓
      // Month 5: 530 <= 550 ✓
      // Month 6: 540 <= 550 ✓
      // Success: 5 out of 6 = 83.33%
      expect(history.categories.Food.successRate).toBeCloseTo(83.33, 1);

      // Calculate expected Food average spending
      const foodTotalSpent = monthlyData.reduce((sum, d) => sum + d.foodSpent, 0);
      const foodAverage = foodTotalSpent / monthlyData.length;
      expect(history.categories.Food.averageSpent).toBe(foodAverage);

      // Verify Gas category history
      expect(history.categories.Gas).toBeDefined();
      expect(history.categories.Gas.history.length).toBe(6);

      // Calculate expected Gas success rate
      // Months met: 1 (180<=200), 2 (190<=200), 4 (195<=200), 5 (185<=200), 6 (200<=200) = 5 out of 6 = 83.33%
      expect(history.categories.Gas.successRate).toBeCloseTo(83.33, 1);

      // Calculate expected Gas average spending
      const gasTotalSpent = monthlyData.reduce((sum, d) => sum + d.gasSpent, 0);
      const gasAverage = gasTotalSpent / monthlyData.length;
      expect(history.categories.Gas.averageSpent).toBe(gasAverage);

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${year}`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
        });
      });
    });

    test('should handle historical analysis with varying budget amounts', async () => {
      const year = 2091; // Use different year to avoid conflicts
      const endMonth = 3;
      const periodMonths = 3;

      // Ensure clean state first
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${year}`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
        });
      });

      // Create budgets with different amounts for each month
      await budgetRepository.create({ year, month: 1, category: 'Food', limit: 500 });
      await budgetRepository.create({ year, month: 2, category: 'Food', limit: 600 }); // Different amount
      await budgetRepository.create({ year, month: 3, category: 'Food', limit: 550 }); // Different amount

      // Create expenses for all 3 months
      // Month 1: under budget (450 < 500)
      await expenseService.createExpense({
        date: `${year}-01-15`,
        type: 'Food',
        amount: 450,
        method: 'Debit',
        place: 'Store',
        notes: 'Month 1'
      });

      // Month 2: over budget (650 > 600)
      await expenseService.createExpense({
        date: `${year}-02-15`,
        type: 'Food',
        amount: 650,
        method: 'Debit',
        place: 'Store',
        notes: 'Month 2'
      });

      // Month 3: under budget (500 < 550)
      await expenseService.createExpense({
        date: `${year}-03-15`,
        type: 'Food',
        amount: 500,
        method: 'Debit',
        place: 'Store',
        notes: 'Month 3'
      });

      // Get historical data
      const history = await budgetService.getBudgetHistory(year, endMonth, periodMonths);

      // Verify each month's data
      expect(history.categories.Food.history[0].budgeted).toBe(500);
      expect(history.categories.Food.history[0].spent).toBe(450);
      expect(history.categories.Food.history[0].met).toBe(true);

      expect(history.categories.Food.history[1].budgeted).toBe(600);
      expect(history.categories.Food.history[1].spent).toBe(650);
      expect(history.categories.Food.history[1].met).toBe(false);

      expect(history.categories.Food.history[2].budgeted).toBe(550);
      expect(history.categories.Food.history[2].spent).toBe(500);
      expect(history.categories.Food.history[2].met).toBe(true);

      // Success rate: 2 out of 3 = 66.67%
      expect(history.categories.Food.successRate).toBeCloseTo(66.67, 1);

      // Average: (450 + 650 + 500) / 3 = 533.33
      expect(history.categories.Food.averageSpent).toBeCloseTo(533.33, 1);

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${year}`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
        });
      });
    });

    test('should handle historical analysis with multiple categories', async () => {
      const year = 2090;
      const endMonth = 3;
      const periodMonths = 3;

      // Create budgets for Food, Gas, and Other for 3 months
      for (let month = 1; month <= 3; month++) {
        await budgetService.createBudget(year, month, 'Food', 500);
        await budgetService.createBudget(year, month, 'Gas', 200);
        await budgetService.createBudget(year, month, 'Other', 300);

        // Create expenses
        const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;
        
        await expenseService.createExpense({
          date: dateStr,
          type: 'Food',
          amount: 450 + (month * 10),
          method: 'Debit',
          place: 'Store',
          notes: `Food ${month}`
        });

        await expenseService.createExpense({
          date: dateStr,
          type: 'Gas',
          amount: 180 + (month * 5),
          method: 'Debit',
          place: 'Gas Station',
          notes: `Gas ${month}`
        });

        await expenseService.createExpense({
          date: dateStr,
          type: 'Other',
          amount: 250 + (month * 20),
          method: 'Debit',
          place: 'Store',
          notes: `Other ${month}`
        });
      }

      // Get historical data
      const history = await budgetService.getBudgetHistory(year, endMonth, periodMonths);

      // Verify all three categories are present
      expect(history.categories.Food).toBeDefined();
      expect(history.categories.Gas).toBeDefined();
      expect(history.categories.Other).toBeDefined();

      // Verify each category has 3 months of history
      expect(history.categories.Food.history.length).toBe(3);
      expect(history.categories.Gas.history.length).toBe(3);
      expect(history.categories.Other.history.length).toBe(3);

      // Verify Food calculations
      // Spending: 460, 470, 480 - all under 500
      expect(history.categories.Food.successRate).toBe(100);
      expect(history.categories.Food.averageSpent).toBeCloseTo(470, 1);

      // Verify Gas calculations
      // Spending: 185, 190, 195 - all under 200
      expect(history.categories.Gas.successRate).toBe(100);
      expect(history.categories.Gas.averageSpent).toBe(190);

      // Verify Other calculations
      // Spending: 270, 290, 310 - only month 3 exceeds 300
      expect(history.categories.Other.successRate).toBeCloseTo(66.67, 1);
      expect(history.categories.Other.averageSpent).toBeCloseTo(290, 1);

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${year}`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
        });
      });
    });

    test('should handle 3-month, 6-month, and 12-month periods', async () => {
      const year = 2090;

      // Create budgets and expenses for 12 months
      for (let month = 1; month <= 12; month++) {
        await budgetService.createBudget(year, month, 'Food', 500);
        
        const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;
        await expenseService.createExpense({
          date: dateStr,
          type: 'Food',
          amount: 400 + (month * 5),
          method: 'Debit',
          place: 'Store',
          notes: `Month ${month}`
        });
      }

      // Test 3-month period
      const history3 = await budgetService.getBudgetHistory(year, 12, 3);
      expect(history3.period.months).toBe(3);
      expect(history3.categories.Food.history.length).toBe(3);
      expect(history3.period.start).toBe('2090-10-01');
      expect(history3.period.end).toBe('2090-12-01');

      // Test 6-month period
      const history6 = await budgetService.getBudgetHistory(year, 12, 6);
      expect(history6.period.months).toBe(6);
      expect(history6.categories.Food.history.length).toBe(6);
      expect(history6.period.start).toBe('2090-07-01');
      expect(history6.period.end).toBe('2090-12-01');

      // Test 12-month period
      const history12 = await budgetService.getBudgetHistory(year, 12, 12);
      expect(history12.period.months).toBe(12);
      expect(history12.categories.Food.history.length).toBe(12);
      expect(history12.period.start).toBe('2090-01-01');
      expect(history12.period.end).toBe('2090-12-01');

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year = ${year}`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${year}'`, () => resolve());
        });
      });
    });

    test('should handle year boundary in historical analysis', async () => {
      // Create budgets spanning year boundary (Nov 2089 - Jan 2090)
      await budgetService.createBudget(2089, 11, 'Food', 500);
      await budgetService.createBudget(2089, 12, 'Food', 500);
      await budgetService.createBudget(2090, 1, 'Food', 500);

      // Create expenses
      await expenseService.createExpense({
        date: '2089-11-15',
        type: 'Food',
        amount: 450,
        method: 'Debit',
        place: 'Store',
        notes: 'Nov 2089'
      });

      await expenseService.createExpense({
        date: '2089-12-15',
        type: 'Food',
        amount: 480,
        method: 'Debit',
        place: 'Store',
        notes: 'Dec 2089'
      });

      await expenseService.createExpense({
        date: '2090-01-15',
        type: 'Food',
        amount: 470,
        method: 'Debit',
        place: 'Store',
        notes: 'Jan 2090'
      });

      // Get historical data for 3 months ending in January 2090
      const history = await budgetService.getBudgetHistory(2090, 1, 3);

      // Verify period spans year boundary
      expect(history.period.start).toBe('2089-11-01');
      expect(history.period.end).toBe('2090-01-01');
      expect(history.categories.Food.history.length).toBe(3);

      // Verify months are in correct order
      expect(history.categories.Food.history[0].year).toBe(2089);
      expect(history.categories.Food.history[0].month).toBe(11);
      expect(history.categories.Food.history[1].year).toBe(2089);
      expect(history.categories.Food.history[1].month).toBe(12);
      expect(history.categories.Food.history[2].year).toBe(2090);
      expect(history.categories.Food.history[2].month).toBe(1);

      // Clean up
      await new Promise((resolve) => {
        db.run(`DELETE FROM budgets WHERE year >= 2089`, () => {
          db.run(`DELETE FROM expenses WHERE strftime('%Y', date) >= '2089'`, () => resolve());
        });
      });
    });
  });
});
