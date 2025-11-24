const fc = require('fast-check');
const recurringExpenseService = require('./recurringExpenseService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('RecurringExpenseService - Property-Based Tests for Category Persistence', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM recurring_expenses WHERE place LIKE "PBT_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // **Feature: expanded-expense-categories, Property 7: Recurring template category persistence**
  // **Validates: Requirements 4.1, 4.3, 4.4**
  test('Property 7: Recurring template category persistence - creating, updating, and retrieving template should preserve category', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two different random valid categories (initial and updated)
        fc.constantFrom(...CATEGORIES),
        fc.constantFrom(...CATEGORIES),
        // Generate random template data
        fc.record({
          place: fc.string({ minLength: 1, maxLength: 50 }).map(s => `PBT_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
          notes: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
          amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            .map(n => parseFloat(n.toFixed(2))),
          method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
          day_of_month: fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-end issues
          start_month: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
            .map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`),
          paused: fc.boolean()
        }),
        async (initialCategory, updatedCategory, templateData) => {
          // Create template with the initial category
          const templateToCreate = {
            ...templateData,
            type: initialCategory
          };

          // Create the template
          const createdTemplate = await recurringExpenseService.createRecurring(templateToCreate);
          
          // Retrieve the template by ID
          const retrievedTemplate = await recurringExpenseService.getRecurringExpenses();
          const foundTemplate = retrievedTemplate.find(t => t.id === createdTemplate.id);
          
          // Property 1: The retrieved template should have the same category as the created one
          expect(foundTemplate).toBeDefined();
          expect(foundTemplate.type).toBe(initialCategory);
          
          // Update the template with a new category
          const templateToUpdate = {
            ...templateData,
            type: updatedCategory
          };
          
          const updatedTemplate = await recurringExpenseService.updateRecurring(createdTemplate.id, templateToUpdate);
          
          // Retrieve the template again
          const retrievedAfterUpdate = await recurringExpenseService.getRecurringExpenses();
          const foundAfterUpdate = retrievedAfterUpdate.find(t => t.id === createdTemplate.id);
          
          // Property 2: The retrieved template should have the updated category
          expect(foundAfterUpdate).toBeDefined();
          expect(foundAfterUpdate.type).toBe(updatedCategory);
          expect(updatedTemplate.type).toBe(updatedCategory);
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  // **Feature: expanded-expense-categories, Property 8: Recurring template generation consistency**
  // **Validates: Requirements 4.2**
  test('Property 8: Recurring template generation consistency - generated expenses should have same category as template', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random valid category
        fc.constantFrom(...CATEGORIES),
        // Generate random template data
        fc.record({
          place: fc.string({ minLength: 1, maxLength: 50 }).map(s => `PBT_GEN_${s.replace(/[^a-zA-Z0-9]/g, '_')}`),
          notes: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
          amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
            .map(n => parseFloat(n.toFixed(2))),
          method: fc.constantFrom('Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
          day_of_month: fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-end issues
          paused: fc.constant(false) // Must be unpaused to generate expenses
        }),
        // Generate random year and month for generation
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        async (category, templateData, year, month) => {
          // Create start_month that is before or equal to the generation month
          const startYear = year - 1;
          const startMonth = `${startYear}-${String(month).padStart(2, '0')}`;
          
          // Create template with the category
          const templateToCreate = {
            ...templateData,
            type: category,
            start_month: startMonth
          };

          // Create the template
          const createdTemplate = await recurringExpenseService.createRecurring(templateToCreate);
          
          try {
            // Generate expenses for the specified month
            const generatedExpenses = await recurringExpenseService.generateExpensesForMonth(year, month);
            
            // Find the expense generated from our template
            const ourGeneratedExpense = generatedExpenses.find(e => e.recurring_id === createdTemplate.id);
            
            // Property: If an expense was generated, it should have the same category as the template
            if (ourGeneratedExpense) {
              expect(ourGeneratedExpense.type).toBe(category);
              expect(ourGeneratedExpense.type).toBe(createdTemplate.type);
            }
          } finally {
            // Clean up: delete the template and any generated expenses
            await recurringExpenseService.deleteRecurring(createdTemplate.id);
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM expenses WHERE place LIKE "PBT_GEN_%"', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
