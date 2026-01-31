# Requirements Document

## Introduction

This feature transforms the payment method system from a fixed, hardcoded enum to a fully configurable system where users can manage their own payment methods with type-specific attributes. The system supports four payment method types: Cash, Cheque, Debit, and Credit Card, each with unique configuration options. Credit cards include rich features like balance tracking, billing cycle information, and payment history management.

## Glossary

- **Payment_Method**: A configured payment instrument used to record expense transactions
- **Payment_Method_Type**: The category of payment method (Cash, Cheque, Debit, Credit_Card)
- **Display_Name**: A short identifier shown in dropdowns and lists (e.g., "WS VISA")
- **Full_Name**: The complete name of the payment method (e.g., "World Elite VISA")
- **Billing_Cycle**: The monthly period for credit card statements (e.g., 15th to 14th)
- **Credit_Card_Balance**: The current outstanding amount on a credit card
- **Credit_Card_Payment**: A payment made toward a credit card balance
- **Account_Details**: Optional reference information for bank accounts (e.g., last 4 digits)
- **Expense_Tracker**: The main application system
- **Migration_Service**: The component responsible for converting existing data to the new schema

## Requirements

### Requirement 1: Payment Method Type Management

**User Story:** As a user, I want to create and manage payment methods of different types, so that I can accurately track how I pay for expenses.

#### Acceptance Criteria

1. THE Expense_Tracker SHALL support four Payment_Method_Types: Cash, Cheque, Debit, and Credit_Card
2. WHEN a user creates a Cash payment method, THE Expense_Tracker SHALL require only a Display_Name
3. WHEN a user creates a Cheque payment method, THE Expense_Tracker SHALL require a Display_Name and optionally accept Account_Details
4. WHEN a user creates a Debit payment method, THE Expense_Tracker SHALL require a Display_Name and optionally accept Account_Details
5. WHEN a user creates a Credit_Card payment method, THE Expense_Tracker SHALL require a Display_Name, Full_Name, and optionally accept Billing_Cycle information
6. THE Expense_Tracker SHALL allow multiple payment methods of the same Payment_Method_Type (e.g., two Debit accounts)
7. WHEN a user views the payment method list, THE Expense_Tracker SHALL display all configured payment methods grouped by Payment_Method_Type

### Requirement 2: Payment Method CRUD Operations

**User Story:** As a user, I want to add, edit, and manage payment methods, so that I can keep my payment options current.

#### Acceptance Criteria

1. WHEN a user submits a valid payment method form, THE Expense_Tracker SHALL create the payment method and persist it to the database
2. WHEN a user edits an existing payment method, THE Expense_Tracker SHALL update the payment method attributes and preserve existing expense associations
3. THE Expense_Tracker SHALL NOT allow deletion of payment methods that have associated expenses
4. WHEN a user wants to retire a payment method with expenses, THE Expense_Tracker SHALL allow marking it as inactive via a toggle
5. WHEN a payment method is inactive, THE Expense_Tracker SHALL hide it from new expense dropdowns but preserve historical data and display in expense lists
6. THE Expense_Tracker SHALL validate Display_Name uniqueness across all active payment methods
7. THE Expense_Tracker SHALL allow deletion only of payment methods with zero associated expenses
8. WHEN viewing historical expenses, THE Expense_Tracker SHALL display the payment method name even if the payment method is inactive

### Requirement 3: Credit Card Balance and Utilization Tracking

**User Story:** As a user, I want to track my credit card balances, limits, and utilization, so that I can monitor my credit card debt and maintain good credit health.

#### Acceptance Criteria

1. WHEN a user views a Credit_Card payment method, THE Expense_Tracker SHALL display the current Credit_Card_Balance
2. WHEN a user records a Credit_Card_Payment, THE Expense_Tracker SHALL reduce the Credit_Card_Balance by the payment amount
3. WHEN an expense is recorded with a Credit_Card payment method, THE Expense_Tracker SHALL increase the Credit_Card_Balance by the expense amount
4. THE Expense_Tracker SHALL maintain a history of Credit_Card_Payments with date, amount, and optional notes
5. WHEN a user views credit card payment history, THE Expense_Tracker SHALL display payments in reverse chronological order
6. THE Expense_Tracker SHALL calculate and display the total payments made to each credit card within a specified date range
7. WHEN a user creates a Credit_Card, THE Expense_Tracker SHALL allow entry of a credit_limit amount
8. THE Expense_Tracker SHALL calculate and display credit utilization percentage (balance / credit_limit * 100)
9. WHEN credit utilization exceeds 30%, THE Expense_Tracker SHALL display a warning indicator
10. WHEN credit utilization exceeds 70%, THE Expense_Tracker SHALL display a danger indicator

### Requirement 3A: Credit Card Payment Due Dates

