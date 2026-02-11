# Design Document: Version Upgrade Tracking

## Overview

This feature adds automatic version upgrade detection and logging to the expense tracker application. When the backend server starts, it compares the current application version with the last known version stored in the settings table. If a version change is detected, it logs a "version_upgraded" event to the activity log with metadata about the old and new versions. Additionally, the frontend displays a changelog modal on first page load after an upgrade, showing users what changed in the new version.

The implementation follows the existing fire-and-forget activity logging pattern and leverages the existing settings infrastructure for version persistence. The frontend uses localStorage to track which version the user has acknowledged, preventing repeated modal displays.

## Architecture

### Backend Components

1. **Version Check Service** (`backend/services/versionCheckService.js`)
   - Retrieves current version from package.json
   - Compares with stored version from settings
   - Logs upgrade events via activityLogService
   - Updates stored version after logging

2. **Settings Service Extension** (`backend/services/settingsService.js`)
   - Add methods for getting/setting "last_known_version"
   - Reuse existing settings infrastructure

3. **Server Startup Integration** (`backend/server.js`)
   - Call version check during initialization
   - Execute after database initialization, before HTTP server starts
   - Use fire-and-forget pattern (don't block startup on errors)

### Frontend Components

1. **Version Upgrade Modal** (`frontend/src/components/VersionUpgradeModal.jsx`)
   - Display changelog from BackupSettings.jsx
   - Show new version number prominently
   - Store acknowledgment in localStorage
   - Auto-display on first load after upgrade

2. **App.jsx Integration**
   - Check for version upgrades on mount
   - Compare current version with localStorage "last_seen_version"
   - Display modal if upgrade detected and not yet acknowledged

3. **Activity Log UI Extension** (`frontend/src/components/ActivityLogTable.jsx`)
   - Add rendering for "version_upgraded" event type
   - Format as "Upgraded from vX.Y.Z to vA.B.C"
   - Use system event styling

## Components and Interfaces

### Backend Service: versionCheckService

```javascript
/**
 * Check for version upgrades and log to activity log
 * Called during server startup
 * @returns {Promise<void>}
 */
async function checkAndLogVersionUpgrade()

/**
 * Get current application version from package.json
 * @returns {string} - Version string (e.g., "5.10.0")
 */
function getCurrentVersion()

/**
 * Get last known version from settings
 * @returns {Promise<string|null>} - Version string or null if not set
 */
async function getLastKnownVersion()

/**
 * Update last known version in settings
 * @param {string} version - Version string to store
 * @returns {Promise<void>}
 */
async function updateLastKnownVersion(version)
```

### Settings Service Extension

```javascript
/**
 * Get last known application version
 * @returns {Promise<string|null>} - Version string or null
 */
async function getLastKnownVersion()

/**
 * Set last known application version
 * @param {string} version - Version string
 * @returns {Promise<void>}
 */
async function setLastKnownVersion(version)
```

### Frontend Component: VersionUpgradeModal

```jsx
/**
 * Modal that displays changelog after version upgrade
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {string} newVersion - New version number
 * @param {Array} changelogEntries - Changelog entries to display
 */
function VersionUpgradeModal({ isOpen, onClose, newVersion, changelogEntries })
```

### Frontend Hook: useVersionUpgradeCheck

```javascript
/**
 * Hook to check for version upgrades on app load
 * @returns {Object} - { showModal, newVersion, changelogEntries, handleClose }
 */
function useVersionUpgradeCheck()
```

## Data Models

### Settings Table Entry

```
key: "last_known_version"
value: "5.10.0" (string)
```

### Activity Log Event

```javascript
{
  event_type: "version_upgraded",
  entity_type: "system",
  entity_id: null,
  user_action: "Application upgraded from v5.9.0 to v5.10.0",
  metadata: {
    old_version: "5.9.0",
    new_version: "5.10.0"
  },
  timestamp: "2025-01-27T10:30:00.000Z"
}
```

### LocalStorage Entry

```
key: "last_seen_version"
value: "5.10.0" (string)
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Version Persistence Round Trip

*For any* valid semantic version string, storing it as the last known version and then retrieving it should return the same version string.

**Validates: Requirements 1.1, 1.3**

### Property 2: First Startup Initialization

*For any* application startup where no "last_known_version" exists in settings, the version check should initialize the setting with the current version and NOT log an upgrade event.

**Validates: Requirements 1.2, 2.4**

### Property 3: Same Version Idempotence

*For any* application restart where the current version equals the stored version, no upgrade event should be logged and the stored version should remain unchanged.

**Validates: Requirements 2.2, 6.1, 6.3**

### Property 4: Upgrade Event Metadata Completeness

*For any* version upgrade event logged to the activity log, the metadata must contain both "old_version" and "new_version" fields with non-empty string values.

**Validates: Requirements 3.4, 3.5**

### Property 5: Upgrade Event System Classification

*For any* version upgrade event, the entity_type must be "system" and entity_id must be null.

**Validates: Requirements 3.2, 3.3**

### Property 6: Fire-and-Forget Resilience

*For any* version check execution, if the activity log service fails, the application startup should continue without throwing errors.

**Validates: Requirements 3.6, 3.7**

### Property 7: Frontend Acknowledgment Persistence

*For any* version string stored in localStorage as "last_seen_version", retrieving it should return the same version string, and the upgrade modal should not display for that version on subsequent page loads.

**Validates: Requirements 7.5, 7.6**

### Property 8: First-Time User Behavior

*For any* user with no "last_seen_version" in localStorage, the upgrade modal should NOT display regardless of the current application version.

**Validates: Requirements 7.8**

## Error Handling

### Backend Error Scenarios

1. **Settings Service Failure**
   - If getLastKnownVersion fails: Log warning, treat as first startup (don't log upgrade)
   - If setLastKnownVersion fails: Log error, continue startup (fire-and-forget)

2. **Activity Log Service Failure**
   - If logEvent fails: Already handled by activityLogService (logs error, doesn't throw)
   - Version check continues, updates stored version

3. **Malformed Version Strings**
   - If package.json version is missing/invalid: Log error, skip version check
   - If stored version is malformed: Treat as first startup

### Frontend Error Scenarios

1. **Version API Failure**
   - If /api/version fails: Log error, don't show modal
   - Gracefully degrade (app continues to function)

2. **LocalStorage Unavailable**
   - If localStorage is blocked: Log warning, don't show modal
   - Prevents repeated modal displays in privacy-focused browsers

3. **Changelog Data Missing**
   - If changelog entries can't be extracted: Show modal with version number only
   - Provide fallback message: "See changelog for details"

## Testing Strategy

### Unit Tests

**Backend:**
- Test versionCheckService.getCurrentVersion() returns package.json version
- Test versionCheckService with no stored version (first startup)
- Test versionCheckService with same version (no upgrade)
- Test versionCheckService with different version (upgrade detected)
- Test error handling when settings service fails
- Test error handling when activity log service fails
- Test malformed version string handling

**Frontend:**
- Test VersionUpgradeModal renders correctly with changelog data
- Test VersionUpgradeModal close handler updates localStorage
- Test useVersionUpgradeCheck with no localStorage value (first-time user)
- Test useVersionUpgradeCheck with same version (no modal)
- Test useVersionUpgradeCheck with different version (show modal)
- Test ActivityLogTable renders version_upgraded events correctly

### Property-Based Tests

Each property test should run a minimum of 100 iterations and be tagged with the property number and text.

**Backend:**
- Property 1: Version persistence round trip (generate random semver strings)
- Property 2: First startup initialization (verify no event logged)
- Property 3: Same version idempotence (repeated startups with same version)
- Property 4: Upgrade event metadata completeness (verify metadata structure)
- Property 5: Upgrade event system classification (verify entity_type and entity_id)
- Property 6: Fire-and-forget resilience (simulate activity log failures)

**Frontend:**
- Property 7: Frontend acknowledgment persistence (generate random versions)
- Property 8: First-time user behavior (verify no modal without localStorage)

### Integration Tests

- Test full startup flow: database init → version check → HTTP server start
- Test version upgrade flow end-to-end: upgrade → log event → display in UI
- Test frontend modal flow: detect upgrade → show modal → close → verify localStorage
- Test activity log UI displays version_upgraded events with correct formatting

## Implementation Notes

### Version Source Centralization

The current version is retrieved from `backend/package.json` using `require('../package.json').version`. This is the same source used by the `/api/version` endpoint in `healthRoutes.js`, ensuring consistency.

### Fire-and-Forget Pattern

The version check follows the existing activity log pattern:
- Errors are logged but don't throw
- Startup continues even if version check fails
- No blocking operations

### Startup Timing

The version check executes in the `initializeDatabase().then()` callback in `server.js`, after database initialization but before the HTTP server starts listening. This ensures:
- Database is ready for settings queries
- Version check completes before handling requests
- No impact on server startup time (async, non-blocking)

### Frontend Changelog Integration

The changelog data is extracted from `BackupSettings.jsx` which already maintains an in-app changelog. The modal component will:
- Import or reference the same changelog structure
- Display the most recent entry (matching the new version)
- Provide a link to view full changelog in Settings

### LocalStorage Key Naming

Using `last_seen_version` (not `last_known_version`) to distinguish:
- Backend: `last_known_version` = last version that ran
- Frontend: `last_seen_version` = last version user acknowledged

This prevents confusion and allows independent tracking.
