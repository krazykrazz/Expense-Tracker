const { getDatabase } = require('../database/db');
const autoPaymentLoggerService = require('./autoPaymentLoggerService');
const loanService = require('./loanService');
const activityLogRepository = require('../repositories/activityLogRepository');
const fc = require('fast-check');
const { runSql, clearActivityLogs, findEventWithMetadata, waitForLogging } = require('../test/activityLogTestHelpers');

/**
 * Integration Tests for Auto Payment Logger Activity Logging
 * 
 * Feature: activity-log-coverage, Property 14: Auto payment logging
 * 
 * Validates: Requirements 12.1, 12.2
 */

const EVENT_TYPE = 'auto_payment_logged';

describe('Auto Payment Logger Activity Logging - Integration Tests', () => {
  let db;
  const testYear = 2096;
  const testMonth = 6;
  let testLoanId;

  async function resetTestState() {
    await clearActivityLogs(db, 'event_type', EVENT_TYPE);
    await runSql(db, `DELETE FROM loan_payments WHERE strftime('%Y', payment_date) = '${testYear}'`);
    await runSql(db, `DELETE FROM fixed_expenses WHERE year = ${testYear}`);
    await runSql(db, `DELETE FROM loans WHERE name LIKE 'Test AutoLog%'`);
  }

  function insertLinkedFixedExpense(data) {
    return runSql(db,
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.year, data.month, data.name, data.amount, data.category || 'Loan Payment',
       data.payment_type || 'Debit', data.payment_due_day, data.linked_loan_id]
    ).then(result => ({ id: result.lastID, ...data }));
  }

  beforeAll(async () => { db = await getDatabase(); });

  beforeEach(async () => {
    try {
      await resetTestState();

      const loan = await loanService.createLoan({
        name: 'Test AutoLog Loan', initial_balance: 10000.00, start_date: `${testYear}-01-01`, loan_type: 'loan'
      });
      testLoanId = loan.id;

      await clearActivityLogs(db, 'event_type', EVENT_TYPE);
    } catch (error) {
      console.warn('Test setup warning:', error.message);
    }
  });

  afterEach(async () => {
    try { await resetTestState(); } catch (error) { console.warn('Test cleanup warning:', error.message); }
  });

  describe('createPaymentFromFixedExpense Event Logging', () => {
    it('should log auto_payment_logged event when creating payment from fixed expense', async () => {
      const fixedExpense = { linked_loan_id: testLoanId, amount: 250.00, name: 'Monthly Loan Payment' };
      const paymentDate = `${testYear}-${String(testMonth).padStart(2, '0')}-15`;

      const payment = await autoPaymentLoggerService.createPaymentFromFixedExpense(fixedExpense, paymentDate);
      await waitForLogging();

      expect(payment).toBeDefined();
      expect(payment.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const { event, metadata } = findEventWithMetadata(events, EVENT_TYPE, payment.id);

      expect(event).toBeDefined();
      expect(event.entity_type).toBe('loan_payment');
      expect(event.user_action).toContain('Auto-logged');
      expect(event.user_action).toContain('250.00');

      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.amount).toBe(250.00);
      expect(metadata.fixedExpenseName).toBe('Monthly Loan Payment');
      expect(metadata.paymentDate).toBe(paymentDate);
    });

    it('should include correct fixed expense name in metadata', async () => {
      const fixedExpense = { linked_loan_id: testLoanId, amount: 500.00, name: 'Car Insurance Premium' };
      const paymentDate = `${testYear}-${String(testMonth).padStart(2, '0')}-01`;

      const payment = await autoPaymentLoggerService.createPaymentFromFixedExpense(fixedExpense, paymentDate);
      await waitForLogging();

      const events = await activityLogRepository.findRecent(10, 0);
      const { metadata } = findEventWithMetadata(events, EVENT_TYPE, payment.id);

      expect(metadata.fixedExpenseName).toBe('Car Insurance Premium');
      expect(metadata.amount).toBe(500.00);
    });
  });

  describe('autoLogFromSuggestion Event Logging', () => {
    it('should log auto_payment_logged event when auto-logging from suggestion', async () => {
      const fe = await insertLinkedFixedExpense({
        year: testYear, month: testMonth, name: 'Suggestion Test Expense', amount: 300.00,
        category: 'Loan Payment', payment_type: 'Debit', payment_due_day: 15, linked_loan_id: testLoanId
      });

      const payment = await autoPaymentLoggerService.autoLogFromSuggestion(fe.id, testYear, testMonth);
      await waitForLogging();

      expect(payment).toBeDefined();
      expect(payment.id).toBeDefined();

      const events = await activityLogRepository.findRecent(10, 0);
      const suggestionEvents = events.filter(e =>
        e.event_type === EVENT_TYPE && e.entity_id === payment.id
      );
      expect(suggestionEvents.length).toBeGreaterThanOrEqual(1);

      const suggestionEvent = suggestionEvents.find(e => {
        const meta = JSON.parse(e.metadata);
        return meta.fixedExpenseId !== undefined;
      });

      expect(suggestionEvent).toBeDefined();
      expect(suggestionEvent.entity_type).toBe('loan_payment');
      expect(suggestionEvent.user_action).toContain('Auto-logged');

      const metadata = JSON.parse(suggestionEvent.metadata);
      expect(metadata.fixedExpenseId).toBe(fe.id);
      expect(metadata.loanId).toBe(testLoanId);
      expect(metadata.amount).toBe(300.00);
    });
  });

  describe('Property 14: Auto payment logging (PBT)', () => {
    /**
     * Feature: activity-log-coverage, Property 14: Auto payment logging
     * Validates: Requirements 12.1, 12.2
     */
    it('should log auto_payment_logged for any auto-logged payment via createPaymentFromFixedExpense', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            amount: fc.double({ min: 10, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            day: fc.integer({ min: 1, max: 28 }),
            name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
          }),
          async (data) => {
            await clearActivityLogs(db, 'event_type', EVENT_TYPE);

            const paymentDate = `${testYear}-${String(testMonth).padStart(2, '0')}-${String(data.day).padStart(2, '0')}`;
            const fixedExpense = { linked_loan_id: testLoanId, amount: data.amount, name: data.name };

            const payment = await autoPaymentLoggerService.createPaymentFromFixedExpense(fixedExpense, paymentDate);
            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const { event, metadata } = findEventWithMetadata(events, EVENT_TYPE, payment.id);

            expect(event).toBeDefined();
            expect(event.entity_type).toBe('loan_payment');
            expect(event.user_action).toBeTruthy();

            expect(metadata.loanId).toBe(testLoanId);
            expect(metadata.amount).toBe(data.amount);
            expect(metadata.fixedExpenseName).toBe(data.name);
            expect(metadata.paymentDate).toBe(paymentDate);
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });

    it('should log auto_payment_logged with fixedExpenseId for any auto-logged payment via autoLogFromSuggestion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            amount: fc.double({ min: 10, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
            day: fc.integer({ min: 1, max: 28 }),
            name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
          }),
          async (data) => {
            await clearActivityLogs(db, 'event_type', EVENT_TYPE);
            await runSql(db, `DELETE FROM loan_payments WHERE strftime('%Y', payment_date) = '${testYear}'`);
            await runSql(db, `DELETE FROM fixed_expenses WHERE year = ${testYear}`);

            const fe = await insertLinkedFixedExpense({
              year: testYear, month: testMonth, name: data.name, amount: data.amount,
              category: 'Loan Payment', payment_type: 'Debit', payment_due_day: data.day, linked_loan_id: testLoanId
            });

            const payment = await autoPaymentLoggerService.autoLogFromSuggestion(fe.id, testYear, testMonth);
            await waitForLogging();

            const events = await activityLogRepository.findRecent(10, 0);
            const suggestionEvent = events.find(e => {
              if (e.event_type !== EVENT_TYPE || e.entity_id !== payment.id) return false;
              const meta = JSON.parse(e.metadata);
              return meta.fixedExpenseId !== undefined;
            });

            expect(suggestionEvent).toBeDefined();
            expect(suggestionEvent.entity_type).toBe('loan_payment');
            expect(suggestionEvent.user_action).toBeTruthy();

            const metadata = JSON.parse(suggestionEvent.metadata);
            expect(metadata.fixedExpenseId).toBe(fe.id);
            expect(metadata.loanId).toBe(testLoanId);
            expect(metadata.amount).toBe(data.amount);
          }
        ),
        { numRuns: process.env.FAST_PBT === 'true' ? 5 : 20 }
      );
    });
  });
});
