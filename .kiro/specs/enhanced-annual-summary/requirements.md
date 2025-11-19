# Requirements Document

## Introduction

This feature enhances the annual summary view to provide better financial insights by separating fixed and variable expenses, displaying total income, calculating net income, and visualizing monthly breakdowns with stacked bar charts. This gives users a comprehensive view of their financial health throughout the year.

## Glossary

- **Annual Summary**: The yearly financial overview showing expenses, income, and net balance across all 12 months
- **Fixed Expenses**: Recurring monthly expenses that remain relatively constant (rent, utilities, subscriptions)
- **Variable Expenses**: Non-recurring expenses that vary month-to-month (tracked expenses from the expenses table)
- **Total Income**: Sum of all income sources for a given month
- **Net Income**: Total Income minus Total Expenses (can be positive or negative)
- **Stacked Bar Chart**: A bar chart where multiple data series are stacked on top of each other to show composition
- **Expense Tracker**: The system that manages expense and income data

## Requirements

### Requirement 1

**User Story:** As a user, I want to see total expenses broken down into fixed and variable components, so that I can understand the composition of my spending.

#### Acceptance Criteria

1. WHEN viewing the annual summary THEN the Expense Tracker SHALL display a "Total Expenses" card showing the sum of fixed and variable expenses
2. WHEN displaying total expenses THEN the Expense Tracker SHALL show the breakdown as "Fixed: $X + Variable: $Y = Total: $Z"
3. WHEN calculating total expenses THEN the Expense Tracker SHALL sum all fixed expenses from the fixed_expenses table
4. WHEN calculating total expenses THEN the Expense Tracker SHALL sum all variable expenses from the expenses table
5. WHEN no fixed expenses exist for the year THEN the Expense Tracker SHALL display fixed expenses as $0

### Requirement 2

**User Story:** As a user, I want to see my total annual income, so that I can compare it against my expenses.

#### Acceptance Criteria

1. WHEN viewing the annual summary THEN the Expense Tracker SHALL display a "Total Income" card
2. WHEN calculating total income THEN the Expense Tracker SHALL sum all income from the income_sources table for the selected year
3. WHEN displaying total income THEN the Expense Tracker SHALL use a positive/green color scheme
4. WHEN no income data exists for the year THEN the Expense Tracker SHALL display total income as $0
5. WHEN hovering over the income card THEN the Expense Tracker SHALL display a tooltip or subtitle indicating the data source

### Requirement 3

**User Story:** As a user, I want to see my net income (income minus expenses), so that I can quickly assess whether I'm saving or overspending.

#### Acceptance Criteria

1. WHEN viewing the annual summary THEN the Expense Tracker SHALL display a "Net Income" card
2. WHEN calculating net income THEN the Expense Tracker SHALL compute (Total Income - Total Expenses)
3. WHEN net income is positive THEN the Expense Tracker SHALL display the value in green color
4. WHEN net income is negative THEN the Expense Tracker SHALL display the value in red color
5. WHEN net income is zero THEN the Expense Tracker SHALL display the value in neutral color

### Requirement 4

**User Story:** As a user, I want to see a stacked bar chart showing monthly expense breakdowns, so that I can visualize the contribution of fixed versus variable expenses over time.

#### Acceptance Criteria

1. WHEN viewing the annual summary THEN the Expense Tracker SHALL display a stacked bar chart with 12 bars (one per month)
2. WHEN rendering each monthly bar THEN the Expense Tracker SHALL stack fixed expenses (bottom) and variable expenses (top)
3. WHEN displaying the stacked bars THEN the Expense Tracker SHALL use distinct colors for fixed and variable expenses
4. WHEN hovering over a bar segment THEN the Expense Tracker SHALL display a tooltip showing the expense type and amount
5. WHEN a month has no expenses THEN the Expense Tracker SHALL display an empty bar or zero-height bar

### Requirement 5

**User Story:** As a user, I want the chart to include a legend, so that I can easily identify which color represents fixed versus variable expenses.

#### Acceptance Criteria

1. WHEN viewing the stacked bar chart THEN the Expense Tracker SHALL display a legend
2. WHEN displaying the legend THEN the Expense Tracker SHALL show "Fixed Expenses" with its corresponding color
3. WHEN displaying the legend THEN the Expense Tracker SHALL show "Variable Expenses" with its corresponding color
4. WHEN clicking a legend item THEN the Expense Tracker MAY toggle visibility of that data series (optional enhancement)
5. WHEN the legend is displayed THEN the Expense Tracker SHALL position it clearly visible near the chart

### Requirement 6

**User Story:** As a user, I want the annual summary cards to maintain consistent styling with the rest of the application, so that the interface feels cohesive.

#### Acceptance Criteria

1. WHEN displaying summary cards THEN the Expense Tracker SHALL use the existing card component styling
2. WHEN arranging cards THEN the Expense Tracker SHALL use a responsive grid layout
3. WHEN displaying on mobile devices THEN the Expense Tracker SHALL stack cards vertically
4. WHEN displaying monetary values THEN the Expense Tracker SHALL format them consistently with currency symbols and decimal places
5. WHEN displaying the chart THEN the Expense Tracker SHALL ensure it is responsive and scales appropriately on different screen sizes
