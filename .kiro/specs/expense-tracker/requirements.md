# Requirements Document

## Introduction

The Expense Tracker Application is a web-based system that enables users to record, categorize, and monitor their personal expenses. The system consists of a web frontend interface and a database backend for persistent storage of expense data.

## Glossary

- **Expense Tracker Application**: The complete web-based system including frontend and backend components
- **User**: An individual who interacts with the Expense Tracker Application to manage their expenses
- **Expense Entry**: A single record containing information about a financial transaction including amount, date, place, notes, type, week, and payment method
- **Type**: A classification label for the nature of the expense, limited to Other, Food, or Gas
- **Week**: A calculated value from 1 to 5 representing which week of the month the expense occurred, based on the day of the month (days 1-7 = week 1, days 8-14 = week 2, etc.)
- **Payment Method**: The financial instrument used for the transaction, one of Cash, Debit, CIBC MC, PCF MC, WS VISA, or VISA
- **Expense List**: A collection of expense entries displayed to the user
- **Database**: The persistent storage system that maintains all expense data

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

1. THE Expense Tracker Application SHALL provide exactly three Type options: Other, Food, and Gas
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

**User Story:** As a user, I want to search through all my transactions, so that I can quickly find specific expenses.

#### Acceptance Criteria

1. THE Expense Tracker Application SHALL provide a search input field
2. WHEN the User enters text in the search field, THE Expense Tracker Application SHALL filter the Expense List to show only Expense Entries where the search text matches the place field or notes field
3. THE Expense Tracker Application SHALL perform case-insensitive matching when searching
4. WHEN the search text does not match any Expense Entries, THE Expense Tracker Application SHALL display a message indicating no results were found
5. WHEN the User clears the search field, THE Expense Tracker Application SHALL display all Expense Entries according to the current month filter
