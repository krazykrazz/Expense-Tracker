/**
 * Property-Based Tests for LoanPaymentService - Validation
 * 
 * Consolidates:
 * - loanPaymentService.dateValidation.pbt.test.js (Date Validation)
 * - loanPaymentService.amountValidation.pbt.test.js (Amount Validation)
 * 
 * **Feature: loan-payment-tracking**
 * **Validates: Input validation for loan payment creation**
 * 
 * @invariant Input Validation: Loan payment dates must be valid and not in the future,
 * and payment amounts must be positive non-zero values.
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

// Valid date for testing
const validPaymentDate = '2024-01-15';

// Arbitrary for negative amounts
const negativeAmountArb = fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n < 0);

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
  fc.constant('2024/01/15'),
  fc.constant('2024.01.15'),
  fc.constant('2024 01 15'),
  fc.constant('01-15-2024'),
  fc.constant('15-01-2024'),
  fc.constant('2024-01'),
  fc.constant('2024'),
  fc.constant('01-15'),
  fc.constant('2024-01-15-00'),
  fc.constant('2024-13-01'),
  fc.constant('2024-00-01'),
  fc.constant('2024-01-32'),
  fc.constant('2024-01-00'),
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/^\d{4}-\d{2}-\d{2}$/.test(s)),
  fc.constant(''),
  fc.constant('null'),
  fc.constant('undefined')
);

describe('LoanPaymentService - Validation Property Tests', () => {
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

  // ============================================================================
  // Date Validation Tests (from loanPaymentService.dateValidation.pbt.test.js)
  // ============================================================================

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: futureDate,
                notes: null
              })
            ).rejects.toThrow('Payment date cannot be in the future');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: invalidDate,
                notes: null
              })
            ).rejects.toThrow(/Payment date/);

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: null,
                notes: null
              })
            ).rejects.toThrow('Payment date is required');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: validAmount,
                payment_date: undefined,
                notes: null
              })
            ).rejects.toThrow('Payment date is required');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: validAmount,
              payment_date: validDate,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.payment_date).toBe(validDate);

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];

            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: validAmount,
              payment_date: todayStr,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.payment_date).toBe(todayStr);

            await closeDatabase(mockDb);
            mockDb = null;
            return true;
          }
        ),
        dbPbtOptions()
      );
    });
  });


  // ============================================================================
  // Amount Validation Tests (from loanPaymentService.amountValidation.pbt.test.js)
  // ============================================================================

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: 0,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a positive number');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: negativeAmount,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a positive number');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: null,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount is required');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: undefined,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount is required');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: stringAmount,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a valid number');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            await expect(
              loanPaymentService.createPayment(createdLoan.id, {
                amount: NaN,
                payment_date: validPaymentDate,
                notes: null
              })
            ).rejects.toThrow('Payment amount must be a valid number');

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
            mockDb = await createTestDatabase();
            
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const loanPaymentService = require('./loanPaymentService');
            const createdLoan = await insertLoan(mockDb, loan);

            const payment = await loanPaymentService.createPayment(createdLoan.id, {
              amount: positiveAmount,
              payment_date: validPaymentDate,
              notes: null
            });

            expect(payment).toBeDefined();
            expect(payment.amount).toBeCloseTo(positiveAmount, 2);

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