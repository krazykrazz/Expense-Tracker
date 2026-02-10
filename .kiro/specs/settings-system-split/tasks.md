# Implementation Plan: Settings and System Modal Split

## Overview

This plan refactors the monolithic BackupSettings component (1219 lines JSX, 1385 lines CSS) into two focused modals: SettingsModal (user settings) and SystemModal (system info/tools). The implementation preserves all existing functionality while improving code organization and maintainability.

## Tasks

- [x] 1. Create shared utilities and hooks
  - [x] 1.1 Create useTabState hook for tab management with localStorage
    - Implement hook in `frontend/src/hooks/useTabState.js`
    - Accept storageKey and defaultTab parameters
    - Load initial tab from localStorage or use default
    - Save tab changes to localStorage
    - Return [activeTab, setActiveTab] tuple
    - _Requirements: 6.2_
  
  - [x] 1.2 Write property test for useTabState hook
    - **Property 7: Tab State Hook Behavior**
    - **Validates: Requirements 6.2**
  
  - [x] 1.3 Create useActivityLog hook for activity log data management
    - Implement hook in `frontend/src/hooks/useActivityLog.js`
    - Fetch events on mount and when limit changes
    - Fetch stats on mount
    - Handle pagination with offset-based loading
    - Manage loading and error states
    - Persist display limit to localStorage
    - Return events, loading, error, displayLimit, hasMore, stats, setDisplayLimit, loadMore, refresh
    - _Requirements: 4.1, 4.3_
  
  - [x] 1.4 Create time formatting utilities
    - Implement formatRelativeTime in `frontend/src/utils/timeFormatters.js`
    - Calculate time difference from now
    - Apply formatting rules: "Just now", "X minutes ago", "X hours ago", "Yesterday at HH:MM", "X days ago", full date/time
    - Handle edge cases (future dates, invalid dates)
    - _Requirements: 4.2_
  
  - [x] 1.5 Write property test for formatRelativeTime
    - **Property 4: Relative Time Formatting**
    - **Validates: Requirements 4.2**

- [x] 2. Create ActivityLogTable component
  - [x] 2.1 Implement ActivityLogTable component
    - Create `frontend/src/components/ActivityLogTable.jsx`
    - Accept props: events, loading, error, displayLimit, hasMore, stats, onDisplayLimitChange, onLoadMore
    - Render table with Action and Timestamp columns
    - Display event type badges with color coding
    - Format timestamps using formatRelativeTime
    - Show Load More button when hasMore is true
    - Display event count and retention policy info
    - Handle loading and error states
    - _Requirements: 4.1, 4.2, 4.3, 5.1_
  
  - [x] 2.2 Create ActivityLogTable.css
    - Extract activity log styles from BackupSettings.css
    - Style table layout, headers, rows
    - Style event type badges with color coding
    - Style Load More button
    - Style event count and retention info
    - Add responsive breakpoints
    - _Requirements: 5.1, 7.1_
  
  - [x] 2.3 Write property test for ActivityLogTable structure
    - **Property 3: Activity Log Table Structure**
    - **Validates: Requirements 4.1**
  
  - [x] 2.4 Write property test for Load More button visibility
    - **Property 5: Load More Button Visibility**
    - **Validates: Requirements 4.3**
  
  - [x] 2.5 Write property test for event type badge color consistency
    - **Property 6: Event Type Badge Color Consistency**
    - **Validates: Requirements 5.1**
  
  - [x] 2.6 Write unit tests for ActivityLogTable
    - Test empty state rendering
    - Test event list rendering
    - Test error state display
    - Test loading state
    - _Requirements: 4.1, 4.3_

- [x] 3. Create SettingsModal component
  - [x] 3.1 Implement SettingsModal component structure
    - Create `frontend/src/components/SettingsModal.jsx`
    - Set up modal container with close handler from ModalContext
    - Implement tab navigation for Backups, Restore, People
    - Use useTabState hook for tab management
    - Set up state for backup config, backups list, people list
    - _Requirements: 1.1, 2.1, 3.2_
  
  - [x] 3.2 Implement Backups tab
    - Extract backup configuration form from BackupSettings
    - Implement fetchConfig, fetchBackupList methods
    - Implement handleSave, handleManualBackup, handleDownloadBackup methods
    - Display backup list with file info
    - Show next backup time when enabled
    - _Requirements: 2.1_
  
  - [x] 3.3 Implement Restore tab
    - Extract restore functionality from BackupSettings
    - Implement handleRestoreBackup method
    - Show warning message
    - Accept .tar.gz and .db files
    - Show confirmation dialog before restore
    - _Requirements: 2.1_
  
  - [x] 3.4 Implement People tab
    - Extract people management from BackupSettings
    - Implement fetchPeople, handleSavePerson, handleDeletePerson methods
    - Implement person form with validation
    - Show people list with edit/delete actions
    - Show delete confirmation modal
    - Dispatch peopleUpdated event on changes
    - _Requirements: 2.1_
  
  - [x] 3.5 Create SettingsModal.css
    - Extract relevant styles from BackupSettings.css
    - Style modal container and overlay
    - Style tab navigation
    - Style Backups tab (forms, buttons, backup list)
    - Style Restore tab (warning, file upload)
    - Style People tab (form, list, delete modal)
    - Add responsive breakpoints
    - _Requirements: 7.1, 7.2_
  
  - [x] 3.6 Write property test for tab content correspondence
    - **Property 1: Tab Content Correspondence**
    - **Validates: Requirements 2.3**
  
  - [x] 3.7 Write unit tests for SettingsModal
    - Test tab switching
    - Test backup configuration save
    - Test manual backup flow
    - Test restore file validation
    - Test people CRUD operations
    - Test form validation
    - _Requirements: 2.1, 2.3_

