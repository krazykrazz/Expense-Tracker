/**
 * Property-Based Tests for LoanPaymentService - Balance Override Round Trip
 *
 * Feature: mortgage-balance-interest-tracking
 * Tests Property 4 from the design document.
 *
 * Verifies that when a payment is created with a balanceOverride value,
 * a balance snapshot is created and subsequent calculateBalance() calls
 * use that snapshot as the anchor for interest accrual going forward.
 *
 * @invariant Balance Override Round Trip: For any mortgage and any non-negative
 * override value V, when a payment is created with balanceOverride: V, a balance
 * snapshot is created with remaining_balance = V, and all subsequent calls to
 * calculateBalance() use V as the anchor for interest accrual.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString } = require('../test/pbtArbitraries');
const { calculateMonthlyInterest } = require('../utils/interestCalculation');

// Mock the database module
let mockDb = null;

jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockDb))
}));

// ─── Database Helpers ───

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
        db.run(statements[i], (err) => {
          if (err) return reject(err);
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

function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, fixed_interest_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [loan.name, loan.initial_balance, loan.start_date, loan.notes || null,
       loan.loan_type || 'mortgage', loan.fixed_interest_rate ?? null],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...loan });
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

// ─── Arbitraries ───

const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 30 }),
  initial_balance: fc.double({ min: 50000, max: 2000000, noNaN: true, noDefaultInfinity: true })
    .filter(n => isFinite(n) && n >= 50000),
  rate: fc.double({ min: 0.5, max: 10, noNaN: true, noDefaultInfinity: true })
    .filter(n => isFinite(n) && n >= 0.5),
});

const paymentArb = fc.record({
  amount: fc.double({ min: 500, max: 10000, noNaN: true, noDefaultInfinity: true })
    .filter(n => isFinite(n) && n >= 500),
});

const overrideArb = fc.double({ min: 0, max: 2000000, noNaN: true, noDefaultInfinity: true })
  .filter(n => isFinite(n) && n >= 0);

// ─── Property 4: Balance Override Round Trip ───

describe('LoanPaymentService Balance Override PBT', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(async () => {
    if (mockDb) {
      await closeDatabase(mockDb);
      mockDb = null;
    }
  });

  /**
   * Property 4: Balance Override Round Trip
   *
   * For any mortgage and any non-negative override value V, when a payment
   * is created with balanceOverride: V, a balance snapshot shall be created
   * with remaining_balance = V for the payment's year/month, and all subsequent
   * calls to calculateBalance() shall use V as the anchor for interest accrual
   * going forward.
   *
   * Tag: Feature: mortgage-balance-interest-tracking, Property 4
   * **Validates: Requirements 2.2, 2.6**
   */
  describe('Property 4: Balance Override Round Trip', () => {
    test('override creates snapshot and calculateBalance uses it as anchor', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          paymentArb,
          overrideArb,
          async (mortgage, payment, overrideValue) => {
            mockDb = await createTestDatabase();

            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));

            // Payment date: 2025-06-15, frozen time: 2025-09-15
            // This gives 3 months of interest accrual after the override snapshot
            const paymentDate = '2025-06-15';
            const frozenTime = new Date('2025-09-15T12:00:00Z');

            jest.useFakeTimers();
            jest.setSystemTime(frozenTime);

            const loanPaymentService = require('./loanPaymentService');
            const balanceCalculationService = require('./balanceCalculationService');

            // Create the mortgage
            const loan = await insertLoan(mockDb, {
              name: mortgage.name,
              initial_balance: mortgage.initial_balance,
              start_date: '2025-01-01',
              loan_type: 'mortgage',
              fixed_interest_rate: mortgage.rate,
            });

            // Create payment with balance override
            await loanPaymentService.createPayment(loan.id, {
              amount: payment.amount,
              payment_date: paymentDate,
              notes: 'PBT override test',
              balanceOverride: overrideValue,
            });

            // 1. Verify snapshot was created in loan_balances
            const snapshots = await queryAll(
              mockDb,
              'SELECT * FROM loan_balances WHERE loan_id = ? ORDER BY year ASC, month ASC',
              [loan.id]
            );

            expect(snapshots.length).toBeGreaterThanOrEqual(1);

            // Find the snapshot for the payment month (June 2025)
            const overrideSnapshot = snapshots.find(s => s.year === 2025 && s.month === 6);
            expect(overrideSnapshot).toBeDefined();
            expect(overrideSnapshot.remaining_balance).toBeCloseTo(overrideValue, 2);

            // 2. Call calculateBalance and verify it uses the override as anchor
            const result = await balanceCalculationService.calculateBalance(loan.id);

            expect(result.interestAware).toBe(true);

            // 3. Manually compute expected balance from override anchor
            // Walk from July 2025 to September 2025 (3 months of interest)
            let expectedBalance = overrideValue;
            const rate = mortgage.rate;

            // July 2025
            expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
            // Subtract payment if in July — payment is in June, so no subtraction here
            expectedBalance = Math.max(0, expectedBalance);

            // August 2025
            expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
            expectedBalance = Math.max(0, expectedBalance);

            // September 2025
            expectedBalance += calculateMonthlyInterest(expectedBalance, rate);
            expectedBalance = Math.max(0, expectedBalance);

            expectedBalance = Math.round(expectedBalance * 100) / 100;

            // The calculated balance should match the manual walk from override anchor
            expect(result.currentBalance).toBeCloseTo(expectedBalance, 1);

            jest.useRealTimers();
            await closeDatabase(mockDb);
            mockDb = null;
            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });
});
