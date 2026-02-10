# Design Document: Settings and System Modal Split

## Overview

This design describes the refactoring of the monolithic `BackupSettings` component into two focused modal components: `SettingsModal` (user-facing settings) and `SystemModal` (system information and tools). The split improves code organization, maintainability, and follows the single responsibility principle while preserving all existing functionality.

### Current State

The `BackupSettings` component (1219 lines JSX, 1385 lines CSS) manages five distinct tabs:
- **Backups**: Automatic backup configuration and manual backup operations
- **Restore**: Database restore from backup files
- **People**: Family member management for medical expense tracking
- **Misc**: Data management tools and activity log
- **About**: Version information, database statistics, and changelog

### Target State

**SettingsModal** - User-facing configuration (3 tabs):
- Backups
- Restore
- People

**SystemModal** - System information and tools (2 tabs):
- Misc (tools + activity log)
- About (version + stats + changelog)

## Architecture

### Component Hierarchy

```
App.jsx
├── ModalContext.Provider
│   ├── SettingsModal (when showSettingsModal === true)
│   │   ├── TabNavigation (Backups, Restore, People)
│   │   ├── BackupsTab
│   │   ├── RestoreTab
│   │   └── PeopleTab
│   │
│   └── SystemModal (when showSystemModal === true)
│       ├── TabNavigation (Misc, About)
│       ├── MiscTab
│       │   ├── DataManagementTools
│       │   └── ActivityLogSection
│       └── AboutTab
│           ├── VersionInfo
│           ├── DatabaseStats
│           └── Changelog
```

### File Structure

```
frontend/src/components/
├── SettingsModal.jsx          # User settings modal (Backups, Restore, People)
├── SettingsModal.css           # Styles for SettingsModal
├── SystemModal.jsx             # System info modal (Misc, About)
├── SystemModal.css             # Styles for SystemModal
├── ActivityLogTable.jsx        # Extracted activity log component
├── ActivityLogTable.css        # Activity log table styles
└── [deprecated] BackupSettings.jsx  # To be removed after migration
```

### Shared Utilities

```
frontend/src/hooks/
├── useTabState.js              # Shared tab management hook
└── useActivityLog.js           # Activity log data fetching hook

frontend/src/utils/
└── timeFormatters.js           # Relative time formatting utilities
```

## Components and Interfaces

### SettingsModal Component

**Purpose**: Manages user-facing configuration settings (backups, restore, people).

**Props**: None (uses ModalContext for visibility)

**State**:
```javascript
{
  activeTab: 'backups' | 'restore' | 'people',

  // Backup state
  config: {
    enabled: boolean,
    schedule: string,
    time: string,
    targetPath: string,
    keepLastN: number
  },
  backups: Array<BackupFile>,
  nextBackup: string | null,
  message: { text: string, type: 'success' | 'error' | 'info' },
  loading: boolean,

  // People state
  people: Array<Person>,
  editingPerson: number | 'new' | null,
  personFormData: { name: string, dateOfBirth: string },
  personValidationErrors: Object,
  deleteConfirm: Person | null,
  peopleLoading: boolean,
  peopleError: string | null
}
```

**Key Methods**:
- `fetchConfig()` - Load backup configuration
- `fetchBackupList()` - Load backup file list
- `handleSave()` - Save backup settings
- `handleManualBackup()` - Trigger manual backup
- `handleRestoreBackup(file)` - Restore from backup file
- `fetchPeople()` - Load family members
- `handleSavePerson()` - Create/update person
- `handleDeletePerson(id)` - Delete person

**Integration**:
- Uses `useModalContext()` for `showSettingsModal`, `closeSettingsModal`
- Dispatches `peopleUpdated` event when people change
- Uses `useTabState('backups')` for tab management

### SystemModal Component

**Purpose**: Displays system information, tools, and activity logs.

**Props**: None (uses ModalContext for visibility)

