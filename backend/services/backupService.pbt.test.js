/**
 * Property-Based Tests for Backup Service
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const backupService = require('./backupService');
const budgetRepository = require('../repositories/budgetRepository');
const { DB_PATH } = require('../database/db');

describe('BackupService - Property-Based Tests', () => {
  const testBackupPath = path.join(__dirname, '../../test-pbt-backups');
  
  beforeAll(() => {
    // Create test backup directory
    if (!fs.existsSync(testBackupPath)) {
      fs.mkdirSync(testBackupPath, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test backup directory
    if (fs.existsSync(testBackupPath)) {
      const files = fs.readdirSync(testBackupPath);
      files.forEach(file => {
        fs.unlinkSync(path.join(testBackupPath, file));
      });
      fs.rmdirSync(testBackupPath);
    }
  });

  /**
   * Feature: budget-tracking-alerts, Property 16: Budget persistence immediacy
   * Validates: Requirements 7.1
   * 
   * For any budget creation or modification, querying for that budget immediately after 
   * the operation should return the updated value
   */
  test('Property 16: Budget persistence immediacy - changes are immediately queryable', async () => {
    // Define arbitrary for generating valid budgets
    const budgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom('Food', 'Gas', 'Other'),
      limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    });

    await fc.assert(
      fc.asyncProperty(budgetArbitrary, async (budget) => {
        let createdBudget = null;
        
        try {
          // Step 1: Create a budget
          createdBudget = await budgetRepository.create(budget);
          
          // Step 2: Immediately query for the budget
          const queriedBudget = await budgetRepository.findById(createdBudget.id);
          
          // Step 3: Verify the budget is immediately available with correct values
          expect(queriedBudget).not.toBeNull();
          expect(queriedBudget.id).toBe(createdBudget.id);
          expect(queriedBudget.year).toBe(budget.year);
          expect(queriedBudget.month).toBe(budget.month);
          expect(queriedBudget.category).toBe(budget.category);
          expect(queriedBudget.limit).toBeCloseTo(budget.limit, 2);
          
          // Step 4: Update the budget with a new limit
          const newLimit = Math.fround(budget.limit * 1.5);
          await budgetRepository.updateLimit(createdBudget.id, newLimit);
          
          // Step 5: Immediately query for the updated budget
          const updatedBudget = await budgetRepository.findById(createdBudget.id);
          
          // Step 6: Verify the update is immediately visible
          expect(updatedBudget).not.toBeNull();
          expect(updatedBudget.limit).toBeCloseTo(newLimit, 2);
          
          // Clean up
          await budgetRepository.delete(createdBudget.id);
          
          return true;
        } catch (error) {
          // Clean up on error
          if (createdBudget) {
            try {
              await budgetRepository.delete(createdBudget.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout for property-based test

  /**
   * Feature: budget-tracking-alerts, Property 15: Backup round-trip
   * Validates: Requirements 7.2, 7.3
   * 
   * For any set of budgets, backing up then restoring should result in budgets with identical values
   */
  test('Property 15: Backup round-trip - budgets are preserved after backup and restore', async () => {
    // Define arbitrary for generating valid budgets
    const budgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom('Food', 'Gas', 'Other'),
      limit: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true, noDefaultInfinity: true })
    });

    // Generate an array of 1-5 unique budgets (unique by year/month/category combination)
    const budgetsArrayArbitrary = fc.array(budgetArbitrary, { minLength: 1, maxLength: 5 })
      .map(budgets => {
        // Remove duplicates based on year/month/category
        const seen = new Set();
        return budgets.filter(budget => {
          const key = `${budget.year}-${budget.month}-${budget.category}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
      });

    await fc.assert(
      fc.asyncProperty(budgetsArrayArbitrary, async (budgets) => {
        // Skip if no budgets after deduplication
        if (budgets.length === 0) {
          return true;
        }

        const createdBudgets = [];
        
        try {
          // Step 1: Create budgets in the database
          for (const budget of budgets) {
            const created = await budgetRepository.create(budget);
            createdBudgets.push(created);
          }

          // Step 2: Perform backup
          const backupResult = await backupService.performBackup(testBackupPath);
          expect(backupResult.success).toBe(true);

          // Step 3: Delete all created budgets
          for (const budget of createdBudgets) {
            await budgetRepository.delete(budget.id);
          }

          // Verify budgets are deleted
          for (const budget of createdBudgets) {
            const found = await budgetRepository.findById(budget.id);
            expect(found).toBeNull();
          }

          // Step 4: Restore from backup
          const { initializeDatabase } = require('../database/db');
          fs.copyFileSync(backupResult.path, DB_PATH);
          await initializeDatabase();

          // Step 5: Verify all budgets are restored with identical values
          for (const originalBudget of createdBudgets) {
            const restored = await budgetRepository.findById(originalBudget.id);
            
            expect(restored).not.toBeNull();
            expect(restored.year).toBe(originalBudget.year);
            expect(restored.month).toBe(originalBudget.month);
            expect(restored.category).toBe(originalBudget.category);
            // Use toBeCloseTo for floating point comparison
            expect(restored.limit).toBeCloseTo(originalBudget.limit, 2);
          }

          // Clean up: delete restored budgets
          for (const budget of createdBudgets) {
            try {
              await budgetRepository.delete(budget.id);
            } catch (err) {
              // Budget might not exist, ignore
            }
          }

          return true;
        } catch (error) {
          // Clean up on error
          for (const budget of createdBudgets) {
            try {
              await budgetRepository.delete(budget.id);
            } catch (err) {
              // Ignore cleanup errors
            }
          }
          throw error;
        }
      }),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout for property-based test
});
