/**
 * Consolidated Property-Based Tests for Fixed Expense Repository
 * Merged from: fixedExpenseRepository.pbt.test.js, fixedExpenseRepository.loanLinkage.pbt.test.js
 * 
 * Features: enhanced-fixed-expenses, fixed-expense-loan-linkage
  *
 * @invariant Fixed Expense Persistence: For any valid fixed expense with optional loan linkage, storing and retrieving it returns equivalent data; loan-linked expenses correctly reference their associated loan. Randomization covers diverse categories, payment types, amounts, and loan linkage configurations.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();
const { CATEGORIES } = require('../utils/categories');

// ============================================================================
// Shared Helpers
// ============================================================================

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        reject(err);
      } else {
        db.run('PRAGMA foreign_keys = ON', (err) => {
          if (err) reject(err);
          else resolve(db);
        });
      }
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
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
        loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
        is_paid_off INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => err ? reject(err) : resolve());
  });
}

function createFixedExpensesTableWithLoanFields(db) {
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
    `, (err) => err ? reject(err) : resolve());
  });
}

function createSimpleFixedExpensesTable(db) {
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => err ? reject(err) : resolve());
  });
}

function insertLoan(db, loan) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loans (name, initial_balance, start_date, loan_type, is_paid_off) VALUES (?, ?, ?, ?, ?)`,
      [loan.name, loan.initial_balance, loan.start_date, loan.loan_type || 'loan', loan.is_paid_off || 0],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function insertSimpleFixedExpense(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)`,
      [fixedExpense.year, fixedExpense.month, fixedExpense.name, fixedExpense.amount, fixedExpense.category, fixedExpense.payment_type],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function insertFixedExpenseWithLoanFields(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fixedExpense.year, fixedExpense.month, fixedExpense.name, fixedExpense.amount,
        fixedExpense.category, fixedExpense.payment_type,
        fixedExpense.payment_due_day, fixedExpense.linked_loan_id
      ],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getFixedExpenseById(db, id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM fixed_expenses WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function updateLoanPaidOff(db, loanId, isPaidOff) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE loans SET is_paid_off = ? WHERE id = ?`, [isPaidOff, loanId], function(err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

function getFixedExpensesWithLoans(db, year, month) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT fe.*, l.name as loan_name, l.loan_type, l.is_paid_off
      FROM fixed_expenses fe
      LEFT JOIN loans l ON fe.linked_loan_id = l.id
      WHERE fe.year = ? AND fe.month = ?
      ORDER BY fe.name ASC
    `;
    db.all(sql, [year, month], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function copyFixedExpenses(db, fromYear, fromMonth, toYear, toMonth) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM fixed_expenses WHERE year = ? AND month = ?`,
      [fromYear, fromMonth],
      (err, sourceExpenses) => {
        if (err) { reject(err); return; }
        if (!sourceExpenses || sourceExpenses.length === 0) { resolve([]); return; }
        
        const createdExpenses = [];
        let completed = 0;
        
        sourceExpenses.forEach((expense) => {
          db.run(
            `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, payment_due_day, linked_loan_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [toYear, toMonth, expense.name, expense.amount, expense.category, expense.payment_type, expense.payment_due_day, expense.linked_loan_id],
            function(err) {
              if (err) { reject(err); return; }
              createdExpenses.push({
                id: this.lastID, year: toYear, month: toMonth,
                name: expense.name, amount: expense.amount, category: expense.category,
                payment_type: expense.payment_type, payment_due_day: expense.payment_due_day,
                linked_loan_id: expense.linked_loan_id
              });
              completed++;
              if (completed === sourceExpenses.length) resolve(createdExpenses);
            }
          );
        });
      }
    );
  });
}

// ============================================================================
// Category/Payment Type Round-Trip Tests (from fixedExpenseRepository.pbt.test.js)
// ============================================================================

describe('Fixed Expense Repository - Property-Based Tests', () => {
  /**
   * Feature: enhanced-fixed-expenses, Property 2: Fixed expense storage round trip preserves category
   * Validates: Requirements 1.3
   */
  test('Property 2: Fixed expense storage round trip preserves category', async () => {
    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    await fc.assert(
      fc.asyncProperty(fixedExpenseArbitrary, async (fixedExpense) => {
        const db = await createTestDatabase();
        try {
          await createSimpleFixedExpensesTable(db);
          const id = await insertSimpleFixedExpense(db, fixedExpense);
          const retrieved = await getFixedExpenseById(db, id);
          
          expect(retrieved).toBeDefined();
          expect(retrieved.category).toBe(fixedExpense.category);
          expect(retrieved.year).toBe(fixedExpense.year);
          expect(retrieved.month).toBe(fixedExpense.month);
          expect(retrieved.name).toBe(fixedExpense.name);
          expect(retrieved.amount).toBe(fixedExpense.amount);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: enhanced-fixed-expenses, Property 4: Fixed expense storage round trip preserves payment type
   * Validates: Requirements 2.3
   */
  test('Property 4: Fixed expense storage round trip preserves payment type', async () => {
    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      category: fc.constantFrom(...CATEGORIES),
      payment_type: fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')
    });

    await fc.assert(
      fc.asyncProperty(fixedExpenseArbitrary, async (fixedExpense) => {
        const db = await createTestDatabase();
        try {
          await createSimpleFixedExpensesTable(db);
          const id = await insertSimpleFixedExpense(db, fixedExpense);
          const retrieved = await getFixedExpenseById(db, id);
          
          expect(retrieved).toBeDefined();
          expect(retrieved.payment_type).toBe(fixedExpense.payment_type);
          expect(retrieved.year).toBe(fixedExpense.year);
          expect(retrieved.month).toBe(fixedExpense.month);
          expect(retrieved.name).toBe(fixedExpense.name);
          expect(retrieved.amount).toBe(fixedExpense.amount);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});

// ============================================================================
// Loan Linkage Tests (from fixedExpenseRepository.loanLinkage.pbt.test.js)
// ============================================================================

describe('Fixed Expense Repository - Loan Linkage Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 1: Fixed Expense Round-Trip with New Fields
   * **Validates: Requirements 1.4, 2.3, 2.4**
   */
  test('Property 1: Fixed Expense Round-Trip with New Fields', async () => {
    const paymentDueDayArbitrary = fc.option(fc.integer({ min: 1, max: 31 }), { nil: null });

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
      fc.asyncProperty(fixedExpenseArbitrary, async (fixedExpenseData) => {
        const db = await createTestDatabase();
        try {
          await createLoansTable(db);
          await createFixedExpensesTableWithLoanFields(db);
          
          let linkedLoanId = null;
          if (fixedExpenseData.has_linked_loan) {
            linkedLoanId = await insertLoan(db, {
              name: 'Test Loan', initial_balance: 10000,
              start_date: '2024-01-01', loan_type: 'loan', is_paid_off: 0
            });
          }
          
          const fixedExpense = {
            year: fixedExpenseData.year, month: fixedExpenseData.month,
            name: fixedExpenseData.name, amount: fixedExpenseData.amount,
            category: fixedExpenseData.category, payment_type: fixedExpenseData.payment_type,
            payment_due_day: fixedExpenseData.payment_due_day, linked_loan_id: linkedLoanId
          };
          
          const id = await insertFixedExpenseWithLoanFields(db, fixedExpense);
          const retrieved = await getFixedExpenseById(db, id);
          
          expect(retrieved).toBeDefined();
          expect(retrieved.payment_due_day).toBe(fixedExpense.payment_due_day);
          expect(retrieved.linked_loan_id).toBe(fixedExpense.linked_loan_id);
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
      }),
      dbPbtOptions()
    );
  });
});

describe('Fixed Expense Repository - Loan Linkage Preservation Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 4: Loan Linkage Preservation on Paid-Off
   * **Validates: Requirements 2.6**
   */
  test('Property 4: Loan Linkage Preservation on Paid-Off', async () => {
    const paymentDueDayArbitrary = fc.option(fc.integer({ min: 1, max: 31 }), { nil: null });
    const loanTypeArbitrary = fc.constantFrom('loan', 'mortgage', 'line_of_credit');

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
      fc.asyncProperty(linkedFixedExpenseArbitrary, async (data) => {
        const db = await createTestDatabase();
        try {
          await createLoansTable(db);
          await createFixedExpensesTableWithLoanFields(db);
          
          const loanId = await insertLoan(db, {
            name: data.loan_name, initial_balance: data.loan_initial_balance,
            start_date: '2024-01-01', loan_type: data.loan_type, is_paid_off: 0
          });
          
          const fixedExpenseId = await insertFixedExpenseWithLoanFields(db, {
            year: data.year, month: data.month, name: data.name, amount: data.amount,
            category: data.category, payment_type: data.payment_type,
            payment_due_day: data.payment_due_day, linked_loan_id: loanId
          });
          
          const beforePaidOff = await getFixedExpensesWithLoans(db, data.year, data.month);
          const expenseBeforePaidOff = beforePaidOff.find(e => e.id === fixedExpenseId);
          
          expect(expenseBeforePaidOff).toBeDefined();
          expect(expenseBeforePaidOff.linked_loan_id).toBe(loanId);
          expect(expenseBeforePaidOff.is_paid_off).toBe(0);
          
          const updated = await updateLoanPaidOff(db, loanId, 1);
          expect(updated).toBe(true);
          
          const afterPaidOff = await getFixedExpensesWithLoans(db, data.year, data.month);
          const expenseAfterPaidOff = afterPaidOff.find(e => e.id === fixedExpenseId);
          
          expect(expenseAfterPaidOff.linked_loan_id).toBe(loanId);
          expect(expenseAfterPaidOff.is_paid_off).toBe(1);
          expect(expenseAfterPaidOff.name).toBe(data.name);
          expect(expenseAfterPaidOff.amount).toBe(data.amount);
          expect(expenseAfterPaidOff.payment_due_day).toBe(data.payment_due_day);
          expect(expenseAfterPaidOff.loan_name).toBe(data.loan_name);
          expect(expenseAfterPaidOff.loan_type).toBe(data.loan_type);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});

describe('Fixed Expense Repository - Carry-Forward Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 13: Carry-Forward with New Fields
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  test('Property 13: Carry-Forward with New Fields', async () => {
    const paymentDueDayArbitrary = fc.option(fc.integer({ min: 1, max: 31 }), { nil: null });
    const sourceMonthArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2029 }),
      month: fc.integer({ min: 1, max: 12 })
    });

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
            await createLoansTable(db);
            await createFixedExpensesTableWithLoanFields(db);
            
            let targetYear = sourceMonth.year;
            let targetMonth = sourceMonth.month + 1;
            if (targetMonth > 12) { targetMonth = 1; targetYear++; }
            
            // Make names unique to avoid find() matching the wrong entry
            fixedExpensesData = fixedExpensesData.map((e, idx) => ({ ...e, name: `${e.name}_${idx}` }));
            
            const sourceExpenses = [];
            for (const expenseData of fixedExpensesData) {
              let linkedLoanId = null;
              if (expenseData.has_linked_loan) {
                linkedLoanId = await insertLoan(db, {
                  name: `Loan for ${expenseData.name}`, initial_balance: 10000,
                  start_date: '2024-01-01', loan_type: 'loan',
                  is_paid_off: expenseData.loan_is_paid_off ? 1 : 0
                });
              }
              
              const fixedExpense = {
                year: sourceMonth.year, month: sourceMonth.month,
                name: expenseData.name, amount: expenseData.amount,
                category: expenseData.category, payment_type: expenseData.payment_type,
                payment_due_day: expenseData.payment_due_day, linked_loan_id: linkedLoanId
              };
              
              const id = await insertFixedExpenseWithLoanFields(db, fixedExpense);
              sourceExpenses.push({ ...fixedExpense, id });
            }
            
            const copiedExpenses = await copyFixedExpenses(
              db, sourceMonth.year, sourceMonth.month, targetYear, targetMonth
            );
            
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
      dbPbtOptions()
    );
  });
});