**State**:
```javascript
{
  activeTab: 'misc' | 'about',

  // Misc tab state
  showPlaceNameStandardization: boolean,

  // Activity log state (via useActivityLog hook)
  activityEvents: Array<ActivityEvent>,
  activityLoading: boolean,
  activityError: string | null,
  displayLimit: number,
  hasMore: boolean,
  activityStats: {
    currentCount: number,
    retentionDays: number,
    maxEntries: number
  } | null,

  // About tab state
  versionInfo: {
    version: string,
    environment: string,
    docker: {
      tag: string,
      buildDate: string,
      commit: string
    }
  } | null,
  dbStats: {
    expenseCount: number,
    invoiceCount: number,
    paymentMethodCount: number,
    databaseSizeMB: number,
    // ... other stats
  } | null
}
```

**Key Methods**:
- `fetchVersionInfo()` - Load version information
- `fetchDbStats()` - Load database statistics
- `fetchActivityEvents(offset, limit)` - Load activity log events
- `fetchActivityStats()` - Load activity log statistics
- `handleDisplayLimitChange(limit)` - Change activity log display limit
- `handleLoadMore()` - Load more activity events

**Integration**:
- Uses `useModalContext()` for `showSystemModal`, `closeSystemModal`
- Uses `useTabState('misc')` for tab management
- Uses `useActivityLog()` for activity log data management

### ActivityLogTable Component

**Purpose**: Reusable activity log display with pagination and filtering.

**Props**:
```typescript
interface ActivityLogTableProps {
  events: Array<ActivityEvent>;
  loading: boolean;
  error: string | null;
  displayLimit: number;
  hasMore: boolean;
  stats: ActivityStats | null;
  onDisplayLimitChange: (limit: number) => void;
  onLoadMore: () => void;
}

interface ActivityEvent {
  id: number;
  user_action: string;
  timestamp: string;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  metadata: Object | null;
}

interface ActivityStats {
  currentCount: number;
  retentionDays: number;
  maxEntries: number;
}
```

**Rendering**:
- Table with columns: Action, Timestamp
- Event type badges with color coding
- Relative time formatting ("2 hours ago", "Yesterday at 3:45 PM")
- Load More button when `hasMore === true`
- Event count display
- Retention policy information

**Styling**:
- Responsive table layout
- Hover effects on rows
- Badge color coding by event type
- Loading and error states

## Data Models

### BackupConfig
```typescript
interface BackupConfig {
  enabled: boolean;
  schedule: 'daily';
  time: string;          // HH:MM format
  targetPath: string;    // Absolute path or empty for default
  keepLastN: number;     // 1-365
  nextBackup?: string;   // ISO timestamp
}
```

### BackupFile
```typescript
interface BackupFile {
  name: string;
  size: number;          // Bytes
  created: string;       // ISO timestamp
}
```

### Person
```typescript
interface Person {
  id: number;
  name: string;
  dateOfBirth: string | null;  // YYYY-MM-DD or null
}
```

### ActivityEvent
```typescript
interface ActivityEvent {
  id: number;
  user_action: string;   // Human-readable description
  timestamp: string;     // ISO timestamp
  event_type: string;    // e.g., 'expense_created', 'backup_created'
  entity_type: string;   // e.g., 'expense', 'backup'
  entity_id: number | null;
  metadata: Object | null;
}
```

### VersionInfo
```typescript
interface VersionInfo {
  version: string;       // e.g., "5.10.0"
  environment: string;   // e.g., "production"
  docker?: {
    tag: string;
    buildDate: string;
    commit: string;
  };
}
```

