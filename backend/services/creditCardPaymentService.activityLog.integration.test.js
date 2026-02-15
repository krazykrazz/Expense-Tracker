const { getDatabase } = require('../database/db');
const creditCardPaymentService = require('./creditCardPaymentService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Credit Card Payment Activity Logging
 * 
 * Feature: activity-log-coverage, Property 1: Credit card payment CRUD logging
 * 
 * These tests verify that credit card payment CRUD operations correctly log activity events:
 * - Recording payments logs "credit_card_payment_added" events
 * - Deleting payments logs "credit_card_payment_deleted" events
 * - Deleting non-existent payments does not log
 * - Events include correct metadata (paymentMethodId, amount, payment_date, cardName)
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */

const ENTITY_TYPE = 'credit_card_payment';

describe('Credit Card Payment Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethodId;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM credit_card_payments WHERE payment_method_id = ?`, [testPaymentMethodId]);
    await runSql(db, `UPDATE payment_methods SET current_balance = 1000 WHERE id = ?`, [testPaymentMethodId]);
  }

  beforeAll(async () => {
    db = await getDatabase();

    const result = await runSql(db,
      `INSERT INTO payment_methods (display_name, type, credit_limit, current_balance, is_active) VALUES (?, ?, ?, ?, ?)`,
      ['Test Visa', 'credit_card', 5000, 1000, 1]
    );
    testPaymentMethodId = result.lastID;
  });

  afterAll(async () => {
    try {
      await runSql(db, `DELETE FROM credit_card_payments WHERE payment_method_id = ?`, [testPaymentMethodId]);
      await runSql(db, `DELETE FROM payment_methods WHERE id = ?`, [testPaymentMethodId]);
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Record Payment Event Logging', () => {
    it('should log credit_card_payment_added event when recording a payment', async () => {
      const payment = await creditCardPaymentService.recordPayment({
        payment_method_id: testPaymentMethodId,
        amount: 150.75,
        payment_date: '2096-06-15',
        notes: 'Test payment'
      });

      expect(payment).toBeDefined();
      expect(payment.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'credit_card_payment_added', payment.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Added credit card payment');
      expect(event.user_action).toContain('150.75');
      expect(event.user_action).toContain('Test Visa');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.amount).toBe(150.75);
      expect(metadata.payment_date).toBe('2096-06-15');
      expect(metadata.cardName).toBe('Test Visa');
    });
  });

  describe('Delete Payment Event Logging', () => {
    it('should log credit_card_payment_deleted event when deleting a payment', async () => {
      const payment = await creditCardPaymentService.recordPayment({
        payment_method_id: testPaymentMethodId,
        amount: 200.50,
        payment_date: '2096-07-10'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await creditCardPaymentService.deletePayment(payment.id);
      expect(deleted).toBe(true);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'credit_card_payment_deleted', payment.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted credit card payment');
      expect(event.user_action).toContain('200.50');
      expect(event.user_action).toContain('Test Visa');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.amount).toBe(200.50);
      expect(metadata.payment_date).toBe('2096-07-10');
      expect(metadata.cardName).toBe('Test Visa');
    });

    it('should not log event when deleting non-existent payment', async () => {
      const nonExistentId = 999999;
      const deleted = await creditCardPaymentService.deletePayment(nonExistentId);
      expect(deleted).toBe(false);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event } = findEventWithMetadata(events, 'credit_card_payment_deleted', nonExistentId);
      expect(event).toBeNull();
    });
  });

  describe('Property 1: Credit card payment CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 1: Credit card payment CRUD logging
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3**
     */
    it('should log correct events for any credit card payment CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('record', 'delete'),
          fc.record({
            amount: fc.double({ min: 0.01, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            payment_date: fc.integer({ min: 1, max: 28 }).map(d => `2096-06-${String(d).padStart(2, '0')}`)
          }),
          async (operation, paymentInput) => {
            await resetTestState();

            let expectedEventType;
            let entityId;

            if (operation === 'record') {
              const payment = await creditCardPaymentService.recordPayment({
                payment_method_id: testPaymentMethodId,
                amount: paymentInput.amount,
                payment_date: paymentInput.payment_date
              });
              entityId = payment.id;
              expectedEventType = 'credit_card_payment_added';
            } else {
              const payment = await creditCardPaymentService.recordPayment({
                payment_method_id: testPaymentMethodId,
                amount: paymentInput.amount,
                payment_date: paymentInput.payment_date
              });
              entityId = payment.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await creditCardPaymentService.deletePayment(payment.id);
              expectedEventType = 'credit_card_payment_deleted';
            }

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, entityId);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe(ENTITY_TYPE);
            expect(event.user_action).toBeTruthy();

            expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
            expect(metadata.amount).toBeCloseTo(paymentInput.amount, 2);
            expect(metadata.payment_date).toBe(paymentInput.payment_date);
            expect(metadata.cardName).toBe('Test Visa');
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
