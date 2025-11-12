# Requirements Document

## Introduction

The Expense Tracker Application is a web-based system that enables users to record, categorize, and monitor their personal expenses. The system consists of a web frontend interface and a database backend for persistent storage of expense data.

## Glossary

- **Expense Tracker Application**: The complete web-based system including frontend and backend components
- **User**: An individual who interacts with the Expense Tracker Application to manage their expenses
- **Expense Entry**: A single record containing information about a financial transaction including amount, date, place, notes, type, week, and payment method
- **Type**: A classification label for the nature of the expense, limited to Other, Food, Gas, Tax - Medical, or Tax - Donation
- **Week**: A calculated value from 1 to 5 representing which week of the month the expense occurred, based on the day of the month (days 1-7 = week 1, days 8-14 = week 2, etc.)
- **Payment Method**: The financial instrument used for the transaction, one of Cash, Debit, CIBC MC, PCF MC, WS VISA, or VISA
- **Expense List**: A collection of expense entries displayed to the user
- **Fixed Expense**: A recurring monthly obligation with a name and amount that remains relatively constant each month (e.g., rent, utilities, subscriptions)
- **Database**: The persistent storage system that maintains all expense data
- **Backup File**: A copy of the Database stored as a file with a timestamp for data recovery purposes
- **Annual Summary**: A comprehensive view of expense data aggregated across all months of a selected year
- **High Amount Threshold**: A monetary value of 350 dollars used to identify and highlight significant expenses
- **Settings Interface**: A user interface section for configuring application behavior including backup schedules and data import/restore operations

## Requirements

### Requirement 1

**User Story:** As a user, I want to add new expense entries, so that I can keep track of my spending.

#### Acceptance Criteria

1. WHEN the User submits a new expense with date, place, notes, amount, type, and payment method, THE Expense Tracker Application SHALL store the Expense Entry in the Database
2. WHEN the User submits an expense without a required field (date, amount, type, or payment method), THE Expense Tracker Application SHALL display an error message indicating which field is missing
3. THE Expense Tracker Application SHALL accept expense amounts as positive decimal numbers with up to two decimal places
4. THE Expense Tracker Application SHALL accept dates in a standard calendar format
5. WHEN the User provides a date, THE Expense Tracker Application SHALL automatically calculate and store the Week value based on the day of the month (days 1-7 = 1, days 8-14 = 2, days 15-21 = 3, days 22-28 = 4, days 29-31 = 5)
6. THE Expense Tracker Application SHALL store place and notes as text fields with a maximum length of 200 characters each

### Requirement 2

**User Story:** As a user, I want to view all my expenses in a list, so that I can see my spending history.

#### Acceptance Criteria

1. WHEN the User requests to view expenses, THE Expense Tracker Application SHALL retrieve all Expense Entries from the Database and display them in the Expense List
2. THE Expense Tracker Application SHALL display each Expense Entry with its date, place, notes, amount, type, week, and payment method
3. THE Expense Tracker Application SHALL sort the Expense List by date with the most recent expenses appearing first
4. WHEN the Database contains no Expense Entries, THE Expense Tracker Application SHALL display a message indicating that no expenses have been recorded

### Requirement 3

**User Story:** As a user, I want to categorize my expenses by type and payment method, so that I can organize my spending.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide exactly five Type options: Other, Food, Gas, Tax - Medical, and Tax - Donation
2. WHEN the User creates an Expense Entry, THE Expense Tracker Application SHALL require the User to select one Type
3. THE Expense Tracker Application SHALL provide exactly six Payment Method options: Cash, Debit, CIBC MC, PCF MC, WS VISA, and VISA
4. WHEN the User creates an Expense Entry, THE Expense Tracker Application SHALL require the User to select one Payment Method
5. THE Expense Tracker Application SHALL allow the User to filter the Expense List by Type
6. THE Expense Tracker Application SHALL allow the User to filter the Expense List by Payment Method

### Requirement 4

**User Story:** As a user, I want to delete expense entries, so that I can remove incorrect or unwanted records.

#### Acceptance Criteria

1. WHEN the User selects an Expense Entry and requests deletion, THE Expense Tracker Application SHALL remove the Expense Entry from the Database
2. WHEN the User requests deletion of an Expense Entry, THE Expense Tracker Application SHALL prompt the User to confirm the deletion before proceeding
3. WHEN an Expense Entry is deleted, THE Expense Tracker Application SHALL update the Expense List to reflect the removal within 2 seconds

### Requirement 5

