# Configurable Payment Methods

**Version**: 5.4.1  
**Status**: Implemented  
**Spec**: `.kiro/specs/configurable-payment-methods/`, `.kiro/specs/credit-card-statement-balance/`, `.kiro/specs/unified-billing-cycles/`

## Overview

The Configurable Payment Methods feature transforms the payment method system from a hardcoded enum to a database-driven configurable system. Users can now manage payment methods, track credit card balances, record payments, and upload statements.

## Features

### Payment Method Types

Four payment method types are supported:

1. **Cash** - Simple cash payments
2. **Cheque** - Cheque payments
3. **Debit** - Debit card payments
4. **Credit Card** - Full credit card tracking with:
   - Credit limit and current balance
   - Utilization percentage calculation
   - Payment due date tracking
   - Billing cycle management
   - Payment history
   - Statement uploads

### Payment Method Management

Access via the "💳 Payment Methods" button in the main navigation:

- **View all payment methods** grouped by type
- **Create new payment methods** with type-specific fields
- **Edit existing payment methods** (name, details, limits)
- **Activate/deactivate** payment methods (inactive methods hidden from dropdowns but preserved for historical data)
- **Delete** payment methods with zero associated expenses

### Credit Card Features

For credit card type payment methods:

- **Balance Tracking**: Automatic balance updates when expenses are added/deleted
- **Statement Balance Calculation**: Automatic calculation of statement balance based on billing cycle dates
- **Billing Cycle History**: Full historical view of all billing cycles with actual vs calculated balances (v5.4.0)
- **Trend Indicators**: Visual comparison to previous billing cycle (higher/lower/same)
- **Transaction Counting**: Number of expenses per billing cycle
- **Smart Payment Alerts**: Payment reminders show required payment amount and suppress when statement is paid
- **Utilization Indicator**: Color-coded display (green < 30%, yellow 30-70%, red > 70%)
- **Payment Recording**: Log payments to reduce balance
- **Payment History**: View all recorded payments with dates and notes
- **Statement Uploads**: Attach PDF statements with period dates
- **Due Date Reminders**: Alerts when payment due within 7 days (suppressed when statement paid)

### Credit Card Posted Date

For credit card expenses, an optional "Posted Date" field allows distinguishing between:

- **Transaction Date**: When the purchase was made
- **Posted Date**: When the charge appeared on the credit card

This affects balance calculations - expenses are counted toward the balance based on their posted date (or transaction date if no posted date is set).

### Statement Balance Calculation (v4.21.0)

The system automatically calculates statement balance based on billing cycles:

- **Billing Cycle Day**: The day of the month when your statement closes (e.g., 15th)
- **Statement Balance**: Sum of expenses posted during the previous billing cycle minus payments made
- **Smart Alert Suppression**: Payment reminders are suppressed when statement balance is zero or negative

**How it works:**
1. Configure `billing_cycle_day` when creating/editing a credit card (required for new cards)
2. The system calculates the previous billing cycle period automatically
3. Statement balance = expenses in previous cycle - payments since statement date
4. If statement balance ≤ 0, payment reminders are suppressed
5. If statement balance > 0 and due within 7 days, reminder shows required payment amount

**Example:**
- Billing cycle day: 15
- Today: February 2
- Previous cycle: December 16 - January 15
- Statement balance: Sum of expenses posted Dec 16 - Jan 15, minus payments made since Jan 15

## Database Schema

### payment_methods Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| type | TEXT | 'cash', 'cheque', 'debit', 'credit_card' |
| display_name | TEXT | Short name shown in dropdowns |
| full_name | TEXT | Full descriptive name |
| account_details | TEXT | Optional account details |
| credit_limit | REAL | Credit limit (credit cards only) |
| current_balance | REAL | Current balance (credit cards only) |
| payment_due_day | INTEGER | Day of month payment is due |
| billing_cycle_day | INTEGER | Day of month statement closes (1-31) |
| billing_cycle_start | INTEGER | Day billing cycle starts (deprecated) |
| billing_cycle_end | INTEGER | Day billing cycle ends (deprecated) |
| is_active | INTEGER | 1 = active, 0 = inactive |

