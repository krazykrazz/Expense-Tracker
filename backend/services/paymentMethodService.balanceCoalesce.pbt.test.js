/**
 * Property-Based Tests for Credit Card Balance COALESCE Behavior
 * 
 * Feature: credit-card-posted-date
 * Property 2: Balance Calculation Uses Effective Posting Date
 * Property 3: Balance Date Filtering
 * 
 * **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 5.1, 5.3**
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (fkErr) => {
          if (fkErr) {
            reject(fkErr);
          } else {
            resolve(db);
          }
        });
      }
    });
  });
}

// Helper function to close database
function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create tables with posted_date column
function createTables(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
          display_name TEXT NOT NULL UNIQUE,
          full_name TEXT,
          account_details TEXT,
          credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
          current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
          payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
          billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
          billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      db.run(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          posted_date TEXT DEFAULT NULL,
          place TEXT,
          notes TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL,
          week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
          method TEXT NOT NULL,
          payment_method_id INTEGER REFERENCES payment_methods(id),
          insurance_eligible INTEGER DEFAULT 0,
          claim_status TEXT DEFAULT NULL,
          original_cost REAL DEFAULT NULL
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS credit_card_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payment_method_id INTEGER NOT NULL REFERENCES payment_methods(id),
          amount REAL NOT NULL,
          payment_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

// Helper function to insert credit card
function insertCreditCard(db, displayName, fullName) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, current_balance, is_active)
       VALUES ('credit_card', ?, ?, 0, 1)`,
      [displayName, fullName],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to insert expense with optional posted_date
function insertExpense(db, date, postedDate, place, amount, type, week, method, paymentMethodId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, posted_date, place, amount, type, week, method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, postedDate, place, amount, type, week, method, paymentMethodId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

// Helper function to insert credit card payment
function insertPayment(db, paymentMethodId, amount, paymentDate) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date)
       VALUES (?, ?, ?)`,
      [paymentMethodId, amount, paymentDate],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

/**
 * Calculate dynamic balance using COALESCE logic (mirrors paymentMethodService._calculateDynamicBalance)
 * Formula: (expenses where COALESCE(posted_date, date) <= referenceDate) - (all payments)
 */
function calculateDynamicBalance(db, paymentMethodId, referenceDate) {
  return new Promise((resolve, reject) => {
    // Sum expenses where effective posting date <= reference date
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, referenceDate],
      (err, expenseRow) => {
        if (err) return reject(err);
        
        const expenseTotal = expenseRow?.total || 0;
        
        // Sum all payments
        db.get(
          `SELECT COALESCE(SUM(amount), 0) as total 
           FROM credit_card_payments 
           WHERE payment_method_id = ?`,
          [paymentMethodId],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            const paymentTotal = paymentRow?.total || 0;
            const balance = Math.max(0, Math.round((expenseTotal - paymentTotal) * 100) / 100);
            
            resolve(balance);
          }
        );
      }
    );
  });
}

// Arbitrary for generating unique display names
let displayNameCounter = 0;
const uniqueDisplayName = () => {
  displayNameCounter++;
  return fc.constant(`TestCard_COALESCE_${displayNameCounter}_${Date.now()}`);
};

// Arbitrary for generating valid dates in YYYY-MM-DD format
const validDate = fc.integer({ min: 2020, max: 2025 })
  .chain(year => fc.integer({ min: 1, max: 12 })
    .chain(month => fc.integer({ min: 1, max: 28 })
      .map(day => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)));

// Arbitrary for expense types
const expenseType = fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Other');

