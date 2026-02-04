/**
 * Property-Based Tests for LoanPaymentService - CRUD Round-Trip
 *
 * Feature: loan-payment-tracking
 * Tests Property 1: Payment CRUD Round-Trip
 *
 * For any valid payment data (positive amount, valid date, optional notes),
 * creating a payment and then retrieving it should return the same data that was submitted.
 *
 * **Validates: Requirements 1.1, 1.3**
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
                resolve(db);
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

describe('LoanPaymentService Property Tests - CRUD Round-Trip', () => {
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
   * Property 1: Payment CRUD Round-Trip
   *
   * For any valid payment data (positive amount, valid date, optional notes),
   * creating a payment and then retrieving it should return the same data that was submitted.
   *
   * **Validates: Requirements 1.1, 1.3**
   */
  describe('Property 1: Payment CRUD Round-Trip', () => {
    test('Creating a payment and retrieving it should return the same data', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentDataArb,
          async (loan, paymentData) => {
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

            // Create a payment using the service
            const createdPayment = await loanPaymentService.createPayment(createdLoan.id, paymentData);

            // Verify the created payment has the correct data
            expect(createdPayment.loan_id).toBe(createdLoan.id);
            expect(createdPayment.amount).toBeCloseTo(paymentData.amount, 2);
            expect(createdPayment.payment_date).toBe(paymentData.payment_date);
            expect(createdPayment.notes).toBe(paymentData.notes);
            expect(createdPayment.id).toBeDefined();

            // Retrieve the payment by ID
            const retrievedPayment = await loanPaymentService.getPaymentById(createdPayment.id);

            // Verify the retrieved payment matches
            expect(retrievedPayment).not.toBeNull();
            expect(retrievedPayment.id).toBe(createdPayment.id);
            expect(retrievedPayment.loan_id).toBe(createdLoan.id);
            expect(retrievedPayment.amount).toBeCloseTo(paymentData.amount, 2);
            expect(retrievedPayment.payment_date).toBe(paymentData.payment_date);
            expect(retrievedPayment.notes).toBe(paymentData.notes);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Updating a payment should persist the changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentDataArb,
          paymentDataArb,
          async (loan, originalPayment, updatedPayment) => {
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

            // Create a payment
            const createdPayment = await loanPaymentService.createPayment(createdLoan.id, originalPayment);

            // Update the payment
            const result = await loanPaymentService.updatePayment(createdPayment.id, updatedPayment);

            // Verify update was successful
            expect(result).not.toBeNull();
            expect(result.id).toBe(createdPayment.id);
            expect(result.amount).toBeCloseTo(updatedPayment.amount, 2);
            expect(result.payment_date).toBe(updatedPayment.payment_date);
            expect(result.notes).toBe(updatedPayment.notes);

            // Retrieve and verify the update persisted
            const retrievedPayment = await loanPaymentService.getPaymentById(createdPayment.id);
            expect(retrievedPayment.amount).toBeCloseTo(updatedPayment.amount, 2);
            expect(retrievedPayment.payment_date).toBe(updatedPayment.payment_date);
            expect(retrievedPayment.notes).toBe(updatedPayment.notes);

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Deleting a payment should remove it from the database', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentDataArb,
          async (loan, paymentData) => {
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

            // Create a payment
            const createdPayment = await loanPaymentService.createPayment(createdLoan.id, paymentData);

            // Verify payment exists
            const beforeDelete = await loanPaymentService.getPaymentById(createdPayment.id);
            expect(beforeDelete).not.toBeNull();

            // Delete the payment
            const deleted = await loanPaymentService.deletePayment(createdPayment.id);
            expect(deleted).toBe(true);

            // Verify payment no longer exists
            const afterDelete = await loanPaymentService.getPaymentById(createdPayment.id);
            expect(afterDelete).toBeNull();

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Getting payments for a loan should include all created payments', async () => {
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
            
            const loanPaymentService = require('./loanPaymentService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Create all payments
            const createdPayments = [];
            for (const paymentData of payments) {
              const created = await loanPaymentService.createPayment(createdLoan.id, paymentData);
              createdPayments.push(created);
            }

            // Get all payments for the loan
            const retrievedPayments = await loanPaymentService.getPayments(createdLoan.id);

            // Verify we got all payments back
            expect(retrievedPayments.length).toBe(payments.length);

            // Verify each created payment is in the retrieved list
            for (const created of createdPayments) {
              const found = retrievedPayments.find(p => p.id === created.id);
              expect(found).toBeDefined();
              expect(found.amount).toBeCloseTo(created.amount, 2);
              expect(found.payment_date).toBe(created.payment_date);
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
  });
});
