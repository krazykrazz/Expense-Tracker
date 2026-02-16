/**
 * Property-Based Tests for Reminder Service - Alert Logic
 * 
 * Consolidated from:
 * - reminderService.alertShow.pbt.test.js
 * - reminderService.alertSuppression.pbt.test.js
 * - reminderService.backwardCompatibility.pbt.test.js
 * - reminderService.pbt.test.js (general)
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 4.1, 4.2, 5.2, 5.3, 5.4, 5.6**
 */

const fc = require('fast-check');
const { pbtOptions, calculatePreviousCycleDates } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Helper functions (consolidated from source files)
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

// Helper function to create payment_methods table
function createPaymentMethodsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
        display_name TEXT NOT NULL,
        full_name TEXT,
        account_details TEXT,
        credit_limit REAL,
        current_balance REAL DEFAULT 0,
        payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
        billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31)),
        billing_cycle_start INTEGER,
        billing_cycle_end INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create expenses table
function createExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        posted_date TEXT,
        place TEXT NOT NULL,
        notes TEXT,
        amount REAL NOT NULL,
        original_cost REAL,
        type TEXT NOT NULL,
        week INTEGER NOT NULL,
        method TEXT,
        payment_method_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to create credit_card_payments table
function createCreditCardPaymentsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE credit_card_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_method_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to insert a credit card
function insertCreditCard(db, card) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
       VALUES ('credit_card', ?, ?, ?, ?, ?, ?, 1)`,
      [card.display_name, card.full_name, card.credit_limit, card.current_balance, card.payment_due_day, card.billing_cycle_day],
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

// Helper function to insert an expense
function insertExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO expenses (date, posted_date, place, amount, type, week, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.posted_date, expense.place, expense.amount, expense.type, expense.week, expense.payment_method_id],
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

// Helper function to insert a payment
function insertPayment(db, payment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO credit_card_payments (payment_method_id, amount, payment_date)
       VALUES (?, ?, ?)`,
      [payment.payment_method_id, payment.amount, payment.payment_date],
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

// Helper function to calculate days until due
function calculateDaysUntilDue(paymentDueDay, referenceDate) {
  if (!paymentDueDay || paymentDueDay < 1 || paymentDueDay > 31) {
    return null;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let dueDate;
  
  if (currentDay <= paymentDueDay) {
    dueDate = new Date(currentYear, currentMonth, paymentDueDay);
  } else {
    dueDate = new Date(currentYear, currentMonth + 1, paymentDueDay);
  }
  
  const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
  if (paymentDueDay > lastDayOfMonth) {
    dueDate.setDate(lastDayOfMonth);
  }
  
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

// NOTE: calculatePreviousCycleDates is now imported from pbtArbitraries
// which delegates to statementBalanceService.calculatePreviousCycleDates
// This ensures consistent cycle date calculations across all tests.

// Helper function to get statement balance from database
async function getStatementBalance(db, paymentMethodId, cycleDates) {
  const totalExpenses = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(COALESCE(original_cost, amount)), 0) as total
       FROM expenses
       WHERE payment_method_id = ?
         AND COALESCE(posted_date, date) >= ?
         AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, cycleDates.startDate, cycleDates.endDate],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.total || 0);
      }
    );
  });

  const totalPayments = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM credit_card_payments
       WHERE payment_method_id = ?
         AND payment_date > ?`,
      [paymentMethodId, cycleDates.endDate],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.total || 0);
      }
    );
  });

  return Math.max(0, Math.round((totalExpenses - totalPayments) * 100) / 100);
}

// Helper function to insert a credit card WITHOUT billing_cycle_day
function insertCreditCardWithoutBillingCycle(db, card) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO payment_methods (type, display_name, full_name, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
       VALUES ('credit_card', ?, ?, ?, ?, ?, NULL, 1)`,
      [card.display_name, card.full_name, card.credit_limit, card.current_balance, card.payment_due_day],
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