### DatabaseStats
```typescript
interface DatabaseStats {
  expenseCount: number;
  invoiceCount: number;
  paymentMethodCount: number;
  statementCount: number;
  creditCardPaymentCount: number;
  databaseSizeMB: number;
  invoiceStorageSizeMB: number;
  totalBackupSizeMB: number;
  backupCount: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tab Content Correspondence
*For any* modal (SettingsModal or SystemModal) and any valid tab selection, activating a tab should display the corresponding content panel and hide all other content panels.

**Validates: Requirements 2.3**

### Property 2: Modal Context Integration
*For any* modal (SettingsModal or SystemModal), calling the modal's open handler from ModalContext should make the modal visible, and calling the close handler should hide the modal.

**Validates: Requirements 3.2**

### Property 3: Activity Log Table Structure
*For any* non-empty array of activity events, rendering the ActivityLogTable should produce a table with exactly two columns (Action and Timestamp) and one row per event.

**Validates: Requirements 4.1**

### Property 4: Relative Time Formatting
*For any* valid ISO timestamp, the formatted relative time should be deterministic and follow the pattern: "Just now" (< 1 min), "X minutes ago" (< 1 hour), "X hours ago" (< 24 hours), "Yesterday at HH:MM" (yesterday), "X days ago" (< 7 days), or full date/time (≥ 7 days).

**Validates: Requirements 4.2**

### Property 5: Load More Button Visibility
*For any* activity log state, the "Load More" button should be visible if and only if `hasMore === true` and `loading === false`.

**Validates: Requirements 4.3**

### Property 6: Event Type Badge Color Consistency
*For any* event type string, the badge color should be deterministic and consistent across all views (same event type always produces same color).

**Validates: Requirements 5.1**

### Property 7: Tab State Hook Behavior
*For any* initial tab value and sequence of tab changes, the useTabState hook should always return the most recently set tab value and preserve it in localStorage.

**Validates: Requirements 6.2**

### Property 8: Modal Rendering Integration
*For any* modal context state, when `showSettingsModal === true` the SettingsModal should be rendered, and when `showSystemModal === true` the SystemModal should be rendered.

**Validates: Requirements 8.1**

## Error Handling

### Backup Operations
- **Network Errors**: Display error message, allow retry
- **Invalid Configuration**: Validate before save, show field-specific errors
- **Backup Creation Failure**: Show error message with details
- **Restore Failure**: Show error message, do not reload page

### People Management
- **Validation Errors**: Show inline field errors
- **API Errors**: Display error banner with retry option
- **Delete Conflicts**: Show confirmation modal with warning
- **Network Errors**: Preserve form state, allow retry

### Activity Log
- **Fetch Errors**: Display error message with retry button
- **Empty State**: Show friendly "No activity" message
- **Pagination Errors**: Disable Load More button, show error

### System Information
- **Version Fetch Failure**: Silently fail, don't block UI
- **Stats Fetch Failure**: Silently fail, don't block UI
- **Partial Data**: Display available data, hide missing sections

## Testing Strategy

### Unit Tests
Unit tests verify specific examples, edge cases, and error conditions. Focus on:

**SettingsModal**:
- Tab switching behavior
- Backup configuration validation
- Manual backup flow
- Restore file validation
- People CRUD operations
- Form validation logic
- Error message display

**SystemModal**:
- Tab switching behavior
- Activity log pagination
- Display limit changes
- Version info display
- Database stats display
- Changelog rendering

**ActivityLogTable**:
- Empty state rendering
- Event list rendering
- Load More button visibility
- Relative time formatting edge cases
- Badge color mapping
- Error state display

**Hooks**:
- `useTabState`: Initial value, tab changes, localStorage persistence
- `useActivityLog`: Data fetching, pagination, error handling

### Property-Based Tests
Property tests verify universal properties across all inputs. Each test should run a minimum of 100 iterations. Each property test must reference its design document property using the tag format: **Feature: settings-system-split, Property {number}: {property_text}**

**Property 1 Test**: Generate random tab selections for both modals, verify correct content panel is displayed.

**Property 2 Test**: Generate random sequences of open/close operations, verify modal visibility matches context state.

**Property 3 Test**: Generate random arrays of activity events, verify table structure (2 columns, N rows).

**Property 4 Test**: Generate random timestamps (past and recent), verify relative time format follows the specified pattern.

**Property 5 Test**: Generate random activity log states (varying hasMore and loading), verify Load More button visibility logic.

**Property 6 Test**: Generate random event types, verify badge colors are deterministic and consistent.

**Property 7 Test**: Generate random sequences of tab changes, verify useTabState returns correct value and persists to localStorage.

**Property 8 Test**: Generate random modal context states, verify correct modals are rendered.

### Integration Tests
- SettingsModal + ModalContext: Open/close via context
- SystemModal + ModalContext: Open/close via context
- ActivityLogTable + useActivityLog: Data flow and pagination
- People management + global event dispatch: peopleUpdated event
- Backup operations + API: Full backup/restore flow

### Migration Validation
- All existing BackupSettings tests pass with new components
- No visual regressions (screenshot comparison)
- All functionality accessible from new modals
- No broken references to BackupSettings

## CSS Organization

### SettingsModal.css
**Sections**:
- Modal container and overlay
- Tab navigation (shared pattern)
- Backups tab styles
- Restore tab styles
- People tab styles
- Form controls and validation
- Button styles
- Message banners
- Responsive breakpoints

**Extracted from BackupSettings.css**:
- `.backup-settings` → `.settings-modal`
- `.settings-tabs` (reused)
- `.tab-button` (reused)
- `.settings-section` (reused)
- Backup-specific styles
- Restore-specific styles
- People-specific styles

### SystemModal.css
**Sections**:
- Modal container and overlay
- Tab navigation (shared pattern)
- Misc tab styles
- Activity log styles (if not extracted)
- About tab styles
- Version info styles
- Database stats styles
- Changelog styles
- Responsive breakpoints

**Extracted from BackupSettings.css**:
- `.backup-settings` → `.system-modal`
- `.settings-tabs` (reused)
- `.tab-button` (reused)
- `.settings-section` (reused)
- Misc tools styles
- Activity log styles
- Version/stats/changelog styles

### ActivityLogTable.css
**Sections**:
- Table container
- Table header and rows
- Event type badges
- Timestamp formatting
- Load More button
- Event count display
- Retention info
- Loading and error states
- Responsive table layout

**Extracted from BackupSettings.css**:
- `.activity-log-header`
- `.activity-log-controls`
- `.activity-event-list`
- `.activity-event-item`
- `.activity-event-action`
- `.activity-event-timestamp`
- `.activity-load-more`
- `.activity-retention-info`

### Shared Styles
Both modals share common patterns:
- Tab navigation structure
- Settings section cards
- Form controls
- Button styles
- Message banners
- Loading states

Consider extracting to `ModalShared.css` or using CSS variables for consistency.

## Integration with ModalContext

### Context Updates

Add to `ModalContext.jsx`:

```javascript
// State
const [showSettingsModal, setShowSettingsModal] = useState(false);
const [showSystemModal, setShowSystemModal] = useState(false);

