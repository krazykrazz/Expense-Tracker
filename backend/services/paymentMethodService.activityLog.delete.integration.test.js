const { getDatabase } = require('../database/db');
const paymentMethodService = require('./paymentMethodService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Payment Method Delete Activity Logging
 * 
 * Feature: credit-card-billing-fixes, Property 7: Payment method deletion produces activity log entry
 * 
 * These tests verify that payment method deletion correctly logs an activity event
 * with event_type `payment_method_deleted`, entity_type `payment_method`,
 * user_action describing the method name and type, and metadata with name, type, and ID.
 * 
 * Validates: Requirements 6.1
 */

describe('Payment Method Delete Activity Logging - Integration Tests', () => {
  let db;

  // Cleanup helpers
  async function cleanActivityLogs() {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'payment_method'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function cleanTestPaymentMethods() {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM payment_methods WHERE display_name LIKE 'TestDel %'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await cleanActivityLogs();
    await cleanTestPaymentMethods();
  });

  afterEach(async () => {
    await cleanActivityLogs();
    await cleanTestPaymentMethods();
  });

  describe('Delete Payment Method - Activity Log (Requirement 6.1)', () => {
    it('should log payment_method_deleted event when deleting a payment method', async () => {
      // Create a payment method to delete
      const created = await paymentMethodService.createPaymentMethod({
        type: 'cash',
        display_name: 'TestDel Cash Method',
        is_active: 1
      });

      // Clear logs from creation
      await cleanActivityLogs();

      // Delete the payment method
      const result = await paymentMethodService.deletePaymentMethod(created.id);
      expect(result.success).toBe(true);

      // Allow async activity logging to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'payment_method_deleted' &&
        e.entity_id === created.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('payment_method');
      expect(logEvent.user_action).toContain('Deleted payment method');
      expect(logEvent.user_action).toContain('TestDel Cash Method');
      expect(logEvent.user_action).toContain('cash');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.name).toBe('TestDel Cash Method');
      expect(metadata.type).toBe('cash');
      expect(metadata.id).toBe(created.id);
    });

    it('should log correct metadata for credit card deletion', async () => {
      const created = await paymentMethodService.createPaymentMethod({
        type: 'credit_card',
        display_name: 'TestDel Visa Card',
        full_name: 'TestDel Visa Full Name',
        credit_limit: 3000,
        billing_cycle_day: 15,
        payment_due_day: 10,
        is_active: 1
      });

      await cleanActivityLogs();

      const result = await paymentMethodService.deletePaymentMethod(created.id);
      expect(result.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'payment_method_deleted' &&
        e.entity_id === created.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.user_action).toContain('TestDel Visa Card');
      expect(logEvent.user_action).toContain('credit_card');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.name).toBe('TestDel Visa Card');
      expect(metadata.type).toBe('credit_card');
      expect(metadata.id).toBe(created.id);
    });

    it('should not log event when deletion fails (payment method not found)', async () => {
      await cleanActivityLogs();

      const result = await paymentMethodService.deletePaymentMethod(999999);
      expect(result.success).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'payment_method_deleted' &&
        e.entity_id === 999999
      );

      expect(logEvent).toBeUndefined();
    });
  });

  describe('Property 7: Payment method deletion produces activity log entry (PBT)', () => {
    /**
     * **Validates: Requirements 6.1**
     */
    it('should log correct event for any payment method type deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('cash', 'cheque', 'debit'),
          fc.stringMatching(/^[A-Z][a-z]{2,8}$/).map(s => `TestDel ${s}`),
          async (type, displayName) => {
            await cleanActivityLogs();
            await cleanTestPaymentMethods();

            // Create a payment method
            const created = await paymentMethodService.createPaymentMethod({
              type,
              display_name: displayName,
              is_active: 1
            });

            // Clear creation logs
            await cleanActivityLogs();

            // Delete it
            const result = await paymentMethodService.deletePaymentMethod(created.id);
            expect(result.success).toBe(true);

            await new Promise(resolve => setTimeout(resolve, 100));

            const events = await activityLogRepository.findRecent(10, 0);
            const logEvent = events.find(e =>
              e.event_type === 'payment_method_deleted' &&
              e.entity_id === created.id
            );

            expect(logEvent).toBeDefined();
            expect(logEvent.entity_type).toBe('payment_method');
            expect(logEvent.user_action).toContain(displayName);
            expect(logEvent.user_action).toContain(type);

            const metadata = JSON.parse(logEvent.metadata);
            expect(metadata.name).toBe(displayName);
            expect(metadata.type).toBe(type);
            expect(metadata.id).toBe(created.id);
          }
        ),
        { numRuns: 15 } // Reduced runs for integration test performance
      );
    });
  });
});