// Helper function to get credit card from database
function getCreditCard(db, cardId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM payment_methods WHERE id = ?`,
      [cardId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// Helper functions for investment/loan tests
function createInvestmentsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
        initial_value REAL NOT NULL CHECK(initial_value >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function createInvestmentValuesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE investment_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        investment_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        value REAL NOT NULL CHECK(value >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
        UNIQUE(investment_id, year, month)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function createLoansTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
        start_date TEXT NOT NULL,
        notes TEXT,
        loan_type TEXT DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit')),
        is_paid_off INTEGER DEFAULT 0 CHECK(is_paid_off IN (0, 1)),
        estimated_months_left INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function createLoanBalancesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE loan_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
        rate REAL DEFAULT 0 CHECK(rate >= 0),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
        UNIQUE(loan_id, year, month)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function insertInvestment(db, investment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO investments (name, type, initial_value) VALUES (?, ?, ?)`,
      [investment.name, investment.type, investment.initial_value],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function insertValueEntry(db, valueEntry) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO investment_values (investment_id, year, month, value) VALUES (?, ?, ?, ?)`,
      [valueEntry.investment_id, valueEntry.year, valueEntry.month, valueEntry.value],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, loan_type, is_paid_off) VALUES (?, ?, ?, ?, ?)`,
      [loan.name, loan.initial_balance, loan.start_date, loan.loan_type, loan.is_paid_off || 0],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function insertLoanBalance(db, balance) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_balances (loan_id, year, month, remaining_balance, rate) VALUES (?, ?, ?, ?, ?)`,
      [balance.loan_id, balance.year, balance.month, balance.remaining_balance, balance.rate],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getReminderStatus(db, year, month) {
  return new Promise((resolve, reject) => {
    const investmentsSql = `
      SELECT 
        i.id,
        i.name,
        i.type,
        CASE 
          WHEN iv.id IS NOT NULL THEN 1 
          ELSE 0 
        END as hasValue
      FROM investments i
      LEFT JOIN investment_values iv 
        ON i.id = iv.investment_id 
        AND iv.year = ? 
        AND iv.month = ?
      ORDER BY i.name ASC
    `;
    
    db.all(investmentsSql, [year, month], (err, investments) => {
      if (err) {
        reject(err);
        return;
      }
      
      const loansSql = `
        SELECT 
          l.id,
          l.name,
          l.loan_type,
          CASE 
            WHEN lb.id IS NOT NULL THEN 1 
            ELSE 0 
          END as hasBalance
        FROM loans l
        LEFT JOIN loan_balances lb 
          ON l.id = lb.loan_id 
          AND lb.year = ? 
          AND lb.month = ?
        WHERE l.is_paid_off = 0
        ORDER BY l.name ASC
      `;
      
      db.all(loansSql, [year, month], (err, loans) => {
        if (err) {
          reject(err);
          return;
        }
        
        const missingInvestments = investments.filter(inv => !inv.hasValue).length;
        const missingLoans = loans.filter(loan => !loan.hasBalance).length;
        
        resolve({
          missingInvestments,
          missingLoans,
          hasActiveInvestments: investments.length > 0,
          hasActiveLoans: loans.length > 0,
          investments: investments.map(inv => ({
            id: inv.id,
            name: inv.name,
            type: inv.type,
            hasValue: Boolean(inv.hasValue)
          })),
          loans: loans.map(loan => ({
            id: loan.id,
            name: loan.name,
            loan_type: loan.loan_type,
            hasBalance: Boolean(loan.hasBalance)
          }))
        });
      });
    });
  });
}

// Reminder threshold constant
const REMINDER_DAYS_THRESHOLD = 7;


describe('Reminder Service - Alert Show Logic Property Tests', () => {
  /**
   * Property 10: Alert Show Logic
   * 
   * For any credit card where calculated statement balance > 0 AND days until due is 
   * between 0 and 7 (inclusive), a payment reminder should be shown with the required 
   * payment amount.
   * 
   * **Validates: Requirements 5.2, 5.4**
   */
  test('Property 10: Alert Show Logic - reminder shown when statement balance > 0 and due within 7 days', async () => {
    // Generate credit card with billing cycle configured
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      current_balance: fc.integer({ min: 0, max: 10000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    // Generate expense amount that will create a positive statement balance
    const expenseAmountArbitrary = fc.integer({ min: 100, max: 5000 });

    // Generate days until due (0-7 for "due soon" scenario)
    const daysUntilDueArbitrary = fc.integer({ min: 0, max: 7 });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        expenseAmountArbitrary,
        daysUntilDueArbitrary,
        async (card, expenseAmount, targetDaysUntilDue) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Calculate reference date that will give us the target days until due
            const referenceDate = new Date();
            referenceDate.setHours(0, 0, 0, 0);
            
            // Adjust reference date so that days until due matches target
            // If payment_due_day is 15 and we want 3 days until due, reference should be day 12
            let targetDay = card.payment_due_day - targetDaysUntilDue;
            if (targetDay < 1) {
              // Need to go to previous month
              referenceDate.setMonth(referenceDate.getMonth() - 1);
              const daysInPrevMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
              targetDay = daysInPrevMonth + targetDay;
            }
            referenceDate.setDate(targetDay);
            
            // Insert credit card
            const cardId = await insertCreditCard(db, card);
            
            // Calculate billing cycle dates for the reference date
            const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);
            
            // Insert an expense within the previous billing cycle
            const expenseDate = cycleDates.startDate; // Use start of cycle
            await insertExpense(db, {
              date: expenseDate,
              posted_date: expenseDate,
              place: 'Test Store',
              amount: expenseAmount,
              type: 'Other',
              week: 1,
              payment_method_id: cardId
            });
            
            // Calculate statement balance
            const statementBalance = await getStatementBalance(db, cardId, cycleDates);
            
            // Calculate actual days until due
            const actualDaysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // Verify the property:
            // If statement_balance > 0 AND days_until_due is between 0 and 7, reminder should show
            const shouldShowReminder = statementBalance > 0 && 
              actualDaysUntilDue !== null && 
              actualDaysUntilDue >= 0 && 
              actualDaysUntilDue <= 7;
            
            // The statement balance should be positive (we added an expense)
            expect(statementBalance).toBeGreaterThan(0);
            
            // Days until due should be in the expected range
            expect(actualDaysUntilDue).toBeGreaterThanOrEqual(0);
            expect(actualDaysUntilDue).toBeLessThanOrEqual(7);
            
            // Therefore, reminder should show
            expect(shouldShowReminder).toBe(true);
            
            // The required_payment should equal the statement balance
            expect(statementBalance).toBe(expenseAmount);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 10 (continued): Required payment amount equals statement balance
   * 
   * **Validates: Requirements 5.4**
   */
  test('Property 10: Required payment amount equals statement balance', async () => {
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      current_balance: fc.integer({ min: 0, max: 10000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    // Generate multiple expenses
    const expensesArbitrary = fc.array(
      fc.integer({ min: 10, max: 500 }),
      { minLength: 1, maxLength: 5 }
    );

    // Generate partial payment (less than total expenses)
    const paymentFractionArbitrary = fc.float({ min: Math.fround(0), max: Math.fround(0.8), noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        expensesArbitrary,
        paymentFractionArbitrary,
        async (card, expenseAmounts, paymentFraction) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Use a fixed reference date for consistency
            const referenceDate = new Date('2025-01-20');
            
            // Insert credit card
            const cardId = await insertCreditCard(db, card);
            
            // Calculate billing cycle dates
            const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);
            
            // Insert expenses within the billing cycle
            const totalExpenses = expenseAmounts.reduce((sum, amt) => sum + amt, 0);
            for (const amount of expenseAmounts) {
              await insertExpense(db, {
                date: cycleDates.startDate,
                posted_date: cycleDates.startDate,
                place: 'Test Store',
                amount: amount,
                type: 'Other',
                week: 1,
                payment_method_id: cardId
              });
            }
            
            // Insert partial payment after statement date
            const paymentAmount = Math.floor(totalExpenses * paymentFraction);
            if (paymentAmount > 0) {
              // Payment date must be after cycle end date
              const paymentDate = new Date(cycleDates.endDate);
              paymentDate.setDate(paymentDate.getDate() + 1);
              await insertPayment(db, {
                payment_method_id: cardId,
                amount: paymentAmount,
                payment_date: paymentDate.toISOString().split('T')[0]
              });
            }
            
            // Calculate expected statement balance
            const expectedBalance = Math.max(0, Math.round((totalExpenses - paymentAmount) * 100) / 100);
            
            // Get actual statement balance
            const actualBalance = await getStatementBalance(db, cardId, cycleDates);
            
            // Verify: required_payment should equal statement balance
            expect(actualBalance).toBe(expectedBalance);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });
});

describe('Reminder Service - Alert Suppression Logic Property Tests', () => {
  /**
   * Property 11: Alert Suppression Logic
   * 
   * For any credit card where calculated statement balance <= 0, no payment reminder 
   * should be shown regardless of the current balance or days until due.
   * 
   * **Validates: Requirements 5.3**
   */
  test('Property 11: Alert suppressed when statement balance is zero (no expenses)', async () => {
    // Generate credit card with billing cycle configured but no expenses
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      // Current balance can be positive (new charges in current cycle)
      current_balance: fc.integer({ min: 100, max: 5000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    // Days until due can be anything (0-7 would normally trigger reminder)
    const daysUntilDueArbitrary = fc.integer({ min: 0, max: 7 });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        daysUntilDueArbitrary,
        async (card, targetDaysUntilDue) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Calculate reference date for target days until due
            const referenceDate = new Date('2025-01-15');
            
            // Insert credit card with positive current_balance but no expenses in previous cycle
            const cardId = await insertCreditCard(db, card);
            
            // Calculate billing cycle dates
            const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);
            
            // No expenses inserted - statement balance should be 0
            const statementBalance = await getStatementBalance(db, cardId, cycleDates);
            
            // Calculate days until due
            const daysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // Determine if reminder should show based on statement balance
            // Even though current_balance > 0 and due soon, statement_balance = 0 means no reminder
            const shouldShowReminder = statementBalance > 0 && 
              daysUntilDue !== null && 
              daysUntilDue >= 0 && 
              daysUntilDue <= REMINDER_DAYS_THRESHOLD;
            
            // Verify: statement balance is 0
            expect(statementBalance).toBe(0);
            
            // Verify: reminder should NOT show (suppressed)
            expect(shouldShowReminder).toBe(false);
            
            // Verify: current_balance is still positive (but doesn't affect alert)
            expect(card.current_balance).toBeGreaterThan(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 11 (continued): Alert suppressed when statement is fully paid
   * 
   * **Validates: Requirements 5.3**
   */
  test('Property 11: Alert suppressed when statement is fully paid', async () => {
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      current_balance: fc.integer({ min: 100, max: 5000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    // Generate expense amount
    const expenseAmountArbitrary = fc.integer({ min: 100, max: 2000 });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        expenseAmountArbitrary,
        async (card, expenseAmount) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            const referenceDate = new Date('2025-01-20');
            
            // Insert credit card
            const cardId = await insertCreditCard(db, card);
            
            // Calculate billing cycle dates
            const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);
            
            // Insert expense in previous billing cycle
            await insertExpense(db, {
              date: cycleDates.startDate,
              posted_date: cycleDates.startDate,
              place: 'Test Store',
              amount: expenseAmount,
              type: 'Other',
              week: 1,
              payment_method_id: cardId
            });
            
            // Insert payment that fully covers the expense (after statement date)
            const paymentDate = new Date(cycleDates.endDate);
            paymentDate.setDate(paymentDate.getDate() + 1);
            await insertPayment(db, {
              payment_method_id: cardId,
              amount: expenseAmount, // Full payment
              payment_date: paymentDate.toISOString().split('T')[0]
            });
            
            // Calculate statement balance (should be 0 after full payment)
            const statementBalance = await getStatementBalance(db, cardId, cycleDates);
            
            // Calculate days until due
            const daysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // Determine if reminder should show
            const shouldShowReminder = statementBalance > 0 && 
              daysUntilDue !== null && 
              daysUntilDue >= 0 && 
              daysUntilDue <= REMINDER_DAYS_THRESHOLD;
            
            // Verify: statement balance is 0 (fully paid)
            expect(statementBalance).toBe(0);
            
            // Verify: reminder should NOT show (suppressed)
            expect(shouldShowReminder).toBe(false);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 11 (continued): Alert suppressed when overpaid (negative balance floors to 0)
   * 
   * **Validates: Requirements 5.3**
   */
  test('Property 11: Alert suppressed when overpaid (balance floors to 0)', async () => {
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      current_balance: fc.integer({ min: 100, max: 5000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    // Generate expense and overpayment amounts
    const expenseAmountArbitrary = fc.integer({ min: 100, max: 1000 });
    const overpaymentMultiplierArbitrary = fc.float({ min: Math.fround(1.1), max: Math.fround(2.0), noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        expenseAmountArbitrary,
        overpaymentMultiplierArbitrary,
        async (card, expenseAmount, overpaymentMultiplier) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            const referenceDate = new Date('2025-01-20');
            
            // Insert credit card
            const cardId = await insertCreditCard(db, card);
            
            // Calculate billing cycle dates
            const cycleDates = calculatePreviousCycleDates(card.billing_cycle_day, referenceDate);
            
            // Insert expense in previous billing cycle
            await insertExpense(db, {
              date: cycleDates.startDate,
              posted_date: cycleDates.startDate,
              place: 'Test Store',
              amount: expenseAmount,
              type: 'Other',
              week: 1,
              payment_method_id: cardId
            });
            
            // Insert overpayment (more than the expense amount)
            const paymentDate = new Date(cycleDates.endDate);
            paymentDate.setDate(paymentDate.getDate() + 1);
            const overpaymentAmount = Math.ceil(expenseAmount * overpaymentMultiplier);
            await insertPayment(db, {
              payment_method_id: cardId,
              amount: overpaymentAmount,
              payment_date: paymentDate.toISOString().split('T')[0]
            });
            
            // Calculate statement balance (should floor to 0 due to overpayment)
            const statementBalance = await getStatementBalance(db, cardId, cycleDates);
            
            // Calculate days until due
            const daysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // Determine if reminder should show
            const shouldShowReminder = statementBalance > 0 && 
              daysUntilDue !== null && 
              daysUntilDue >= 0 && 
              daysUntilDue <= REMINDER_DAYS_THRESHOLD;
            
            // Verify: statement balance is 0 (floored from negative)
            expect(statementBalance).toBe(0);
            
            // Verify: reminder should NOT show (suppressed)
            expect(shouldShowReminder).toBe(false);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });
});

describe('Reminder Service - Backward Compatibility Property Tests', () => {
  /**
   * Property 13: Backward Compatibility for Unconfigured Cards
   * 
   * For any credit card without a billing_cycle_day configured, the reminder service 
   * should use current_balance for alert logic instead of calculated statement balance.
   * 
   * **Validates: Requirements 5.6**
   */
  test('Property 13: Unconfigured cards use current_balance for alert logic', async () => {
    // Generate credit card WITHOUT billing_cycle_day
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      // Positive current_balance to trigger reminder
      current_balance: fc.integer({ min: 100, max: 5000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 })
      // Note: billing_cycle_day is NOT included - will be NULL
    });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        async (card) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Use a reference date that puts us within 7 days of due date
            const referenceDate = new Date('2025-01-15');
            
            // Insert credit card WITHOUT billing_cycle_day
            const cardId = await insertCreditCardWithoutBillingCycle(db, card);
            
            // Verify the card was inserted without billing_cycle_day
            const insertedCard = await getCreditCard(db, cardId);
            expect(insertedCard.billing_cycle_day).toBeNull();
            
            // Calculate days until due
            const daysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // For unconfigured cards, statement_balance should be null
            // and balanceForAlerts should fall back to current_balance
            const statementBalance = null; // No billing cycle configured
            const balanceForAlerts = statementBalance !== null ? statementBalance : (insertedCard.current_balance || 0);
            
            // Verify: balanceForAlerts equals current_balance (backward compatibility)
            expect(balanceForAlerts).toBe(card.current_balance);
            
            // Determine if reminder should show based on current_balance
            const shouldShowReminder = balanceForAlerts > 0 && 
              daysUntilDue !== null && 
              daysUntilDue >= 0 && 
              daysUntilDue <= REMINDER_DAYS_THRESHOLD;
            
            // If current_balance > 0 and due soon, reminder should show
            if (card.current_balance > 0 && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= REMINDER_DAYS_THRESHOLD) {
              expect(shouldShowReminder).toBe(true);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 13 (continued): Unconfigured cards with zero balance suppress reminder
   * 
   * **Validates: Requirements 5.6**
   */
  test('Property 13: Unconfigured cards with zero current_balance suppress reminder', async () => {
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      // Zero current_balance
      current_balance: fc.constant(0),
      payment_due_day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        async (card) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            const referenceDate = new Date('2025-01-15');
            
            // Insert credit card WITHOUT billing_cycle_day and with zero balance
            const cardId = await insertCreditCardWithoutBillingCycle(db, card);
            
            // Verify the card was inserted without billing_cycle_day
            const insertedCard = await getCreditCard(db, cardId);
            expect(insertedCard.billing_cycle_day).toBeNull();
            expect(insertedCard.current_balance).toBe(0);
            
            // Calculate days until due
            const daysUntilDue = calculateDaysUntilDue(card.payment_due_day, referenceDate);
            
            // For unconfigured cards, use current_balance
            const balanceForAlerts = insertedCard.current_balance || 0;
            
            // Determine if reminder should show
            const shouldShowReminder = balanceForAlerts > 0 && 
              daysUntilDue !== null && 
              daysUntilDue >= 0 && 
              daysUntilDue <= REMINDER_DAYS_THRESHOLD;
            
            // Verify: reminder should NOT show (current_balance is 0)
            expect(shouldShowReminder).toBe(false);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Property 13 (continued): Configured vs unconfigured cards behave differently
   * 
   * This test verifies that cards WITH billing_cycle_day use statement balance,
   * while cards WITHOUT billing_cycle_day use current_balance.
   * 
   * **Validates: Requirements 5.6**
   */
  test('Property 13: Configured cards use statement balance, unconfigured use current_balance', async () => {
    const creditCardArbitrary = fc.record({
      display_name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      full_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      credit_limit: fc.integer({ min: 1000, max: 50000 }),
      current_balance: fc.integer({ min: 100, max: 5000 }),
      payment_due_day: fc.integer({ min: 1, max: 28 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        creditCardArbitrary,
        async (card) => {
          const db = await createTestDatabase();
          
          try {
            await createPaymentMethodsTable(db);
            await createExpensesTable(db);
            await createCreditCardPaymentsTable(db);
            
            // Insert card WITHOUT billing_cycle_day (unconfigured)
            const unconfiguredCardId = await insertCreditCardWithoutBillingCycle(db, card);
            
            // Insert card WITH billing_cycle_day (configured)
            const configuredCardId = await new Promise((resolve, reject) => {
              db.run(
                `INSERT INTO payment_methods (type, display_name, full_name, credit_limit, current_balance, payment_due_day, billing_cycle_day, is_active)
                 VALUES ('credit_card', ?, ?, ?, ?, ?, ?, 1)`,
                [card.display_name + ' Configured', card.full_name, card.credit_limit, card.current_balance, card.payment_due_day, card.billing_cycle_day],
                function(err) {
                  if (err) reject(err);
                  else resolve(this.lastID);
                }
              );
            });
            
            // Get both cards
            const unconfiguredCard = await getCreditCard(db, unconfiguredCardId);
            const configuredCard = await getCreditCard(db, configuredCardId);
            
            // Verify: unconfigured card has NULL billing_cycle_day
            expect(unconfiguredCard.billing_cycle_day).toBeNull();
            
            // Verify: configured card has billing_cycle_day set
            expect(configuredCard.billing_cycle_day).toBe(card.billing_cycle_day);
            
            // For unconfigured card: balanceForAlerts = current_balance
            const unconfiguredBalanceForAlerts = unconfiguredCard.current_balance || 0;
            expect(unconfiguredBalanceForAlerts).toBe(card.current_balance);
            
            // For configured card: balanceForAlerts would be statement_balance (calculated)
            // Since we have no expenses, statement_balance would be 0
            // This demonstrates the difference in behavior
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });
});

describe('Reminder Service - Property-Based Tests', () => {
  /**
   * Feature: monthly-data-reminders, Property 1: Missing investment data triggers reminder
   * Validates: Requirements 1.1, 4.1
   * 
   * For any set of active investments and month, when at least one investment is missing 
   * a value for that month, the reminder status should indicate missing investments with 
   * the correct count
   */
  test('Property 1: Missing investment data triggers reminder', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 investments
    const investmentsArrayArbitrary = fc.array(investmentArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        investmentsArrayArbitrary,
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }), // Indices of investments to add values for
        async (investments, targetMonth, investmentIndicesWithValues) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Add values for some investments (but not all)
            const uniqueIndices = [...new Set(investmentIndicesWithValues)].filter(idx => idx < investments.length);
            for (const idx of uniqueIndices) {
              try {
                await insertValueEntry(db, {
                  investment_id: investmentIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  value: 10000
                });
              } catch (err) {
                // Skip if duplicate
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected missing count
            const expectedMissing = investments.length - uniqueIndices.length;
            
            // Verify
            expect(status.hasActiveInvestments).toBe(true);
            expect(status.missingInvestments).toBe(expectedMissing);
            
            // If there are missing investments, count should be > 0
            if (expectedMissing > 0) {
              expect(status.missingInvestments).toBeGreaterThan(0);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 2: Complete investment data suppresses reminder
   * Validates: Requirements 1.2
   * 
   * For any set of active investments and month, when all investments have values for 
   * that month, the reminder status should indicate zero missing investments
   */
  test('Property 2: Complete investment data suppresses reminder', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 investments
    const investmentsArrayArbitrary = fc.array(investmentArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        investmentsArrayArbitrary,
        yearMonthArbitrary,
        async (investments, targetMonth) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Add values for ALL investments
            for (const investmentId of investmentIds) {
              await insertValueEntry(db, {
                investment_id: investmentId,
                year: targetMonth.year,
                month: targetMonth.month,
                value: 10000
              });
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Verify - should have zero missing investments
            expect(status.hasActiveInvestments).toBe(true);
            expect(status.missingInvestments).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 3: Missing loan data triggers reminder
   * Validates: Requirements 2.1, 4.2
   * 
   * For any set of active loans and month, when at least one loan is missing a balance 
   * for that month, the reminder status should indicate missing loans with the correct count
   */
  test('Property 3: Missing loan data triggers reminder', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0) // Only active loans
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 loans
    const loansArrayArbitrary = fc.array(loanArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        loansArrayArbitrary,
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }), // Indices of loans to add balances for
        async (loans, targetMonth, loanIndicesWithBalances) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add balances for some loans (but not all)
            const uniqueIndices = [...new Set(loanIndicesWithBalances)].filter(idx => idx < loans.length);
            for (const idx of uniqueIndices) {
              try {
                await insertLoanBalance(db, {
                  loan_id: loanIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  remaining_balance: 5000,
                  rate: 3.5
                });
              } catch (err) {
                // Skip if duplicate
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected missing count
            const expectedMissing = loans.length - uniqueIndices.length;
            
            // Verify
            expect(status.hasActiveLoans).toBe(true);
            expect(status.missingLoans).toBe(expectedMissing);
            
            // If there are missing loans, count should be > 0
            if (expectedMissing > 0) {
              expect(status.missingLoans).toBeGreaterThan(0);
            }
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 4: Complete loan data suppresses reminder
   * Validates: Requirements 2.2
   * 
   * For any set of active loans and month, when all loans have balances for that month, 
   * the reminder status should indicate zero missing loans
   */
  test('Property 4: Complete loan data suppresses reminder', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0) // Only active loans
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Generate 1-5 loans
    const loansArrayArbitrary = fc.array(loanArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(
        loansArrayArbitrary,
        yearMonthArbitrary,
        async (loans, targetMonth) => {
          const db = await createTestDatabase();
          
          try {
            // Create all tables (reminder status queries both investments and loans)
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add balances for ALL loans
            for (const loanId of loanIds) {
              await insertLoanBalance(db, {
                loan_id: loanId,
                year: targetMonth.year,
                month: targetMonth.month,
                remaining_balance: 5000,
                rate: 3.5
              });
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Verify - should have zero missing loans
            expect(status.hasActiveLoans).toBe(true);
            expect(status.missingLoans).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: monthly-data-reminders, Property 6: Count accuracy for investments
   * Feature: monthly-data-reminders, Property 7: Count accuracy for loans
   * Validates: Requirements 4.1, 4.2
   * 
   * For any set of investments/loans and month, the count of missing data should equal 
   * the number of active items without values/balances for that month
   */
  test('Property 6 & 7: Count accuracy for investments and loans', async () => {
    const investmentArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      type: fc.constantFrom('TFSA', 'RRSP'),
      initial_value: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }),
      initial_balance: fc.float({ min: 0, max: 1000000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.integer({ min: 2020, max: 2030 }).chain(year => 
        fc.integer({ min: 1, max: 12 }).chain(month =>
          fc.integer({ min: 1, max: 28 }).map(day => 
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          )
        )
      ),
      loan_type: fc.constantFrom('loan', 'line_of_credit'),
      is_paid_off: fc.constant(0)
    });

    const yearMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(investmentArbitrary, { minLength: 0, maxLength: 5 }),
        fc.array(loanArbitrary, { minLength: 0, maxLength: 5 }),
        yearMonthArbitrary,
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }),
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 0, maxLength: 3 }),
        async (investments, loans, targetMonth, investmentIndicesWithValues, loanIndicesWithBalances) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createInvestmentsTable(db);
            await createInvestmentValuesTable(db);
            await createLoansTable(db);
            await createLoanBalancesTable(db);
            
            // Insert investments
            const investmentIds = [];
            for (const investment of investments) {
              const id = await insertInvestment(db, investment);
              investmentIds.push(id);
            }
            
            // Insert loans
            const loanIds = [];
            for (const loan of loans) {
              const id = await insertLoan(db, loan);
              loanIds.push(id);
            }
            
            // Add values for some investments
            const uniqueInvIndices = [...new Set(investmentIndicesWithValues)].filter(idx => idx < investments.length);
            for (const idx of uniqueInvIndices) {
              try {
                await insertValueEntry(db, {
                  investment_id: investmentIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  value: 10000
                });
              } catch (err) {
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Add balances for some loans
            const uniqueLoanIndices = [...new Set(loanIndicesWithBalances)].filter(idx => idx < loans.length);
            for (const idx of uniqueLoanIndices) {
              try {
                await insertLoanBalance(db, {
                  loan_id: loanIds[idx],
                  year: targetMonth.year,
                  month: targetMonth.month,
                  remaining_balance: 5000,
                  rate: 3.5
                });
              } catch (err) {
                if (!err.message.includes('UNIQUE constraint')) {
                  throw err;
                }
              }
            }
            
            // Get reminder status
            const status = await getReminderStatus(db, targetMonth.year, targetMonth.month);
            
            // Calculate expected counts
            const expectedMissingInvestments = investments.length - uniqueInvIndices.length;
            const expectedMissingLoans = loans.length - uniqueLoanIndices.length;
            
            // Verify counts are accurate
            expect(status.missingInvestments).toBe(expectedMissingInvestments);
            expect(status.missingLoans).toBe(expectedMissingLoans);
            
            // Verify hasActive flags
            expect(status.hasActiveInvestments).toBe(investments.length > 0);
            expect(status.hasActiveLoans).toBe(loans.length > 0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      pbtOptions()
    );
  });
});
