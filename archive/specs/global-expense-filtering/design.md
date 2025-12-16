# Design Document

## Overview

This design enhances the Expense Tracker application's filtering capabilities by enabling category and payment method filters to work independently of text search and across all time periods. The current implementation restricts category and payment method filters to the monthly view, while text search operates globally. This design unifies the filtering experience by allowing users to apply category and payment method filters globally, either alone or in combination with text search.

The enhancement modifies the SearchBar component to include filter dropdowns, updates the App component's filtering logic to support global filtering without text search, and ensures consistent filter behavior across monthly and global views.

## Architecture

### Component Structure

```
App (State Management)
├── SearchBar (Filter Controls)
│   ├── Text Search Input
│   ├── Category Filter Dropdown
│   ├── Payment Method Filter Dropdown
│   └── Clear Filters Button
├── ExpenseList (Display)
│   └── Filtered Expenses
└── MonthSelector (Navigation)
```

### Data Flow

1. **User Interaction**: User selects filters in SearchBar or ExpenseList header
2. **State Update**: Filter state (searchText, filterType, filterMethod) updates in App component
3. **API Request**: App determines whether to fetch monthly or global expenses based on active filters
4. **Client-Side Filtering**: Fetched expenses are filtered by all active criteria
5. **Display Update**: ExpenseList renders filtered results

### View Mode Logic

The application operates in two modes:

- **Monthly View**: Displays expenses for selected month only (default state)
- **Global View**: Displays expenses from all time periods (triggered by any active filter)

**Mode Determination**:
```javascript
const isGlobalView = searchText.trim().length > 0 || filterType || filterMethod;
```

## Components and Interfaces

### SearchBar Component Enhancement

**Current State**: Simple text input with clear button

**Enhanced State**:
```javascript
{
  searchText: string,
  filterType: string,
  filterMethod: string
}
```

**Props Interface**:
```javascript
{
  onSearchChange: (text: string) => void,
  onFilterTypeChange: (type: string) => void,
  onFilterMethodChange: (method: string) => void,
  filterType: string,
  filterMethod: string,
  categories: string[],
  paymentMethods: string[]
}
```

**New Features**:
- Category dropdown selector
- Payment method dropdown selector
- Clear all filters button (visible when any filter is active)
- Visual indicators for active filters

### App Component Updates

**State Changes**:
```javascript
// Existing state
const [searchText, setSearchText] = useState('');
const [filterType, setFilterType] = useState('');
const [filterMethod, setFilterMethod] = useState('');

// New computed state
const isGlobalView = searchText.trim().length > 0 || filterType || filterMethod;
```

**Filtering Logic**:
```javascript
// Determine API endpoint based on view mode
const fetchExpenses = async () => {
  let url;
  if (isGlobalView) {
    // Fetch all expenses for global filtering
    url = `${API_ENDPOINTS.EXPENSES}`;
  } else {
    // Fetch month-specific expenses
    url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
  }
  // ... fetch and filter
};

// Client-side filtering (unchanged logic, works for both views)
const filteredExpenses = expenses.filter(expense => {
  // Text search filter
  if (searchText) {
    const searchLower = searchText.toLowerCase();
    const placeMatch = expense.place?.toLowerCase().includes(searchLower);
    const notesMatch = expense.notes?.toLowerCase().includes(searchLower);
    if (!placeMatch && !notesMatch) return false;
  }
  
  // Category filter
  if (filterType && expense.type !== filterType) return false;
  
  // Payment method filter
  if (filterMethod && expense.method !== filterMethod) return false;
  
  return true;
});
```

### ExpenseList Component Updates

**Current Behavior**: Contains filter dropdowns in header

**Updated Behavior**: 
- Filter dropdowns remain in ExpenseList header for consistency
- SearchBar also contains filter dropdowns for easier access
- Both sets of filters share the same state (controlled by App)
- Filter changes from either location update the same state

**Rationale**: Maintaining filters in both locations provides flexibility - users can filter from the search area or from the expense list header.

## Data Models

No database schema changes required. This is a frontend-only enhancement.

