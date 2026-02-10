# Design Document: Activity Log Retention Configuration

## Overview

This feature adds user-configurable retention policy settings for the activity log system. Users will be able to adjust how long activity events are kept (max age in days) and how many events to retain (max count) through a new settings section in the Misc tab of the Settings UI.

The design follows the existing architecture patterns:
- **Backend**: New settings table, repository, service, controller, and routes
- **Frontend**: New settings section in BackupSettings.jsx component
- **Integration**: Activity log service reads from settings instead of hardcoded constants

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         BackupSettings.jsx (Misc Tab)                  │ │
│  │  - Retention Settings Form                             │ │
│  │  - Current Stats Display                               │ │
│  │  - Save/Cancel Actions                                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           │ HTTP (GET/PUT)                   │
│                           ▼                                  │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                      Backend (Express)                       │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  activityLogRoutes.js                                 │  │
│  │  - GET /api/activity-logs/settings                    │  │
│  │  - PUT /api/activity-logs/settings                    │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  activityLogController.js                             │  │
│  │  - getSettings()                                      │  │
│  │  - updateSettings()                                   │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  settingsService.js (NEW)                             │  │
│  │  - getRetentionSettings()                             │  │
│  │  - updateRetentionSettings()                          │  │
│  │  - DEFAULT_SETTINGS constant                          │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  settingsRepository.js (NEW)                          │  │
│  │  - getSetting(key)                                    │  │
│  │  - setSetting(key, value)                             │  │
│  │  - getMultiple(keys)                                  │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  Database (SQLite)                                    │  │
│  │  - settings table                                     │  │
│  │    * key (TEXT PRIMARY KEY)                           │  │
│  │    * value (TEXT)                                     │  │
│  │    * updated_at (TEXT)                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  activityLogService.js (MODIFIED)                     │  │
│  │  - cleanupOldEvents() - reads from settings           │  │
│  │  - getCleanupStats() - includes settings info         │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Settings Retrieval**:
   - User opens Settings → Misc tab
   - Frontend calls GET /api/activity-logs/settings
   - Controller → Service → Repository → Database
   - Returns current settings or defaults if none exist

2. **Settings Update**:
   - User modifies retention values and clicks Save
   - Frontend validates input client-side
   - Frontend calls PUT /api/activity-logs/settings with new values
   - Controller validates input server-side
   - Service updates settings via repository
   - Database transaction commits
   - Activity log service uses new values on next cleanup

3. **Cleanup Job**:
   - Cron job triggers at 2:00 AM daily
   - activityLogService.cleanupOldEvents() called
   - Service reads retention settings from settingsService
   - Deletes events based on configured max_age_days and max_count
   - Logs cleanup results

## Components and Interfaces

### Database Schema

#### New Table: settings

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Keys used for retention policy:**
- `activity_log_max_age_days`: Integer (7-365)
- `activity_log_max_count`: Integer (100-10000)

### Backend Components

#### settingsRepository.js (NEW)

```javascript
/**
 * Get a setting value by key
 * @param {string} key - Setting key
 * @returns {Promise<string|null>} - Setting value or null if not found
 */
async function getSetting(key);

/**
 * Set a setting value
 * @param {string} key - Setting key
 * @param {string} value - Setting value (stored as string)
 * @returns {Promise<void>}
 */
async function setSetting(key, value);

/**
 * Get multiple settings at once
 * @param {string[]} keys - Array of setting keys
 * @returns {Promise<Object>} - Map of key -> value
 */
async function getMultiple(keys);
```

#### settingsService.js (NEW)