**User Story:** As a user, I want to track payment due dates for my credit cards, so that I never miss a payment.

#### Acceptance Criteria

1. WHEN a user creates or edits a Credit_Card, THE Expense_Tracker SHALL allow entry of a payment_due_day (1-31)
2. THE Expense_Tracker SHALL calculate the next payment due date based on the payment_due_day
3. WHEN a credit card payment is due within 7 days, THE Expense_Tracker SHALL display a reminder in the monthly reminders system
4. WHEN a credit card payment is overdue, THE Expense_Tracker SHALL display an urgent alert
5. THE Expense_Tracker SHALL display days until next payment due date on the credit card detail view

### Requirement 3B: Credit Card Statement Tracking

**User Story:** As a user, I want to track my credit card statements and spending by billing cycle, so that I can reconcile my expenses.

#### Acceptance Criteria

1. WHEN a user views a Credit_Card, THE Expense_Tracker SHALL display spending for the current billing cycle
2. THE Expense_Tracker SHALL calculate the current billing cycle based on billing_cycle_start and billing_cycle_end dates
3. THE Expense_Tracker SHALL allow users to upload credit card statement PDFs for record keeping
4. THE Expense_Tracker SHALL store statement files with metadata including statement_date and statement_period
5. WHEN a user views statement history, THE Expense_Tracker SHALL display statements in reverse chronological order
6. THE Expense_Tracker SHALL display a comparison of current cycle spending vs previous cycle spending

### Requirement 4: Expense Form Integration

**User Story:** As a user, I want to select from my configured payment methods when recording expenses, so that I can accurately categorize my spending.

#### Acceptance Criteria

1. WHEN a user opens the expense form, THE Expense_Tracker SHALL populate the payment method dropdown with all active configured payment methods
2. THE Expense_Tracker SHALL display payment methods in the dropdown using their Display_Name
3. WHEN a user selects a payment method, THE Expense_Tracker SHALL remember the selection for subsequent expense entries
4. IF no payment methods are configured, THEN THE Expense_Tracker SHALL prompt the user to create at least one payment method before recording expenses
5. THE Expense_Tracker SHALL group payment methods in the dropdown by Payment_Method_Type for easier selection

### Requirement 5: Fixed Expenses Integration

**User Story:** As a user, I want to assign configured payment methods to my fixed expenses, so that my recurring costs are accurately tracked.

#### Acceptance Criteria

1. WHEN a user creates or edits a fixed expense, THE Expense_Tracker SHALL display the same payment method dropdown as the expense form (showing only active payment methods)
2. WHEN a payment method is marked inactive, THE Expense_Tracker SHALL preserve existing fixed expense associations but prompt user to update them
3. THE Expense_Tracker SHALL validate that fixed expenses reference valid payment method IDs
4. THE Expense_Tracker SHALL display a warning on fixed expenses that use inactive payment methods

### Requirement 6: Data Migration

**User Story:** As an existing user, I want my current expenses to be automatically migrated to the new payment method system, so that I don't lose any historical data.

#### Acceptance Criteria

1. WHEN the application starts with existing expense data, THE Migration_Service SHALL create payment methods for each unique payment method string in the database
2. THE Migration_Service SHALL add a payment_method_id column to the expenses table as a foreign key to payment_methods
3. THE Migration_Service SHALL preserve all existing expense data during migration
4. THE Migration_Service SHALL use the following explicit mapping for existing payment methods:
   - "Cash" → Cash (cash type), payment_method_id = 1
   - "Debit" → Debit (debit type), payment_method_id = 2
   - "Cheque" → Cheque (cheque type), payment_method_id = 3
   - "CIBC MC" → CIBC MC / "CIBC Mastercard" (credit_card type), payment_method_id = 4
   - "PCF MC" → PCF MC / "PCF Mastercard" (credit_card type), payment_method_id = 5
   - "WS VISA" → WS VISA / "WealthSimple VISA" (credit_card type), payment_method_id = 6
   - "VISA" → RBC VISA / "RBC VISA" (credit_card type), payment_method_id = 7
5. IF migration fails, THEN THE Migration_Service SHALL rollback all changes and log the error
6. THE Migration_Service SHALL create a backup before performing migration
7. FOR ALL expenses before and after migration, THE Migration_Service SHALL preserve the payment method association (round-trip property)
8. THE Migration_Service SHALL add a payment_method_id column to the fixed_expenses table as a foreign key to payment_methods
9. THE Migration_Service SHALL populate payment_method_id for all existing expenses and fixed_expenses based on the mapping
10. WHEN migration completes, THE Migration_Service SHALL log a summary of created payment methods and migrated records
11. THE Migration_Service SHALL retain the original method/payment_type string columns for backward compatibility during transition

### Requirement 6A: Migration Safety

**User Story:** As a user with thousands of existing expenses, I want the migration to be safe and reversible, so that I don't lose data.

