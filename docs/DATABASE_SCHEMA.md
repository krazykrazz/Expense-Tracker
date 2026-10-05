# Database Schema

Complete SQLite3 database schema documentation for the Expense Tracker application.

## Overview

The application uses SQLite3 for data persistence. The database file lives at `<CONFIG_DIR>/database/expenses.db` (`/config` in Docker, `backend/config` in local development — see `backend/config/paths.js`).

- `PRAGMA foreign_keys = ON` is issued on every connection (`backend/database/db.js`).
- `PRAGMA journal_mode = WAL` is enabled once at server startup (`backend/server.js`). `synchronous` is not set explicitly, so the SQLite default (`FULL`) applies.
- All `id` primary keys are `INTEGER PRIMARY KEY AUTOINCREMENT`. Timestamp columns default to `CURRENT_TIMESTAMP` (UTC).
- `updated_at` is maintained by application code, except for `budgets` and `credit_card_billing_cycles`, which also have `AFTER UPDATE` triggers (see [Triggers](#triggers)).

The schema contains **26 tables**:

| Group | Tables |
|-------|--------|
| Core | `expenses`, `monthly_gross`, `income_sources`, `fixed_expenses` |
| Financial tracking | `loans`, `loan_balances`, `loan_payments`, `mortgage_payments`, `investments`, `investment_values`, `budgets` |
| Medical & tax | `people`, `expense_people`, `expense_invoices` |
| Payment methods | `payment_methods`, `credit_card_payments`, `credit_card_statements`, `credit_card_billing_cycles` |
| Authentication | `users` |
| Utility | `place_names`, `reminders`, `dismissed_anomalies`, `anomaly_suppression_rules`, `activity_logs`, `settings`, `schema_migrations` |

## Core Tables

### expenses

Variable expense transactions with comprehensive tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique expense identifier |
| date | TEXT NOT NULL | Transaction date (YYYY-MM-DD) |
| posted_date | TEXT DEFAULT NULL | Optional posted date for credit card expenses |
| place | TEXT | Merchant/place name |
| notes | TEXT | Optional notes |
| amount | REAL NOT NULL | Out-of-pocket cost (or full amount if not insurance eligible) |
| type | TEXT NOT NULL | Expense category (see Categories below; validated in code, no CHECK) |
| week | INTEGER NOT NULL | Week of month (CHECK 1-5) |
| method | TEXT NOT NULL | Payment method display name (no CHECK) |
| payment_method_id | INTEGER | Foreign key to payment_methods table |
| insurance_eligible | INTEGER DEFAULT 0 | 0 or 1 (Tax - Medical only) |
| claim_status | TEXT DEFAULT NULL | NULL or 'not_claimed', 'in_progress', 'paid', 'denied' (CHECK) |
| original_cost | REAL DEFAULT NULL | Original cost before insurance reimbursement |
| created_at | TEXT | Creation timestamp |

**Categories** (`backend/utils/categories.js`): Automotive, Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Other, Tax - Donation, Tax - Medical

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` (no ON DELETE action — deleting a referenced payment method is rejected while foreign keys are enforced)

**Indexes**: `idx_date` (date), `idx_type` (type), `idx_method` (method), `idx_expenses_insurance_eligible`, `idx_expenses_claim_status`, `idx_expenses_posted_date`, `idx_expenses_payment_method_id`. Added by migration `performance_compound_indexes_v1`: `idx_expenses_date_type` (date, type), `idx_expenses_date_method` (date, method), `idx_expenses_week` (week), `idx_expenses_place_type` (place, type), `idx_expenses_date_place` (date, place).

### monthly_gross

Monthly gross income totals.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique identifier |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| gross_amount | REAL NOT NULL | Gross income for the month |
| created_at | TEXT | Creation timestamp |

**Constraints**:
- UNIQUE(year, month)

**Indexes**: `idx_year_month` (year, month)

### income_sources

Monthly income tracking with categorization.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique income source identifier |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| name | TEXT NOT NULL | Income source name |
| amount | REAL NOT NULL | Income amount (CHECK >= 0) |
| category | TEXT DEFAULT 'Salary' | Income category (Salary, Government, Gifts, Other — validated in code) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**: `idx_income_year_month` (year, month)

### fixed_expenses

Recurring monthly expenses with loan linkage support.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique fixed expense identifier |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| name | TEXT NOT NULL | Fixed expense name |
| amount | REAL NOT NULL | Expense amount (CHECK >= 0) |
| category | TEXT DEFAULT 'Other' | Expense category (same list as `expenses.type`, validated in code) |
| payment_type | TEXT DEFAULT 'Fixed' | Payment method display name (validated in code against `payment_methods.display_name`) |
| payment_method_id | INTEGER | Optional foreign key to payment_methods table |
| payment_due_day | INTEGER | Optional day of month payment is due (CHECK NULL or 1-31) |
| linked_loan_id | INTEGER | Optional foreign key to loans table |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` (no ON DELETE action)
- `linked_loan_id` → `loans(id)` ON DELETE SET NULL

**Indexes**: `idx_fixed_expenses_year_month` (year, month), `idx_fixed_expenses_payment_method_id`, `idx_fixed_expenses_linked_loan`, `idx_fixed_expenses_due_day`

## Financial Tracking Tables

### loans

Loan, line of credit, and mortgage tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique loan identifier |
| name | TEXT NOT NULL | Loan name |
| initial_balance | REAL NOT NULL | Original loan amount (CHECK >= 0) |
| start_date | TEXT NOT NULL | When loan started (YYYY-MM-DD) |
| notes | TEXT | Additional notes |
| loan_type | TEXT NOT NULL DEFAULT 'loan' | 'loan', 'line_of_credit', or 'mortgage' (CHECK) |
| is_paid_off | INTEGER DEFAULT 0 | 0 or 1 |
| estimated_months_left | INTEGER | Estimated months to payoff |
| amortization_period | INTEGER | Mortgage amortization in months |
| term_length | INTEGER | Mortgage term in months |
| renewal_date | TEXT | Mortgage renewal date |
| rate_type | TEXT | NULL, 'fixed' or 'variable' (CHECK; mortgages) |
| payment_frequency | TEXT | NULL, 'monthly', 'bi-weekly' or 'accelerated_bi-weekly' (CHECK; mortgages) |
| estimated_property_value | REAL | Property value for equity tracking |
| fixed_interest_rate | REAL DEFAULT NULL | Optional locked-in interest rate |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**: `idx_loans_paid_off` (is_paid_off), `idx_loans_loan_type` (loan_type)

### loan_balances

Monthly balance and rate snapshots for loans. `balanceCalculationService` uses the most recent snapshot as the anchor for payment-based balance calculation.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique balance entry identifier |
| loan_id | INTEGER NOT NULL | Foreign key to loans table |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| remaining_balance | REAL NOT NULL | Outstanding balance (CHECK >= 0) |
| rate | REAL NOT NULL | Interest rate percentage (CHECK >= 0) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(loan_id, year, month)

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

**Indexes**: `idx_loan_balances_loan_id`, `idx_loan_balances_year_month` (year, month)

### loan_payments

Payment-based tracking for loans and mortgages.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment identifier |
| loan_id | INTEGER NOT NULL | Foreign key to loans table |
| amount | REAL NOT NULL | Payment amount (CHECK > 0) |
| payment_date | TEXT NOT NULL | Date of payment (YYYY-MM-DD) |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**:
- `idx_loan_payments_loan_id` (loan_id)
- `idx_loan_payments_payment_date` (payment_date)

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

### mortgage_payments

Mortgage payment amount tracking over time.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique mortgage payment identifier |
| loan_id | INTEGER NOT NULL | Foreign key to loans table |
| payment_amount | REAL NOT NULL | Monthly payment amount |
| effective_date | TEXT NOT NULL | When this payment amount takes effect |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

**Indexes**: `idx_mortgage_payments_loan_id`, `idx_mortgage_payments_loan_effective_date` (loan_id, effective_date)

### investments

Investment account tracking (TFSA, RRSP).

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique investment identifier |
| name | TEXT NOT NULL | Investment name |
| type | TEXT NOT NULL | 'TFSA' or 'RRSP' (CHECK) |
| initial_value | REAL NOT NULL | Initial investment amount (CHECK >= 0) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**: `idx_investments_type` (type)

### investment_values

Monthly investment value snapshots.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique value entry identifier |
| investment_id | INTEGER NOT NULL | Foreign key to investments table |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| value | REAL NOT NULL | Investment value at end of month (CHECK >= 0) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(investment_id, year, month)

**Foreign Keys**:
- `investment_id` → `investments(id)` ON DELETE CASCADE

**Indexes**: `idx_investment_values_investment_id`, `idx_investment_values_year_month` (year, month)

### budgets

Monthly budget limits per category.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique budget identifier |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (CHECK 1-12) |
| category | TEXT NOT NULL | Any budgetable category (all expense categories except `Tax - *`; validated in code via `BUDGETABLE_CATEGORIES`) |
| "limit" | REAL NOT NULL | Budget limit amount (CHECK > 0). Quoted identifier — `limit` is an SQL keyword |
| created_at | TEXT NOT NULL | Creation timestamp |
| updated_at | TEXT NOT NULL | Last update timestamp (also set by trigger `update_budgets_timestamp`) |

**Constraints**:
- UNIQUE(year, month, category)

**Indexes**: `idx_budgets_period` (year, month), `idx_budgets_category` (category)

## Medical & Tax Tables

### people

Family member records for medical expense tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique person identifier |
| name | TEXT NOT NULL UNIQUE | Person's name |
| date_of_birth | TEXT | Optional date of birth |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### expense_people

Junction table linking expenses to people with allocation amounts.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique allocation identifier |
| expense_id | INTEGER NOT NULL | Foreign key to expenses table |
| person_id | INTEGER NOT NULL | Foreign key to people table |
| amount | DECIMAL(10,2) NOT NULL | Out-of-pocket amount allocated to this person |
| original_amount | REAL DEFAULT NULL | Original cost allocation for insurance tracking |
| created_at | TEXT | Creation timestamp |

**Constraints**:
- UNIQUE(expense_id, person_id)

**Foreign Keys**:
- `expense_id` → `expenses(id)` ON DELETE CASCADE
- `person_id` → `people(id)` ON DELETE CASCADE

**Indexes**: `idx_expense_people_expense` (expense_id), `idx_expense_people_person` (person_id)

### expense_invoices

Invoice PDF attachments with optional person linking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique invoice identifier |
| expense_id | INTEGER NOT NULL | Foreign key to expenses table |
| person_id | INTEGER | Optional foreign key to people table |
| filename | TEXT NOT NULL | Stored filename |
| original_filename | TEXT NOT NULL | Original upload filename |
| file_path | TEXT NOT NULL | Full path to file |
| file_size | INTEGER NOT NULL | File size in bytes |
| mime_type | TEXT NOT NULL DEFAULT 'application/pdf' | File MIME type |
| upload_date | DATETIME DEFAULT CURRENT_TIMESTAMP | When invoice was uploaded |

**Indexes**:
- `idx_expense_invoices_expense_id` (expense_id)
- `idx_expense_invoices_upload_date` (upload_date)

**Foreign Keys**:
- `expense_id` → `expenses(id)` ON DELETE CASCADE
- `person_id` → `people(id)` ON DELETE SET NULL

## Payment Method Tables

### payment_methods

Configurable payment methods with credit card support.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment method identifier |
| type | TEXT NOT NULL | 'cash', 'cheque', 'debit', 'credit_card' (CHECK) |
| display_name | TEXT NOT NULL UNIQUE | Short name shown in dropdowns |
| full_name | TEXT | Full descriptive name |
| account_details | TEXT | Optional account details |
| credit_limit | REAL | Credit limit (credit cards only; CHECK NULL or > 0) |
| current_balance | REAL DEFAULT 0 | Current balance (credit cards only; CHECK >= 0) |
| payment_due_day | INTEGER | Day of month payment is due (CHECK NULL or 1-31) |
| billing_cycle_start | INTEGER | Day billing cycle starts (CHECK NULL or 1-31) |
| billing_cycle_end | INTEGER | Day billing cycle ends (CHECK NULL or 1-31) |
| billing_cycle_day | INTEGER | Day billing cycle/statement closes (CHECK NULL or 1-31) |
| is_active | INTEGER DEFAULT 1 | 1 = active, 0 = inactive |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Seed data**: `Cash` (cash), `Debit` (debit), `Cheque` (cheque), `Credit Card` (credit_card) are inserted with `INSERT OR IGNORE` on every initialization (`SEED_PAYMENT_METHODS` in `schema.js`).

**Indexes**: `idx_payment_methods_type`, `idx_payment_methods_display_name`, `idx_payment_methods_is_active`

### credit_card_payments

Credit card payment history.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment identifier |
| payment_method_id | INTEGER NOT NULL | Foreign key to payment_methods |
| amount | REAL NOT NULL | Payment amount (CHECK > 0) |
| payment_date | TEXT NOT NULL | Date of payment |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

**Indexes**: `idx_cc_payments_method_id`, `idx_cc_payments_date` (payment_date)

### credit_card_statements

Credit card statement file uploads.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique statement identifier |
| payment_method_id | INTEGER NOT NULL | Foreign key to payment_methods |
| statement_date | TEXT NOT NULL | Statement date |
| statement_period_start | TEXT NOT NULL | Period start date |
| statement_period_end | TEXT NOT NULL | Period end date |
| filename | TEXT NOT NULL | Stored filename |
| original_filename | TEXT NOT NULL | Original upload filename |
| file_path | TEXT NOT NULL | Path to file |
| file_size | INTEGER NOT NULL | File size in bytes |
| mime_type | TEXT NOT NULL DEFAULT 'application/pdf' | MIME type |
| created_at | TEXT | Creation timestamp |

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

**Indexes**: `idx_cc_statements_method_id`, `idx_cc_statements_date` (statement_date)

### credit_card_billing_cycles

Billing cycle history with statement balances.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique billing cycle identifier |
| payment_method_id | INTEGER NOT NULL | Foreign key to payment_methods |
| cycle_start_date | TEXT NOT NULL | Billing cycle start date |
| cycle_end_date | TEXT NOT NULL | Billing cycle end date |
| actual_statement_balance | REAL NOT NULL | User-entered statement balance (CHECK >= 0) |
| calculated_statement_balance | REAL NOT NULL | System-calculated statement balance (CHECK >= 0) |
| minimum_payment | REAL | Optional minimum payment amount (CHECK >= 0 or NULL) |
| notes | TEXT | Optional notes |
| statement_pdf_path | TEXT | Optional path to attached PDF statement |
| is_user_entered | INTEGER DEFAULT 0 | 0 = auto-generated, 1 = user-entered |
| reviewed_at | TEXT DEFAULT NULL | Timestamp when auto-generated cycle was acknowledged |
| effective_balance | REAL DEFAULT NULL | Effective balance override for manual adjustments |
| balance_type | TEXT DEFAULT 'calculated' | NULL, 'actual' or 'calculated' (CHECK) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp (also set by trigger `update_billing_cycles_timestamp`) |

**Constraints**:
- UNIQUE(payment_method_id, cycle_end_date)

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

**Indexes**: `idx_billing_cycles_payment_method`, `idx_billing_cycles_cycle_end` (cycle_end_date), `idx_billing_cycles_pm_cycle_end` (payment_method_id, cycle_end_date)

## Authentication Tables

### users

User accounts for optional authentication (Password_Gate).

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique user identifier |
| username | TEXT NOT NULL UNIQUE | Username (default: "admin") |
| password_hash | TEXT DEFAULT '' | bcrypt password hash (empty = Open_Mode) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**: `idx_users_username` (username)

**Notes**:
- A default "admin" user with an empty password hash is created on first startup — by migration `auth_infrastructure_v1` (`INSERT OR IGNORE`) and by `authService.initializeDefaultUser()`, which `server.js` calls on every startup and `backupService` calls after a restore
- When `password_hash` is empty, the application operates in Open_Mode (no authentication required)
- When `password_hash` is non-empty, the application operates in Password_Gate mode (JWT authentication required)

## Utility Tables

### place_names

Place name standardization mapping.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique mapping identifier |
| original_name | TEXT NOT NULL UNIQUE | Original place name as entered |
| standardized_name | TEXT NOT NULL | Standardized/canonical name |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### reminders

Monthly data reminder tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique reminder identifier |
| year | INTEGER NOT NULL | Year |
| month | INTEGER NOT NULL | Month (1-12) |
| type | TEXT NOT NULL | 'investment_values' or 'loan_balances' (CHECK) |
| dismissed | INTEGER DEFAULT 0 | 0 or 1 |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(year, month, type)

### dismissed_anomalies

Persisted anomaly dismissals for analytics. Supports two actions: simple dismiss and mark-as-expected (which also creates a suppression rule).

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | Unique dismissal identifier |
| expense_id | INTEGER | ID of the dismissed expense (FK → expenses). NULL for category-level anomalies (e.g. `Category_Spending_Spike`) |
| anomaly_type | TEXT | Anomaly type/classification supplied by the caller (e.g. `amount`, `new_merchant`, `daily_total`, `Category_Spending_Spike`) |
| action | TEXT DEFAULT 'dismiss' | Action taken: 'dismiss' or 'mark_as_expected' |
| dismissed_at | TEXT DEFAULT CURRENT_TIMESTAMP | When the anomaly was dismissed |

**Constraints**:
- UNIQUE(expense_id, anomaly_type)
- CHECK(action IN ('dismiss', 'mark_as_expected'))
- FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE

**Indexes**:
- `idx_dismissed_anomalies_expense_id` on expense_id
- `idx_dismissed_anomalies_anomaly_type` on anomaly_type (created by migration `dismissed_anomalies_nullable_expense_id_v1` only)

### anomaly_suppression_rules

Pattern-level suppression rules for adaptive anomaly detection. Created when user marks an anomaly as "expected" — prevents similar anomalies from being flagged in the future.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | Unique rule identifier |
| rule_type | TEXT NOT NULL | Rule type: 'merchant_amount', 'merchant_category', or 'specific_date' |
| merchant_name | TEXT | Merchant name for merchant-based rules |
| category | TEXT | Category for merchant_category rules |
| amount_min | REAL | Minimum amount for merchant_amount rules |
| amount_max | REAL | Maximum amount for merchant_amount rules |
| specific_date | TEXT | Date for specific_date rules |
| created_at | TEXT DEFAULT CURRENT_TIMESTAMP | When the rule was created |

**Constraints**:
- CHECK(rule_type IN ('merchant_amount', 'merchant_category', 'specific_date'))

**Indexes**:
- idx_suppression_rules_type on rule_type
- idx_suppression_rules_merchant on merchant_name

### activity_logs

Comprehensive event tracking for all data changes.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique activity log identifier |
| event_type | TEXT NOT NULL | Event name (e.g. `expense_added`, `loan_updated`, `backup_created`) |
| entity_type | TEXT NOT NULL | Type of entity (see below) |
| entity_id | INTEGER | ID of the affected entity (nullable) |
| user_action | TEXT NOT NULL | Human-readable description of the action |
| metadata | TEXT | JSON string with entity-specific details |
| timestamp | TEXT NOT NULL DEFAULT (datetime('now')) | When the event occurred |
| created_at | TEXT | Creation timestamp |

**Indexes**:
- `idx_activity_logs_timestamp` (timestamp DESC)
- `idx_activity_logs_entity` (entity_type, entity_id)

**Retention**: Automatically cleaned up based on configurable retention settings (default: 90 days / 1000 events, managed via Settings → General)

**Entity Types in use** (not constrained by the schema):
- expense, fixed_expense, income_source, loan, loan_balance, loan_payment, mortgage_payment, investment, investment_value, budget, payment_method, credit_card_payment, credit_card_statement, billing_cycle, invoice, person, settings, auth, anomaly, suppression_rule, system (backups, version upgrades, scheduler)

### settings

Key-value store for application settings (e.g., retention policy configuration, JWT secret).

| Field | Type | Description |
|-------|------|-------------|
| key | TEXT PRIMARY KEY | Setting identifier (`activity_log_max_age_days`, `activity_log_max_count`, `business_timezone`, `last_known_version`, `jwt_secret`) |
| value | TEXT NOT NULL | Setting value (stored as text, parsed by service layer) |
| updated_at | TEXT | Last update timestamp |

### schema_migrations

Migration tracking for database schema changes.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique migration identifier |
| migration_name | TEXT NOT NULL UNIQUE | Name of the migration |
| applied_at | TEXT DEFAULT CURRENT_TIMESTAMP | When the migration was applied |

Current entries written by `runMigrations()`: `consolidated_schema_v1`, `auth_infrastructure_v1`, `dismissed_anomalies_nullable_expense_id_v1`, `performance_compound_indexes_v1`, `analytics_hub_revamp_v1`. See [Database Migrations](DATABASE_MIGRATIONS.md).

## Relationships

### One-to-Many Relationships

- `payment_methods` → `expenses` (via payment_method_id)
- `payment_methods` → `fixed_expenses` (via payment_method_id)
- `payment_methods` → `credit_card_payments`
- `payment_methods` → `credit_card_statements`
- `payment_methods` → `credit_card_billing_cycles`
- `loans` → `loan_balances`
- `loans` → `loan_payments`
- `loans` → `mortgage_payments`
- `loans` → `fixed_expenses` (via linked_loan_id)
- `investments` → `investment_values`
- `expenses` → `expense_invoices`
- `expenses` → `dismissed_anomalies`
- `people` → `expense_invoices` (optional, via person_id)

### Many-to-Many Relationships

- `expenses` ↔ `people` (via expense_people junction table)

## Indexes

All indexes are listed per table above. `schema.js` (`INDEX_STATEMENTS`) creates 46 indexes on every initialization (production and test). Migrations add the following on production databases only (test databases do not run migrations):

- `performance_compound_indexes_v1`: `idx_expenses_date_type`, `idx_expenses_date_method`, `idx_expenses_week`, `idx_expenses_place_type`, `idx_expenses_date_place`. It also issues `CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp)`, which is a no-op because `schema.js` already created an index with that name (on `timestamp DESC`).
- `dismissed_anomalies_nullable_expense_id_v1`: `idx_dismissed_anomalies_anomaly_type`

## Triggers

| Trigger | Table | Behaviour |
|---------|-------|-----------|
| `update_budgets_timestamp` | budgets | AFTER UPDATE: sets `updated_at = CURRENT_TIMESTAMP` |
| `update_billing_cycles_timestamp` | credit_card_billing_cycles | AFTER UPDATE: sets `updated_at = CURRENT_TIMESTAMP` |

## Foreign Key Constraints

Foreign keys are enforced (`PRAGMA foreign_keys = ON` per connection):

- **CASCADE DELETE**: Child records are deleted when parent is deleted
  - loan_balances, loan_payments, mortgage_payments (when loan deleted)
  - investment_values (when investment deleted)
  - expense_people (when expense or person deleted)
  - expense_invoices (when expense deleted)
  - dismissed_anomalies (when expense deleted)
  - credit_card_payments, credit_card_statements, credit_card_billing_cycles (when payment method deleted)

- **SET NULL**: Foreign key is set to NULL when parent is deleted
  - fixed_expenses.linked_loan_id (when loan deleted)
  - expense_invoices.person_id (when person deleted)

- **No action (delete is rejected while referenced)**
  - expenses.payment_method_id
  - fixed_expenses.payment_method_id

## Data Integrity

### Unique Constraints

- `monthly_gross`: (year, month)
- `loan_balances`: (loan_id, year, month)
- `investment_values`: (investment_id, year, month)
- `budgets`: (year, month, category)
- `people`: (name)
- `expense_people`: (expense_id, person_id)
- `place_names`: (original_name)
- `reminders`: (year, month, type)
- `dismissed_anomalies`: (expense_id, anomaly_type)
- `payment_methods`: (display_name)
- `credit_card_billing_cycles`: (payment_method_id, cycle_end_date)
- `users`: (username)
- `schema_migrations`: (migration_name)

### Check Constraints

- `expenses.week` between 1 and 5; `expenses.claim_status` NULL or one of 'not_claimed', 'in_progress', 'paid', 'denied'
- `income_sources.amount`, `fixed_expenses.amount` >= 0; `fixed_expenses.payment_due_day` NULL or 1-31
- `loans.initial_balance` >= 0; `loans.loan_type`, `loans.rate_type`, `loans.payment_frequency` enumerations
- `loan_balances.remaining_balance`, `loan_balances.rate` >= 0
- `loan_payments.amount` > 0
- `budgets.month` 1-12; `budgets."limit"` > 0
- `investments.type` 'TFSA'/'RRSP'; `investments.initial_value`, `investment_values.value` >= 0
- `reminders.type` 'investment_values'/'loan_balances'
- `dismissed_anomalies.action` 'dismiss'/'mark_as_expected'
- `anomaly_suppression_rules.rule_type` enumeration
- `payment_methods.type` enumeration; `credit_limit` NULL or > 0; `current_balance` >= 0; `payment_due_day`, `billing_cycle_start`, `billing_cycle_end`, `billing_cycle_day` NULL or 1-31
- `credit_card_payments.amount` > 0
- `credit_card_billing_cycles.actual_statement_balance`, `calculated_statement_balance` >= 0; `minimum_payment` NULL or >= 0; `balance_type` NULL, 'actual' or 'calculated'

## Schema Definition

The database schema is defined declaratively in `backend/database/schema.js` as a single source of truth. It exports `TABLE_STATEMENTS`, `TRIGGER_STATEMENTS`, `INDEX_STATEMENTS`, `SEED_PAYMENT_METHODS` and the combined `ALL_STATEMENTS`. Production initialization (`initializeDatabase()` in `db.js`) and test databases (`createTestDatabase()` in `db.js`, `createIsolatedTestDb()` in `backend/test/dbIsolation.js`) all execute `ALL_STATEMENTS`, ensuring schema parity. Only production initialization then runs `runMigrations()`.

The `schema_migrations` table tracks applied migrations. Schema changes that existing databases need are added as new entries in the `MIGRATIONS` array in `backend/database/migrations.js` — see [Database Migrations](DATABASE_MIGRATIONS.md).
