const { getDatabase } = require('../database/db');
const creditCardPaymentController = require('./creditCardPaymentController');
const activityLogRepository = require('../repositories/activityLogRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');

/**
 * Integration Tests for Credit Card Payment Activity Logging
 * 
 * Feature: credit-card-billing-fixes, Property 5: Credit card payment operations produce activity log entries
 * 
 * These tests verify that credit card payment record and delete operations
 * correctly log activity events with proper event_type, entity_type, entity_id,
 * user_action, and metadata fields.
 * 
 * Validates: Requirements 4.1, 4.2
 */

describe('Credit Card Payment Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethod;

  // Helper to create mock Express req/res
  function createMockReqRes(params = {}, body = {}) {
    const req = {
      params,
      body,
      file: null
    };
    const res = {
      statusCode: null,
      responseBody: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.responseBody = data;
        return this;
      }
    };
    return { req, res };
  }

  // Helper to clean activity logs for credit_card_payment entity type
  async function cleanActivityLogs() {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'credit_card_payment'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Helper to clean test credit card payments
  async function cleanPayments() {
    if (testPaymentMethod) {
      return new Promise((resolve, reject) => {
        db.run(`DELETE FROM credit_card_payments WHERE payment_method_id = ?`, [testPaymentMethod.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  // Helper to clean test payment method
  async function cleanPaymentMethod() {
    if (testPaymentMethod) {
      return new Promise((resolve, reject) => {
        db.run(`DELETE FROM payment_methods WHERE id = ?`, [testPaymentMethod.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await cleanActivityLogs();
    await cleanPayments();
    await cleanPaymentMethod();

    // Create a test credit card payment method
    testPaymentMethod = await paymentMethodRepository.create({
      type: 'credit_card',
      display_name: 'Test Visa',
      full_name: 'Test Visa Card',
      credit_limit: 5000,
      current_balance: 1200,
      payment_due_day: 15,
      billing_cycle_day: 20,
      is_active: 1
    });
  });

  afterEach(async () => {
    await cleanActivityLogs();
    await cleanPayments();
    await cleanPaymentMethod();
  });

  describe('Record Payment - Activity Log (Requirement 4.1)', () => {
    it('should log credit_card_payment_recorded event when recording a payment', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { amount: 500, payment_date: '2025-06-15' }
      );

      await creditCardPaymentController.recordPayment(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.responseBody.success).toBe(true);
      const payment = res.responseBody.payment;

      // Allow async activity logging to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_payment_recorded' &&
        e.entity_id === payment.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('credit_card_payment');
      expect(logEvent.user_action).toContain('Recorded payment of');
      expect(logEvent.user_action).toContain('500.00');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain('2025-06-15');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.amount).toBe(500);
      expect(metadata.paymentDate).toBe('2025-06-15');
    });

    it('should format decimal amounts correctly in user_action', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { amount: 123.45, payment_date: '2025-07-01' }
      );

      await creditCardPaymentController.recordPayment(req, res);
      expect(res.statusCode).toBe(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_payment_recorded'
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.user_action).toContain('123.45');
    });
  });

  describe('Delete Payment - Activity Log (Requirement 4.2)', () => {
    it('should log credit_card_payment_deleted event when deleting a payment', async () => {
      // Record a payment first
      const { req: recordReq, res: recordRes } = createMockReqRes(
        { id: String(testPaymentMethod.id) },
        { amount: 250.75, payment_date: '2025-06-20' }
      );
      await creditCardPaymentController.recordPayment(recordReq, recordRes);
      expect(recordRes.statusCode).toBe(201);
      const payment = recordRes.responseBody.payment;

      // Clear activity logs to isolate delete event
      await cleanActivityLogs();

      // Delete the payment
      const { req: deleteReq, res: deleteRes } = createMockReqRes(
        { id: String(testPaymentMethod.id), paymentId: String(payment.id) }
      );
      await creditCardPaymentController.deletePayment(deleteReq, deleteRes);

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.responseBody.success).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_payment_deleted' &&
        e.entity_id === payment.id
      );

      expect(logEvent).toBeDefined();
      expect(logEvent.entity_type).toBe('credit_card_payment');
      expect(logEvent.user_action).toContain('Deleted payment of');
      expect(logEvent.user_action).toContain('250.75');
      expect(logEvent.user_action).toContain('Test Visa');
      expect(logEvent.user_action).toContain('2025-06-20');

      const metadata = JSON.parse(logEvent.metadata);
      expect(metadata.paymentMethodName).toBe('Test Visa');
      expect(metadata.amount).toBe(250.75);
      expect(metadata.paymentDate).toBe('2025-06-20');
    });

    it('should not log event when deleting non-existent payment', async () => {
      const { req, res } = createMockReqRes(
        { id: String(testPaymentMethod.id), paymentId: '999999' }
      );

      await creditCardPaymentController.deletePayment(req, res);
      expect(res.statusCode).toBe(404);

      await new Promise(resolve => setTimeout(resolve, 100));

      const events = await activityLogRepository.findRecent(10, 0);
      const logEvent = events.find(e =>
        e.event_type === 'credit_card_payment_deleted' &&
        e.entity_id === 999999
      );

      expect(logEvent).toBeUndefined();
    });
  });

  describe('Property 5: Credit card payment operations produce activity log entries (PBT)', () => {
    /**
     * **Validates: Requirements 4.1, 4.2**
     */
    it('should log correct event for any credit card payment record or delete operation', async () => {
      const fc = require('fast-check');

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('record', 'delete'),
          fc.record({
            amount: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 })
          }),
          async (operation, data) => {
            await cleanActivityLogs();
            await cleanPayments();

            const paymentDate = `${data.year}-${String(data.month).padStart(2, '0')}-${String(data.day).padStart(2, '0')}`;
            let paymentId;
            let expectedEventType;

            // Always record a payment first
            const { req: recordReq, res: recordRes } = createMockReqRes(
              { id: String(testPaymentMethod.id) },
              { amount: data.amount, payment_date: paymentDate }
            );
            await creditCardPaymentController.recordPayment(recordReq, recordRes);
            expect(recordRes.statusCode).toBe(201);
            paymentId = recordRes.responseBody.payment.id;

            if (operation === 'record') {
              expectedEventType = 'credit_card_payment_recorded';
            } else {
              // Clear logs, then delete
              await cleanActivityLogs();

              const { req: deleteReq, res: deleteRes } = createMockReqRes(
                { id: String(testPaymentMethod.id), paymentId: String(paymentId) }
              );
              await creditCardPaymentController.deletePayment(deleteReq, deleteRes);
              expect(deleteRes.statusCode).toBe(200);
              expectedEventType = 'credit_card_payment_deleted';
            }

            // Allow async logging to complete (increased for CI stability)
            await new Promise(resolve => setTimeout(resolve, 300));

            const events = await activityLogRepository.findRecent(10, 0);
            const logEvent = events.find(e =>
              e.event_type === expectedEventType &&
              e.entity_id === paymentId
            );

            expect(logEvent).toBeDefined();
            expect(logEvent.entity_type).toBe('credit_card_payment');
            expect(logEvent.user_action).toBeTruthy();
            expect(logEvent.user_action).toContain('Test Visa');

            const metadata = JSON.parse(logEvent.metadata);
            expect(metadata.paymentMethodName).toBe('Test Visa');
            expect(metadata.amount).toBeDefined();
            expect(metadata.paymentDate).toBe(paymentDate);
          }
        ),
        { numRuns: 15 } // Reduced runs for integration test performance
      );
    });
  });
});
