# Database Schema

Complete SQLite3 database schema documentation for the Expense Tracker application.

## Overview

The application uses SQLite3 for data persistence with foreign key constraints enabled. All tables include `created_at` timestamps, and many include `updated_at` timestamps for audit trails.

## Core Tables

### expenses

Variable expense transactions with comprehensive tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique expense identifier |
| date | TEXT | Transaction date (YYYY-MM-DD) |
| place | TEXT | Merchant/place name |
| notes | TEXT | Optional notes |
| amount | REAL | Out-of-pocket cost (or full amount if not insurance eligible) |
| type | TEXT | Expense category (see Categories below) |
| week | INTEGER | Week of month (1-5) |
| method | TEXT | Payment method display name |
| payment_method_id | INTEGER | Foreign key to payment_methods table |
| posted_date | TEXT | Optional posted date for credit card expenses |
| insurance_eligible | INTEGER | 0 or 1 (Tax - Medical only) |
| claim_status | TEXT | 'not_claimed', 'in_progress', 'paid', 'denied' |
| original_cost | REAL | Original cost before insurance reimbursement |
| reimbursement_eligible | INTEGER | 0 or 1 (any expense type) |
| reimbursement_status | TEXT | 'pending', 'submitted', 'approved', 'paid', 'denied' |
| expected_reimbursement | REAL | Expected reimbursement amount |
| reimbursement_source | TEXT | Who will reimburse (employer, insurance, etc.) |
| created_at | TEXT | Creation timestamp |

**Categories**: Clothing, Dining Out, Entertainment, Gas, Gifts, Groceries, Housing, Insurance, Personal Care, Pet Care, Recreation Activities, Subscriptions, Utilities, Vehicle Maintenance, Other, Tax - Medical, Tax - Donation

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE SET NULL

### income_sources

Monthly income tracking with categorization.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique income source identifier |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| name | TEXT | Income source name |
| amount | REAL | Income amount |
| category | TEXT | Income category (Salary, Government, Gifts, Other) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### fixed_expenses

Recurring monthly expenses with loan linkage support.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique fixed expense identifier |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| name | TEXT | Fixed expense name |
| amount | REAL | Expense amount |
| category | TEXT | Expense category (Housing, Utilities, Subscriptions, Insurance, etc.) |
| payment_type | TEXT | Payment method (Credit Card, Debit Card, Cash, Cheque, E-Transfer) |
| payment_due_day | INTEGER | Optional day of month payment is due (1-31) |
| linked_loan_id | INTEGER | Optional foreign key to loans table |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Foreign Keys**:
- `linked_loan_id` → `loans(id)` ON DELETE SET NULL

## Financial Tracking Tables

### loans

Loan, line of credit, and mortgage tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique loan identifier |
| name | TEXT | Loan name |
| initial_balance | REAL | Original loan amount |
| start_date | TEXT | When loan started (YYYY-MM-DD) |
| notes | TEXT | Additional notes |
| loan_type | TEXT | 'loan', 'line_of_credit', or 'mortgage' |
| is_paid_off | INTEGER | 0 or 1 |
| fixed_interest_rate | REAL | Optional locked-in interest rate |
| amortization_period | INTEGER | Mortgage amortization in months |
| term_length | INTEGER | Mortgage term in months |
| renewal_date | TEXT | Mortgage renewal date |
| rate_type | TEXT | 'fixed' or 'variable' (mortgages) |
| payment_frequency | TEXT | Payment frequency (mortgages) |
| estimated_property_value | REAL | Property value for equity tracking |
| estimated_months_left | INTEGER | Estimated months to payoff |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### loan_balances

Monthly balance and rate history for loans (legacy - being replaced by loan_payments).

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique balance entry identifier |
| loan_id | INTEGER | Foreign key to loans table |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| remaining_balance | REAL | Outstanding balance |
| rate | REAL | Interest rate percentage |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(loan_id, year, month)

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

### loan_payments

Payment-based tracking for loans and mortgages.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment identifier |
| loan_id | INTEGER | Foreign key to loans table |
| amount | REAL | Payment amount (must be positive) |
| payment_date | TEXT | Date of payment (YYYY-MM-DD) |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Indexes**:
- loan_id
- payment_date

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

### mortgage_payments

Mortgage payment amount tracking over time.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique mortgage payment identifier |
| loan_id | INTEGER | Foreign key to loans table |
| payment_amount | REAL | Monthly payment amount |
| effective_date | TEXT | When this payment amount takes effect |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Foreign Keys**:
- `loan_id` → `loans(id)` ON DELETE CASCADE

### investments

