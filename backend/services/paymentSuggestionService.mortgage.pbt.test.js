/**
 * Property-Based Tests for PaymentSuggestionService - Mortgage Payment Suggestion
 *
 * Feature: loan-payment-tracking
 * Tests Property 7: Mortgage Payment Suggestion
 *
 * For any mortgage with a monthly_payment field value M, the payment suggestion
 * should return M with source 'monthly_payment'.
 *
 * **Validates: Requirements 3.1**
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

// Helper to insert a mortgage directly
function insertMortgage(db, mortgage) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO loans (name, initial_balance, start_date, notes, loan_type, amortization_period, term_length)
      VALUES (?, ?, ?, ?, 'mortgage', ?, ?)
    `;

    const params = [
      mortgage.name,
      mortgage.initial_balance,
      mortgage.start_date,
      mortgage.notes || null,
      mortgage.amortization_period || 25,
      mortgage.term_length || 5
    ];

    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, ...mortgage, loan_type: 'mortgage' });
    });
  });
}

// Helper to insert a mortgage payment entry (payment amount configuration)
function insertMortgagePayment(db, mortgageId, paymentAmount, effectiveDate, notes = null) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO mortgage_payments (loan_id, payment_amount, effective_date, notes)
      VALUES (?, ?, ?, ?)
    `;

    db.run(sql, [mortgageId, paymentAmount, effectiveDate, notes], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        id: this.lastID,
        loan_id: mortgageId,
        payment_amount: paymentAmount,
        effective_date: effectiveDate,
        notes
      });
    });
  });
}

// Arbitrary for a valid mortgage
const mortgageArb = fc.record({
  name: safeString({ minLength: 1, maxLength: 50 }),
  initial_balance: safeAmount({ min: 100000, max: 1000000 }),
  start_date: fc.constant('2020-01-01'),
  notes: fc.option(safeString({ maxLength: 200 }), { nil: null }),
  amortization_period: fc.integer({ min: 15, max: 30 }),
  term_length: fc.integer({ min: 1, max: 10 })
});

// Arbitrary for a positive payment amount
const paymentAmountArb = safeAmount({ min: 500, max: 5000 });

// Arbitrary for an effective date (past date)
const effectiveDateArb = fc.record({
  year: fc.integer({ min: 2020, max: 2024 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 })
}).map(({ year, month, day }) => {
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
});

describe('PaymentSuggestionService Property Tests - Mortgage Payment Suggestion', () => {
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
   * Property 7: Mortgage Payment Suggestion
   *
   * For any mortgage with a monthly_payment field value M, the payment suggestion
   * should return M with source 'monthly_payment'.
   *
   * **Validates: Requirements 3.1**
   */
  describe('Property 7: Mortgage Payment Suggestion', () => {
    test('Mortgage with configured payment should return that amount with source monthly_payment', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          paymentAmountArb,
          effectiveDateArb,
          async (mortgage, paymentAmount, effectiveDate) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a mortgage
            const createdMortgage = await insertMortgage(mockDb, mortgage);

            // Configure a monthly payment amount
            await insertMortgagePayment(mockDb, createdMortgage.id, paymentAmount, effectiveDate);

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdMortgage.id);

            // Verify the suggestion matches the configured payment
            expect(suggestion.suggestedAmount).toBeCloseTo(paymentAmount, 2);
            expect(suggestion.source).toBe('monthly_payment');
            expect(suggestion.confidence).toBe('high');
            expect(suggestion.message).toContain('monthly payment');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage with multiple payment entries should return the most recent one', async () => {
      await fc.assert(
        fc.asyncProperty(
          mortgageArb,
          fc.array(
            fc.record({
              amount: paymentAmountArb,
              date: effectiveDateArb
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (mortgage, paymentEntries) => {
            // Create fresh database for each test
            mockDb = await createTestDatabase();
            
            // Re-require the service to use the new mock
            jest.resetModules();
            jest.mock('../database/db', () => ({
              getDatabase: jest.fn(() => Promise.resolve(mockDb))
            }));
            
            const paymentSuggestionService = require('./paymentSuggestionService');

            // Create a mortgage
            const createdMortgage = await insertMortgage(mockDb, mortgage);

            // Sort entries by date to find the most recent
            const sortedEntries = [...paymentEntries].sort((a, b) => 
              b.date.localeCompare(a.date)
            );
            const mostRecentEntry = sortedEntries[0];

            // Insert all payment entries
            for (const entry of paymentEntries) {
              await insertMortgagePayment(mockDb, createdMortgage.id, entry.amount, entry.date);
            }

            // Get the suggestion
            const suggestion = await paymentSuggestionService.getSuggestion(createdMortgage.id);

            // Verify the suggestion matches the most recent payment entry
            expect(suggestion.suggestedAmount).toBeCloseTo(mostRecentEntry.amount, 2);
            expect(suggestion.source).toBe('monthly_payment');
            expect(suggestion.confidence).toBe('high');

            // Clean up
            await closeDatabase(mockDb);
            mockDb = null;

            return true;
          }
        ),
        dbPbtOptions()
      );
    });

    test('Mortgage without configured payment should return null with source none', async () => {
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
            const createdMortgage = await insertMortgage(mockDb, mortgage);

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
  });
});
