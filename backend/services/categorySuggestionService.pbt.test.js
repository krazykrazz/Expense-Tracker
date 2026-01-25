const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const categorySuggestionService = require('./categorySuggestionService');
const { getDatabase } = require('../database/db');
const { CATEGORIES } = require('../utils/categories');

describe('CategorySuggestionService - Property-Based Tests', () => {
  let db;
  // Use a unique test run ID to avoid conflicts between test runs
  const testRunId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  beforeAll(async () => {
    db = await getDatabase();
    // Clean up any leftover test data from previous runs
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_SUGGEST_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_SUGGEST_%"', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    // Final cleanup
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses WHERE place LIKE "PBT_SUGGEST_%"', (err) => {
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


  // **Feature: smart-expense-entry, Property 2: Tie-Breaker Uses Most Recent**
  // **Validates: Requirements 4.2**
  test('Property 2: When categories have equal frequency, the most recently used is suggested', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        // Generate two different categories for the tie
        fc.tuple(
          fc.constantFrom(...CATEGORIES),
          fc.constantFrom(...CATEGORIES)
        ).filter(([cat1, cat2]) => cat1 !== cat2),
        // Generate the number of expenses per category (same for both to create a tie)
        fc.integer({ min: 1, max: 5 }),
        async ([category1, category2], countPerCategory) => {
          testCounter++;
          const placeName = `PBT_SUGGEST_TIE_${testRunId}_${testCounter}_${Date.now()}`;
          
          // Create expenses for category1 with older dates
          const baseDate = new Date('2025-01-01');
          for (let i = 0; i < countPerCategory; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + i);
            await createExpense({
              date: date.toISOString().split('T')[0],
              place: placeName,
              amount: 10.00,
              type: category1,
              week: 1,
              method: 'Cash'
            });
          }

          // Create expenses for category2 with newer dates (starting from day 100)
          for (let i = 0; i < countPerCategory; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + 100 + i);
            await createExpense({
              date: date.toISOString().split('T')[0],
              place: placeName,
              amount: 10.00,
              type: category2,
              week: 1,
              method: 'Cash'
            });
          }

          // Get the suggestion
          const suggestion = await categorySuggestionService.getSuggestedCategory(placeName);

          // Property: When there's a tie, the most recently used category should be suggested
          expect(suggestion).not.toBeNull();
          expect(suggestion.category).toBe(category2); // category2 has more recent dates
          expect(suggestion.count).toBe(countPerCategory);
          
          // Confidence should be 0.5 since both categories have equal frequency
          expect(suggestion.confidence).toBe(0.5);
        }
      ),
      pbtOptions()
    );
  }, 120000);

  // **Feature: smart-expense-entry, Property 3: New Place Defaults to Null**
  // **Validates: Requirements 2.2, 4.4**
  test('Property 3: Places with no history return null suggestion', async () => {
    let testCounter = 0;
    
    await fc.assert(
      fc.asyncProperty(
        // Generate random place names that definitely don't exist
        fc.string({ minLength: 5, maxLength: 30 }).map(s => 
          `PBT_SUGGEST_NEW_${testRunId}_${++testCounter}_${s.replace(/[^a-zA-Z0-9]/g, '')}`
        ),
        async (placeName) => {
          // Get the suggestion for a place that has never been used
          const suggestion = await categorySuggestionService.getSuggestedCategory(placeName);

          // Property: New places should return null
          expect(suggestion).toBeNull();
        }
      ),
      pbtOptions()
    );
  }, 60000);

  // Additional test: Empty/null place handling
  test('Property 3 (edge cases): Empty, null, and whitespace places return null', async () => {
    const emptyResult = await categorySuggestionService.getSuggestedCategory('');
    const nullResult = await categorySuggestionService.getSuggestedCategory(null);
    const whitespaceResult = await categorySuggestionService.getSuggestedCategory('   ');
    const undefinedResult = await categorySuggestionService.getSuggestedCategory(undefined);

    expect(emptyResult).toBeNull();
    expect(nullResult).toBeNull();
    expect(whitespaceResult).toBeNull();
    expect(undefinedResult).toBeNull();
  });

  // Test getCategoryBreakdown method
  test('getCategoryBreakdown returns correct breakdown for existing place', async () => {
    const placeName = `PBT_SUGGEST_BREAKDOWN_${testRunId}_${Date.now()}`;
    
    // Create some expenses
    await createExpense({
      date: '2025-01-01',
      place: placeName,
      amount: 10.00,
      type: 'Groceries',
      week: 1,
      method: 'Cash'
    });
    await createExpense({
      date: '2025-01-15',
      place: placeName,
      amount: 20.00,
      type: 'Groceries',
      week: 3,
      method: 'Cash'
    });
    await createExpense({
      date: '2025-01-10',
      place: placeName,
      amount: 15.00,
      type: 'Dining Out',
      week: 2,
      method: 'Cash'
    });

    const breakdown = await categorySuggestionService.getCategoryBreakdown(placeName);

    expect(breakdown.length).toBe(2);
    expect(breakdown[0].category).toBe('Groceries');
    expect(breakdown[0].count).toBe(2);
    expect(breakdown[0].lastUsed).toBe('2025-01-15');
    expect(breakdown[1].category).toBe('Dining Out');
    expect(breakdown[1].count).toBe(1);
    expect(breakdown[1].lastUsed).toBe('2025-01-10');
  });

  test('getCategoryBreakdown returns empty array for new place', async () => {
    const placeName = `PBT_SUGGEST_BREAKDOWN_NEW_${testRunId}_${Date.now()}`;
    const breakdown = await categorySuggestionService.getCategoryBreakdown(placeName);
    expect(breakdown).toEqual([]);
  });
});
