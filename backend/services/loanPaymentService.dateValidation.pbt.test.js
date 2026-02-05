/**
 * Property-Based Tests for LoanPaymentService - Date Validation
 *
 * Feature: loan-payment-tracking
 * Tests Property 5: Payment Date Validation
 *
 * For any payment date that is not in YYYY-MM-DD format or is in the future,
 * the system should reject the payment with a validation error.
 *
 * **Validates: Requirements 1.6**
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

// Valid amount for testing
const validAmount = 100;

/**
 * Arbitrary for future dates (dates after today)
 */
const futureDateArb = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  
  return fc.record({
    year: fc.integer({ min: currentYear, max: currentYear + 5 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  }).filter(({ year, month, day }) => {
    const date = new Date(year, month - 1, day);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return date > todayStart;
  }).map(({ year, month, day }) => {
    const monthStr = month.toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  });
};

/**
 * Arbitrary for valid past dates (dates on or before today)
 */
const validPastDateArb = () => {
  const today = new Date();
  const maxYear = today.getFullYear();
  const maxMonth = today.getMonth() + 1;
  const maxDay = today.getDate();
  
  return fc.record({
    year: fc.integer({ min: 2020, max: maxYear }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
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

/**
 * Arbitrary for invalid date formats
 */
const invalidDateFormatArb = fc.oneof(
  // Wrong separators
  fc.constant('2024/01/15'),
  fc.constant('2024.01.15'),
  fc.constant('2024 01 15'),
  // Wrong order
  fc.constant('01-15-2024'),
  fc.constant('15-01-2024'),
  // Missing parts
  fc.constant('2024-01'),
  fc.constant('2024'),
  fc.constant('01-15'),
  // Extra parts
  fc.constant('2024-01-15-00'),
  // Invalid month/day values (format is correct but values are invalid)
  fc.constant('2024-13-01'),
  fc.constant('2024-00-01'),
  fc.constant('2024-01-32'),
  fc.constant('2024-01-00'),
  // Random strings
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
  // Empty and null-like
  fc.constant(''),
  fc.constant('null'),
  fc.constant('undefined')
);

describe('LoanPaymentService Property Tests - Date Validation', () => {
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
   * Property 5: Payment Date Validation
   *
   * For any payment date that is not in YYYY-MM-DD format or is in the future,
   * the system should reject the payment with a validation error.
   *
   * **Validates: Requirements 1.6**
   */
  describe('Property 5: Payment Date Validation', () => {
    test('Future dates should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          futureDateArb(),
          async (loan, futureDate) => {
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

            // Attempt to create a payment with future date
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: futureDate,
                notes: null
              })
            ).rejects.toThrow('Payment date cannot be in the future');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Invalid date formats should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          invalidDateFormatArb,
          async (loan, invalidDate) => {
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

            // Attempt to create a payment with invalid date format
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: invalidDate,
                notes: null
              })
            ).rejects.toThrow(/Payment date/);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Null date should be rejected', async () => {
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

            // Attempt to create a payment with null date
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: null,
                notes: null
              })
            ).rejects.toThrow('Payment date is required');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Undefined date should be rejected', async () => {
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

            // Attempt to create a payment with undefined date
            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: undefined,
                notes: null
              })
            ).rejects.toThrow('Payment date is required');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Valid past dates should be accepted', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          validPastDateArb(),
          async (loan, validDate) => {
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

            // Create a payment with valid past date - should succeed
            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: validAmount,
              payment_date: validDate,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.payment_date).toBe(validDate);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Today\'s date should be accepted', async () => {
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

            // Get today's date in YYYY-MM-DD format
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            // Create a payment with today's date - should succeed
            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: validAmount,
              payment_date: todayStr,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.payment_date).toBe(todayStr);

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
