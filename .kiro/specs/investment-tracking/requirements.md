# Requirements Document

## Introduction

The Investment Tracking feature enables users to monitor their investment portfolio performance over time. This feature provides visibility into investment holdings, tracks monthly value changes, and helps users understand their investment growth or losses. The system will maintain historical value records and display current portfolio values alongside financial summaries.

## Glossary

- **Investment Tracker**: The system component that manages investment records and value tracking
- **Investment Record**: A single investment entry with name, type, and value history
- **Value Entry**: A monthly snapshot of an investment's current market value
- **Active Investment**: An investment with a value greater than zero
- **Closed Investment**: An investment that has been sold or marked as closed
- **TFSA**: Tax-Free Savings Account
- **RRSP**: Registered Retirement Savings Plan

## Requirements

### Requirement 1

**User Story:** As a user, I want to create and manage multiple investment records, so that I can track all my investments in one place

#### Acceptance Criteria

1. THE Investment Tracker SHALL allow users to create a new investment record with name, type, and initial value
2. THE Investment Tracker SHALL support investment types: TFSA and RRSP
3. THE Investment Tracker SHALL allow users to edit investment details including name and type
4. THE Investment Tracker SHALL allow users to delete investment records
5. THE Investment Tracker SHALL display a list of all investment records with their current values

### Requirement 2

**User Story:** As a user, I want to record monthly value updates for each investment, so that I can track how my investment values change over time

#### Acceptance Criteria

1. WHEN a user adds a value entry, THE Investment Tracker SHALL record the value amount, month, and year
2. THE Investment Tracker SHALL allow only one value entry per investment per month
3. IF a value entry already exists for a month, THEN THE Investment Tracker SHALL update the existing entry instead of creating a duplicate
4. THE Investment Tracker SHALL calculate and display the value change from the previous month
5. THE Investment Tracker SHALL calculate and display the percentage change from the previous month
6. THE Investment Tracker SHALL sort value entries chronologically with most recent first

### Requirement 3

**User Story:** As a user, I want to view the current value for each investment in the monthly summary, so that I can quickly see my total portfolio value alongside my monthly expenses

#### Acceptance Criteria

1. THE Investment Tracker SHALL display investment records at the bottom of the monthly summary view
2. THE Investment Tracker SHALL display only investments where the purchase date is on or before the selected month
3. THE Investment Tracker SHALL display the most recent value entry as the current value for each investment
4. THE Investment Tracker SHALL calculate and display the total portfolio value across all active investments for the selected month
5. WHEN no value entries exist for an investment, THE Investment Tracker SHALL display the initial value as the current value
6. THE Investment Tracker SHALL format currency values with two decimal places
7. THE Investment Tracker SHALL update displayed values immediately after adding or editing value entries

### Requirement 4

**User Story:** As a user, I want to view value history for each investment, so that I can see my investment performance over time

#### Acceptance Criteria

1. THE Investment Tracker SHALL display a chronological list of all value entries for a selected investment
2. THE Investment Tracker SHALL show the month, year, value amount, value change, and percentage change for each entry
3. THE Investment Tracker SHALL display arrow indicators for monthly changes: up arrow for increases, down arrow for decreases
4. THE Investment Tracker SHALL apply color coding: green for value increases, red for value decreases
5. THE Investment Tracker SHALL display a line graph showing value changes over time for each investment
6. THE Investment Tracker SHALL allow users to edit historical value entries
7. THE Investment Tracker SHALL allow users to delete value entries

### Requirement 5

**User Story:** As a user, I want the investment data to persist across sessions, so that my investment tracking history is preserved

#### Acceptance Criteria

1. THE Investment Tracker SHALL store all investment records in the SQLite database
2. THE Investment Tracker SHALL store all value entries in the SQLite database
3. WHEN the application starts, THE Investment Tracker SHALL load all existing investment data from the database
4. THE Investment Tracker SHALL include investment data in database backup operations
5. THE Investment Tracker SHALL maintain referential integrity between investments and their value entries

### Requirement 6

**User Story:** As a user, I want to view total investment value in the monthly summary, so that I can see my portfolio value alongside my expenses

#### Acceptance Criteria

1. THE Investment Tracker SHALL calculate total investment value as the sum of all investment current values
2. THE Investment Tracker SHALL display total investment value in the monthly summary view
3. THE Investment Tracker SHALL update the total investment value immediately after value changes
