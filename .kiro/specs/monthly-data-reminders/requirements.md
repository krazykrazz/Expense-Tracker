# Requirements Document

## Introduction

A reminder system to prompt users to update their investment values and loan balances for the current month if they haven't already done so. This ensures accurate net worth calculations and helps users maintain up-to-date financial records.

## Glossary

- **System**: The Expense Tracker application
- **User**: A person using the expense tracker application
- **Current Month**: The current calendar month based on system date
- **Investment Value**: The recorded value of an investment (TFSA or RRSP) for a specific month
- **Loan Balance**: The recorded remaining balance of a loan for a specific month
- **Reminder Banner**: A visual notification displayed in the UI to prompt user action
- **Data Entry Status**: Whether investment values and loan balances have been recorded for the current month

## Requirements

### Requirement 1

**User Story:** As a user, I want to be reminded to update my investment values for the current month, so that my net worth calculations remain accurate.

#### Acceptance Criteria

1. WHEN the user views the monthly summary panel AND investment values for the current month have not been entered THEN the System SHALL display a reminder banner prompting the user to update investment values
2. WHEN the user has entered investment values for all active investments for the current month THEN the System SHALL not display the investment reminder banner
3. WHEN the user clicks the reminder banner THEN the System SHALL open the Investments modal
4. WHEN there are no active investments THEN the System SHALL not display the investment reminder banner

### Requirement 2

**User Story:** As a user, I want to be reminded to update my loan balances for the current month, so that my debt tracking and net worth calculations remain accurate.

#### Acceptance Criteria

1. WHEN the user views the monthly summary panel AND loan balances for the current month have not been entered THEN the System SHALL display a reminder banner prompting the user to update loan balances
2. WHEN the user has entered loan balances for all active loans for the current month THEN the System SHALL not display the loan reminder banner
3. WHEN the user clicks the reminder banner THEN the System SHALL open the Loans modal
4. WHEN there are no active loans THEN the System SHALL not display the loan reminder banner

### Requirement 3

**User Story:** As a user, I want reminders to be visually distinct but not intrusive, so that I am informed without being annoyed.

#### Acceptance Criteria

1. WHEN a reminder banner is displayed THEN the System SHALL use a subtle color scheme that stands out without being alarming
2. WHEN multiple reminders are needed THEN the System SHALL display them as separate banners stacked vertically
3. WHEN the user dismisses a reminder banner THEN the System SHALL hide the banner for the current session only
4. WHEN the user starts a new session AND data is still missing THEN the System SHALL display the reminder banner again

### Requirement 4

**User Story:** As a user, I want the reminder to show me which specific items need updating, so that I know exactly what action to take.

#### Acceptance Criteria

1. WHEN the investment reminder is displayed THEN the System SHALL show the count of investments that need values entered
2. WHEN the loan reminder is displayed THEN the System SHALL show the count of loans that need balances entered
3. WHEN the reminder banner is displayed THEN the System SHALL include the current month name in the message
