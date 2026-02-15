const { getDatabase } = require('../database/db');
const peopleService = require('./peopleService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for People Service Activity Logging
 *
 * Feature: activity-log-coverage, Property 5: People CRUD logging
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

const ENTITY_TYPE = 'person';

describe('People Service Activity Logging - Integration Tests', () => {
  let db;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM expense_people WHERE person_id IN (SELECT id FROM people WHERE name LIKE 'Test_%')`);
    await runSql(db, `DELETE FROM people WHERE name LIKE 'Test_%'`);
  }

  beforeAll(async () => { db = await getDatabase(); });
  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Create Person Event Logging', () => {
    it('should log person_added event when creating a person', async () => {
      const created = await peopleService.createPerson('Test_Alice', '1990-05-15');

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'person_added', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Added person');
      expect(event.user_action).toContain('Test_Alice');

      expect(metadata.name).toBe('Test_Alice');
    });
  });

  describe('Update Person Event Logging', () => {
    it('should log person_updated event with changes array', async () => {
      const created = await peopleService.createPerson('Test_Bob', '1985-03-20');

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const updated = await peopleService.updatePerson(created.id, 'Test_Robert', '1985-06-10');
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'person_updated', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Updated person');
      expect(event.user_action).toContain('Test_Robert');

      expect(metadata.name).toBe('Test_Robert');
      expect(metadata.changes).toBeDefined();
      expect(Array.isArray(metadata.changes)).toBe(true);
      expect(metadata.changes.length).toBe(2);

      const nameChange = metadata.changes.find(c => c.field === 'name');
      expect(nameChange.from).toBe('Test_Bob');
      expect(nameChange.to).toBe('Test_Robert');

      const dobChange = metadata.changes.find(c => c.field === 'dateOfBirth');
      expect(dobChange.from).toBe('1985-03-20');
      expect(dobChange.to).toBe('1985-06-10');
    });
  });

  describe('Delete Person Event Logging', () => {
    it('should log person_deleted event with hadExpenses false when no expenses', async () => {
      const created = await peopleService.createPerson('Test_Charlie', null);

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const result = await peopleService.deletePerson(created.id);
      expect(result.success).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'person_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Deleted person');
      expect(event.user_action).toContain('Test_Charlie');

      expect(metadata.name).toBe('Test_Charlie');
      expect(metadata.hadExpenses).toBe(false);
      expect(metadata.expenseCount).toBe(0);
    });

    it('should log person_deleted event with hadExpenses true and expenseCount when person has expenses', async () => {
      const created = await peopleService.createPerson('Test_Diana', null);

      const { lastID: expenseId } = await runSql(db,
        `INSERT INTO expenses (place, amount, date, type, week, method) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Test Store', 50.00, '2096-01-15', 'Food', 3, 'Cash']
      );
      await runSql(db,
        `INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)`,
        [expenseId, created.id, 50.00]
      );

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const result = await peopleService.deletePerson(created.id);
      expect(result.success).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'person_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(metadata.name).toBe('Test_Diana');
      expect(metadata.hadExpenses).toBe(true);
      expect(metadata.expenseCount).toBe(1);

      await runSql(db, `DELETE FROM expenses WHERE id = ?`, [expenseId]);
    });

    it('should not log event when deleting non-existent person', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      const result = await peopleService.deletePerson(999999);
      expect(result.success).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const personEvents = events.filter(e => e.entity_type === ENTITY_TYPE);
      expect(personEvents.length).toBe(0);
    });
  });

  describe('Property 5: People CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 5: People CRUD logging
     * **Validates: Requirements 5.1, 5.2, 5.3**
     */
    it('should log correct events for any people CRUD operation', async () => {
      const nameArb = fc.stringMatching(/^[A-Za-z]{1,30}$/).map(s => `Test_${s}`);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create', 'update', 'delete'),
          nameArb,
          async (operation, name) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            if (operation === 'create') {
              const created = await peopleService.createPerson(name, null);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'person_added', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(name);

              await runSql(db, `DELETE FROM people WHERE id = ?`, [created.id]);

            } else if (operation === 'update') {
              const created = await peopleService.createPerson('Test_OrigPBT', null);

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await peopleService.updatePerson(created.id, name, '2000-01-01');

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'person_updated', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(name);
              expect(Array.isArray(metadata.changes)).toBe(true);

              await runSql(db, `DELETE FROM people WHERE id = ?`, [created.id]);

            } else {
              const created = await peopleService.createPerson(name, null);

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              const result = await peopleService.deletePerson(created.id);
              expect(result.success).toBe(true);

              await waitForLogging();
              const events = await activityLogRepository.findRecent(10, 0);
              const { event, metadata } = findEventWithMetadata(events, 'person_deleted', created.id);

              expect(event).toBeDefined();
              expect(event.entity_type).toBe(ENTITY_TYPE);
              expect(metadata.name).toBe(name);
              expect(typeof metadata.hadExpenses).toBe('boolean');
              expect(typeof metadata.expenseCount).toBe('number');
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
