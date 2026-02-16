/**
 * Property-Based Tests for PaymentSuggestionService - Loan Average Payment Suggestion
 *
 * Feature: loan-payment-tracking
 * Tests Property 8: Loan Average Payment Suggestion
 *
 * For any loan (not mortgage) with payment history, the payment suggestion
 * should return the arithmetic mean of all previous payment amounts.
 *
 * **Validates: Requirements 3.2**
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
            amortization_period INTEGER,
            term_length INTEGER,
            renewal_date TEXT,
            rate_type TEXT,
            payment_frequency TEXT,
            estimated_property_value REAL,
            fixed_interest_rate REAL,
            estimated_months_left INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Create mortgage_payments table (for tracking payment amounts over time)
          db.run(`
            CREATE TABLE mortgage_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              payment_amount REAL NOT NULL CHECK(payment_amount > 0),
              effective_date TEXT NOT NULL,
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
              db.run(`CREATE INDEX idx_mortgage_payments_loan_id ON mortgage_payments(loan_id)`, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                db.run(`CREATE INDEX idx_loan_payments_loan_id ON loan_payments(loan_id)`, (err) => {
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
      resolve({ id: this.lastID, ...loan, loan_type: loan.loan_type || 'loan' });
    });
  });
}

// Helper to insert a loan payment directly
function insertLoanPayment(db, loanId, amount, paymentDate, notes = null) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loan_payments (loan_id, amount, payment_date, notes)
      VALUES (?, ?, ?, ?)
    `;

    db.run(sql, [loanId, amount, paymentDate, notes], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        id: this.lastID,
        loan_id: loanId,
        amount,
        payment_date: paymentDate,
        notes
      });
    });
  });
}

// Arbitrary for a valid loan (not mortgage)
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 1000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan') // Regular loan, not mortgage
});

// Arbitrary for a positive payment amount
const paymentAmountArb = safeAmount({ min: 50, max: 2000 });

// Arbitrary for a payment date (past date)
const paymentDateArb = fc.record({
  year: fc.integer({ min: 2020, max: 2024 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 })
}).map(({ year, month, day }) => {
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
});

// Arbitrary for a list of payment amounts (for calculating average)
const paymentAmountsArb = fc.array(paymentAmountArb, { minLength: 1, maxLength: 10 });

describe('PaymentSuggestionService Property Tests - Loan Average Payment Suggestion', () => {
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
   * Property 8: Loan Average Payment Suggestion
   *
   * For any loan (not mortgage) with payment history, the payment suggestion
   * should return the arithmetic mean of all previous payment amounts.
   *
   * **Validates: Requirements 3.2**
   */
  describe('Property 8: Loan Average Payment Suggestion', () => {
    test('Loan with payment history should return average of all payments', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentAmountsArb,
          async (loan, paymentAmounts) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert all payments with different dates
            for (let i = 0; i < paymentAmounts.length; i++) {
              const month = (i % 12) + 1;
              const year = 2020 + Math.floor(i / 12);
              const paymentDate = `${year}-${month.toString().padStart(2, '0')}-15`;
              await insertLoanPayment(mockDb, createdLoan.id, paymentAmounts[i], paymentDate);
            }

            // Calculate expected average
            const totalAmount = paymentAmounts.reduce((sum, amount) => sum + amount, 0);
            const expectedAverage = totalAmount / paymentAmounts.length;
            const roundedExpectedAverage = Math.round(expectedAverage * 100) / 100;

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);

            // Verify the suggestion is the average of all payments
            expect(suggestion.suggestedAmount).toBeCloseTo(roundedExpectedAverage, 2);
            expect(suggestion.source).toBe('average_history');
            expect(suggestion.message).toContain('previous payment');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Loan with single payment should return that payment amount as average', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          paymentAmountArb,
          paymentDateArb,
          async (loan, paymentAmount, paymentDate) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert a single payment
            await insertLoanPayment(mockDb, createdLoan.id, paymentAmount, paymentDate);

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);

            // Verify the suggestion equals the single payment amount
            expect(suggestion.suggestedAmount).toBeCloseTo(paymentAmount, 2);
            expect(suggestion.source).toBe('average_history');
            expect(suggestion.confidence).toBe('low'); // Low confidence with only 1 payment
            expect(suggestion.message).toContain('1 previous payment');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Confidence should increase with more payment history', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          fc.integer({ min: 1, max: 10 }),
          paymentAmountArb,
          async (loan, paymentCount, baseAmount) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert payments
            for (let i = 0; i < paymentCount; i++) {
              const month = (i % 12) + 1;
              const year = 2020 + Math.floor(i / 12);
              const paymentDate = `${year}-${month.toString().padStart(2, '0')}-15`;
              await insertLoanPayment(mockDb, createdLoan.id, baseAmount, paymentDate);
            }

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);

            // Verify confidence level based on payment count
            if (paymentCount >= 6) {
              expect(suggestion.confidence).toBe('high');
            } else if (paymentCount >= 3) {
              expect(suggestion.confidence).toBe('medium');
            } else {
              expect(suggestion.confidence).toBe('low');
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

    test('Average calculation should be mathematically correct', async () => {
      await fc.assert(
        fc.asyncProperty(
          loanArb,
          // Use specific amounts to verify exact calculation
          fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 2, maxLength: 5 }),
          async (loan, intAmounts) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a loan
            const createdLoan = await insertLoan(mockDb, loan);

            // Insert payments with integer amounts for precise calculation
            for (let i = 0; i < intAmounts.length; i++) {
              const month = (i % 12) + 1;
              const year = 2020 + Math.floor(i / 12);
              const paymentDate = `${year}-${month.toString().padStart(2, '0')}-15`;
              await insertLoanPayment(mockDb, createdLoan.id, intAmounts[i], paymentDate);
            }

            // Calculate expected average manually
            const sum = intAmounts.reduce((a, b) => a + b, 0);
            const expectedAverage = sum / intAmounts.length;
            const roundedExpected = Math.round(expectedAverage * 100) / 100;

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);

            // Verify the calculation is mathematically correct
            expect(suggestion.suggestedAmount).toBeCloseTo(roundedExpected, 2);

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
