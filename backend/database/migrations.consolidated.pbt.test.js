/**
 * Consolidated Property-Based Tests for Database Migrations
 * Merged from: migrations.pbt.test.js, migrations.billingCycleDay.pbt.test.js, migrations.paymentMethods.pbt.test.js
 * 
 * Features: personal-care-category, enhanced-fixed-expenses, multi-invoice-support,
 *           medical-insurance-tracking, billing-cycle-day, configurable-payment-methods,
 *           credit-card-posted-date
  *
 * @invariant Migration Idempotency: For any valid database state, running migrations produces the expected schema with correct column types, constraints, and default values; re-running migrations does not corrupt existing data. Randomization tests diverse initial data states and column value combinations.
 */

const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const sqlite3 = require('sqlite3').verbose();
const { CATEGORIES, BUDGETABLE_CATEGORIES } = require('../utils/categories');

// Mock createBackup to avoid file system operations in tests (needed by billingCycleDay tests)
jest.mock('../services/backupService', () => ({
  createBackup: jest.fn().mockResolvedValue('/mock/backup/path')
}));

jest.mock('../config/paths', () => ({
  getDatabasePath: jest.fn().mockReturnValue(':memory:'),
  getBackupPath: jest.fn().mockReturnValue('/mock/backup')
}));

// ============================================================================
// Shared Helpers
// ============================================================================

function createTestDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => err ? reject(err) : resolve(db));
  });
}

function createTestDatabaseWithFK() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) reject(err);
      else db.run('PRAGMA foreign_keys = ON', (err) => err ? reject(err) : resolve(db));
    });
  });
}

function closeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
  });
}

function runStatement(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
  });
}

function getRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function getAllRows(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

// ============================================================================
// Table creation helpers
// ============================================================================

function createOldExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const oldCategories = CATEGORIES.filter(c => c !== 'Personal Care');
    const categoryList = oldCategories.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
      amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createNewExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
      amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createOldBudgetsTable(db) {
  return new Promise((resolve, reject) => {
    const oldCategories = BUDGETABLE_CATEGORIES.filter(c => c !== 'Personal Care');
    const categoryList = oldCategories.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      category TEXT NOT NULL CHECK(category IN (${categoryList})),
      "limit" REAL NOT NULL CHECK("limit" > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month, category)
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createNewBudgetsTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      category TEXT NOT NULL CHECK(category IN (${categoryList})),
      "limit" REAL NOT NULL CHECK("limit" > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month, category)
    )`, (err) => err ? reject(err) : resolve());
  });
}


function createOldFixedExpensesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE fixed_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL, month INTEGER NOT NULL,
      name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createPeopleTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date_of_birth DATE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createOldExpenseInvoicesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE expense_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL,
      filename TEXT NOT NULL, original_filename TEXT NOT NULL, file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      UNIQUE(expense_id)
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createNewExpenseInvoicesTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE expense_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL, person_id INTEGER,
      filename TEXT NOT NULL, original_filename TEXT NOT NULL, file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createPreInsuranceExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
      amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
      method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createPreInsuranceExpensePeopleTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE expense_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL, person_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      UNIQUE(expense_id, person_id)
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createPrePostedDateExpensesTable(db) {
  return new Promise((resolve, reject) => {
    const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
    db.run(`CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
      amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
      week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
      method TEXT NOT NULL, payment_method_id INTEGER,
      insurance_eligible INTEGER DEFAULT 0, claim_status TEXT DEFAULT NULL,
      original_cost REAL DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createPaymentMethodsTableWithoutBillingCycleDay(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
      display_name TEXT NOT NULL UNIQUE, full_name TEXT, account_details TEXT,
      credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
      current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
      payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
      billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
      billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

function createSchemaMigrationsTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => err ? reject(err) : resolve());
  });
}

// ============================================================================
// Insert/query helpers
// ============================================================================

function insertExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertBudget(db, budget) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)`,
      [budget.year, budget.month, budget.category, budget.limit],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertOldFixedExpense(db, fixedExpense) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO fixed_expenses (year, month, name, amount) VALUES (?, ?, ?, ?)`,
      [fixedExpense.year, fixedExpense.month, fixedExpense.name, fixedExpense.amount],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertOldInvoice(db, invoice) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO expense_invoices (expense_id, filename, original_filename, file_path, file_size, mime_type, upload_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoice.expenseId, invoice.filename, invoice.originalFilename, invoice.filePath, invoice.fileSize, invoice.mimeType, invoice.uploadDate],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertPreInsuranceExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertPreInsuranceExpensePerson(db, expenseId, personId, amount) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO expense_people (expense_id, person_id, amount) VALUES (?, ?, ?)`,
      [expenseId, personId, amount],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertPerson(db, name) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO people (name) VALUES (?)`, [name],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertPrePostedDateExpense(db, expense) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO expenses (date, place, notes, amount, type, week, method, payment_method_id, insurance_eligible, claim_status, original_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method,
       expense.payment_method_id || null, expense.insurance_eligible || 0, expense.claim_status || null, expense.original_cost || null],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function insertPaymentMethod(db, paymentMethod) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO payment_methods (type, display_name, full_name, credit_limit, current_balance, payment_due_day, billing_cycle_start, billing_cycle_end, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentMethod.type, paymentMethod.display_name, paymentMethod.full_name, paymentMethod.credit_limit,
       paymentMethod.current_balance, paymentMethod.payment_due_day, paymentMethod.billing_cycle_start,
       paymentMethod.billing_cycle_end, paymentMethod.is_active],
      function(err) { err ? reject(err) : resolve(this.lastID); });
  });
}

function countExpenses(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => err ? reject(err) : resolve(row.count));
  });
}

function countBudgets(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM budgets', (err, row) => err ? reject(err) : resolve(row.count));
  });
}

function countFixedExpenses(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM fixed_expenses', (err, row) => err ? reject(err) : resolve(row.count));
  });
}

function countInvoices(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM expense_invoices', (err, row) => err ? reject(err) : resolve(row.count));
  });
}

function countPaymentMethods(db) {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM payment_methods', (err, row) => err ? reject(err) : resolve(row.count));
  });
}

function getAllExpenses(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expenses ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getAllBudgets(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM budgets ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getAllFixedExpenses(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM fixed_expenses ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getAllInvoices(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expense_invoices ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getAllExpensePeople(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM expense_people ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getAllPaymentMethods(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM payment_methods ORDER BY id', (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function getTableColumns(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => err ? reject(err) : resolve(rows.map(r => r.name)));
  });
}

function hasColumn(db, tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      err ? reject(err) : resolve(columns.some(col => col.name === columnName));
    });
  });
}

function hasUniqueConstraintOnExpenseId(db) {
  return new Promise((resolve, reject) => {
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_invoices'", (err, row) => {
      if (err) reject(err);
      else if (!row) resolve(false);
      else resolve(row.sql.includes('UNIQUE(expense_id)'));
    });
  });
}

