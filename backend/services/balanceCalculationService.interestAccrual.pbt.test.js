/**
 * Property-Based Tests for BalanceCalculationService - Interest Accrual Engine
 *
 * Feature: mortgage-balance-interest-tracking
 * Tests Properties 2, 3, 5, and 7 from the design document.
 *
 * These tests verify the interest accrual engine produces correct mortgage
 * balances by walking month-by-month from an anchor, adding monthly interest,
 * and subtracting payments. Also verifies non-mortgage loans are unchanged.
 *
 * @invariant Interest Accrual Engine: For any mortgage with known rate and
 * payment sequence, the engine produces a balance matching a manual month-by-month
 * walk using calculateMonthlyInterest(). Non-mortgage loans use naive subtraction.
 * Balances are always non-negative.
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
        'CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id)',
        'CREATE INDEX idx_loan_payments_payment_date ON loan_payments(payment_date)',
        'CREATE INDEX idx_loan_balances_loan_id ON loan_balances(loan_id)',
        'CREATE INDEX idx_loan_balances_year_month ON loan_balances(year, month)',
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

function insertPayment(db, payment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_payments (loan_id, amount, payment_date, notes)
       VALUES (?, ?, ?, ?)`,
      [payment.loan_id, payment.amount, payment.payment_date, payment.notes || null],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...payment });
      }
    );
  });
}

function insertBalanceEntry(db, entry) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate)
       VALUES (?, ?, ?, ?, ?)`,
      [entry.loan_id, entry.year, entry.month, entry.remaining_balance, entry.rate],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...entry });
      }
    );
  });
}

// ─── Arbitraries ───

/**
 * Generate a mortgage config with random balance and rate.
 * Start date is fixed to allow predictable month-walking.
 */
const mortgageConfigArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 30 }),
  initial_balance: fc.double({ min: 1000, max: 2000000, noNaN: true, noDefaultInfinity: true })
    .filter(n => isFinite(n) && n >= 1000),
  rate: fc.double({ min: 0.01, max: 15, noNaN: true, noDefaultInfinity: true })
    .filter(n => isFinite(n) && n >= 0.01),
  start_year: fc.integer({ min: 2020, max: 2024 }),
  start_month: fc.integer({ min: 1, max: 12 }),
});

/**
 * Generate a payment sequence of 1-60 payments with amounts relative to balance.
 * Each payment is a { monthOffset, fraction } where fraction is the portion of
 * a typical monthly payment (keeps amounts realistic).
 */
const paymentSequenceArb = (maxPayments = 20) =>
  fc.array(
    fc.record({
      monthOffset: fc.integer({ min: 1, max: 60 }),
      amount: fc.double({ min: 10, max: 50000, noNaN: true, noDefaultInfinity: true })
        .filter(n => isFinite(n) && n >= 10),
    }),
    { minLength: 1, maxLength: maxPayments }
  );

/**
 * Generate optional rate change snapshots.
 * Each snapshot is { monthOffset, rate, balance } relative to start.
 */
const rateChangeSnapshotsArb = fc.array(
  fc.record({
    monthOffset: fc.integer({ min: 1, max: 48 }),
    rate: fc.double({ min: 0.01, max: 15, noNaN: true, noDefaultInfinity: true })
      .filter(n => isFinite(n) && n >= 0.01),
    balance: fc.double({ min: 0, max: 2000000, noNaN: true, noDefaultInfinity: true })
      .filter(n => isFinite(n) && n >= 0),
  }),
  { minLength: 0, maxLength: 3 }
);

// ─── Helpers ───

/** Convert a start year/month + offset to { year, month } */
function offsetToYearMonth(startYear, startMonth, offset) {
  const totalMonths = (startYear * 12 + (startMonth - 1)) + offset;
  return {
    year: Math.floor(totalMonths / 12),
    month: (totalMonths % 12) + 1,
  };
}

/** Format year/month/day as YYYY-MM-DD */
function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Property 2: Interest Accrual Engine Correctness ───

