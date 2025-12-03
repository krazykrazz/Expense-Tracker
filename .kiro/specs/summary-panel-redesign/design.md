# Design Document: Summary Panel Redesign

## Overview

This design document outlines the architecture and implementation approach for redesigning the Monthly Summary panel. The redesign transforms the current dense 2-column grid layout into a more organized tabbed interface with collapsible sections, improving information hierarchy and reducing cognitive load.

The key design principles are:
1. **Progressive Disclosure** - Show essential information first, details on demand
2. **Logical Grouping** - Related information organized into tabs
3. **Visual Hierarchy** - Key metrics prominently displayed at the top
4. **Consistent Interaction Patterns** - Tabs and collapsible sections behave predictably

## Architecture

The redesigned SummaryPanel will be refactored into smaller, focused sub-components:

```
SummaryPanel (container)
├── KeyMetricsRow
│   ├── MetricCard (Income)
│   ├── MetricCard (Total Expenses)
│   └── MetricCard (Net Balance)
├── TabNavigation
│   ├── Tab (Breakdown)
│   ├── Tab (Categories)
│   └── Tab (Financial Health)
└── TabContent
    ├── BreakdownTab
    │   ├── CollapsibleSection (Weekly)
    │   └── CollapsibleSection (Payment Methods)
    ├── CategoriesTab
    │   └── CategoryList
    └── FinancialHealthTab
        ├── FinancialCard (Income)
        ├── FinancialCard (Fixed Expenses)
        ├── FinancialCard (Loans)
        └── FinancialCard (Investments)
```

## Components and Interfaces

### SummaryPanel (Refactored Container)

The main container component that orchestrates data fetching and state management.

```jsx
interface SummaryPanelProps {
  selectedYear: number;
  selectedMonth: number;
  refreshTrigger: number;
}

interface SummaryPanelState {
  summary: SummaryData | null;
  previousSummary: SummaryData | null;
  activeTab: 'breakdown' | 'categories' | 'financial';
  loading: boolean;
  error: string | null;
}
```

### KeyMetricsRow

Displays the three primary financial metrics prominently.

```jsx
interface KeyMetricsRowProps {
  income: number;
  totalExpenses: number;  // fixed + variable
  netBalance: number;
}
```

### TabNavigation

Handles tab selection and visual state.

```jsx
interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: Array<{ id: string; label: string; icon?: string }>;
}
```

### CollapsibleSection

Reusable component for expandable/collapsible content areas.

```jsx
interface CollapsibleSectionProps {
  title: string;
  summaryValue: string;  // Shown when collapsed
  icon?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}
```

### CategoryList

Displays expense categories with sorting and truncation.

```jsx
interface CategoryListProps {
  categories: Array<{
    name: string;
    currentValue: number;
    previousValue: number;
  }>;
  initialDisplayCount?: number;  // Default: 5
}
```

### FinancialCard

Card component for financial health items with action buttons.

```jsx
interface FinancialCardProps {
  title: string;
  icon: string;
  value: number;
  valueColor?: 'positive' | 'negative' | 'neutral';
  actionLabel: string;
  onAction: () => void;
  details?: Array<{ label: string; value: number }>;
}
```

## Data Models

### SummaryData (Existing - No Changes)

```typescript
interface SummaryData {
  monthlyGross: number;
  totalFixedExpenses: number;
  total: number;  // Variable expenses
  netBalance: number;
  weeklyTotals: {
    week1: number;
    week2: number;
    week3: number;
    week4: number;
    week5: number;
  };
  methodTotals: Record<string, number>;
  typeTotals: Record<string, number>;
  loans?: LoanData[];
  totalOutstandingDebt?: number;
  investments?: InvestmentData[];
  totalInvestmentValue?: number;
}
```

### TabState

