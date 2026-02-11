# Activity Log Feature

## Overview

The Activity Log feature provides comprehensive event tracking across the expense tracking application. It captures all user actions and system events, displaying them in a human-readable format in the Settings interface.

## Features

### Event Tracking

The system automatically logs events for:

- **Expenses**: Create, update, delete operations
- **Fixed Expenses**: Create, update, delete operations
- **Loans**: Create, update, delete operations
- **Loan Payments**: Create, update, delete operations
- **Investments**: Create, update, delete operations
- **Budgets**: Create, update, delete operations
- **Payment Methods**: Create, update, deactivate operations
- **Insurance Status Changes**: When medical expense insurance status changes
- **Backup Operations**: Backup creation and restoration

### User Interface

**Location**: Settings → Misc → Recent Activity

**Features**:
- Human-readable timestamps ("2 hours ago", "Yesterday at 3:45 PM")
- Configurable display limit (25, 50, 100, 200 events)
- Load More functionality for viewing older events
- Event count display ("Showing X of Y events")
- Retention policy information display

### Automatic Cleanup

**Retention Policy** (configurable):
- Default: 90 days or 1000 events (whichever is reached first)
- Scheduled cleanup runs daily at 2:00 AM
- Cleanup statistics available via API

## Technical Architecture

### Database Schema

```sql
CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_action TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
```

### API Endpoints

#### GET /api/activity-logs

Retrieve recent activity events with pagination.

**Query Parameters**:
- `limit` (optional, default: 50): Maximum number of events to return
- `offset` (optional, default: 0): Number of events to skip

