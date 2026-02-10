const { getDatabase } = require('../database/db');
const fixedExpenseService = require('./fixedExpenseService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Fixed Expense Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (fixed_expense portion)
 * 
 * These tests verify that fixed expense CRUD operations correctly log activity events:
 * - Creating fixed expenses logs "fixed_expense_added" events
 * - Updating fixed expenses logs "fixed_expense_updated" events
 * - Deleting fixed expenses logs "fixed_expense_deleted" events
 * - Events include correct metadata (name, amount)
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

describe('Fixed Expense Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2096; // Use future year to avoid conflicts
  const testMonth = 6;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test fixed expenses
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM fixed_expenses WHERE year = ${testYear}`, (err) => {
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
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test fixed expenses
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM fixed_expenses WHERE year = ${testYear}`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Fixed Expense Creation Event Logging', () => {
    it('should log fixed_expense_added event when creating a fixed expense', async () => {
      // Arrange
      const fixedExpenseData = {
        year: testYear,
        month: testMonth,
        name: 'Test Rent Payment',
        amount: 1500.00,
        category: 'Housing',
        payment_type: 'Cash'
      };

      // Act
      const createdFixedExpense = await fixedExpenseService.createFixedExpense(fixedExpenseData);

      // Assert - Verify fixed expense was created
      expect(createdFixedExpense).toBeDefined();
      expect(createdFixedExpense.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const fixedExpenseEvent = events.find(e => 
        e.event_type === 'fixed_expense_added' && 
        e.entity_id === createdFixedExpense.id
      );

      expect(fixedExpenseEvent).toBeDefined();
      expect(fixedExpenseEvent.entity_type).toBe('fixed_expense');
      expect(fixedExpenseEvent.user_action).toContain('Added fixed expense');
      expect(fixedExpenseEvent.user_action).toContain('Test Rent Payment');
      expect(fixedExpenseEvent.user_action).toContain('1500.00');

      // Assert - Verify metadata
      const metadata = JSON.parse(fixedExpenseEvent.metadata);
      expect(metadata.name).toBe('Test Rent Payment');
      expect(metadata.amount).toBe(1500.00);
      expect(metadata.category).toBe('Housing');
      expect(metadata.payment_type).toBe('Cash');
    });

    it('should log fixed_expense_added event with correct metadata for different categories', async () => {
      // Arrange
      const fixedExpenseData = {
        year: testYear,
        month: testMonth,
        name: 'Internet Bill',
        amount: 75.99,
        category: 'Utilities',
        payment_type: 'Cash'
      };

      // Act
      const createdFixedExpense = await fixedExpenseService.createFixedExpense(fixedExpenseData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const fixedExpenseEvent = events.find(e => 
        e.event_type === 'fixed_expense_added' && 
        e.entity_id === createdFixedExpense.id
      );

      expect(fixedExpenseEvent).toBeDefined();
      expect(fixedExpenseEvent.user_action).toContain('Internet Bill');

      const metadata = JSON.parse(fixedExpenseEvent.metadata);
      expect(metadata.category).toBe('Utilities');
      expect(metadata.amount).toBe(75.99);
    });
  });

  describe('Fixed Expense Update Event Logging', () => {
    it('should log fixed_expense_updated event when updating a fixed expense', async () => {
      // Arrange - Create a fixed expense first
      const fixedExpenseData = {
        year: testYear,
        month: testMonth,
        name: 'Original Name',
        amount: 100.00,
        category: 'Housing',
        payment_type: 'Cash'
      };
      const createdFixedExpense = await fixedExpenseService.createFixedExpense(fixedExpenseData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the fixed expense
      const updateData = {
        name: 'Updated Name',
        amount: 150.50,
        category: 'Utilities',
        payment_type: 'Cash'
      };
      await fixedExpenseService.updateFixedExpense(createdFixedExpense.id, updateData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const fixedExpenseEvent = events.find(e => 
        e.event_type === 'fixed_expense_updated' && 
        e.entity_id === createdFixedExpense.id
      );

      expect(fixedExpenseEvent).toBeDefined();
      expect(fixedExpenseEvent.entity_type).toBe('fixed_expense');
      expect(fixedExpenseEvent.user_action).toContain('Updated fixed expense');
      expect(fixedExpenseEvent.user_action).toContain('Updated Name');
      expect(fixedExpenseEvent.user_action).toContain('150.50');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(fixedExpenseEvent.metadata);
      expect(metadata.name).toBe('Updated Name');
      expect(metadata.amount).toBe(150.50);
      expect(metadata.category).toBe('Utilities');
      expect(metadata.payment_type).toBe('Cash');
    });
  });

  describe('Fixed Expense Deletion Event Logging', () => {
    it('should log fixed_expense_deleted event when deleting a fixed expense', async () => {
      // Arrange - Create a fixed expense first
      const fixedExpenseData = {
        year: testYear,
        month: testMonth,
        name: 'Test Subscription',
        amount: 25.99,
        category: 'Entertainment',
        payment_type: 'Cash'
      };
      const createdFixedExpense = await fixedExpenseService.createFixedExpense(fixedExpenseData);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the fixed expense
      const deleted = await fixedExpenseService.deleteFixedExpense(createdFixedExpense.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const fixedExpenseEvent = events.find(e => 
        e.event_type === 'fixed_expense_deleted' && 
        e.entity_id === createdFixedExpense.id
      );

      expect(fixedExpenseEvent).toBeDefined();
      expect(fixedExpenseEvent.entity_type).toBe('fixed_expense');
      expect(fixedExpenseEvent.user_action).toContain('Deleted fixed expense');
      expect(fixedExpenseEvent.user_action).toContain('Test Subscription');
      expect(fixedExpenseEvent.user_action).toContain('25.99');

      // Assert - Verify metadata
      const metadata = JSON.parse(fixedExpenseEvent.metadata);
      expect(metadata.name).toBe('Test Subscription');
      expect(metadata.amount).toBe(25.99);
      expect(metadata.category).toBe('Entertainment');
      expect(metadata.payment_type).toBe('Cash');
    });

    it('should not log event when deleting non-existent fixed expense', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const deleted = await fixedExpenseService.deleteFixedExpense(nonExistentId);

      // Assert
      expect(deleted).toBe(false);

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const fixedExpenseEvent = events.find(e => 
        e.event_type === 'fixed_expense_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(fixedExpenseEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any fixed expense CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            category: fc.constantFrom('Housing', 'Utilities', 'Entertainment', 'Gas', 'Groceries', 'Dining Out'),
            payment_type: fc.constantFrom('Cash', 'Debit')
          }),
          async (operation, fixedExpenseData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let fixedExpenseId;
            let expectedEventType;

            // Perform the operation
            if (operation === 'create') {
              const fixedExpense = await fixedExpenseService.createFixedExpense({
                year: testYear,
                month: testMonth,
                name: fixedExpenseData.name,
                amount: fixedExpenseData.amount,
                category: fixedExpenseData.category,
                payment_type: fixedExpenseData.payment_type
              });
              fixedExpenseId = fixedExpense.id;
              expectedEventType = 'fixed_expense_added';
            } else if (operation === 'update') {
              // Create fixed expense first
              const fixedExpense = await fixedExpenseService.createFixedExpense({
                year: testYear,
                month: testMonth,
                name: 'Original',
                amount: 10.00,
                category: 'Housing',
                payment_type: 'Cash'
              });
              fixedExpenseId = fixedExpense.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update fixed expense
              await fixedExpenseService.updateFixedExpense(fixedExpenseId, {
                name: fixedExpenseData.name,
                amount: fixedExpenseData.amount,
                category: fixedExpenseData.category,
                payment_type: fixedExpenseData.payment_type
              });
              expectedEventType = 'fixed_expense_updated';
            } else { // delete
              // Create fixed expense first
              const fixedExpense = await fixedExpenseService.createFixedExpense({
                year: testYear,
                month: testMonth,
                name: fixedExpenseData.name,
                amount: fixedExpenseData.amount,
                category: fixedExpenseData.category,
                payment_type: fixedExpenseData.payment_type
              });
              fixedExpenseId = fixedExpense.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'fixed_expense'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete fixed expense
              await fixedExpenseService.deleteFixedExpense(fixedExpenseId);
              expectedEventType = 'fixed_expense_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === fixedExpenseId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('fixed_expense');
            expect(event.user_action).toBeTruthy();
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.name).toBe(fixedExpenseData.name.trim());
            expect(metadata.amount).toBeCloseTo(fixedExpenseData.amount, 2);
            expect(metadata.category).toBe(fixedExpenseData.category);
            expect(metadata.payment_type).toBe(fixedExpenseData.payment_type);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });
  });
});