Investment account tracking (TFSA, RRSP).

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique investment identifier |
| name | TEXT | Investment name |
| type | TEXT | 'TFSA' or 'RRSP' |
| initial_value | REAL | Initial investment amount |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### investment_values

Monthly investment value snapshots.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique value entry identifier |
| investment_id | INTEGER | Foreign key to investments table |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| value | REAL | Investment value at end of month |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(investment_id, year, month)

**Foreign Keys**:
- `investment_id` → `investments(id)` ON DELETE CASCADE

### budgets

Monthly budget limits per category.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique budget identifier |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| category | TEXT | 'Food', 'Gas', or 'Other' |
| limit | REAL | Budget limit amount (must be > 0) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(year, month, category)

## Medical & Tax Tables

### people

Family member records for medical expense tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique person identifier |
| name | TEXT NOT NULL | Person's name |
| date_of_birth | DATE | Optional date of birth |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### expense_people

Junction table linking expenses to people with allocation amounts.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique allocation identifier |
| expense_id | INTEGER | Foreign key to expenses table |
| person_id | INTEGER | Foreign key to people table |
| amount | DECIMAL | Out-of-pocket amount allocated to this person |
| original_amount | REAL | Original cost allocation for insurance tracking |
| created_at | TEXT | Creation timestamp |

**Constraints**:
- UNIQUE(expense_id, person_id)

**Foreign Keys**:
- `expense_id` → `expenses(id)` ON DELETE CASCADE
- `person_id` → `people(id)` ON DELETE CASCADE

### expense_invoices

Invoice PDF attachments with optional person linking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique invoice identifier |
| expense_id | INTEGER | Foreign key to expenses table |
| person_id | INTEGER | Optional foreign key to people table |
| filename | TEXT | Stored filename |
| original_filename | TEXT | Original upload filename |
| file_path | TEXT | Full path to file |
| file_size | INTEGER | File size in bytes |
| mime_type | TEXT | File MIME type (application/pdf) |
| upload_date | TEXT | When invoice was uploaded |

**Indexes**:
- expense_id
- person_id
- upload_date

**Foreign Keys**:
- `expense_id` → `expenses(id)` ON DELETE CASCADE
- `person_id` → `people(id)` ON DELETE SET NULL

## Payment Method Tables

### payment_methods

Configurable payment methods with credit card support.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment method identifier |
| type | TEXT | 'cash', 'cheque', 'debit', 'credit_card' |
| display_name | TEXT | Short name shown in dropdowns |
| full_name | TEXT | Full descriptive name |
| account_details | TEXT | Optional account details |
| credit_limit | REAL | Credit limit (credit cards only) |
| current_balance | REAL | Current balance (credit cards only) |
| payment_due_day | INTEGER | Day of month payment is due |
| billing_cycle_day | INTEGER | Day billing cycle/statement closes (1-31) |
| billing_cycle_start | INTEGER | Day billing cycle starts |
| billing_cycle_end | INTEGER | Day billing cycle ends |
| is_active | INTEGER | 1 = active, 0 = inactive |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### credit_card_payments

Credit card payment history.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique payment identifier |
| payment_method_id | INTEGER | Foreign key to payment_methods |
| amount | REAL | Payment amount |
| payment_date | TEXT | Date of payment |
| notes | TEXT | Optional notes |
| created_at | TEXT | Creation timestamp |

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

### credit_card_statements

Credit card statement file uploads.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique statement identifier |
| payment_method_id | INTEGER | Foreign key to payment_methods |
| statement_date | TEXT | Statement date |
| statement_period_start | TEXT | Period start date |
| statement_period_end | TEXT | Period end date |
| filename | TEXT | Stored filename |
| original_filename | TEXT | Original upload filename |
| file_path | TEXT | Path to file |
| file_size | INTEGER | File size in bytes |
| mime_type | TEXT | MIME type |
| created_at | TEXT | Creation timestamp |

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

### credit_card_billing_cycles

Billing cycle history with statement balances.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique billing cycle identifier |
| payment_method_id | INTEGER | Foreign key to payment_methods |
| cycle_start_date | TEXT | Billing cycle start date |
| cycle_end_date | TEXT | Billing cycle end date |
| actual_statement_balance | REAL | User-entered statement balance |
| is_user_entered | INTEGER | 0 = auto-generated, 1 = user-entered |
| statement_filename | TEXT | Optional attached PDF statement |
| statement_original_filename | TEXT | Original PDF filename |
| statement_file_path | TEXT | Path to PDF file |
| statement_file_size | INTEGER | PDF file size |
| statement_mime_type | TEXT | PDF MIME type |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