**Response**:
```json
{
  "events": [
    {
      "id": 1234,
      "event_type": "expense_added",
      "entity_type": "expense",
      "entity_id": 567,
      "user_action": "Added expense: Groceries - $45.67",
      "metadata": {
        "amount": 45.67,
        "category": "Groceries",
        "date": "2025-01-27"
      },
      "timestamp": "2025-01-27T14:30:00.000Z"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/activity-logs/stats

Retrieve cleanup statistics and retention policy information.

**Response**:
```json
{
  "retentionDays": 90,
  "maxEntries": 1000,
  "currentCount": 847,
  "oldestEventTimestamp": "2024-11-15T08:22:00.000Z",
  "lastCleanupRun": "2025-01-27T02:00:00.000Z",
  "lastCleanupDeletedCount": 23
}
```

### Event Types

Update events include detailed change tracking showing old → new values for modified fields. Example:
`Updated expense: Pharmacy - $45.00 (amount: $30.00 → $45.00, category: health → medical)`

| Event Type | Entity Type | Description |
|------------|-------------|-------------|
| `expense_added` | expense | New expense created |
| `expense_updated` | expense | Expense modified (shows what changed: place, amount, category, date, method, posted date) |
| `expense_deleted` | expense | Expense removed |
| `fixed_expense_added` | fixed_expense | New fixed expense created |
| `fixed_expense_updated` | fixed_expense | Fixed expense modified (shows what changed: name, amount, category, payment type, due day, loan linkage) |
| `fixed_expense_deleted` | fixed_expense | Fixed expense removed |
| `loan_added` | loan | New loan created |
| `loan_updated` | loan | Loan modified (shows what changed: name, notes, rate/property value/renewal date) |
| `loan_deleted` | loan | Loan removed |
| `loan_payment_added` | loan_payment | New loan payment recorded |
| `loan_payment_updated` | loan_payment | Loan payment modified (shows what changed: amount, date, notes) |
| `loan_payment_deleted` | loan_payment | Loan payment removed |
| `investment_added` | investment | New investment created |
| `investment_updated` | investment | Investment modified (shows what changed: name, type) |
| `investment_deleted` | investment | Investment removed |
| `budget_added` | budget | New budget created |
| `budget_updated` | budget | Budget modified (shows old → new limit) |
| `budget_deleted` | budget | Budget removed |
| `payment_method_added` | payment_method | New payment method created |
| `payment_method_updated` | payment_method | Payment method modified (shows what changed: name, type, credit limit, billing/due days) |
| `payment_method_deactivated` | payment_method | Payment method deactivated |
| `insurance_status_changed` | expense | Medical expense insurance status changed |
| `backup_created` | system | Database backup created |
| `backup_restored` | system | Database backup restored |

## Configuration

### Retention Policy

Retention settings are configurable via the Settings API and UI:

- **Max Age (days)**: 7–365 (default: 90)
- **Max Count**: 100–10,000 (default: 1,000)

Settings are stored in the `settings` database table and managed through:
- **UI**: Settings → General tab → Activity Log Retention Policy
- **API**: `GET/PUT /api/activity-logs/settings`

The cleanup job reads settings from the database on each run, so changes take effect on the next scheduled cleanup.

### Cleanup Schedule

The cleanup schedule is configured in `backend/server.js`:

```javascript
// Daily cleanup at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  await activityLogService.cleanupOldEvents();
});
```

## Error Handling

The activity log uses a **fire-and-forget** pattern to ensure logging failures never impact core application functionality:

- All logging operations are wrapped in try-catch blocks
- Errors are logged for debugging but not thrown to calling code
- Main application operations continue even if logging fails

## Testing

The feature includes comprehensive test coverage:

- **17 correctness properties** validated with property-based testing
- **8 integration test suites** for event logging across all entities
- **Unit tests** for service layer, repository layer, and controller layer
- **Frontend component tests** for UI behavior and interactions

## Performance Considerations

- **Indexes**: Timestamp and entity lookups are indexed for fast queries
- **Pagination**: API supports pagination to handle large result sets
- **Automatic Cleanup**: Daily cleanup prevents unbounded database growth
- **Async Logging**: Fire-and-forget pattern ensures minimal performance impact

## User Guide

### Viewing Recent Activity

1. Navigate to **Settings** (gear icon in top navigation)
2. Click the **Misc** tab
3. Scroll to the **Recent Activity** section

### Changing Display Limit

1. Use the dropdown selector to choose how many events to display (25, 50, 100, or 200)
2. Your preference is saved automatically and restored on next visit

### Loading More Events

1. Click the **Load More** button at the bottom of the event list
2. Additional older events will be appended to the list
3. The button disappears when all events have been loaded

### Understanding Timestamps

Timestamps are displayed in human-readable format:
- "Just now" - Less than 1 minute ago
- "5 minutes ago" - Less than 1 hour ago
- "3 hours ago" - Less than 24 hours ago
- "Yesterday at 2:30 PM" - Yesterday's events
- "3 days ago" - Less than 7 days ago
- "Jan 27 at 2:30 PM" - Older events (full date)

## Related Documentation

- [Database Schema](../DATABASE_SCHEMA.md) - Complete database schema including activity_logs table
- [API Documentation](../API_DOCUMENTATION.md) - Full API reference
- [User Guide](../guides/USER_GUIDE.md) - Complete user guide

## Implementation Details

For developers working with the activity log system:

- **Spec Location**: `.kiro/specs/activity-log/`
- **Requirements**: `.kiro/specs/activity-log/requirements.md`
- **Design**: `.kiro/specs/activity-log/design.md`
- **Tasks**: `.kiro/specs/activity-log/tasks.md`

### Adding Event Logging to New Features

To add activity logging to a new feature:

```javascript
const activityLogService = require('./activityLogService');

// After successful operation
await activityLogService.logEvent(
  'entity_added',           // event_type
  'entity',                 // entity_type
  entityId,                 // entity_id (or null for system events)
  'Added entity: Name',     // user_action (human-readable)
  {                         // metadata (optional)
    field1: value1,
    field2: value2
  }
);
```

The logging call should be:
1. **After** the main operation succeeds
2. **Wrapped** in try-catch (or use the service's built-in error handling)
3. **Non-blocking** - don't await if you want fire-and-forget behavior
