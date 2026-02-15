const { getDatabase } = require('../database/db');
const billingCycleHistoryService = require('./billingCycleHistoryService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Billing Cycle History Activity Logging
 * 
 * Feature: activity-log-coverage, Property 3: Billing cycle CRUD logging
 * 
 * These tests verify that billing cycle CRUD operations correctly log activity events:
 * - Creating billing cycles logs "billing_cycle_added" events
 * - Updating billing cycles logs "billing_cycle_updated" events with changes array
 * - Deleting billing cycles logs "billing_cycle_deleted" events
 * - Events include correct metadata (paymentMethodId, cycleEndDate, cardName)
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

const ENTITY_TYPE = 'billing_cycle';

describe('Billing Cycle History Activity Logging - Integration Tests', () => {
  let db;
  let testPaymentMethodId;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM credit_card_billing_cycles WHERE payment_method_id = ?`, [testPaymentMethodId]);
  }

  beforeAll(async () => {
    db = await getDatabase();

    const result = await runSql(db,
      `INSERT INTO payment_methods (display_name, type, credit_limit, current_balance, is_active, billing_cycle_day) VALUES (?, ?, ?, ?, ?, ?)`,
      ['Test Visa Billing', 'credit_card', 5000, 1000, 1, 15]
    );
    testPaymentMethodId = result.lastID;
  });

  afterAll(async () => {
    try {
      await runSql(db, `DELETE FROM credit_card_billing_cycles WHERE payment_method_id = ?`, [testPaymentMethodId]);
      await runSql(db, `DELETE FROM payment_methods WHERE id = ?`, [testPaymentMethodId]);
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    } catch (error) {
      console.warn('Test cleanup warning:', error.message);
    }
  });

  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Create Billing Cycle Event Logging', () => {
    it('should log billing_cycle_added event when creating a billing cycle', async () => {
      const data = {
        actual_statement_balance: 250.75,
        minimum_payment: 25.00,
        notes: 'Test cycle'
      };
      const referenceDate = new Date('2096-07-20');

      const cycle = await billingCycleHistoryService.createBillingCycle(testPaymentMethodId, data, referenceDate);

      expect(cycle).toBeDefined();
      expect(cycle.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'billing_cycle_added', cycle.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Added billing cycle');
      expect(event.user_action).toContain('Test Visa Billing');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.cycleEndDate).toBeDefined();
      expect(metadata.actualBalance).toBe(250.75);
      expect(metadata.cardName).toBe('Test Visa Billing');
    });
  });

  describe('Update Billing Cycle Event Logging', () => {
    it('should log billing_cycle_updated event with changes array when updating', async () => {
      const createData = {
        actual_statement_balance: 300.00,
        minimum_payment: 30.00,
        notes: 'Original notes'
      };
      const referenceDate = new Date('2096-08-20');
      const cycle = await billingCycleHistoryService.createBillingCycle(testPaymentMethodId, createData, referenceDate);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updateData = {
        actual_statement_balance: 350.50,
        minimum_payment: 35.00,
        notes: 'Updated notes'
      };
      const updated = await billingCycleHistoryService.updateBillingCycle(testPaymentMethodId, cycle.id, updateData);
      expect(updated).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'billing_cycle_updated', cycle.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Updated billing cycle');
      expect(event.user_action).toContain('Test Visa Billing');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.cycleEndDate).toBeDefined();
      expect(metadata.cardName).toBe('Test Visa Billing');
      expect(Array.isArray(metadata.changes)).toBe(true);

      const balanceChange = metadata.changes.find(c => c.field === 'actual_statement_balance');
      expect(balanceChange).toBeDefined();
      expect(balanceChange.from).toBe(300.00);
      expect(balanceChange.to).toBe(350.50);

      const paymentChange = metadata.changes.find(c => c.field === 'minimum_payment');
      expect(paymentChange).toBeDefined();
      expect(paymentChange.from).toBe(30.00);
      expect(paymentChange.to).toBe(35.00);

      const notesChange = metadata.changes.find(c => c.field === 'notes');
      expect(notesChange).toBeDefined();
      expect(notesChange.from).toBe('Original notes');
      expect(notesChange.to).toBe('Updated notes');
    });

    it('should log billing_cycle_updated with empty changes array when no fields change', async () => {
      const createData = {
        actual_statement_balance: 400.00,
        minimum_payment: 40.00,
        notes: 'Same notes'
      };
      const referenceDate = new Date('2096-09-20');
      const cycle = await billingCycleHistoryService.createBillingCycle(testPaymentMethodId, createData, referenceDate);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await billingCycleHistoryService.updateBillingCycle(testPaymentMethodId, cycle.id, {
        actual_statement_balance: 400.00,
        minimum_payment: 40.00,
        notes: 'Same notes'
      });

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'billing_cycle_updated', cycle.id);

      expect(event).toBeDefined();
      expect(Array.isArray(metadata.changes)).toBe(true);
      expect(metadata.changes.length).toBe(0);
    });
  });

  describe('Delete Billing Cycle Event Logging', () => {
    it('should log billing_cycle_deleted event when deleting a billing cycle', async () => {
      const createData = {
        actual_statement_balance: 500.00,
        minimum_payment: 50.00
      };
      const referenceDate = new Date('2096-10-20');
      const cycle = await billingCycleHistoryService.createBillingCycle(testPaymentMethodId, createData, referenceDate);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await billingCycleHistoryService.deleteBillingCycle(testPaymentMethodId, cycle.id);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'billing_cycle_deleted', cycle.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted billing cycle');
      expect(event.user_action).toContain('Test Visa Billing');

      expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
      expect(metadata.cycleEndDate).toBeDefined();
      expect(metadata.cardName).toBe('Test Visa Billing');
    });
  });

  describe('Property 3: Billing cycle CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 3: Billing cycle CRUD logging
     * 
     * **Validates: Requirements 3.1, 3.2, 3.3**
     */
    it('should log correct events for any billing cycle CRUD operation', async () => {
      let runCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            actual_statement_balance: fc.double({ min: 0.01, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            minimum_payment: fc.double({ min: 0.01, max: 500, noNaN: true }).map(n => Math.round(n * 100) / 100),
            notes: fc.string({ minLength: 0, maxLength: 50 })
          }),
          async (operation, input) => {
            await resetTestState();

            runCounter++;
            const year = 2050 + Math.floor(runCounter / 12);
            const month = (runCounter % 12) + 1;
            const referenceDate = new Date(`${year}-${String(month).padStart(2, '0')}-20`);

            const cycle = await billingCycleHistoryService.createBillingCycle(
              testPaymentMethodId,
              { actual_statement_balance: input.actual_statement_balance, minimum_payment: input.minimum_payment, notes: input.notes },
              referenceDate
            );

            let expectedEventType;
            let entityId = cycle.id;

            if (operation === 'create') {
              expectedEventType = 'billing_cycle_added';
            } else if (operation === 'update') {
              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              const newBalance = Math.round((input.actual_statement_balance + 10) * 100) / 100;
              await billingCycleHistoryService.updateBillingCycle(
                testPaymentMethodId, cycle.id,
                { actual_statement_balance: newBalance, minimum_payment: input.minimum_payment, notes: input.notes }
              );
              expectedEventType = 'billing_cycle_updated';
            } else {
              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await billingCycleHistoryService.deleteBillingCycle(testPaymentMethodId, cycle.id);
              expectedEventType = 'billing_cycle_deleted';
            }

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, entityId);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe(ENTITY_TYPE);
            expect(event.user_action).toBeTruthy();

            expect(metadata.paymentMethodId).toBe(testPaymentMethodId);
            expect(metadata.cycleEndDate).toBeDefined();
            expect(metadata.cardName).toBe('Test Visa Billing');

            if (operation === 'update') {
              expect(Array.isArray(metadata.changes)).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