**Constraints**:
- UNIQUE(payment_method_id, cycle_start_date, cycle_end_date)

**Foreign Keys**:
- `payment_method_id` → `payment_methods(id)` ON DELETE CASCADE

## Utility Tables

### place_names

Place name standardization mapping.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique mapping identifier |
| original_name | TEXT | Original place name as entered |
| standardized_name | TEXT | Standardized/canonical name |
| created_at | TEXT | Creation timestamp |

### reminders

Monthly data reminder tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique reminder identifier |
| year | INTEGER | Year |
| month | INTEGER | Month (1-12) |
| reminder_type | TEXT | Type of reminder |
| is_dismissed | INTEGER | 0 or 1 |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last update timestamp |

### dismissed_anomalies

Persisted anomaly dismissals for analytics.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique dismissal identifier |
| anomaly_key | TEXT | Unique key identifying the anomaly |
| dismissed_at | TEXT | When the anomaly was dismissed |

**Constraints**:
- UNIQUE(anomaly_key)

### activity_logs

Comprehensive event tracking for all data changes.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique activity log identifier |
| entity_type | TEXT | Type of entity (expense, loan, investment, etc.) |
| entity_id | INTEGER | ID of the affected entity |
| action | TEXT | Action performed (create, update, delete) |
| metadata | TEXT | JSON string with entity-specific details |
| timestamp | TEXT | When the event occurred (ISO 8601) |

**Indexes**:
- entity_type
- action
- timestamp

**Retention**: Automatically cleaned up based on configurable retention settings (default: 90 days / 1000 events, managed via Settings → General)

**Supported Entity Types**:
- expense, fixed_expense, loan, investment, budget, payment_method, loan_payment, backup

### settings

Key-value store for application settings (e.g., retention policy configuration).

| Field | Type | Description |
|-------|------|-------------|
| key | TEXT PRIMARY KEY | Setting identifier (e.g., `retention_max_age_days`) |
| value | TEXT | Setting value (stored as text, parsed by service layer) |
| updated_at | TEXT | Last update timestamp |

### schema_migrations

Migration tracking for database schema changes.

| Field | Type | Description |
|-------|------|-------------|
| id | INTEGER PRIMARY KEY | Unique migration identifier |
| migration_name | TEXT UNIQUE | Name of the migration |
| applied_at | TEXT | When the migration was applied |

## Relationships

### One-to-Many Relationships

- `payment_methods` → `expenses` (via payment_method_id)
- `payment_methods` → `credit_card_payments`
- `payment_methods` → `credit_card_statements`
- `payment_methods` → `credit_card_billing_cycles`
- `loans` → `loan_balances`
- `loans` → `loan_payments`
- `loans` → `mortgage_payments`
- `loans` → `fixed_expenses` (via linked_loan_id)
- `investments` → `investment_values`
- `expenses` → `expense_invoices`

### Many-to-Many Relationships

- `expenses` ↔ `people` (via expense_people junction table)

## Indexes

Performance indexes are created on:

- `loan_payments(loan_id, payment_date)`
- `expense_invoices(expense_id, person_id, upload_date)`
- `activity_logs(entity_type, action, timestamp)`

## Foreign Key Constraints

All foreign keys are enforced with appropriate CASCADE or SET NULL actions:

- **CASCADE DELETE**: Child records are deleted when parent is deleted
  - loan_balances, loan_payments, mortgage_payments (when loan deleted)
  - investment_values (when investment deleted)
  - expense_people (when expense or person deleted)
  - expense_invoices (when expense deleted)
  - credit_card_payments, credit_card_statements, credit_card_billing_cycles (when payment method deleted)

- **SET NULL**: Foreign key is set to NULL when parent is deleted
  - expenses.payment_method_id (when payment method deleted)
  - fixed_expenses.linked_loan_id (when loan deleted)
  - expense_invoices.person_id (when person deleted)

## Data Integrity

### Unique Constraints

- `loan_balances`: (loan_id, year, month)
- `investment_values`: (investment_id, year, month)
- `budgets`: (year, month, category)
- `expense_people`: (expense_id, person_id)
- `credit_card_billing_cycles`: (payment_method_id, cycle_start_date, cycle_end_date)
- `dismissed_anomalies`: (anomaly_key)
- `schema_migrations`: (migration_name)

### Check Constraints

- `budgets.limit` must be > 0
- `loan_payments.amount` must be positive

## Migration System

The application uses a migration system tracked in the `schema_migrations` table. Each migration is applied once and recorded with its name and timestamp.

Migrations are located in `backend/database/migrations.js` and are automatically applied on application startup.
