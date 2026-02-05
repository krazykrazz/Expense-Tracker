# Design Document: Activity Log

## Overview

The Activity Log feature implements a centralized event tracking system that captures and displays user actions and system events within the expense tracking application. This design establishes an extensible framework using a service-based architecture with a dedicated database table, scheduled cleanup jobs, and a user-friendly interface integrated into the Settings->Misc section.

The system follows the application's layered architecture pattern (Controller → Service → Repository → Database) and uses a "fire-and-forget" logging approach to ensure that event logging failures do not impact core application functionality.

### Key Design Principles

1. **Non-Intrusive**: Event logging must never cause the main application flow to fail
2. **Extensible**: Adding new event types should require minimal code changes
3. **Performant**: Event logging should have minimal performance impact
4. **Maintainable**: Automatic cleanup prevents unbounded database growth
5. **User-Friendly**: Activity display should be clear, searchable, and configurable

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  BackupSettings.jsx (Settings->Misc Tab)               │ │
│  │    └─ ActivityLogView Component                        │ │
│  │         ├─ Display limit selector                      │ │
│  │         ├─ Event list with timestamps                  │ │
│  │         ├─ Load More button                            │ │
│  │         └─ Retention policy display                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Node.js/Express)                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  activityLogController.js                              │ │
│  │    ├─ GET /api/activity-logs (retrieve events)        │ │
│  │    └─ GET /api/activity-logs/stats (cleanup stats)    │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  activityLogService.js                                 │ │
│  │    ├─ logEvent(eventType, entityType, ...)            │ │
│  │    ├─ getRecentEvents(limit, offset)                  │ │
│  │    ├─ cleanupOldEvents()                              │ │
│  │    └─ getCleanupStats()                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  activityLogRepository.js                              │ │
│  │    ├─ insert(event)                                    │ │
│  │    ├─ findRecent(limit, offset)                       │ │
│  │    ├─ deleteOlderThan(date)                           │ │
│  │    ├─ deleteExcessEvents(maxCount)                    │ │
│  │    └─ getOldestEventTimestamp()                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Scheduled Job (node-cron)                             │ │
│  │    └─ Daily cleanup at 2:00 AM                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     SQLite Database                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  activity_logs table                                   │ │
│  │    ├─ id (INTEGER PRIMARY KEY)                        │ │
│  │    ├─ event_type (TEXT NOT NULL)                      │ │
│  │    ├─ entity_type (TEXT NOT NULL)                     │ │
│  │    ├─ entity_id (INTEGER NULL)                        │ │
│  │    ├─ user_action (TEXT NOT NULL)                     │ │
│  │    ├─ metadata (TEXT NULL - JSON)                     │ │
│  │    └─ timestamp (TEXT NOT NULL - ISO 8601)            │ │
│  │                                                          │ │
│  │  Indexes:                                               │ │
│  │    ├─ idx_activity_logs_timestamp (DESC)              │ │
│  │    └─ idx_activity_logs_entity (entity_type, entity_id)│ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Event Flow

1. **Event Trigger**: User performs an action (e.g., adds an expense)
2. **Service Call**: The relevant service (e.g., expenseService) calls `activityLogService.logEvent()`
3. **Async Logging**: Event is logged asynchronously (fire-and-forget pattern)
4. **Database Insert**: Repository inserts the event into the activity_logs table
5. **Error Handling**: Any logging errors are caught and logged but don't affect the main operation
6. **Scheduled Cleanup**: Daily job removes old events based on retention policy
7. **User Retrieval**: User views recent activity through the Settings->Misc interface

## Components and Interfaces

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

**Field Descriptions:**
- `event_type`: Machine-readable event identifier (e.g., "expense_added", "loan_updated")
- `entity_type`: Type of entity affected (e.g., "expense", "loan", "investment")
- `entity_id`: ID of the specific record (NULL for system-level events)
- `user_action`: Human-readable description (e.g., "Added expense: Groceries - $45.67")
- `metadata`: JSON string with additional context (amount, category, etc.)
- `timestamp`: ISO 8601 timestamp of when the event occurred

### Backend API Endpoints

#### GET /api/activity-logs

Retrieve recent activity events.

