# Requirements Document

## Introduction

This specification defines the redesign of the Monthly Summary panel to improve information hierarchy, reduce visual clutter, and provide a more intuitive user experience. The current panel displays 9 different data sections in a dense 2-column grid, making it difficult to quickly understand financial status. The redesign will implement a tabbed interface with collapsible sections to organize related information logically while maintaining quick access to key metrics.

## Glossary

- **Summary_Panel**: The React component that displays monthly financial overview including income, expenses, and financial health metrics
- **Key_Metrics**: The most important financial indicators (Income, Total Expenses, Net Balance) that users need to see at a glance
- **Expense_Breakdown**: Detailed categorization of expenses by type, payment method, or time period
- **Financial_Health**: Section containing loans, investments, and net worth information
- **Collapsible_Section**: A UI element that can be expanded or collapsed to show/hide detailed content
- **Tab_Navigation**: A UI pattern allowing users to switch between different views of related content

## Requirements

### Requirement 1

**User Story:** As a user, I want to see my most important financial metrics prominently displayed, so that I can quickly understand my monthly financial status at a glance.

#### Acceptance Criteria

1. WHEN the Summary_Panel loads THEN the Summary_Panel SHALL display Income, Total Expenses, and Net Balance as prominent key metric cards in a top row
2. WHEN displaying key metrics THEN the Summary_Panel SHALL show each metric with a large font size and appropriate color coding (green for positive, red for negative)
3. WHEN the Net Balance is positive THEN the Summary_Panel SHALL display the value in green color
4. WHEN the Net Balance is negative THEN the Summary_Panel SHALL display the value in red color
5. WHEN displaying Total Expenses THEN the Summary_Panel SHALL show the combined sum of fixed and variable expenses

### Requirement 2

**User Story:** As a user, I want to navigate between different categories of financial information using tabs, so that I can focus on one type of information at a time without visual overload.

#### Acceptance Criteria

1. WHEN the Summary_Panel renders THEN the Summary_Panel SHALL display a tab navigation bar below the key metrics
2. WHEN a user clicks on a tab THEN the Summary_Panel SHALL display only the content associated with that tab
3. WHEN switching tabs THEN the Summary_Panel SHALL preserve the previously selected tab state during the session
4. THE Summary_Panel SHALL provide tabs for "Breakdown", "Categories", and "Financial Health" sections
5. WHEN the Summary_Panel first loads THEN the Summary_Panel SHALL display the "Breakdown" tab as the default selected tab

### Requirement 3

**User Story:** As a user, I want to see expense breakdowns organized in collapsible sections, so that I can drill down into details only when needed.

#### Acceptance Criteria

1. WHEN the "Breakdown" tab is active THEN the Summary_Panel SHALL display collapsible sections for Weekly Breakdown and Payment Methods
2. WHEN a user clicks on a collapsed section header THEN the Summary_Panel SHALL expand that section to show its content
3. WHEN a user clicks on an expanded section header THEN the Summary_Panel SHALL collapse that section to hide its content
4. WHEN a section is collapsed THEN the Summary_Panel SHALL display a summary value (total) next to the section header
5. WHEN a section is expanded THEN the Summary_Panel SHALL display all individual items with their values and trend indicators

### Requirement 4

**User Story:** As a user, I want to view my expense categories in a dedicated tab, so that I can analyze spending patterns by category without distraction.

#### Acceptance Criteria

1. WHEN the "Categories" tab is active THEN the Summary_Panel SHALL display all expense categories with non-zero values
2. WHEN displaying categories THEN the Summary_Panel SHALL show each category with its amount and trend indicator
3. WHEN a category has zero expenses in both current and previous month THEN the Summary_Panel SHALL hide that category
4. WHEN displaying categories THEN the Summary_Panel SHALL sort categories by expense amount in descending order
5. WHEN displaying categories THEN the Summary_Panel SHALL show the top 5 categories by default with an option to expand and see all

### Requirement 5

**User Story:** As a user, I want to manage my income, fixed expenses, loans, and investments from a dedicated Financial Health tab, so that I can access all financial management features in one place.

#### Acceptance Criteria

1. WHEN the "Financial Health" tab is active THEN the Summary_Panel SHALL display sections for Income, Fixed Expenses, Loans, and Investments
2. WHEN displaying the Income section THEN the Summary_Panel SHALL show total monthly income with a "View/Edit" button
3. WHEN displaying the Fixed Expenses section THEN the Summary_Panel SHALL show total fixed expenses with a "View/Edit" button
4. WHEN displaying the Loans section THEN the Summary_Panel SHALL show total outstanding debt with a "Manage" button
5. WHEN displaying the Investments section THEN the Summary_Panel SHALL show total investment value with a "Manage" button
6. WHEN a user clicks a management button THEN the Summary_Panel SHALL open the corresponding modal dialog

### Requirement 6

**User Story:** As a user, I want the summary panel to be responsive and work well on different screen sizes, so that I can use the application on various devices.

#### Acceptance Criteria

1. WHEN the viewport width is less than 768 pixels THEN the Summary_Panel SHALL stack key metric cards vertically
2. WHEN the viewport width is less than 768 pixels THEN the Summary_Panel SHALL display tabs in a scrollable horizontal layout
3. WHEN the viewport width is 768 pixels or greater THEN the Summary_Panel SHALL display key metric cards in a horizontal row
4. WHEN resizing the viewport THEN the Summary_Panel SHALL smoothly transition between layouts without content jumping

### Requirement 7

**User Story:** As a user, I want visual feedback when interacting with the summary panel, so that I understand which elements are interactive and what state they are in.

#### Acceptance Criteria

1. WHEN a user hovers over a tab THEN the Summary_Panel SHALL display a hover state with subtle background color change
2. WHEN a tab is selected THEN the Summary_Panel SHALL display an active state with distinct styling (underline or background)
3. WHEN a user hovers over a collapsible section header THEN the Summary_Panel SHALL display a cursor pointer and hover effect
4. WHEN a collapsible section is expanded THEN the Summary_Panel SHALL display a rotation animation on the expand/collapse icon
5. WHEN data is loading THEN the Summary_Panel SHALL display a loading skeleton or spinner in the affected area