**User Story:** As a user, I want to see the total amount of my expenses, so that I can understand my overall spending.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL calculate the sum of all expense amounts in the Expense List
2. THE Expense Tracker Application SHALL display the total expense amount with two decimal places
3. WHEN the User applies a Type or Payment Method filter, THE Expense Tracker Application SHALL display the total amount for only the filtered Expense Entries
4. WHEN the Expense List is empty, THE Expense Tracker Application SHALL display the total as zero

### Requirement 6

**User Story:** As a user, I want to view expenses by month and year, so that I can analyze my spending patterns over time.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide a month and year selector interface
2. WHEN the User selects a specific month and year, THE Expense Tracker Application SHALL display only the Expense Entries that occurred within that month
3. THE Expense Tracker Application SHALL display the selected month and year prominently in the view
4. WHEN no month is selected, THE Expense Tracker Application SHALL display the current month by default

### Requirement 7

**User Story:** As a user, I want to see weekly spending totals for a selected month, so that I can track my spending patterns throughout the month.

#### Acceptance Criteria

1. WHEN the User views a specific month, THE Expense Tracker Application SHALL calculate the total expense amount for each Week (1 through 5)
2. THE Expense Tracker Application SHALL display each weekly total with two decimal places
3. THE Expense Tracker Application SHALL display weekly totals even when a Week contains no Expense Entries, showing zero for that week
4. THE Expense Tracker Application SHALL display all five weekly totals for the selected month

### Requirement 8

**User Story:** As a user, I want to see spending totals by payment method for a selected month, so that I can understand how much I spent using each payment type.

#### Acceptance Criteria

1. WHEN the User views a specific month, THE Expense Tracker Application SHALL calculate the total expense amount for each Payment Method (Cash, Debit, CIBC MC, PCF MC, WS VISA, VISA)
2. THE Expense Tracker Application SHALL display each Payment Method total with two decimal places
3. THE Expense Tracker Application SHALL display all six Payment Method totals for the selected month
4. WHEN a Payment Method has no Expense Entries in the selected month, THE Expense Tracker Application SHALL display zero for that Payment Method

### Requirement 9

**User Story:** As a user, I want to see spending totals for Gas and Food categories for a selected month, so that I can track these specific expense types.

#### Acceptance Criteria

1. WHEN the User views a specific month, THE Expense Tracker Application SHALL calculate the total expense amount for all Expense Entries with Type equal to Gas
2. WHEN the User views a specific month, THE Expense Tracker Application SHALL calculate the total expense amount for all Expense Entries with Type equal to Food
3. THE Expense Tracker Application SHALL display the Gas total and Food total with two decimal places
4. WHEN a Type has no Expense Entries in the selected month, THE Expense Tracker Application SHALL display zero for that Type

### Requirement 10

**User Story:** As a user, I want to search through all my transactions globally, so that I can quickly find specific expenses across all time periods.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide a search input field
2. WHEN the User enters text in the search field, THE Expense Tracker Application SHALL filter the Expense List to show only Expense Entries where the search text matches the place field or notes field
3. THE Expense Tracker Application SHALL perform case-insensitive matching when searching
4. THE Expense Tracker Application SHALL search across all Expense Entries in the Database regardless of the selected month or year
5. WHEN the search text does not match any Expense Entries, THE Expense Tracker Application SHALL display a message indicating no results were found
6. WHEN the User clears the search field, THE Expense Tracker Application SHALL display Expense Entries according to the current month filter

### Requirement 11

