const { getDatabase } = require('../database/db');
const incomeService = require('./incomeService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Income Service Activity Logging
 *
 * Feature: activity-log-coverage, Property 4: Income source CRUD logging
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

const ENTITY_TYPE = 'income_source';
const TEST_YEAR = 2096;

describe('Income Service Activity Logging - Integration Tests', () => {
  let db;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM income_sources WHERE year = ?`, [TEST_YEAR]);
  }

  beforeAll(async () => { db = await getDatabase(); });
  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Create Income Source Event Logging', () => {
    it('should log income_source_added event when creating an income source', async () => {
      const created = await incomeService.createIncomeSource({
        year: TEST_YEAR, month: 3, name: 'Test Salary', amount: 5000.50, category: 'Salary'
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'income_source_added', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Added income source');
      expect(event.user_action).toContain('Test Salary');
      expect(event.user_action).toContain('5000.50');

      expect(metadata.name).toBe('Test Salary');
      expect(metadata.amount).toBe(5000.50);
      expect(metadata.category).toBe('Salary');
      expect(metadata.year).toBe(TEST_YEAR);
      expect(metadata.month).toBe(3);
    });
  });

  describe('Update Income Source Event Logging', () => {
    it('should log income_source_updated event with changes array', async () => {
      const created = await incomeService.createIncomeSource({
        year: TEST_YEAR, month: 4, name: 'Original Name', amount: 3000, category: 'Salary'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await incomeService.updateIncomeSource(created.id, {
        name: 'Updated Name', amount: 3500, category: 'Other'
      });
      expect(updated).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'income_source_updated', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Updated income source');
      expect(event.user_action).toContain('Updated Name');

      expect(metadata.name).toBe('Updated Name');
      expect(metadata.amount).toBe(3500);
      expect(metadata.category).toBe('Other');
      expect(metadata.changes).toBeDefined();
      expect(metadata.changes.length).toBe(3);

      const nameChange = metadata.changes.find(c => c.field === 'name');
      expect(nameChange.from).toBe('Original Name');
      expect(nameChange.to).toBe('Updated Name');

      const amountChange = metadata.changes.find(c => c.field === 'amount');
      expect(amountChange.from).toBe(3000);
      expect(amountChange.to).toBe(3500);

      const categoryChange = metadata.changes.find(c => c.field === 'category');
      expect(categoryChange.from).toBe('Salary');
      expect(categoryChange.to).toBe('Other');
    });
  });

  describe('Delete Income Source Event Logging', () => {
    it('should log income_source_deleted event with pre-delete metadata', async () => {
      const created = await incomeService.createIncomeSource({
        year: TEST_YEAR, month: 5, name: 'To Delete', amount: 1500.25, category: 'Government'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const deleted = await incomeService.deleteIncomeSource(created.id);
      expect(deleted).toBe(true);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'income_source_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted income source');
      expect(event.user_action).toContain('To Delete');
      expect(event.user_action).toContain('1500.25');

      expect(metadata.name).toBe('To Delete');
      expect(metadata.amount).toBe(1500.25);
      expect(metadata.category).toBe('Government');
    });
  });

  describe('Copy From Previous Month Event Logging', () => {
    it('should log income_sources_copied event when copying sources', async () => {
      await incomeService.createIncomeSource({
        year: TEST_YEAR, month: 6, name: 'Salary Source', amount: 4000, category: 'Salary'
      });
      await incomeService.createIncomeSource({
        year: TEST_YEAR, month: 6, name: 'Side Income', amount: 500, category: 'Other'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const copied = await incomeService.copyFromPreviousMonth(TEST_YEAR, 7);
      expect(copied.length).toBe(2);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'income_sources_copied');

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.entity_id).toBeNull();
      expect(event.user_action).toContain('Copied 2 income source(s)');

      expect(metadata.sourceMonth).toBe(`${TEST_YEAR}-06`);
      expect(metadata.targetMonth).toBe(`${TEST_YEAR}-07`);
      expect(metadata.count).toBe(2);
    });
  });

  describe('Property 4: Income source CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 4: Income source CRUD logging
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
     */
    it('should log correct events for any income source CRUD operation', async () => {
      const categoryArb = fc.constantFrom('Salary', 'Government', 'Gifts', 'Other');
      const nameArb = fc.stringMatching(/^[A-Za-z ]{1,50}$/).filter(s => s.trim().length > 0);
      const amountArb = fc.integer({ min: 1, max: 999999 }).map(n => n / 100);
      const monthArb = fc.integer({ min: 1, max: 12 });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({ name: nameArb, amount: amountArb, category: categoryArb, month: monthArb }),
          async (operation, input) => {
            await resetTestState();

            if (operation === 'create') {
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR, month: input.month, name: input.name, amount: input.amount, category: input.category
              });

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'income_source_added', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(input.name.trim());
              expect(metadata.amount).toBeCloseTo(input.amount, 2);
              expect(metadata.category).toBe(input.category);
              expect(metadata.year).toBe(TEST_YEAR);
              expect(metadata.month).toBe(input.month);

            } else if (operation === 'update') {
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR, month: input.month, name: 'OriginalPBT', amount: 1000, category: 'Salary'
              });

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await incomeService.updateIncomeSource(created.id, {
                name: input.name, amount: input.amount, category: input.category
              });

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'income_source_updated', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(input.name.trim());
              expect(metadata.amount).toBeCloseTo(input.amount, 2);
              expect(metadata.category).toBe(input.category);
              expect(Array.isArray(metadata.changes)).toBe(true);

            } else {
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR, month: input.month, name: input.name, amount: input.amount, category: input.category
              });

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await incomeService.deleteIncomeSource(created.id);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'income_source_deleted', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(input.name.trim());
              expect(metadata.amount).toBeCloseTo(input.amount, 2);
              expect(metadata.category).toBe(input.category);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