// Handlers
const openSettingsModal = useCallback(() => setShowSettingsModal(true), []);
const closeSettingsModal = useCallback(() => setShowSettingsModal(false), []);
const openSystemModal = useCallback(() => setShowSystemModal(true), []);
const closeSystemModal = useCallback(() => setShowSystemModal(false), []);

// Add to closeAllOverlays
const closeAllOverlays = useCallback(() => {
  // ... existing closes
  setShowSettingsModal(false);
  setShowSystemModal(false);
}, []);

// Add to context value
const value = useMemo(() => ({
  // ... existing values
  showSettingsModal,
  showSystemModal,
  openSettingsModal,
  closeSettingsModal,
  openSystemModal,
  closeSystemModal,
}), [/* dependencies */]);
```

### App.jsx Updates

Replace BackupSettings rendering:

```javascript
// Remove
{showBackupSettings && (
  <BackupSettings onClose={closeBackupSettings} />
)}

// Add
{showSettingsModal && <SettingsModal />}
{showSystemModal && <SystemModal />}
```

### Navigation Updates

Update all references that open BackupSettings:
- Settings button in header/menu → `openSettingsModal()`
- System info links → `openSystemModal()`
- Activity log links → `openSystemModal()` with tab='misc'

## Shared Functionality Extraction

### useTabState Hook

**Purpose**: Manage tab state with localStorage persistence.

**Interface**:
```javascript
function useTabState(
  storageKey: string,
  defaultTab: string
): [string, (tab: string) => void]