```javascript
const DEFAULT_SETTINGS = {
  maxAgeDays: 90,
  maxCount: 1000
};

/**
 * Get retention policy settings
 * @returns {Promise<{maxAgeDays: number, maxCount: number}>}
 */
async function getRetentionSettings();

/**
 * Update retention policy settings
 * @param {number} maxAgeDays - Max age in days (7-365)
 * @param {number} maxCount - Max event count (100-10000)
 * @returns {Promise<{maxAgeDays: number, maxCount: number}>}
 * @throws {Error} - If validation fails
 */
async function updateRetentionSettings(maxAgeDays, maxCount);

/**
 * Validate retention settings
 * @param {number} maxAgeDays
 * @param {number} maxCount
 * @throws {Error} - If validation fails
 */
function validateRetentionSettings(maxAgeDays, maxCount);
```

#### activityLogController.js (MODIFIED)

Add new controller methods:

```javascript
/**
 * GET /api/activity-logs/settings
 * Get current retention policy settings
 */
async function getSettings(req, res);

/**
 * PUT /api/activity-logs/settings
 * Update retention policy settings
 * Body: { maxAgeDays: number, maxCount: number }
 */
async function updateSettings(req, res);
```

#### activityLogService.js (MODIFIED)

Modify existing service to read from settings:

```javascript
/**
 * Clean up old events based on retention policy from settings
 * @returns {Promise<{deletedCount: number, oldestRemaining: string|null}>}
 */
async function cleanupOldEvents() {
  // Read retention settings from settingsService
  const settings = await settingsService.getRetentionSettings();
  
  // Use settings.maxAgeDays and settings.maxCount instead of hardcoded values
  // ... rest of cleanup logic
}

/**
 * Get cleanup statistics including current settings
 * @returns {Promise<object>}
 */
async function getCleanupStats() {
  // Include current settings in stats response
  const settings = await settingsService.getRetentionSettings();
  
  return {
    retentionDays: settings.maxAgeDays,
    maxEntries: settings.maxCount,
    currentCount,
    oldestEventTimestamp,
    lastCleanupRun,
    lastCleanupDeletedCount
  };
}
```

#### activityLogRoutes.js (MODIFIED)

Add new routes:

```javascript
router.get('/settings', activityLogController.getSettings);
router.put('/settings', activityLogController.updateSettings);
```

### Frontend Components

#### BackupSettings.jsx (MODIFIED)

Add new state and functions in the Misc tab section:

```javascript
// State for retention settings
const [retentionSettings, setRetentionSettings] = useState({
  maxAgeDays: 90,
  maxCount: 1000
});
const [retentionLoading, setRetentionLoading] = useState(false);
const [retentionError, setRetentionError] = useState(null);
const [retentionMessage, setRetentionMessage] = useState({ text: '', type: '' });
const [retentionValidationErrors, setRetentionValidationErrors] = useState({});

// Fetch retention settings when Misc tab is active
useEffect(() => {
  if (activeTab === 'misc') {
    fetchRetentionSettings();
  }
}, [activeTab]);

/**
 * Fetch current retention settings
 */
async function fetchRetentionSettings();

/**
 * Validate retention settings client-side
 * @returns {boolean} - True if valid
 */
function validateRetentionSettings();

/**
 * Handle retention setting input change
 * @param {string} field - Field name (maxAgeDays or maxCount)
 * @param {string} value - New value
 */
function handleRetentionInputChange(field, value);

/**
 * Save retention settings
 */
async function handleSaveRetentionSettings();
```

#### UI Layout in Misc Tab

