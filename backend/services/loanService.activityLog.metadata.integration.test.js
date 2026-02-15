const { getDatabase } = require('../database/db');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Loan Service Metadata Improvements
 *
 * Feature: activity-log-coverage, Property 11: Loan metadata completeness
 * Feature: activity-log-coverage, Property 12: Loan paid-off state change logging
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
 */

const ENTITY_TYPE = 'loan';
const testYear = 2096;

describe('Loan Service Metadata Improvements - Integration Tests', () => {
  let db;

  async function resetTestState() {
    await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
    await runSql(db, `DELETE FROM loans WHERE strftime('%Y', start_date) = '${testYear}'`);
  }

  beforeAll(async () => { db = await getDatabase(); });
  beforeEach(() => resetTestState());
  afterEach(() => resetTestState());

  describe('Create Loan Metadata Enrichment', () => {
    it('should include initial_balance and start_date in createLoan metadata', async () => {
      const loan = await loanService.createLoan({
        name: 'Metadata Test Loan', initial_balance: 25000.00, start_date: `${testYear}-03-15`, loan_type: 'loan'
      });

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_added', loan.id);

      expect(event).toBeDefined();
      expect(metadata.initial_balance).toBe(25000.00);
      expect(metadata.start_date).toBe(`${testYear}-03-15`);
      expect(metadata.name).toBe('Metadata Test Loan');
      expect(metadata.loan_type).toBe('loan');
    });

    it('should include initial_balance and start_date in createMortgage metadata', async () => {
      const mortgage = await loanService.createMortgage({
        name: 'Metadata Test Mortgage', initial_balance: 400000.00, start_date: `${testYear}-06-01`,
        amortization_period: 25, term_length: 5, renewal_date: `${testYear + 5}-06-01`,
        rate_type: 'fixed', payment_frequency: 'monthly'
      });

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_added', mortgage.id);

      expect(event).toBeDefined();
      expect(metadata.initial_balance).toBe(400000.00);
      expect(metadata.start_date).toBe(`${testYear}-06-01`);
      expect(metadata.name).toBe('Metadata Test Mortgage');
      expect(metadata.loan_type).toBe('mortgage');
    });
  });

  describe('Delete Loan Metadata Enrichment', () => {
    it('should include initial_balance and start_date in deleteLoan metadata', async () => {
      const loan = await loanService.createLoan({
        name: 'Loan To Delete With Metadata', initial_balance: 12000.00, start_date: `${testYear}-01-10`, loan_type: 'loan'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await loanService.deleteLoan(loan.id);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_deleted', loan.id);

      expect(event).toBeDefined();
      expect(metadata.initial_balance).toBe(12000.00);
      expect(metadata.start_date).toBe(`${testYear}-01-10`);
      expect(metadata.name).toBe('Loan To Delete With Metadata');
      expect(metadata.loan_type).toBe('loan');
    });
  });

  describe('Mark Paid Off Event Logging', () => {
    it('should log loan_paid_off event when marking loan as paid off', async () => {
      const loan = await loanService.createLoan({
        name: 'Paid Off Test Loan', initial_balance: 5000.00, start_date: `${testYear}-02-01`, loan_type: 'loan'
      });

      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await loanService.markPaidOff(loan.id, true);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_paid_off', loan.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Marked loan as paid off');
      expect(event.user_action).toContain('Paid Off Test Loan');

      expect(metadata.name).toBe('Paid Off Test Loan');
      expect(metadata.paid_off_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should log loan_reactivated event when reactivating a loan', async () => {
      const loan = await loanService.createLoan({
        name: 'Reactivate Test Loan', initial_balance: 8000.00, start_date: `${testYear}-04-01`, loan_type: 'loan'
      });

      await loanService.markPaidOff(loan.id, true);
      await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

      await loanService.markPaidOff(loan.id, false);

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, 'loan_reactivated', loan.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe(ENTITY_TYPE);
      expect(event.user_action).toContain('Reactivated loan');
      expect(event.user_action).toContain('Reactivate Test Loan');

      expect(metadata.name).toBe('Reactivate Test Loan');
      expect(metadata).not.toHaveProperty('paid_off_date');
    });

    it('should return null and not log when marking non-existent loan', async () => {
      const result = await loanService.markPaidOff(999999, true);
      expect(result).toBeNull();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event } = findEventWithMetadata(events, 'loan_paid_off', 999999);
      expect(event).toBeNull();
    });
  });

  describe('Property 11: Loan metadata completeness (PBT)', () => {
    /**
     * **Validates: Requirements 10.1, 10.2, 10.3**
     */
    it('should include initial_balance and start_date in metadata for any loan create/delete', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('create_loan', 'create_mortgage', 'delete_loan'),
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            initial_balance: fc.double({ min: 100, max: 500000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            month: fc.integer({ min: 1, max: 12 }).map(m => String(m).padStart(2, '0')),
            day: fc.integer({ min: 1, max: 28 }).map(d => String(d).padStart(2, '0'))
          }),
          async (operation, data) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            const startDate = `${testYear}-${data.month}-${data.day}`;
            let loanId;
            let expectedEventType;

            if (operation === 'create_loan') {
              const loan = await loanService.createLoan({
                name: data.name, initial_balance: data.initial_balance, start_date: startDate, loan_type: 'loan'
              });
              loanId = loan.id;
              expectedEventType = 'loan_added';
            } else if (operation === 'create_mortgage') {
              const mortgage = await loanService.createMortgage({
                name: data.name, initial_balance: data.initial_balance, start_date: startDate,
                amortization_period: 25, term_length: 5, renewal_date: `${testYear + 5}-${data.month}-${data.day}`,
                rate_type: 'fixed', payment_frequency: 'monthly'
              });
              loanId = mortgage.id;
              expectedEventType = 'loan_added';
            } else {
              const loan = await loanService.createLoan({
                name: data.name, initial_balance: data.initial_balance, start_date: startDate, loan_type: 'loan'
              });
              loanId = loan.id;

              await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
              await loanService.deleteLoan(loanId);
              expectedEventType = 'loan_deleted';
            }

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, loanId);

            expect(event).toBeDefined();
            expect(metadata.initial_balance).toBe(data.initial_balance);
            expect(metadata.start_date).toBe(startDate);
            expect(metadata.name).toBe(data.name.trim());
            expect(metadata.loan_type).toBeDefined();
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });

  describe('Property 12: Loan paid-off state change logging (PBT)', () => {
    /**
     * **Validates: Requirements 10.4, 10.5**
     */
    it('should log correct event type for any paid-off state change', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            initial_balance: fc.double({ min: 100, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            loanType: fc.constantFrom('loan', 'line_of_credit')
          }),
          fc.boolean(),
          async (data, markAsPaidOff) => {
            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);

            const loan = await loanService.createLoan({
              name: data.name, initial_balance: data.initial_balance, start_date: `${testYear}-07-01`, loan_type: data.loanType
            });

            if (!markAsPaidOff) {
              await loanService.markPaidOff(loan.id, true);
            }

            await clearActivityLogs(db, 'entity_type', ENTITY_TYPE);
            await loanService.markPaidOff(loan.id, markAsPaidOff);

            const events = await activityLogRepository.findRecent(10, 0);
            const expectedEventType = markAsPaidOff ? 'loan_paid_off' : 'loan_reactivated';
            const { event, metadata } = findEventWithMetadata(events, expectedEventType, loan.id);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe(ENTITY_TYPE);
            expect(metadata.name).toBe(data.name.trim());

            if (markAsPaidOff) {
              expect(metadata.paid_off_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            } else {
              expect(metadata).not.toHaveProperty('paid_off_date');
            }
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});
