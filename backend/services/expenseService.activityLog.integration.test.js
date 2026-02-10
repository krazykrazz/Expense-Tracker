const { getDatabase } = require('../database/db');
const expenseService = require('./expenseService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Expense Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (expense portion)
 * 
 * These tests verify that expense CRUD operations correctly log activity events:
 * - Creating expenses logs "expense_added" events
 * - Updating expenses logs "expense_updated" events
 * - Deleting expenses logs "expense_deleted" events
 * - Events include correct metadata (amount, category, date, place)
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

describe('Expense Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2096; // Use future year to avoid conflicts

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test expenses
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${testYear}'`, (err) => {
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
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test expenses
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM expenses WHERE strftime('%Y', date) = '${testYear}'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Expense Creation Event Logging', () => {
    it('should log expense_added event when creating an expense', async () => {
      // Arrange
      const expenseData = {
        date: `${testYear}-06-15`,
        place: 'Test Grocery Store',
        amount: 45.67,
        type: 'Groceries',
        method: 'Cash'
      };

      // Act
      const createdExpense = await expenseService.createExpense(expenseData);

      // Assert - Verify expense was created
      expect(createdExpense).toBeDefined();
      expect(createdExpense.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const expenseEvent = events.find(e => 
        e.event_type === 'expense_added' && 
        e.entity_id === createdExpense.id
      );

      expect(expenseEvent).toBeDefined();
      expect(expenseEvent.entity_type).toBe('expense');
      expect(expenseEvent.user_action).toContain('Added expense');
      expect(expenseEvent.user_action).toContain('Test Grocery Store');
      expect(expenseEvent.user_action).toContain('45.67');

      // Assert - Verify metadata
      const metadata = JSON.parse(expenseEvent.metadata);
      expect(metadata.amount).toBe(45.67);
      expect(metadata.category).toBe('Groceries');
      expect(metadata.date).toBe(`${testYear}-06-15`);
      expect(metadata.place).toBe('Test Grocery Store');
    });

    it('should log expense_added event with null place when place is not provided', async () => {
      // Arrange
      const expenseData = {
        date: `${testYear}-06-16`,
        amount: 25.00,
        type: 'Entertainment',
        method: 'Cash'
      };

      // Act
      const createdExpense = await expenseService.createExpense(expenseData);

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const expenseEvent = events.find(e => 
        e.event_type === 'expense_added' && 
        e.entity_id === createdExpense.id
      );

      expect(expenseEvent).toBeDefined();
      expect(expenseEvent.user_action).toContain('Unknown');

      const metadata = JSON.parse(expenseEvent.metadata);
      expect(metadata.place).toBeNull();
    });
  });

  describe('Expense Update Event Logging', () => {
    it('should log expense_updated event when updating an expense', async () => {
      // Arrange - Create an expense first
      const expenseData = {
        date: `${testYear}-06-17`,
        place: 'Original Place',
        amount: 50.00,
        type: 'Groceries',
        method: 'Cash'
      };
      const createdExpense = await expenseService.createExpense(expenseData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the expense
      const updateData = {
        date: `${testYear}-06-17`,
        place: 'Updated Place',
        amount: 75.50,
        type: 'Dining Out',
        method: 'Cash'
      };
      await expenseService.updateExpense(createdExpense.id, updateData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const expenseEvent = events.find(e => 
        e.event_type === 'expense_updated' && 
        e.entity_id === createdExpense.id
      );

      expect(expenseEvent).toBeDefined();
      expect(expenseEvent.entity_type).toBe('expense');
      expect(expenseEvent.user_action).toContain('Updated expense');
      expect(expenseEvent.user_action).toContain('Updated Place');
      expect(expenseEvent.user_action).toContain('75.50');

      // Assert - Verify metadata reflects updated values
      const metadata = JSON.parse(expenseEvent.metadata);
      expect(metadata.amount).toBe(75.50);
      expect(metadata.category).toBe('Dining Out');
      expect(metadata.place).toBe('Updated Place');
    });
  });

  describe('Expense Deletion Event Logging', () => {
    it('should log expense_deleted event when deleting an expense', async () => {
      // Arrange - Create an expense first
      const expenseData = {
        date: `${testYear}-06-18`,
        place: 'Test Restaurant',
        amount: 35.25,
        type: 'Dining Out',
        method: 'Cash'
      };
      const createdExpense = await expenseService.createExpense(expenseData);

      // Clear activity logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Delete the expense
      const deleted = await expenseService.deleteExpense(createdExpense.id);

      // Assert - Verify deletion was successful
      expect(deleted).toBe(true);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const expenseEvent = events.find(e => 
        e.event_type === 'expense_deleted' && 
        e.entity_id === createdExpense.id
      );

      expect(expenseEvent).toBeDefined();
      expect(expenseEvent.entity_type).toBe('expense');
      expect(expenseEvent.user_action).toContain('Deleted expense');
      expect(expenseEvent.user_action).toContain('Test Restaurant');
      expect(expenseEvent.user_action).toContain('35.25');

      // Assert - Verify metadata
      const metadata = JSON.parse(expenseEvent.metadata);
      expect(metadata.amount).toBe(35.25);
      expect(metadata.category).toBe('Dining Out');
      expect(metadata.place).toBe('Test Restaurant');
    });

    it('should not log event when deleting non-existent expense', async () => {
      // Arrange
      const nonExistentId = 999999;

      // Act
      const deleted = await expenseService.deleteExpense(nonExistentId);

      // Assert
      expect(deleted).toBe(false);

      // Verify no activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const expenseEvent = events.find(e => 
        e.event_type === 'expense_deleted' && 
        e.entity_id === nonExistentId
      );

      expect(expenseEvent).toBeUndefined();
    });
  });

  describe('Property 4: Entity CRUD Event Tracking (PBT)', () => {
    it('should log correct events for any expense CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            category: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas')
          }),
          async (operation, expenseData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let expenseId;
            let expectedEventType;

            // Perform the operation
            if (operation === 'create') {
              const expense = await expenseService.createExpense({
                date: `${testYear}-06-20`,
                place: expenseData.place,
                amount: expenseData.amount,
                type: expenseData.category,
                method: 'Cash'
              });
              expenseId = expense.id;
              expectedEventType = 'expense_added';
            } else if (operation === 'update') {
              // Create expense first
              const expense = await expenseService.createExpense({
                date: `${testYear}-06-20`,
                place: 'Original',
                amount: 10.00,
                type: 'Groceries',
                method: 'Cash'
              });
              expenseId = expense.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update expense
              await expenseService.updateExpense(expenseId, {
                date: `${testYear}-06-20`,
                place: expenseData.place,
                amount: expenseData.amount,
                type: expenseData.category,
                method: 'Cash'
              });
              expectedEventType = 'expense_updated';
            } else { // delete
              // Create expense first
              const expense = await expenseService.createExpense({
                date: `${testYear}-06-20`,
                place: expenseData.place,
                amount: expenseData.amount,
                type: expenseData.category,
                method: 'Cash'
              });
              expenseId = expense.id;

              // Clear logs
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Delete expense
              await expenseService.deleteExpense(expenseId);
              expectedEventType = 'expense_deleted';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.event_type === expectedEventType && 
              e.entity_id === expenseId
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('expense');
            expect(event.user_action).toBeTruthy();
            
            const metadata = JSON.parse(event.metadata);
            expect(metadata.amount).toBeCloseTo(expenseData.amount, 2);
            expect(metadata.category).toBe(expenseData.category);
            expect(metadata.place).toBe(expenseData.place);
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });
  });

  describe('Property 5: Insurance Status Change Logging', () => {
    /**
     * Feature: activity-log, Property 5: Insurance Status Change Logging
     * 
     * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
     * 
     * For any medical expense with an insurance status, changing the status to a different 
     * value should log exactly one event with both old and new status in metadata, but 
     * updating the expense without changing status should not log an insurance status change event.
     */
    it('should log insurance_status_changed event only when status actually changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
          fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
          fc.record({
            place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            amount: fc.double({ min: 0.01, max: 1000, noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          async (oldStatus, newStatus, expenseData) => {
            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Create a medical expense with insurance status
            const expense = await expenseService.createExpense({
              date: `${testYear}-07-01`,
              place: expenseData.place,
              amount: expenseData.amount,
              type: 'Tax - Medical',
              method: 'Cash',
              insurance_eligible: true,
              claim_status: oldStatus,
              original_cost: expenseData.amount
            });

            // Clear activity logs to isolate update event
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Update the expense with new status
            await expenseService.updateExpense(expense.id, {
              date: `${testYear}-07-01`,
              place: expenseData.place,
              amount: expenseData.amount,
              type: 'Tax - Medical',
              method: 'Cash',
              insurance_eligible: true,
              claim_status: newStatus,
              original_cost: expenseData.amount
            });

            // Retrieve logged events
            const events = await activityLogRepository.findRecent(10, 0);
            const statusChangeEvent = events.find(e => 
              e.event_type === 'insurance_status_changed' && 
              e.entity_id === expense.id
            );

            if (oldStatus === newStatus) {
              // Status didn't change - should NOT log insurance_status_changed event
              expect(statusChangeEvent).toBeUndefined();
            } else {
              // Status changed - should log insurance_status_changed event
              expect(statusChangeEvent).toBeDefined();
              expect(statusChangeEvent.entity_type).toBe('expense');
              expect(statusChangeEvent.user_action).toContain('Insurance status changed');
              expect(statusChangeEvent.user_action).toContain(oldStatus);
              expect(statusChangeEvent.user_action).toContain(newStatus);

              // Verify metadata
              const metadata = JSON.parse(statusChangeEvent.metadata);
              expect(metadata.previousStatus).toBe(oldStatus);
              expect(metadata.newStatus).toBe(newStatus);
              expect(metadata.place).toBe(expenseData.place);
              expect(metadata.amount).toBeCloseTo(expenseData.amount, 2);
            }

            // Verify expense_updated event is always logged
            const updateEvent = events.find(e => 
              e.event_type === 'expense_updated' && 
              e.entity_id === expense.id
            );
            expect(updateEvent).toBeDefined();
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test performance
      );
    });

    it('should log insurance_status_changed event when status changes from null to a value', async () => {
      // Arrange - Create expense without insurance eligibility
      const expenseData = {
        date: `${testYear}-07-02`,
        place: 'Dr. Smith',
        amount: 150.00,
        type: 'Tax - Medical',
        method: 'Cash',
        insurance_eligible: false
      };
      const expense = await expenseService.createExpense(expenseData);

      // Clear activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update to add insurance eligibility and status
      // Note: When insurance_eligible is set to true, claim_status defaults to 'not_claimed'
      // So we need to explicitly set it to test the transition
      await expenseService.updateExpense(expense.id, {
        ...expenseData,
        insurance_eligible: true,
        claim_status: 'in_progress',
        original_cost: 150.00
      });

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const statusChangeEvent = events.find(e => 
        e.event_type === 'insurance_status_changed' && 
        e.entity_id === expense.id
      );

      expect(statusChangeEvent).toBeDefined();
      const metadata = JSON.parse(statusChangeEvent.metadata);
      expect(metadata.previousStatus).toBeNull();
      expect(metadata.newStatus).toBe('in_progress');
    });

    it('should log insurance_status_changed event when status changes from a value to null', async () => {
      // Arrange - Create expense with insurance status
      const expenseData = {
        date: `${testYear}-07-03`,
        place: 'Dr. Jones',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'Cash',
        insurance_eligible: true,
        claim_status: 'paid',
        original_cost: 200.00
      };
      const expense = await expenseService.createExpense(expenseData);

      // Clear activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update to remove insurance eligibility (which clears claim_status)
      await expenseService.updateExpense(expense.id, {
        date: `${testYear}-07-03`,
        place: 'Dr. Jones',
        amount: 200.00,
        type: 'Tax - Medical',
        method: 'Cash',
        insurance_eligible: false
      });

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const statusChangeEvent = events.find(e => 
        e.event_type === 'insurance_status_changed' && 
        e.entity_id === expense.id
      );

      expect(statusChangeEvent).toBeDefined();
      const metadata = JSON.parse(statusChangeEvent.metadata);
      expect(metadata.previousStatus).toBe('paid');
      expect(metadata.newStatus).toBeNull();
    });

    it('should not log insurance_status_changed event when both old and new status are null', async () => {
      // Arrange - Create expense without insurance status
      const expenseData = {
        date: `${testYear}-07-04`,
        place: 'Pharmacy',
        amount: 50.00,
        type: 'Tax - Medical',
        method: 'Cash',
        insurance_eligible: false,
        claim_status: null
      };
      const expense = await expenseService.createExpense(expenseData);

      // Clear activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'expense'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update expense but keep status as null
      await expenseService.updateExpense(expense.id, {
        ...expenseData,
        amount: 55.00 // Change amount but not status
      });

      // Assert
      const events = await activityLogRepository.findRecent(10, 0);
      const statusChangeEvent = events.find(e => 
        e.event_type === 'insurance_status_changed' && 
        e.entity_id === expense.id
      );

      expect(statusChangeEvent).toBeUndefined();
    });
  });
});
