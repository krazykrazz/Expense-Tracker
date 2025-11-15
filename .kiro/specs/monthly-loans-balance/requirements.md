# Requirements Document

## Introduction

The Monthly Loans Balance feature enables users to track outstanding loan balances across multiple loans over time. This feature provides visibility into debt obligations, tracks monthly balance changes, and helps users monitor their progress in paying down loans. The system will maintain historical balance records and display current outstanding amounts for all active loans.

## Glossary

- **Loan Tracker**: The system component that manages loan records and balance tracking
- **Loan Record**: A single loan entry with identifying information and balance history
- **Balance Entry**: A monthly snapshot of a loan's outstanding balance
- **Active Loan**: A loan with a balance greater than zero
- **Paid Off Loan**: A loan with a balance of zero or marked as closed

## Requirements

### Requirement 1

**User Story:** As a user, I want to create and manage multiple loan records, so that I can track all my outstanding debts in one place

#### Acceptance Criteria

1. THE Loan Tracker SHALL allow users to create a new loan record with name, initial balance, and start date
2. THE Loan Tracker SHALL allow users to edit loan details including name and notes
3. THE Loan Tracker SHALL allow users to delete loan records
4. THE Loan Tracker SHALL display a list of all loan records with their current balances
5. THE Loan Tracker SHALL distinguish between active loans and paid off loans in the display

### Requirement 2

**User Story:** As a user, I want to record monthly balance and interest rate updates for each loan, so that I can track how my loan balances and rates change over time

#### Acceptance Criteria

1. WHEN a user adds a balance entry, THE Loan Tracker SHALL record the balance amount, interest rate, month, and year
2. THE Loan Tracker SHALL allow only one balance entry per loan per month
3. IF a balance entry already exists for a month, THEN THE Loan Tracker SHALL update the existing entry instead of creating a duplicate
4. THE Loan Tracker SHALL calculate and display the balance change from the previous month
5. THE Loan Tracker SHALL calculate and display the interest rate change from the previous month
6. THE Loan Tracker SHALL sort balance entries chronologically with most recent first

### Requirement 3

**User Story:** As a user, I want to view the current balance for each loan in the monthly summary, so that I can quickly see my total outstanding debt alongside my monthly expenses

#### Acceptance Criteria

1. THE Loan Tracker SHALL display loan records at the bottom of the monthly summary view
2. THE Loan Tracker SHALL display only loans where the start date is on or before the selected month
3. THE Loan Tracker SHALL display the most recent balance entry as the current balance for each loan
4. THE Loan Tracker SHALL calculate and display the total outstanding balance across all active loans for the selected month
5. WHEN no balance entries exist for a loan, THE Loan Tracker SHALL display the initial balance as the current balance
6. THE Loan Tracker SHALL format currency values with two decimal places
7. THE Loan Tracker SHALL update displayed balances immediately after adding or editing balance entries

### Requirement 4

**User Story:** As a user, I want to view balance and rate history for each loan, so that I can see my progress in paying down debt and track interest rate changes over time

#### Acceptance Criteria

1. THE Loan Tracker SHALL display a chronological list of all balance entries for a selected loan
2. THE Loan Tracker SHALL show the month, year, balance amount, interest rate, balance change, and rate change for each entry
3. THE Loan Tracker SHALL calculate the total amount paid down since the loan start date
4. THE Loan Tracker SHALL allow users to edit historical balance entries including both balance and rate
5. THE Loan Tracker SHALL allow users to delete balance entries

### Requirement 5

**User Story:** As a user, I want to mark loans as paid off, so that I can distinguish between active debts and completed loans

#### Acceptance Criteria

1. WHEN a loan balance reaches zero, THE Loan Tracker SHALL automatically mark the loan as paid off
2. THE Loan Tracker SHALL allow users to manually mark a loan as paid off regardless of balance
3. THE Loan Tracker SHALL exclude paid off loans from the monthly summary display
4. THE Loan Tracker SHALL exclude paid off loans from the total outstanding balance calculation
5. THE Loan Tracker SHALL display paid off loans in the loans modal for historical viewing
6. THE Loan Tracker SHALL allow users to reactivate a paid off loan

### Requirement 6

**User Story:** As a user, I want the loan data to persist across sessions, so that my loan tracking history is preserved

#### Acceptance Criteria

1. THE Loan Tracker SHALL store all loan records in the SQLite database
2. THE Loan Tracker SHALL store all balance entries in the SQLite database
3. WHEN the application starts, THE Loan Tracker SHALL load all existing loan data from the database
4. THE Loan Tracker SHALL include loan data in database backup operations
5. THE Loan Tracker SHALL maintain referential integrity between loans and their balance entries