### credit_card_payments Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| payment_method_id | INTEGER | FK to payment_methods |
| amount | REAL | Payment amount |
| payment_date | TEXT | Date of payment |
| notes | TEXT | Optional notes |

### credit_card_statements Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| payment_method_id | INTEGER | FK to payment_methods |
| statement_date | TEXT | Statement date |
| statement_period_start | TEXT | Period start date |
| statement_period_end | TEXT | Period end date |
| filename | TEXT | Stored filename |
| original_filename | TEXT | Original upload filename |
| file_path | TEXT | Path to file |
| file_size | INTEGER | File size in bytes |
| mime_type | TEXT | MIME type |

### expenses Table Updates

- Added `payment_method_id` column (FK to payment_methods)
- Added `posted_date` column for credit card posted date tracking

## API Endpoints

### Payment Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payment-methods` | Get all payment methods |
| GET | `/api/payment-methods/:id` | Get payment method by ID |
| POST | `/api/payment-methods` | Create payment method |
| PUT | `/api/payment-methods/:id` | Update payment method |
| DELETE | `/api/payment-methods/:id` | Delete payment method |
| GET | `/api/payment-methods/display-names` | Get active method names for dropdowns |
| PATCH | `/api/payment-methods/:id/active` | Toggle active status |

### Credit Card Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payment-methods/:id/payments` | Get payment history |
| POST | `/api/payment-methods/:id/payments` | Record a payment |
| DELETE | `/api/payment-methods/:id/payments/:paymentId` | Delete a payment |

### Credit Card Statements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payment-methods/:id/statements` | Get statements list |
| POST | `/api/payment-methods/:id/statements` | Upload statement |
| GET | `/api/payment-methods/:id/statements/:statementId` | Download statement |
| DELETE | `/api/payment-methods/:id/statements/:statementId` | Delete statement |

## Migration

The migration automatically:

1. Creates the new tables (payment_methods, credit_card_payments, credit_card_statements)
2. Populates payment_methods with existing payment method values from expenses
3. Adds payment_method_id to expenses and fixed_expenses tables
4. Links existing expenses to their corresponding payment method records

### Default Payment Methods Created

| ID | Display Name | Full Name | Type |
|----|--------------|-----------|------|
| 1 | Cash | Cash | cash |
| 2 | Debit | Debit | debit |
| 3 | Cheque | Cheque | cheque |
| 4 | CIBC MC | CIBC Mastercard | credit_card |
| 5 | PCF MC | PCF Mastercard | credit_card |
| 6 | WS VISA | WealthSimple VISA | credit_card |
| 7 | RBC VISA | RBC VISA | credit_card |

## Backward Compatibility

- Existing expenses retain their payment method associations
- The `method` string column is preserved for display purposes
- Inactive payment methods are hidden from dropdowns but visible in filters for historical data
- Expenses with inactive payment methods show an "(inactive)" indicator

## User Guide

### Creating a Payment Method

1. Click "💳 Payment Methods" in the navigation
2. Click "+ Add Payment Method"
3. Select the type (Cash, Cheque, Debit, or Credit Card)
4. Fill in the required fields:
   - Display Name (shown in dropdowns)
   - Full Name (descriptive name)
   - For Credit Cards: Credit Limit, Payment Due Day, Billing Cycle dates
5. Click "Save"

### Recording a Credit Card Payment

1. Open Payment Methods modal
2. Click on a credit card to view details
3. Click "Record Payment"
4. Enter amount, date, and optional notes
5. Click "Save" - balance is automatically reduced

### Using Posted Date

1. When adding/editing an expense with a credit card payment method
2. The "Posted Date" field appears below the transaction date
3. Enter the date the charge posted to your credit card (optional)
4. If left blank, the transaction date is used for balance calculations

## Related Documentation

- [Credit Card Billing Cycles](./CREDIT_CARD_BILLING_CYCLES.md) - Billing cycle history feature
- [API Documentation](../API_DOCUMENTATION.md) - Full API reference
- [Database Migrations](../DATABASE_MIGRATIONS.md) - Migration details
