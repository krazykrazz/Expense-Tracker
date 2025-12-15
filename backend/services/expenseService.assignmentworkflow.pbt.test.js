const fc = require('fast-check');
const expenseService = require('./expenseService');
const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');
const db = require('../database/db');
const { PAYMENT_METHODS } = require('../utils/constants');

/**
 * Property-Based Tests for Expense Service - Assignment Workflow
 * **Feature: medical-expense-people-tracking, Property 12: Assignment workflow correctness**
 * **Validates: Requirements 6.3**
 */

describe('ExpenseService - Assignment Workflow Properties', () => {
  let testPeople = [];
  let testExpenses = [];
  
  // Use a valid payment method from the constants
  const validPaymentMethod = PAYMENT_METHODS[0]; // 'Cash'

  beforeAll(async () => {
    // Ensure database is initialized
    await db.getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data
    testPeople = [];
    testExpenses = [];
  });

  afterEach(async () => {
    // Clean up created test data
    for (const expense of testExpenses) {
      try {
        await expenseRepository.delete(expense.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    for (const person of testPeople) {
      try {
        await peopleRepository.delete(person.id);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Property 12: Assignment workflow correctness', () => {
    test('For any previously unassigned medical expense, adding people associations should update the expense and refresh summary calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid expense amount (positive, 2 decimal places)
          fc.integer({ min: 100, max: 10000 }).map(cents => cents / 100),
          // Generate valid place name
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          // Generate valid person name
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (amount, place, personName) => {
            // Create a test person
            const person = await peopleRepository.create({
              name: personName.trim(),
              date_of_birth: null
            });
            testPeople.push(person);

            // Create an unassigned medical expense
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            
            const expense = await expenseService.createExpense({
              date: dateStr,
              place: place.trim(),
              notes: 'Test expense',
              amount: amount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(expense);

            // Verify expense is initially unassigned
            const initialPeople = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(initialPeople).toHaveLength(0);

            // Assign the person to the expense (simulating quick assign)
            const updatedExpense = await expenseService.updateExpenseWithPeople(
              expense.id,
              {
                date: dateStr,
                place: place.trim(),
                notes: 'Test expense',
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person.id, amount: amount }]
            );

            // Verify the expense was updated with people association
            expect(updatedExpense).not.toBeNull();
            expect(updatedExpense.people).toHaveLength(1);
            expect(updatedExpense.people[0].personId).toBe(person.id);
            expect(updatedExpense.people[0].amount).toBe(amount);

            // Verify the association is persisted
            const persistedPeople = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(persistedPeople).toHaveLength(1);
            expect(persistedPeople[0].personId).toBe(person.id);
            expect(persistedPeople[0].amount).toBe(amount);

            // Verify the expense appears in person-grouped tax summary
            const year = today.getFullYear();
            const taxSummary = await expenseService.getTaxDeductibleWithPeople(year);
            
            // The expense should now be in the grouped data
            const personGroup = taxSummary.groupedByPerson[person.id];
            expect(personGroup).toBeDefined();
            expect(personGroup.personName).toBe(personName.trim());
            
            // The expense should NOT be in unassigned anymore
            const unassignedExpenseIds = taxSummary.unassignedExpenses.providers
              .flatMap(p => p.expenses)
              .map(e => e.id);
            expect(unassignedExpenseIds).not.toContain(expense.id);
          }
        ),
        { numRuns: 20 } // Reduced runs due to database operations
      );
    });

    test('Assignment workflow preserves expense data integrity', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid expense amount
          fc.integer({ min: 100, max: 10000 }).map(cents => cents / 100),
          // Generate valid place name
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          // Generate valid notes
          fc.string({ minLength: 0, maxLength: 100 }),
          async (amount, place, notes) => {
            // Create a test person
            const person = await peopleRepository.create({
              name: 'Test Person',
              date_of_birth: null
            });
            testPeople.push(person);

            // Create an unassigned medical expense
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            
            const expense = await expenseService.createExpense({
              date: dateStr,
              place: place.trim(),
              notes: notes || null,
              amount: amount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(expense);

            // Assign the person to the expense
            const updatedExpense = await expenseService.updateExpenseWithPeople(
              expense.id,
              {
                date: dateStr,
                place: place.trim(),
                notes: notes || null,
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person.id, amount: amount }]
            );

            // Verify expense data is preserved
            expect(updatedExpense.date).toBe(dateStr);
            expect(updatedExpense.place).toBe(place.trim());
            expect(updatedExpense.amount).toBe(amount);
            expect(updatedExpense.type).toBe('Tax - Medical');
            expect(updatedExpense.method).toBe(validPaymentMethod);
          }
        ),
        { numRuns: 20 }
      );
    });

    test('Re-assignment updates existing associations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid expense amount
          fc.integer({ min: 100, max: 10000 }).map(cents => cents / 100),
          async (amount) => {
            // Create two test people
            const person1 = await peopleRepository.create({
              name: 'Person One',
              date_of_birth: null
            });
            testPeople.push(person1);

            const person2 = await peopleRepository.create({
              name: 'Person Two',
              date_of_birth: null
            });
            testPeople.push(person2);

            // Create a medical expense
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            
            const expense = await expenseService.createExpense({
              date: dateStr,
              place: 'Test Clinic',
              notes: null,
              amount: amount,
              type: 'Tax - Medical',
              method: validPaymentMethod
            });
            testExpenses.push(expense);

            // First assignment to person1
            await expenseService.updateExpenseWithPeople(
              expense.id,
              {
                date: dateStr,
                place: 'Test Clinic',
                notes: null,
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person1.id, amount: amount }]
            );

            // Verify first assignment
            let people = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(people).toHaveLength(1);
            expect(people[0].personId).toBe(person1.id);

            // Re-assign to person2
            await expenseService.updateExpenseWithPeople(
              expense.id,
              {
                date: dateStr,
                place: 'Test Clinic',
                notes: null,
                amount: amount,
                type: 'Tax - Medical',
                method: validPaymentMethod
              },
              [{ personId: person2.id, amount: amount }]
            );

            // Verify re-assignment
            people = await expensePeopleRepository.getPeopleForExpense(expense.id);
            expect(people).toHaveLength(1);
            expect(people[0].personId).toBe(person2.id);
            expect(people[0].amount).toBe(amount);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
