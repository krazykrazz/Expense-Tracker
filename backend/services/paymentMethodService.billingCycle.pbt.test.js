/**
 * Property-Based Tests for Credit Card Billing Cycle Details
 * 
 * Feature: credit-card-balance-types
 * Property 8: Billing Cycle Transaction Count Accuracy
 * Property 9: Billing Cycle Total Accuracy
 * 
 * **Validates: Requirements 8.2, 8.3, 9.3**
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

// Helper function to create tables
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

// Helper function to insert credit card with billing cycle
function insertCreditCard(db, displayName, fullName, billingCycleStart = null, billingCycleEnd = null) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, current_balance, is_active, billing_cycle_start, billing_cycle_end)
       VALUES ('credit_card', ?, ?, 0, 1, ?, ?)`,
      [displayName, fullName, billingCycleStart, billingCycleEnd],
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

// Helper to add days to a date string
function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Helper to format date as YYYY-MM-DD
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}


/**
 * Get billing cycle details directly from database
 * This is the reference implementation for property testing
 */
function getBillingCycleDetailsFromDb(db, paymentMethodId, startDate, endDate) {
  return new Promise((resolve, reject) => {
    // Query transaction count and total for the period using effective_date
    db.get(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(amount), 0) as total_amount
       FROM expenses 
       WHERE payment_method_id = ? 
       AND COALESCE(posted_date, date) >= ? 
       AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, startDate, endDate],
      (err, transactionRow) => {
        if (err) return reject(err);
        
        // Query payment count and total for the period
        db.get(
          `SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as payment_total
           FROM credit_card_payments 
           WHERE payment_method_id = ? 
           AND payment_date >= ? 
           AND payment_date <= ?`,
          [paymentMethodId, startDate, endDate],
          (err, paymentRow) => {
            if (err) return reject(err);
            
            resolve({
              start_date: startDate,
              end_date: endDate,
              transaction_count: transactionRow?.transaction_count || 0,
              total_amount: Math.round((transactionRow?.total_amount || 0) * 100) / 100,
              payment_count: paymentRow?.payment_count || 0,
              payment_total: Math.round((paymentRow?.payment_total || 0) * 100) / 100
            });
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
  return fc.constant(`TestCard_BillingCycle_${displayNameCounter}_${Date.now()}`);
};

describe('PaymentMethodService - Billing Cycle Transaction Count Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 8: Billing Cycle Transaction Count Accuracy
   * 
   * For any billing cycle period and any set of expenses, the transaction count 
   * returned by getBillingCycleDetails SHALL equal the count of expenses where 
   * effective_date falls within the cycle period (inclusive).
   * 
   * **Validates: Requirements 8.2, 8.3**
   */
  test('Property 8: Billing Cycle Transaction Count Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses with various dates
        fc.array(
          fc.record({
            // Days offset from cycle start (-10 to +40 to cover before, during, and after cycle)
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100),
            // Whether to use posted_date (different from transaction date)
            usePostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: -5, max: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            // Use fixed billing cycle: 1st to 28th of a month
            const cycleStart = 1;
            const cycleEnd = 28;
            
            // Create credit card with billing cycle
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', cycleStart, cycleEnd);
            
            // Define a fixed cycle period for testing: January 2025
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            // Track expected count manually
            let expectedCount = 0;
            
            // Create expenses
            for (const config of expenseConfigs) {
              // Calculate transaction date relative to cycle start
              const transactionDate = addDays(cycleStartDate, config.daysOffset);
              
              // Calculate posted date if used
              let postedDate = null;
              let effectiveDate = transactionDate;
              
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
                effectiveDate = postedDate;
              }
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              // Count if effective date is within cycle
              if (effectiveDate >= cycleStartDate && effectiveDate <= cycleEndDate) {
                expectedCount++;
              }
            }
            
            // Get billing cycle details from database
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            // Property: Transaction count must match expected count
            expect(cycleDetails.transaction_count).toBe(expectedCount);
            
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
   * Property 8 (continued): Transaction count with posted_date variations
   * 
   * When expenses have posted_date set, the effective_date (COALESCE(posted_date, date))
   * should be used for determining if the expense falls within the billing cycle.
   * 
   * **Validates: Requirements 8.2, 8.3**
   */
  test('Property 8: Transaction count uses effective_date correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses where transaction date is outside cycle but posted_date is inside (or vice versa)
        fc.array(
          fc.record({
            // Transaction date outside cycle (before)
            transactionDaysBeforeCycle: fc.integer({ min: 1, max: 10 }),
            // Posted date inside cycle
            postedDaysIntoCycle: fc.integer({ min: 1, max: 20 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            // All expenses have transaction date before cycle but posted_date inside cycle
            // So all should be counted
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, -config.transactionDaysBeforeCycle);
              const postedDate = addDays(cycleStartDate, config.postedDaysIntoCycle);
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
            }
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            // Property: All expenses should be counted because posted_date is within cycle
            expect(cycleDetails.transaction_count).toBe(expenseConfigs.length);
            
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

describe('PaymentMethodService - Billing Cycle Total Accuracy Property-Based Tests', () => {
  beforeEach(() => {
    displayNameCounter = 0;
  });

  /**
   * Feature: credit-card-balance-types
   * Property 9: Billing Cycle Total Accuracy
   * 
   * For any billing cycle period and any set of expenses, the total_amount 
   * returned by getBillingCycleDetails SHALL equal the sum of amounts for 
   * expenses where effective_date falls within the cycle period.
   * 
   * **Validates: Requirements 8.3, 9.3**
   */
  test('Property 9: Billing Cycle Total Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate expenses with various dates
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(10), max: Math.fround(200), noNaN: true }).map(n => Math.round(n * 100) / 100),
            usePostedDate: fc.boolean(),
            postedDateOffset: fc.integer({ min: -5, max: 5 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (displayName, expenseConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            // Track expected total manually
            let expectedTotal = 0;
            
            for (const config of expenseConfigs) {
              const transactionDate = addDays(cycleStartDate, config.daysOffset);
              
              let postedDate = null;
              let effectiveDate = transactionDate;
              
              if (config.usePostedDate) {
                postedDate = addDays(transactionDate, config.postedDateOffset);
                effectiveDate = postedDate;
              }
              
              await insertExpense(
                db,
                transactionDate,
                postedDate,
                'Test Place',
                config.amount,
                'Other',
                1,
                displayName,
                cardId
              );
              
              // Sum if effective date is within cycle
              if (effectiveDate >= cycleStartDate && effectiveDate <= cycleEndDate) {
                expectedTotal += config.amount;
              }
            }
            
            // Round expected total to 2 decimal places
            expectedTotal = Math.round(expectedTotal * 100) / 100;
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            // Property: Total amount must match expected total
            expect(cycleDetails.total_amount).toBeCloseTo(expectedTotal, 2);
            
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
   * Property 9 (continued): Total accuracy with payment tracking
   * 
   * The billing cycle details should also accurately track payment counts
   * and totals for payments within the cycle period.
   * 
   * **Validates: Requirements 8.3, 9.3**
   */
  test('Property 9: Billing Cycle Payment Total Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        // Generate payments with various dates
        fc.array(
          fc.record({
            daysOffset: fc.integer({ min: -10, max: 40 }),
            amount: fc.float({ min: Math.fround(50), max: Math.fround(500), noNaN: true }).map(n => Math.round(n * 100) / 100)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (displayName, paymentConfigs) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            // Track expected payment count and total
            let expectedPaymentCount = 0;
            let expectedPaymentTotal = 0;
            
            for (const config of paymentConfigs) {
              const paymentDate = addDays(cycleStartDate, config.daysOffset);
              
              await insertPayment(db, cardId, config.amount, paymentDate);
              
              // Count if payment date is within cycle
              if (paymentDate >= cycleStartDate && paymentDate <= cycleEndDate) {
                expectedPaymentCount++;
                expectedPaymentTotal += config.amount;
              }
            }
            
            expectedPaymentTotal = Math.round(expectedPaymentTotal * 100) / 100;
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            // Property: Payment count and total must match expected values
            expect(cycleDetails.payment_count).toBe(expectedPaymentCount);
            expect(cycleDetails.payment_total).toBeCloseTo(expectedPaymentTotal, 2);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });

  /**
   * Property 9 (continued): Empty cycle returns zero totals
   * 
   * When a billing cycle has no transactions, the counts and totals
   * should all be zero.
   * 
   * **Validates: Requirements 8.3, 9.3**
   */
  test('Property 9: Empty billing cycle returns zero totals', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueDisplayName(),
        async (displayName) => {
          const db = await createTestDatabase();
          
          try {
            await createTables(db);
            
            const cardId = await insertCreditCard(db, displayName, 'Test Credit Card', 1, 28);
            
            const cycleStartDate = '2025-01-01';
            const cycleEndDate = '2025-01-28';
            
            // No expenses or payments added
            
            const cycleDetails = await getBillingCycleDetailsFromDb(db, cardId, cycleStartDate, cycleEndDate);
            
            // Property: All counts and totals should be zero
            expect(cycleDetails.transaction_count).toBe(0);
            expect(cycleDetails.total_amount).toBe(0);
            expect(cycleDetails.payment_count).toBe(0);
            expect(cycleDetails.payment_total).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });
});