**Query Parameters:**
- `limit` (optional, default: 50): Maximum number of events to return
- `offset` (optional, default: 0): Number of events to skip (for pagination)

**Response:**
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

**Response:**
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

### Service Interface

#### activityLogService.js

```javascript
/**
 * Log an activity event (fire-and-forget pattern)
 * @param {string} eventType - Machine-readable event type
 * @param {string} entityType - Type of entity (expense, loan, etc.)
 * @param {number|null} entityId - ID of the entity (null for system events)
 * @param {string} userAction - Human-readable description
 * @param {object} metadata - Additional context data
 * @returns {Promise<void>} - Resolves immediately, errors are logged
 */
async function logEvent(eventType, entityType, entityId, userAction, metadata)

/**
 * Retrieve recent activity events
 * @param {number} limit - Maximum number of events
 * @param {number} offset - Number of events to skip
 * @returns {Promise<{events: Array, total: number}>}
 */
async function getRecentEvents(limit = 50, offset = 0)

/**
 * Clean up old events based on retention policy
 * @returns {Promise<{deletedCount: number, oldestRemaining: string}>}
 */
async function cleanupOldEvents()

/**
 * Get cleanup statistics
 * @returns {Promise<object>} - Stats object
 */
async function getCleanupStats()
```

### Repository Interface

#### activityLogRepository.js

```javascript
/**
 * Insert a new activity log event
 * @param {object} event - Event data
 * @returns {Promise<number>} - Inserted event ID
 */
async function insert(event)

/**
 * Find recent events with pagination
 * @param {number} limit - Maximum number of events
 * @param {number} offset - Number of events to skip
 * @returns {Promise<Array>} - Array of event objects
 */
async function findRecent(limit, offset)

/**
 * Count total events
 * @returns {Promise<number>} - Total event count
 */
async function count()

/**
 * Delete events older than a specific date
 * @param {Date} date - Cutoff date
 * @returns {Promise<number>} - Number of deleted events
 */
async function deleteOlderThan(date)

/**
 * Delete excess events beyond max count (keeps newest)
 * @param {number} maxCount - Maximum events to keep
 * @returns {Promise<number>} - Number of deleted events
 */
async function deleteExcessEvents(maxCount)

/**
 * Get timestamp of oldest event
 * @returns {Promise<string|null>} - ISO timestamp or null
 */
async function getOldestEventTimestamp()
```

### Frontend Component

#### ActivityLogView Component

Located in `BackupSettings.jsx` as a new section in the Misc tab.

**Props:** None (self-contained)

**State:**
- `events`: Array of activity log events
- `loading`: Boolean for loading state
- `displayLimit`: Number of events to display (25, 50, 100, 200)
- `hasMore`: Boolean indicating if more events are available
- `stats`: Cleanup statistics object

**Key Methods:**
- `fetchEvents()`: Load events from API
- `loadMore()`: Fetch additional older events
- `handleLimitChange()`: Update display limit preference
- `formatTimestamp()`: Convert ISO timestamp to human-readable format

## Data Models

### ActivityLogEvent

```typescript
interface ActivityLogEvent {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  user_action: string;
  metadata: object | null;
  timestamp: string; // ISO 8601
}
```

### Event Type Definitions

```javascript
const EVENT_TYPES = {
  // Expenses
  EXPENSE_ADDED: 'expense_added',
  EXPENSE_UPDATED: 'expense_updated',
  EXPENSE_DELETED: 'expense_deleted',
  
  // Fixed Expenses
  FIXED_EXPENSE_ADDED: 'fixed_expense_added',
  FIXED_EXPENSE_UPDATED: 'fixed_expense_updated',
  FIXED_EXPENSE_DELETED: 'fixed_expense_deleted',
  
  // Loans
  LOAN_ADDED: 'loan_added',
  LOAN_UPDATED: 'loan_updated',
  LOAN_DELETED: 'loan_deleted',
  
  // Loan Payments
  LOAN_PAYMENT_ADDED: 'loan_payment_added',
  LOAN_PAYMENT_UPDATED: 'loan_payment_updated',
  LOAN_PAYMENT_DELETED: 'loan_payment_deleted',
  
  // Investments
  INVESTMENT_ADDED: 'investment_added',
  INVESTMENT_UPDATED: 'investment_updated',
  INVESTMENT_DELETED: 'investment_deleted',
  
  // Insurance
  INSURANCE_STATUS_CHANGED: 'insurance_status_changed',
  
  // Budgets
  BUDGET_ADDED: 'budget_added',
  BUDGET_UPDATED: 'budget_updated',
  BUDGET_DELETED: 'budget_deleted',
  
  // Payment Methods
  PAYMENT_METHOD_ADDED: 'payment_method_added',
  PAYMENT_METHOD_UPDATED: 'payment_method_updated',
  PAYMENT_METHOD_DEACTIVATED: 'payment_method_deactivated',
  
  // System Events
  BACKUP_CREATED: 'backup_created',
  BACKUP_RESTORED: 'backup_restored'
};
```

