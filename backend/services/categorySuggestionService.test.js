/**
 * Tests for CategorySuggestionService
 * Tests intelligent category suggestion based on historical expense data
 */

const { getDatabase } = require('../database/db');
const categorySuggestionService = require('./categorySuggestionService');
const expenseRepository = require('../repositories/expenseRepository');

describe('CategorySuggestionService', () => {
  let db;
  const createdExpenseIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up created expenses
    for (const id of createdExpenseIds) {
      try {
        await new Promise((resolve) => {
          db.run('DELETE FROM expenses WHERE id = ?', [id], () => resolve());
        });
      } catch (e) {
        // Ignore errors
      }
    }
    createdExpenseIds.length = 0;
  });

  // Helper function to create test expenses
  async function createTestExpense(place, category, date = '2024-06-15') {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO expenses (date, place, type, amount, method, week) VALUES (?, ?, ?, ?, ?, ?)`,
        [date, place, category, 50.00, 'Cash', 3],
        function(err) {
          if (err) reject(err);
          else {
            createdExpenseIds.push(this.lastID);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  describe('getSuggestedCategory', () => {
    test('should return null for empty place', async () => {
      const result = await categorySuggestionService.getSuggestedCategory('');
      expect(result).toBeNull();
    });

    test('should return null for whitespace-only place', async () => {
      const result = await categorySuggestionService.getSuggestedCategory('   ');
      expect(result).toBeNull();
    });

    test('should return null for null place', async () => {
      const result = await categorySuggestionService.getSuggestedCategory(null);
      expect(result).toBeNull();
    });

    test('should return null for place with no history', async () => {
      const result = await categorySuggestionService.getSuggestedCategory('NonExistentPlace12345');
      expect(result).toBeNull();
    });

    test('should suggest most frequent category for a place', async () => {
      const testPlace = 'TestGroceryStore_' + Date.now();
      
      // Create 3 Groceries expenses and 1 Other expense
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Groceries', '2024-02-15');
      await createTestExpense(testPlace, 'Groceries', '2024-03-15');
      await createTestExpense(testPlace, 'Other', '2024-04-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result).toBeDefined();
      expect(result.category).toBe('Groceries');
      expect(result.count).toBe(3);
      expect(result.confidence).toBeCloseTo(0.75, 2); // 3/4 = 0.75
    });

    test('should return confidence as ratio between 0 and 1', async () => {
      const testPlace = 'TestConfidencePlace_' + Date.now();
      
      // Create 2 expenses of same category
      await createTestExpense(testPlace, 'Gas', '2024-01-15');
      await createTestExpense(testPlace, 'Gas', '2024-02-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result.confidence).toBe(1.0); // 2/2 = 1.0
    });

    test('should handle tie by using most recently used category', async () => {
      const testPlace = 'TestTiePlace_' + Date.now();
      
      // Create 2 Groceries and 2 Gas expenses
      // Gas is more recent
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Groceries', '2024-02-15');
      await createTestExpense(testPlace, 'Gas', '2024-03-15');
      await createTestExpense(testPlace, 'Gas', '2024-04-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result).toBeDefined();
      expect(result.count).toBe(2);
      // Should pick Gas as it's more recent
      expect(result.category).toBe('Gas');
    });

    test('should return count of the suggested category', async () => {
      const testPlace = 'TestCountPlace_' + Date.now();
      
      await createTestExpense(testPlace, 'Dining Out', '2024-01-15');
      await createTestExpense(testPlace, 'Dining Out', '2024-02-15');
      await createTestExpense(testPlace, 'Dining Out', '2024-03-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result.count).toBe(3);
    });

    test('should handle single expense history', async () => {
      const testPlace = 'TestSinglePlace_' + Date.now();
      
      await createTestExpense(testPlace, 'Entertainment', '2024-01-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result).toBeDefined();
      expect(result.category).toBe('Entertainment');
      expect(result.count).toBe(1);
      expect(result.confidence).toBe(1.0);
    });

    test('should handle place with many different categories', async () => {
      const testPlace = 'TestManyCategories_' + Date.now();
      
      // Create expenses with different categories
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Gas', '2024-02-15');
      await createTestExpense(testPlace, 'Other', '2024-03-15');
      await createTestExpense(testPlace, 'Groceries', '2024-04-15');
      await createTestExpense(testPlace, 'Groceries', '2024-05-15');

      const result = await categorySuggestionService.getSuggestedCategory(testPlace);

      expect(result.category).toBe('Groceries');
      expect(result.count).toBe(3);
      expect(result.confidence).toBeCloseTo(0.6, 2); // 3/5 = 0.6
    });
  });

  describe('getCategoryBreakdown', () => {
    test('should return empty array for empty place', async () => {
      const result = await categorySuggestionService.getCategoryBreakdown('');
      expect(result).toEqual([]);
    });

    test('should return empty array for whitespace-only place', async () => {
      const result = await categorySuggestionService.getCategoryBreakdown('   ');
      expect(result).toEqual([]);
    });

    test('should return empty array for null place', async () => {
      const result = await categorySuggestionService.getCategoryBreakdown(null);
      expect(result).toEqual([]);
    });

    test('should return empty array for place with no history', async () => {
      const result = await categorySuggestionService.getCategoryBreakdown('NonExistentPlace67890');
      expect(result).toEqual([]);
    });

    test('should return breakdown of all categories for a place', async () => {
      const testPlace = 'TestBreakdownPlace_' + Date.now();
      
      // Create expenses with different categories
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Groceries', '2024-02-15');
      await createTestExpense(testPlace, 'Gas', '2024-03-15');

      const result = await categorySuggestionService.getCategoryBreakdown(testPlace);

      expect(result.length).toBe(2);
      
      const groceriesEntry = result.find(r => r.category === 'Groceries');
      const gasEntry = result.find(r => r.category === 'Gas');

      expect(groceriesEntry).toBeDefined();
      expect(groceriesEntry.count).toBe(2);
      expect(groceriesEntry.lastUsed).toBeDefined();

      expect(gasEntry).toBeDefined();
      expect(gasEntry.count).toBe(1);
      expect(gasEntry.lastUsed).toBeDefined();
    });

    test('should include lastUsed date for each category', async () => {
      const testPlace = 'TestLastUsedPlace_' + Date.now();
      
      await createTestExpense(testPlace, 'Dining Out', '2024-03-20');
      await createTestExpense(testPlace, 'Dining Out', '2024-01-10');

      const result = await categorySuggestionService.getCategoryBreakdown(testPlace);

      expect(result.length).toBe(1);
      expect(result[0].category).toBe('Dining Out');
      expect(result[0].count).toBe(2);
      expect(result[0].lastUsed).toBe('2024-03-20');
    });

    test('should return categories sorted by count descending', async () => {
      const testPlace = 'TestSortedPlace_' + Date.now();
      
      // Create 3 Groceries, 2 Gas, 1 Other
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Groceries', '2024-02-15');
      await createTestExpense(testPlace, 'Groceries', '2024-03-15');
      await createTestExpense(testPlace, 'Gas', '2024-04-15');
      await createTestExpense(testPlace, 'Gas', '2024-05-15');
      await createTestExpense(testPlace, 'Other', '2024-06-15');

      const result = await categorySuggestionService.getCategoryBreakdown(testPlace);

      expect(result.length).toBe(3);
      expect(result[0].category).toBe('Groceries');
      expect(result[0].count).toBe(3);
      expect(result[1].category).toBe('Gas');
      expect(result[1].count).toBe(2);
      expect(result[2].category).toBe('Other');
      expect(result[2].count).toBe(1);
    });

    test('should handle single category', async () => {
      const testPlace = 'TestSingleCategoryPlace_' + Date.now();
      
      await createTestExpense(testPlace, 'Utilities', '2024-01-15');
      await createTestExpense(testPlace, 'Utilities', '2024-02-15');

      const result = await categorySuggestionService.getCategoryBreakdown(testPlace);

      expect(result.length).toBe(1);
      expect(result[0].category).toBe('Utilities');
      expect(result[0].count).toBe(2);
    });
  });

  describe('Integration with expenseRepository', () => {
    test('should work with real expense data', async () => {
      const testPlace = 'RealDataTestPlace_' + Date.now();
      
      // Create expenses using the repository pattern
      await createTestExpense(testPlace, 'Groceries', '2024-01-15');
      await createTestExpense(testPlace, 'Groceries', '2024-02-15');

      // Test suggestion
      const suggestion = await categorySuggestionService.getSuggestedCategory(testPlace);
      expect(suggestion.category).toBe('Groceries');

      // Test breakdown
      const breakdown = await categorySuggestionService.getCategoryBreakdown(testPlace);
      expect(breakdown.length).toBe(1);
      expect(breakdown[0].category).toBe('Groceries');
    });
  });
});
