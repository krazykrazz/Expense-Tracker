# Design Document

## Overview

This design addresses UX inconsistencies in the CreditCardReminderBanner component by ensuring that the multiple payment view displays the same information as the single payment view. Specifically, we will add the "Statement" badge (indicating uploaded statement balances) and due date information to each card in the multiple payment breakdown section.

The fix is minimal and focused: we'll modify the JSX rendering logic in the multiple cards view to include the Statement badge and due date, reusing the existing CSS classes and styling from the single payment view.

## Architecture

### Component Structure

The CreditCardReminderBanner component has two rendering paths:
1. **Single Payment View** (lines 118-165): Displays detailed information for one card
2. **Multiple Payment View** (lines 168-217): Displays summary with card breakdown

Both views share:
- Common helper functions (`formatCurrency`, `getUrgencyIndicator`)
- Common CSS classes and styling
- Common event handlers (`handleClick`, `handleDismiss`, `handleKeyDown`)

### Current Implementation Gap

**Single Payment View** displays:
- Card name
- Required payment amount
- Statement badge (if `has_actual_balance` is true)
- Urgency indicator (paid, overdue, due soon, etc.)
- Due date (if `payment_due_day` is defined)

**Multiple Payment View** displays:
- Card name
- Required payment amount
- Urgency indicator only ❌ Missing Statement badge
- ❌ Missing due date

## Components and Interfaces

### Modified Component

**CreditCardReminderBanner.jsx**
- Location: `frontend/src/components/CreditCardReminderBanner.jsx`
- Lines to modify: 186-202 (the `.reminder-cards-breakdown` section)

### Data Interface

Each card object in the `cards` prop contains:
```typescript
{
  id: number,
  display_name: string,
  required_payment: number,
  has_actual_balance: boolean,      // Used for Statement badge
  payment_due_day: number | null,   // Used for due date display
  is_statement_paid: boolean,
  is_overdue: boolean,
  is_due_soon: boolean,
  days_until_due: number
}
```

## Data Models

No data model changes required. The component already receives all necessary data through the `cards` prop.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Statement Badge Display Consistency

*For any* card with `has_actual_balance` set to true, the Statement badge should be displayed in both single and multiple payment views with identical styling and content.

**Validates: Requirements 1.1, 1.2, 2.1, 2.2**

### Property 2: Statement Badge Conditional Rendering

*For any* card with `has_actual_balance` set to false, no Statement badge should be rendered in either view.

**Validates: Requirements 1.3**

### Property 3: Due Date Display Consistency

*For any* card with a defined `payment_due_day`, the due date should be displayed in both single and multiple payment views.

**Validates: Requirements 2.1, 2.2, 3.5**

### Property 4: Due Date Conditional Rendering

*For any* card without a defined `payment_due_day`, no due date information should be rendered in either view.

**Validates: Requirements 2.3**

### Property 5: Badge Ordering Consistency

*For any* card displaying both Statement badge and Urgency indicator, the Statement badge should appear first, followed by the Urgency indicator.

**Validates: Requirements 1.4**

### Property 6: CSS Class Consistency

*For any* Statement badge rendered in the multiple payment view, it should use the same CSS class "reminder-balance-source actual" as the single payment view.

**Validates: Requirements 3.1**

### Property 7: Tooltip Consistency

*For any* Statement badge rendered in the multiple payment view, it should have the same tooltip text "From your entered statement balance" as the single payment view.

**Validates: Requirements 3.2**

### Property 8: Backward Compatibility

*For any* existing functionality (urgency indicators, payment amounts, click handlers, dismiss handlers), the behavior should remain unchanged after the modifications.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

## Error Handling

No new error handling required. The component already handles:
- Missing or undefined card data (returns null if no cards)
- Missing optional fields (conditional rendering with `&&` operator)

The new code will follow the same pattern:
- Use conditional rendering (`&&`) for optional fields
- No errors thrown for missing data

## Testing Strategy

### Unit Tests

Unit tests should verify specific examples and edge cases:

1. **Single card with Statement badge**: Verify badge appears with correct text and styling
2. **Single card without Statement badge**: Verify badge does not appear
3. **Multiple cards with mixed Statement badges**: Verify badges appear only for cards with `has_actual_balance`
4. **Cards with due dates**: Verify due date displays correctly
5. **Cards without due dates**: Verify no due date is shown
6. **Badge ordering**: Verify Statement badge appears before Urgency indicator
7. **Backward compatibility**: Verify existing tests still pass

### Property-Based Tests

Property tests should verify universal properties across all inputs:

Each property test must:
- Run minimum 100 iterations
- Reference its design document property
- Use tag format: **Feature: credit-card-reminder-badge-consistency, Property {number}: {property_text}**

**Property Test 1**: Statement Badge Display Consistency
- Generate random card data with `has_actual_balance` true
- Render in both single and multiple views
- Verify Statement badge appears in both with same content

**Property Test 2**: Statement Badge Conditional Rendering
- Generate random card data with `has_actual_balance` false
- Render in both views
- Verify no Statement badge appears in either view

**Property Test 3**: Due Date Display Consistency
- Generate random card data with defined `payment_due_day`
- Render in both views
- Verify due date appears in both views

**Property Test 4**: Due Date Conditional Rendering
- Generate random card data without `payment_due_day`
- Render in both views
- Verify no due date appears in either view

