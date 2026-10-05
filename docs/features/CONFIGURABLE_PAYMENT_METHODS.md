# Configurable Payment Methods

**Status**: Active  
**Last Updated**: 2026-10-04

## Overview

Payment methods are stored in the `payment_methods` table rather than a hardcoded list. Users can create, edit and deactivate payment methods, and credit cards get balance tracking, payment logging, billing cycles and statement PDFs.

Backend: `backend/routes/paymentMethodRoutes.js`, `backend/services/paymentMethodService.js` (facade over `paymentMethodBalanceService.js`, `paymentMethodBillingCycleService.js`, `paymentMethodValidationService.js`), `creditCardPaymentService.js`, `creditCardStatementService.js`.
Frontend: `frontend/src/components/financial/FinancialOverviewModal.jsx`, `frontend/src/components/credit-cards/` (`PaymentMethodForm`, `CreditCardDetailView`, `CreditCardPaymentForm`, `UnifiedBillingCycleList`).

## Features

### Payment Method Types

| Type | Fields |
|------|--------|
| `cash` | Display name |
| `cheque`, `debit` | Display name, optional account details |
| `credit_card` | Display name, full name (required), account details, credit limit, initial balance (create only), payment due day (required), statement closing day (`billing_cycle_day`, required), optional legacy billing cycle start/end days |

`billing_cycle_day` and `payment_due_day` are required for new credit cards and cannot be cleared once set (`paymentMethodValidationService`). The type cannot be changed after creation.

### Payment Method Management

Open the **💼 Financial** button in the month selector; payment methods appear in the **Payment Methods** section of the Financial Overview modal:

- **Active / Inactive tabs**; credit cards are listed in a summary grid (Card, Current, Statement, Cycle) with **View** and **Pay** buttons, followed by **Other Payment Methods**
- **+ Add** opens `PaymentMethodForm` (Add/Edit Payment Method)
- **Deactivate / Activate** from the edit form, or **Deactivate** in the credit card detail view; inactive cards can be **Reactivated** from the Inactive tab. The last active payment method cannot be deactivated
- Inactive methods are hidden from new-expense dropdowns; when editing an expense that uses one, it is shown under an "Inactive" group with an "(inactive)" suffix
- **Delete** is API-only (`DELETE /api/payment-methods/:id`) and is rejected if the method has any expenses or is the last active method

### Credit Card Features