### Entity Type Definitions

```javascript
const ENTITY_TYPES = {
  EXPENSE: 'expense',
  FIXED_EXPENSE: 'fixed_expense',
  LOAN: 'loan',
  LOAN_PAYMENT: 'loan_payment',
  INVESTMENT: 'investment',
  BUDGET: 'budget',
  PAYMENT_METHOD: 'payment_method',
  SYSTEM: 'system'
};
```

### Metadata Examples

**Expense Event:**
```json
{
  "amount": 45.67,
  "category": "Groceries",
  "date": "2025-01-27",
  "place": "Whole Foods"
}
```

**Loan Payment Event:**
```json
{
  "loanName": "Mortgage",
  "amount": 1500.00,
  "paymentDate": "2025-01-15"
}
```

**Insurance Status Change:**
```json
{
  "previousStatus": "In Progress",
  "newStatus": "Paid",
  "place": "Dr. Smith",
  "amount": 150.00
}
```

**Backup Event:**
```json
{
  "filename": "expense_tracker_backup_20250127_143000.db",
  "size": 2048576
}
```

## Correctness Properties


A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Event Storage Round Trip

*For any* valid activity log event with all required fields (event_type, entity_type, user_action), storing the event and then retrieving it should return an equivalent event with all fields preserved including parsed metadata.

**Validates: Requirements 1.1, 1.3, 8.5**

### Property 2: Automatic Timestamp Assignment

*For any* event logged without an explicit timestamp, the stored event should have a timestamp that is within a few seconds of the current time.

**Validates: Requirements 1.2**

### Property 3: Required Field Validation

*For any* event with missing or empty required fields (event_type, entity_type, or user_action), attempting to log the event should fail validation before database insertion.

**Validates: Requirements 1.4, 10.4**

### Property 4: Entity CRUD Event Tracking

*For any* entity type (expense, fixed_expense, loan, investment, budget, payment_method, loan_payment) and any CRUD operation (create, update, delete), performing the operation should result in an activity log event with the correct event_type, entity_type, entity_id, and relevant metadata fields.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1-3.5, 4.1-4.5, 5.1-5.5, 6A.1-6A.5, 6B.1-6B.5, 6C.1-6C.5**

### Property 5: Insurance Status Change Logging

*For any* medical expense with an insurance status, changing the status to a different value should log exactly one event with both old and new status in metadata, but updating the expense without changing status should not log an insurance status change event.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 6: System Event Null Entity ID

*For any* system-level event (backup_created, backup_restored), the logged event should have entity_id set to NULL and should include relevant system metadata (filename, size, etc.).

**Validates: Requirements 6D.1, 6D.2, 6D.3, 6D.4, 6D.5**

### Property 7: Reverse Chronological Ordering

*For any* set of activity log events with different timestamps, retrieving events through the API or displaying them in the UI should return them ordered by timestamp descending (newest first).

**Validates: Requirements 7.2, 8.2**

### Property 8: Timestamp Human Readability

*For any* event timestamp, the displayed format should be human-readable (e.g., "2 hours ago", "Yesterday at 3:45 PM") and should correctly reflect the time difference between the event and the current time.

**Validates: Requirements 7.4**

### Property 9: Event Display Completeness

*For any* displayed activity log event, the rendered output should contain both the user_action text and the formatted timestamp.

