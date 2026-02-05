/**
 * Property-Based Tests for Fixed Expense Repository - Loan Linkage Feature
 * Using fast-check library for property-based testing
 * 
 * Feature: fixed-expense-loan-linkage
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();
const { CATEGORIES } = require('../utils/categories');

// Helper function to create an in-memory test database
function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) {
            reject(err);
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
        loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
        is_paid_off INTEGER DEFAULT 0,
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

// Helper function to create fixed_expenses table with new fields
function createFixedExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount >= 0),
        category TEXT NOT NULL DEFAULT 'Other',
        payment_type TEXT NOT NULL DEFAULT 'Debit',
        payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
        linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
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

// Helper function to insert a loan
function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, loan_type, is_paid_off) VALUES (?, ?, ?, ?, ?)`,
      [loan.name, loan.initial_balance, loan.start_date, loan.loan_type || 'loan', loan.is_paid_off || 0],
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

// Helper function to insert fixed expense
function insertFixedExpense(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fixedExpense.year, 
        fixedExpense.month, 
        fixedExpense.name, 
        fixedExpense.amount, 
        fixedExpense.category, 
        fixedExpense.payment_type,
        fixedExpense.payment_due_day,
        fixedExpense.linked_loan_id
      ],
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

// Helper function to get fixed expense by ID
function getFixedExpenseById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM fixed_expenses WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

describe('Fixed Expense Repository - Loan Linkage Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 1: Fixed Expense Round-Trip with New Fields
   * **Validates: Requirements 1.4, 2.3, 2.4**
   * 
   * For any fixed expense with valid payment_due_day (1-31 or null) and linked_loan_id 
   * (valid loan ID or null), creating the expense and then retrieving it should return 
   * the same payment_due_day and linked_loan_id values.
   */
  test('Property 1: Fixed Expense Round-Trip with New Fields', async () => {
    // Arbitrary for generating valid payment_due_day (1-31 or null)
    const paymentDueDayArbitrary = fc.option(
      fc.integer({ min: 1, max: 31 }),
      { nil: null }
    );

    // Arbitrary for generating valid fixed expense data
    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        .filter(n => !isNaN(n) && isFinite(n) && n > 0)
        .map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
      payment_due_day: paymentDueDayArbitrary,
      has_linked_loan: fc.boolean()
    });

    await fc.assert(
      fc.asyncProperty(
        fixedExpenseArbitrary,
        async (fixedExpenseData) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            
            let linkedLoanId = null;
            
            // If has_linked_loan is true, create a loan first
            if (fixedExpenseData.has_linked_loan) {
              linkedLoanId = await insertLoan(db, {
                name: 'Test Loan',
                initial_balance: 10000,
                start_date: '2024-01-01',
                loan_type: 'loan',
                is_paid_off: 0
              });
            }
            
            // Create fixed expense with new fields
            const fixedExpense = {
              year: fixedExpenseData.year,
              month: fixedExpenseData.month,
              name: fixedExpenseData.name,
              amount: fixedExpenseData.amount,
              category: fixedExpenseData.category,
              payment_type: fixedExpenseData.payment_type,
              payment_due_day: fixedExpenseData.payment_due_day,
              linked_loan_id: linkedLoanId
            };
            
            // Insert fixed expense
            const id = await insertFixedExpense(db, fixedExpense);
            
            // Retrieve fixed expense
            const retrieved = await getFixedExpenseById(db, id);
            
            // Verify new fields are preserved
            expect(retrieved).toBeDefined();
            expect(retrieved.payment_due_day).toBe(fixedExpense.payment_due_day);
            expect(retrieved.linked_loan_id).toBe(fixedExpense.linked_loan_id);
            
            // Also verify other fields for completeness
            expect(retrieved.year).toBe(fixedExpense.year);
            expect(retrieved.month).toBe(fixedExpense.month);
            expect(retrieved.name).toBe(fixedExpense.name);
            expect(retrieved.amount).toBe(fixedExpense.amount);
            expect(retrieved.category).toBe(fixedExpense.category);
            expect(retrieved.payment_type).toBe(fixedExpense.payment_type);
            
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


// Helper function to copy fixed expenses (simulating repository method)
function copyFixedExpenses(db, fromYear, fromMonth, toYear, toMonth) {
  return new Promise((resolve, reject) => {
    // First get source expenses
    db.all(
      `SELECT * FROM fixed_expenses WHERE year = ? AND month = ?`,
      [fromYear, fromMonth],
      (err, sourceExpenses) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!sourceExpenses || sourceExpenses.length === 0) {
          resolve([]);
          return;
        }
        
        // Copy each expense
        const createdExpenses = [];
        let completed = 0;
        
        sourceExpenses.forEach((expense) => {
          db.run(
            `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [toYear, toMonth, expense.name, expense.amount, expense.category, expense.payment_type, expense.payment_due_day, expense.linked_loan_id],
            function(err) {
              if (err) {
                reject(err);
                return;
              }
              
              createdExpenses.push({
                id: this.lastID,
                year: toYear,
                month: toMonth,
                name: expense.name,
                amount: expense.amount,
                category: expense.category,
                payment_type: expense.payment_type,
                payment_due_day: expense.payment_due_day,
                linked_loan_id: expense.linked_loan_id
              });
              
              completed++;
              if (completed === sourceExpenses.length) {
                resolve(createdExpenses);
              }
            }
          );
        });
      }
    );
  });
}

// Helper function to update loan paid-off status
function updateLoanPaidOff(db, loanId, isPaidOff) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE loans SET is_paid_off = ? WHERE id = ?`,
      [isPaidOff, loanId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}

// Helper function to get fixed expenses with loan details (simulating repository method)
function getFixedExpensesWithLoans(db, year, month) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        fe.id, fe.year, fe.month, fe.name, fe.amount, fe.category, fe.payment_type,
        fe.payment_due_day, fe.linked_loan_id, fe.created_at, fe.updated_at,
        l.name as loan_name, l.loan_type, l.is_paid_off
      FROM fixed_expenses fe
      LEFT JOIN loans l ON fe.linked_loan_id = l.id
      WHERE fe.year = ? AND fe.month = ?
      ORDER BY fe.name ASC
    `;
    db.all(sql, [year, month], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

describe('Fixed Expense Repository - Loan Linkage Preservation Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 4: Loan Linkage Preservation on Paid-Off
   * **Validates: Requirements 2.6**
   * 
   * For any fixed expense linked to a loan, when that loan is marked as paid off 
   * (is_paid_off = 1), the fixed expense's linked_loan_id should remain unchanged 
   * and the joined query should return is_paid_off = true.
   */
  test('Property 4: Loan Linkage Preservation on Paid-Off', async () => {
    // Arbitrary for generating valid payment_due_day (1-31 or null)
    const paymentDueDayArbitrary = fc.option(
      fc.integer({ min: 1, max: 31 }),
      { nil: null }
    );

    // Arbitrary for generating loan type
    const loanTypeArbitrary = fc.constantFrom('loan', 'mortgage', 'line_of_credit');

    // Arbitrary for generating fixed expense data with linked loan
    const linkedFixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        .filter(n => !isNaN(n) && isFinite(n) && n > 0)
        .map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
      payment_due_day: paymentDueDayArbitrary,
      loan_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      loan_type: loanTypeArbitrary,
      loan_initial_balance: fc.float({ min: Math.fround(1000), max: Math.fround(500000), noNaN: true })
        .filter(n => !isNaN(n) && isFinite(n) && n > 0)
        .map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(
        linkedFixedExpenseArbitrary,
        async (data) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            
            // Create an active loan (is_paid_off = 0)
            const loanId = await insertLoan(db, {
              name: data.loan_name,
              initial_balance: data.loan_initial_balance,
              start_date: '2024-01-01',
              loan_type: data.loan_type,
              is_paid_off: 0  // Start as active
            });
            
            // Create fixed expense linked to the loan
            const fixedExpenseId = await insertFixedExpense(db, {
              year: data.year,
              month: data.month,
              name: data.name,
              amount: data.amount,
              category: data.category,
              payment_type: data.payment_type,
              payment_due_day: data.payment_due_day,
              linked_loan_id: loanId
            });
            
            // Verify initial state - loan is active
            const beforePaidOff = await getFixedExpensesWithLoans(db, data.year, data.month);
            const expenseBeforePaidOff = beforePaidOff.find(e => e.id === fixedExpenseId);
            
            expect(expenseBeforePaidOff).toBeDefined();
            expect(expenseBeforePaidOff.linked_loan_id).toBe(loanId);
            expect(expenseBeforePaidOff.is_paid_off).toBe(0);
            
            // Mark the loan as paid off
            const updated = await updateLoanPaidOff(db, loanId, 1);
            expect(updated).toBe(true);
            
            // Verify the fixed expense's linked_loan_id is preserved
            const afterPaidOff = await getFixedExpensesWithLoans(db, data.year, data.month);
            const expenseAfterPaidOff = afterPaidOff.find(e => e.id === fixedExpenseId);
            
            // Property assertions:
            // 1. linked_loan_id should remain unchanged
            expect(expenseAfterPaidOff.linked_loan_id).toBe(loanId);
            
            // 2. The joined query should return is_paid_off = 1 (true)
            expect(expenseAfterPaidOff.is_paid_off).toBe(1);
            
            // 3. All other fixed expense fields should remain unchanged
            expect(expenseAfterPaidOff.name).toBe(data.name);
            expect(expenseAfterPaidOff.amount).toBe(data.amount);
            expect(expenseAfterPaidOff.payment_due_day).toBe(data.payment_due_day);
            expect(expenseAfterPaidOff.loan_name).toBe(data.loan_name);
            expect(expenseAfterPaidOff.loan_type).toBe(data.loan_type);
            
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

describe('Fixed Expense Repository - Carry-Forward Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 13: Carry-Forward with New Fields
   * **Validates: Requirements 7.1, 7.2, 7.3**
   * 
   * For any fixed expense with payment_due_day and/or linked_loan_id, when copyFixedExpenses 
   * is called to copy to a new month, the copied expense should have identical payment_due_day 
   * and linked_loan_id values as the source expense.
   */
  test('Property 13: Carry-Forward with New Fields', async () => {
    // Arbitrary for generating valid payment_due_day (1-31 or null)
    const paymentDueDayArbitrary = fc.option(
      fc.integer({ min: 1, max: 31 }),
      { nil: null }
    );

    // Arbitrary for generating source month data
    const sourceMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2029 }),
      month: fc.integer({ min: 1, max: 12 })
    });

    // Arbitrary for generating fixed expense data
    const fixedExpenseArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
        .filter(n => !isNaN(n) && isFinite(n) && n > 0)
        .map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'),
      payment_due_day: paymentDueDayArbitrary,
      has_linked_loan: fc.boolean(),
      loan_is_paid_off: fc.boolean()
    });

    await fc.assert(
      fc.asyncProperty(
        sourceMonthArbitrary,
        fc.array(fixedExpenseArbitrary, { minLength: 1, maxLength: 5 }),
        async (sourceMonth, fixedExpensesData) => {
          const db = await createTestDatabase();
          
          try {
            // Create tables
            await createLoansTable(db);
            await createFixedExpensesTable(db);
            
            // Calculate target month (next month)
            let targetYear = sourceMonth.year;
            let targetMonth = sourceMonth.month + 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear++;
            }
            
            // Create loans and fixed expenses
            const sourceExpenses = [];
            for (const expenseData of fixedExpensesData) {
              let linkedLoanId = null;
              
              // If has_linked_loan is true, create a loan first
              if (expenseData.has_linked_loan) {
                linkedLoanId = await insertLoan(db, {
                  name: `Loan for ${expenseData.name}`,
                  initial_balance: 10000,
                  start_date: '2024-01-01',
                  loan_type: 'loan',
                  is_paid_off: expenseData.loan_is_paid_off ? 1 : 0
                });
              }
              
              const fixedExpense = {
                year: sourceMonth.year,
                month: sourceMonth.month,
                name: expenseData.name,
                amount: expenseData.amount,
                category: expenseData.category,
                payment_type: expenseData.payment_type,
                payment_due_day: expenseData.payment_due_day,
                linked_loan_id: linkedLoanId
              };
              
              const id = await insertFixedExpense(db, fixedExpense);
              sourceExpenses.push({ ...fixedExpense, id });
            }
            
            // Copy fixed expenses to target month
            const copiedExpenses = await copyFixedExpenses(
              db, 
              sourceMonth.year, 
              sourceMonth.month, 
              targetYear, 
              targetMonth
            );
            
            // Verify copied expenses have same payment_due_day and linked_loan_id
            expect(copiedExpenses.length).toBe(sourceExpenses.length);
            
            for (let i = 0; i < sourceExpenses.length; i++) {
              const source = sourceExpenses[i];
              const copied = copiedExpenses.find(c => c.name === source.name);
              
              expect(copied).toBeDefined();
              expect(copied.payment_due_day).toBe(source.payment_due_day);
              expect(copied.linked_loan_id).toBe(source.linked_loan_id);
              expect(copied.year).toBe(targetYear);
              expect(copied.month).toBe(targetMonth);
              expect(copied.amount).toBe(source.amount);
              expect(copied.category).toBe(source.category);
              expect(copied.payment_type).toBe(source.payment_type);
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
});