// Helper to add days to a date string
function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('PaymentMethodService - Balance COALESCE Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-posted-date
   * Property 2: Balance Calculation Uses Effective Posting Date
   * 
   * For any credit card expense with payment_method_id matching a credit card,
   * the balance calculation SHALL use COALESCE(posted_date, date) as the effective posting date.
   * When posted_date is NULL, the transaction date is used; when posted_date is provided, it is used instead.
   * 
   * **Validates: Requirements 1.2, 1.3, 2.1, 5.1, 5.3**
   */
  test('Property 2: Balance uses COALESCE(posted_date, date) - NULL posted_date uses transaction date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate,
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, transactionDate, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create expense with NULL posted_date
            await insertExpense(
              db,
              transactionDate,
              null, // NULL posted_date
              'Test Place',
              amount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of transaction date
            const balanceOnTxDate = await calculateDynamicBalance(db, cardId, transactionDate);
            
            // Property: With NULL posted_date, expense should be included when reference date >= transaction date
            expect(balanceOnTxDate).toBeCloseTo(amount, 2);
            
            // Calculate balance one day before transaction date
            const dayBefore = addDays(transactionDate, -1);
            const balanceBeforeTxDate = await calculateDynamicBalance(db, cardId, dayBefore);
            
            // Property: Expense should NOT be included when reference date < transaction date
            expect(balanceBeforeTxDate).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 2: Balance Calculation Uses Effective Posting Date (with posted_date set)
   * 
   * When posted_date is provided, it is used instead of transaction date for balance calculation.
   * 
   * **Validates: Requirements 1.3, 2.1, 5.1**
   */
  test('Property 2: Balance uses posted_date when provided (not transaction date)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate,
        fc.integer({ min: 1, max: 10 }), // Days between transaction and posting
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, transactionDate, daysUntilPosting, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Calculate posted_date (transaction date + daysUntilPosting)
            const postedDate = addDays(transactionDate, daysUntilPosting);
            
            // Create expense with explicit posted_date
            await insertExpense(
              db,
              transactionDate,
              postedDate,
              'Test Place',
              amount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of transaction date (before posting)
            const balanceOnTxDate = await calculateDynamicBalance(db, cardId, transactionDate);
            
            // Property: Expense should NOT be included when reference date < posted_date
            // (even though reference date >= transaction date)
            expect(balanceOnTxDate).toBe(0);
            
            // Calculate balance as of posted_date
            const balanceOnPostedDate = await calculateDynamicBalance(db, cardId, postedDate);
            
            // Property: Expense SHOULD be included when reference date >= posted_date
            expect(balanceOnPostedDate).toBeCloseTo(amount, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 2: Backward Compatibility - NULL posted_date behaves like legacy
   * 
   * For expenses with NULL posted_date, the balance calculation should produce
   * the same result as before this feature was added (using transaction date).
   * 
   * **Validates: Requirements 5.1, 5.3**
   */
  test('Property 2: NULL posted_date maintains backward compatibility', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        fc.array(
          fc.record({
            date: validDate,
            amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        validDate,
        async (displayName, expenses, referenceDate) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create expenses with NULL posted_date
            for (const exp of expenses) {
              await insertExpense(
                db,
                exp.date,
                null, // NULL posted_date
                'Test Place',
                exp.amount,
                'Other',
                1,
                displayName,
                cardId
              );
            }
            
            // Calculate balance using COALESCE logic
            const actualBalance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Calculate expected balance using legacy logic (just transaction date)
            const expectedBalance = expenses
              .filter(exp => exp.date <= referenceDate)
              .reduce((sum, exp) => sum + exp.amount, 0);
            
            // Property: COALESCE with NULL should equal legacy behavior
            expect(actualBalance).toBeCloseTo(Math.round(expectedBalance * 100) / 100, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });
});


describe('PaymentMethodService - Balance Date Filtering Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-posted-date
   * Property 3: Balance Date Filtering
   * 
   * For any credit card and any reference date (today), the calculated balance SHALL only
   * include expenses where COALESCE(posted_date, date) <= today.
   * Expenses with effective posting date in the future are excluded.
   * 
   * **Validates: Requirements 2.2, 2.3, 2.4**
   */
  test('Property 3: Balance excludes expenses with future effective posting date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate, // Reference date (today)
        fc.integer({ min: 1, max: 30 }), // Days in future
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, referenceDate, daysInFuture, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create expense with future transaction date (NULL posted_date)
            const futureDate = addDays(referenceDate, daysInFuture);
            await insertExpense(
              db,
              futureDate,
              null, // NULL posted_date means use transaction date
              'Future Expense',
              amount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of reference date
            const balance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Property: Future expenses should NOT be included in balance
            expect(balance).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 3: Balance includes expenses with past/current effective posting date
   * 
   * **Validates: Requirements 2.2, 2.4**
   */
  test('Property 3: Balance includes expenses with past or current effective posting date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate, // Reference date (today)
        fc.integer({ min: 0, max: 30 }), // Days in past (0 = same day)
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        expenseType,
        async (displayName, referenceDate, daysInPast, amount, type) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create expense with past/current transaction date (NULL posted_date)
            const pastDate = addDays(referenceDate, -daysInPast);
            await insertExpense(
              db,
              pastDate,
              null, // NULL posted_date means use transaction date
              'Past Expense',
              amount,
              type,
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of reference date
            const balance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Property: Past/current expenses SHOULD be included in balance
            expect(balance).toBeCloseTo(amount, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 3: NULL posted_date with future transaction date excluded from balance
   * 
   * When an expense has a NULL posted_date and a future transaction date,
   * the system SHALL exclude it from the current balance.
   * 
   * **Validates: Requirements 2.3**
   */
  test('Property 3: NULL posted_date with future transaction date is excluded', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate, // Reference date (today)
        fc.integer({ min: 1, max: 60 }), // Days in future
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (displayName, referenceDate, daysInFuture, amount) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create pre-logged future expense with NULL posted_date
            const futureDate = addDays(referenceDate, daysInFuture);
            await insertExpense(
              db,
              futureDate,
              null, // NULL posted_date
              'Pre-logged Future Expense',
              amount,
              'Other',
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of reference date
            const balance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Property: Pre-logged future expense with NULL posted_date should be excluded
            expect(balance).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 3: NULL posted_date with past/current transaction date included in balance
   * 
   * When an expense has a NULL posted_date and a past or current transaction date,
   * the system SHALL include it in the current balance.
   * 
   * **Validates: Requirements 2.4**
   */
  test('Property 3: NULL posted_date with past/current transaction date is included', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate, // Reference date (today)
        fc.integer({ min: 0, max: 60 }), // Days in past (0 = same day)
        fc.float({ min: Math.fround(10), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100),
        async (displayName, referenceDate, daysInPast, amount) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            // Create expense with past/current date and NULL posted_date
            const pastDate = addDays(referenceDate, -daysInPast);
            await insertExpense(
              db,
              pastDate,
              null, // NULL posted_date
              'Past Expense',
              amount,
              'Other',
              1,
              displayName,
              cardId
            );
            
            // Calculate balance as of reference date
            const balance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Property: Past/current expense with NULL posted_date should be included
            expect(balance).toBeCloseTo(amount, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * Feature: credit-card-posted-date
   * Property 3: Mixed expenses - only effective posting dates <= reference are included
   * 
   * For a mix of expenses with various date/posted_date combinations,
   * only those with effective posting date <= reference date are included.
   * 
   * **Validates: Requirements 2.2, 2.3, 2.4**
   */
  test('Property 3: Mixed expenses - correct filtering by effective posting date', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        validDate, // Reference date
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -30, max: 30 }), // Days from reference date
            hasPostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: 0, max: 10 }), // Additional days for posted_date
            amount: fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, referenceDate, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Create credit card
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card');
            
            let expectedBalance = 0;
            
            // Create expenses based on configs
            for (const config of expenseConfigs) {
              const transactionDate = addDays(referenceDate, config.daysOffset);
              let postedDate = null;
              let effectiveDate = transactionDate;
              
              if (config.hasPostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
                effectiveDate = postedDate;
              }
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Expense',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              // Calculate expected: include only if effective date <= reference date
              if (effectiveDate <= referenceDate) {
                expectedBalance += config.amount;
              }
            }
            
            // Calculate actual balance
            const actualBalance = await calculateDynamicBalance(db, cardId, referenceDate);
            
            // Property: Balance should match expected (only effective dates <= reference)
            expect(actualBalance).toBeCloseTo(Math.round(expectedBalance * 100) / 100, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });
});