- **Current Balance** ("What you owe today") – anchored to the latest billing cycle (see [Balance Calculation](#credit-card-balance-calculation))
- **Statement Balance** – amount due from the most recently closed cycle; see [Credit Card Statement Balance](./CREDIT_CARD_STATEMENT_BALANCE.md)
- **Projected Balance** – shown only when it differs from the current balance (future-dated / not-yet-posted expenses)
- **Utilization** – `current_balance / credit_limit`; bar is green below 30%, warning at ≥ 30%, danger at ≥ 70%
- **Payment Due** card – days until `payment_due_day`; highlighted when ≤ 7 days and the statement isn't paid
- **💳 Log Payment** and a **Payments** tab with history and delete
- **Billing Cycles** tab – see [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md)
- **Payment reminders** – see [Credit Card Statement Balance](./CREDIT_CARD_STATEMENT_BALANCE.md#payment-reminders)
- **Posted date** on credit card expenses – see [Credit Card Posted Date](./CREDIT_CARD_POSTED_DATE.md)

### Credit Card Balance Calculation

Implemented in `backend/services/paymentMethodBalanceService.js`. All expense sums use `COALESCE(original_cost, amount)` (full charge before insurance reimbursement) and the effective date `COALESCE(posted_date, date)`. All results are rounded to cents and floored at 0.

| Balance | Calculation |
|---------|-------------|
| Current | **Anchored**: take the most recent `credit_card_billing_cycles` record (by `cycle_end_date`) and its effective balance (actual if user-entered, else calculated), then add expenses with effective date in `(cycle_end_date, today]` and subtract payments with `payment_date` in `(cycle_end_date, today]`. If the card has no billing cycle record, falls back to all expenses with effective date ≤ today minus all payments ≤ today. |
| Projected | All expenses minus all payments, with no date filter. |
| Statement | `statementBalanceService.calculateStatementBalance()` when `billing_cycle_day` is set; otherwise a legacy calculation from `billing_cycle_start`/`billing_cycle_end`, or `null`. |

Anchoring means a user-entered statement balance resets the running total, so older untracked charges or credits don't keep skewing the current balance.

Balances are computed on read (`GET /api/payment-methods`, `/:id/credit-card-detail`). The stored `payment_methods.current_balance` column is adjusted incrementally on expense create/update/delete, and reset to the anchored value when a payment is recorded or deleted and by `POST /api/payment-methods/:id/recalculate-balance`.

## Database Schema

### payment_methods Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| type | TEXT | 'cash', 'cheque', 'debit', 'credit_card' |
| display_name | TEXT | Short name shown in dropdowns (unique) |
| full_name | TEXT | Full descriptive name |
| account_details | TEXT | Optional account details |
| credit_limit | REAL | Credit limit (credit cards only, > 0) |
| current_balance | REAL | Stored balance (credit cards only, ≥ 0); see above |
| payment_due_day | INTEGER | Day of month payment is due (1-31) |
| billing_cycle_day | INTEGER | Day of month statement closes (1-31) |
| billing_cycle_start | INTEGER | Legacy cycle start day (optional) |
| billing_cycle_end | INTEGER | Legacy cycle end day (optional) |
| is_active | INTEGER | 1 = active, 0 = inactive |
| created_at / updated_at | TEXT | Timestamps |

### credit_card_payments Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| payment_method_id | INTEGER | FK to payment_methods (cascade delete) |
| amount | REAL | Payment amount (> 0) |
| payment_date | TEXT | Date of payment |
| notes | TEXT | Optional notes |
| created_at | TEXT | Timestamp |

### credit_card_statements Table

Stores standalone statement uploads (API only; the UI attaches statement PDFs to billing cycle records instead).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| payment_method_id | INTEGER | FK to payment_methods (cascade delete) |
| statement_date | TEXT | Statement date |
| statement_period_start | TEXT | Period start date |
| statement_period_end | TEXT | Period end date |
| filename | TEXT | Stored filename |
| original_filename | TEXT | Original upload filename |
| file_path | TEXT | Path to file |
| file_size | INTEGER | File size in bytes |
| mime_type | TEXT | MIME type (default `application/pdf`) |

Billing cycle records live in `credit_card_billing_cycles` — see [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md#database-schema).

### expenses / fixed_expenses

- `payment_method_id` (FK to payment_methods); the `method` text column still holds the display name
- `expenses.posted_date` – see [Credit Card Posted Date](./CREDIT_CARD_POSTED_DATE.md)

Expenses can be submitted with either `payment_method_id` or `method` (display name); the service resolves one from the other.

## API Endpoints

All routes are under `/api/payment-methods`.

### Payment Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | All payment methods (credit card balances computed on read) |
| GET | `/active` | Active methods for dropdowns |
| GET | `/display-names` | All display names (uniqueness validation) |
| GET | `/:id` | Payment method by ID |
| POST | `/` | Create payment method |
| PUT | `/:id` | Update payment method |
| DELETE | `/:id` | Delete (only if no expenses and not the last active method) |
| PATCH | `/:id/active` | Set active/inactive |
| POST | `/:id/recalculate-balance` | Recompute and store anchored current balance |
| GET | `/:id/statement-balance` | Statement balance details |
| GET | `/:id/billing-cycles` | Legacy billing cycle details |
| GET | `/:id/credit-card-detail` | Combined detail payload (card, payments, statement balance, current cycle status, billing cycles) |

### Credit Card Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/payments` | Payment history |
| GET | `/:id/payments/total` | Total payments in a date range |
| POST | `/:id/payments` | Record a payment |
| DELETE | `/:id/payments/:paymentId` | Delete a payment |

### Credit Card Statements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/statements` | Statements list |
| POST | `/:id/statements` | Upload statement (multipart field `statement`) |
| GET | `/:id/statements/:statementId` | Download statement |
| DELETE | `/:id/statements/:statementId` | Delete statement |

Billing cycle endpoints are documented in [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md#api-endpoints).

## Default Payment Methods

A new database is seeded (`backend/database/schema.js`) with: Cash (`cash`), Debit (`debit`, full name "Debit Card"), Cheque (`cheque`), and Credit Card (`credit_card`).

## User Guide

### Creating a Payment Method

1. Click **💼 Financial** in the month selector
2. In the Payment Methods section, click **+ Add**
3. Select the type and fill in Display Name; for credit cards also Full Name, Payment Due Day and Statement Closing Day (Credit Limit and Initial Balance are optional)
4. Click **Create**

### Logging a Credit Card Payment

1. In the Payment Methods section, click **Pay** on a card (or **View** → **💳 Log Payment**)
2. Enter amount, date and optional notes
3. Click **Record Payment**

## Related Documentation

- [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md)
- [Credit Card Statement Balance](./CREDIT_CARD_STATEMENT_BALANCE.md)
- [Credit Card Posted Date](./CREDIT_CARD_POSTED_DATE.md)
- [API Documentation](../API_DOCUMENTATION.md)
- [Database Schema](../DATABASE_SCHEMA.md)