- [x] 4. Create SystemModal component
  - [x] 4.1 Implement SystemModal component structure
    - Create `frontend/src/components/SystemModal.jsx`
    - Set up modal container with close handler from ModalContext
    - Implement tab navigation for Misc, About
    - Use useTabState hook for tab management
    - Set up state for version info, db stats, place name tool visibility
    - _Requirements: 1.1, 2.2, 3.2_
  
  - [x] 4.2 Implement Misc tab
    - Extract data management tools section from BackupSettings
    - Integrate ActivityLogTable component
    - Use useActivityLog hook for data management
    - Show PlaceNameStandardization tool when opened
    - _Requirements: 2.2, 4.1, 4.2, 4.3_
  
  - [x] 4.3 Implement About tab
    - Extract version info, database stats, changelog from BackupSettings
    - Implement fetchVersionInfo, fetchDbStats methods
    - Display version information
    - Display database statistics
    - Display changelog with recent updates
    - _Requirements: 2.2_
  
  - [x] 4.4 Create SystemModal.css
    - Extract relevant styles from BackupSettings.css
    - Style modal container and overlay
    - Style tab navigation
    - Style Misc tab (tools section, activity log integration)
    - Style About tab (version info, stats, changelog)
    - Add responsive breakpoints
    - _Requirements: 7.1, 7.2_
  
  - [x] 4.5 Write property test for tab content correspondence
    - **Property 1: Tab Content Correspondence**
    - **Validates: Requirements 2.3**
  
  - [x] 4.6 Write unit tests for SystemModal
    - Test tab switching
    - Test activity log integration
    - Test version info display
    - Test database stats display
    - Test changelog rendering
    - _Requirements: 2.2, 2.3_

- [x] 5. Update ModalContext
  - [x] 5.1 Add state and handlers for new modals
    - Add showSettingsModal, setShowSettingsModal state
    - Add showSystemModal, setShowSystemModal state
    - Add openSettingsModal, closeSettingsModal handlers
    - Add openSystemModal, closeSystemModal handlers
    - Update closeAllOverlays to include new modals
    - Add new values to context value object
    - _Requirements: 3.1, 3.2_
  
  - [x] 5.2 Write property test for modal context integration
    - **Property 2: Modal Context Integration**
    - **Validates: Requirements 3.2**
  
  - [x] 5.3 Write unit tests for ModalContext updates
    - Test openSettingsModal sets showSettingsModal to true
    - Test closeSettingsModal sets showSettingsModal to false
    - Test openSystemModal sets showSystemModal to true
    - Test closeSystemModal sets showSystemModal to false
    - Test closeAllOverlays closes both new modals
    - _Requirements: 3.1, 3.2_

- [x] 6. Integrate new modals in App.jsx
  - [x] 6.1 Import new modal components
    - Import SettingsModal from './components/SettingsModal'
    - Import SystemModal from './components/SystemModal'
    - Remove BackupSettings import
    - _Requirements: 8.1, 8.2_
  
  - [x] 6.2 Update modal rendering
    - Replace BackupSettings rendering with SettingsModal
    - Add SystemModal rendering
    - Use showSettingsModal and showSystemModal from ModalContext
    - _Requirements: 8.1_
  
  - [x] 6.3 Update navigation handlers
    - Update settings button to call openSettingsModal
    - Add system info button to call openSystemModal
    - Update any other references to BackupSettings
    - _Requirements: 8.2_
  
  - [x] 6.4 Write property test for modal rendering integration
    - **Property 8: Modal Rendering Integration**
    - **Validates: Requirements 8.1**
  
  - [x] 6.5 Write integration tests for App.jsx modal rendering
    - Test SettingsModal renders when showSettingsModal is true
    - Test SystemModal renders when showSystemModal is true
    - Test modals close when close handlers are called
    - _Requirements: 8.1_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Migration and cleanup
  - [x] 8.1 Migrate existing tests
    - Copy relevant tests from BackupSettings.test.jsx
    - Update test imports to use SettingsModal and SystemModal
    - Update test assertions for new component structure
    - Verify all migrated tests pass
    - _Requirements: 1.2_
  
  - [x] 8.2 Move BackupSettings to archive
    - Move BackupSettings.jsx to archive/deprecated-components/
    - Move BackupSettings.css to archive/deprecated-components/
    - Move BackupSettings.test.jsx to archive/deprecated-components/
    - Add README.md in archive explaining deprecation
    - _Requirements: 8.2_
  
  - [x] 8.3 Update documentation
    - Update component documentation to reference new modals
    - Update user guide if BackupSettings is mentioned
    - Update developer documentation with new component structure
    - _Requirements: 8.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are mandatory for complete implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The split preserves all existing functionality while improving organization
- Both modals integrate with ModalContext for consistent state management
- Shared hooks (useTabState, useActivityLog) reduce code duplication
- ActivityLogTable is reusable and can be used in other contexts
- CSS organization follows existing modal patterns for consistency

