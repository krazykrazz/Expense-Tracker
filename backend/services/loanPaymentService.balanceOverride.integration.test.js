/**
 * Integration Tests for Balance Override End-to-End Flow
 *
 * Feature: mortgage-balance-interest-tracking
 *
 * Tests the full balance override lifecycle using a real in-memory SQLite database:
 * 1. Create a mortgage loan
 * 2. Create a payment with balanceOverride via loanPaymentService.createPayment()
 * 3. Verify snapshot created in loan_balances with the override value
 * 4. Verify calculateBalance() uses the override as anchor for interest accrual
 * 5. Verify activity_logs contains balance_override_applied event with correct metadata
 * 6. Verify loan_payment_added event is also logged
 *
 * Validates: Requirements 2.2, 2.6, 8.1, 8.2, 8.3, 11.2, 11.3
 */

const sqlite3 = require('sqlite3').verbose();
const { calculateMonthlyInterest } = require('../utils/interestCalculation');

// ─── In-Memory Database Setup ───

let mockDb = null;

jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockDb))
}));

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);

      const statements = [
        'PRAGMA foreign_keys = ON',
        `CREATE TABLE loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
          start_date TEXT NOT NULL,
          notes TEXT,
          loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
          is_paid_off INTEGER DEFAULT 0,
          estimated_months_left INTEGER,
          amortization_period INTEGER,
          term_length INTEGER,
          renewal_date TEXT,
          rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed', 'variable')),
          payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly', 'bi-weekly', 'accelerated_bi-weekly')),
          estimated_property_value REAL,
          fixed_interest_rate REAL DEFAULT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE loan_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_id INTEGER NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          payment_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE loan_balances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          loan_id INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
          rate REAL NOT NULL CHECK(rate >= 0),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
          UNIQUE(loan_id, year, month)
        )`,
        `CREATE TABLE activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          user_action TEXT NOT NULL,
          metadata TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        'CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id)',
        'CREATE INDEX idx_loan_payments_payment_date ON loan_payments(payment_date)',
        'CREATE INDEX idx_loan_balances_loan_id ON loan_balances(loan_id)',
        'CREATE INDEX idx_loan_balances_year_month ON loan_balances(year, month)',
        'CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp DESC)',
        'CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id)',
      ];

      let i = 0;
      const next = () => {
        if (i >= statements.length) return resolve(db);
        db.run(statements[i], (err2) => {
          if (err2) return reject(err2);
          i++;
          next();
        });
      };
      next();
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

function insertMortgage(db, { name, initial_balance, start_date, fixed_interest_rate }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, loan_type, fixed_interest_rate)
       VALUES (?, ?, ?, 'mortgage', ?)`,
      [name, initial_balance, start_date, fixed_interest_rate],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function queryAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// ─── Tests ───

describe('Balance Override End-to-End Integration', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockDb = await createTestDatabase();

    // Re-mock after resetModules
    jest.mock('../database/db', () => ({
      getDatabase: jest.fn(() => Promise.resolve(mockDb))
    }));

    // Freeze time so payment date validation passes
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-09-15T12:00:00Z'));
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (mockDb) {
      await closeDatabase(mockDb);
      mockDb = null;
    }
  });

  test('full override flow: payment → snapshot → anchor → activity logs', async () => {
    // Fresh requires after resetModules so they pick up the mocked db
    const loanPaymentService = require('./loanPaymentService');
    const balanceCalculationService = require('./balanceCalculationService');

    // 1. Create a mortgage
    const mortgageName = 'Integration Test Mortgage';
    const initialBalance = 500000;
    const rate = 5.25;
    const loanId = await insertMortgage(mockDb, {
      name: mortgageName,
      initial_balance: initialBalance,
      start_date: '2025-01-01',
      fixed_interest_rate: rate,
    });

    // 2. Create a payment with balanceOverride
    const overrideValue = 485000;
    const paymentDate = '2025-06-15';
    const paymentAmount = 2500;

    const payment = await loanPaymentService.createPayment(loanId, {
      amount: paymentAmount,
      payment_date: paymentDate,
      notes: 'June payment with override',
      balanceOverride: overrideValue,
    });

    expect(payment).toBeDefined();
    expect(payment.id).toBeDefined();

    // 3. Verify snapshot created in loan_balances with the override value
    const snapshots = await queryAll(
      mockDb,
      'SELECT * FROM loan_balances WHERE loan_id = ? ORDER BY year ASC, month ASC',
      [loanId]
    );

    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const juneSnapshot = snapshots.find(s => s.year === 2025 && s.month === 6);
    expect(juneSnapshot).toBeDefined();
    expect(juneSnapshot.remaining_balance).toBeCloseTo(overrideValue, 2);
    expect(juneSnapshot.rate).toBeCloseTo(rate, 2);

    // 4. Verify calculateBalance() uses the override as anchor
    const balanceResult = await balanceCalculationService.calculateBalance(loanId);

    expect(balanceResult.interestAware).toBe(true);
    expect(balanceResult.anchorBased).toBe(true);

    // Manually compute expected balance: walk from July to September (3 months)
    let expectedBalance = overrideValue;
    // July
    expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
    expectedBalance = Math.max(0, expectedBalance);
    // August
    expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
    expectedBalance = Math.max(0, expectedBalance);
    // September
    expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
    expectedBalance = Math.max(0, expectedBalance);
    expectedBalance = Math.round(expectedBalance * 100) / 100;

    expect(balanceResult.currentBalance).toBeCloseTo(expectedBalance, 1);

    // 5. Verify activity_logs: balance_override_applied event
    const allLogs = await queryAll(
      mockDb,
      'SELECT * FROM activity_logs ORDER BY id ASC'
    );

    const overrideEvent = allLogs.find(e => e.event_type === 'balance_override_applied');
    expect(overrideEvent).toBeDefined();
    expect(overrideEvent.entity_type).toBe('loan_balance');
    expect(overrideEvent.entity_id).toBe(loanId);
    expect(overrideEvent.user_action).toContain(mortgageName);
    expect(overrideEvent.user_action).toContain('485000.00');

    const overrideMetadata = JSON.parse(overrideEvent.metadata);
    expect(overrideMetadata.overrideValue).toBe(overrideValue);
    expect(overrideMetadata.mortgageName).toBe(mortgageName);
    expect(overrideMetadata.paymentDate).toBe(paymentDate);
    expect(overrideMetadata.source).toBe('balance_override');
    // calculatedValue should be a number (the engine's computed balance)
    expect(typeof overrideMetadata.calculatedValue).toBe('number');

    // 6. Verify loan_payment_added event is also logged
    const paymentEvent = allLogs.find(e => e.event_type === 'loan_payment_added');
    expect(paymentEvent).toBeDefined();
    expect(paymentEvent.entity_type).toBe('loan_payment');
    expect(paymentEvent.entity_id).toBe(payment.id);
    expect(paymentEvent.user_action).toContain(mortgageName);
    expect(paymentEvent.user_action).toContain(`$${paymentAmount.toFixed(2)}`);

    const paymentMetadata = JSON.parse(paymentEvent.metadata);
    expect(paymentMetadata.loanName).toBe(mortgageName);
    expect(paymentMetadata.amount).toBe(paymentAmount);
    expect(paymentMetadata.paymentDate).toBe(paymentDate);
  });

  test('second payment after override uses override snapshot as anchor', async () => {
    const loanPaymentService = require('./loanPaymentService');
    const balanceCalculationService = require('./balanceCalculationService');

    const rate = 4.5;
    const loanId = await insertMortgage(mockDb, {
      name: 'Anchor Test Mortgage',
      initial_balance: 400000,
      start_date: '2025-01-01',
      fixed_interest_rate: rate,
    });

    // First payment with override in March
    const overrideValue = 395000;
    await loanPaymentService.createPayment(loanId, {
      amount: 2000,
      payment_date: '2025-03-15',
      balanceOverride: overrideValue,
    });

    // Second payment in June (no override)
    const secondPaymentAmount = 2000;
    await loanPaymentService.createPayment(loanId, {
      amount: secondPaymentAmount,
      payment_date: '2025-06-15',
    });

    // Calculate balance — should anchor from March override, accrue interest,
    // subtract June payment, then continue to September
    const result = await balanceCalculationService.calculateBalance(loanId);
    expect(result.interestAware).toBe(true);

    // Manual walk: March override = 395000
    let expected = overrideValue;
    // April: interest, no payment
    expected += calculateMonthlyInterest(expected, rate);
    expected = Math.max(0, expected);
    // May: interest, no payment
    expected += calculateMonthlyInterest(expected, rate);
    expected = Math.max(0, expected);
    // June: interest, then subtract second payment
    expected += calculateMonthlyInterest(expected, rate);
    expected -= secondPaymentAmount;
    expected = Math.max(0, expected);
    // July: interest, no payment
    expected += calculateMonthlyInterest(expected, rate);
    expected = Math.max(0, expected);
    // August: interest, no payment
    expected += calculateMonthlyInterest(expected, rate);
    expected = Math.max(0, expected);
    // September: interest, no payment
    expected += calculateMonthlyInterest(expected, rate);
    expected = Math.max(0, expected);
    expected = Math.round(expected * 100) / 100;

    expect(result.currentBalance).toBeCloseTo(expected, 1);
  });

  test('override of zero creates valid snapshot (mortgage paid off)', async () => {
    const loanPaymentService = require('./loanPaymentService');
    const balanceCalculationService = require('./balanceCalculationService');

    const loanId = await insertMortgage(mockDb, {
      name: 'Paid Off Mortgage',
      initial_balance: 10000,
      start_date: '2025-01-01',
      fixed_interest_rate: 3.0,
    });

    // Pay off with override = 0
    await loanPaymentService.createPayment(loanId, {
      amount: 10000,
      payment_date: '2025-06-15',
      balanceOverride: 0,
    });

    // Snapshot should have remaining_balance = 0
    const snapshots = await queryAll(
      mockDb,
      'SELECT * FROM loan_balances WHERE loan_id = ? AND year = 2025 AND month = 6',
      [loanId]
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].remaining_balance).toBe(0);

    // Balance should be 0 (no interest accrues on zero balance)
    const result = await balanceCalculationService.calculateBalance(loanId);
    expect(result.currentBalance).toBe(0);
    expect(result.interestAware).toBe(true);
  });
});
