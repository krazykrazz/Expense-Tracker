const { getDatabase } = require('../database/db');
const investmentValueService = require('./investmentValueService');
const investmentService = require('./investmentService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Investment Value Activity Logging
 *
 * Feature: activity-log-coverage, Property 10: Investment value CRUD logging
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */

const ENTITY_TYPES = ['investment_value', 'investment'];

describe('Investment Value Activity Logging - Integration Tests', () => {
  let db;
  let testInvestmentId;
  const testInvestmentName = 'Test Investment For Value Logging';
  const testYear = 2096;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
    await runSql(db, `DELETE FROM investment_values WHERE investment_id IN (SELECT id FROM investments WHERE name LIKE 'Test Investment For Value%')`);
    await runSql(db, `DELETE FROM investments WHERE name LIKE 'Test Investment For Value%'`);
  }

  beforeAll(async () => { db = await getDatabase(); });

  beforeEach(async () => {
    await resetTestState();

    const investment = await investmentService.createInvestment({
      name: testInvestmentName, type: 'TFSA', initial_value: 10000
    });
    testInvestmentId = investment.id;

    await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
  });

  afterEach(() => resetTestState());

  describe('CreateOrUpdateValue Event Logging', () => {
    it('should log investment_value_updated event when creating a value entry', async () => {
      const result = await investmentValueService.createOrUpdateValue({
        investment_id: testInvestmentId, year: testYear, month: 6, value: 12500.50
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_value_updated');

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('investment_value');
      expect(event.user_action).toContain(testInvestmentName);
      expect(event.user_action).toContain('12500.50');

      expect(metadata.investmentId).toBe(testInvestmentId);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(6);
      expect(metadata.value).toBe(12500.50);
      expect(metadata.investmentName).toBe(testInvestmentName);
    });

    it('should log investment_value_updated event when upserting an existing value entry', async () => {
      await investmentValueService.createOrUpdateValue({
        investment_id: testInvestmentId, year: testYear, month: 7, value: 13000
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      await investmentValueService.createOrUpdateValue({
        investment_id: testInvestmentId, year: testYear, month: 7, value: 14000.75
      });

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_value_updated');

      expect(event).toBeDefined();
      expect(metadata.value).toBe(14000.75);
      expect(metadata.investmentName).toBe(testInvestmentName);
    });
  });

  describe('UpdateValue Event Logging', () => {
    it('should log investment_value_updated event when updating a value entry', async () => {
      const created = await investmentValueService.createOrUpdateValue({
        investment_id: testInvestmentId, year: testYear, month: 8, value: 15000
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const updated = await investmentValueService.updateValue(created.id, { value: 16500.25 });
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_value_updated', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('investment_value');
      expect(event.user_action).toContain('16500.25');

      expect(metadata.id).toBe(created.id);
      expect(metadata.value).toBe(16500.25);
    });

    it('should not log event when updating non-existent value entry', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const updated = await investmentValueService.updateValue(999999, { value: 20000 });
      expect(updated).toBeNull();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const valueEvents = events.filter(e => e.entity_type === 'investment_value');
      expect(valueEvents.length).toBe(0);
    });
  });

  describe('DeleteValue Event Logging', () => {
    it('should log investment_value_deleted event when deleting a value entry', async () => {
      const created = await investmentValueService.createOrUpdateValue({
        investment_id: testInvestmentId, year: testYear, month: 10, value: 18000
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const deleted = await investmentValueService.deleteValue(created.id);
      expect(deleted).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'investment_value_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('investment_value');
      expect(event.user_action).toContain(`${testYear}-10`);

      expect(metadata.id).toBe(created.id);
      expect(metadata.investmentId).toBe(testInvestmentId);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(10);
    });

    it('should not log event when deleting non-existent value entry', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const deleted = await investmentValueService.deleteValue(999999);
      expect(deleted).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const valueEvents = events.filter(e => e.entity_type === 'investment_value');
      expect(valueEvents.length).toBe(0);
    });
  });

  describe('Property 10: Investment value CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 10: Investment value CRUD logging
     * **Validates: Requirements 9.1, 9.2, 9.3**
     */
    it('should log correct events for any investment value CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('createOrUpdate', 'update', 'delete'),
          fc.record({
            value: fc.double({ min: 0, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            month: fc.integer({ min: 1, max: 12 })
          }),
          async (operation, data) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
            await runSql(db, `DELETE FROM investment_values WHERE investment_id = ?`, [testInvestmentId]);

            let entityId;
            let expectedEventType;

            if (operation === 'createOrUpdate') {
              const result = await investmentValueService.createOrUpdateValue({
                investment_id: testInvestmentId, year: testYear, month: data.month, value: data.value
              });
              entityId = result.id;
              expectedEventType = 'investment_value_updated';
            } else if (operation === 'update') {
              const created = await investmentValueService.createOrUpdateValue({
                investment_id: testInvestmentId, year: testYear, month: data.month, value: 50000
              });
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
              await investmentValueService.updateValue(created.id, { value: data.value });
              expectedEventType = 'investment_value_updated';
            } else {
              const created = await investmentValueService.createOrUpdateValue({
                investment_id: testInvestmentId, year: testYear, month: data.month, value: data.value
              });
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
              await investmentValueService.deleteValue(created.id);
              expectedEventType = 'investment_value_deleted';
            }

            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => e.event_type === expectedEventType && e.entity_type === 'investment_value');

            expect(event).toBeDefined();
            expect(event.user_action).toBeTruthy();

            const metadata = JSON.parse(event.metadata);

            if (operation === 'createOrUpdate') {
              expect(metadata.investmentId).toBe(testInvestmentId);
              expect(metadata.year).toBe(testYear);
              expect(metadata.month).toBe(data.month);
              expect(metadata.value).toBe(data.value);
              expect(metadata.investmentName).toBe(testInvestmentName);
            } else if (operation === 'update') {
              expect(metadata.id).toBe(entityId);
              expect(metadata.value).toBe(data.value);
            } else {
              expect(metadata.id).toBe(entityId);
              expect(metadata.investmentId).toBe(testInvestmentId);
              expect(metadata.year).toBe(testYear);
              expect(metadata.month).toBe(data.month);
            }
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});
