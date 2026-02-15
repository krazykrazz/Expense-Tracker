const { getDatabase } = require('../database/db');
const mortgagePaymentService = require('./mortgagePaymentService');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Mortgage Payment Activity Logging
 *
 * Feature: activity-log-coverage, Property 7: Mortgage payment CRUD logging
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

const ENTITY_TYPE = 'mortgage_payment';

describe('Mortgage Payment Activity Logging - Integration Tests', () => {
  let db;
  let testMortgageId;
  const testMortgageName = 'Test Mortgage For Logging';

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM mortgage_payments WHERE loan_id IN (SELECT id FROM loans WHERE name LIKE 'Test Mortgage%')`);
    await runSql(db, `DELETE FROM loan_balances WHERE loan_id IN (SELECT id FROM loans WHERE name LIKE 'Test Mortgage%')`);
    await runSql(db, `DELETE FROM loans WHERE name LIKE 'Test Mortgage%'`);
  }

  beforeAll(async () => { db = await getDatabase(); });

  beforeEach(async () => {
    await resetTestState();

    const mortgage = await loanService.createMortgage({
      name: testMortgageName,
      initial_balance: 300000,
      start_date: '2020-01-01',
      amortization_period: 25,
      term_length: 5,
      renewal_date: '2096-01-01',
      rate_type: 'fixed',
      payment_frequency: 'monthly'
    });
    testMortgageId = mortgage.id;

    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
  });

  afterEach(() => resetTestState());

  describe('Set Payment Event Logging', () => {
    it('should log mortgage_payment_set event when setting a payment amount', async () => {
      const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, 1500.00, '2020-06-01');

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'mortgage_payment_set', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain(testMortgageName);
      expect(event.user_action).toContain('1500.00');

      expect(metadata.mortgageId).toBe(testMortgageId);
      expect(metadata.paymentAmount).toBe(1500.00);
      expect(metadata.effectiveDate).toBe('2020-06-01');
      expect(metadata.mortgageName).toBe(testMortgageName);
    });
  });

  describe('Update Payment Event Logging', () => {
    it('should log mortgage_payment_updated event with changes array', async () => {
      const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, 1500.00, '2020-06-01');

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await mortgagePaymentService.updatePayment(created.id, 1800.00, '2020-07-01');
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'mortgage_payment_updated', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('1800.00');

      expect(metadata.paymentId).toBe(created.id);
      expect(metadata.paymentAmount).toBe(1800.00);
      expect(metadata.effectiveDate).toBe('2020-07-01');
      expect(metadata.changes).toBeDefined();
      expect(Array.isArray(metadata.changes)).toBe(true);

      const amountChange = metadata.changes.find(c => c.field === 'paymentAmount');
      expect(amountChange).toBeDefined();
      expect(amountChange.from).toBe(1500.00);
      expect(amountChange.to).toBe(1800.00);

      const dateChange = metadata.changes.find(c => c.field === 'effectiveDate');
      expect(dateChange).toBeDefined();
      expect(dateChange.from).toBe('2020-06-01');
      expect(dateChange.to).toBe('2020-07-01');
    });

    it('should not log event when updating non-existent payment', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await mortgagePaymentService.updatePayment(999999, 1000.00, '2020-06-01');
      expect(updated).toBeNull();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const mortgageEvents = events.filter(e => e.entity_type === ENTITY_TYPE);
      expect(mortgageEvents.length).toBe(0);
    });
  });

  describe('Delete Payment Event Logging', () => {
    it('should log mortgage_payment_deleted event when deleting a payment', async () => {
      const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, 2000.00, '2020-08-01');

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await mortgagePaymentService.deletePayment(created.id);
      expect(deleted).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'mortgage_payment_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('2000.00');

      expect(metadata.paymentId).toBe(created.id);
      expect(metadata.paymentAmount).toBe(2000.00);
      expect(metadata.effectiveDate).toBe('2020-08-01');
    });

    it('should not log event when deleting non-existent payment', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await mortgagePaymentService.deletePayment(999999);
      expect(deleted).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const mortgageEvents = events.filter(e => e.entity_type === ENTITY_TYPE);
      expect(mortgageEvents.length).toBe(0);
    });
  });

  describe('Property 7: Mortgage payment CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 7: Mortgage payment CRUD logging
     * **Validates: Requirements 7.1, 7.2, 7.3**
     */
    it('should log correct events for any mortgage payment CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('set', 'update', 'delete'),
          fc.record({
            paymentAmount: fc.double({ min: 100, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            day: fc.integer({ min: 1, max: 28 }),
            month: fc.integer({ min: 1, max: 12 })
          }),
          async (operation, data) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            const effectiveDate = `2020-${String(data.month).padStart(2, '0')}-${String(data.day).padStart(2, '0')}`;
            let entityId;
            let expectedEventType;

            if (operation === 'set') {
              const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, data.paymentAmount, effectiveDate);
              entityId = created.id;
              expectedEventType = 'mortgage_payment_set';
            } else if (operation === 'update') {
              const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, 500.00, '2020-01-15');
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await mortgagePaymentService.updatePayment(created.id, data.paymentAmount, effectiveDate);
              expectedEventType = 'mortgage_payment_updated';
            } else {
              const created = await mortgagePaymentService.setPaymentAmount(testMortgageId, data.paymentAmount, effectiveDate);
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await mortgagePaymentService.deletePayment(created.id);
              expectedEventType = 'mortgage_payment_deleted';
            }

            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, entityId);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe(ENTITY_TYPE);
            expect(event.user_action).toBeTruthy();

            expect(metadata.paymentAmount).toBe(data.paymentAmount);
            expect(metadata.effectiveDate).toBe(effectiveDate);

            if (operation === 'set') {
              expect(metadata.mortgageId).toBe(testMortgageId);
              expect(metadata.mortgageName).toBe(testMortgageName);
            }
            if (operation === 'update') {
              expect(Array.isArray(metadata.changes)).toBe(true);
            }
            if (operation === 'delete') {
              expect(metadata.paymentId).toBe(entityId);
            }

            if (operation !== 'delete') {
              await runSql(db, `DELETE FROM mortgage_payments WHERE id = ?`, [entityId]);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
