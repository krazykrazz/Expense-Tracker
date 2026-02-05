/**
 * Property-Based Tests for Auto Payment Logger Service - Eligibility
 * Feature: fixed-expense-loan-linkage
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
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

// Helper function to create loans table
function createLoansTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
        start_date TEXT NOT NULL,
        notes TEXT,
        loan_type TEXT DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
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

// Helper function to create fixed_expenses table
function createFixedExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        category TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
        linked_loan_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (linked_loan_id) REFERENCES loans(id) ON DELETE SET NULL
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to create loan_payments table
function createLoanPaymentsTable(db) {
  return new Promise((resolve, reject) => {
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
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper function to insert loan
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

// Helper function to insert fixed expense
function insertFixedExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [expense.year, expense.month, expense.name, expense.amount, expense.category, 
       expense.payment_type, expense.payment_due_day, expense.linked_loan_id],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Helper function to insert loan payment
function insertLoanPayment(db, payment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)`,
      [payment.loan_id, payment.amount, payment.payment_date, payment.notes || null],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Helper function to get linked fixed expenses for month
function getLinkedFixedExpensesForMonth(db, year, month) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        fe.id as fixed_expense_id, fe.name as fixed_expense_name, fe.amount,
        fe.payment_due_day, fe.linked_loan_id, fe.year, fe.month,
        l.id as loan_id, l.name as loan_name, l.loan_type, l.is_paid_off
      FROM fixed_expenses fe
      INNER JOIN loans l ON fe.linked_loan_id = l.id
      WHERE fe.linked_loan_id IS NOT NULL 
        AND fe.payment_due_day IS NOT NULL
        AND fe.year = ? AND fe.month = ?
      ORDER BY fe.payment_due_day ASC
    `;
    db.all(sql, [year, month], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Helper function to check if payment exists for month
function hasPaymentForMonth(db, loanId, year, month) {
  return new Promise((resolve, reject) => {
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;
    
    const sql = `
      SELECT COUNT(*) as count
      FROM loan_payments 
      WHERE loan_id = ? 
        AND payment_date >= ?
        AND payment_date <= ?
    `;
    
    db.get(sql, [loanId, startDate, endDate], (err, row) => {
      if (err) reject(err);
      else resolve(row && row.count > 0);
    });
  });
}

// Helper function to get payment status for multiple loans
function getPaymentStatusForMonth(db, loanIds, year, month) {
  return new Promise((resolve, reject) => {
    if (!loanIds || loanIds.length === 0) {
      resolve(new Map());
      return;
    }
    
    const monthStr = String(month).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-31`;
    
    const placeholders = loanIds.map(() => '?').join(',');
    const sql = `
      SELECT loan_id, COUNT(*) as count
      FROM loan_payments 
      WHERE loan_id IN (${placeholders})
        AND payment_date >= ?
        AND payment_date <= ?
      GROUP BY loan_id
    `;
    
    const params = [...loanIds, startDate, endDate];
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      
      const result = new Map();
      loanIds.forEach(id => result.set(id, false));
      
      (rows || []).forEach(row => {
        if (row.count > 0) {
          result.set(row.loan_id, true);
        }
      });
      
      resolve(result);
    });
  });
}

// Simulate getPendingAutoLogSuggestions logic
async function getPendingAutoLogSuggestions(db, year, month, referenceDate) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const currentDayOfMonth = today.getDate();
  
  const linkedExpenses = await getLinkedFixedExpensesForMonth(db, year, month);
  
  if (linkedExpenses.length === 0) {
    return [];
  }
  
  const loanIds = [...new Set(linkedExpenses.map(e => e.loan_id))];
  const paymentStatusMap = await getPaymentStatusForMonth(db, loanIds, year, month);
  
  const eligibleExpenses = linkedExpenses.filter(expense => {
    // Skip if loan is paid off
    if (expense.is_paid_off === 1) {
      return false;
    }
    
    // Skip if payment already exists for this month
    if (paymentStatusMap.get(expense.loan_id)) {
      return false;
    }
    
    // Only include if due day has passed or is today
    if (expense.payment_due_day > currentDayOfMonth) {
      return false;
    }
    
    return true;
  });
  
  return eligibleExpenses.map(expense => {
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(expense.payment_due_day).padStart(2, '0');
    const paymentDate = `${year}-${monthStr}-${dayStr}`;
    
    return {
      fixedExpenseId: expense.fixed_expense_id,
      fixedExpenseName: expense.fixed_expense_name,
      amount: expense.amount,
      paymentDueDay: expense.payment_due_day,
      loanId: expense.loan_id,
      loanName: expense.loan_name,
      loanType: expense.loan_type,
      suggestedPaymentDate: paymentDate
    };
  });
}

describe('Auto Payment Logger Service - Eligibility - Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 9: Auto-Log Suggestion Eligibility
   * **Validates: Requirements 4.1**
   * 
   * For any linked fixed expense where payment_due_day ≤ current day of month AND 
   * no loan_payment exists for the current month, getPendingAutoLogSuggestions should 
   * include that expense. If payment_due_day > current day OR payment exists, it should 
   * not be included.
   */
  test('Property 9: Auto-Log Suggestion Eligibility - Due Day Passed Without Payment', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    // Generate test data where due day has passed
    const testDataArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      // Current day is between 15-28 to ensure we can have due days that have passed
      currentDay: fc.integer({ min: 15, max: 28 }),
      // Due day is before current day (1 to currentDay-1)
      expenseAmount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    }).chain(data => 
      fc.record({
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fc.constant(v)])),
        // Due day must be <= current day for eligibility
        paymentDueDay: fc.integer({ min: 1, max: data.currentDay })
      })
    );

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        testDataArbitrary,
        async (loan, testData) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Insert linked fixed expense with due day that has passed
            const expenseId = await insertFixedExpense(db, {
              year: testData.year,
              month: testData.month,
              name: 'Test Loan Payment',
              amount: testData.expenseAmount,
              category: 'Housing',
              payment_type: 'Loan',
              payment_due_day: testData.paymentDueDay,
              linked_loan_id: loanId
            });
            
            // Create reference date
            const referenceDate = new Date(testData.year, testData.month - 1, testData.currentDay);
            
            // Get suggestions
            const suggestions = await getPendingAutoLogSuggestions(
              db, 
              testData.year, 
              testData.month, 
              referenceDate
            );
            
            // Since due day has passed and no payment exists, expense should be included
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].loanId).toBe(loanId);
            expect(suggestions[0].paymentDueDay).toBe(testData.paymentDueDay);
            expect(suggestions[0].amount).toBe(testData.expenseAmount);
            
            // Verify suggested payment date format
            const monthStr = String(testData.month).padStart(2, '0');
            const dayStr = String(testData.paymentDueDay).padStart(2, '0');
            const expectedDate = `${testData.year}-${monthStr}-${dayStr}`;
            expect(suggestions[0].suggestedPaymentDate).toBe(expectedDate);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 9: Auto-Log Suggestion Eligibility - Due Day Not Yet Passed', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    // Generate test data where due day has NOT passed
    const testDataArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      // Current day is between 1-14 to ensure we can have due days in the future
      currentDay: fc.integer({ min: 1, max: 14 }),
      expenseAmount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    }).chain(data => 
      fc.record({
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fc.constant(v)])),
        // Due day must be > current day (not yet passed)
        paymentDueDay: fc.integer({ min: data.currentDay + 1, max: 28 })
      })
    );

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        testDataArbitrary,
        async (loan, testData) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Insert linked fixed expense with due day in the future
            await insertFixedExpense(db, {
              year: testData.year,
              month: testData.month,
              name: 'Test Loan Payment',
              amount: testData.expenseAmount,
              category: 'Housing',
              payment_type: 'Loan',
              payment_due_day: testData.paymentDueDay,
              linked_loan_id: loanId
            });
            
            // Create reference date
            const referenceDate = new Date(testData.year, testData.month - 1, testData.currentDay);
            
            // Get suggestions
            const suggestions = await getPendingAutoLogSuggestions(
              db, 
              testData.year, 
              testData.month, 
              referenceDate
            );
            
            // Since due day has NOT passed, expense should NOT be included
            expect(suggestions.length).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 9: Auto-Log Suggestion Eligibility - Payment Already Exists', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const testDataArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      currentDay: fc.integer({ min: 15, max: 28 }),
      paymentDueDay: fc.integer({ min: 1, max: 14 }),
      expenseAmount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      paymentAmount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      paymentDay: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        testDataArbitrary,
        async (loan, testData) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Insert linked fixed expense
            await insertFixedExpense(db, {
              year: testData.year,
              month: testData.month,
              name: 'Test Loan Payment',
              amount: testData.expenseAmount,
              category: 'Housing',
              payment_type: 'Loan',
              payment_due_day: testData.paymentDueDay,
              linked_loan_id: loanId
            });
            
            // Insert a loan payment for this month
            const monthStr = String(testData.month).padStart(2, '0');
            const dayStr = String(testData.paymentDay).padStart(2, '0');
            const paymentDate = `${testData.year}-${monthStr}-${dayStr}`;
            
            await insertLoanPayment(db, {
              loan_id: loanId,
              amount: testData.paymentAmount,
              payment_date: paymentDate,
              notes: 'Test payment'
            });
            
            // Create reference date
            const referenceDate = new Date(testData.year, testData.month - 1, testData.currentDay);
            
            // Get suggestions
            const suggestions = await getPendingAutoLogSuggestions(
              db, 
              testData.year, 
              testData.month, 
              referenceDate
            );
            
            // Since payment already exists, expense should NOT be included
            expect(suggestions.length).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 9: Auto-Log Suggestion Eligibility - Paid Off Loan Excluded', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(1) // Loan is paid off
    });

    const testDataArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      currentDay: fc.integer({ min: 15, max: 28 }),
      paymentDueDay: fc.integer({ min: 1, max: 14 }),
      expenseAmount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        testDataArbitrary,
        async (loan, testData) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert paid-off loan
            const loanId = await insertLoan(db, loan);
            
            // Insert linked fixed expense
            await insertFixedExpense(db, {
              year: testData.year,
              month: testData.month,
              name: 'Test Loan Payment',
              amount: testData.expenseAmount,
              category: 'Housing',
              payment_type: 'Loan',
              payment_due_day: testData.paymentDueDay,
              linked_loan_id: loanId
            });
            
            // Create reference date
            const referenceDate = new Date(testData.year, testData.month - 1, testData.currentDay);
            
            // Get suggestions
            const suggestions = await getPendingAutoLogSuggestions(
              db, 
              testData.year, 
              testData.month, 
              referenceDate
            );
            
            // Since loan is paid off, expense should NOT be included
            expect(suggestions.length).toBe(0);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });
});
