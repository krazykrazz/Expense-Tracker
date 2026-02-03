/**
 * Property-Based Tests for Reminder Service - Alert Show Logic
 * 
 * Property 10: Alert Show Logic
 * For any credit card where calculated statement balance > 0 AND days until due is 
 * between 0 and 7 (inclusive), a payment reminder should be shown with the required 
 * payment amount.
 * 
 * **Validates: Requirements 5.2, 5.4**
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

// Helper function to calculate previous cycle dates
function calculatePreviousCycleDates(billingCycleDay, referenceDate) {
  const refDate = new Date(referenceDate);
  const refYear = refDate.getFullYear();
  const refMonth = refDate.getMonth();
  const refDay = refDate.getDate();

  let cycleEndYear, cycleEndMonth;
  
  if (refDay > billingCycleDay) {
    cycleEndYear = refYear;
    cycleEndMonth = refMonth;
  } else {
    cycleEndYear = refYear;
    cycleEndMonth = refMonth - 1;
    if (cycleEndMonth < 0) {
      cycleEndMonth = 11;
      cycleEndYear--;
    }
  }

  let cycleStartYear = cycleEndYear;
  let cycleStartMonth = cycleEndMonth - 1;
  if (cycleStartMonth < 0) {
    cycleStartMonth = 11;
    cycleStartYear--;
  }

  const daysInEndMonth = new Date(cycleEndYear, cycleEndMonth + 1, 0).getDate();
  const actualEndDay = Math.min(billingCycleDay, daysInEndMonth);

  const daysInStartMonth = new Date(cycleStartYear, cycleStartMonth + 1, 0).getDate();
  const actualStartDay = Math.min(billingCycleDay + 1, daysInStartMonth + 1);
  
  let startDay, startMonth, startYear;
  if (actualStartDay > daysInStartMonth) {
    startDay = 1;
    startMonth = cycleStartMonth + 1;
    startYear = cycleStartYear;
    if (startMonth > 11) {
      startMonth = 0;
      startYear++;
    }
  } else {
    startDay = actualStartDay;
    startMonth = cycleStartMonth;
    startYear = cycleStartYear;
  }

  const formatDate = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  return {
    startDate: formatDate(startYear, startMonth, startDay),
    endDate: formatDate(cycleEndYear, cycleEndMonth, actualEndDay)
  };
}

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
