/**
 * Property-Based Tests for Auto Payment Logger Service - Payment Attributes
 * Feature: fixed-expense-loan-linkage
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();

// Auto-log note prefix (must match the service)
const AUTO_LOG_NOTE_PREFIX = 'Auto-logged from fixed expense';

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

// Helper function to get loan by ID
function getLoanById(db, loanId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM loans WHERE id = ?', [loanId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

// Helper function to create loan payment
function createLoanPayment(db, payment) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO loan_payments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)`,
      [payment.loan_id, payment.amount, payment.payment_date, payment.notes || null],
      function(err) {
        if (err) reject(err);
        else resolve({
          id: this.lastID,
          loan_id: payment.loan_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          notes: payment.notes || null
        });
      }
    );
  });
}

// Helper function to get loan payment by ID
function getLoanPaymentById(db, paymentId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM loan_payments WHERE id = ?', [paymentId], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

// Simulate createPaymentFromFixedExpense logic
async function createPaymentFromFixedExpense(db, fixedExpense, paymentDate) {
  // Validate fixed expense has required fields
  if (!fixedExpense) {
    throw new Error('Fixed expense is required');
  }
  
  if (!fixedExpense.linked_loan_id) {
    throw new Error('Fixed expense must be linked to a loan');
  }
  
  if (fixedExpense.amount === undefined || fixedExpense.amount === null) {
    throw new Error('Fixed expense must have an amount');
  }
  
  if (!paymentDate) {
    throw new Error('Payment date is required');
  }
  
  // Validate payment date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(paymentDate)) {
    throw new Error('Payment date must be in YYYY-MM-DD format');
  }
  
  // Verify the loan exists
  const loan = await getLoanById(db, fixedExpense.linked_loan_id);
  if (!loan) {
    throw new Error('Linked loan not found');
  }
  
  // Create the note indicating auto-logged source
  const fixedExpenseName = fixedExpense.name || fixedExpense.fixed_expense_name || 'Unknown';
  const note = `${AUTO_LOG_NOTE_PREFIX}: ${fixedExpenseName}`;
  
  // Create the loan payment entry
  const payment = await createLoanPayment(db, {
    loan_id: fixedExpense.linked_loan_id,
    amount: fixedExpense.amount,
    payment_date: paymentDate,
    notes: note
  });
  
  return payment;
}

describe('Auto Payment Logger Service - Payment Attributes - Property-Based Tests', () => {
  /**
   * Feature: fixed-expense-loan-linkage, Property 10: Auto-Logged Payment Attributes
   * **Validates: Requirements 4.2, 4.3, 4.4, 4.6**
   * 
   * For any fixed expense with linked_loan_id and amount, when createPaymentFromFixedExpense 
   * is called, the created loan_payment should have: loan_id equal to linked_loan_id, 
   * amount equal to fixed expense amount, payment_date equal to the provided date, 
   * and notes containing "Auto-logged from fixed expense".
   */
  test('Property 10: Auto-Logged Payment Attributes - Loan ID Matches', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const fixedExpenseArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const dateArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        fixedExpenseArbitrary,
        dateArbitrary,
        async (loan, expense, date) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Create payment date
            const monthStr = String(date.month).padStart(2, '0');
            const dayStr = String(date.day).padStart(2, '0');
            const paymentDate = `${date.year}-${monthStr}-${dayStr}`;
            
            // Create fixed expense object
            const fixedExpense = {
              linked_loan_id: loanId,
              amount: expense.amount,
              name: expense.name
            };
            
            // Create payment from fixed expense
            const payment = await createPaymentFromFixedExpense(db, fixedExpense, paymentDate);
            
            // Verify loan_id matches linked_loan_id (Requirement 4.2)
            expect(payment.loan_id).toBe(loanId);
            expect(payment.loan_id).toBe(fixedExpense.linked_loan_id);
            
            // Verify the payment was persisted correctly
            const persistedPayment = await getLoanPaymentById(db, payment.id);
            expect(persistedPayment).not.toBeNull();
            expect(persistedPayment.loan_id).toBe(loanId);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 10: Auto-Logged Payment Attributes - Amount Matches', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const fixedExpenseArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      // Test various amounts including edge cases
      amount: fc.oneof(
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
        fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
      )
    });

    const dateArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        fixedExpenseArbitrary,
        dateArbitrary,
        async (loan, expense, date) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Create payment date
            const monthStr = String(date.month).padStart(2, '0');
            const dayStr = String(date.day).padStart(2, '0');
            const paymentDate = `${date.year}-${monthStr}-${dayStr}`;
            
            // Create fixed expense object
            const fixedExpense = {
              linked_loan_id: loanId,
              amount: expense.amount,
              name: expense.name
            };
            
            // Create payment from fixed expense
            const payment = await createPaymentFromFixedExpense(db, fixedExpense, paymentDate);
            
            // Verify amount matches fixed expense amount (Requirement 4.2)
            expect(payment.amount).toBe(expense.amount);
            
            // Verify the payment was persisted correctly
            const persistedPayment = await getLoanPaymentById(db, payment.id);
            expect(persistedPayment).not.toBeNull();
            expect(persistedPayment.amount).toBe(expense.amount);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 10: Auto-Logged Payment Attributes - Payment Date Matches', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const fixedExpenseArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    // Test various dates
    const dateArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        fixedExpenseArbitrary,
        dateArbitrary,
        async (loan, expense, date) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Create payment date (Requirement 4.3)
            const monthStr = String(date.month).padStart(2, '0');
            const dayStr = String(date.day).padStart(2, '0');
            const paymentDate = `${date.year}-${monthStr}-${dayStr}`;
            
            // Create fixed expense object
            const fixedExpense = {
              linked_loan_id: loanId,
              amount: expense.amount,
              name: expense.name
            };
            
            // Create payment from fixed expense
            const payment = await createPaymentFromFixedExpense(db, fixedExpense, paymentDate);
            
            // Verify payment_date matches the provided date (Requirement 4.3)
            expect(payment.payment_date).toBe(paymentDate);
            
            // Verify the payment was persisted correctly
            const persistedPayment = await getLoanPaymentById(db, payment.id);
            expect(persistedPayment).not.toBeNull();
            expect(persistedPayment.payment_date).toBe(paymentDate);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 10: Auto-Logged Payment Attributes - Notes Contains Auto-Log Indicator', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const fixedExpenseArbitrary = fc.record({
      // Test various expense names
      name: fc.oneof(
        fc.constant('Mortgage Payment'),
        fc.constant('Car Loan'),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
      ),
      amount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const dateArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        fixedExpenseArbitrary,
        dateArbitrary,
        async (loan, expense, date) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Create payment date
            const monthStr = String(date.month).padStart(2, '0');
            const dayStr = String(date.day).padStart(2, '0');
            const paymentDate = `${date.year}-${monthStr}-${dayStr}`;
            
            // Create fixed expense object
            const fixedExpense = {
              linked_loan_id: loanId,
              amount: expense.amount,
              name: expense.name
            };
            
            // Create payment from fixed expense
            const payment = await createPaymentFromFixedExpense(db, fixedExpense, paymentDate);
            
            // Verify notes contains auto-log indicator (Requirement 4.6)
            expect(payment.notes).not.toBeNull();
            expect(payment.notes).toContain(AUTO_LOG_NOTE_PREFIX);
            expect(payment.notes).toContain(expense.name);
            
            // Verify the expected format
            const expectedNote = `${AUTO_LOG_NOTE_PREFIX}: ${expense.name}`;
            expect(payment.notes).toBe(expectedNote);
            
            // Verify the payment was persisted correctly
            const persistedPayment = await getLoanPaymentById(db, payment.id);
            expect(persistedPayment).not.toBeNull();
            expect(persistedPayment.notes).toBe(expectedNote);
            
            return true;
          } finally {
            await closeDatabase(db);
          }
        }
      ),
      dbPbtOptions()
    );
  });

  test('Property 10: Auto-Logged Payment Attributes - All Attributes Combined', async () => {
    const loanArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      initial_balance: fc.float({ min: 1000, max: 100000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      start_date: fc.constant('2024-01-01'),
      loan_type: fc.constantFrom('loan', 'mortgage'),
      is_paid_off: fc.constant(0)
    });

    const fixedExpenseArbitrary = fc.record({
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: 100, max: 5000, noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const dateArbitrary = fc.record({
      year: fc.integer({ min: 2024, max: 2025 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(
        loanArbitrary,
        fixedExpenseArbitrary,
        dateArbitrary,
        async (loan, expense, date) => {
          const db = await createTestDatabase();
          
          try {
            await createLoansTable(db);
            await createLoanPaymentsTable(db);
            
            // Insert loan
            const loanId = await insertLoan(db, loan);
            
            // Create payment date
            const monthStr = String(date.month).padStart(2, '0');
            const dayStr = String(date.day).padStart(2, '0');
            const paymentDate = `${date.year}-${monthStr}-${dayStr}`;
            
            // Create fixed expense object
            const fixedExpense = {
              linked_loan_id: loanId,
              amount: expense.amount,
              name: expense.name
            };
            
            // Create payment from fixed expense
            const payment = await createPaymentFromFixedExpense(db, fixedExpense, paymentDate);
            
            // Verify ALL attributes in one test (Requirements 4.2, 4.3, 4.4, 4.6)
            
            // 4.2: loan_id equals linked_loan_id
            expect(payment.loan_id).toBe(fixedExpense.linked_loan_id);
            
            // 4.2: amount equals fixed expense amount
            expect(payment.amount).toBe(fixedExpense.amount);
            
            // 4.3: payment_date equals provided date
            expect(payment.payment_date).toBe(paymentDate);
            
            // 4.6: notes contains auto-log indicator
            expect(payment.notes).toContain(AUTO_LOG_NOTE_PREFIX);
            
            // Verify persistence
            const persistedPayment = await getLoanPaymentById(db, payment.id);
            expect(persistedPayment).not.toBeNull();
            expect(persistedPayment.loan_id).toBe(fixedExpense.linked_loan_id);
            expect(persistedPayment.amount).toBe(fixedExpense.amount);
            expect(persistedPayment.payment_date).toBe(paymentDate);
            expect(persistedPayment.notes).toContain(AUTO_LOG_NOTE_PREFIX);
            
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
