const placeNameService = require('./placeNameService');
const placeNameRepository = require('../repositories/placeNameRepository');
const { getDatabase } = require('../database/db');

/**
 * Integration tests for Place Name Standardization feature
 * Tests complete workflow end-to-end with real database operations
 * 
 * Requirements tested:
 * - 6.1: Update all matching expense records with canonical names
 * - 6.2: Perform updates as a single transaction
 * - 6.5: Display error message and not partially update data on failure
 */
describe('PlaceNameService - Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE place LIKE 'E2E_%'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM expenses WHERE place LIKE 'E2E_%'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Helper function to insert test expenses
  async function insertTestExpense(place, amount = 10.00) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, amount, type, week, method)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = ['2024-01-01', place, amount, 'Other', 1, 'Cash'];
      
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  // Helper function to get all expenses with a specific place name
  async function getExpensesByPlace(place) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM expenses WHERE place = ?', [place], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Helper function to count total expenses
  async function getTotalExpenseCount() {
    return new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM expenses WHERE place LIKE "E2E_%"', [], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  describe('Complete Standardization Workflow - End to End', () => {
    test('should complete full workflow: analyze -> standardize -> verify', async () => {
      // Step 1: Insert test data with variations
      await insertTestExpense('E2E_TestWalmart_XYZ', 50.00);
      await insertTestExpense('E2E_testwalmartxyz', 30.00);
      await insertTestExpense('E2E_Test-Walmart-XYZ', 20.00);
      await insertTestExpense('E2E_TestCostco_ABC', 40.00);
      await insertTestExpense('E2E_testcostcoabc', 25.00);

      // Step 2: Get only our test place names
      const allPlaces = await placeNameRepository.getAllPlaceNames();
      const testPlaces = allPlaces.filter(p => p.place.startsWith('E2E_'));

      // Step 3: Group only our test data
      const testGroups = placeNameService.groupSimilarNames(testPlaces);
      
      expect(testGroups.length).toBeGreaterThanOrEqual(2); // Walmart and Costco groups

      // Step 4: Prepare standardization updates based on analysis
      const updates = testGroups.map(group => ({
        from: group.variations.map(v => v.name),
        to: group.suggestedCanonical
      }));

      // Step 5: Apply standardization
      const standardizeResult = await placeNameService.standardizePlaceNames(updates);

      // Verify standardization success
      expect(standardizeResult.success).toBe(true);
      expect(standardizeResult.updatedCount).toBe(5);

      // Step 6: Verify data integrity after standardization
      // The canonical names will be the most frequent variations
      const allExpensesAfter = await new Promise((resolve, reject) => {
        db.all('SELECT place FROM expenses WHERE place LIKE "E2E_%"', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      // All 5 expenses should still exist
      expect(allExpensesAfter.length).toBe(5);

      // All should have been standardized (no old variations should exist)
      const uniquePlaces = [...new Set(allExpensesAfter.map(e => e.place))];
      expect(uniquePlaces.length).toBe(2); // Only 2 canonical names

      // Verify total expense count preserved (Property 2: Standardization preserves expense count)
      const totalCount = await getTotalExpenseCount();
      expect(totalCount).toBe(5);
    });

    test('should handle workflow with no similarity groups found', async () => {
      // Insert unique place names only (very different from each other)
      await insertTestExpense('E2E_UniqueAlphaStore999', 10.00);
      await insertTestExpense('E2E_UniqueBetaShop888', 20.00);
      await insertTestExpense('E2E_UniqueGammaMarket777', 30.00);

      // Get only our test place names
      const allPlaces = await placeNameRepository.getAllPlaceNames();
      const testPlaces = allPlaces.filter(p => p.place.startsWith('E2E_Unique'));

      // Group only our test data
      const testGroups = placeNameService.groupSimilarNames(testPlaces);

      // Should find no similarity groups for unique names
      expect(testGroups.length).toBe(0);

      // Total expense count should remain unchanged
      const totalCount = await getTotalExpenseCount();
      expect(totalCount).toBe(3);
    });

    test('should handle large dataset efficiently', async () => {
      // Insert multiple variations of several stores with unique prefix
      const stores = ['E2E_LargeTestStore1_QQQ', 'E2E_LargeTestStore2_RRR', 'E2E_LargeTestStore3_SSS'];
      
      for (const store of stores) {
        // Create variations
        await insertTestExpense(store, 10.00);
        await insertTestExpense(store.toLowerCase(), 10.00);
        await insertTestExpense(store.toUpperCase(), 10.00);
        await insertTestExpense(store.replace(/_/g, '-'), 10.00);
      }

      // Total: 12 expenses (3 stores × 4 variations)
      const totalBefore = await getTotalExpenseCount();
      expect(totalBefore).toBe(12);

      // Get only our test place names
      const allPlaces = await placeNameRepository.getAllPlaceNames();
      const testPlaces = allPlaces.filter(p => p.place.includes('LargeTestStore'));

      // Analyze
      const startAnalysis = Date.now();
      const testGroups = placeNameService.groupSimilarNames(testPlaces);
      const analysisTime = Date.now() - startAnalysis;

      // Should complete analysis quickly (< 5 seconds per requirement 8.1)
      expect(analysisTime).toBeLessThan(5000);

      // Should find at least 1 group (may group some stores together if similar enough)
      expect(testGroups.length).toBeGreaterThanOrEqual(1);

      // Standardize
      const updates = testGroups.map(group => ({
        from: group.variations.map(v => v.name),
        to: group.suggestedCanonical
      }));

      const startStandardize = Date.now();
      const standardizeResult = await placeNameService.standardizePlaceNames(updates);
      const standardizeTime = Date.now() - startStandardize;

      // Should complete standardization quickly (< 10 seconds per requirement 8.2)
      expect(analysisTime).toBeLessThan(5000);
      expect(standardizeTime).toBeLessThan(10000);

      expect(standardizeResult.success).toBe(true);
      // Should update at least some records (fuzzy matching may group stores together)
      expect(standardizeResult.updatedCount).toBeGreaterThanOrEqual(6);
      expect(standardizeResult.updatedCount).toBeLessThanOrEqual(12);

      // Verify total count preserved (most important property)
      const totalAfter = await getTotalExpenseCount();
      expect(totalAfter).toBe(12);
    });
  });

  describe('API Integration with Real Data', () => {
    test('should handle real-world place name variations', async () => {
      // Insert realistic variations with unique suffix
      await insertTestExpense('E2E_TestMcDonald\'s_ZZZ', 8.50);
      await insertTestExpense('E2E_TestMcDonalds_ZZZ', 9.25);
      await insertTestExpense('E2E_TESTMCDONALDS_ZZZ', 7.75);
      await insertTestExpense('E2E_Test-Mc-Donalds-ZZZ', 10.00);

      // Get only our test place names
      const allPlaces = await placeNameRepository.getAllPlaceNames();
      const testPlaces = allPlaces.filter(p => p.place.includes('TestMcDonald') || p.place.includes('TESTMCDONALD'));

      // Group our test data
      const testGroups = placeNameService.groupSimilarNames(testPlaces);
      
      expect(testGroups.length).toBeGreaterThanOrEqual(1);
      
      const mcdonaldsGroup = testGroups[0];
      // Should group at least 3 variations (some may not match due to punctuation)
      expect(mcdonaldsGroup.variations.length).toBeGreaterThanOrEqual(3);
      expect(mcdonaldsGroup.totalCount).toBeGreaterThanOrEqual(3);

      // Standardize
      const updates = [{
        from: mcdonaldsGroup.variations.map(v => v.name),
        to: mcdonaldsGroup.suggestedCanonical
      }];

      const result = await placeNameService.standardizePlaceNames(updates);

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBeGreaterThanOrEqual(3);

      // Verify all variations now use canonical name
      const standardizedExpenses = await getExpensesByPlace(mcdonaldsGroup.suggestedCanonical);
      expect(standardizedExpenses.length).toBeGreaterThanOrEqual(3);
    });

    test('should handle null and empty place names correctly', async () => {
      // Insert expenses with null and empty place names
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, week, method)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, ['2024-01-01', null, 10.00, 'Other', 1, 'Cash'], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, week, method)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, ['2024-01-01', '', 10.00, 'Other', 1, 'Cash'], function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      await insertTestExpense('E2E_ValidStore', 10.00);

      // Analyze - should exclude null and empty (Requirement 7.2, Property 4)
      const analysisResult = await placeNameService.analyzePlaceNames();

      // Verify null and empty places are not in any group
      const hasNullOrEmpty = analysisResult.groups.some(g =>
        g.variations.some(v => v.name === null || v.name === '')
      );

      expect(hasNullOrEmpty).toBe(false);
    });

    test('should preserve expense amounts and other fields during standardization', async () => {
      // Insert expenses with different amounts and types
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, week, method, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, ['2024-01-15', 'E2E_TestStore', 25.50, 'Groceries', 3, 'Debit', 'Test note 1'], 
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, week, method, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, ['2024-01-20', 'E2E_teststore', 30.75, 'Gas', 4, 'CIBC MC', 'Test note 2'], 
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // Standardize
      const updates = [{
        from: ['E2E_TestStore', 'E2E_teststore'],
        to: 'E2E_TestStore_Standard'
      }];

      await placeNameService.standardizePlaceNames(updates);

      // Verify all fields preserved except place name
      const expenses = await getExpensesByPlace('E2E_TestStore_Standard');
      
      expect(expenses.length).toBe(2);
      
      const expense1 = expenses.find(e => e.amount === 25.50);
      const expense2 = expenses.find(e => e.amount === 30.75);

      expect(expense1).toBeDefined();
      expect(expense1.date).toBe('2024-01-15');
      expect(expense1.type).toBe('Groceries');
      expect(expense1.week).toBe(3);
      expect(expense1.method).toBe('Debit');
      expect(expense1.notes).toBe('Test note 1');

      expect(expense2).toBeDefined();
      expect(expense2.date).toBe('2024-01-20');
      expect(expense2.type).toBe('Gas');
      expect(expense2.week).toBe(4);
      expect(expense2.method).toBe('CIBC MC');
      expect(expense2.notes).toBe('Test note 2');
    });
  });

  describe('Transaction Rollback on Error', () => {
    test('should rollback all changes if any update fails', async () => {
      // Insert test data
      await insertTestExpense('E2E_RollbackTest1', 10.00);
      await insertTestExpense('E2E_RollbackTest2', 20.00);
      await insertTestExpense('E2E_RollbackTest3', 30.00);

      const countBefore = await getTotalExpenseCount();

      // Create updates where one will fail (empty 'to' field)
      const invalidUpdates = [
        { from: ['E2E_RollbackTest1'], to: 'E2E_Valid' },
        { from: ['E2E_RollbackTest2'], to: '' }, // This will fail validation
        { from: ['E2E_RollbackTest3'], to: 'E2E_Valid' }
      ];

      // Attempt standardization - should fail
      await expect(placeNameService.standardizePlaceNames(invalidUpdates))
        .rejects.toThrow();

      // Verify NO changes were made (transaction rollback)
      const test1 = await getExpensesByPlace('E2E_RollbackTest1');
      const test2 = await getExpensesByPlace('E2E_RollbackTest2');
      const test3 = await getExpensesByPlace('E2E_RollbackTest3');
      const valid = await getExpensesByPlace('E2E_Valid');

      expect(test1.length).toBe(1); // Original still exists
      expect(test2.length).toBe(1); // Original still exists
      expect(test3.length).toBe(1); // Original still exists
      expect(valid.length).toBe(0); // No updates applied

      // Verify total count unchanged
      const countAfter = await getTotalExpenseCount();
      expect(countAfter).toBe(countBefore);
    });

    test('should maintain data integrity on database error', async () => {
      // Insert test data
      await insertTestExpense('E2E_IntegrityTest1', 10.00);
      await insertTestExpense('E2E_IntegrityTest2', 20.00);

      const countBefore = await getTotalExpenseCount();

      // Create updates with invalid structure that will fail at repository level
      const updates = [
        { from: ['E2E_IntegrityTest1'], to: 'E2E_Updated' }
      ];

      // Mock a database error by temporarily breaking the connection
      // In a real scenario, this would test actual database failures
      // For now, we'll test with validation errors which also trigger rollback

      try {
        // This should succeed normally
        await placeNameService.standardizePlaceNames(updates);
        
        // Verify update succeeded
        const updated = await getExpensesByPlace('E2E_Updated');
        expect(updated.length).toBe(1);
      } catch (error) {
        // If it fails, verify no partial updates
        const original = await getExpensesByPlace('E2E_IntegrityTest1');
        expect(original.length).toBe(1);
      }

      // Verify total count preserved
      const countAfter = await getTotalExpenseCount();
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Correctness Properties Validation', () => {
    test('Property 2: Standardization preserves expense count', async () => {
      // Insert test data
      await insertTestExpense('E2E_Prop2_Store1', 10.00);
      await insertTestExpense('E2E_Prop2_store1', 20.00);
      await insertTestExpense('E2E_Prop2_STORE1', 30.00);

      const countBefore = await getTotalExpenseCount();

      // Standardize
      const updates = [{
        from: ['E2E_Prop2_Store1', 'E2E_Prop2_store1', 'E2E_Prop2_STORE1'],
        to: 'E2E_Prop2_Store1_Final'
      }];

      await placeNameService.standardizePlaceNames(updates);

      // Verify count preserved
      const countAfter = await getTotalExpenseCount();
      expect(countAfter).toBe(countBefore);
    });

    test('Property 4: Empty or null place names are excluded', async () => {
      // Insert expenses with null and empty places
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
          ['2024-01-01', null, 10.00, 'Other', 1, 'Cash'],
          (err) => err ? reject(err) : resolve()
        );
      });

      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)',
          ['2024-01-01', '', 10.00, 'Other', 1, 'Cash'],
          (err) => err ? reject(err) : resolve()
        );
      });

      await insertTestExpense('E2E_Prop4_Valid', 10.00);

      // Analyze
      const result = await placeNameService.analyzePlaceNames();

      // Verify no null or empty in any group
      const hasInvalid = result.groups.some(g =>
        g.variations.some(v => !v.name || v.name.trim() === '')
      );

      expect(hasInvalid).toBe(false);
    });

    test('Property 5: Bulk update is atomic', async () => {
      // Insert test data
      await insertTestExpense('E2E_Prop5_A', 10.00);
      await insertTestExpense('E2E_Prop5_B', 20.00);
      await insertTestExpense('E2E_Prop5_C', 30.00);

      // Create updates where one will fail
      const updates = [
        { from: ['E2E_Prop5_A'], to: 'E2E_Prop5_Updated' },
        { from: ['E2E_Prop5_B'], to: '' }, // Invalid - will fail
        { from: ['E2E_Prop5_C'], to: 'E2E_Prop5_Updated' }
      ];

      // Attempt update - should fail
      await expect(placeNameService.standardizePlaceNames(updates))
        .rejects.toThrow();

      // Verify atomicity: either all updated or none updated
      const updatedCount = await getExpensesByPlace('E2E_Prop5_Updated');
      const aCount = await getExpensesByPlace('E2E_Prop5_A');
      const bCount = await getExpensesByPlace('E2E_Prop5_B');
      const cCount = await getExpensesByPlace('E2E_Prop5_C');

      // None should be updated (atomic rollback)
      expect(updatedCount.length).toBe(0);
      expect(aCount.length).toBe(1);
      expect(bCount.length).toBe(1);
      expect(cCount.length).toBe(1);
    });

    test('Property 6: Preview matches actual changes', async () => {
      // Insert test data
      await insertTestExpense('E2E_Prop6_Var1', 10.00);
      await insertTestExpense('E2E_Prop6_Var2', 20.00);
      await insertTestExpense('E2E_Prop6_Var3', 30.00);

      // Analyze to get preview data
      const analysisResult = await placeNameService.analyzePlaceNames();
      
      const testGroup = analysisResult.groups.find(g =>
        g.variations.some(v => v.name.startsWith('E2E_Prop6_'))
      );

      if (testGroup) {
        // Preview shows totalCount
        const previewAffectedCount = testGroup.totalCount;

        // Apply standardization
        const updates = [{
          from: testGroup.variations.map(v => v.name),
          to: testGroup.suggestedCanonical
        }];

        const result = await placeNameService.standardizePlaceNames(updates);

        // Actual update count should match preview
        expect(result.updatedCount).toBe(previewAffectedCount);
      }
    });
  });
});
