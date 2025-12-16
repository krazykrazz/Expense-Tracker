# Requirements Document

## Introduction

This feature adds a Net Worth card to the annual summary view that calculates and displays the user's net worth by combining investment values (assets) and loan balances (liabilities). This provides users with a comprehensive view of their overall financial position for the year.

## Glossary

- **Net Worth**: The total value of assets minus liabilities (Investments - Loans)
- **Assets**: Total value of all investments (TFSA, RRSP, etc.) at year-end
- **Liabilities**: Total outstanding loan balances at year-end
- **Year-End Value**: The most recent value recorded for December of the selected year, or the last available month if December data doesn't exist
- **Annual Summary**: The yearly financial overview showing expenses, income, and financial metrics
- **Expense Tracker**: The system that manages financial data

## Requirements

### Requirement 1

**User Story:** As a user, I want to see my net worth on the annual summary, so that I can understand my overall financial position for the year.

#### Acceptance Criteria

1. WHEN viewing the annual summary THEN the Expense Tracker SHALL display a "Net Worth" card
2. WHEN calculating net worth THEN the Expense Tracker SHALL compute (Total Investment Value - Total Loan Debt)
3. WHEN displaying net worth THEN the Expense Tracker SHALL use year-end values for both investments and loans
4. WHEN net worth is positive THEN the Expense Tracker SHALL display the value in green color
5. WHEN net worth is negative THEN the Expense Tracker SHALL display the value in red color

### Requirement 2

**User Story:** As a user, I want to see the breakdown of assets and liabilities, so that I understand what contributes to my net worth.

#### Acceptance Criteria

1. WHEN displaying the net worth card THEN the Expense Tracker SHALL show total assets (investments)
2. WHEN displaying the net worth card THEN the Expense Tracker SHALL show total liabilities (loans)
3. WHEN displaying the breakdown THEN the Expense Tracker SHALL format it as "Assets: $X - Liabilities: $Y"
4. WHEN no investment data exists THEN the Expense Tracker SHALL display assets as $0
5. WHEN no loan data exists THEN the Expense Tracker SHALL display liabilities as $0

### Requirement 3

**User Story:** As a user, I want the net worth calculation to use year-end values, so that it accurately reflects my financial position at the end of the year.

#### Acceptance Criteria

1. WHEN calculating assets THEN the Expense Tracker SHALL use the most recent investment value for December of the selected year
2. WHEN December investment data does not exist THEN the Expense Tracker SHALL use the most recent value from any month in the year
3. WHEN calculating liabilities THEN the Expense Tracker SHALL use the most recent loan balance for December of the selected year
4. WHEN December loan data does not exist THEN the Expense Tracker SHALL use the most recent balance from any month in the year
5. WHEN no data exists for the year THEN the Expense Tracker SHALL display net worth as $0

### Requirement 4

**User Story:** As a user, I want the net worth card to be visually consistent with other summary cards, so that the interface feels cohesive.

#### Acceptance Criteria

1. WHEN displaying the net worth card THEN the Expense Tracker SHALL use the existing summary card styling
2. WHEN arranging cards THEN the Expense Tracker SHALL position the net worth card prominently in the summary grid
3. WHEN displaying on mobile devices THEN the Expense Tracker SHALL ensure the card is responsive
4. WHEN displaying monetary values THEN the Expense Tracker SHALL format them consistently with currency symbols and decimal places
5. WHEN the card is displayed THEN the Expense Tracker SHALL include a subtitle explaining the calculation

### Requirement 5

**User Story:** As a user, I want to see my net worth on the monthly summary, so that I can track my financial position month-by-month.

#### Acceptance Criteria

1. WHEN viewing the monthly summary THEN the Expense Tracker SHALL display a "Net Worth" card
2. WHEN calculating monthly net worth THEN the Expense Tracker SHALL compute (Total Investment Value - Total Loan Debt) for that month
3. WHEN displaying monthly net worth THEN the Expense Tracker SHALL use the investment values and loan balances for the selected month
4. WHEN net worth is positive THEN the Expense Tracker SHALL display the value in green color
5. WHEN net worth is negative THEN the Expense Tracker SHALL display the value in red color
6. WHEN displaying the monthly net worth card THEN the Expense Tracker SHALL show the assets and liabilities breakdown