#### Acceptance Criteria

1. THE Migration_Service SHALL run within a database transaction to ensure atomicity
2. THE Migration_Service SHALL validate all data before committing the transaction
3. IF any expense references an invalid payment method after migration, THEN THE Migration_Service SHALL rollback and report the error
4. THE Migration_Service SHALL be idempotent (running multiple times produces the same result)
5. THE Migration_Service SHALL skip migration if payment_methods table already contains data
6. THE Expense_Tracker SHALL provide a manual migration trigger for testing purposes

### Requirement 7: Analytics and Reporting

**User Story:** As a user, I want to see spending analytics by payment method, so that I can understand my payment habits.

#### Acceptance Criteria

1. WHEN a user views the monthly summary panel, THE Expense_Tracker SHALL display spending totals grouped by payment method (existing capability preserved)
2. WHEN a user views the annual summary, THE Expense_Tracker SHALL display spending totals grouped by payment method using the configured Display_Names
3. WHEN a user filters expenses by payment method, THE Expense_Tracker SHALL show only expenses associated with the selected payment method
4. THE Expense_Tracker SHALL support filtering by Payment_Method_Type in addition to individual payment methods
5. WHEN displaying payment method analytics, THE Expense_Tracker SHALL use the Display_Name for each payment method
6. THE Expense_Tracker SHALL support future analytics extensions such as spending trends by payment type, credit card utilization history, and payment method usage frequency

### Requirement 8: Payment Method Management UI

**User Story:** As a user, I want a dedicated interface to manage my payment methods, so that I can easily configure my payment options.

#### Acceptance Criteria

1. THE Expense_Tracker SHALL provide a Payment Method Management modal accessible from a dedicated button in the main toolbar (alongside Income, Fixed Expenses, Loans)
2. WHEN a user opens the management modal, THE Expense_Tracker SHALL display all configured payment methods in a list with current balances for credit cards
3. THE Expense_Tracker SHALL provide type-specific forms for creating each Payment_Method_Type
4. WHEN a user selects a Payment_Method_Type, THE Expense_Tracker SHALL display only the relevant configuration fields for that type
5. THE Expense_Tracker SHALL provide inline editing capabilities for existing payment methods
6. THE Expense_Tracker SHALL display the count of associated expenses next to each payment method
7. THE Expense_Tracker SHALL provide a "Log Payment" action for Credit_Card payment methods directly from the list view
8. WHEN a user clicks "Log Payment", THE Expense_Tracker SHALL display a form to record the payment amount, date, and optional notes

### Requirement 9: Data Validation

**User Story:** As a user, I want the system to validate my payment method data, so that I don't accidentally create invalid configurations.

#### Acceptance Criteria

1. WHEN a user submits a payment method with an empty Display_Name, THE Expense_Tracker SHALL reject the submission and display an error
2. WHEN a user submits a Credit_Card with an empty Full_Name, THE Expense_Tracker SHALL reject the submission and display an error
3. THE Expense_Tracker SHALL validate that Credit_Card_Balance values are non-negative
4. THE Expense_Tracker SHALL validate that Credit_Card_Payment amounts are positive
5. WHEN a user enters a duplicate Display_Name, THE Expense_Tracker SHALL reject the submission and display an error
6. THE Expense_Tracker SHALL trim whitespace from all text inputs before validation

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want the new system to maintain backward compatibility, so that existing integrations continue to work.

#### Acceptance Criteria

1. THE Expense_Tracker SHALL accept expense submissions using payment_method_id (preferred) or payment method Display_Names (string-based lookup for backward compatibility)
2. WHEN an expense is submitted with an unrecognized payment method string or invalid ID, THE Expense_Tracker SHALL reject the submission with a clear error message
3. THE Expense_Tracker SHALL provide an API endpoint to retrieve the list of valid payment methods with their IDs and Display_Names
4. THE Expense_Tracker SHALL store expenses with payment_method_id foreign key while retaining the method string column during transition period

### Requirement 11: Backup and Restore

**User Story:** As a user, I want my payment method configurations and credit card data to be included in backups, so that I can restore my complete financial setup.

#### Acceptance Criteria

1. WHEN a backup is created, THE Backup_Service SHALL include the payment_methods table
2. WHEN a backup is created, THE Backup_Service SHALL include the credit_card_payments table
3. WHEN a backup is created, THE Backup_Service SHALL include the credit_card_statements table
4. WHEN a backup is restored, THE Backup_Service SHALL restore all payment method configurations
5. WHEN a backup is restored, THE Backup_Service SHALL restore credit card balances, payment history, and statements
6. THE Backup_Service SHALL maintain referential integrity between expenses and payment methods during restore
7. WHEN restoring a backup from before the migration, THE Backup_Service SHALL trigger the payment method migration automatically