**Validates: Requirements 7.3**

### Property 10: API Pagination Limit

*For any* API request with a limit parameter, the response should return at most that many events, and the total count should reflect the actual number of events in the database.

**Validates: Requirements 8.3**

### Property 11: Retention Policy Age-Based Cleanup

*For any* set of events where some are older than the configured retention days, running cleanup should delete all events older than the cutoff date while preserving newer events.

**Validates: Requirements 9.2, 9.3**

### Property 12: Retention Policy Count-Based Cleanup

*For any* set of events exceeding the maximum entry count, running cleanup should delete the oldest events until the count is at or below the maximum, preserving the newest events.

**Validates: Requirements 9.2, 9.3**

### Property 13: Display Limit Persistence

*For any* user-selected display limit (25, 50, 100, 200), changing the limit should save it to local storage, and reloading the view should use the saved preference.

**Validates: Requirements 9A.2, 9A.3**

### Property 14: Visible Event Count Accuracy

*For any* set of displayed events, the count indicator should show the correct number of currently visible events and the total available events.

**Validates: Requirements 9A.4**

### Property 15: Cleanup Statistics Logging

*For any* cleanup operation, the system should log the number of events deleted and the timestamp of the oldest remaining event.

**Validates: Requirements 9B.1, 9B.2**

### Property 16: Logging Failure Resilience

*For any* activity logging operation that fails (database error, validation error, etc.), the failure should not throw an exception to the caller, should log the error for debugging, and should allow the main application flow to continue.

**Validates: Requirements 10.2, 10.3**

### Property 17: Metadata Serialization Round Trip

*For any* JavaScript object passed as metadata, the system should serialize it to JSON for storage, and retrieving the event should return the metadata as an equivalent parsed object.

**Validates: Requirements 10.5**

## Error Handling

### Logging Failures

The activity log system uses a "fail-safe" approach where logging failures never impact the main application:

1. **Try-Catch Wrapping**: All `logEvent()` calls are wrapped in try-catch blocks
2. **Error Logging**: Failures are logged using the application logger for debugging
3. **Silent Failure**: No exceptions are thrown to calling code
4. **Async Fire-and-Forget**: Logging happens asynchronously without blocking

**Example Pattern:**
```javascript
async function logEvent(eventType, entityType, entityId, userAction, metadata) {
  try {
    // Validate required fields
    if (!eventType || !entityType || !userAction) {
      logger.warn('Activity log: Missing required fields', { eventType, entityType, userAction });
      return;
    }
    
    // Insert event
    await activityLogRepository.insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      user_action: userAction,
      metadata: metadata ? JSON.stringify(metadata) : null
    });
  } catch (error) {
    logger.error('Activity log: Failed to log event', { error, eventType, entityType });
    // Do not throw - fail silently
  }
}
```

### API Error Handling

API endpoints follow standard error handling patterns:

1. **400 Bad Request**: Invalid query parameters (negative limit, invalid offset)
2. **500 Internal Server Error**: Database errors, unexpected failures
3. **Empty Results**: Return empty array with total count of 0

### Cleanup Error Handling

Cleanup operations are resilient to failures:

1. **Batch Processing**: Delete events in batches to avoid long locks
2. **Error Logging**: Log failures but continue operation
3. **Scheduled Retry**: Next scheduled run will retry cleanup
4. **No Data Loss**: Failed cleanup doesn't delete any events

### Backup and Restore Integration

Activity logs are included in database backups and restores:

1. **Backup Inclusion**: The `activity_logs` table is part of the SQLite database and is automatically included in all database backups
2. **Restore Behavior**: When a backup is restored, the activity logs are restored to the state they were in at backup time
3. **Event Logging**: Both backup creation and restore operations log their own events to the activity log
4. **Post-Restore State**: After a restore, the activity log will contain:
   - All events from the backup (historical events up to backup time)
   - A new "backup_restored" event documenting the restore operation
5. **Retention Policy**: After restore, the retention policy continues to apply to all events including restored ones

## Testing Strategy

### Dual Testing Approach

