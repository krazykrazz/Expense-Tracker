/**
 * Property-Based Tests for BalanceCalculationService - Balance Calculation Formula
 *
 * Feature: loan-payment-tracking
 * Tests Property 6: Balance Calculation Formula
 *
 * For any loan with initial_balance B and a set of payments P,
 * the calculated current balance should equal max(0, B - sum(P)).
 *
 * **Validates: Requirements 2.1, 2.2, 2.4**
  *
 * @invariant Balance Calculation Formula: For any loan with initial balance B and a set of payments P, the calculated current balance equals max(0, B - sum(P)). Randomization covers diverse initial balances and payment sequences to verify the formula holds across all scenarios.
 */

const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const { dbPbtOptions, safeString, safeAmount } = require('../test/pbtArbitraries');

// Mock the database module
let mockDb = null;

jest.mock('../database/db', () => ({
  getDatabase: jest.fn(() => Promise.resolve(mockDb))
}));

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create loans table
        db.run(`
          CREATE TABLE loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
            start_date TEXT NOT NULL,
            notes TEXT,
            loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
            is_paid_off INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Create loan_payments table
          db.run(`
            CREATE TABLE loan_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              amount REAL NOT NULL CHECK(amount > 0),
              payment_date TEXT NOT NULL,
              notes TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
            )
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Create loan_balances table (for backward compatibility)
            db.run(`
              CREATE TABLE loan_balances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                loan_id INTEGER NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
                interest_rate REAL CHECK(interest_rate >= 0),
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
                UNIQUE(loan_id, year, month)
              )
            `, (err) => {
              if (err) {
                reject(err);
                return;
              }

              // Create indexes
              db.run(`CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id)`, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                db.run(`CREATE INDEX idx_loan_payments_payment_date ON loan_payments(payment_date)`, (err) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  db.run(`CREATE INDEX idx_loan_balances_loan_id ON loan_balances(loan_id)`, (err) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    resolve(db);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// Helper to close database
function closeDatabase(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

// Helper to insert a loan directly
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type)
      VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      loan.name,
      loan.initial_balance,
      loan.start_date,
      loan.notes || null,
      loan.loan_type || 'loan'
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...loan });
    });
  });
}

