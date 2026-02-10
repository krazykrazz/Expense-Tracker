const { getDatabase } = require('../database/db');
const budgetService = require('./budgetService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Budget Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (budget portion)
 * 
 * These tests verify that budget CRUD operations correctly log activity events:
 * - Creating budgets logs "budget_added" events
 * - Updating budgets logs "budget_updated" events
 * - Deleting budgets logs "budget_deleted" events
 * - Events include correct metadata (category, limit amount)
 * 
 * Validates: Requirements 6A.1, 6A.2, 6A.3, 6A.4, 6A.5
 */

describe('Budget Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2097; // Use future year to avoid conflicts
  const testMonth = 6;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test budgets
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM budgets WHERE year = ${testYear}`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test budgets
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM budgets WHERE year = ${testYear}`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Budget Creation Event Logging', () => {
    it('should log budget_added event when creating a budget', async () => {
      // Arrange
      const category = 'Groceries';
      const limit = 500.00;

      // Act
      const createdBudget = await budgetService.createBudget(testYear, testMonth, category, limit);

      // Assert - Verify budget was created
      expect(createdBudget).toBeDefined();
      expect(createdBudget.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const budgetEvent = events.find(e => 
        e.event_type === 'budget_added' && 
        e.entity_id === createdBudget.id
      );

      expect(budgetEvent).toBeDefined();
      expect(budgetEvent.entity_type).toBe('budget');
      expect(budgetEvent.user_action).toContain('Added budget');
      expect(budgetEvent.user_action).toContain('Groceries');
      expect(budgetEvent.user_action).toContain('500.00');

      // Assert - Verify metadata
      const metadata = JSON.parse(budgetEvent.metadata);
      expect(metadata.category).toBe('Groceries');
      expect(metadata.limit).toBe(500.00);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(testMonth);
    });

    it('should log budget_added event with different categories', async () => {
      // Arrange
      const categories = ['Dining Out', 'Entertainment', 'Gas'];

      for (const category of categories) {
        // Clean up before each iteration
        await new Promise((resolve, reject) => {
          db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Act
        const limit = 300.00;
        const createdBudget = await budgetService.createBudget(testYear, testMonth, category, limit);

        // Assert
        const events = await activityLogRepository.findRecent(10, 0);
        const budgetEvent = events.find(e => 
          e.event_type === 'budget_added' && 
          e.entity_id === createdBudget.id
        );

        expect(budgetEvent).toBeDefined();
        expect(budgetEvent.user_action).toContain(category);

        const metadata = JSON.parse(budgetEvent.metadata);
        expect(metadata.category).toBe(category);
        expect(metadata.limit).toBe(300.00);
      }
    });
  });

  describe('Budget Update Event Logging', () => {
    it('should log budget_updated event when updating a budget', async () => {
      // Arrange - Create a budget first
      const category = 'Groceries';
      const originalLimit = 400.00;
      const createdBudget = await budgetService.createBudget(testYear, testMonth, category, originalLimit);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the budget
      const newLimit = 600.00;
      await budgetService.updateBudget(createdBudget.id, newLimit);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const budgetEvent = events.find(e => 
        e.event_type === 'budget_updated' && 
        e.entity_id === createdBudget.id
      );

      expect(budgetEvent).toBeDefined();
      expect(budgetEvent.entity_type).toBe('budget');
      expect(budgetEvent.user_action).toContain('Updated budget');
      expect(budgetEvent.user_action).toContain('Groceries');
      expect(budgetEvent.user_action).toContain('600.00');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(budgetEvent.metadata);
      expect(metadata.category).toBe('Groceries');
      expect(metadata.limit).toBe(600.00);
    });

    it('should log budget_updated event with various limit changes', async () => {
      // Arrange - Create a budget
      const category = 'Dining Out';
      const originalLimit = 200.00;
      const createdBudget = await budgetService.createBudget(testYear, testMonth, category, originalLimit);

      const limitChanges = [250.00, 150.00, 500.00];

      for (const newLimit of limitChanges) {
        // Clear activity logs before each update
        await new Promise((resolve, reject) => {
          db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Act
        await budgetService.updateBudget(createdBudget.id, newLimit);

        // Assert
        const events = await activityLogRepository.findRecent(10, 0);
        const budgetEvent = events.find(e => 
          e.event_type === 'budget_updated' && 
          e.entity_id === createdBudget.id
        );

        expect(budgetEvent).toBeDefined();
        expect(budgetEvent.user_action).toContain(newLimit.toFixed(2));

        const metadata = JSON.parse(budgetEvent.metadata);
        expect(metadata.limit).toBe(newLimit);
      }
    });
  });

  describe('Budget Deletion Event Logging', () => {
    it('should log budget_deleted event when deleting a budget', async () => {
      // Arrange - Create a budget first
      const category = 'Entertainment';
      const limit = 350.00;
      const createdBudget = await budgetService.createBudget(testYear, testMonth, category, limit);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the budget
      const deleted = await budgetService.deleteBudget(createdBudget.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const budgetEvent = events.find(e => 
        e.event_type === 'budget_deleted' && 
        e.entity_id === createdBudget.id
      );

      expect(budgetEvent).toBeDefined();
      expect(budgetEvent.entity_type).toBe('budget');
      expect(budgetEvent.user_action).toContain('Deleted budget');
      expect(budgetEvent.user_action).toContain('Entertainment');
      expect(budgetEvent.user_action).toContain('350.00');

      // Assert - Verify metadata
      const metadata = JSON.parse(budgetEvent.metadata);
      expect(metadata.category).toBe('Entertainment');
      expect(metadata.limit).toBe(350.00);
    });

    it('should throw error when deleting non-existent budget', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act & Assert
      await expect(budgetService.deleteBudget(nonExistentId)).rejects.toThrow('Budget not found');

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const budgetEvent = events.find(e => 
        e.event_type === 'budget_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(budgetEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any budget CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            category: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Clothing', 'Gifts'),
            limit: fc.double({ min: 50, max: 2000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (operation, budgetData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM budgets WHERE year = ${testYear}`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let budgetId;
            let expectedEventType;

            // Perform the operation
            if (operation === 'create') {
              const budget = await budgetService.createBudget(
                testYear,
                testMonth,
                budgetData.category,
                budgetData.limit
              );
              budgetId = budget.id;
              expectedEventType = 'budget_added';
            } else if (operation === 'update') {
              // Create budget first
              const budget = await budgetService.createBudget(
                testYear,
                testMonth,
                budgetData.category,
                100.00
              );
              budgetId = budget.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update budget
              await budgetService.updateBudget(budgetId, budgetData.limit);
              expectedEventType = 'budget_updated';
            } else { // delete
              // Create budget first
              const budget = await budgetService.createBudget(
                testYear,
                testMonth,
                budgetData.category,
                budgetData.limit
              );
              budgetId = budget.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete budget
              await budgetService.deleteBudget(budgetId);
              expectedEventType = 'budget_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === budgetId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('budget');
            expect(event.user_action).toBeTruthy();
            expect(event.user_action).toContain(budgetData.category);
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.category).toBe(budgetData.category);
            expect(metadata.limit).toBeCloseTo(budgetData.limit, 2);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });

    it('should log events with correct metadata structure for all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            category: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment'),
            limit: fc.double({ min: 100, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (budgetData) => {
            // Clean up
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM budgets WHERE year = ${testYear}`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Create budget
            const budget = await budgetService.createBudget(
              testYear,
              testMonth,
              budgetData.category,
              budgetData.limit
            );

            // Verify create event metadata
            let events = await activityLogRepository.findRecent(10, 0);
            let event = events.find(e => e.event_type === 'budget_added');
            let metadata = JSON.parse(event.metadata);
            
            expect(metadata).toHaveProperty('category');
            expect(metadata).toHaveProperty('limit');
            expect(metadata).toHaveProperty('year');
            expect(metadata).toHaveProperty('month');
            expect(metadata.year).toBe(testYear);
            expect(metadata.month).toBe(testMonth);

            // Clear logs
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Update budget
            const newLimit = budgetData.limit + 100;
            await budgetService.updateBudget(budget.id, newLimit);

            // Verify update event metadata
            events = await activityLogRepository.findRecent(10, 0);
            event = events.find(e => e.event_type === 'budget_updated');
            metadata = JSON.parse(event.metadata);
            
            expect(metadata).toHaveProperty('category');
            expect(metadata).toHaveProperty('limit');
            expect(metadata.limit).toBe(newLimit);

            // Clear logs
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'budget'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Delete budget
            await budgetService.deleteBudget(budget.id);

            // Verify delete event metadata
            events = await activityLogRepository.findRecent(10, 0);
            event = events.find(e => e.event_type === 'budget_deleted');
            metadata = JSON.parse(event.metadata);
            
            expect(metadata).toHaveProperty('category');
            expect(metadata).toHaveProperty('limit');
            expect(metadata.category).toBe(budgetData.category);
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});