**Filter State Model**:
```javascript
{
  searchText: string,      // Text to search in place and notes fields
  filterType: string,      // Selected category (empty string = all)
  filterMethod: string,    // Selected payment method (empty string = all)
  isGlobalView: boolean    // Computed: true if any filter is active
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Filter independence

*For any* combination of search text, category filter, and payment method filter, each filter should be independently applicable without requiring the others to be set
**Validates: Requirements 1.2, 2.2**

### Property 2: Filter combination consistency

*For any* expense and any combination of active filters, the expense should be displayed if and only if it matches all active filter criteria using AND logic
**Validates: Requirements 1.3, 2.3, 2.4**

### Property 3: Global view activation

*For any* filter state where at least one filter (search text, category, or payment method) is active, the system should fetch and display expenses from all time periods
**Validates: Requirements 1.2, 2.2, 4.5**

### Property 4: Monthly view restoration

*For any* filter state where all filters are cleared (empty search text, no category selected, no payment method selected), the system should return to monthly view displaying only expenses for the currently selected month
**Validates: Requirements 3.3, 3.5**

### Property 5: Filter state preservation

*For any* filter state when switching between global and monthly views, the selected category and payment method filters should be preserved and continue to apply in the new view
**Validates: Requirements 1.5, 5.2**

### Property 6: Clear filters completeness

*For any* filter state with at least one active filter, clicking the clear filters button should reset all filters (search text, category, and payment method) to their default empty state
**Validates: Requirements 3.2, 3.4**

## Error Handling

### Filter State Errors

**Invalid Category Selection**:
- **Scenario**: User somehow selects a category not in the approved list
- **Handling**: Validate category against CATEGORIES constant, reset to empty if invalid
- **User Feedback**: Silent correction, log warning to console

**Invalid Payment Method Selection**:
- **Scenario**: User somehow selects a payment method not in the approved list
- **Handling**: Validate method against PAYMENT_METHODS constant, reset to empty if invalid
- **User Feedback**: Silent correction, log warning to console

### API Errors

**Fetch Failure in Global View**:
- **Scenario**: API request fails when fetching all expenses
- **Handling**: Display error message, maintain current filter state
- **User Feedback**: "Unable to load expenses. Please try again."
- **Recovery**: Retry button, or automatic retry after timeout

**Empty Results**:
- **Scenario**: No expenses match the applied filters
- **Handling**: Display informative message indicating no matches
- **User Feedback**: "No expenses match the selected filters. Try adjusting your filters or clearing them to see all expenses."

### State Synchronization

**Filter State Mismatch**:
- **Scenario**: SearchBar and ExpenseList filter states become desynchronized
- **Handling**: Use single source of truth in App component, pass state down as props
- **Prevention**: Controlled components pattern ensures synchronization

## Testing Strategy

### Unit Tests

**SearchBar Component**:
- Renders all filter controls (text input, category dropdown, payment method dropdown)
- Calls appropriate callbacks when filters change
- Shows/hides clear button based on filter state
- Displays correct placeholder text and tooltips

**App Component Filtering Logic**:
- Correctly determines global vs monthly view mode
- Fetches from correct API endpoint based on view mode
- Applies all filters correctly in combination
- Preserves filter state when switching views
- Clears all filters when clear button is clicked

**ExpenseList Component**:
- Displays correct filtered results
- Shows appropriate message when no results match filters
- Maintains filter dropdowns in header
- Synchronizes with SearchBar filter state

### Integration Tests

**Filter Workflow Tests**:
1. Apply category filter alone → verify global view with correct results
2. Apply payment method filter alone → verify global view with correct results
3. Apply both filters → verify AND logic
4. Add text search to existing filters → verify all filters apply
5. Clear filters → verify return to monthly view
6. Switch months with active filters → verify filters persist

**Edge Cases**:
- Apply filters with no matching expenses
- Apply filters then add expense that matches
- Apply filters then delete expense that was displayed
- Rapid filter changes (debouncing if needed)
- Browser back/forward with active filters

### Property-Based Tests

Property-based testing will use **fast-check** library for React/JavaScript. Each test will run a minimum of 100 iterations.

**Test 1: Filter Independence Property**
- **Property**: Filter independence (Property 1)
- **Validates**: Requirements 1.2, 2.2
- **Generator**: Random combinations of search text, category, and payment method (including empty values)
- **Test**: For each combination, verify that applying any single filter works without requiring others
- **Assertion**: Expenses are filtered correctly regardless of which filters are set

**Test 2: Filter Combination Consistency Property**
- **Property**: Filter combination consistency (Property 2)
- **Validates**: Requirements 1.3, 2.3, 2.4
- **Generator**: Random expenses and random filter combinations
- **Test**: For each expense and filter combination, verify it's displayed iff it matches all active filters
- **Assertion**: `displayed(expense) === matchesAllFilters(expense, filters)`

**Test 3: Global View Activation Property**
- **Property**: Global view activation (Property 3)
- **Validates**: Requirements 1.2, 2.2, 4.5
- **Generator**: Random filter states with at least one filter active
- **Test**: Verify API is called without month/year parameters
- **Assertion**: `hasActiveFilter(state) => apiCallIsGlobal()`

**Test 4: Monthly View Restoration Property**
- **Property**: Monthly view restoration (Property 4)
- **Validates**: Requirements 3.3, 3.5
- **Generator**: Random initial filter states, then clear all filters
- **Test**: Verify API is called with current month/year parameters after clearing
- **Assertion**: `allFiltersCleared(state) => apiCallIsMonthly(currentMonth, currentYear)`

**Test 5: Filter State Preservation Property**
- **Property**: Filter state preservation (Property 5)
- **Validates**: Requirements 1.5, 5.2
- **Generator**: Random filter states and random view switches
- **Test**: Apply filters, switch views, verify filters still active
- **Assertion**: `filtersBefore(switch) === filtersAfter(switch)`

**Test 6: Clear Filters Completeness Property**
- **Property**: Clear filters completeness (Property 6)
- **Validates**: Requirements 3.2, 3.4
- **Generator**: Random filter states with at least one active filter
- **Test**: Click clear button, verify all filters reset to empty
- **Assertion**: `clearFilters(state) => allFiltersEmpty(newState)`

### Manual Testing Checklist

- [ ] Visual appearance of filter controls matches design
- [ ] Filter dropdowns show correct options
- [ ] Tooltips display on hover
- [ ] Clear button appears/disappears appropriately
- [ ] Filter state persists across view switches
- [ ] Performance is acceptable with large datasets
- [ ] Responsive design works on mobile devices
- [ ] Keyboard navigation works for all controls
- [ ] Screen reader announces filter changes

## Implementation Notes

### Performance Considerations

**Large Dataset Handling**:
- Global view may fetch thousands of expenses
- Client-side filtering should be efficient
- Consider pagination or virtual scrolling if performance degrades
- Monitor API response times for global queries

**Optimization Strategies**:
- Memoize filtered results using `useMemo`
- Debounce text search input (300ms delay)
- Cache category and payment method lists
- Use React.memo for SearchBar and ExpenseList components

### Accessibility

**Keyboard Navigation**:
- All filter controls must be keyboard accessible
- Tab order: search input → category dropdown → payment method dropdown → clear button
- Enter key submits/applies filters
- Escape key clears focus

**Screen Reader Support**:
- Label all form controls with descriptive text
- Announce filter changes with aria-live regions
- Provide aria-labels for icon buttons
- Describe filter state in accessible text

**Visual Indicators**:
- Clear visual distinction between active and inactive filters
- Sufficient color contrast for all text and controls
- Focus indicators for keyboard navigation
- Loading states during API requests

### Browser Compatibility

- Tested on Chrome, Firefox, Safari, Edge (latest versions)
- Polyfills not required (modern browser features only)
- Graceful degradation for older browsers (basic filtering still works)

## Future Enhancements

### Potential Improvements

1. **Date Range Filtering**: Add start/end date pickers for custom date ranges
2. **Amount Range Filtering**: Filter by minimum/maximum expense amounts
3. **Multi-Select Filters**: Allow selecting multiple categories or payment methods
4. **Saved Filter Presets**: Save commonly used filter combinations
5. **Filter History**: Quick access to recently used filters
6. **Advanced Search**: Boolean operators (AND, OR, NOT) for text search
7. **Export Filtered Results**: Download filtered expenses as CSV
8. **Filter Analytics**: Show statistics about filtered results (total, average, etc.)

### Technical Debt Considerations

- Consider moving filter logic to a custom hook (`useExpenseFilters`)
- Evaluate state management library (Redux, Zustand) if filter state becomes complex
- Add URL query parameters for shareable filter states
- Implement filter state persistence in localStorage
