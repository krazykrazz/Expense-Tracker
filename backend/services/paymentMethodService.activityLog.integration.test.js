const { getDatabase } = require('../database/db');
const paymentMethodService = require('./paymentMethodService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Payment Method Activity Logging
 * 
 * Feature: activity-log, Property 4: Entity CRUD Event Tracking (payment_method portion)
 * 
 * These tests verify that payment method CRUD operations correctly log activity events:
 * - Creating payment methods logs "payment_method_added" events
 * - Updating payment methods logs "payment_method_updated" events
 * - Deactivating payment methods logs "payment_method_deactivated" events
 * - Events include correct metadata (name, type)
 * 
 * Validates: Requirements 6B.1, 6B.2, 6B.3, 6B.4, 6B.5
 */

describe('Payment Method Activity Logging - Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    try {
      // Delete test activity logs
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test payment methods (only those created by tests)
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM payment_methods WHERE display_name LIKE 'Test Payment Method%'`, (err) => {
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
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete test payment methods
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM payment_methods WHERE display_name LIKE 'Test Payment Method%'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  describe('Payment Method Creation Event Logging', () => {
    it('should log payment_method_added event when creating a payment method', async () => {
      // Arrange
      const paymentMethodData = {
        type: 'cash',
        display_name: 'Test Payment Method Cash',
        is_active: 1
      };

      // Act
      const createdPaymentMethod = await paymentMethodService.createPaymentMethod(paymentMethodData);

      // Assert - Verify payment method was created
      expect(createdPaymentMethod).toBeDefined();
      expect(createdPaymentMethod.id).toBeDefined();

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentMethodEvent = events.find(e => 
        e.event_type === 'payment_method_added' && 
        e.entity_id === createdPaymentMethod.id
      );

      expect(paymentMethodEvent).toBeDefined();
      expect(paymentMethodEvent.entity_type).toBe('payment_method');
      expect(paymentMethodEvent.entity_id).toBe(createdPaymentMethod.id);
      expect(paymentMethodEvent.user_action).toContain('Added payment method');
      expect(paymentMethodEvent.user_action).toContain(paymentMethodData.display_name);

      // Assert - Verify metadata
      const metadata = JSON.parse(paymentMethodEvent.metadata);
      expect(metadata.name).toBe(paymentMethodData.display_name);
      expect(metadata.type).toBe(paymentMethodData.type);
    });

    it('should log payment_method_added event for credit card with full metadata', async () => {
      // Arrange
      const paymentMethodData = {
        type: 'credit_card',
        display_name: 'Test Payment Method Credit Card',
        full_name: 'Test Credit Card Full Name',
        credit_limit: 5000,
        billing_cycle_day: 15,
        payment_due_day: 10,
        is_active: 1
      };

      // Act
      const createdPaymentMethod = await paymentMethodService.createPaymentMethod(paymentMethodData);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentMethodEvent = events.find(e => 
        e.event_type === 'payment_method_added' && 
        e.entity_id === createdPaymentMethod.id
      );

      expect(paymentMethodEvent).toBeDefined();
      expect(paymentMethodEvent.entity_type).toBe('payment_method');

      // Assert - Verify metadata includes name and type
      const metadata = JSON.parse(paymentMethodEvent.metadata);
      expect(metadata.name).toBe(paymentMethodData.display_name);
      expect(metadata.type).toBe(paymentMethodData.type);
    });
  });

  describe('Payment Method Update Event Logging', () => {
    it('should log payment_method_updated event when updating a payment method', async () => {
      // Arrange - Create a payment method first
      const initialData = {
        type: 'debit',
        display_name: 'Test Payment Method Debit',
        is_active: 1
      };
      const createdPaymentMethod = await paymentMethodService.createPaymentMethod(initialData);

      // Clear activity logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Update the payment method
      const updateData = {
        type: 'debit',
        display_name: 'Test Payment Method Debit Updated',
        is_active: 1
      };
      const updatedPaymentMethod = await paymentMethodService.updatePaymentMethod(
        createdPaymentMethod.id,
        updateData
      );

      // Assert - Verify payment method was updated
      expect(updatedPaymentMethod).toBeDefined();
      expect(updatedPaymentMethod.display_name).toBe(updateData.display_name);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentMethodEvent = events.find(e => 
        e.event_type === 'payment_method_updated' && 
        e.entity_id === createdPaymentMethod.id
      );

      expect(paymentMethodEvent).toBeDefined();
      expect(paymentMethodEvent.entity_type).toBe('payment_method');
      expect(paymentMethodEvent.entity_id).toBe(createdPaymentMethod.id);
      expect(paymentMethodEvent.user_action).toContain('Updated payment method');
      expect(paymentMethodEvent.user_action).toContain(updateData.display_name);

      // Assert - Verify metadata
      const metadata = JSON.parse(paymentMethodEvent.metadata);
      expect(metadata.name).toBe(updateData.display_name);
      expect(metadata.type).toBe(updateData.type);
    });
  });

  describe('Payment Method Deactivation Event Logging', () => {
    it('should log payment_method_deactivated event when deactivating a payment method', async () => {
      // Arrange - Create two payment methods (need at least 2 to deactivate one)
      const paymentMethod1Data = {
        type: 'cash',
        display_name: 'Test Payment Method Cash 1',
        is_active: 1
      };
      const paymentMethod2Data = {
        type: 'debit',
        display_name: 'Test Payment Method Debit 2',
        is_active: 1
      };
      
      const createdPaymentMethod1 = await paymentMethodService.createPaymentMethod(paymentMethod1Data);
      const createdPaymentMethod2 = await paymentMethodService.createPaymentMethod(paymentMethod2Data);

      // Clear activity logs to isolate deactivation event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Deactivate the first payment method
      const deactivatedPaymentMethod = await paymentMethodService.setPaymentMethodActive(
        createdPaymentMethod1.id,
        false
      );

      // Assert - Verify payment method was deactivated
      expect(deactivatedPaymentMethod).toBeDefined();
      expect(deactivatedPaymentMethod.is_active).toBe(0);

      // Assert - Verify activity log event was created
      const events = await activityLogRepository.findRecent(10, 0);
      const paymentMethodEvent = events.find(e => 
        e.event_type === 'payment_method_deactivated' && 
        e.entity_id === createdPaymentMethod1.id
      );

      expect(paymentMethodEvent).toBeDefined();
      expect(paymentMethodEvent.entity_type).toBe('payment_method');
      expect(paymentMethodEvent.entity_id).toBe(createdPaymentMethod1.id);
      expect(paymentMethodEvent.user_action).toContain('Deactivated payment method');
      expect(paymentMethodEvent.user_action).toContain(paymentMethod1Data.display_name);

      // Assert - Verify metadata
      const metadata = JSON.parse(paymentMethodEvent.metadata);
      expect(metadata.name).toBe(paymentMethod1Data.display_name);
      expect(metadata.type).toBe(paymentMethod1Data.type);
    });

    it('should NOT log event when activating a payment method', async () => {
      // Arrange - Create a deactivated payment method
      const paymentMethodData = {
        type: 'cheque',
        display_name: 'Test Payment Method Cheque',
        is_active: 0
      };
      const createdPaymentMethod = await paymentMethodService.createPaymentMethod(paymentMethodData);

      // Clear activity logs to isolate activation event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Act - Activate the payment method
      await paymentMethodService.setPaymentMethodActive(createdPaymentMethod.id, true);

      // Assert - Verify NO activity log event was created for activation
      const events = await activityLogRepository.findRecent(10, 0);
      const activationEvent = events.find(e => 
        e.entity_id === createdPaymentMethod.id &&
        e.event_type === 'payment_method_activated'
      );

      expect(activationEvent).toBeUndefined();
    });
  });

  describe('Property-Based Test: Payment Method CRUD Event Tracking', () => {
    let pbtRunCounter = 0;

    it('should log correct events for any payment method CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('cash', 'cheque', 'debit'),
          fc.constantFrom('create', 'update', 'deactivate'),
          fc.record({
            displayName: fc.constant(null), // Will be overridden with unique name
          }),
          async (type, operation, _data) => {
            // Generate a unique display name per iteration to avoid duplicate collisions
            pbtRunCounter++;
            const uniqueDisplayName = `Test PM ${pbtRunCounter}_${Date.now()}`;

            // Clean up before test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            let paymentMethodId;
            let expectedEventType;
            let expectedDisplayName = uniqueDisplayName;

            if (operation === 'create') {
              // Create operation
              const paymentMethodData = {
                type,
                display_name: uniqueDisplayName,
                is_active: 1
              };
              const created = await paymentMethodService.createPaymentMethod(paymentMethodData);
              paymentMethodId = created.id;
              expectedEventType = 'payment_method_added';
            } else if (operation === 'update') {
              // Create first, then update
              const initialData = {
                type,
                display_name: uniqueDisplayName,
                is_active: 1
              };
              const created = await paymentMethodService.createPaymentMethod(initialData);
              paymentMethodId = created.id;

              // Clear logs before update
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Update
              const updateData = {
                type,
                display_name: `${uniqueDisplayName} Updated`,
                is_active: 1
              };
              await paymentMethodService.updatePaymentMethod(created.id, updateData);
              expectedEventType = 'payment_method_updated';
              expectedDisplayName = updateData.display_name;
            } else {
              // Deactivate operation - need at least 2 payment methods
              const pm1Data = {
                type,
                display_name: uniqueDisplayName,
                is_active: 1
              };
              const pm2Data = {
                type: 'cash',
                display_name: `${uniqueDisplayName} Extra`,
                is_active: 1
              };
              const created1 = await paymentMethodService.createPaymentMethod(pm1Data);
              await paymentMethodService.createPaymentMethod(pm2Data);
              paymentMethodId = created1.id;

              // Clear logs before deactivate
              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Deactivate
              await paymentMethodService.setPaymentMethodActive(created1.id, false);
              expectedEventType = 'payment_method_deactivated';
            }

            // Retrieve the logged event
            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => 
              e.entity_id === paymentMethodId && 
              e.event_type === expectedEventType
            );

            // Verify event properties
            expect(event).toBeDefined();
            expect(event.entity_type).toBe('payment_method');
            expect(event.entity_id).toBe(paymentMethodId);
            expect(event.user_action).toContain(expectedDisplayName);

            // Verify metadata
            const metadata = JSON.parse(event.metadata);
            expect(metadata.name).toBe(expectedDisplayName);
            expect(metadata.type).toBe(type);

            // Clean up after test
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM payment_methods WHERE display_name LIKE 'Test PM%'`, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        ),
        { numRuns: 20 } // Reduced runs for integration test
      );
    });
  });
});
