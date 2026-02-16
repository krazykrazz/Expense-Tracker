const fc = require('fast-check');
const { getDatabase } = require('../database/db');
const budgetRepository = require('./budgetRepository');

describe('BudgetRepository - Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM budgets WHERE year = 9999', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Feature: budget-tracking-alerts, Property 1: Budget storage round-trip
   * Validates: Requirements 1.2
   */
  test('Property 1: Budget storage round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.constant(9999), // Use test year to avoid conflicts
          month: fc.integer({ min: 1, max: 12 }),
          category: fc.constantFrom('Groceries', 'Gas', 'Other'),
          limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        }),
        async (budget) => {
          // Store the budget
          const created = await budgetRepository.create(budget);
          
          // Retrieve the budget
          const retrieved = await budgetRepository.findById(created.id);
          
          // Property: Retrieved budget should have the same values
          expect(retrieved).not.toBeNull();
          expect(retrieved.year).toBe(budget.year);
          expect(retrieved.month).toBe(budget.month);
          expect(retrieved.category).toBe(budget.category);
          expect(Math.abs(retrieved.limit - budget.limit)).toBeLessThan(0.01);
          
          // Clean up
          await budgetRepository.delete(created.id);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  /**
   * Feature: budget-tracking-alerts, Property 2: Budget update replaces old value
   * Validates: Requirements 1.3
   */
  test('Property 2: Budget update replaces old value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.constant(9999),
          month: fc.integer({ min: 1, max: 12 }),
          category: fc.constantFrom('Groceries', 'Gas', 'Other'),
          initialLimit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          newLimit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        }),
        async (data) => {
          // Create a budget with initial limit
          const created = await budgetRepository.create({
            year: data.year,
            month: data.month,
            category: data.category,
            limit: data.initialLimit
          });
          
          // Update the budget with new limit
          const updated = await budgetRepository.updateLimit(created.id, data.newLimit);
          
          // Property: Updated budget should have new limit
          expect(updated).not.toBeNull();
          expect(Math.abs(updated.limit - data.newLimit)).toBeLessThan(0.01);
          
          // Verify by retrieving again
          const retrieved = await budgetRepository.findById(created.id);
          expect(Math.abs(retrieved.limit - data.newLimit)).toBeLessThan(0.01);
          
          // If limits are different, verify old limit is no longer present
          if (Math.abs(data.newLimit - data.initialLimit) > 0.01) {
            expect(Math.abs(updated.limit - data.initialLimit)).toBeGreaterThan(0.01);
          }
          
          // Clean up
          await budgetRepository.delete(created.id);
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  /**
   * Feature: budget-tracking-alerts, Property 3: Budget deletion removes data
   * Validates: Requirements 1.4
   */
  test('Property 3: Budget deletion removes data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.constant(9999),
          month: fc.integer({ min: 1, max: 12 }),
          category: fc.constantFrom('Groceries', 'Gas', 'Other'),
          limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        }),
        async (budget) => {
          // Create a budget
          const created = await budgetRepository.create(budget);
          
          // Verify it exists
          const beforeDelete = await budgetRepository.findById(created.id);
          expect(beforeDelete).not.toBeNull();
          
          // Delete the budget
          const deleted = await budgetRepository.delete(created.id);
          
          // Property: Budget should no longer be retrievable
          expect(deleted).toBe(true);
          const afterDelete = await budgetRepository.findById(created.id);
          expect(afterDelete).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);

  /**
   * Feature: budget-tracking-alerts, Property 4: Positive limit validation
   * Validates: Requirements 1.5
   */
  test('Property 4: Positive limit validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          year: fc.constant(9999),
          month: fc.integer({ min: 1, max: 12 }),
          category: fc.constantFrom('Groceries', 'Gas', 'Other'),
          limit: fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true })
        }),
        async (budget) => {
          // Property: System should accept limit if and only if it is positive and greater than zero
          if (budget.limit > 0) {
            // Should succeed
            const created = await budgetRepository.create(budget);
            expect(created).toBeDefined();
            expect(created.id).toBeDefined();
            
            // Clean up
            await budgetRepository.delete(created.id);
          } else {
            // Should fail (database constraint)
            await expect(budgetRepository.create(budget)).rejects.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000);
});

