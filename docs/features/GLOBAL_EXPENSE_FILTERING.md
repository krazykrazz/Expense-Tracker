# Global Expense Filtering

## Overview

The Global Expense Filtering feature allows you to filter expenses by category, payment method, and year across all time periods, not just the currently selected month. This makes it easy to find and analyze specific types of expenses throughout your entire expense history.

## Features

### Filter Controls

The application provides four types of filters in the search bar:

1. **Text Search**: Search for expenses by place name or notes
2. **Category Filter**: Filter by expense type (Groceries, Dining Out, Gas, etc.)
3. **Payment Method Filter**: Filter by payment method (Credit Card, Debit Card, Cash, etc.)
4. **Year Filter**: Scope search to a specific year (current year and past 10 years available)

### How It Works

#### Monthly View (Default)
- By default, the application shows expenses for the currently selected month
- Use the month selector to navigate between different months

#### Global View (Automatic)
- When you apply ANY filter (text search, category, payment method, or year), the application automatically switches to global view
- Global view displays expenses from ALL time periods that match your filters (or from the selected year if year filter is active)
- You can use filters independently or combine them

### Filter Combinations

All filters work together using AND logic:

- **Single Filter**: Apply just one filter to see all matching expenses across all time
  - Example: Select "Groceries" to see all grocery expenses ever recorded
  - Example: Select "2024" to see all expenses from 2024
  
- **Multiple Filters**: Combine filters to narrow down results
  - Example: Select "Groceries" + "Credit Card" to see only grocery expenses paid with credit card
  - Example: Select "2024" + "Groceries" to see only grocery expenses from 2024
  
- **Text + Filters**: Add text search to filter combinations
  - Example: Search "Walmart" + "Groceries" + "2024" to find all Walmart grocery purchases in 2024

### Year Scoping

The year filter allows you to scope your global search to a specific year:

- **All Years** (default): Shows expenses from all time periods
- **Specific Year**: Shows only expenses from the selected year (e.g., 2024, 2023, etc.)
- **Available Years**: Current year and past 10 years are available in the dropdown
- **Combines with Other Filters**: Year filter works alongside category, payment method, and text search

### Clearing Filters

- Click the **"Clear Filters"** button to remove all active filters
- Clearing filters returns you to monthly view, showing only the current month's expenses
- The clear button only appears when at least one filter is active

### Filter Synchronization

- Filters in the search bar and expense list header are synchronized
- Changing a filter in either location updates both
- This provides flexibility - filter from wherever is most convenient

## Usage Examples

### Example 1: Find All Gas Expenses
1. Select "Gas" from the category dropdown
2. View all gas expenses across all time periods
3. See total count of matching expenses

### Example 2: Track Credit Card Spending in 2024
1. Select "2024" from the year dropdown
2. Select "Credit Card" from the payment method dropdown
3. View all credit card expenses from 2024
4. Optionally add a category filter to narrow down further

### Example 3: Find Specific Store Purchases
1. Type store name in the search box (e.g., "Target")
2. Optionally add year filter (e.g., "2024")
3. Optionally add category filter (e.g., "Groceries")
4. View all matching expenses

### Example 4: Analyze Previous Year Spending
1. Select "2023" from the year dropdown
2. Optionally add category or payment method filters
3. Review all expenses from the previous year

### Example 5: Return to Monthly View
1. Click "Clear Filters" button
2. Application returns to showing current month only
3. All filters are reset

## Accessibility

The filtering feature is fully accessible:

- **Keyboard Navigation**: Tab through all filter controls
- **Screen Reader Support**: All controls have descriptive labels
- **Announcements**: Filter changes are announced to screen readers
- **Focus Management**: Clear button returns focus to search input

## Performance

The feature is optimized for large datasets:

- **Debounced Search**: Text search waits 300ms before filtering to avoid excessive updates
- **Memoized Results**: Filtered results are cached to prevent unnecessary recalculation
- **Efficient Rendering**: Components use React.memo to minimize re-renders

## Tips

- Use category filters to analyze spending patterns by type
- Combine filters to find very specific expenses quickly
- The filter status message shows how many expenses match your criteria
- Filters persist when switching between global and monthly views (until cleared)

## Related Features

- **Place Name Standardization**: Helps ensure consistent place names for better search results
- **Tax Deductible View**: Filter and view tax-deductible expenses
- **Annual Summary**: View aggregated data across the entire year
