const { getDatabase } = require('../database/db');
const loanBalanceService = require('./loanBalanceService');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Loan Balance Activity Logging
 *
 * Feature: activity-log-coverage, Property 8: Loan balance CRUD logging
 * Feature: activity-log-coverage, Property 9: Loan rate update logging
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 */

const ENTITY_TYPES = ['loan_balance', 'loan'];

describe('Loan Balance Activity Logging - Integration Tests', () => {
  let db;
  let testLoanId;
  const testLoanName = 'Test Loan For Balance Logging';
  const testYear = 2096;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
    await runSql(db, `DELETE FROM loan_balances WHERE loan_id IN (SELECT id FROM loans WHERE name LIKE 'Test Loan For Balance%')`);
    await runSql(db, `DELETE FROM loans WHERE name LIKE 'Test Loan For Balance%'`);
  }

  beforeAll(async () => { db = await getDatabase(); });

  beforeEach(async () => {
    await resetTestState();

    const loan = await loanService.createLoan({
      name: testLoanName, initial_balance: 50000, start_date: '2020-01-01', loan_type: 'loan'
    });
    testLoanId = loan.id;

    await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
  });

  afterEach(() => resetTestState());

  describe('CreateOrUpdateBalance Event Logging', () => {
    it('should log loan_balance_updated event when creating a balance entry', async () => {
      const result = await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 6, remaining_balance: 45000, rate: 5.5
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_balance_updated');

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan_balance');
      expect(event.user_action).toContain(testLoanName);
      expect(event.user_action).toContain('45000.00');

      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(6);
      expect(metadata.remaining_balance).toBe(45000);
      expect(metadata.rate).toBe(5.5);
      expect(metadata.loanName).toBe(testLoanName);
    });

    it('should log loan_balance_updated event when upserting an existing balance entry', async () => {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 7, remaining_balance: 44000, rate: 5.5
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 7, remaining_balance: 43000, rate: 5.25
      });

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_balance_updated');

      expect(event).toBeDefined();
      expect(metadata.remaining_balance).toBe(43000);
      expect(metadata.rate).toBe(5.25);
      expect(metadata.loanName).toBe(testLoanName);
    });
  });

  describe('UpdateBalance Event Logging', () => {
    it('should log loan_balance_updated event when updating a balance entry', async () => {
      const created = await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 8, remaining_balance: 42000, rate: 5.0
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const updated = await loanBalanceService.updateBalance(created.id, {
        loan_id: testLoanId, year: testYear, month: 8, remaining_balance: 41000, rate: 4.75
      });
      expect(updated).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_balance_updated', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan_balance');
      expect(event.user_action).toContain('41000.00');

      expect(metadata.id).toBe(created.id);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(8);
      expect(metadata.remaining_balance).toBe(41000);
      expect(metadata.rate).toBe(4.75);
    });

    it('should not log event when updating non-existent balance entry', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const updated = await loanBalanceService.updateBalance(999999, {
        loan_id: testLoanId, year: testYear, month: 9, remaining_balance: 40000, rate: 5.0
      });
      expect(updated).toBeNull();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const balanceEvents = events.filter(e => e.entity_type === 'loan_balance');
      expect(balanceEvents.length).toBe(0);
    });
  });

  describe('DeleteBalance Event Logging', () => {
    it('should log loan_balance_deleted event when deleting a balance entry', async () => {
      const created = await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 10, remaining_balance: 39000, rate: 4.5
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const deleted = await loanBalanceService.deleteBalance(created.id, testLoanId);
      expect(deleted).toBe(true);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_balance_deleted', created.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan_balance');
      expect(event.user_action).toContain(`${testYear}-10`);

      expect(metadata.id).toBe(created.id);
      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.year).toBe(testYear);
      expect(metadata.month).toBe(10);
    });

    it('should not log event when deleting non-existent balance entry', async () => {
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const deleted = await loanBalanceService.deleteBalance(999999, testLoanId);
      expect(deleted).toBe(false);

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const balanceEvents = events.filter(e => e.entity_type === 'loan_balance');
      expect(balanceEvents.length).toBe(0);
    });
  });

  describe('UpdateCurrentRate Event Logging', () => {
    it('should log loan_rate_updated event when updating rate on existing entry', async () => {
      const now = new Date();
      await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: now.getFullYear(), month: now.getMonth() + 1, remaining_balance: 38000, rate: 5.0
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const result = await loanBalanceService.updateCurrentRate(testLoanId, 4.25);
      expect(result).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_rate_updated', testLoanId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan');
      expect(event.user_action).toContain('5');
      expect(event.user_action).toContain('4.25');

      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.newRate).toBe(4.25);
      expect(metadata.previousRate).toBe(5.0);
    });

    it('should log loan_rate_updated event when creating new entry for current month', async () => {
      await loanBalanceService.createOrUpdateBalance({
        loan_id: testLoanId, year: testYear, month: 1, remaining_balance: 37000, rate: 6.0
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);

      const result = await loanBalanceService.updateCurrentRate(testLoanId, 5.5);
      expect(result).toBeDefined();

      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_rate_updated', testLoanId);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan');
      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.newRate).toBe(5.5);
      expect(metadata.previousRate).toBe(6.0);
    });
  });

  describe('Property 8: Loan balance CRUD logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 8: Loan balance CRUD logging
     * **Validates: Requirements 8.1, 8.2, 8.3**
     */
    it('should log correct events for any loan balance CRUD operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('createOrUpdate', 'update', 'delete'),
          fc.record({
            remaining_balance: fc.double({ min: 0, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            rate: fc.double({ min: 0, max: 30, noNaN: true }).map(n => Math.round(n * 100) / 100),
            month: fc.integer({ min: 1, max: 12 })
          }),
          async (operation, data) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
            await runSql(db, `DELETE FROM loan_balances WHERE loan_id = ?`, [testLoanId]);

            let entityId;
            let expectedEventType;

            if (operation === 'createOrUpdate') {
              const result = await loanBalanceService.createOrUpdateBalance({
                loan_id: testLoanId, year: testYear, month: data.month, remaining_balance: data.remaining_balance, rate: data.rate
              });
              entityId = result.id;
              expectedEventType = 'loan_balance_updated';
            } else if (operation === 'update') {
              const created = await loanBalanceService.createOrUpdateBalance({
                loan_id: testLoanId, year: testYear, month: data.month, remaining_balance: 50000, rate: 5.0
              });
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
              await loanBalanceService.updateBalance(created.id, {
                loan_id: testLoanId, year: testYear, month: data.month, remaining_balance: data.remaining_balance, rate: data.rate
              });
              expectedEventType = 'loan_balance_updated';
            } else {
              const created = await loanBalanceService.createOrUpdateBalance({
                loan_id: testLoanId, year: testYear, month: data.month, remaining_balance: data.remaining_balance, rate: data.rate
              });
              entityId = created.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
              await loanBalanceService.deleteBalance(created.id, testLoanId);
              expectedEventType = 'loan_balance_deleted';
            }

            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const event = events.find(e => e.event_type === expectedEventType && e.entity_type === 'loan_balance');

            expect(event).toBeDefined();
            expect(event.user_action).toBeTruthy();

            const metadata = JSON.parse(event.metadata);

            if (operation === 'createOrUpdate') {
              expect(metadata.loanId).toBe(testLoanId);
              expect(metadata.year).toBe(testYear);
              expect(metadata.month).toBe(data.month);
              expect(metadata.remaining_balance).toBe(data.remaining_balance);
              expect(metadata.rate).toBe(data.rate);
              expect(metadata.loanName).toBe(testLoanName);
            } else if (operation === 'update') {
              expect(metadata.id).toBe(entityId);
              expect(metadata.remaining_balance).toBe(data.remaining_balance);
              expect(metadata.rate).toBe(data.rate);
            } else {
              expect(metadata.id).toBe(entityId);
              expect(metadata.loanId).toBe(testLoanId);
              expect(metadata.year).toBe(testYear);
              expect(metadata.month).toBe(data.month);
            }
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });

  describe('Property 9: Loan rate update logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 9: Loan rate update logging
     * **Validates: Requirements 8.4**
     */
    it('should log correct loan_rate_updated event for any rate change', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.double({ min: 0.01, max: 30, noNaN: true }).map(n => Math.round(n * 100) / 100),
          fc.double({ min: 0.01, max: 30, noNaN: true }).map(n => Math.round(n * 100) / 100),
          async (initialRate, newRate) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
            await runSql(db, `DELETE FROM loan_balances WHERE loan_id = ?`, [testLoanId]);

            const now = new Date();
            await loanBalanceService.createOrUpdateBalance({
              loan_id: testLoanId, year: now.getFullYear(), month: now.getMonth() + 1, remaining_balance: 35000, rate: initialRate
            });

            await clearActivityLogs(db, 'entity_type', ENTITY_TYPES);
            await loanBalanceService.updateCurrentRate(testLoanId, newRate);

            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, 'loan_rate_updated', testLoanId);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe('loan');
            expect(event.user_action).toBeTruthy();

            expect(metadata.loanId).toBe(testLoanId);
            expect(metadata.newRate).toBe(newRate);
            expect(metadata.previousRate).toBe(initialRate);
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});