```jsx
{/* Retention Policy Settings Section */}
<div className="settings-section">
  <h3>📋 Activity Log Retention Policy</h3>
  <p>Configure how long activity events are kept before automatic cleanup.</p>
  
  {retentionError && (
    <div className="message error">{retentionError}</div>
  )}
  
  {retentionMessage.text && (
    <div className={`message ${retentionMessage.type}`}>
      {retentionMessage.text}
    </div>
  )}
  
  <div className="retention-settings-form">
    <div className="form-group">
      <label htmlFor="retention-max-age">Maximum Age (days)</label>
      <input
        id="retention-max-age"
        type="number"
        min="7"
        max="365"
        value={retentionSettings.maxAgeDays}
        onChange={(e) => handleRetentionInputChange('maxAgeDays', e.target.value)}
        disabled={retentionLoading}
      />
      <small className="field-hint">
        Keep events for this many days (7-365)
      </small>
      {retentionValidationErrors.maxAgeDays && (
        <span className="validation-error">
          {retentionValidationErrors.maxAgeDays}
        </span>
      )}
    </div>
    
    <div className="form-group">
      <label htmlFor="retention-max-count">Maximum Count</label>
      <input
        id="retention-max-count"
        type="number"
        min="100"
        max="10000"
        value={retentionSettings.maxCount}
        onChange={(e) => handleRetentionInputChange('maxCount', e.target.value)}
        disabled={retentionLoading}
      />
      <small className="field-hint">
        Keep this many events regardless of age (100-10000)
      </small>
      {retentionValidationErrors.maxCount && (
        <span className="validation-error">
          {retentionValidationErrors.maxCount}
        </span>
      )}
    </div>
    
    <div className="form-actions">
      <button
        onClick={handleSaveRetentionSettings}
        disabled={retentionLoading}
        className="save-button"
      >
        {retentionLoading ? 'Saving...' : 'Save Retention Settings'}
      </button>
    </div>
  </div>
  
  {/* Impact visualization */}
  {activityStats && (
    <div className="retention-impact-info">
      <p>
        <strong>Current Status:</strong> {activityStats.currentCount} events stored
      </p>
      {activityStats.oldestEventTimestamp && (
        <p>
          <strong>Oldest Event:</strong> {formatTimestamp(activityStats.oldestEventTimestamp)}
        </p>
      )}
    </div>
  )}
</div>

{/* Activity Log Section - Table Layout */}
<div className="settings-section">
  <div className="activity-log-header">
    <h3>📋 Recent Activity</h3>
    <div className="activity-log-controls">
      <label htmlFor="activity-display-limit">Show:</label>
      <select
        id="activity-display-limit"
        value={displayLimit}
        onChange={handleDisplayLimitChange}
        disabled={activityLoading}
        className="activity-limit-selector"
      >
        <option value="25">25 events</option>
        <option value="50">50 events</option>
        <option value="100">100 events</option>
        <option value="200">200 events</option>
      </select>
    </div>
  </div>

  {activityError && (
    <div className="activity-error">{activityError}</div>
  )}

  {activityLoading && activityEvents.length === 0 ? (
    <div className="activity-loading">Loading recent activity...</div>
  ) : activityEvents.length === 0 ? (
    <div className="activity-empty">
      <p>No recent activity to display.</p>
    </div>
  ) : (
    <>
      <div className="activity-table-container">
        <table className="activity-table">
          <thead>
            <tr>
              <th className="activity-col-time">Time</th>
              <th className="activity-col-type">Event Type</th>
              <th className="activity-col-details">Details</th>
            </tr>
          </thead>
          <tbody>
            {activityEvents.map((event) => (
              <tr key={event.id} className="activity-table-row">
                <td className="activity-col-time">
                  {formatTimestamp(event.timestamp)}
                </td>
                <td className="activity-col-type">
                  <span className={`event-type-badge event-type-${event.entity_type}`}>
                    {formatEventType(event.event_type)}
                  </span>
                </td>
                <td className="activity-col-details">
                  {event.user_action}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="activity-load-more">
          <button
            onClick={handleLoadMore}
            disabled={activityLoading}
            className="activity-load-more-button"
          >
            {activityLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      <div className="activity-event-count">
        Showing {activityEvents.length} of {activityStats?.currentCount || activityEvents.length} events
      </div>
    </>
  )}
</div>
```

## Data Models

### Settings Model

```typescript
interface Setting {
  key: string;           // Primary key
  value: string;         // Stored as string, parsed as needed
  updated_at: string;    // ISO timestamp
}
```

### Retention Settings Model

```typescript
interface RetentionSettings {
  maxAgeDays: number;    // 7-365
  maxCount: number;      // 100-10000
}
```

### API Request/Response Models

#### GET /api/activity-logs/settings Response