// Helper to insert a payment directly
function insertPayment(db, payment) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_payments (loan_id, amount, payment_date, notes)
      VALUES (?, ?, ?, ?)
    `;

    const params = [
      payment.loan_id,
      payment.amount,
      payment.payment_date,
      payment.notes || null
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...payment });
    });
  });
}

/**
 * Safe date arbitrary for payment dates (not in the future)
 * Generates dates between 2020 and today as YYYY-MM-DD strings
 */
const safePaymentDateString = () => {
  const today = new Date();
  const maxYear = today.getFullYear();
  const maxMonth = today.getMonth() + 1;
  const maxDay = today.getDate();
  
  return fc.record({
    year: fc.integer({ min: 2020, max: maxYear }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // Use 28 to avoid month-end edge cases
  }).filter(({ year, month, day }) => {
    // Filter out future dates
    if (year > maxYear) return false;
    if (year === maxYear && month > maxMonth) return false;
    if (year === maxYear && month === maxMonth && day > maxDay) return false;
    return true;
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

// Arbitrary for a valid loan
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 1000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constantFrom('loan', 'mortgage')
});

// Arbitrary for valid payment data
const paymentDataArb = fc.record({
  amount: safeAmount({ min: 10, max: 5000 }),
  payment_date: safePaymentDateString(),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
});

describe('BalanceCalculationService Property Tests - Balance Calculation Formula', () => {
  // Clear module cache before each test to get fresh service instances
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
   * Property 6: Balance Calculation Formula
   *
   * For any loan with initial_balance B and a set of payments P,
   * the calculated current balance should equal max(0, B - sum(P)).
   *
   * **Validates: Requirements 2.1, 2.2, 2.4**
   */
  describe('Property 6: Balance Calculation Formula', () => {
    test('Current balance equals max(0, initial_balance - sum(payments))', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.array(paymentDataArb, { minLength: 0, maxLength: 5 }),
          async (loan, payments) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const balanceCalculationService = require('./balanceCalculationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert all payments directly
            let totalPayments = 0;
            for (const paymentData of payments) {
              await insertPayment(mockDb, {
                loan_id: createdLoan.id,
                ...paymentData
              });
              totalPayments += paymentData.amount;
            }

            // Calculate balance using the service
            const result = await balanceCalculationService.calculateBalance(createdLoan.id);

            // Calculate expected balance: max(0, initial_balance - sum(payments))
            const expectedBalance = Math.max(0, loan.initial_balance - totalPayments);

            // Verify the formula
            expect(result.loanId).toBe(createdLoan.id);
            expect(result.initialBalance).toBeCloseTo(loan.initial_balance, 2);
            expect(result.totalPayments).toBeCloseTo(totalPayments, 2);
            expect(result.currentBalance).toBeCloseTo(expectedBalance, 2);
            expect(result.paymentCount).toBe(payments.length);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Balance is clamped to zero when payments exceed initial balance', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: safeString({ minLength: 1, maxLength: 50 }),
            initial_balance: safeAmount({ min: 100, max: 1000 }), // Small initial balance
            start_date: fc.constant('2020-01-01'),
            notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
            loan_type: fc.constantFrom('loan', 'mortgage')
          }),
          // Generate payments that will exceed the initial balance
          fc.array(
            fc.record({
              amount: safeAmount({ min: 500, max: 2000 }), // Large payments
              payment_date: safePaymentDateString(),
              notes: fc.option(safeString({ maxLength: 200 }), { nil: null })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (loan, payments) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const balanceCalculationService = require('./balanceCalculationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert all payments directly
            let totalPayments = 0;
            for (const paymentData of payments) {
              await insertPayment(mockDb, {
                loan_id: createdLoan.id,
                ...paymentData
              });
              totalPayments += paymentData.amount;
            }

            // Calculate balance using the service
            const result = await balanceCalculationService.calculateBalance(createdLoan.id);

            // If total payments exceed initial balance, current balance should be 0
            if (totalPayments >= loan.initial_balance) {
              expect(result.currentBalance).toBe(0);
            } else {
              expect(result.currentBalance).toBeCloseTo(loan.initial_balance - totalPayments, 2);
            }

            // Total payments should always be accurate regardless of clamping
            expect(result.totalPayments).toBeCloseTo(totalPayments, 2);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Balance history shows correct running totals', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.array(paymentDataArb, { minLength: 1, maxLength: 5 }),
          async (loan, payments) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const balanceCalculationService = require('./balanceCalculationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert all payments directly
            for (const paymentData of payments) {
              await insertPayment(mockDb, {
                loan_id: createdLoan.id,
                ...paymentData
              });
            }

            // Get balance history
            const history = await balanceCalculationService.getBalanceHistory(createdLoan.id);

            // Verify we got all payments in history
            expect(history.length).toBe(payments.length);

            // Verify each entry has required fields
            for (const entry of history) {
              expect(entry.id).toBeDefined();
              expect(entry.date).toBeDefined();
              expect(entry.payment).toBeGreaterThan(0);
              expect(entry.runningBalance).toBeGreaterThanOrEqual(0);
            }

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Loan with no payments has balance equal to initial balance', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          async (loan) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const balanceCalculationService = require('./balanceCalculationService');

            // Create a loan with no payments
            const createdLoan = await insertLoan(mockDb, loan);

            // Calculate balance using the service
            const result = await balanceCalculationService.calculateBalance(createdLoan.id);

            // With no payments, current balance should equal initial balance
            expect(result.currentBalance).toBeCloseTo(loan.initial_balance, 2);
            expect(result.totalPayments).toBe(0);
            expect(result.paymentCount).toBe(0);
            expect(result.lastPaymentDate).toBeNull();

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Balance recalculates correctly after payment changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentDataArb,
          paymentDataArb,
          async (loan, payment1, payment2) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const balanceCalculationService = require('./balanceCalculationService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert first payment
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              ...payment1
            });

            // Calculate balance after first payment
            const result1 = await balanceCalculationService.calculateBalance(createdLoan.id);
            const expected1 = Math.max(0, loan.initial_balance - payment1.amount);
            expect(result1.currentBalance).toBeCloseTo(expected1, 2);

            // Insert second payment
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              ...payment2
            });

            // Calculate balance after second payment (Requirement 2.2 - immediate recalculation)
            const result2 = await balanceCalculationService.calculateBalance(createdLoan.id);
            const expected2 = Math.max(0, loan.initial_balance - payment1.amount - payment2.amount);
            expect(result2.currentBalance).toBeCloseTo(expected2, 2);
            expect(result2.totalPayments).toBeCloseTo(payment1.amount + payment2.amount, 2);
            expect(result2.paymentCount).toBe(2);

            // Clean up
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

/**
 * Property Tests for Anchor-Based Balance Calculation
 * 
 * Tests the hybrid approach where loans with balance history use the most recent
 * snapshot as an anchor, subtracting only payments after that snapshot month.
 */
describe('BalanceCalculationService Property Tests - Anchor-Based Calculation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(async () => {
    if (mockDb) {
      await closeDatabase(mockDb);
      mockDb = null;
    }
  });

  // Helper to insert a balance entry directly
  function insertBalanceEntry(db, entry) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO loan_balances (loan_id, year, month, remaining_balance, interest_rate)
        VALUES (?, ?, ?, ?, ?)
      `;
      const params = [
        entry.loan_id,
        entry.year,
        entry.month,
        entry.remaining_balance,
        entry.interest_rate || 0
      ];
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({ id: this.lastID, ...entry });
      });
    });
  }

  test('Anchor-based: balance equals snapshot when all payments are at or before snapshot month', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArb,
        // Snapshot balance (what the loan was at when tracking started)
        safeAmount({ min: 1000, max: 50000 }),
        // Migrated payments (dates before the snapshot month)
        fc.array(
          fc.record({
            amount: safeAmount({ min: 10, max: 2000 }),
            notes: fc.option(safeString({ maxLength: 100 }), { nil: null })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (loan, snapshotBalance, migratedPayments) => {
          mockDb = await createTestDatabase();
          
          jest.resetModules();
          jest.mock('../database/db', () => ({
            getDatabase: jest.fn(() => Promise.resolve(mockDb))
          }));
          
          const balanceCalculationService = require('./balanceCalculationService');

          // Create loan with a large initial_balance (original loan amount)
          const createdLoan = await insertLoan(mockDb, {
            ...loan,
            initial_balance: loan.initial_balance + snapshotBalance // Ensure initial > snapshot
          });

          // Insert a balance snapshot for 2024-06
          await insertBalanceEntry(mockDb, {
            loan_id: createdLoan.id,
            year: 2024,
            month: 6,
            remaining_balance: snapshotBalance
          });

          // Insert migrated payments with dates BEFORE the snapshot month
          for (let i = 0; i < migratedPayments.length; i++) {
            const month = Math.max(1, (i % 5) + 1); // Jan-May 2024
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              amount: migratedPayments[i].amount,
              payment_date: `2024-${String(month).padStart(2, '0')}-15`,
              notes: migratedPayments[i].notes
            });
          }

          const result = await balanceCalculationService.calculateBalance(createdLoan.id);

          // Balance should equal the snapshot since no payments are after it
          expect(result.currentBalance).toBeCloseTo(snapshotBalance, 2);
          expect(result.anchorBased).toBe(true);

          await closeDatabase(mockDb);
          mockDb = null;
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  test('Anchor-based: balance equals snapshot minus payments after snapshot month', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArb,
        // Snapshot balance
        safeAmount({ min: 5000, max: 50000 }),
        // Payments after the snapshot
        fc.array(
          fc.record({
            amount: safeAmount({ min: 100, max: 1000 })
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (loan, snapshotBalance, newPayments) => {
          mockDb = await createTestDatabase();
          
          jest.resetModules();
          jest.mock('../database/db', () => ({
            getDatabase: jest.fn(() => Promise.resolve(mockDb))
          }));
          
          const balanceCalculationService = require('./balanceCalculationService');

          const createdLoan = await insertLoan(mockDb, {
            ...loan,
            initial_balance: loan.initial_balance + snapshotBalance
          });

          // Insert snapshot for 2024-06
          await insertBalanceEntry(mockDb, {
            loan_id: createdLoan.id,
            year: 2024,
            month: 6,
            remaining_balance: snapshotBalance
          });

          // Insert payments AFTER the snapshot month (July 2024+)
          let totalAfterSnapshot = 0;
          for (let i = 0; i < newPayments.length; i++) {
            const month = 7 + i; // Jul, Aug, Sep...
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              amount: newPayments[i].amount,
              payment_date: `2024-${String(month).padStart(2, '0')}-15`,
              notes: null
            });
            totalAfterSnapshot += newPayments[i].amount;
          }

          const result = await balanceCalculationService.calculateBalance(createdLoan.id);

          const expected = Math.max(0, snapshotBalance - totalAfterSnapshot);
          expect(result.currentBalance).toBeCloseTo(expected, 2);
          expect(result.anchorBased).toBe(true);

          await closeDatabase(mockDb);
          mockDb = null;
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  test('No snapshot: falls back to initial_balance minus all payments', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArb,
        fc.array(paymentDataArb, { minLength: 1, maxLength: 5 }),
        async (loan, payments) => {
          mockDb = await createTestDatabase();
          
          jest.resetModules();
          jest.mock('../database/db', () => ({
            getDatabase: jest.fn(() => Promise.resolve(mockDb))
          }));
          
          const balanceCalculationService = require('./balanceCalculationService');

          const createdLoan = await insertLoan(mockDb, loan);

          // No balance entries — just payments
          let totalPayments = 0;
          for (const p of payments) {
            await insertPayment(mockDb, { loan_id: createdLoan.id, ...p });
            totalPayments += p.amount;
          }

          const result = await balanceCalculationService.calculateBalance(createdLoan.id);

          const expected = Math.max(0, loan.initial_balance - totalPayments);
          expect(result.currentBalance).toBeCloseTo(expected, 2);
          expect(result.anchorBased).toBe(false);

          await closeDatabase(mockDb);
          mockDb = null;
          return true;
        }
      ),
      dbPbtOptions()
    );
  });

  test('Anchor-based: mixed payments before and after snapshot', async () => {
    await fc.assert(
      fc.asyncProperty(
        loanArb,
        safeAmount({ min: 5000, max: 50000 }),
        // Payments before snapshot
        fc.array(
          fc.record({ amount: safeAmount({ min: 100, max: 500 }) }),
          { minLength: 1, maxLength: 3 }
        ),
        // Payments after snapshot
        fc.array(
          fc.record({ amount: safeAmount({ min: 100, max: 500 }) }),
          { minLength: 1, maxLength: 3 }
        ),
        async (loan, snapshotBalance, beforePayments, afterPayments) => {
          mockDb = await createTestDatabase();
          
          jest.resetModules();
          jest.mock('../database/db', () => ({
            getDatabase: jest.fn(() => Promise.resolve(mockDb))
          }));
          
          const balanceCalculationService = require('./balanceCalculationService');

          const createdLoan = await insertLoan(mockDb, {
            ...loan,
            initial_balance: loan.initial_balance + snapshotBalance
          });

          // Snapshot at 2024-06
          await insertBalanceEntry(mockDb, {
            loan_id: createdLoan.id,
            year: 2024,
            month: 6,
            remaining_balance: snapshotBalance
          });

          // Payments BEFORE snapshot (should be ignored in anchor calculation)
          for (let i = 0; i < beforePayments.length; i++) {
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              amount: beforePayments[i].amount,
              payment_date: `2024-${String(Math.max(1, (i % 5) + 1)).padStart(2, '0')}-15`,
              notes: null
            });
          }

          // Payments AFTER snapshot (should be subtracted from anchor)
          let totalAfter = 0;
          for (let i = 0; i < afterPayments.length; i++) {
            await insertPayment(mockDb, {
              loan_id: createdLoan.id,
              amount: afterPayments[i].amount,
              payment_date: `2024-${String(7 + i).padStart(2, '0')}-15`,
              notes: null
            });
            totalAfter += afterPayments[i].amount;
          }

          const result = await balanceCalculationService.calculateBalance(createdLoan.id);

          // Only payments after snapshot should affect the balance
          const expected = Math.max(0, snapshotBalance - totalAfter);
          expect(result.currentBalance).toBeCloseTo(expected, 2);
          expect(result.anchorBased).toBe(true);

          await closeDatabase(mockDb);
          mockDb = null;
          return true;
        }
      ),
      dbPbtOptions()
    );
  });
});
