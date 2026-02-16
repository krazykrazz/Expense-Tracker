/**
 * Property-Based Tests for PaymentSuggestionService - No Suggestion for Empty History
 *
 * Feature: loan-payment-tracking
 * Tests Property 9: No Suggestion for Empty History
 *
 * For any loan with no payment history and no monthly_payment field,
 * the payment suggestion should return null with source 'none'.
 *
 * **Validates: Requirements 3.3**
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

// Arbitrary for a valid loan (not mortgage)
const loanArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 1000, max: 100000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('loan') // Regular loan, not mortgage
});

// Arbitrary for a valid mortgage
const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100000, max: 1000000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  loan_type: fc.constant('mortgage')
});

describe('PaymentSuggestionService Property Tests - No Suggestion for Empty History', () => {
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
   * Property 9: No Suggestion for Empty History
   *
   * For any loan with no payment history and no monthly_payment field,
   * the payment suggestion should return null with source 'none'.
   *
   * **Validates: Requirements 3.3**
   */
  describe('Property 9: No Suggestion for Empty History', () => {
    test('Loan with no payment history should return null suggestion', async () => {
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
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a loan without any payment history
            const createdLoan = await insertLoan(mockDb, loan);

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);

            // Verify no suggestion is returned
            expect(suggestion.suggestedAmount).toBeNull();
            expect(suggestion.source).toBe('none');
            expect(suggestion.confidence).toBe('low');
            expect(suggestion.message).toContain('No payment history');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage with no configured payment should return null suggestion', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          async (mortgage) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a mortgage without any payment configuration
            const createdMortgage = await insertLoan(mockDb, mortgage);

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdMortgage.id);

            // Verify no suggestion is returned
            expect(suggestion.suggestedAmount).toBeNull();
            expect(suggestion.source).toBe('none');
            expect(suggestion.confidence).toBe('low');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Multiple loans without history should all return null suggestions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(loanArb, { minLength: 2, maxLength: 5 }),
          async (loans) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create all loans without any payment history
            const createdLoans = [];
            for (const loan of loans) {
              const created = await insertLoan(mockDb, loan);
              createdLoans.push(created);
            }

            // Verify each loan returns null suggestion
            for (const createdLoan of createdLoans) {
              const suggestion = await paymentSuggestionService.getSuggestion(createdLoan.id);
              
              expect(suggestion.suggestedAmount).toBeNull();
              expect(suggestion.source).toBe('none');
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

    test('Line of credit should throw error for payment suggestions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: safeString({ minLength: 1, maxLength: 50 }),
            initial_balance: safeAmount({ min: 1000, max: 50000 }),
            start_date: fc.constant('2020-01-01'),
            notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
            loan_type: fc.constant('line_of_credit')
          }),
          async (lineOfCredit) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a line of credit
            const createdLOC = await insertLoan(mockDb, lineOfCredit);

            // Verify that getting suggestion throws an error
            await expect(
              paymentSuggestionService.getSuggestion(createdLOC.id)
            ).rejects.toThrow('Payment suggestions are not available for lines of credit');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Non-existent loan should throw error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1000, max: 9999 }), // Random non-existent ID
          async (nonExistentId) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Verify that getting suggestion for non-existent loan throws an error
            await expect(
              paymentSuggestionService.getSuggestion(nonExistentId)
            ).rejects.toThrow('Loan not found');

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
