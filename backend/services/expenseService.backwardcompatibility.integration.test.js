const expenseService = require('./expenseService');
const peopleService = require('./peopleService');
const { getDatabase } = require('../database/db');

/**
 * Integration Tests for Expense Service Backward Compatibility
 * 
 * **Feature: medical-expense-people-tracking**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * Tests that existing medical expenses without people associations remain functional
 * after the people tracking feature is deployed.
 */

describe('ExpenseService Backward Compatibility Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterAll(async () => {
    if (db) {
      await new Promise((resolve) => db.close(resolve));
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await new Promise((resolve, reject) => {
      db.run(
        "DELETE FROM expenses WHERE place LIKE 'BACKWARD_COMPAT_%'",
        [],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run(
        "DELETE FROM expenses WHERE place LIKE 'BACKWARD_COMPAT_%'",
        [],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  /**
   * Test: Backward compatibility preservation - existing expenses remain functional
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   * 
   * For existing medical expenses without people associations, the expense should 
   * remain displayable and editable after the feature deployment
   */
  test('existing medical expenses without people associations remain functional', async () => {
    const year = 2024;
    
    // Create 4 existing medical expenses WITHOUT people associations
    // This simulates expenses that existed before the people tracking feature
    const testExpenses = [
      {
        date: '2024-03-15',
        place: 'BACKWARD_COMPAT_Provider_A',
        notes: 'Existing medical expense 1',
        amount: 125.50,
        type: 'Tax - Medical',
        method: 'VISA'
      },
      {
        date: '2024-06-22',
        place: 'BACKWARD_COMPAT_Provider_B',
        notes: 'Existing medical expense 2',
        amount: 89.75,
        type: 'Tax - Medical',
        method: 'VISA'
      },
      {
        date: '2024-09-10',
        place: 'BACKWARD_COMPAT_Provider_A',
        notes: 'Existing medical expense 3',
        amount: 210.00,
        type: 'Tax - Medical',
        method: 'VISA'
      },
      {
        date: '2024-11-05',
        place: 'BACKWARD_COMPAT_Provider_C',
        notes: 'Existing medical expense 4',
        amount: 67.25,
        type: 'Tax - Medical',
        method: 'VISA'
      }
    ];

    const existingExpenses = [];
    let totalAmount = 0;

    for (const expenseData of testExpenses) {
      const created = await expenseService.createExpense(expenseData);
      existingExpenses.push(created);
      totalAmount += expenseData.amount;
    }

    // Assertion 1: Existing expenses should remain displayable in regular tax summary
    const regularSummary = await expenseService.getTaxDeductibleSummary(year);
    
    // Filter to only our test expenses
    const testMedicalExpenses = regularSummary.expenses.medical.filter(e => 
      e.place && e.place.startsWith('BACKWARD_COMPAT_')
    );
    
    // All existing expenses should be present in regular summary
    expect(testMedicalExpenses.length).toBe(4);
    
    // Total should match
    const regularTotal = testMedicalExpenses.reduce((sum, e) => sum + e.amount, 0);
    expect(regularTotal).toBeCloseTo(totalAmount, 2);

    // Assertion 2: Existing expenses should appear as "Unassigned" in people-grouped view
    const peopleGroupedSummary = await expenseService.getTaxDeductibleWithPeople(year);
    
    // All existing expenses should appear in unassigned section
    let foundUnassignedAmount = 0;
    let foundUnassignedCount = 0;
    
    for (const provider of peopleGroupedSummary.unassignedExpenses.providers) {
      for (const expense of provider.expenses) {
        if (expense.place && expense.place.startsWith('BACKWARD_COMPAT_')) {
          foundUnassignedAmount += expense.amount;
          foundUnassignedCount++;
        }
      }
    }
    
    expect(foundUnassignedCount).toBe(4);
    expect(foundUnassignedAmount).toBeCloseTo(totalAmount, 2);

    // Assertion 3: Existing expenses should be editable (can add people retroactively)
    const expenseToEdit = existingExpenses[0];
    
    // Create a test person with unique name to avoid UNIQUE constraint violations
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testPerson = await peopleService.createPerson(`BACKWARD_COMPAT_Person_${uniqueSuffix}`, '1990-01-01');
    
    // Update the expense to add people association
    const updatedExpense = await expenseService.updateExpenseWithPeople(
      expenseToEdit.id,
      {
        date: expenseToEdit.date,
        place: expenseToEdit.place,
        notes: expenseToEdit.notes,
        amount: expenseToEdit.amount,
        type: expenseToEdit.type,
        method: 'VISA'
      },
      [{ personId: testPerson.id, amount: expenseToEdit.amount }]
    );
    
    // Should successfully update with people association
    expect(updatedExpense).toBeTruthy();
    expect(updatedExpense.people).toBeDefined();
    expect(updatedExpense.people.length).toBe(1);
    expect(updatedExpense.people[0].id).toBe(testPerson.id);
    expect(updatedExpense.people[0].amount).toBeCloseTo(expenseToEdit.amount, 2);

    // Assertion 4: Both assigned and unassigned expenses should be included in totals
    const testMedicalInPeopleView = peopleGroupedSummary.expenses.medical.filter(e => 
      e.place && e.place.startsWith('BACKWARD_COMPAT_')
    );
    
    expect(testMedicalInPeopleView.length).toBe(4);
    
    const peopleViewTotal = testMedicalInPeopleView.reduce((sum, e) => sum + e.amount, 0);
    expect(peopleViewTotal).toBeCloseTo(totalAmount, 2);

    // Assertion 5: Medical total should be consistent between regular and people-grouped views
    expect(regularSummary.medicalTotal).toBeCloseTo(peopleGroupedSummary.medicalTotal, 2);

    // Clean up test person
    await peopleService.deletePerson(testPerson.id);
    
    // Clean up test expenses
    for (const expense of existingExpenses) {
      await expenseService.deleteExpense(expense.id);
    }
  });
});