```typescript
interface TabState {
  activeTab: 'breakdown' | 'categories' | 'financial';
  expandedSections: Set<string>;
  showAllCategories: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties can be combined and refined:

### Property 1: Net Balance Color Coding
*For any* net balance value, the Summary_Panel SHALL apply the "positive" CSS class when the value is greater than or equal to zero, and the "negative" CSS class when the value is less than zero.
**Validates: Requirements 1.3, 1.4**

### Property 2: Total Expenses Calculation
*For any* fixed expenses value and variable expenses value, the displayed Total Expenses SHALL equal the sum of fixed expenses plus variable expenses.
**Validates: Requirements 1.5**

### Property 3: Tab Content Exclusivity
*For any* tab selection, only the content associated with the selected tab SHALL be visible, and all other tab contents SHALL be hidden.
**Validates: Requirements 2.2**

### Property 4: Collapsible Section Toggle
*For any* collapsible section, clicking the section header SHALL toggle its expanded state (collapsed becomes expanded, expanded becomes collapsed).
**Validates: Requirements 3.2, 3.3**

### Property 5: Collapsed Section Summary
*For any* collapsible section in collapsed state with data items, the section header SHALL display a summary total value.
**Validates: Requirements 3.4**

### Property 6: Expanded Section Items
*For any* collapsible section in expanded state, all data items within that section SHALL be rendered with their values and trend indicators.
**Validates: Requirements 3.5**

### Property 7: Category Filtering
*For any* set of expense categories, only categories where either current value or previous value is greater than zero SHALL be displayed.
**Validates: Requirements 4.1, 4.3**

### Property 8: Category Sorting
*For any* set of displayed expense categories, the categories SHALL be sorted by current expense amount in descending order.
**Validates: Requirements 4.4**

### Property 9: Category Truncation
*For any* set of categories with more than 5 items, only the top 5 by amount SHALL be displayed by default, with an expand option to show all.
**Validates: Requirements 4.5**

### Property 10: Modal Opening
*For any* management button click (View/Edit or Manage), the corresponding modal dialog SHALL be opened.
**Validates: Requirements 5.6**

### Property 11: Active Tab Styling
*For any* selected tab, that tab element SHALL have the "active" CSS class applied, and no other tab SHALL have the "active" class.
**Validates: Requirements 7.2**

## Error Handling

### Loading States
- Display skeleton loaders for each section while data is being fetched
- Maintain previous data display during refresh to prevent layout shift

### Error States
- Display inline error message if summary data fails to load
- Provide retry button for failed requests
- Individual tab content should handle errors independently

### Empty States
- Categories tab: Show "No expenses recorded this month" message
- Loans section: Show "$0.00" with "Manage Loans" button still accessible
- Investments section: Show "$0.00" with "Manage Investments" button still accessible

## Testing Strategy

### Dual Testing Approach

This feature will use both unit tests and property-based tests:

**Unit Tests** will cover:
- Component rendering with various props
- Tab switching behavior
- Modal opening on button clicks
- Loading and error state rendering

**Property-Based Tests** will use `fast-check` library to verify:
- Net balance color coding for any numeric value
- Total expenses calculation for any valid inputs
- Category filtering and sorting for any category data set
- Collapsible section toggle behavior

### Property-Based Testing Configuration
- Library: `fast-check`
- Minimum iterations: 100 per property
- Each property test will be tagged with the format: `**Feature: summary-panel-redesign, Property {number}: {property_text}**`

### Test File Organization
```
frontend/src/components/
├── SummaryPanel.jsx
├── SummaryPanel.css
├── SummaryPanel.test.jsx          # Unit tests
├── SummaryPanel.pbt.test.jsx      # Property-based tests
├── KeyMetricsRow.jsx
├── KeyMetricsRow.css
├── TabNavigation.jsx
├── TabNavigation.css
├── CollapsibleSection.jsx
├── CollapsibleSection.css
├── CategoryList.jsx
├── CategoryList.css
├── FinancialCard.jsx
└── FinancialCard.css
```

### Key Test Scenarios

1. **Key Metrics Display**
   - Verify all three metrics render with correct values
   - Verify color coding based on net balance sign

2. **Tab Navigation**
   - Verify default tab is "Breakdown"
   - Verify clicking tabs switches content
   - Verify only one tab content visible at a time

3. **Collapsible Sections**
   - Verify sections can be expanded/collapsed
   - Verify summary shown when collapsed
   - Verify all items shown when expanded

4. **Category List**
   - Verify filtering of zero-value categories
   - Verify descending sort order
   - Verify truncation to 5 items with expand option

5. **Financial Health Actions**
   - Verify each button opens correct modal