// Usage
const [activeTab, setActiveTab] = useTabState('settings-modal-tab', 'backups');
```

**Implementation**:
- Load initial tab from localStorage or use default
- Save tab changes to localStorage
- Return current tab and setter function

### useActivityLog Hook

**Purpose**: Manage activity log data fetching and pagination.

**Interface**:
```javascript
function useActivityLog(initialLimit: number = 50): {
  events: Array<ActivityEvent>;
  loading: boolean;
  error: string | null;
  displayLimit: number;
  hasMore: boolean;
  stats: ActivityStats | null;
  setDisplayLimit: (limit: number) => void;
  loadMore: () => void;
  refresh: () => void;
}
```

**Implementation**:
- Fetch events on mount and when limit changes
- Fetch stats on mount
- Handle pagination (offset-based)
- Manage loading and error states
- Persist display limit to localStorage

### Time Formatting Utilities

**Purpose**: Format timestamps as relative time.

**Interface**:
```javascript
function formatRelativeTime(isoTimestamp: string): string

// Examples:
formatRelativeTime('2024-01-15T10:30:00Z') // "2 hours ago"
formatRelativeTime('2024-01-14T15:45:00Z') // "Yesterday at 3:45 PM"
formatRelativeTime('2024-01-10T12:00:00Z') // "5 days ago"
formatRelativeTime('2024-01-01T08:00:00Z') // "Jan 1 at 8:00 AM"
```

**Implementation**:
- Calculate time difference from now
- Apply formatting rules based on difference
- Handle edge cases (future dates, invalid dates)

## Migration Strategy

### Phase 1: Create New Components
1. Create `SettingsModal.jsx` with Backups, Restore, People tabs
2. Create `SystemModal.jsx` with Misc, About tabs
3. Extract `ActivityLogTable.jsx` component
4. Create corresponding CSS files
5. Implement shared hooks (`useTabState`, `useActivityLog`)

### Phase 2: Update ModalContext
1. Add `showSettingsModal` and `showSystemModal` state
2. Add open/close handlers
3. Update `closeAllOverlays` to include new modals
4. Update context value and dependencies

### Phase 3: Update App.jsx
1. Import new modal components
2. Replace BackupSettings rendering with new modals
3. Update navigation/button handlers
4. Test modal opening/closing

### Phase 4: Migrate Tests
1. Copy relevant tests from BackupSettings.test.jsx
2. Update test imports and component names
3. Add new property-based tests
4. Verify all tests pass

### Phase 5: Cleanup
1. Move BackupSettings to archive/deprecated-components/
2. Remove BackupSettings imports from App.jsx
3. Update documentation
4. Remove BackupSettings.test.jsx after verification

## Performance Considerations

### Code Splitting
- SettingsModal and SystemModal can be lazy-loaded
- ActivityLogTable can be lazy-loaded within SystemModal
- Reduces initial bundle size

### Data Fetching
- Fetch activity log only when Misc tab is active
- Fetch version/stats only when About tab is active
- Cache activity log data to avoid refetching on tab switch

### Rendering Optimization
- Use React.memo for ActivityLogTable
- Memoize event list rendering
- Debounce display limit changes
- Virtualize activity log if event count is very large (future enhancement)

## Accessibility

### Keyboard Navigation
- Tab key navigates between tabs
- Enter/Space activates tab
- Escape closes modal
- Focus trap within modal

### Screen Readers
- Tab navigation uses proper ARIA roles
- Activity log table uses semantic HTML
- Form labels properly associated
- Error messages announced

### Visual
- Sufficient color contrast for badges
- Focus indicators on all interactive elements
- Reduced motion support for animations
- Responsive text sizing

## Future Enhancements

### Activity Log Filtering
- Filter by event type
- Filter by entity type
- Date range filtering
- Search by action text

### Activity Log Export
- Export to CSV
- Export to JSON
- Date range selection for export

### Settings Import/Export
- Export all settings to JSON
- Import settings from JSON
- Backup settings with database

### Activity Log Virtualization
- Implement virtual scrolling for large event lists
- Improve performance with 1000+ events
- Reduce memory usage

### Real-time Activity Updates
- WebSocket connection for live updates
- Toast notifications for new events
- Auto-refresh activity log
