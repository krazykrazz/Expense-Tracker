/**
 * Consolidated Database Schema
 *
 * Single source of truth for the SQLite database schema.
 * All table, index, trigger, and seed statements are defined here
 * and imported by db.js (production + test) and dbIsolation.js.
 *
 * @module database/schema
 */

// ─── Table Statements (24 tables) ───

const TABLE_STATEMENTS = [
  // schema_migrations — tracks applied migrations
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // expenses — variable expense transactions
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
    claim_status TEXT DEFAULT NULL CHECK(claim_status IS NULL OR claim_status IN ('not_claimed', 'in_progress', 'paid', 'denied')),
    original_cost REAL DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // monthly_gross — monthly gross income totals
  `CREATE TABLE IF NOT EXISTS monthly_gross (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    gross_amount REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month)
  )`,

  // income_sources — monthly income by source
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

  // fixed_expenses — recurring monthly expenses
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

  // loans — loan, line of credit, and mortgage tracking
  `CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initial_balance REAL NOT NULL CHECK(initial_balance >= 0),
    start_date TEXT NOT NULL,
    notes TEXT,
    loan_type TEXT NOT NULL DEFAULT 'loan' CHECK(loan_type IN ('loan', 'line_of_credit', 'mortgage')),
    is_paid_off INTEGER DEFAULT 0,
    estimated_months_left INTEGER,
    amortization_period INTEGER,
    term_length INTEGER,
    renewal_date TEXT,
    rate_type TEXT CHECK(rate_type IS NULL OR rate_type IN ('fixed', 'variable')),
    payment_frequency TEXT CHECK(payment_frequency IS NULL OR payment_frequency IN ('monthly', 'bi-weekly', 'accelerated_bi-weekly')),
    estimated_property_value REAL,
    fixed_interest_rate REAL DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // loan_balances — monthly balance and rate history
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

  // mortgage_payments — mortgage payment amount tracking
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

  // loan_payments — payment-based tracking for loans and mortgages
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

  // budgets — monthly budget limits per category
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

  // investments — TFSA/RRSP portfolio tracking
  `CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('TFSA', 'RRSP')),
    initial_value REAL NOT NULL CHECK(initial_value >= 0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // investment_values — monthly investment value snapshots
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

  // people — family member records
  `CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    date_of_birth TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // expense_people — expense-to-person allocations
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

  // expense_invoices — invoice PDF attachments
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

  // place_names — place name standardization mapping
  `CREATE TABLE IF NOT EXISTS place_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    standardized_name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(original_name)
  )`,

  // reminders — monthly data reminder tracking
  `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('investment_values', 'loan_balances')),
    dismissed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(year, month, type)
  )`,

  // dismissed_anomalies — persisted anomaly dismissals
  `CREATE TABLE IF NOT EXISTS dismissed_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    dismissed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(expense_id),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
  )`,

  // payment_methods — configurable payment methods
  `CREATE TABLE IF NOT EXISTS payment_methods (
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
    billing_cycle_day INTEGER CHECK(billing_cycle_day IS NULL OR (billing_cycle_day >= 1 AND billing_cycle_day <= 31)),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // credit_card_payments — credit card payment history
  `CREATE TABLE IF NOT EXISTS credit_card_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_method_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
  )`,

  // credit_card_statements — statement file uploads
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

  // credit_card_billing_cycles — billing cycle history with statement balances
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
    reviewed_at TEXT DEFAULT NULL,
    effective_balance REAL DEFAULT NULL,
    balance_type TEXT DEFAULT 'calculated' CHECK(balance_type IS NULL OR balance_type IN ('actual', 'calculated')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE,
    UNIQUE(payment_method_id, cycle_end_date)
  )`,

  // activity_logs — comprehensive event tracking
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

  // settings — key-value application configuration
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,

  // users — authentication user accounts
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`
];

// ─── Trigger Statements ───

const TRIGGER_STATEMENTS = [
  // Auto-update budgets.updated_at on row update
  `CREATE TRIGGER IF NOT EXISTS update_budgets_timestamp
   AFTER UPDATE ON budgets
   BEGIN
     UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`,

  // Auto-update credit_card_billing_cycles.updated_at on row update
  `CREATE TRIGGER IF NOT EXISTS update_billing_cycles_timestamp
   AFTER UPDATE ON credit_card_billing_cycles
   BEGIN
     UPDATE credit_card_billing_cycles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
   END`
];

// ─── Index Statements (~43 indexes) ───