describe('BalanceCalculationService Interest Accrual PBT', () => {
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
   * Property 2: Interest Accrual Engine Correctness
   *
   * For any mortgage with initial balance B, annual rate R, and a sequence of
   * payments, the Interest Accrual Engine shall produce a balance equal to
   * walking forward month-by-month from the anchor, adding
   * calculateMonthlyInterest(balance, effectiveRate) each month, and subtracting
   * payments in the month they occur. When balance snapshots exist with rate
   * changes, the engine uses the rate from the most recent snapshot.
   *
   * Tag: Feature: mortgage-balance-interest-tracking, Property 2
   * **Validates: Requirements 1.1, 1.3, 1.4, 7.1, 7.2, 7.3, 7.4, 9.4**
   */
  describe('Property 2: Interest Accrual Engine Correctness', () => {
    test('calculateBalance matches manual month-by-month walk with interest accrual', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageConfigArb,
          paymentSequenceArb(10),
          rateChangeSnapshotsArb,
          async (config, payments, rateSnapshots) => {
            mockDb = await createTestDatabase();

            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));

            // Freeze time to a known point after all possible payments
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2030-01-15T12:00:00Z'));

            const balanceCalculationService = require('./balanceCalculationService');

            // Create the mortgage
            const loan = await insertLoan(mockDb, {
              name: config.name,
              initial_balance: config.initial_balance,
              start_date: formatDate(config.start_year, config.start_month, 1),
              loan_type: 'mortgage',
              fixed_interest_rate: config.rate,
            });

            // Insert rate change snapshots (deduplicate by year-month)
            const snapshotMap = new Map();
            for (const snap of rateSnapshots) {
              const { year, month } = offsetToYearMonth(config.start_year, config.start_month, snap.monthOffset);
              const key = `${year}-${month}`;
              if (!snapshotMap.has(key)) {
                snapshotMap.set(key, { year, month, rate: snap.rate, balance: snap.balance });
              }
            }
            const insertedSnapshots = [];
            for (const [, snap] of snapshotMap) {
              await insertBalanceEntry(mockDb, {
                loan_id: loan.id,
                year: snap.year,
                month: snap.month,
                remaining_balance: snap.balance,
                rate: snap.rate,
              });
              insertedSnapshots.push(snap);
            }
            insertedSnapshots.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

            // Insert payments (deduplicate by date to avoid issues)
            const paymentDates = new Set();
            const insertedPayments = [];
            for (const pmt of payments) {
              const { year, month } = offsetToYearMonth(config.start_year, config.start_month, pmt.monthOffset);
              const dateStr = formatDate(year, month, 15);
              if (!paymentDates.has(dateStr)) {
                paymentDates.add(dateStr);
                await insertPayment(mockDb, {
                  loan_id: loan.id,
                  amount: pmt.amount,
                  payment_date: dateStr,
                });
                insertedPayments.push({ year, month, amount: pmt.amount });
              }
            }

            // Call the service
            const result = await balanceCalculationService.calculateBalance(loan.id);

            // Manual walk to compute expected balance
            // Determine anchor: most recent snapshot or initial_balance
            let anchorBalance, anchorYear, anchorMonth;
            if (insertedSnapshots.length > 0) {
              const latest = insertedSnapshots[insertedSnapshots.length - 1];
              anchorBalance = latest.balance;
              anchorYear = latest.year;
              anchorMonth = latest.month;
            } else {
              anchorBalance = config.initial_balance;
              anchorYear = config.start_year;
              anchorMonth = config.start_month;
            }

            // Resolve rate at anchor: find most recent snapshot with rate on or before anchor
            let currentRate = null;
            for (const snap of insertedSnapshots) {
              if (snap.rate != null && (snap.year < anchorYear || (snap.year === anchorYear && snap.month <= anchorMonth))) {
                currentRate = snap.rate;
              }
            }
            if (currentRate == null) {
              currentRate = config.rate; // fixed_interest_rate fallback
            }

            // Build payment map by year-month
            const pmtMap = {};
            for (const p of insertedPayments) {
              const key = `${p.year}-${p.month}`;
              if (!pmtMap[key]) pmtMap[key] = 0;
              pmtMap[key] += p.amount;
            }

            // Build snapshot map for rate updates
            const snapMap = {};
            for (const s of insertedSnapshots) {
              snapMap[`${s.year}-${s.month}`] = s;
            }

            // Walk from anchor+1 to 2029-12 (frozen time is 2030-01)
            let balance = anchorBalance;
            let wy = anchorYear;
            let wm = anchorMonth;
            wm++;
            if (wm > 12) { wm = 1; wy++; }

            while (wy < 2030 || (wy === 2030 && wm <= 1)) {
              const key = `${wy}-${wm}`;
              const snap = snapMap[key];
              if (snap && snap.rate != null) {
                currentRate = snap.rate;
              }

              const interest = calculateMonthlyInterest(balance, currentRate);
              balance += interest;

              const monthPmts = pmtMap[key];
              if (monthPmts) {
                balance -= monthPmts;
              }

              balance = Math.max(0, balance);

              wm++;
              if (wm > 12) { wm = 1; wy++; }
            }

            balance = Math.round(balance * 100) / 100;

            // Verify
            expect(result.interestAware).toBe(true);
            expect(result.currentBalance).toBeCloseTo(balance, 1);

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

  // ─── Property 3: Non-Negative Balance Invariant ───

  /**
   * Property 3: Non-Negative Balance Invariant
   *
   * For any mortgage balance calculation — regardless of initial balance,
   * interest rate, payment amounts, or payment count — the resulting current
   * balance shall be greater than or equal to zero.
   *
   * Tag: Feature: mortgage-balance-interest-tracking, Property 3
   * **Validates: Requirements 1.5**
   */
  describe('Property 3: Non-Negative Balance Invariant', () => {
    test('currentBalance is always >= 0 even with extreme payment amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: safeString({ minLength: 1, maxLength: 20 }),
            initial_balance: fc.double({ min: 1000, max: 500000, noNaN: true, noDefaultInfinity: true })
              .filter(n => isFinite(n) && n >= 1000),
            rate: fc.double({ min: 0.01, max: 15, noNaN: true, noDefaultInfinity: true })
              .filter(n => isFinite(n) && n >= 0.01),
          }),
          // Extreme payments: up to 10× the max balance
          fc.array(
            fc.record({
              monthOffset: fc.integer({ min: 1, max: 24 }),
              amount: fc.double({ min: 100, max: 5000000, noNaN: true, noDefaultInfinity: true })
                .filter(n => isFinite(n) && n >= 100),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (config, payments) => {
            mockDb = await createTestDatabase();

            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));

            jest.useFakeTimers();
            jest.setSystemTime(new Date('2028-01-15T12:00:00Z'));

            const balanceCalculationService = require('./balanceCalculationService');

            const loan = await insertLoan(mockDb, {
              name: config.name,
              initial_balance: config.initial_balance,
              start_date: '2024-01-01',
              loan_type: 'mortgage',
              fixed_interest_rate: config.rate,
            });

            // Insert extreme payments (deduplicate by date)
            const usedDates = new Set();
            for (const pmt of payments) {
              const { year, month } = offsetToYearMonth(2024, 1, pmt.monthOffset);
              const dateStr = formatDate(year, month, 15);
              if (!usedDates.has(dateStr)) {
                usedDates.add(dateStr);
                await insertPayment(mockDb, {
                  loan_id: loan.id,
                  amount: pmt.amount,
                  payment_date: dateStr,
                });
              }
            }

            const result = await balanceCalculationService.calculateBalance(loan.id);

            // The invariant: balance must never be negative
            expect(result.currentBalance).toBeGreaterThanOrEqual(0);
            expect(result.interestAware).toBe(true);

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

  // ─── Property 5: Interest-Aware Running Balance History ───

  /**
   * Property 5: Interest-Aware Running Balance History
   *
   * For any mortgage with a known rate and a sequence of payments,
   * getBalanceHistory() shall return entries where each runningBalance is
   * consistent (non-negative) and interestAccrued values are non-negative.
   *
   * Tag: Feature: mortgage-balance-interest-tracking, Property 5
   * **Validates: Requirements 4.1, 4.4**
   */
  describe('Property 5: Interest-Aware Running Balance History', () => {
    test('getBalanceHistory returns consistent running balances with non-negative interest', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageConfigArb,
          paymentSequenceArb(8),
          async (config, payments) => {
            mockDb = await createTestDatabase();

            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));

            jest.useFakeTimers();
            jest.setSystemTime(new Date('2030-01-15T12:00:00Z'));

            const balanceCalculationService = require('./balanceCalculationService');

            const loan = await insertLoan(mockDb, {
              name: config.name,
              initial_balance: config.initial_balance,
              start_date: formatDate(config.start_year, config.start_month, 1),
              loan_type: 'mortgage',
              fixed_interest_rate: config.rate,
            });

            // Insert payments (deduplicate by date)
            const usedDates = new Set();
            let insertedCount = 0;
            for (const pmt of payments) {
              const { year, month } = offsetToYearMonth(config.start_year, config.start_month, pmt.monthOffset);
              const dateStr = formatDate(year, month, 15);
              if (!usedDates.has(dateStr)) {
                usedDates.add(dateStr);
                await insertPayment(mockDb, {
                  loan_id: loan.id,
                  amount: pmt.amount,
                  payment_date: dateStr,
                });
                insertedCount++;
              }
            }

            const history = await balanceCalculationService.getBalanceHistory(loan.id);

            // Should have one entry per inserted payment
            expect(history.length).toBe(insertedCount);

            // Verify properties of each entry
            for (const entry of history) {
              // Running balance must be non-negative
              expect(entry.runningBalance).toBeGreaterThanOrEqual(0);
              // Interest accrued must be non-negative
              expect(entry.interestAccrued).toBeGreaterThanOrEqual(0);
              // Principal paid must be non-negative
              expect(entry.principalPaid).toBeGreaterThanOrEqual(0);
              // Payment must be positive
              expect(entry.payment).toBeGreaterThan(0);
              // Entry must have required fields
              expect(entry).toHaveProperty('id');
              expect(entry).toHaveProperty('date');
              expect(entry).toHaveProperty('runningBalance');
              expect(entry).toHaveProperty('interestAccrued');
              expect(entry).toHaveProperty('principalPaid');
            }

            // History should be in reverse chronological order (newest first)
            for (let i = 0; i < history.length - 1; i++) {
              expect(history[i].date >= history[i + 1].date).toBe(true);
            }

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

  // ─── Property 7: Non-Mortgage Loan Calculation Unchanged ───

  /**
   * Property 7: Non-Mortgage Loan Calculation Unchanged
   *
   * For any non-mortgage loan (loan_type = 'loan') with initial balance and
   * payment sequence, calculateBalance() shall return
   * max(0, initial_balance - sum(payments)) — the existing naive subtraction,
   * unaffected by interest accrual logic.
   *
   * Tag: Feature: mortgage-balance-interest-tracking, Property 7
   * **Validates: Requirements 4.2, 5.2**
   */
  describe('Property 7: Non-Mortgage Loan Calculation Unchanged', () => {
    test('non-mortgage loans use naive subtraction without interest accrual', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: safeString({ minLength: 1, maxLength: 30 }),
            initial_balance: fc.double({ min: 1000, max: 500000, noNaN: true, noDefaultInfinity: true })
              .filter(n => isFinite(n) && n >= 1000),
          }),
          fc.array(
            fc.record({
              monthOffset: fc.integer({ min: 1, max: 36 }),
              amount: fc.double({ min: 10, max: 10000, noNaN: true, noDefaultInfinity: true })
                .filter(n => isFinite(n) && n >= 10),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (config, payments) => {
            mockDb = await createTestDatabase();

            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));

            const balanceCalculationService = require('./balanceCalculationService');

            // Create a non-mortgage loan
            const loan = await insertLoan(mockDb, {
              name: config.name,
              initial_balance: config.initial_balance,
              start_date: '2024-01-01',
              loan_type: 'loan',
              fixed_interest_rate: null,
            });

            // Insert payments (deduplicate by date)
            const usedDates = new Set();
            let totalPayments = 0;
            for (const pmt of payments) {
              const { year, month } = offsetToYearMonth(2024, 1, pmt.monthOffset);
              const dateStr = formatDate(year, month, 15);
              if (!usedDates.has(dateStr)) {
                usedDates.add(dateStr);
                await insertPayment(mockDb, {
                  loan_id: loan.id,
                  amount: pmt.amount,
                  payment_date: dateStr,
                });
                totalPayments += pmt.amount;
              }
            }

            const result = await balanceCalculationService.calculateBalance(loan.id);

            // Non-mortgage: naive subtraction, no interest
            const expectedBalance = Math.max(0, config.initial_balance - totalPayments);
            expect(result.currentBalance).toBeCloseTo(expectedBalance, 2);

            // Should NOT have interest accrual fields set to truthy values
            expect(result.interestAware).toBeUndefined();
            expect(result.totalInterestAccrued).toBeUndefined();

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
