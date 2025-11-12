# Requirements Document

## Introduction

This feature adds a dedicated view within the Annual Summary to display tax-deductible expenses for a given year. Users need to easily identify and review their medical expenses and charitable donations for tax preparation purposes. The view will aggregate and display all expenses marked with tax-deductible types ('Tax - Medical' and 'Tax - Donation'), providing totals, breakdowns, and detailed listings.

## Glossary

- **Tax Deductible View**: A dedicated section within the Annual Summary component that displays expenses eligible for tax deductions
- **Tax Type**: An expense type that indicates tax deductibility, specifically 'Tax - Medical' or 'Tax - Donation'
- **Annual Summary Component**: The existing React component that displays yearly expense summaries
- **Expense System**: The backend system that stores and retrieves expense data from the SQLite database

## Requirements

### Requirement 1

**User Story:** As a user preparing my taxes, I want to see a summary of all my tax-deductible expenses for the year, so that I can quickly determine my total medical and donation deductions.

#### Acceptance Criteria

1. WHEN THE user views the Annual Summary for a specific year, THE Annual Summary Component SHALL display a "Tax Deductible Expenses" section
2. THE Tax Deductible View SHALL display the total amount for all tax-deductible expenses for the selected year
3. THE Tax Deductible View SHALL display separate subtotals for medical expenses and donation expenses
4. THE Tax Deductible View SHALL calculate totals by summing all expenses where type equals 'Tax - Medical' or 'Tax - Donation'
5. THE Tax Deductible View SHALL format all monetary amounts with two decimal places

### Requirement 2

**User Story:** As a user, I want to see a detailed breakdown of my medical and donation expenses, so that I can verify the accuracy of my tax deduction amounts.

#### Acceptance Criteria

1. THE Tax Deductible View SHALL display a categorized list showing medical expenses separately from donation expenses
2. WHEN THE user views the medical expenses section, THE Tax Deductible View SHALL display all expenses where type equals 'Tax - Medical'
3. WHEN THE user views the donations section, THE Tax Deductible View SHALL display all expenses where type equals 'Tax - Donation'
4. THE Tax Deductible View SHALL display each expense with date, place, amount, and notes fields
5. THE Tax Deductible View SHALL sort expenses within each category by date in chronological order

### Requirement 3

**User Story:** As a user, I want to see monthly breakdowns of my tax-deductible expenses, so that I can understand the distribution of my medical and charitable spending throughout the year.

#### Acceptance Criteria

1. THE Tax Deductible View SHALL display a monthly breakdown section showing totals for each month
2. THE Tax Deductible View SHALL group expenses by month and calculate monthly totals for tax-deductible expenses
3. THE Tax Deductible View SHALL display month names using three-letter abbreviations (Jan, Feb, Mar, etc.)
4. THE Tax Deductible View SHALL display zero amounts for months with no tax-deductible expenses
5. THE Tax Deductible View SHALL calculate monthly totals by summing all expenses in that month where type equals 'Tax - Medical' or 'Tax - Donation'

### Requirement 4

**User Story:** As a user, I want the tax deductible view to load efficiently with the rest of the annual summary, so that I don't experience delays when reviewing my yearly expenses.

#### Acceptance Criteria

1. THE Expense System SHALL provide an API endpoint that retrieves tax-deductible expenses for a specified year
2. WHEN THE Annual Summary Component requests tax-deductible data, THE Expense System SHALL return all expenses where type equals 'Tax - Medical' or 'Tax - Donation' for the specified year
3. THE Expense System SHALL filter expenses by year using the date field
4. THE Annual Summary Component SHALL fetch tax-deductible data concurrently with other annual summary data
5. WHEN THE tax-deductible data is loading, THE Tax Deductible View SHALL display a loading indicator

### Requirement 5

**User Story:** As a user, I want to see clear visual organization of my tax information, so that I can easily navigate and understand my deductible expenses.

#### Acceptance Criteria

1. THE Tax Deductible View SHALL use consistent styling with the existing Annual Summary Component sections
2. THE Tax Deductible View SHALL display summary cards for total deductions, medical total, and donations total
3. THE Tax Deductible View SHALL use visual separators between medical and donation expense lists
4. THE Tax Deductible View SHALL use icons or visual indicators to distinguish medical expenses from donations
5. WHEN THE user has no tax-deductible expenses for the year, THE Tax Deductible View SHALL display a message indicating no deductible expenses were found
