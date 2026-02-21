/**
 * Database Isolation Helper for Tests
 *
 * Provides isolated SQLite database instances per test suite to prevent
 * SQLITE_BUSY errors during parallel test execution.
 *
 * Usage:
 *   const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('./dbIsolation');
 *
 *   let db;
 *   beforeAll(async () => { db = await createIsolatedTestDb(); });
 *   afterAll(() => { cleanupIsolatedTestDb(db); });
 *
 * Each call to createIsolatedTestDb() creates a unique SQLite file with:
 *   - WAL journal mode enabled for better concurrency
 *   - Foreign keys enabled
 *   - Full schema (all tables, indexes, default payment methods)
 *
 * @module test/dbIsolation
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', 'config', 'database');

// Track all created database paths for global cleanup
const createdDatabases = [];

/**
 * Generate a unique database file path.
 * Uses worker ID + random suffix to guarantee uniqueness even within the same worker.
 */
function generateUniqueDbPath() {
  const workerId = process.env.JEST_WORKER_ID || '0';
  const suffix = crypto.randomBytes(6).toString('hex');
  return path.join(DB_DIR, `isolated-test-w${workerId}-${suffix}.db`);
}

/**
 * Create an isolated SQLite database with the full application schema.
 * Each call returns a new database instance backed by a unique file.
 *
 * @returns {Promise<sqlite3.Database>} The initialized database instance
 */
function createIsolatedTestDb() {
  return new Promise((resolve, reject) => {
    // Ensure the database directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const dbPath = generateUniqueDbPath();
    createdDatabases.push(dbPath);

    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) return reject(err);

        // Enable WAL journal mode for better concurrency
        db.run('PRAGMA journal_mode = WAL', (err) => {
          if (err) {
            // WAL is optional — continue even if it fails
          }

          createSchema(db)
            .then(() => seedDefaultPaymentMethods(db))
            .then(() => {
              // Attach the path for later cleanup
              db.__isolatedPath = dbPath;
              resolve(db);
            })
            .catch(reject);
        });
      });
    });
  });
}

/**
 * Clean up an isolated test database.
 * Closes the connection and removes the database file and WAL/SHM artifacts.
 *
 * @param {sqlite3.Database} db - The database instance returned by createIsolatedTestDb
 */
function cleanupIsolatedTestDb(db) {
  if (!db) return;

  const dbPath = db.__isolatedPath;

  // Close returns via callback; wrap to ensure file deletion happens after close
  try {
    db.close(() => {
      removeDbFiles(dbPath);
    });
  } catch (_) {
    // If close throws synchronously, still attempt cleanup
    removeDbFiles(dbPath);
  }
}

/**
 * Remove a database file and its WAL/SHM artifacts.
 * Retries once after a short delay to handle Windows file locking.
 */
function removeDbFiles(dbPath) {
  if (!dbPath) return;

  const suffixes = ['', '-wal', '-shm'];
  for (const suffix of suffixes) {
    const p = dbPath + suffix;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {
      // Retry after a brief delay (Windows file lock release)
      try {
        setTimeout(() => {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* give up */ }
        }, 100);
      } catch (_) { /* ignore */ }
    }
  }
}

/**
 * Clean up all isolated databases created during this process.
 * Useful as a global teardown safety net.
 */
function cleanupAllIsolatedDbs() {
  for (const dbPath of createdDatabases) {
    removeDbFiles(dbPath);
  }
  createdDatabases.length = 0;
}

// ─── Schema creation ───

function createSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
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
      claim_status TEXT DEFAULT NULL CHECK(claim_status IS NULL OR claim_status IN ('not_claimed','in_progress','paid','denied')),
      original_cost REAL DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS monthly_gross (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      gross_amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month)
    )`,
    `CREATE TABLE IF NOT EXISTS income_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      category TEXT DEFAULT 'Salary',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS fixed_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      category TEXT DEFAULT 'Other',
      payment_type TEXT DEFAULT 'Fixed',
      payment_method_id INTEGER REFERENCES payment_methods(id),
      payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
      linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
      start_date TEXT NOT NULL,
      notes TEXT,
      loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan','line_of_credit','mortgage')),
      is_paid_off INTEGER DEFAULT 0,
      estimated_months_left INTEGER,
      amortization_period INTEGER,
      term_length INTEGER,
      renewal_date TEXT,
      rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed','variable')),
      payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly','bi-weekly','accelerated_bi-weekly')),
      estimated_property_value REAL,
      fixed_interest_rate REAL DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS loan_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      remaining_balance REAL NOT NULL CHECK(remaining_balance >= 0),
      rate REAL NOT NULL CHECK(rate >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
      UNIQUE(loan_id, year, month)
    )`,
    `CREATE TABLE IF NOT EXISTS mortgage_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      payment_amount REAL NOT NULL,
      effective_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS loan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loan_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      category TEXT NOT NULL,
      "limit" REAL NOT NULL CHECK("limit" > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month, category)
    )`,
    `CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('TFSA','RRSP')),
      initial_value REAL NOT NULL CHECK(initial_value >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS investment_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      value REAL NOT NULL CHECK(value >= 0),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
      UNIQUE(investment_id, year, month)
    )`,
    `CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      date_of_birth TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expense_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      original_amount REAL DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
      UNIQUE(expense_id, person_id)
    )`,
    `CREATE TABLE IF NOT EXISTS expense_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      person_id INTEGER,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS place_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      standardized_name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(original_name)
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('investment_values','loan_balances')),
      dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, month, type)
    )`,
    `CREATE TABLE IF NOT EXISTS dismissed_anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(expense_id),
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('cash','cheque','debit','credit_card')),
      display_name TEXT NOT NULL UNIQUE,
      full_name TEXT,
      account_details TEXT,
      credit_limit REAL CHECK(credit_limit IS NULL OR credit_limit > 0),
      current_balance REAL DEFAULT 0 CHECK(current_balance >= 0),
      payment_due_day INTEGER CHECK(payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31)),
      billing_cycle_start INTEGER CHECK(billing_cycle_start IS NULL OR (billing_cycle_start >= 1 AND billing_cycle_start <= 31)),
      billing_cycle_end INTEGER CHECK(billing_cycle_end IS NULL OR (billing_cycle_end >= 1 AND billing_cycle_end <= 31)),
      billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31)),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS credit_card_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_method_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      payment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS credit_card_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_method_id INTEGER NOT NULL,
      statement_date TEXT NOT NULL,
      statement_period_start TEXT NOT NULL,
      statement_period_end TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS credit_card_billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_method_id INTEGER NOT NULL,
      cycle_start_date TEXT NOT NULL,
      cycle_end_date TEXT NOT NULL,
      actual_statement_balance REAL NOT NULL CHECK(actual_statement_balance >= 0),
      calculated_statement_balance REAL NOT NULL CHECK(calculated_statement_balance >= 0),
      minimum_payment REAL CHECK(minimum_payment IS NULL OR minimum_payment >= 0),
      notes TEXT,
      statement_pdf_path TEXT,
      is_user_entered INTEGER DEFAULT 0,
      effective_balance REAL,
      balance_type TEXT CHECK(balance_type IS NULL OR balance_type IN ('actual', 'calculated')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
      UNIQUE(payment_method_id, cycle_end_date)
    )`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      user_action TEXT NOT NULL,
      metadata TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  return runStatements(db, statements);
}

function seedDefaultPaymentMethods(db) {
  const methods = [
    [1, 'cash', 'Cash', 'Cash'],
    [2, 'debit', 'Debit', 'Debit Card'],
    [3, 'cheque', 'Cheque', 'Cheque'],
    [4, 'credit_card', 'CIBC MC', 'CIBC Mastercard'],
    [5, 'credit_card', 'PCF MC', 'PC Financial Mastercard'],
    [6, 'credit_card', 'WS VISA', 'WealthSimple VISA'],
    [7, 'credit_card', 'VISA', 'VISA']
  ];

  const statements = methods.map(([id, type, display, full]) =>
    `INSERT OR IGNORE INTO payment_methods (id, type, display_name, full_name, is_active) VALUES (${id}, '${type}', '${display}', '${full}', 1)`
  );

  return runStatements(db, statements);
}

function runStatements(db, statements) {
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = () => {
      if (i >= statements.length) return resolve();
      db.run(statements[i], (err) => {
        if (err) return reject(err);
        i++;
        next();
      });
    };
    next();
  });
}

module.exports = {
  createIsolatedTestDb,
  cleanupIsolatedTestDb,
  cleanupAllIsolatedDbs,
  generateUniqueDbPath
};
