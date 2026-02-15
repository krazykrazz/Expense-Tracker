const { getDatabase } = require('../database/db');
const incomeService = require('./incomeService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');

/**
 * Integration Tests for Income Service Activity Logging
 *
 * Feature: activity-log-coverage, Property 4: Income source CRUD logging
 *
 * These tests verify that income source CRUD operations correctly log activity events:
 * - Creating income sources logs "income_source_added" events
 * - Updating income sources logs "income_source_updated" events with changes array
 * - Deleting income sources logs "income_source_deleted" events (pre-delete fetch)
 * - Copying from previous month logs "income_sources_copied" events
 * - Events include correct metadata (name, amount, category, year, month)
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

const TEST_YEAR = 2096;

describe('Income Service Activity Logging - Integration Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDatabase();
  });

  beforeEach(async () => {
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM income_sources WHERE year = ?`, [TEST_YEAR], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM income_sources WHERE year = ?`, [TEST_YEAR], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  });

  describe('Create Income Source Event Logging', () => {
    it('should log income_source_added event when creating an income source', async () => {
      const data = {
        year: TEST_YEAR,
        month: 3,
        name: 'Test Salary',
        amount: 5000.50,
        category: 'Salary'
      };

      const created = await incomeService.createIncomeSource(data);

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const event = events.find(e =>
        e.event_type === 'income_source_added' &&
        e.entity_id === created.id
      );

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('income_source');
      expect(event.user_action).toContain('Added income source');
      expect(event.user_action).toContain('Test Salary');
      expect(event.user_action).toContain('5000.50');

      const metadata = JSON.parse(event.metadata);
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
        year: TEST_YEAR,
        month: 4,
        name: 'Original Name',
        amount: 3000,
        category: 'Salary'
      });

      // Clear logs to isolate update event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
          if (err) reject(err); else resolve();
        });
      });

      const updated = await incomeService.updateIncomeSource(created.id, {
        name: 'Updated Name',
        amount: 3500,
        category: 'Other'
      });

      expect(updated).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const event = events.find(e =>
        e.event_type === 'income_source_updated' &&
        e.entity_id === created.id
      );

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('income_source');
      expect(event.user_action).toContain('Updated income source');
      expect(event.user_action).toContain('Updated Name');

      const metadata = JSON.parse(event.metadata);
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
        year: TEST_YEAR,
        month: 5,
        name: 'To Delete',
        amount: 1500.25,
        category: 'Government'
      });

      // Clear logs to isolate delete event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
          if (err) reject(err); else resolve();
        });
      });

      const deleted = await incomeService.deleteIncomeSource(created.id);

      expect(deleted).toBe(true);

      const events = await activityLogRepository.findRecent(10, 0);
      const event = events.find(e =>
        e.event_type === 'income_source_deleted' &&
        e.entity_id === created.id
      );

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('income_source');
      expect(event.user_action).toContain('Deleted income source');
      expect(event.user_action).toContain('To Delete');
      expect(event.user_action).toContain('1500.25');

      const metadata = JSON.parse(event.metadata);
      expect(metadata.name).toBe('To Delete');
      expect(metadata.amount).toBe(1500.25);
      expect(metadata.category).toBe('Government');
    });
  });

  describe('Copy From Previous Month Event Logging', () => {
    it('should log income_sources_copied event when copying sources', async () => {
      // Create sources in month 6 (the source month)
      await incomeService.createIncomeSource({
        year: TEST_YEAR,
        month: 6,
        name: 'Salary Source',
        amount: 4000,
        category: 'Salary'
      });
      await incomeService.createIncomeSource({
        year: TEST_YEAR,
        month: 6,
        name: 'Side Income',
        amount: 500,
        category: 'Other'
      });

      // Clear logs to isolate copy event
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
          if (err) reject(err); else resolve();
        });
      });

      // Copy to month 7
      const copied = await incomeService.copyFromPreviousMonth(TEST_YEAR, 7);

      expect(copied.length).toBe(2);

      const events = await activityLogRepository.findRecent(10, 0);
      const event = events.find(e => e.event_type === 'income_sources_copied');

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('income_source');
      expect(event.entity_id).toBeNull();
      expect(event.user_action).toContain('Copied 2 income source(s)');
      expect(event.user_action).toContain(`${TEST_YEAR}-06`);
      expect(event.user_action).toContain(`${TEST_YEAR}-07`);

      const metadata = JSON.parse(event.metadata);
      expect(metadata.sourceMonth).toBe(`${TEST_YEAR}-06`);
      expect(metadata.targetMonth).toBe(`${TEST_YEAR}-07`);
      expect(metadata.count).toBe(2);
    });
  });

  describe('Property 4: Income source CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 4: Income source CRUD logging
     *
     * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
     *
     * For any valid income source operation (create, update, or delete), exactly one
     * activity log event is created with the correct event_type, entity_type, entity_id,
     * and metadata containing name, amount, and category. Create events additionally
     * contain year and month. Update events additionally contain a changes array.
     */
    it('should log correct events for any income source CRUD operation', async () => {
      const categoryArb = fc.constantFrom('Salary', 'Government', 'Gifts', 'Other');
      const nameArb = fc.stringMatching(/^[A-Za-z ]{1,50}$/).filter(s => s.trim().length > 0);
      const amountArb = fc.integer({ min: 1, max: 999999 }).map(n => n / 100);
      const monthArb = fc.integer({ min: 1, max: 12 });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          fc.record({
            name: nameArb,
            amount: amountArb,
            category: categoryArb,
            month: monthArb
          }),
          async (operation, input) => {
            // Clean up before each iteration
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
                if (err) reject(err); else resolve();
              });
            });
            await new Promise((resolve, reject) => {
              db.run(`DELETE FROM income_sources WHERE year = ?`, [TEST_YEAR], (err) => {
                if (err) reject(err); else resolve();
              });
            });

            let expectedEventType;
            let entityId;

            if (operation === 'create') {
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR,
                month: input.month,
                name: input.name,
                amount: input.amount,
                category: input.category
              });
              entityId = created.id;
              expectedEventType = 'income_source_added';

              await new Promise(r => setTimeout(r, 100));
              const events = await activityLogRepository.findRecent(10, 0);
              const event = events.find(e =>
                e.event_type === expectedEventType && e.entity_id === entityId
              );

              expect(event).toBeDefined();
              expect(event.entity_type).toBe('income_source');

              const metadata = JSON.parse(event.metadata);
              expect(metadata.name).toBe(input.name.trim());
              expect(metadata.amount).toBeCloseTo(input.amount, 2);
              expect(metadata.category).toBe(input.category);
              expect(metadata.year).toBe(TEST_YEAR);
              expect(metadata.month).toBe(input.month);

            } else if (operation === 'update') {
              // Create first, then update
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR,
                month: input.month,
                name: 'OriginalPBT',
                amount: 1000,
                category: 'Salary'
              });
              entityId = created.id;

              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
                  if (err) reject(err); else resolve();
                });
              });

              await incomeService.updateIncomeSource(created.id, {
                name: input.name,
                amount: input.amount,
                category: input.category
              });
              expectedEventType = 'income_source_updated';

              await new Promise(r => setTimeout(r, 100));
              const events = await activityLogRepository.findRecent(10, 0);
              const event = events.find(e =>
                e.event_type === expectedEventType && e.entity_id === entityId
              );

              expect(event).toBeDefined();
              expect(event.entity_type).toBe('income_source');

              const metadata = JSON.parse(event.metadata);
              expect(metadata.name).toBe(input.name.trim());
              expect(metadata.amount).toBeCloseTo(input.amount, 2);
              expect(metadata.category).toBe(input.category);
              expect(metadata.changes).toBeDefined();
              expect(Array.isArray(metadata.changes)).toBe(true);

            } else {
              // Create first, then delete
              const created = await incomeService.createIncomeSource({
                year: TEST_YEAR,
                month: input.month,
                name: input.name,
                amount: input.amount,
                category: input.category
              });
              entityId = created.id;

              await new Promise((resolve, reject) => {
                db.run(`DELETE FROM activity_logs WHERE entity_type = 'income_source'`, (err) => {
                  if (err) reject(err); else resolve();
                });
              });

              await incomeService.deleteIncomeSource(created.id);
              expectedEventType = 'income_source_deleted';

              await new Promise(r => setTimeout(r, 100));
              const events = await activityLogRepository.findRecent(10, 0);
              const event = events.find(e =>
                e.event_type === expectedEventType && e.entity_id === entityId
              );

              expect(event).toBeDefined();
              expect(event.entity_type).toBe('income_source');

              const metadata = JSON.parse(event.metadata);
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
