# Requirements Document

## Introduction

This feature improves the user experience of the ExpenseList component by consolidating redundant filters, organizing specialized filters into an expandable section, and enhancing the global vs monthly view navigation. The goal is to reduce visual clutter, make filter state more transparent, and help users understand and control view modes more effectively.

## Glossary

- **ExpenseList**: The React component that displays expenses in a table format with filtering capabilities
- **Local_Filter**: A filter that operates on the current month's expenses without triggering global view
- **Global_View**: A view mode that shows all expenses across all time periods, triggered by certain filters
- **Monthly_View**: The default view mode showing expenses for the selected month only
- **Filter_Chip**: A removable tag/badge that displays an active filter and allows one-click removal
- **Advanced_Filters**: A collapsible section containing specialized filters (Invoice, Insurance) that are less frequently used
- **Smart_Method_Filter**: A consolidated payment method filter that auto-detects whether the selection is a specific method or a method type
- **Filter_Badge**: A visual indicator showing the count of currently active filters

## Requirements

### Requirement 1: Consolidate Payment Method Filters

**User Story:** As a user, I want a single smart payment method filter, so that I can filter by either specific payment method or payment type without redundant dropdowns.

#### Acceptance Criteria

1. WHEN the user opens the payment method filter dropdown, THE ExpenseList SHALL display a grouped list with method types (Cash, Debit, Cheque, Credit Card) as group headers and specific methods as sub-options
2. WHEN the user selects a method type header (e.g., "Credit Card"), THE ExpenseList SHALL filter to show all expenses using any payment method of that type
3. WHEN the user selects a specific method (e.g., "Visa"), THE ExpenseList SHALL filter to show only expenses using that exact payment method
4. THE ExpenseList SHALL remove the separate "Method Type" dropdown and consolidate into the single smart filter
5. WHEN a filter is active, THE ExpenseList SHALL display the selected filter value in the dropdown button text

### Requirement 2: Advanced Filters Section

**User Story:** As a user, I want less-used filters hidden in an expandable section, so that the filter bar is less cluttered for common use cases.

#### Acceptance Criteria

1. THE ExpenseList SHALL move Invoice and Insurance filters into a collapsible "Advanced Filters" section
2. WHEN the Advanced Filters section is collapsed, THE ExpenseList SHALL display a toggle button showing "Advanced" with a count badge if any advanced filters are active
3. WHEN the user clicks the Advanced Filters toggle, THE ExpenseList SHALL expand to reveal the Invoice and Insurance filter dropdowns
4. WHEN any advanced filter is active and the section is collapsed, THE ExpenseList SHALL display a badge showing the count of active advanced filters
5. THE ExpenseList SHALL persist the expanded/collapsed state during the session

### Requirement 3: Active Filter Count Badge

**User Story:** As a user, I want to see how many filters are active at a glance, so that I understand why I'm seeing a filtered subset of expenses.

#### Acceptance Criteria

1. WHEN one or more filters are active, THE ExpenseList SHALL display a filter count badge near the filter controls
2. THE filter count badge SHALL show the total number of active filters (Type, Method, Invoice, Insurance)
3. WHEN no filters are active, THE ExpenseList SHALL hide the filter count badge
4. THE filter count badge SHALL update immediately when filters are added or removed

### Requirement 4: Active Filter Chips

**User Story:** As a user, I want to see my active filters as removable chips, so that I can quickly understand and modify my current filter state.

#### Acceptance Criteria

1. WHEN one or more filters are active, THE ExpenseList SHALL display active filters as removable chips below the filter controls
2. WHEN the user clicks the remove button on a filter chip, THE ExpenseList SHALL clear that specific filter
3. EACH filter chip SHALL display the filter type and value (e.g., "Type: Groceries", "Method: Visa")
4. THE filter chips SHALL appear in a horizontal row that wraps on smaller screens
5. WHEN all filters are cleared, THE ExpenseList SHALL hide the filter chips row

### Requirement 5: Enhanced Global View Indicator

**User Story:** As a user, I want a prominent indicator when in global view, so that I understand why I'm seeing expenses from all time periods.

#### Acceptance Criteria

1. WHEN in global view, THE ExpenseList SHALL display a prominent banner indicating global view mode
2. THE global view banner SHALL include a "Return to Monthly View" button
3. WHEN the user clicks "Return to Monthly View", THE ExpenseList SHALL clear all global-triggering filters and return to monthly view
4. THE global view banner SHALL indicate which filter(s) triggered the global view (search text, payment method, or year filter)
5. THE global view banner SHALL be visually distinct from the monthly view state using color and iconography

### Requirement 6: Clear Filters Button Enhancement

**User Story:** As a user, I want the Clear Filters button to be more prominent when filters are active, so that I can easily reset my view.

#### Acceptance Criteria

1. WHEN filters are active, THE ExpenseList SHALL display the Clear Filters button with enhanced visual prominence
2. THE Clear Filters button SHALL include text "Clear All" instead of just an icon when filters are active
3. WHEN in global view, THE Clear Filters button SHALL be styled with higher visual priority (larger, different color)
4. WHEN no filters are active, THE ExpenseList SHALL hide the Clear Filters button