The activity log feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of event logging (expense added, loan updated, etc.)
- Edge cases (NULL entity_id, empty metadata, etc.)
- Error conditions (missing required fields, database failures)
- Integration points (expense service → activity log service)
- UI component rendering and interactions

**Property-Based Tests** focus on:
- Universal properties across all event types
- Round-trip serialization of metadata
- Ordering guarantees across random event sets
- Retention policy correctness with various data distributions
- API pagination with random limits and offsets

### Property-Based Testing Configuration

- **Library**: fast-check (JavaScript/Node.js property-based testing library)
- **Iterations**: Minimum 100 iterations per property test
- **Tagging**: Each test references its design property number
- **Tag Format**: `// Feature: activity-log, Property N: [property description]`

### Test Coverage Areas

#### Backend Tests

1. **Repository Layer** (`activityLogRepository.test.js`, `activityLogRepository.pbt.test.js`)
   - Insert operations with various field combinations
   - Query operations with pagination
   - Cleanup operations (age-based and count-based)
   - Property: Round-trip storage and retrieval
   - Property: Ordering guarantees
   - Property: Cleanup correctness

2. **Service Layer** (`activityLogService.test.js`, `activityLogService.pbt.test.js`)
   - Event logging with validation
   - Metadata serialization
   - Error handling and resilience
   - Cleanup scheduling and execution
   - Property: Metadata serialization round-trip
   - Property: Logging failure resilience
   - Property: Retention policy enforcement

3. **Controller Layer** (`activityLogController.test.js`, `activityLogController.pbt.test.js`)
   - API endpoint responses
   - Query parameter handling
   - Error responses
   - Property: API pagination correctness
   - Property: Response ordering

4. **Integration Tests** (`activityLog.integration.test.js`)
   - Expense creation → event logging
   - Loan update → event logging
   - Insurance status change → event logging
   - Backup creation → event logging
   - End-to-end flow from service call to database

#### Frontend Tests

1. **Component Tests** (`ActivityLogView.test.jsx`, `ActivityLogView.pbt.test.jsx`)
   - Event list rendering
   - Display limit selector
   - Load More functionality
   - Timestamp formatting
   - Property: Display completeness
   - Property: Timestamp human readability
   - Property: Display limit persistence

2. **Integration Tests** (`ActivityLogView.integration.test.jsx`)
   - API calls and data loading
   - Error handling and loading states
   - User interactions (limit change, load more)

### Example Property Test

```javascript
// Feature: activity-log, Property 4: Entity CRUD Event Tracking
describe('Property 4: Entity CRUD Event Tracking', () => {
  it('should log correct events for any entity CRUD operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('expense', 'loan', 'investment', 'budget'),
        fc.constantFrom('create', 'update', 'delete'),
        fc.record({
          id: fc.integer({ min: 1, max: 10000 }),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          amount: fc.double({ min: 0.01, max: 10000, noNaN: true })
        }),
        async (entityType, operation, entityData) => {
          // Perform the operation
          const entityId = await performOperation(entityType, operation, entityData);
          
          // Retrieve the logged event
          const events = await activityLogService.getRecentEvents(1, 0);
          
          // Verify event properties
          expect(events.events).toHaveLength(1);
          const event = events.events[0];
          expect(event.event_type).toBe(`${entityType}_${operation}d`);
          expect(event.entity_type).toBe(entityType);
          expect(event.entity_id).toBe(entityId);
          expect(event.metadata).toMatchObject({
            name: entityData.name,
            amount: entityData.amount
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Data Management

- **In-Memory Database**: Tests use in-memory SQLite for speed
- **Test Isolation**: Each test gets a fresh database instance
- **Cleanup**: afterEach hooks clean up test data
- **Fixtures**: Reusable test data generators for common scenarios

### Manual Testing Checklist

Before deployment, manually verify:

- [ ] Activity log view displays in Settings->Misc tab
- [ ] Events appear after performing actions (add expense, update loan, etc.)
- [ ] Timestamps are formatted correctly and update appropriately
- [ ] Display limit selector works and persists preference
- [ ] Load More button fetches additional events
- [ ] Retention policy information is displayed
- [ ] No errors in browser console during normal operation
- [ ] Logging failures don't break main application functionality