**User Story:** As a user, I want to mark expenses as tax deductible by selecting specific tax-related type options, so that I can easily identify and track medical expenses and charitable donations for tax purposes.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide exactly five Type options: Other, Food, Gas, Tax - Medical, and Tax - Donation
2. WHEN the User creates or edits an Expense Entry, THE Expense Tracker Application SHALL require the User to select one Type from the five available options
3. WHEN the User selects "Tax - Medical" as the Type, THE Expense Tracker Application SHALL visually distinguish that Expense Entry in the Expense List with dark blue row highlighting (#1e3a5f background with white text)
4. WHEN the User selects "Tax - Donation" as the Type, THE Expense Tracker Application SHALL visually distinguish that Expense Entry in the Expense List with orange row highlighting (#ea580c background with white text)
5. THE Expense Tracker Application SHALL allow the User to filter the Expense List by Type including both Tax - Medical and Tax - Donation options
6. WHEN the User views monthly summaries, THE Expense Tracker Application SHALL calculate and display separate total expense amounts for Tax - Medical and Tax - Donation types
7. THE Expense Tracker Application SHALL display both Tax - Medical and Tax - Donation totals with two decimal places

### Requirement 12

**User Story:** As a user, I want to edit existing expense entries, so that I can correct mistakes or update information without deleting and re-entering expenses.

#### Acceptance Criteria

1. WHEN the User selects an Expense Entry for editing, THE Expense Tracker Application SHALL display a form pre-populated with the current expense data
2. THE Expense Tracker Application SHALL allow the User to modify any field of the Expense Entry including date, place, notes, amount, type, and payment method
3. WHEN the User submits the edited expense, THE Expense Tracker Application SHALL validate all required fields before updating
4. WHEN the User updates the date field, THE Expense Tracker Application SHALL recalculate and update the Week value
5. WHEN an Expense Entry is updated, THE Expense Tracker Application SHALL reflect the changes in the Expense List within 2 seconds
6. THE Expense Tracker Application SHALL prevent event propagation conflicts when editing expenses in the list

### Requirement 13

**User Story:** As a user, I want the system to automatically back up my expense data, so that I can protect against data loss.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide an automated backup scheduling system
2. THE Expense Tracker Application SHALL allow the User to configure backup frequency through a settings interface
3. WHEN a scheduled backup time is reached, THE Expense Tracker Application SHALL automatically create a backup file of the Database
4. THE Expense Tracker Application SHALL store backup files with timestamps in the filename
5. THE Expense Tracker Application SHALL provide manual backup functionality that the User can trigger on demand
6. THE Expense Tracker Application SHALL display the status and timestamp of the last successful backup

### Requirement 14

**User Story:** As a user, I want to import and restore backup files, so that I can recover my data or migrate to a different system.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide an import functionality in the settings interface
2. WHEN the User selects a backup file for import, THE Expense Tracker Application SHALL validate the file format before processing
3. THE Expense Tracker Application SHALL provide a restore functionality that replaces the current Database with data from a backup file
4. WHEN the User initiates a restore operation, THE Expense Tracker Application SHALL prompt the User to confirm the action before proceeding
5. WHEN a restore operation completes successfully, THE Expense Tracker Application SHALL refresh the Expense List to display the restored data within 2 seconds
6. IF the import or restore operation fails, THE Expense Tracker Application SHALL display an error message indicating the reason for failure

### Requirement 15

**User Story:** As a user, I want to view an annual summary of my expenses, so that I can analyze my spending patterns over an entire year.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide an annual summary view interface
2. WHEN the User selects a specific year, THE Expense Tracker Application SHALL display a comprehensive summary of all Expense Entries for that year
3. THE Expense Tracker Application SHALL display monthly expense breakdowns showing the total for each month of the selected year
4. THE Expense Tracker Application SHALL display category analysis showing totals for each Type across the entire year
5. THE Expense Tracker Application SHALL provide visual charts or graphs to represent annual spending patterns
6. THE Expense Tracker Application SHALL display all annual totals with two decimal places
7. THE Expense Tracker Application SHALL calculate and display the overall total for the selected year

### Requirement 16

**User Story:** As a user, I want high-value expenses to be visually highlighted, so that I can quickly identify significant spending.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL define a high amount threshold of 350 dollars
2. WHEN an Expense Entry has an amount greater than or equal to 350 dollars, THE Expense Tracker Application SHALL apply visual highlighting to that expense in the Expense List
3. THE Expense Tracker Application SHALL use a distinct visual style for high-value expenses that differs from standard expense rows
4. THE Expense Tracker Application SHALL apply high-value highlighting in addition to any other row styling such as tax deductible highlighting

### Requirement 17

**User Story:** As a user, I want to manage fixed monthly expenses (like rent, utilities, subscriptions), so that I can track my recurring obligations and include them in my monthly budget calculations.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide a fixed expenses management interface accessible from the monthly summary panel
2. THE Expense Tracker Application SHALL allow the User to add fixed expense items with a name and amount for a specific month and year
3. THE Expense Tracker Application SHALL allow the User to edit existing fixed expense items including name and amount
4. THE Expense Tracker Application SHALL allow the User to delete fixed expense items
5. THE Expense Tracker Application SHALL calculate and display the total of all fixed expenses for the selected month
6. WHEN the User views the monthly summary, THE Expense Tracker Application SHALL display the total fixed expenses as a separate line item
7. THE Expense Tracker Application SHALL include fixed expenses in the total expenses calculation for net balance
8. THE Expense Tracker Application SHALL provide a carry-forward feature that copies all fixed expenses from the previous month to the current month
9. WHEN the User carries forward fixed expenses, THE Expense Tracker Application SHALL create new entries for the current month with the same names and amounts
10. THE Expense Tracker Application SHALL display fixed expenses with two decimal places