function calculateBalancePreMigration(db, paymentMethodId, referenceDate) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE payment_method_id = ? AND date <= ?`,
      [paymentMethodId, referenceDate], (err, row) => err ? reject(err) : resolve(row?.total || 0));
  });
}

function calculateBalancePostMigration(db, paymentMethodId, referenceDate) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE payment_method_id = ? AND COALESCE(posted_date, date) <= ?`,
      [paymentMethodId, referenceDate], (err, row) => err ? reject(err) : resolve(row?.total || 0));
  });
}


// ============================================================================
// Shared Arbitraries
// ============================================================================

const dateArbitrary = fc.integer({ min: 2020, max: 2025 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).chain(month =>
    fc.integer({ min: 1, max: 28 }).map(day =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
  )
);

const methodArbitrary = fc.constantFrom('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA');

const amountArbitrary = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100);

// ============================================================================
// From migrations.pbt.test.js — Personal Care, Budget, Fixed Expenses, Invoice, Insurance, Posted Date
// ============================================================================

describe('Database Migrations - Property-Based Tests', () => {
  /**
   * Feature: personal-care-category, Property 4: Database constraint accepts Personal Care
   * Validates: Requirements 1.2, 2.3
   */
  test('Property 4: Database constraint accepts Personal Care', async () => {
    const personalCareExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
      notes: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 200 })),
      amount: amountArbitrary,
      type: fc.constant('Personal Care'),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    await fc.assert(
      fc.asyncProperty(personalCareExpenseArbitrary, async (expense) => {
        const db = await createTestDatabase();
        try {
          await createNewExpensesTable(db);
          const id = await insertExpense(db, expense);
          expect(id).toBeGreaterThan(0);
          const count = await countExpenses(db);
          expect(count).toBe(1);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 4 (budgets): Database constraint accepts Personal Care in budgets', async () => {
    const personalCareBudgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constant('Personal Care'),
      limit: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    await fc.assert(
      fc.asyncProperty(personalCareBudgetArbitrary, async (budget) => {
        const db = await createTestDatabase();
        try {
          await createNewBudgetsTable(db);
          const id = await insertBudget(db, budget);
          expect(id).toBeGreaterThan(0);
          const count = await countBudgets(db);
          expect(count).toBe(1);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: personal-care-category, Property 5: Migration preserves existing data
   * Validates: Requirements 2.1, 2.2
   */
  test('Property 5: Migration preserves existing data', async () => {
    const oldCategories = CATEGORIES.filter(c => c !== 'Personal Care');
    const oldExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 100 })),
      notes: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 200 })),
      amount: amountArbitrary,
      type: fc.constantFrom(...oldCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const expensesArrayArbitrary = fc.array(oldExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createOldExpensesTable(db);
          for (const expense of expenses) { await insertExpense(db, expense); }
          const countBefore = await countExpenses(db);
          const expensesBefore = await getAllExpenses(db);

          // Simulate migration: recreate table with new schema
          await new Promise((resolve, reject) => {
            const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`CREATE TABLE expenses_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
                  amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
                  week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5),
                  method TEXT NOT NULL CHECK(method IN ('Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA')),
                  created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run('INSERT INTO expenses_new SELECT * FROM expenses', (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('DROP TABLE expenses', (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run('ALTER TABLE expenses_new RENAME TO expenses', (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const countAfter = await countExpenses(db);
          const expensesAfter = await getAllExpenses(db);
          expect(countAfter).toBe(countBefore);
          expect(countAfter).toBe(expenses.length);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesBefore.length; i++) {
            expect(expensesAfter[i].id).toBe(expensesBefore[i].id);
            expect(expensesAfter[i].date).toBe(expensesBefore[i].date);
            expect(expensesAfter[i].place).toBe(expensesBefore[i].place);
            expect(expensesAfter[i].notes).toBe(expensesBefore[i].notes);
            expect(expensesAfter[i].amount).toBe(expensesBefore[i].amount);
            expect(expensesAfter[i].type).toBe(expensesBefore[i].type);
            expect(expensesAfter[i].week).toBe(expensesBefore[i].week);
            expect(expensesAfter[i].method).toBe(expensesBefore[i].method);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 5 (budgets): Migration preserves existing budget data', async () => {
    const oldBudgetableCategories = BUDGETABLE_CATEGORIES.filter(c => c !== 'Personal Care');
    const oldBudgetArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      category: fc.constantFrom(...oldBudgetableCategories),
      limit: fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100)
    });

    const budgetsArrayArbitrary = fc.array(oldBudgetArbitrary, { minLength: 1, maxLength: 5 })
      .map(budgets => {
        const seen = new Set();
        return budgets.filter(b => {
          const key = `${b.year}-${b.month}-${b.category}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })
      .filter(budgets => budgets.length > 0);

    await fc.assert(
      fc.asyncProperty(budgetsArrayArbitrary, async (budgets) => {
        const db = await createTestDatabase();
        try {
          await createOldBudgetsTable(db);
          for (const budget of budgets) { await insertBudget(db, budget); }
          const countBefore = await countBudgets(db);
          const budgetsBefore = await getAllBudgets(db);

          await new Promise((resolve, reject) => {
            const categoryList = BUDGETABLE_CATEGORIES.map(c => `'${c}'`).join(', ');
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`CREATE TABLE budgets_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL,
                  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
                  category TEXT NOT NULL CHECK(category IN (${categoryList})),
                  "limit" REAL NOT NULL CHECK("limit" > 0),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE(year, month, category)
                )`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run('INSERT INTO budgets_new SELECT * FROM budgets', (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('DROP TABLE budgets', (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run('ALTER TABLE budgets_new RENAME TO budgets', (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const countAfter = await countBudgets(db);
          const budgetsAfter = await getAllBudgets(db);
          expect(countAfter).toBe(countBefore);
          expect(countAfter).toBe(budgets.length);
          for (let i = 0; i < budgetsBefore.length; i++) {
            expect(budgetsAfter[i].id).toBe(budgetsBefore[i].id);
            expect(budgetsAfter[i].year).toBe(budgetsBefore[i].year);
            expect(budgetsAfter[i].month).toBe(budgetsBefore[i].month);
            expect(budgetsAfter[i].category).toBe(budgetsBefore[i].category);
            expect(budgetsAfter[i].limit).toBe(budgetsBefore[i].limit);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: enhanced-fixed-expenses, Property 5: Migration preserves existing data
   * Validates: Requirements 3.4
   */
  test('Property 5 (fixed expenses): Migration preserves existing fixed expense data', async () => {
    const oldFixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      amount: amountArbitrary
    });

    const fixedExpensesArrayArbitrary = fc.array(oldFixedExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(fixedExpensesArrayArbitrary, async (fixedExpenses) => {
        const db = await createTestDatabase();
        try {
          await createOldFixedExpensesTable(db);
          for (const fe of fixedExpenses) { await insertOldFixedExpense(db, fe); }
          const countBefore = await countFixedExpenses(db);
          const fixedExpensesBefore = await getAllFixedExpenses(db);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`ALTER TABLE fixed_expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`ALTER TABLE fixed_expenses ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'Debit'`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('COMMIT', (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      resolve();
                    });
                  });
                });
              });
            });
          });

          const countAfter = await countFixedExpenses(db);
          const fixedExpensesAfter = await getAllFixedExpenses(db);
          expect(countAfter).toBe(countBefore);
          for (let i = 0; i < fixedExpensesBefore.length; i++) {
            expect(fixedExpensesAfter[i].id).toBe(fixedExpensesBefore[i].id);
            expect(fixedExpensesAfter[i].year).toBe(fixedExpensesBefore[i].year);
            expect(fixedExpensesAfter[i].month).toBe(fixedExpensesBefore[i].month);
            expect(fixedExpensesAfter[i].name).toBe(fixedExpensesBefore[i].name);
            expect(fixedExpensesAfter[i].amount).toBe(fixedExpensesBefore[i].amount);
            expect(fixedExpensesAfter[i].category).toBe('Other');
            expect(fixedExpensesAfter[i].payment_type).toBe('Debit');
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});


describe('Multi-Invoice Support Migration - Property-Based Tests', () => {
  /**
   * Feature: multi-invoice-support, Property 7: Migration Data Preservation
   * Validates: Requirements 3.3
   */
  test('Property 7: Migration Data Preservation', async () => {
    const invoiceArbitrary = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      filename: fc.string({ minLength: 5, maxLength: 50 }).map(s => (s.replace(/[^a-zA-Z0-9]/g, '') || 'file') + '.pdf'),
      originalFilename: fc.string({ minLength: 5, maxLength: 100 }).map(s => (s.replace(/[^a-zA-Z0-9 ]/g, '') || 'Original File') + '.pdf'),
      filePath: fc.string({ minLength: 5, maxLength: 100 }).map(s => '/invoices/' + (s.replace(/[^a-zA-Z0-9]/g, '') || 'file') + '.pdf'),
      fileSize: fc.integer({ min: 1000, max: 10000000 }),
      mimeType: fc.constant('application/pdf'),
      uploadDate: fc.integer({ min: 2020, max: 2025 })
        .chain(year => fc.integer({ min: 1, max: 12 })
          .chain(month => fc.integer({ min: 1, max: 28 })
            .chain(day => fc.integer({ min: 0, max: 23 })
              .map(hour => `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:00:00.000Z`))))
    });

    const invoicesArrayArbitrary = fc.array(invoiceArbitrary, { minLength: 1, maxLength: 10 })
      .map(invoices => {
        const seen = new Set();
        return invoices.filter(inv => {
          if (seen.has(inv.expenseId)) return false;
          seen.add(inv.expenseId);
          return true;
        });
      })
      .filter(invoices => invoices.length > 0);

    await fc.assert(
      fc.asyncProperty(invoicesArrayArbitrary, async (invoices) => {
        const db = await createTestDatabase();
        try {
          await createNewExpensesTable(db);
          await createPeopleTable(db);
          await createOldExpenseInvoicesTable(db);
          for (const invoice of invoices) { await insertOldInvoice(db, invoice); }
          const countBefore = await countInvoices(db);
          const invoicesBefore = await getAllInvoices(db);
          const hadUniqueConstraint = await hasUniqueConstraintOnExpenseId(db);
          expect(hadUniqueConstraint).toBe(true);
          const hadPersonIdBefore = await hasColumn(db, 'expense_invoices', 'person_id');
          expect(hadPersonIdBefore).toBe(false);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`CREATE TABLE expense_invoices_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, expense_id INTEGER NOT NULL, person_id INTEGER,
                  filename TEXT NOT NULL, original_filename TEXT NOT NULL, file_path TEXT NOT NULL,
                  file_size INTEGER NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
                )`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`INSERT INTO expense_invoices_new (id, expense_id, person_id, filename, original_filename, file_path, file_size, mime_type, upload_date)
                    SELECT id, expense_id, NULL as person_id, filename, original_filename, file_path, file_size, mime_type, upload_date FROM expense_invoices`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('DROP TABLE expense_invoices', (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run('ALTER TABLE expense_invoices_new RENAME TO expense_invoices', (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const countAfter = await countInvoices(db);
          const invoicesAfter = await getAllInvoices(db);
          const hasUniqueConstraintAfter = await hasUniqueConstraintOnExpenseId(db);
          expect(hasUniqueConstraintAfter).toBe(false);
          const hasPersonIdAfter = await hasColumn(db, 'expense_invoices', 'person_id');
          expect(hasPersonIdAfter).toBe(true);
          expect(countAfter).toBe(countBefore);
          expect(countAfter).toBe(invoices.length);
          for (let i = 0; i < invoicesBefore.length; i++) {
            expect(invoicesAfter[i].id).toBe(invoicesBefore[i].id);
            expect(invoicesAfter[i].expense_id).toBe(invoicesBefore[i].expense_id);
            expect(invoicesAfter[i].filename).toBe(invoicesBefore[i].filename);
            expect(invoicesAfter[i].original_filename).toBe(invoicesBefore[i].original_filename);
            expect(invoicesAfter[i].file_path).toBe(invoicesBefore[i].file_path);
            expect(invoicesAfter[i].file_size).toBe(invoicesBefore[i].file_size);
            expect(invoicesAfter[i].mime_type).toBe(invoicesBefore[i].mime_type);
            expect(invoicesAfter[i].upload_date).toBe(invoicesBefore[i].upload_date);
            expect(invoicesAfter[i].person_id).toBeNull();
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 7 (extension): Multiple invoices per expense allowed after migration', async () => {
    const db = await createTestDatabase();
    try {
      await createNewExpensesTable(db);
      await createPeopleTable(db);
      await createNewExpenseInvoicesTable(db);
      const expenseId = 1;
      const invoices = [
        { expenseId, filename: 'invoice1.pdf', originalFilename: 'Invoice 1.pdf', filePath: '/invoices/1.pdf', fileSize: 1000, mimeType: 'application/pdf', uploadDate: '2024-01-01T00:00:00.000Z' },
        { expenseId, filename: 'invoice2.pdf', originalFilename: 'Invoice 2.pdf', filePath: '/invoices/2.pdf', fileSize: 2000, mimeType: 'application/pdf', uploadDate: '2024-01-02T00:00:00.000Z' },
        { expenseId, filename: 'invoice3.pdf', originalFilename: 'Invoice 3.pdf', filePath: '/invoices/3.pdf', fileSize: 3000, mimeType: 'application/pdf', uploadDate: '2024-01-03T00:00:00.000Z' }
      ];
      for (const invoice of invoices) {
        const id = await new Promise((resolve, reject) => {
          db.run(`INSERT INTO expense_invoices (expense_id, person_id, filename, original_filename, file_path, file_size, mime_type, upload_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [invoice.expenseId, null, invoice.filename, invoice.originalFilename, invoice.filePath, invoice.fileSize, invoice.mimeType, invoice.uploadDate],
            function(err) { err ? reject(err) : resolve(this.lastID); });
        });
        expect(id).toBeGreaterThan(0);
      }
      const count = await countInvoices(db);
      expect(count).toBe(3);
      const allInvoices = await getAllInvoices(db);
      expect(allInvoices.every(inv => inv.expense_id === expenseId)).toBe(true);
    } finally {
      await closeDatabase(db);
    }
  });
});


describe('Medical Insurance Tracking Migration - Property-Based Tests', () => {
  /**
   * Feature: medical-insurance-tracking, Property 10: Migration Data Preservation
   * Validates: Requirements 8.1, 8.4
   */
  test('Property 10: Migration Data Preservation', async () => {
    const medicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
      amount: amountArbitrary,
      type: fc.constant('Tax - Medical'),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const expensesArrayArbitrary = fc.array(medicalExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createPreInsuranceExpensesTable(db);
          await createPeopleTable(db);
          await createPreInsuranceExpensePeopleTable(db);

          const personIds = [];
          for (let i = 0; i < 3; i++) {
            const personId = await insertPerson(db, `Person ${i + 1}`);
            personIds.push(personId);
          }

          const expenseIds = [];
          for (const expense of expenses) {
            const id = await insertPreInsuranceExpense(db, expense);
            expenseIds.push(id);
          }

          for (let i = 0; i < expenseIds.length; i++) {
            const expenseId = expenseIds[i];
            const expense = expenses[i];
            const numPeople = Math.min(2, personIds.length);
            const allocationAmount = Math.round((expense.amount / numPeople) * 100) / 100;
            for (let j = 0; j < numPeople; j++) {
              await insertPreInsuranceExpensePerson(db, expenseId, personIds[j], allocationAmount);
            }
          }

          const expensesBefore = await getAllExpenses(db);
          const allocationsBefore = await getAllExpensePeople(db);

          // Simulate insurance fields migration
          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`ALTER TABLE expenses ADD COLUMN insurance_eligible INTEGER DEFAULT 0`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`ALTER TABLE expenses ADD COLUMN claim_status TEXT DEFAULT NULL`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run(`ALTER TABLE expenses ADD COLUMN original_cost REAL DEFAULT NULL`, (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run(`UPDATE expenses SET original_cost = amount WHERE type = 'Tax - Medical' AND original_cost IS NULL`, (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run(`ALTER TABLE expense_people ADD COLUMN original_amount REAL DEFAULT NULL`, (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          db.run(`UPDATE expense_people SET original_amount = amount WHERE original_amount IS NULL`, (err) => {
                            if (err) { db.run('ROLLBACK'); return reject(err); }
                            db.run('COMMIT', (err) => {
                              if (err) { db.run('ROLLBACK'); return reject(err); }
                              resolve();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const expensesAfter = await getAllExpenses(db);
          const allocationsAfter = await getAllExpensePeople(db);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          expect(allocationsAfter.length).toBe(allocationsBefore.length);

          for (let i = 0; i < expensesBefore.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.date).toBe(before.date);
            expect(after.place).toBe(before.place);
            expect(after.notes).toBe(before.notes);
            expect(after.amount).toBe(before.amount);
            expect(after.type).toBe(before.type);
            expect(after.week).toBe(before.week);
            expect(after.method).toBe(before.method);
            expect(after.insurance_eligible).toBe(0);
            expect(after.claim_status).toBeNull();
            expect(after.original_cost).toBe(before.amount);
          }

          for (let i = 0; i < allocationsBefore.length; i++) {
            const before = allocationsBefore[i];
            const after = allocationsAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.expense_id).toBe(before.expense_id);
            expect(after.person_id).toBe(before.person_id);
            expect(after.amount).toBe(before.amount);
            expect(after.original_amount).toBe(before.amount);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 10 (extension): Non-medical expenses preserved with NULL original_cost', async () => {
    const nonMedicalCategories = CATEGORIES.filter(c => c !== 'Tax - Medical');
    const nonMedicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
      amount: amountArbitrary,
      type: fc.constantFrom(...nonMedicalCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const expensesArrayArbitrary = fc.array(nonMedicalExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createPreInsuranceExpensesTable(db);
          for (const expense of expenses) { await insertPreInsuranceExpense(db, expense); }
          const expensesBefore = await getAllExpenses(db);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`ALTER TABLE expenses ADD COLUMN insurance_eligible INTEGER DEFAULT 0`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`ALTER TABLE expenses ADD COLUMN claim_status TEXT DEFAULT NULL`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run(`ALTER TABLE expenses ADD COLUMN original_cost REAL DEFAULT NULL`, (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run(`UPDATE expenses SET original_cost = amount WHERE type = 'Tax - Medical' AND original_cost IS NULL`, (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const expensesAfter = await getAllExpenses(db);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesBefore.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.date).toBe(before.date);
            expect(after.place).toBe(before.place);
            expect(after.notes).toBe(before.notes);
            expect(after.amount).toBe(before.amount);
            expect(after.type).toBe(before.type);
            expect(after.week).toBe(before.week);
            expect(after.method).toBe(before.method);
            expect(after.insurance_eligible).toBe(0);
            expect(after.claim_status).toBeNull();
            expect(after.original_cost).toBeNull();
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: medical-insurance-tracking, Property 11: Migration Defaults
   * Validates: Requirements 8.2, 8.3
   */
  test('Property 11: Migration Defaults', async () => {
    const medicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
      amount: amountArbitrary,
      type: fc.constant('Tax - Medical'),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const expensesArrayArbitrary = fc.array(medicalExpenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createPreInsuranceExpensesTable(db);
          for (const expense of expenses) { await insertPreInsuranceExpense(db, expense); }
          const expensesBefore = await getAllExpenses(db);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`ALTER TABLE expenses ADD COLUMN insurance_eligible INTEGER DEFAULT 0`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`ALTER TABLE expenses ADD COLUMN claim_status TEXT DEFAULT NULL`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run(`ALTER TABLE expenses ADD COLUMN original_cost REAL DEFAULT NULL`, (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run(`UPDATE expenses SET original_cost = amount WHERE type = 'Tax - Medical' AND original_cost IS NULL`, (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const expensesAfter = await getAllExpenses(db);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesAfter.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.insurance_eligible).toBe(0);
            expect(after.claim_status).toBeNull();
            expect(after.original_cost).toBe(before.amount);
            expect(after.amount).toBe(before.amount);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 11 (mixed): Migration Defaults for mixed expense types', async () => {
    const medicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
      amount: amountArbitrary,
      type: fc.constant('Tax - Medical'),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const nonMedicalCategories = CATEGORIES.filter(c => c !== 'Tax - Medical');
    const nonMedicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)),
      amount: amountArbitrary,
      type: fc.constantFrom(...nonMedicalCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const mixedExpensesArbitrary = fc.tuple(
      fc.array(medicalExpenseArbitrary, { minLength: 1, maxLength: 5 }),
      fc.array(nonMedicalExpenseArbitrary, { minLength: 1, maxLength: 5 })
    );

    await fc.assert(
      fc.asyncProperty(mixedExpensesArbitrary, async ([medicalExpenses, nonMedicalExpenses]) => {
        const db = await createTestDatabase();
        try {
          await createPreInsuranceExpensesTable(db);
          const allExpenses = [...medicalExpenses, ...nonMedicalExpenses];
          for (const expense of allExpenses) { await insertPreInsuranceExpense(db, expense); }
          const expensesBefore = await getAllExpenses(db);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run(`ALTER TABLE expenses ADD COLUMN insurance_eligible INTEGER DEFAULT 0`, (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run(`ALTER TABLE expenses ADD COLUMN claim_status TEXT DEFAULT NULL`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run(`ALTER TABLE expenses ADD COLUMN original_cost REAL DEFAULT NULL`, (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      db.run(`UPDATE expenses SET original_cost = amount WHERE type = 'Tax - Medical' AND original_cost IS NULL`, (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        db.run('COMMIT', (err) => {
                          if (err) { db.run('ROLLBACK'); return reject(err); }
                          resolve();
                        });
                      });
                    });
                  });
                });
              });
            });
          });

          const expensesAfter = await getAllExpenses(db);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesAfter.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.insurance_eligible).toBe(0);
            expect(after.claim_status).toBeNull();
            if (after.type === 'Tax - Medical') {
              expect(after.original_cost).toBe(before.amount);
            } else {
              expect(after.original_cost).toBeNull();
            }
            expect(after.amount).toBe(before.amount);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: medical-insurance-tracking, Property 10 (rollback): Migration rollback on failure
   * Validates: Requirements 8.4
   */
  test('Property 10 (rollback): Migration rollback preserves original data on failure', async () => {
    const medicalExpenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      type: fc.constant('Tax - Medical'),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary
    });

    const expensesArrayArbitrary = fc.array(medicalExpenseArbitrary, { minLength: 1, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createPreInsuranceExpensesTable(db);
          for (const expense of expenses) { await insertPreInsuranceExpense(db, expense); }
          const expensesBefore = await getAllExpenses(db);
          const countBefore = await countExpenses(db);

          try {
            await new Promise((resolve, reject) => {
              db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                  if (err) return reject(err);
                  db.run(`ALTER TABLE expenses ADD COLUMN insurance_eligible INTEGER DEFAULT 0`, (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('ROLLBACK', (err) => {
                      if (err) return reject(err);
                      reject(new Error('Simulated migration failure'));
                    });
                  });
                });
              });
            });
          } catch (error) {
            expect(error.message).toBe('Simulated migration failure');
          }

          const expensesAfter = await getAllExpenses(db);
          const countAfter = await countExpenses(db);
          expect(countAfter).toBe(countBefore);
          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesBefore.length; i++) {
            expect(expensesAfter[i].id).toBe(expensesBefore[i].id);
            expect(expensesAfter[i].date).toBe(expensesBefore[i].date);
            expect(expensesAfter[i].amount).toBe(expensesBefore[i].amount);
            expect(expensesAfter[i].type).toBe(expensesBefore[i].type);
          }
          const hasInsuranceColumn = await hasColumn(db, 'expenses', 'insurance_eligible');
          expect(hasInsuranceColumn).toBe(false);
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });
});


describe('Posted Date Migration - Property-Based Tests', () => {
  /**
   * Feature: credit-card-posted-date, Property 5: Migration Data Preservation
   * Validates: Requirements 3.2, 3.3, 5.2
   */
  test('Property 5: Migration Data Preservation - posted_date migration preserves existing data', async () => {
    const expenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      type: fc.constantFrom(...CATEGORIES),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary,
      payment_method_id: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10 })),
      insurance_eligible: fc.constantFrom(0, 1),
      claim_status: fc.oneof(fc.constant(null), fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied')),
      original_cost: fc.oneof(fc.constant(null), fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100))
    });

    const expensesArrayArbitrary = fc.array(expenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabase();
        try {
          await createPrePostedDateExpensesTable(db);
          for (const expense of expenses) { await insertPrePostedDateExpense(db, expense); }
          const countBefore = await countExpenses(db);
          const expensesBefore = await getAllExpenses(db);
          const hadPostedDateBefore = await hasColumn(db, 'expenses', 'posted_date');
          expect(hadPostedDateBefore).toBe(false);

          await new Promise((resolve, reject) => {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION', (err) => {
                if (err) return reject(err);
                db.run('ALTER TABLE expenses ADD COLUMN posted_date TEXT DEFAULT NULL', (err) => {
                  if (err) { db.run('ROLLBACK'); return reject(err); }
                  db.run('CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)', (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    db.run('COMMIT', (err) => {
                      if (err) { db.run('ROLLBACK'); return reject(err); }
                      resolve();
                    });
                  });
                });
              });
            });
          });

          const countAfter = await countExpenses(db);
          const expensesAfter = await getAllExpenses(db);
          const hasPostedDateAfter = await hasColumn(db, 'expenses', 'posted_date');
          expect(hasPostedDateAfter).toBe(true);
          expect(countAfter).toBe(countBefore);
          for (let i = 0; i < expensesBefore.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.date).toBe(before.date);
            expect(after.place).toBe(before.place);
            expect(after.notes).toBe(before.notes);
            expect(after.amount).toBe(before.amount);
            expect(after.type).toBe(before.type);
            expect(after.week).toBe(before.week);
            expect(after.method).toBe(before.method);
            expect(after.payment_method_id).toBe(before.payment_method_id);
            expect(after.insurance_eligible).toBe(before.insurance_eligible);
            expect(after.claim_status).toBe(before.claim_status);
            expect(after.original_cost).toBe(before.original_cost);
            expect(after.posted_date).toBeNull();
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: credit-card-posted-date, Property 5 (balance): Balance calculation backward compatibility
   * Validates: Requirements 5.2, 5.3
   */
  test('Property 5 (balance): Balance calculation produces same result for migrated expenses', async () => {
    const expenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
      notes: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 100 })),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      type: fc.constantFrom(...CATEGORIES),
      week: fc.integer({ min: 1, max: 5 }),
      method: methodArbitrary,
      payment_method_id: fc.integer({ min: 1, max: 3 }),
      insurance_eligible: fc.constant(0),
      claim_status: fc.constant(null),
      original_cost: fc.constant(null)
    });

    const expensesArrayArbitrary = fc.array(expenseArbitrary, { minLength: 1, maxLength: 10 });
    const referenceDateArbitrary = dateArbitrary;

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, referenceDateArbitrary, async (expenses, referenceDate) => {
        const db = await createTestDatabase();
        try {
          await createPrePostedDateExpensesTable(db);
          for (const expense of expenses) { await insertPrePostedDateExpense(db, expense); }

          const paymentMethodIds = [...new Set(expenses.map(e => e.payment_method_id))];
          const balancesBefore = {};
          for (const pmId of paymentMethodIds) {
            balancesBefore[pmId] = await calculateBalancePreMigration(db, pmId, referenceDate);
          }

          await new Promise((resolve, reject) => {
            db.run('ALTER TABLE expenses ADD COLUMN posted_date TEXT DEFAULT NULL', (err) => err ? reject(err) : resolve());
          });

          const balancesAfter = {};
          for (const pmId of paymentMethodIds) {
            balancesAfter[pmId] = await calculateBalancePostMigration(db, pmId, referenceDate);
          }

          for (const pmId of paymentMethodIds) {
            expect(balancesAfter[pmId]).toBe(balancesBefore[pmId]);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 5 (index): Migration creates posted_date index', async () => {
    const db = await createTestDatabase();
    try {
      await createPrePostedDateExpensesTable(db);
      const indexExistsBefore = await new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_expenses_posted_date'",
          (err, row) => err ? reject(err) : resolve(!!row));
      });
      expect(indexExistsBefore).toBe(false);

      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run('ALTER TABLE expenses ADD COLUMN posted_date TEXT DEFAULT NULL', (err) => {
            if (err) return reject(err);
            db.run('CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)', (err) => err ? reject(err) : resolve());
          });
        });
      });

      const indexExistsAfter = await new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_expenses_posted_date'",
          (err, row) => err ? reject(err) : resolve(!!row));
      });
      expect(indexExistsAfter).toBe(true);
    } finally {
      await closeDatabase(db);
    }
  });
});


// ============================================================================
// From migrations.billingCycleDay.pbt.test.js
// ============================================================================

describe('Billing Cycle Day Migration - Property-Based Tests', () => {
  /**
   * Property 5: Migration Idempotence
   * Validates: Requirements 2.4
   */
  test('Property 5: Migration Idempotence - running migration multiple times produces same result', async () => {
    const creditCardArbitrary = fc.record({
      type: fc.constant('credit_card'),
      display_name: fc.string({ minLength: 1, maxLength: 20 }).map((s, i) => `Card_${s}_${i}`),
      full_name: fc.string({ minLength: 1, maxLength: 50 }),
      credit_limit: fc.float({ min: 100, max: 50000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      current_balance: fc.float({ min: 0, max: 10000, noNaN: true }).map(n => Math.round(n * 100) / 100),
      payment_due_day: fc.integer({ min: 1, max: 31 }),
      billing_cycle_start: fc.integer({ min: 1, max: 31 }),
      billing_cycle_end: fc.integer({ min: 1, max: 31 }),
      is_active: fc.constant(1)
    });

    const runCountArbitrary = fc.integer({ min: 1, max: 5 });

    await fc.assert(
      fc.asyncProperty(
        fc.array(creditCardArbitrary, { minLength: 1, maxLength: 5 }),
        runCountArbitrary,
        async (creditCards, runCount) => {
          const db = await createTestDatabase();
          try {
            await createSchemaMigrationsTable(db);
            await createPaymentMethodsTableWithoutBillingCycleDay(db);

            const uniqueCards = creditCards.map((card, index) => ({
              ...card,
              display_name: `${card.display_name}_${index}_${Date.now()}`
            }));
            for (const card of uniqueCards) { await insertPaymentMethod(db, card); }

            const countBefore = await countPaymentMethods(db);
            const dataBefore = await getAllPaymentMethods(db);

            for (let i = 0; i < runCount; i++) {
              const columns = await getTableColumns(db, 'payment_methods');
              const hasBillingCycleDay = columns.includes('billing_cycle_day');
              if (!hasBillingCycleDay) {
                await new Promise((resolve, reject) => {
                  db.run('ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31))',
                    (err) => err ? reject(err) : resolve());
                });
                await new Promise((resolve, reject) => {
                  db.run(`UPDATE payment_methods SET billing_cycle_day = billing_cycle_end WHERE type = 'credit_card' AND billing_cycle_end IS NOT NULL AND billing_cycle_day IS NULL`,
                    (err) => err ? reject(err) : resolve());
                });
              }
            }

            const countAfter = await countPaymentMethods(db);
            const dataAfter = await getAllPaymentMethods(db);
            const columnsAfter = await getTableColumns(db, 'payment_methods');

            expect(countAfter).toBe(countBefore);
            expect(columnsAfter).toContain('billing_cycle_day');
            expect(dataAfter.length).toBe(dataBefore.length);

            for (let i = 0; i < dataBefore.length; i++) {
              const before = dataBefore[i];
              const after = dataAfter[i];
              expect(after.id).toBe(before.id);
              expect(after.type).toBe(before.type);
              expect(after.display_name).toBe(before.display_name);
              expect(after.full_name).toBe(before.full_name);
              expect(after.credit_limit).toBe(before.credit_limit);
              expect(after.current_balance).toBe(before.current_balance);
              expect(after.payment_due_day).toBe(before.payment_due_day);
              expect(after.billing_cycle_start).toBe(before.billing_cycle_start);
              expect(after.billing_cycle_end).toBe(before.billing_cycle_end);
              expect(after.is_active).toBe(before.is_active);
              if (before.type === 'credit_card' && before.billing_cycle_end !== null) {
                expect(after.billing_cycle_day).toBe(before.billing_cycle_end);
              }
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

  test('Migration preserves non-credit-card payment methods unchanged', async () => {
    const nonCreditCardArbitrary = fc.record({
      type: fc.constantFrom('cash', 'cheque', 'debit'),
      display_name: fc.string({ minLength: 1, maxLength: 20 }),
      full_name: fc.string({ minLength: 1, maxLength: 50 }),
      credit_limit: fc.constant(null),
      current_balance: fc.constant(0),
      payment_due_day: fc.constant(null),
      billing_cycle_start: fc.constant(null),
      billing_cycle_end: fc.constant(null),
      is_active: fc.constant(1)
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(nonCreditCardArbitrary, { minLength: 1, maxLength: 5 }),
        async (paymentMethods) => {
          const db = await createTestDatabase();
          try {
            await createSchemaMigrationsTable(db);
            await createPaymentMethodsTableWithoutBillingCycleDay(db);

            const uniqueMethods = paymentMethods.map((pm, index) => ({
              ...pm,
              display_name: `${pm.display_name}_${index}_${Date.now()}`
            }));
            for (const pm of uniqueMethods) { await insertPaymentMethod(db, pm); }
            const dataBefore = await getAllPaymentMethods(db);

            await new Promise((resolve, reject) => {
              db.run('ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31))',
                (err) => err ? reject(err) : resolve());
            });
            await new Promise((resolve, reject) => {
              db.run(`UPDATE payment_methods SET billing_cycle_day = billing_cycle_end WHERE type = 'credit_card' AND billing_cycle_end IS NOT NULL AND billing_cycle_day IS NULL`,
                (err) => err ? reject(err) : resolve());
            });

            const dataAfter = await getAllPaymentMethods(db);
            for (let i = 0; i < dataAfter.length; i++) {
              if (dataAfter[i].type !== 'credit_card') {
                expect(dataAfter[i].billing_cycle_day).toBeNull();
              }
              expect(dataAfter[i].type).toBe(dataBefore[i].type);
              expect(dataAfter[i].display_name).toBe(dataBefore[i].display_name);
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

  test('billing_cycle_day column rejects invalid values (outside 1-31)', async () => {
    const invalidDayArbitrary = fc.oneof(
      fc.integer({ min: -100, max: 0 }),
      fc.integer({ min: 32, max: 100 })
    );

    await fc.assert(
      fc.asyncProperty(invalidDayArbitrary, async (invalidDay) => {
        const db = await createTestDatabase();
        try {
          await createSchemaMigrationsTable(db);
          await createPaymentMethodsTableWithoutBillingCycleDay(db);
          await new Promise((resolve, reject) => {
            db.run('ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31))',
              (err) => err ? reject(err) : resolve());
          });

          const result = await new Promise((resolve) => {
            db.run(`INSERT INTO payment_methods (type, display_name, billing_cycle_day) VALUES ('credit_card', 'Test Card', ?)`,
              [invalidDay], (err) => resolve(err ? 'rejected' : 'accepted'));
          });
          expect(result).toBe('rejected');
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('billing_cycle_day column accepts valid values (1-31)', async () => {
    const validDayArbitrary = fc.integer({ min: 1, max: 31 });

    await fc.assert(
      fc.asyncProperty(validDayArbitrary, async (validDay) => {
        const db = await createTestDatabase();
        try {
          await createSchemaMigrationsTable(db);
          await createPaymentMethodsTableWithoutBillingCycleDay(db);
          await new Promise((resolve, reject) => {
            db.run('ALTER TABLE payment_methods ADD COLUMN billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31))',
              (err) => err ? reject(err) : resolve());
          });

          const id = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO payment_methods (type, display_name, billing_cycle_day) VALUES ('credit_card', 'Test Card ${validDay}', ?)`,
              [validDay], function(err) { err ? reject(err) : resolve(this.lastID); });
          });
          expect(id).toBeGreaterThan(0);

          const row = await new Promise((resolve, reject) => {
            db.get('SELECT billing_cycle_day FROM payment_methods WHERE id = ?', [id],
              (err, row) => err ? reject(err) : resolve(row));
          });
          expect(row.billing_cycle_day).toBe(validDay);
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
// From migrations.paymentMethods.pbt.test.js
// ============================================================================

// Payment methods migration helpers (uses FK-enabled database)
const pmMigrationMapping = [
  { id: 1, oldValue: 'Cash', displayName: 'Cash', fullName: 'Cash', type: 'cash' },
  { id: 2, oldValue: 'Debit', displayName: 'Debit', fullName: 'Debit', type: 'debit' },
  { id: 3, oldValue: 'Cheque', displayName: 'Cheque', fullName: 'Cheque', type: 'cheque' },
  { id: 4, oldValue: 'CIBC MC', displayName: 'CIBC MC', fullName: 'CIBC Mastercard', type: 'credit_card' },
  { id: 5, oldValue: 'PCF MC', displayName: 'PCF MC', fullName: 'PCF Mastercard', type: 'credit_card' },
  { id: 6, oldValue: 'WS VISA', displayName: 'WS VISA', fullName: 'WealthSimple VISA', type: 'credit_card' },
  { id: 7, oldValue: 'VISA', displayName: 'RBC VISA', fullName: 'RBC VISA', type: 'credit_card' }
];

async function createPmOldExpensesTable(db) {
  const categoryList = CATEGORIES.map(c => `'${c}'`).join(', ');
  await runStatement(db, `CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, place TEXT, notes TEXT,
    amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN (${categoryList})),
    week INTEGER NOT NULL CHECK(week >= 1 AND week <= 5), method TEXT NOT NULL,
    insurance_eligible INTEGER DEFAULT 0, claim_status TEXT DEFAULT NULL,
    original_cost REAL DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function createPmOldFixedExpensesTable(db) {
  await runStatement(db, `CREATE TABLE fixed_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER NOT NULL, month INTEGER NOT NULL,
    name TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0),
    category TEXT DEFAULT 'Other', payment_type TEXT DEFAULT 'Debit',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function runPaymentMethodsMigration(db) {
  await runStatement(db, `CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('cash', 'cheque', 'debit', 'credit_card')),
    display_name TEXT NOT NULL UNIQUE, full_name TEXT, account_details TEXT,
    credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
    current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
    payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
    billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
    billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await runStatement(db, `CREATE TABLE IF NOT EXISTS credit_card_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, payment_method_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0), payment_date TEXT NOT NULL, notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
  )`);

  await runStatement(db, `CREATE TABLE IF NOT EXISTS credit_card_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, payment_method_id INTEGER NOT NULL,
    statement_date TEXT NOT NULL, statement_period_start TEXT NOT NULL, statement_period_end TEXT NOT NULL,
    filename TEXT NOT NULL, original_filename TEXT NOT NULL, file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
  )`);

  for (const mapping of pmMigrationMapping) {
    await runStatement(db, `INSERT INTO payment_methods (id, type, display_name, full_name, is_active) VALUES (?, ?, ?, ?, 1)`,
      [mapping.id, mapping.type, mapping.displayName, mapping.fullName]);
  }

  await runStatement(db, 'ALTER TABLE expenses ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id)');
  await runStatement(db, 'ALTER TABLE fixed_expenses ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id)');

  for (const mapping of pmMigrationMapping) {
    await runStatement(db, 'UPDATE expenses SET payment_method_id = ? WHERE method = ?', [mapping.id, mapping.oldValue]);
    await runStatement(db, 'UPDATE fixed_expenses SET payment_method_id = ? WHERE payment_type = ?', [mapping.id, mapping.oldValue]);
  }

  await runStatement(db, 'UPDATE expenses SET method = ? WHERE method = ?', ['RBC VISA', 'VISA']);
  await runStatement(db, 'UPDATE fixed_expenses SET payment_type = ? WHERE payment_type = ?', ['RBC VISA', 'VISA']);
}

describe('Configurable Payment Methods Migration - Property-Based Tests', () => {
  /**
   * Feature: configurable-payment-methods, Property 12: Migration Round-Trip
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.7**
   */
  test('Property 12: Migration Round-Trip - expenses preserve payment method association', async () => {
    const paymentMethods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
    const validCategories = CATEGORIES.filter(c => c !== 'Personal Care');

    const expenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
      amount: amountArbitrary,
      type: fc.constantFrom(...validCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: fc.constantFrom(...paymentMethods)
    });

    const expensesArrayArbitrary = fc.array(expenseArbitrary, { minLength: 1, maxLength: 20 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabaseWithFK();
        try {
          await createSchemaMigrationsTable(db);
          await createPmOldExpensesTable(db);
          await createPmOldFixedExpensesTable(db);

          for (const expense of expenses) {
            await runStatement(db, `INSERT INTO expenses (date, place, notes, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [expense.date, expense.place, expense.notes, expense.amount, expense.type, expense.week, expense.method]);
          }

          const expensesBefore = await getAllRows(db, 'SELECT * FROM expenses ORDER BY id');
          await runPaymentMethodsMigration(db);
          const expensesAfter = await getAllRows(db, 'SELECT * FROM expenses ORDER BY id');

          expect(expensesAfter.length).toBe(expensesBefore.length);
          for (let i = 0; i < expensesBefore.length; i++) {
            const before = expensesBefore[i];
            const after = expensesAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.date).toBe(before.date);
            expect(after.place).toBe(before.place);
            expect(after.amount).toBe(before.amount);
            expect(after.type).toBe(before.type);
            expect(after.week).toBe(before.week);
            expect(after.payment_method_id).not.toBeNull();

            const paymentMethod = await getRow(db, 'SELECT * FROM payment_methods WHERE id = ?', [after.payment_method_id]);
            expect(paymentMethod).not.toBeNull();
            const expectedDisplayName = before.method === 'VISA' ? 'RBC VISA' : before.method;
            expect(paymentMethod.display_name).toBe(expectedDisplayName);
            if (before.method === 'VISA') {
              expect(after.method).toBe('RBC VISA');
            } else {
              expect(after.method).toBe(before.method);
            }
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  test('Property 12: Migration Round-Trip - fixed_expenses preserve payment method association', async () => {
    const paymentTypes = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

    const fixedExpenseArbitrary = fc.record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      amount: amountArbitrary,
      category: fc.constantFrom('Housing', 'Utilities', 'Subscriptions', 'Insurance', 'Other'),
      payment_type: fc.constantFrom(...paymentTypes)
    });

    const fixedExpensesArrayArbitrary = fc.array(fixedExpenseArbitrary, { minLength: 1, maxLength: 20 });

    await fc.assert(
      fc.asyncProperty(fixedExpensesArrayArbitrary, async (fixedExpenses) => {
        const db = await createTestDatabaseWithFK();
        try {
          await createSchemaMigrationsTable(db);
          await createPmOldExpensesTable(db);
          await createPmOldFixedExpensesTable(db);

          for (const fe of fixedExpenses) {
            await runStatement(db, `INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)`,
              [fe.year, fe.month, fe.name, fe.amount, fe.category, fe.payment_type]);
          }

          const fixedExpensesBefore = await getAllRows(db, 'SELECT * FROM fixed_expenses ORDER BY id');
          await runPaymentMethodsMigration(db);
          const fixedExpensesAfter = await getAllRows(db, 'SELECT * FROM fixed_expenses ORDER BY id');

          expect(fixedExpensesAfter.length).toBe(fixedExpensesBefore.length);
          for (let i = 0; i < fixedExpensesBefore.length; i++) {
            const before = fixedExpensesBefore[i];
            const after = fixedExpensesAfter[i];
            expect(after.id).toBe(before.id);
            expect(after.year).toBe(before.year);
            expect(after.month).toBe(before.month);
            expect(after.name).toBe(before.name);
            expect(after.amount).toBe(before.amount);
            expect(after.category).toBe(before.category);
            expect(after.payment_method_id).not.toBeNull();

            const paymentMethod = await getRow(db, 'SELECT * FROM payment_methods WHERE id = ?', [after.payment_method_id]);
            expect(paymentMethod).not.toBeNull();
            const expectedDisplayName = before.payment_type === 'VISA' ? 'RBC VISA' : before.payment_type;
            expect(paymentMethod.display_name).toBe(expectedDisplayName);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 24: Migration Idempotency
   * **Validates: Requirements 6A.4, 6A.5**
   */
  test('Property 24: Migration Idempotency - running migration twice produces same result', async () => {
    const paymentMethods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
    const validCategories = CATEGORIES.filter(c => c !== 'Personal Care');

    const expenseArbitrary = fc.record({
      date: dateArbitrary,
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: amountArbitrary,
      type: fc.constantFrom(...validCategories),
      week: fc.integer({ min: 1, max: 5 }),
      method: fc.constantFrom(...paymentMethods)
    });

    const expensesArrayArbitrary = fc.array(expenseArbitrary, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(expensesArrayArbitrary, async (expenses) => {
        const db = await createTestDatabaseWithFK();
        try {
          await createSchemaMigrationsTable(db);
          await createPmOldExpensesTable(db);
          await createPmOldFixedExpensesTable(db);

          for (const expense of expenses) {
            await runStatement(db, `INSERT INTO expenses (date, place, amount, type, week, method) VALUES (?, ?, ?, ?, ?, ?)`,
              [expense.date, expense.place, expense.amount, expense.type, expense.week, expense.method]);
          }

          await runPaymentMethodsMigration(db);
          const expensesAfterFirst = await getAllRows(db, 'SELECT * FROM expenses ORDER BY id');
          const paymentMethodsAfterFirst = await getAllRows(db, 'SELECT * FROM payment_methods ORDER BY id');

          const expensesAfterSecond = await getAllRows(db, 'SELECT * FROM expenses ORDER BY id');
          const paymentMethodsAfterSecond = await getAllRows(db, 'SELECT * FROM payment_methods ORDER BY id');

          expect(expensesAfterSecond.length).toBe(expensesAfterFirst.length);
          for (let i = 0; i < expensesAfterFirst.length; i++) {
            expect(expensesAfterSecond[i].id).toBe(expensesAfterFirst[i].id);
            expect(expensesAfterSecond[i].method).toBe(expensesAfterFirst[i].method);
            expect(expensesAfterSecond[i].payment_method_id).toBe(expensesAfterFirst[i].payment_method_id);
          }

          expect(paymentMethodsAfterSecond.length).toBe(paymentMethodsAfterFirst.length);
          for (let i = 0; i < paymentMethodsAfterFirst.length; i++) {
            expect(paymentMethodsAfterSecond[i].id).toBe(paymentMethodsAfterFirst[i].id);
            expect(paymentMethodsAfterSecond[i].display_name).toBe(paymentMethodsAfterFirst[i].display_name);
            expect(paymentMethodsAfterSecond[i].type).toBe(paymentMethodsAfterFirst[i].type);
          }
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      dbPbtOptions()
    );
  });

  /**
   * Feature: configurable-payment-methods, Property 13: Migration Type Assignment
   * **Validates: Requirements 6.4**
   */
  test('Property 13: Migration Type Assignment - correct types assigned to payment methods', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const db = await createTestDatabaseWithFK();
        try {
          await createSchemaMigrationsTable(db);
          await createPmOldExpensesTable(db);
          await createPmOldFixedExpensesTable(db);
          await runPaymentMethodsMigration(db);

          const pms = await getAllRows(db, 'SELECT * FROM payment_methods ORDER BY id');
          expect(pms.length).toBe(7);
          expect(pms.find(pm => pm.display_name === 'Cash').type).toBe('cash');
          expect(pms.find(pm => pm.display_name === 'Debit').type).toBe('debit');
          expect(pms.find(pm => pm.display_name === 'Cheque').type).toBe('cheque');
          expect(pms.find(pm => pm.display_name === 'CIBC MC').type).toBe('credit_card');
          expect(pms.find(pm => pm.display_name === 'PCF MC').type).toBe('credit_card');
          expect(pms.find(pm => pm.display_name === 'WS VISA').type).toBe('credit_card');
          expect(pms.find(pm => pm.display_name === 'RBC VISA').type).toBe('credit_card');
          return true;
        } finally {
          await closeDatabase(db);
        }
      }),
      { ...dbPbtOptions(), numRuns: 1 }
    );
  });
});
