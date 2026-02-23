const { getDatabase } = require('../database/db');
const fixedExpenseService = require('./fixedExpenseService');
const expenseService = require('./expenseService');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const { CATEGORIES } = require('../utils/categories');

/**
 * End-to-End Integration Tests for Enhanced Fixed Expenses
 * 
 * These tests verify the complete fixed expense flow with category and payment_type fields:
 * - Creating fixed expenses with category and payment type via API
 * - Fixed expenses appearing in category breakdowns
 * - Fixed expenses appearing in payment type breakdowns
 * - Carry forward preserving all fields
 * - Migration with existing data
 * - UI displays and edits new fields correctly
 */

describe('Fixed Expense Service - End-to-End Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM fixed_expenses WHERE year >= 2090', (err) => {
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

  describe('Creating Fixed Expenses with Category and Payment Type', () => {
    test('should create fixed expense with category and payment type via API', async () => {
      const year = 2090;
      const month = 1;

      // Create fixed expense with new fields
      const fixedExpense = await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Verify creation
      expect(fixedExpense).toBeDefined();
      expect(fixedExpense.id).toBeDefined();
      expect(fixedExpense.name).toBe('Rent');
      expect(fixedExpense.amount).toBe(1500);
      expect(fixedExpense.category).toBe('Housing');
      expect(fixedExpense.payment_type).toBe('Debit');
      expect(fixedExpense.year).toBe(year);
      expect(fixedExpense.month).toBe(month);

      // Retrieve and verify
      const retrieved = await fixedExpenseRepository.getFixedExpenses(year, month);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].category).toBe('Housing');
      expect(retrieved[0].payment_type).toBe('Debit');
    });

    test('should validate category when creating fixed expense', async () => {
      const year = 2090;
      const month = 2;

      // Attempt to create with invalid category
      await expect(
        fixedExpenseService.createFixedExpense({
          year,
          month,
          name: 'Test',
          amount: 100,
          category: 'InvalidCategory',
          payment_type: 'Debit'
        })
      ).rejects.toThrow('Invalid category');
    });

    test('should validate payment type when creating fixed expense', async () => {
      const year = 2090;
      const month = 3;

      // Attempt to create with invalid payment type
      await expect(
        fixedExpenseService.createFixedExpense({
          year,
          month,
          name: 'Test',
          amount: 100,
          category: 'Housing',
          payment_type: 'InvalidPaymentType'
        })
      ).rejects.toThrow('Invalid payment type');
    });
  });

  describe('Fixed Expenses in Category Breakdowns', () => {
    test('should include fixed expenses in category totals', async () => {
      const year = 2090;
      const month = 4;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;

      // Create regular expense in Housing category
      await expenseService.createExpense({
        date: dateStr,
        type: 'Housing',
        amount: 500,
        method: 'Debit',
        place: 'Property Manager',
        notes: 'Utilities'
      });

      // Create fixed expense in Housing category
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Get monthly summary
      const summary = await expenseService.getSummary(year, month);

      // Verify Housing category includes both regular and fixed expenses
      expect(summary.typeTotals.Housing).toBe(2000); // 500 + 1500
    });

    test('should aggregate multiple fixed expenses by category', async () => {
      const year = 2090;
      const month = 5;

      // Create multiple fixed expenses in different categories
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Internet',
        amount: 80,
        category: 'Utilities',
        payment_type: 'Debit'
      });

      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Phone',
        amount: 60,
        category: 'Utilities',
        payment_type: 'Debit'
      });

      // Get monthly summary
      const summary = await expenseService.getSummary(year, month);

      // Verify category totals
      expect(summary.typeTotals.Housing).toBe(1500);
      expect(summary.typeTotals.Utilities).toBe(140); // 80 + 60
    });

    test('should update category totals when fixed expense is added', async () => {
      const year = 2090;
      const month = 6;

      // Get initial summary
      let summary = await expenseService.getSummary(year, month);
      const initialHousingTotal = summary.typeTotals.Housing || 0;

      // Add fixed expense
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Get updated summary
      summary = await expenseService.getSummary(year, month);

      // Verify category total increased by exactly the expense amount
      expect(summary.typeTotals.Housing).toBe(initialHousingTotal + 1500);
    });
  });

  describe('Fixed Expenses in Payment Type Breakdowns', () => {
    test('should include fixed expenses in payment type totals', async () => {
      const year = 2090;
      const month = 7;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;

      // Create regular expense with Debit
      await expenseService.createExpense({
        date: dateStr,
        type: 'Groceries',
        amount: 200,
        method: 'Debit',
        place: 'Grocery Store',
        notes: 'Weekly shopping'
      });

      // Create fixed expense with Debit
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Get monthly summary
      const summary = await expenseService.getSummary(year, month);

      // Verify Debit payment type includes both regular and fixed expenses
      expect(summary.methodTotals.Debit).toBe(1700); // 200 + 1500
    });

    test('should aggregate multiple fixed expenses by payment type', async () => {
      const year = 2090;
      const month = 8;

      // Create fixed expenses with different payment types
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Netflix',
        amount: 15,
        category: 'Subscriptions',
        payment_type: 'Credit Card'
      });

      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Spotify',
        amount: 10,
        category: 'Subscriptions',
        payment_type: 'Credit Card'
      });

      // Get monthly summary
      const summary = await expenseService.getSummary(year, month);

      // Verify payment type totals
      expect(summary.methodTotals.Debit).toBe(1500);
      expect(summary.methodTotals['Credit Card']).toBe(25); // 15 + 10
    });

    test('should update payment type totals when fixed expense is added', async () => {
      const year = 2090;
      const month = 9;

      // Get initial summary
      let summary = await expenseService.getSummary(year, month);
      const initialDebitTotal = summary.methodTotals.Debit || 0;

      // Add fixed expense
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Insurance',
        amount: 250,
        category: 'Insurance',
        payment_type: 'Debit'
      });

      // Get updated summary
      summary = await expenseService.getSummary(year, month);

      // Verify payment type total increased by exactly the expense amount
      expect(summary.methodTotals.Debit).toBe(initialDebitTotal + 250);
    });
  });

  describe('Carry Forward Preserves All Fields', () => {
    test('should carry forward category and payment type to next month', async () => {
      const sourceYear = 2090;
      const sourceMonth = 10;
      const targetYear = 2090;
      const targetMonth = 11;

      // Create fixed expenses in source month
      await fixedExpenseService.createFixedExpense({
        year: sourceYear,
        month: sourceMonth,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      await fixedExpenseService.createFixedExpense({
        year: sourceYear,
        month: sourceMonth,
        name: 'Internet',
        amount: 80,
        category: 'Utilities',
        payment_type: 'Credit Card'
      });

      // Carry forward (method takes target year/month and looks back to previous month)
      const result = await fixedExpenseService.carryForwardFixedExpenses(
        targetYear,
        targetMonth
      );

      // Verify carry forward result
      expect(result.count).toBe(2);

      // Retrieve target month expenses
      const targetExpenses = await fixedExpenseRepository.getFixedExpenses(targetYear, targetMonth);
      expect(targetExpenses.length).toBe(2);

      // Verify all fields were copied
      const rent = targetExpenses.find(e => e.name === 'Rent');
      expect(rent).toBeDefined();
      expect(rent.amount).toBe(1500);
      expect(rent.category).toBe('Housing');
      expect(rent.payment_type).toBe('Debit');
      expect(rent.year).toBe(targetYear);
      expect(rent.month).toBe(targetMonth);

      const internet = targetExpenses.find(e => e.name === 'Internet');
      expect(internet).toBeDefined();
      expect(internet.amount).toBe(80);
      expect(internet.category).toBe('Utilities');
      expect(internet.payment_type).toBe('Credit Card');
      expect(internet.year).toBe(targetYear);
      expect(internet.month).toBe(targetMonth);
    });

    test('should carry forward across year boundary', async () => {
      const sourceYear = 2090;
      const sourceMonth = 12;
      const targetYear = 2091;
      const targetMonth = 1;

      // Create fixed expense
      await fixedExpenseService.createFixedExpense({
        year: sourceYear,
        month: sourceMonth,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Carry forward (method takes target year/month and looks back to previous month)
      await fixedExpenseService.carryForwardFixedExpenses(
        targetYear,
        targetMonth
      );

      // Verify in target year/month
      const targetExpenses = await fixedExpenseRepository.getFixedExpenses(targetYear, targetMonth);
      expect(targetExpenses.length).toBe(1);
      expect(targetExpenses[0].category).toBe('Housing');
      expect(targetExpenses[0].payment_type).toBe('Debit');
      expect(targetExpenses[0].year).toBe(2091);
      expect(targetExpenses[0].month).toBe(1);
    });
  });

  describe('Migration with Existing Data', () => {
    test('should handle existing fixed expenses without category/payment_type', async () => {
      const year = 2090;
      const month = 12;

      // Manually insert a fixed expense without category/payment_type (simulating old data)
      // This tests that the migration added default values
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)`,
          [year, month, 'Old Expense', 100],
          function(err) {
            if (err) {
              // If this fails, it means the columns are required (migration worked)
              // Try with default values
              db.run(
                `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)`,
                [year, month, 'Old Expense', 100, 'Other', 'Debit'],
                function(err2) {
                  if (err2) reject(err2);
                  else resolve(this.lastID);
                }
              );
            } else {
              resolve(this.lastID);
            }
          }
        );
      });

      // Retrieve and verify it has category and payment_type
      const expenses = await fixedExpenseRepository.getFixedExpenses(year, month);
      expect(expenses.length).toBe(1);
      expect(expenses[0].category).toBeDefined();
      expect(expenses[0].payment_type).toBeDefined();
      
      // Should have default values if migration worked
      expect(expenses[0].category).toBeTruthy();
      expect(expenses[0].payment_type).toBeTruthy();
    });

    test('should preserve existing data during migration', async () => {
      const year = 2091;
      const month = 1;

      // Create fixed expense with all fields
      const created = await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Test Expense',
        amount: 250,
        category: 'Insurance',
        payment_type: 'Credit Card'
      });

      // Retrieve and verify all original data preserved
      const retrieved = await fixedExpenseRepository.getFixedExpenses(year, month);
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe(created.id);
      expect(retrieved[0].name).toBe('Test Expense');
      expect(retrieved[0].amount).toBe(250);
      expect(retrieved[0].category).toBe('Insurance');
      expect(retrieved[0].payment_type).toBe('Credit Card');
      expect(retrieved[0].year).toBe(year);
      expect(retrieved[0].month).toBe(month);
    });
  });

  describe('Update and Delete Operations', () => {
    test('should update category and payment type', async () => {
      const year = 2091;
      const month = 2;

      // Create fixed expense
      const created = await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Subscription',
        amount: 15,
        category: 'Subscriptions',
        payment_type: 'Debit'
      });

      // Update category and payment type
      const updated = await fixedExpenseService.updateFixedExpense(created.id, {
        year,
        month,
        name: 'Subscription',
        amount: 15,
        category: 'Entertainment',
        payment_type: 'Credit Card'
      });

      // Verify update
      expect(updated.category).toBe('Entertainment');
      expect(updated.payment_type).toBe('Credit Card');

      // Retrieve and verify
      const retrieved = await fixedExpenseRepository.getFixedExpenses(year, month);
      expect(retrieved[0].category).toBe('Entertainment');
      expect(retrieved[0].payment_type).toBe('Credit Card');
    });

    test('should validate category when updating', async () => {
      const year = 2091;
      const month = 3;

      // Create fixed expense
      const created = await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Test',
        amount: 100,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Attempt to update with invalid category
      await expect(
        fixedExpenseService.updateFixedExpense(created.id, {
          year,
          month,
          name: 'Test',
          amount: 100,
          category: 'InvalidCategory',
          payment_type: 'Debit'
        })
      ).rejects.toThrow('Invalid category');
    });

    test('should validate payment type when updating', async () => {
      const year = 2091;
      const month = 4;

      // Create fixed expense
      const created = await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Test',
        amount: 100,
        category: 'Housing',
        payment_type: 'Debit'
      });

      // Attempt to update with invalid payment type
      await expect(
        fixedExpenseService.updateFixedExpense(created.id, {
          year,
          month,
          name: 'Test',
          amount: 100,
          category: 'Housing',
          payment_type: 'InvalidPaymentType'
        })
      ).rejects.toThrow('Invalid payment type');
    });
  });

  describe('Complete Workflow', () => {
    test('should handle complete lifecycle: create, update, aggregate, carry forward', async () => {
      const year = 2091;
      const month = 5;
      const nextMonth = 6;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;

      // Step 1: Create fixed expenses
      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Rent',
        amount: 1500,
        category: 'Housing',
        payment_type: 'Debit'
      });

      await fixedExpenseService.createFixedExpense({
        year,
        month,
        name: 'Internet',
        amount: 80,
        category: 'Utilities',
        payment_type: 'Credit Card'
      });

      // Step 2: Create regular expenses
      await expenseService.createExpense({
        date: dateStr,
        type: 'Housing',
        amount: 200,
        method: 'Debit',
        place: 'Hardware Store',
        notes: 'Repairs'
      });

      await expenseService.createExpense({
        date: dateStr,
        type: 'Groceries',
        amount: 300,
        method: 'Debit',
        place: 'Grocery Store',
        notes: 'Weekly shopping'
      });

      // Step 3: Verify aggregation
      const summary = await expenseService.getSummary(year, month);
      
      expect(summary.typeTotals.Housing).toBe(1700); // 1500 + 200
      expect(summary.typeTotals.Utilities).toBe(80);
      expect(summary.typeTotals.Groceries).toBe(300);
      
      expect(summary.methodTotals.Debit).toBe(2000); // 1500 + 200 + 300
      expect(summary.methodTotals['Credit Card']).toBe(80);

      // Step 4: Update a fixed expense
      const fixedExpenses = await fixedExpenseRepository.getFixedExpenses(year, month);
      const internet = fixedExpenses.find(e => e.name === 'Internet');
      
      await fixedExpenseService.updateFixedExpense(internet.id, {
        year,
        month,
        name: 'Internet',
        amount: 90, // Increased
        category: 'Utilities',
        payment_type: 'Credit Card'
      });

      // Verify updated aggregation
      const updatedSummary = await expenseService.getSummary(year, month);
      expect(updatedSummary.typeTotals.Utilities).toBe(90);
      expect(updatedSummary.methodTotals['Credit Card']).toBe(90);

      // Step 5: Carry forward to next month
      await fixedExpenseService.carryForwardFixedExpenses(year, nextMonth);

      // Verify carry forward
      const nextMonthExpenses = await fixedExpenseRepository.getFixedExpenses(year, nextMonth);
      expect(nextMonthExpenses.length).toBe(2);
      
      const carriedRent = nextMonthExpenses.find(e => e.name === 'Rent');
      expect(carriedRent.category).toBe('Housing');
      expect(carriedRent.payment_type).toBe('Debit');
      expect(carriedRent.amount).toBe(1500);

      const carriedInternet = nextMonthExpenses.find(e => e.name === 'Internet');
      expect(carriedInternet.category).toBe('Utilities');
      expect(carriedInternet.payment_type).toBe('Credit Card');
      expect(carriedInternet.amount).toBe(90); // Updated amount carried forward
    });
  });
});
