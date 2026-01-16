# Design Document

## Overview

The Budget Alert Notifications feature extends the existing Budget Tracking & Alerts system by adding proactive notification banners that appear at the top of the main interface when users approach or exceed their budget limits. This feature follows the same design patterns as the Monthly Data Reminders system, providing dismissible banners with clear visual hierarchy and quick access to budget management.

The system leverages existing budget progress calculations and integrates seamlessly with the current budget tracking infrastructure, providing real-time alerts without impacting application performance.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  BudgetAlertBanner  │  BudgetAlertManager  │  App.jsx       │
│  (Display Component) │  (Logic Component)   │  (Integration) │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Uses Existing APIs
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                 Existing Backend                             │
├─────────────────────────────────────────────────────────────┤
│  budgetService.getBudgets()  →  Returns budget progress     │
│  budgetService.getBudgetSummary()  →  Returns overall data  │
│                                                              │
│  No new backend changes required                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Alert Detection**: BudgetAlertManager → calls existing budgetService.getBudgets() → analyzes progress data → determines alert levels

2. **Alert Display**: BudgetAlertManager → passes alert data → BudgetAlertBanner → renders appropriate banner

3. **User Interaction**: User dismisses alert → BudgetAlertManager updates session state → banner hidden

4. **Real-time Updates**: Expense CRUD operation → existing budget refresh → BudgetAlertManager recalculates alerts → updates display

5. **Quick Actions**: User clicks "Manage Budgets" → opens existing BudgetManagementModal → after changes → alerts refresh

## Components and Interfaces

### Frontend Components

#### BudgetAlertBanner
Individual alert banner component for displaying a single alert.

**Props**:
- `alert`: AlertData - Alert information object
- `onDismiss`: (alertId: string) => void - Dismiss callback
- `onManageBudgets`: () => void - Open budget management
- `onViewDetails`: () => void - Navigate to budget section

**AlertData Interface**:
```typescript
interface AlertData {
  id: string;
  severity: 'warning' | 'danger' | 'critical';
  category: string;
  progress: number;
  spent: number;
  limit: number;
  message: string;
  icon: string;
}
```

