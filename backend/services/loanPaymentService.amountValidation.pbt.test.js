/**
 * Property-Based Tests for LoanPaymentService - Amount Validation
 *
 * Feature: loan-payment-tracking
 * Tests Property 4: Payment Amount Validation
 *
 * For any payment amount that is zero, negative, or non-numeric,
 * the system should reject the payment with a validation error.
 *
 * **Validates: Requirements 1.5**
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
            resolve(db);
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

// Arbitrary for a valid loan
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 1000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constantFrom('loan', 'mortgage')
});

// Arbitrary for zero amounts
const zeroAmountArb = fc.constant(0);

// Arbitrary for negative amounts
const negativeAmountArb = fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n < 0);

// Arbitrary for non-numeric amounts
const nonNumericAmountArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string().filter(s => isNaN(parseFloat(s))),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity)
);

// Valid date for testing
const validPaymentDate = '2024-01-15';

describe('LoanPaymentService Property Tests - Amount Validation', () => {
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
   * Property 4: Payment Amount Validation
   *
   * For any payment amount that is zero, negative, or non-numeric,
   * the system should reject the payment with a validation error.
   *
   * **Validates: Requirements 1.5**
   */
  describe('Property 4: Payment Amount Validation', () => {
    test('Zero amount should be rejected', async () => {
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
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with zero amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: 0,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a positive number');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Negative amounts should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          negativeAmountArb,
          async (loan, negativeAmount) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with negative amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: negativeAmount,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a positive number');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Null amount should be rejected', async () => {
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
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with null amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: null,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount is required');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Undefined amount should be rejected', async () => {
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
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with undefined amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: undefined,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount is required');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('String amounts should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.string().filter(s => s.trim().length > 0),
          async (loan, stringAmount) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with string amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: stringAmount,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a valid number');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('NaN amount should be rejected', async () => {
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
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Attempt to create a payment with NaN amount
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: NaN,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a valid number');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Positive amounts should be accepted', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          safeAmount({ min: 0.01, max: 10000 }),
          async (loan, positiveAmount) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Create a payment with positive amount - should succeed
            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: positiveAmount,
              payment_date: validPaymentDate,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.amount).toBeCloseTo(positiveAmount, 2);

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
