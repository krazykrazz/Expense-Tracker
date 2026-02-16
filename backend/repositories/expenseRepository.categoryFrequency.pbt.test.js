const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const expenseRepository = require('./expenseRepository');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('ExpenseRepository - Property-Based Tests for Category Frequency', () => {
  let db;
  // Use a unique test run ID to avoid conflicts between test runs
  const testRunId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  beforeAll(async () => {
    db = await getDatabase();
    // Clean up any leftover test data from previous runs
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    // Final cleanup
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_FREQ_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  /**
   * Helper to create an expense directly in the database
   */
  async function createExpense(expense) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, notes, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      db.run(sql, [
        expense.date,
        expense.place,
        expense.notes || null,
        expense.amount,
        expense.type,
        expense.week,
        expense.method
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
        // Generate a list of categories with varying frequencies
        fc.array(
          fc.constantFrom(...CATEGORIES),
          { minLength: 1, maxLength: 20 }
        ),
        async (categoryList) => {
          // Generate a truly unique place name for each property test iteration
          testCounter++;
          const placeName = `PBT_FREQ_${testRunId}_${testCounter}_${Date.now()}`;
          
          // Create expenses for each category in the list
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

          // Get the frequency results
          const frequencyResults = await expenseRepository.getCategoryFrequencyByPlace(placeName);

          // Calculate expected frequencies
          const expectedFrequencies = {};
          categoryList.forEach(cat => {
            expectedFrequencies[cat] = (expectedFrequencies[cat] || 0) + 1;
          });

          // Find the maximum frequency
          const maxFrequency = Math.max(...Object.values(expectedFrequencies));

          // Property: The first result should have the highest frequency
          expect(frequencyResults.length).toBeGreaterThan(0);
          expect(frequencyResults[0].count).toBe(maxFrequency);

          // Property: The first result's category should be one of the categories with max frequency
          const categoriesWithMaxFreq = Object.entries(expectedFrequencies)
            .filter(([_, count]) => count === maxFrequency)
            .map(([cat, _]) => cat);
          expect(categoriesWithMaxFreq).toContain(frequencyResults[0].category);

          // Property: All frequencies should be correctly counted
          frequencyResults.forEach(result => {
            expect(result.count).toBe(expectedFrequencies[result.category]);
          });

          // Property: Results should be sorted by count descending
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
        // Generate a category
        fc.constantFrom(...CATEGORIES),
        async (category) => {
          // Generate a truly unique place name for each property test iteration
          testCounter++;
          const basePlaceName = `PBT_FREQ_CASE_${testRunId}_${testCounter}_${Date.now()}`;
          
          // Create expense with original case
          await createExpense({
            date: '2025-01-01',
            place: basePlaceName,
            amount: 10.00,
            type: category,
            week: 1,
            method: 'Cash'
          });

          // Query with different cases
          const lowerResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName.toLowerCase());
          const upperResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName.toUpperCase());
          const originalResults = await expenseRepository.getCategoryFrequencyByPlace(basePlaceName);

          // Property: All case variations should return the same results
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

  // Test for empty/null place handling
  test('Empty or null place returns empty array', async () => {
    const emptyResult = await expenseRepository.getCategoryFrequencyByPlace('');
    const nullResult = await expenseRepository.getCategoryFrequencyByPlace(null);
    const whitespaceResult = await expenseRepository.getCategoryFrequencyByPlace('   ');

    expect(emptyResult).toEqual([]);
    expect(nullResult).toEqual([]);
    expect(whitespaceResult).toEqual([]);
  });

  // Test that last_used date is included and correct
  test('Property 1 (last_used): Results include correct last_used date', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...CATEGORIES),
        async (category) => {
          // Generate a truly unique place name for each property test iteration
          testCounter++;
          const placeName = `PBT_FREQ_DATE_${testRunId}_${testCounter}_${Date.now()}`;
          
          // Create multiple expenses with different dates
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

          // Property: last_used should be the most recent date for that category
          expect(results.length).toBe(1);
          expect(results[0].last_used).toBe('2025-01-20');
          expect(results[0].count).toBe(3);
        }
      ),
      dbPbtOptions()
    );
  }, 60000);
});