const INDEX_STATEMENTS = [
  // expenses indexes
  'CREATE INDEX IF NOT EXISTS idx_date ON expenses(date)',
  'CREATE INDEX IF NOT EXISTS idx_type ON expenses(type)',
  'CREATE INDEX IF NOT EXISTS idx_method ON expenses(method)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_insurance_eligible ON expenses(insurance_eligible)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_claim_status ON expenses(claim_status)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_posted_date ON expenses(posted_date)',
  'CREATE INDEX IF NOT EXISTS idx_expenses_payment_method_id ON expenses(payment_method_id)',

  // monthly_gross indexes
  'CREATE INDEX IF NOT EXISTS idx_year_month ON monthly_gross(year, month)',

  // income_sources indexes
  'CREATE INDEX IF NOT EXISTS idx_income_year_month ON income_sources(year, month)',

  // fixed_expenses indexes
  'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_year_month ON fixed_expenses(year, month)',
  'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_payment_method_id ON fixed_expenses(payment_method_id)',
  'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_linked_loan ON fixed_expenses(linked_loan_id)',
  'CREATE INDEX IF NOT EXISTS idx_fixed_expenses_due_day ON fixed_expenses(payment_due_day)',

  // loans indexes
  'CREATE INDEX IF NOT EXISTS idx_loans_paid_off ON loans(is_paid_off)',
  'CREATE INDEX IF NOT EXISTS idx_loans_loan_type ON loans(loan_type)',

  // loan_balances indexes
  'CREATE INDEX IF NOT EXISTS idx_loan_balances_loan_id ON loan_balances(loan_id)',
  'CREATE INDEX IF NOT EXISTS idx_loan_balances_year_month ON loan_balances(year, month)',

  // mortgage_payments indexes
  'CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_id ON mortgage_payments(loan_id)',
  'CREATE INDEX IF NOT EXISTS idx_mortgage_payments_loan_effective_date ON mortgage_payments(loan_id, effective_date)',

  // loan_payments indexes
  'CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id ON loan_payments(loan_id)',
  'CREATE INDEX IF NOT EXISTS idx_loan_payments_payment_date ON loan_payments(payment_date)',

  // budgets indexes
  'CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month)',
  'CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category)',

  // investments indexes
  'CREATE INDEX IF NOT EXISTS idx_investments_type ON investments(type)',

  // investment_values indexes
  'CREATE INDEX IF NOT EXISTS idx_investment_values_investment_id ON investment_values(investment_id)',
  'CREATE INDEX IF NOT EXISTS idx_investment_values_year_month ON investment_values(year, month)',

  // expense_people indexes
  'CREATE INDEX IF NOT EXISTS idx_expense_people_expense ON expense_people(expense_id)',
  'CREATE INDEX IF NOT EXISTS idx_expense_people_person ON expense_people(person_id)',

  // expense_invoices indexes
  'CREATE INDEX IF NOT EXISTS idx_expense_invoices_expense_id ON expense_invoices(expense_id)',
  'CREATE INDEX IF NOT EXISTS idx_expense_invoices_upload_date ON expense_invoices(upload_date)',

  // dismissed_anomalies indexes
  'CREATE INDEX IF NOT EXISTS idx_dismissed_anomalies_expense_id ON dismissed_anomalies(expense_id)',

  // payment_methods indexes
  'CREATE INDEX IF NOT EXISTS idx_payment_methods_type ON payment_methods(type)',
  'CREATE INDEX IF NOT EXISTS idx_payment_methods_display_name ON payment_methods(display_name)',
  'CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active ON payment_methods(is_active)',

  // credit_card_payments indexes
  'CREATE INDEX IF NOT EXISTS idx_cc_payments_method_id ON credit_card_payments(payment_method_id)',
  'CREATE INDEX IF NOT EXISTS idx_cc_payments_date ON credit_card_payments(payment_date)',

  // credit_card_statements indexes
  'CREATE INDEX IF NOT EXISTS idx_cc_statements_method_id ON credit_card_statements(payment_method_id)',
  'CREATE INDEX IF NOT EXISTS idx_cc_statements_date ON credit_card_statements(statement_date)',

  // credit_card_billing_cycles indexes
  'CREATE INDEX IF NOT EXISTS idx_billing_cycles_payment_method ON credit_card_billing_cycles(payment_method_id)',
  'CREATE INDEX IF NOT EXISTS idx_billing_cycles_cycle_end ON credit_card_billing_cycles(cycle_end_date)',
  'CREATE INDEX IF NOT EXISTS idx_billing_cycles_pm_cycle_end ON credit_card_billing_cycles(payment_method_id, cycle_end_date)',

  // activity_logs indexes
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id)',

  // users indexes
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)'
];

// ─── Seed Statements ───

const SEED_PAYMENT_METHODS = [
  "INSERT OR IGNORE INTO payment_methods (type, display_name, full_name, is_active) VALUES ('cash', 'Cash', 'Cash', 1)",
  "INSERT OR IGNORE INTO payment_methods (type, display_name, full_name, is_active) VALUES ('debit', 'Debit', 'Debit Card', 1)",
  "INSERT OR IGNORE INTO payment_methods (type, display_name, full_name, is_active) VALUES ('cheque', 'Cheque', 'Cheque', 1)",
  "INSERT OR IGNORE INTO payment_methods (type, display_name, full_name, is_active) VALUES ('credit_card', 'Credit Card', 'Credit Card', 1)"
];

// ─── Combined export ───

const ALL_STATEMENTS = [
  ...TABLE_STATEMENTS,
  ...TRIGGER_STATEMENTS,
  ...INDEX_STATEMENTS,
  ...SEED_PAYMENT_METHODS
];

module.exports = {
  TABLE_STATEMENTS,
  INDEX_STATEMENTS,
  TRIGGER_STATEMENTS,
  SEED_PAYMENT_METHODS,
  ALL_STATEMENTS
};