**Visual Design**:
- **Warning (80-89%)**: Yellow/amber background, ⚡ icon, subtle border
- **Danger (90-99%)**: Orange background, ! icon, medium border
- **Critical (≥100%)**: Red background, ⚠ icon, bold border

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Icon] Category Budget Alert: 85% of Food budget used      │
│        $425.00 spent of $500.00 limit                      │
│        [Manage Budgets] [View Details]              [×]    │
└─────────────────────────────────────────────────────────────┘
```

#### BudgetAlertManager
Container component that manages all budget alerts and their state.

**Props**:
- `year`: number - Current year
- `month`: number - Current month (1-12)
- `refreshTrigger`: number - Trigger for refreshing alert data
- `onManageBudgets`: () => void - Callback to open budget management

**State**:
- `alerts`: AlertData[] - Current active alerts
- `dismissedAlerts`: Set<string> - Session-dismissed alert IDs
- `loading`: boolean - Loading state
- `error`: string | null - Error message

**Key Methods**:
- `calculateAlerts(budgets)` - Analyze budget data and generate alerts
- `dismissAlert(alertId)` - Add alert to dismissed set
- `refreshAlerts()` - Recalculate and update alerts
- `shouldShowAlert(alert)` - Check if alert should be displayed

#### Alert Calculation Logic

```typescript
const calculateAlerts = (budgets: BudgetProgress[]): AlertData[] => {
  const alerts: AlertData[] = [];
  
  budgets.forEach(budget => {
    const progress = budget.progress;
    let severity: AlertSeverity | null = null;
    
    if (progress >= 100) {
      severity = 'critical';
    } else if (progress >= 90) {
      severity = 'danger';
    } else if (progress >= 80) {
      severity = 'warning';
    }
    
    if (severity) {
      alerts.push({
        id: `budget-alert-${budget.budget.id}`,
        severity,
        category: budget.budget.category,
        progress,
        spent: budget.spent,
        limit: budget.budget.limit,
        message: generateAlertMessage(budget, severity),
        icon: getAlertIcon(severity)
      });
    }
  });
  
  return alerts.sort((a, b) => {
    // Sort by severity: critical > danger > warning
    const severityOrder = { critical: 3, danger: 2, warning: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
};
```

### Integration with Existing Components

#### App.jsx Integration
Add BudgetAlertManager to the main application layout:

```jsx
// In App.jsx
const [budgetRefreshTrigger, setBudgetRefreshTrigger] = useState(0);

// Add to render method, above existing content
<div className="app-container">
  <BudgetAlertManager
    year={currentYear}
    month={currentMonth}
    refreshTrigger={budgetRefreshTrigger}
    onManageBudgets={() => setShowBudgetModal(true)}
  />
  
  {/* Existing app content */}
  <MonthSelector ... />
  <SummaryPanel ... />
  {/* ... */}
</div>
```

#### Refresh Integration
Connect to existing refresh patterns:

```jsx
// In App.jsx, update existing refresh handlers
const handleExpenseUpdate = () => {
  setRefreshTrigger(prev => prev + 1);
  setBudgetRefreshTrigger(prev => prev + 1); // Add this line
};
```

## Data Models

### Alert Data Structure

```typescript
interface AlertData {
  id: string;                    // Unique identifier for the alert
  severity: AlertSeverity;       // Alert severity level
  category: string;              // Budget category name
  progress: number;              // Budget progress percentage
  spent: number;                 // Amount spent
  limit: number;                 // Budget limit
  message: string;               // Human-readable alert message
  icon: string;                  // Icon character for display
}

type AlertSeverity = 'warning' | 'danger' | 'critical';

interface AlertThresholds {
  warning: 80;   // 80-89%
  danger: 90;    // 90-99%
  critical: 100; // 100%+
}
```

### Alert Message Generation

```typescript
const generateAlertMessage = (budget: BudgetProgress, severity: AlertSeverity): string => {
  const { category, progress, spent, limit } = budget;
  const remaining = limit - spent;
  
  switch (severity) {
    case 'warning':
      return `${category} budget is ${progress.toFixed(1)}% used. ${formatCurrency(remaining)} remaining.`;
    
    case 'danger':
      return `${category} budget is ${progress.toFixed(1)}% used. Only ${formatCurrency(remaining)} left!`;
    
    case 'critical':
      return `${category} budget exceeded! ${formatCurrency(Math.abs(remaining))} over budget.`;
    
    default:
      return `${category} budget needs attention.`;
  }
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Alert threshold and severity accuracy
*For any* budget with progress percentage, an alert should be generated if and only if the progress is 80% or higher, and the severity should match the defined thresholds (warning: 80-89%, danger: 90-99%, critical: ≥100%)
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Alert sorting consistency
*For any* set of alerts with different severities, they should be sorted with critical alerts first, then danger, then warning
**Validates: Requirements 1.4**

### Property 3: No alerts without budgets
*For any* month with no active budgets, no budget alert banners should be displayed
**Validates: Requirements 1.5**

### Property 4: Alert message accuracy
*For any* alert, the message should accurately reflect the category name, progress percentage, and spent/limit amounts
**Validates: Requirements 2.1, 2.3**

### Property 5: Alert icon consistency
*For any* alert severity level, the displayed icon should match the defined mapping (warning: ⚡, danger: !, critical: ⚠)
**Validates: Requirements 6.1, 6.2, 6.3**

### Property 6: Alert dismissal session persistence
*For any* dismissed alert, it should remain hidden during the current session but reappear after session reset if the budget condition persists
**Validates: Requirements 3.2, 3.3**

### Property 7: Dismissal independence
*For any* set of multiple alerts, each alert should be dismissible independently without affecting other alerts
**Validates: Requirements 3.5**

### Property 8: Real-time alert updates
*For any* budget data change that affects progress thresholds, the alert status should update immediately to reflect the new progress and severity
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 9: Alert calculation consistency
*For any* budget data, alert calculations should use the same progress values as the existing budget tracking system
**Validates: Requirements 8.1, 8.2**

### Property 10: Memory-only dismissal storage
*For any* alert dismissal, the dismissal state should be stored in memory without triggering database operations
**Validates: Requirements 7.3**

## Error Handling

### Alert Calculation Errors

**Budget Data Unavailable**:
- Scenario: Budget service returns error or empty data
- Handling: Display no alerts, log error, don't crash application
- User Experience: No alert banners shown, existing budget functionality unaffected

**Invalid Budget Progress**:
- Scenario: Budget progress calculation returns NaN or invalid values
- Handling: Skip invalid budgets, continue processing valid ones
- User Experience: Only valid alerts shown, invalid data ignored

### UI Error Handling

**Alert Rendering Errors**:
- Scenario: Individual alert banner fails to render
- Handling: Error boundary catches error, shows fallback UI
- User Experience: Other alerts still display, error logged

**Dismissal State Errors**:
- Scenario: Session storage fails or is unavailable
- Handling: Fall back to in-memory storage, alerts work but may not persist dismissal
- User Experience: Alerts still dismissible, may reappear more frequently

### Performance Safeguards

**Too Many Alerts**:
- Scenario: User has many budgets all triggering alerts
- Handling: Limit display to top 5 most critical alerts
- User Experience: Most important alerts shown, "and X more" indicator

**Rapid Alert Updates**:
- Scenario: Multiple expense operations in quick succession
- Handling: Debounce alert recalculation by 300ms
- User Experience: Smooth updates without flickering

## Testing Strategy

### Unit Testing

**Alert Calculation Tests**:
- Test threshold detection (80%, 90%, 100%)
- Test severity assignment
- Test alert message generation
- Test alert sorting logic
- Test edge cases (exactly 80%, 100%, etc.)

**Component Tests**:
- BudgetAlertBanner rendering with different severities
- BudgetAlertManager state management
- Dismissal functionality
- Action button interactions

### Property-Based Testing

The system will use **fast-check** library for property-based testing with a minimum of 100 iterations per property.

**Test Configuration**:
```javascript
import fc from 'fast-check';

const budgetProgressArbitrary = fc.record({
  budget: fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    category: fc.constantFrom('Housing', 'Utilities', 'Groceries', 'Dining Out', 'Gas'),
    limit: fc.float({ min: 1, max: 10000, noNaN: true })
  }),
  spent: fc.float({ min: 0, max: 15000, noNaN: true }),
  progress: fc.float({ min: 0, max: 200, noNaN: true })
});
```

**Property Test Examples**:

```javascript
// Property 1: Alert threshold accuracy
test('Alert threshold accuracy', () => {
  fc.assert(
    fc.property(budgetProgressArbitrary, (budgetProgress) => {
      const alerts = calculateAlerts([budgetProgress]);
      const shouldHaveAlert = budgetProgress.progress >= 80;
      
      if (shouldHaveAlert) {
        expect(alerts).toHaveLength(1);
        expect(alerts[0].category).toBe(budgetProgress.budget.category);
      } else {
        expect(alerts).toHaveLength(0);
      }
    }),
    { numRuns: 100 }
  );
});

// Property 2: Alert severity correctness
test('Alert severity correctness', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 80, max: 200 }), // progress >= 80
      (progress) => {
        const mockBudget = {
          budget: { id: 1, category: 'Food', limit: 100 },
          spent: progress,
          progress
        };
        
        const alerts = calculateAlerts([mockBudget]);
        expect(alerts).toHaveLength(1);
        
        const alert = alerts[0];
        if (progress >= 100) {
          expect(alert.severity).toBe('critical');
        } else if (progress >= 90) {
          expect(alert.severity).toBe('danger');
        } else {
          expect(alert.severity).toBe('warning');
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

Each property-based test will be tagged with:
```javascript
/**
 * Feature: budget-alert-notifications, Property 1: Alert threshold accuracy
 * Validates: Requirements 1.1, 1.2, 1.3
 */
```

### Integration Testing

**End-to-End Alert Flow**:
1. Set up budget for Food category ($500 limit)
2. Add expenses totaling $400 (80% - should trigger warning)
3. Verify warning alert appears
4. Add $50 more (90% - should trigger danger)
5. Verify alert updates to danger
6. Add $60 more (100%+ - should trigger critical)
7. Verify alert updates to critical
8. Dismiss alert
9. Verify alert hidden
10. Refresh page
11. Verify alert reappears

**Real-time Update Flow**:
1. Create budget and expenses to trigger alert
2. Verify alert displayed
3. Edit expense to reduce amount below threshold
4. Verify alert disappears immediately
5. Edit expense to increase amount above threshold
6. Verify alert reappears with correct severity

### Edge Cases

- Budget with exactly 80.0% progress
- Budget with exactly 90.0% progress  
- Budget with exactly 100.0% progress
- Multiple budgets at same threshold
- Budget with zero limit (edge case)
- Budget with negative spending (refunds)
- Very large budget amounts (>$100,000)
- Very small budget amounts (<$1)

## Performance Considerations

### Optimization Strategies

**Calculation Efficiency**:
- Reuse existing budget progress data from budgetService
- Cache alert calculations until budget data changes
- Debounce rapid alert updates (300ms)

**Rendering Optimization**:
- Use React.memo for BudgetAlertBanner to prevent unnecessary re-renders
- Implement shouldComponentUpdate logic for alert list changes
- Lazy load alert icons and styles

**Memory Management**:
- Store dismissal state in sessionStorage with fallback to memory
- Clear dismissed alerts when navigating away from budget-related pages
- Limit maximum number of displayed alerts (5)

### Performance Metrics

**Target Performance**:
- Alert calculation: <50ms for up to 20 budgets
- Alert rendering: <100ms for up to 5 alerts
- Dismissal response: <50ms
- Real-time updates: <200ms after expense operation

## Security Considerations

### Data Validation

**Input Sanitization**:
- Validate all budget progress data before alert calculation
- Sanitize alert messages to prevent XSS
- Validate alert IDs to prevent injection attacks

**Session Security**:
- Store dismissal state in sessionStorage (not localStorage for privacy)
- Don't persist sensitive budget information in dismissal state
- Clear dismissal state on logout (if authentication added)

## Future Enhancements

### Phase 2 Features (Not in Current Scope)

1. **Email Notifications**: Send email alerts for critical budget overages
2. **Push Notifications**: Browser push notifications for budget alerts
3. **Custom Thresholds**: Allow users to customize alert thresholds (not just 80/90/100%)
4. **Alert History**: Track and display history of budget alerts over time
5. **Smart Alerts**: Machine learning to predict when budgets will be exceeded
6. **Alert Scheduling**: Only show alerts during certain hours or days
7. **Category Grouping**: Group related categories in alerts (e.g., all food-related)
8. **Alert Snoozing**: Temporarily snooze alerts for a specified time period

### Technical Improvements

- Implement alert animation transitions
- Add keyboard navigation for alert actions
- Improve accessibility with ARIA labels and screen reader support
- Add unit tests for alert styling and visual hierarchy

## Migration Plan

### Implementation Strategy

**Phase 1: Core Alert System**
- Implement BudgetAlertBanner component
- Implement BudgetAlertManager logic
- Add basic alert calculation and display

**Phase 2: Integration**
- Integrate with App.jsx and existing refresh patterns
- Add real-time update hooks
- Implement dismissal functionality

**Phase 3: Polish**
- Add styling and visual hierarchy
- Implement performance optimizations
- Add comprehensive testing

### Rollback Plan

Since this feature only adds new components without modifying existing functionality:
- Remove BudgetAlertManager from App.jsx
- Delete alert-related components and styles
- No database changes required
- Existing budget functionality remains unchanged

### Deployment Checklist

- [ ] BudgetAlertBanner component implemented and tested
- [ ] BudgetAlertManager logic implemented and tested
- [ ] Integration with App.jsx completed
- [ ] Real-time updates working with existing refresh patterns
- [ ] Alert dismissal functionality working
- [ ] Property-based tests passing (100+ iterations each)
- [ ] Integration tests passing
- [ ] Performance tested with multiple alerts
- [ ] Accessibility tested with screen readers
- [ ] Visual design matches existing application style
- [ ] Documentation updated
- [ ] Version number updated
- [ ] CHANGELOG.md updated