**Property Test 5**: Badge Ordering Consistency
- Generate random card data with both badges
- Render and extract badge order
- Verify Statement badge appears before Urgency indicator

**Property Test 6**: CSS Class Consistency
- Generate random card data with `has_actual_balance` true
- Render in multiple view
- Verify CSS class matches single view

**Property Test 7**: Tooltip Consistency
- Generate random card data with `has_actual_balance` true
- Render in multiple view
- Verify tooltip text matches single view

**Property Test 8**: Backward Compatibility
- Generate random card data
- Render and interact with component
- Verify all existing functionality works unchanged

### Testing Configuration

- Use Vitest with @testing-library/react for component tests
- Use fast-check for property-based test data generation
- Configure property tests to run 100 iterations minimum
- Tag each property test with feature name and property number

## Implementation Details

### Code Changes

The implementation requires modifying only the multiple payment view section (lines 186-202) in `CreditCardReminderBanner.jsx`.

**Current code structure:**
```jsx
<div className="reminder-card-item">
  <span className="reminder-card-name">{card.display_name}</span>
  <span className="reminder-card-amount">{formatCurrency(card.required_payment)}</span>
  {urgency.label && (
    <span className={`reminder-urgency-badge small ${urgency.className}`}>
      {urgency.icon}
    </span>
  )}
</div>
```

**Modified code structure:**
```jsx
<div className="reminder-card-item">
  <div className="reminder-card-main-info">
    <span className="reminder-card-name">{card.display_name}</span>
    <span className="reminder-card-amount">{formatCurrency(card.required_payment)}</span>
  </div>
  <div className="reminder-card-badges">
    {/* Statement badge - Requirements: 1.1, 1.2, 1.3 */}
    {card.has_actual_balance && (
      <span 
        className="reminder-balance-source actual"
        title="From your entered statement balance"
      >
        ✓ Statement
      </span>
    )}
    {/* Urgency indicator - Requirements: 4.1 */}
    {urgency.label && (
      <span className={`reminder-urgency-badge small ${urgency.className}`}>
        {urgency.icon}
      </span>
    )}
  </div>
  {/* Due date - Requirements: 2.1, 2.2, 2.3 */}
  {card.payment_due_day && (
    <span className="reminder-card-due-date">
      Due: day {card.payment_due_day}
    </span>
  )}
</div>
```

### CSS Changes

Add new CSS rules to support the restructured layout:

```css
/* Card item layout for multiple cards */
.credit-card-reminder-banner .reminder-card-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}

.credit-card-reminder-banner .reminder-card-main-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.credit-card-reminder-banner .reminder-card-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.credit-card-reminder-banner .reminder-card-due-date {
  font-size: 0.75rem;
  opacity: 0.8;
}
```

### Layout Structure

The new layout for each card in the multiple payment view:

```
┌─────────────────────────────────────────┐
│ Card Name              $123.45          │
│ ✓ Statement  🚨 Overdue                 │
│ Due: day 15                             │
└─────────────────────────────────────────┘
```

This matches the information density and visual hierarchy of the single payment view while maintaining readability in a compact format.

## Visual Design Considerations

### Spacing and Alignment

- Use flexbox with `flex-direction: column` for vertical stacking
- Maintain 4px gap between rows for visual breathing room
- Align badges horizontally with 6px gap between them
- Keep due date text slightly smaller (0.75rem) and subdued (opacity: 0.8)

### Responsive Behavior

The existing responsive behavior is maintained:
- Badges wrap to new line if needed (`flex-wrap: wrap`)
- Component remains clickable for navigation
- Dismiss button stays in top-right corner

### Accessibility

- Maintain existing ARIA labels and roles
- Keep tooltip on Statement badge for screen readers
- Preserve keyboard navigation (Enter/Space to click)
- Support reduced motion preferences (no new animations)

### Dark Mode

The existing CSS already supports dark mode for:
- `.reminder-balance-source.actual` class
- `.reminder-urgency-badge` variants
- Banner backgrounds and borders

No additional dark mode CSS needed.

## Migration and Rollout

### Deployment Strategy

This is a pure frontend change with no:
- API changes
- Database schema changes
- Backend logic changes
- Breaking changes to component props

Safe to deploy immediately after testing.

### Rollback Plan

If issues arise:
1. Revert the single commit containing the changes
2. Redeploy frontend
3. No data migration or cleanup needed

### Testing Before Deployment

1. Run all existing unit tests
2. Run new property-based tests
3. Manual testing:
   - View single payment reminder
   - View multiple payment reminders
   - Test with cards that have/don't have statement balances
   - Test with cards that have/don't have due dates
   - Verify click and dismiss handlers work
   - Test in light and dark mode
   - Test responsive behavior

## Performance Considerations

### Rendering Performance

No performance impact expected:
- Same number of DOM elements (just reorganized)
- No new state or effects
- No new API calls
- Conditional rendering already optimized with `&&` operator

### Bundle Size

Minimal impact:
- ~50 lines of JSX added
- ~30 lines of CSS added
- No new dependencies
- Estimated bundle size increase: <1KB

## Future Enhancements

Potential improvements for future iterations:

1. **Collapsible card list**: If many cards are due, allow collapsing the breakdown
2. **Sort by urgency**: Show most urgent cards first in the list
3. **Quick actions**: Add inline "Mark as Paid" buttons for each card
4. **Visual indicators**: Use color coding for different urgency levels in the breakdown

These are out of scope for this fix but could be considered in future UX improvements.