```json
{
  "maxAgeDays": 90,
  "maxCount": 1000
}
```

#### PUT /api/activity-logs/settings Request

```json
{
  "maxAgeDays": 60,
  "maxCount": 500
}
```

#### PUT /api/activity-logs/settings Response (Success)

```json
{
  "maxAgeDays": 60,
  "maxCount": 500,
  "message": "Retention settings updated successfully"
}
```

#### PUT /api/activity-logs/settings Response (Error)

```json
{
  "error": "Validation failed: maxAgeDays must be between 7 and 365"
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all acceptance criteria, I've identified the following redundancies:

**Redundant Properties:**
- Criteria 2.4 and 7.1-7.2 (max_age_days validation) can be combined into one comprehensive validation property
- Criteria 2.5 and 7.3-7.4 (max_count validation) can be combined into one comprehensive validation property
- Criteria 2.3 and 8.3 are identical (response structure) - only need one property
- Criteria 1.3 and 6.2 are identical (default values fallback) - only need one example test

**Combined Properties:**
- Single property for range validation covering both min and max for both fields
- Single property for settings persistence (round-trip)
- Single property for cleanup behavior based on settings

### Correctness Properties

**Property 1: Settings Persistence Round-Trip**
*For any* valid retention settings (maxAgeDays in 7-365, maxCount in 100-10000), updating the settings and then retrieving them should return the same values.
**Validates: Requirements 1.5, 2.7**

**Property 2: Range Validation for Max Age Days**
*For any* integer value, when updating maxAgeDays, values in the range [7, 365] should be accepted and values outside this range should be rejected with a 400 error.
**Validates: Requirements 2.4, 7.1, 7.2**

**Property 3: Range Validation for Max Count**
*For any* integer value, when updating maxCount, values in the range [100, 10000] should be accepted and values outside this range should be rejected with a 400 error.
**Validates: Requirements 2.5, 7.3, 7.4**

**Property 4: Settings Response Structure**
*For any* GET request to /api/activity-logs/settings, the response should always contain both maxAgeDays and maxCount fields with integer values.
**Validates: Requirements 2.3, 8.3**

**Property 5: Validation Error Messages**
*For any* invalid settings update request, the system should return a 400 status code with a descriptive error message indicating which field failed validation and why.
**Validates: Requirements 2.6**

**Property 6: Client-Side Validation**
*For any* input value outside the valid range, the UI should display a validation error and prevent form submission.
**Validates: Requirements 3.4, 7.6**

**Property 7: Age-Based Cleanup**
*For any* configured maxAgeDays value, when cleanup runs, all events with timestamps older than (current_date - maxAgeDays) should be deleted.
**Validates: Requirements 5.2**

**Property 8: Count-Based Cleanup**
*For any* configured maxCount value, when the total event count exceeds maxCount after age-based cleanup, the oldest events should be deleted until the count equals maxCount.
**Validates: Requirements 5.3**

**Property 9: Integer Storage and Retrieval**
*For any* integer value stored in the settings table, retrieving it should return the same integer value (not a string or other type).
**Validates: Requirements 1.4**

**Property 10: Impact Calculation Accuracy**
*For any* set of activity events and retention settings, the calculated "events affected by policy" should equal the number of events that would be deleted if cleanup ran immediately.
**Validates: Requirements 4.3**

**Property 11: Timestamp Formatting Consistency**
*For any* valid ISO timestamp, the human-readable age calculation should correctly represent the time difference in appropriate units (minutes, hours, days).
**Validates: Requirements 4.4**

## Error Handling

### Backend Error Scenarios

1. **Invalid Input Validation**
   - Missing required fields (maxAgeDays or maxCount)
   - Non-numeric values
   - Values outside valid ranges
   - Response: 400 Bad Request with descriptive error message

2. **Database Errors**
   - Settings table doesn't exist (auto-create via migration)
   - Database connection failure
   - Transaction failure during update
   - Response: 500 Internal Server Error, log error details

3. **Settings Service Errors**
   - Failed to read settings from database
   - Failed to parse stored values
   - Fallback: Use default values (90 days, 1000 events)
   - Log warning and continue operation

4. **Cleanup Job Errors**
   - Failed to read retention settings
   - Failed to delete old events
   - Log error and retry on next scheduled run
   - Do not crash the application

### Frontend Error Scenarios

1. **Network Errors**
   - Failed to fetch settings
   - Failed to update settings
   - Display error message to user
   - Retry button for fetch operations

2. **Validation Errors**
   - Client-side validation before submission
   - Display inline validation errors
   - Disable save button until valid

3. **API Error Responses**
   - Parse error message from response
   - Display user-friendly error message
   - Maintain form state for correction

### Error Recovery

1. **Settings Load Failure**
   - Display error message in UI
   - Provide retry button
   - Show default values as fallback

2. **Settings Update Failure**
   - Display error message with details
   - Keep form in editable state
   - Allow user to retry or cancel

3. **Database Migration Failure**
   - Log detailed error
   - Application should still start
   - Settings feature disabled until migration succeeds

## Testing Strategy

### Backend Testing

#### Unit Tests

**settingsRepository.js:**
- Test getSetting returns correct value for existing key
- Test getSetting returns null for non-existent key
- Test setSetting creates new setting
- Test setSetting updates existing setting
- Test getMultiple returns map of all requested keys
- Test database errors are handled gracefully

**settingsService.js:**
- Test getRetentionSettings returns stored values
- Test getRetentionSettings returns defaults when no settings exist
- Test updateRetentionSettings validates input ranges
- Test updateRetentionSettings rejects invalid maxAgeDays
- Test updateRetentionSettings rejects invalid maxCount
- Test updateRetentionSettings persists valid values
- Test validation error messages are descriptive

**activityLogController.js:**
- Test getSettings endpoint returns 200 with settings
- Test updateSettings endpoint validates request body
- Test updateSettings endpoint returns 400 for invalid input
- Test updateSettings endpoint returns 200 with updated settings
- Test error responses include descriptive messages

**activityLogService.js (modified):**
- Test cleanupOldEvents reads settings from settingsService
- Test cleanupOldEvents uses configured maxAgeDays
- Test cleanupOldEvents uses configured maxCount
- Test getCleanupStats includes current settings

#### Property-Based Tests

**Property 1: Settings Persistence Round-Trip** (100+ iterations)
- Generate random valid settings (maxAgeDays: 7-365, maxCount: 100-10000)
- Update settings via service
- Retrieve settings via service
- Assert retrieved values match updated values
- **Feature: activity-log-retention-config, Property 1: Settings persistence round-trip**

**Property 2: Range Validation for Max Age Days** (100+ iterations)
- Generate random integers (including values outside valid range)
- Attempt to update maxAgeDays
- Assert values in [7, 365] are accepted
- Assert values outside range are rejected with error
- **Feature: activity-log-retention-config, Property 2: Range validation for max age days**

**Property 3: Range Validation for Max Count** (100+ iterations)
- Generate random integers (including values outside valid range)
- Attempt to update maxCount
- Assert values in [100, 10000] are accepted
- Assert values outside range are rejected with error
- **Feature: activity-log-retention-config, Property 3: Range validation for max count**

**Property 4: Settings Response Structure** (100+ iterations)
- Generate random valid settings
- Update settings
- Retrieve settings via API
- Assert response contains maxAgeDays and maxCount fields
- Assert both fields are integers
- **Feature: activity-log-retention-config, Property 4: Settings response structure**

**Property 7: Age-Based Cleanup** (100+ iterations)
- Generate random maxAgeDays value (7-365)
- Generate random set of activity events with various timestamps
- Run cleanup with configured maxAgeDays
- Assert all events older than (now - maxAgeDays) are deleted
- Assert events within maxAgeDays are retained
- **Feature: activity-log-retention-config, Property 7: Age-based cleanup**

**Property 8: Count-Based Cleanup** (100+ iterations)
- Generate random maxCount value (100-10000)
- Generate random set of activity events (count > maxCount)
- Run cleanup with configured maxCount
- Assert total remaining events equals maxCount
- Assert oldest events were deleted first
- **Feature: activity-log-retention-config, Property 8: Count-based cleanup**

**Property 9: Integer Storage and Retrieval** (100+ iterations)
- Generate random integer values
- Store as settings
- Retrieve settings
- Assert retrieved values are integers (not strings)
- Assert values match exactly
- **Feature: activity-log-retention-config, Property 9: Integer storage and retrieval**

### Frontend Testing

#### Unit Tests

**BackupSettings.jsx (Retention Settings Section):**
- Test retention settings form renders with current values
- Test input fields are bound to state
- Test validation errors display for invalid input
- Test save button is disabled during save operation
- Test success message displays after successful save
- Test error message displays after failed save
- Test impact visualization displays current stats
- Test settings are fetched when Misc tab becomes active

#### Property-Based Tests

**Property 6: Client-Side Validation** (100+ iterations)
- Generate random input values (including invalid ones)
- Simulate user input in form fields
- Assert validation errors appear for invalid values
- Assert save button is disabled when validation fails
- **Feature: activity-log-retention-config, Property 6: Client-side validation**

**Property 10: Impact Calculation Accuracy** (100+ iterations)
- Generate random activity events with various timestamps
- Generate random retention settings
- Calculate impact (events that would be deleted)
- Assert calculation matches actual cleanup behavior
- **Feature: activity-log-retention-config, Property 10: Impact calculation accuracy**

**Property 11: Timestamp Formatting Consistency** (100+ iterations)
- Generate random ISO timestamps (various ages)
- Format as human-readable age
- Assert format uses appropriate units (minutes/hours/days)
- Assert calculations are accurate
- **Feature: activity-log-retention-config, Property 11: Timestamp formatting consistency**

#### Integration Tests

- Test full flow: fetch settings → modify → save → verify persistence
- Test settings update triggers stats refresh
- Test error handling for network failures
- Test default values are used when settings don't exist
- Test cleanup job uses updated settings on next run

### Test Configuration

- **Minimum iterations per property test**: 100
- **Backend test framework**: Jest with fast-check
- **Frontend test framework**: Vitest with fast-check and @testing-library/react
- **Test database**: Isolated SQLite database per test suite
- **Property test tags**: Include feature name and property number in test descriptions

### Edge Cases to Test

1. **Empty database**: No settings table exists
2. **Partial settings**: Only one setting exists (maxAgeDays or maxCount)
3. **Boundary values**: Test exact min/max values (7, 365, 100, 10000)
4. **Zero and negative values**: Should be rejected
5. **Non-integer values**: Floats, strings, null, undefined
6. **Very large values**: Test upper bounds enforcement
7. **Concurrent updates**: Multiple simultaneous settings updates
8. **Cleanup during settings update**: Race condition handling
9. **Database transaction rollback**: Ensure atomicity
10. **Settings load failure**: Fallback to defaults

## Implementation Notes

### Database Migration

The settings table will be created via a new migration in `backend/database/migrations.js`:

```javascript
async function migration_add_settings_table(db) {
  const migrationName = 'add_settings_table';
  const applied = await checkMigrationApplied(db, migrationName);
  
  if (applied) {
    logger.info('Migration already applied:', migrationName);
    return;
  }
  
  logger.info('Running migration:', migrationName);
  
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  await markMigrationApplied(db, migrationName);
  logger.info('Migration completed:', migrationName);
}
```

### Settings Service Implementation Details

- Settings are stored as strings in the database
- Service layer handles parsing to integers
- Validation happens at service layer before persistence
- Default values are returned when settings don't exist
- No caching - always read from database for consistency

### Activity Log Service Integration

- Remove hardcoded RETENTION_POLICY constant
- Add dependency on settingsService
- Read settings at the start of cleanupOldEvents()
- Pass settings to cleanup logic
- Update getCleanupStats() to include current settings

### Frontend State Management

- Settings state is local to BackupSettings component
- Fetch settings when Misc tab becomes active
- Optimistic UI updates not used (wait for server confirmation)
- Form validation before API call
- Clear validation errors on successful save

### API Endpoint Configuration

Add to `frontend/src/config.js`:

```javascript
ACTIVITY_LOG_SETTINGS: `${API_BASE_URL}/activity-logs/settings`,
```

### CSS Styling

Reuse existing form styles from BackupSettings.css:
- `.settings-section` for section container
- `.form-group` for input groups
- `.field-hint` for help text
- `.validation-error` for error messages
- `.save-button` for save button
- `.message` for success/error messages

Add new styles for retention-specific elements:
- `.retention-settings-form` for form container
- `.retention-impact-info` for impact visualization

Add new styles for activity log table:
- `.activity-table-container` for table wrapper with overflow handling
- `.activity-table` for table base styles
- `.activity-col-time` for time column (fixed width, ~150px)
- `.activity-col-type` for event type column (fixed width, ~180px)
- `.activity-col-details` for details column (flexible width)
- `.activity-table-row` for row hover effects
- `.event-type-badge` for styled event type badges
- `.event-type-{entity_type}` for entity-specific badge colors (expense, loan, budget, payment_method, system, etc.)

## Security Considerations

1. **Input Validation**
   - Server-side validation is mandatory
   - Client-side validation is for UX only
   - Reject non-integer values
   - Enforce min/max constraints

2. **SQL Injection Prevention**
   - Use parameterized queries for all database operations
   - Never concatenate user input into SQL strings

3. **Rate Limiting**
   - Settings updates are subject to general API rate limiting (500 req/min)
   - No special rate limiting needed for this feature

4. **Authorization**
   - No authentication in this application (local network use)
   - All users can modify settings
   - Consider adding authentication in future versions

5. **Data Integrity**
   - Use database transactions for atomic updates
   - Validate data types before storage
   - Handle concurrent updates gracefully

## Performance Considerations

1. **Settings Retrieval**
   - Simple key-value lookup (O(1) with primary key)
   - No caching needed - database is fast enough
   - Settings are read infrequently (on tab open, on cleanup)

2. **Settings Update**
   - Single transaction with two updates
   - Minimal database overhead
   - No impact on other operations

3. **Cleanup Job**
   - Reads settings once per run
   - Cleanup performance unchanged
   - Settings read adds negligible overhead

4. **Frontend Rendering**
   - Settings form is simple (two inputs)
   - No complex calculations
   - Impact stats already computed by backend

## Deployment Considerations

1. **Database Migration**
   - Migration runs automatically on application start
   - No downtime required
   - Backward compatible with existing installations

2. **Default Values**
   - Maintain current behavior (90 days, 1000 events)
   - Users can opt-in to different values
   - No breaking changes

3. **Rollback Plan**
   - If issues arise, settings table can be dropped
   - Application will fall back to hardcoded defaults
   - No data loss risk

4. **Monitoring**
   - Log all settings changes
   - Monitor cleanup job execution
   - Alert on cleanup failures

## Future Enhancements

1. **Per-Entity Retention Policies**
   - Different retention for expenses vs loans vs budgets
   - More granular control

2. **Retention Policy Presets**
   - "Minimal" (30 days, 500 events)
   - "Standard" (90 days, 1000 events)
   - "Extended" (180 days, 5000 events)
   - "Maximum" (365 days, 10000 events)

3. **Cleanup Schedule Configuration**
   - Allow users to configure cleanup time
   - Currently hardcoded to 2:00 AM

4. **Activity Log Export**
   - Export events before cleanup
   - Archive old events to file

5. **Activity Log Search and Filtering**
   - Search by entity type, event type, date range
   - Filter by specific entities

6. **Settings History**
   - Track who changed settings and when
   - Audit trail for compliance
