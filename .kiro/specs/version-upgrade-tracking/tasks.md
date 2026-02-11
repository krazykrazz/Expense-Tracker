# Implementation Plan: Version Upgrade Tracking

## Overview

This implementation adds automatic version upgrade detection and logging to the expense tracker. The backend detects version changes on startup and logs them to the activity log. The frontend displays a changelog modal on first page load after an upgrade. The implementation follows existing patterns for activity logging, settings persistence, and modal UI.

## Tasks

- [ ] 1. Backend: Create version check service
  - Create `backend/services/versionCheckService.js`
  - Implement `getCurrentVersion()` to read from package.json
  - Implement `getLastKnownVersion()` using settingsService
  - Implement `updateLastKnownVersion(version)` using settingsService
  - Implement `checkAndLogVersionUpgrade()` main function
  - Use fire-and-forget pattern (log errors, don't throw)
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2_

- [ ]* 1.1 Write property test for version persistence round trip
  - **Property 1: Version Persistence Round Trip**
  - **Validates: Requirements 1.1, 1.3**

- [ ]* 1.2 Write property test for first startup initialization
  - **Property 2: First Startup Initialization**
  - **Validates: Requirements 1.2, 2.4**

- [ ]* 1.3 Write property test for upgrade event metadata completeness
  - **Property 4: Upgrade Event Metadata Completeness**
  - **Validates: Requirements 3.4, 3.5**

- [ ]* 1.4 Write property test for upgrade event system classification
  - **Property 5: Upgrade Event System Classification**
  - **Validates: Requirements 3.2, 3.3**

- [ ]* 1.5 Write property test for fire-and-forget resilience
  - **Property 6: Fire-and-Forget Resilience**
  - **Validates: Requirements 3.6, 3.7**

- [ ]* 1.6 Write unit tests for error handling
  - Test malformed version strings
  - Test settings service failures
  - Test activity log service failures
  - _Requirements: 5.4_

- [ ] 2. Backend: Extend settings service for version storage
  - Add `getLastKnownVersion()` method to settingsService
  - Add `setLastKnownVersion(version)` method to settingsService
  - Use setting key "last_known_version"
  - Return null if setting doesn't exist
  - _Requirements: 1.1, 1.3, 1.4_

- [ ]* 2.1 Write unit tests for settings service extension
  - Test getting non-existent version (returns null)
  - Test setting and getting version
  - Test version persistence
  - _Requirements: 1.1, 1.4_

- [ ] 3. Backend: Integrate version check into server startup
  - Modify `backend/server.js` in `initializeDatabase().then()` callback
  - Call `versionCheckService.checkAndLogVersionUpgrade()`
  - Execute after database init, before HTTP server starts
  - Use async/await with try-catch (log errors, don't block startup)
  - _Requirements: 2.5, 6.4_

- [ ]* 3.1 Write integration test for startup flow
  - Test version check executes during startup
  - Test startup continues even if version check fails
  - _Requirements: 2.5, 3.7, 6.4_

- [ ] 4. Backend: Add activity log event for version upgrades
  - In versionCheckService, call `activityLogService.logEvent()`
  - Use event_type: "version_upgraded"
  - Use entity_type: "system", entity_id: null
  - Use user_action: "Application upgraded from vX.Y.Z to vA.B.C"
  - Include metadata: { old_version, new_version }
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ]* 4.1 Write property test for same version idempotence
  - **Property 3: Same Version Idempotence**
  - **Validates: Requirements 2.2, 6.1, 6.3**

- [ ] 5. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Frontend: Create version upgrade modal component
  - Create `frontend/src/components/VersionUpgradeModal.jsx`
  - Create `frontend/src/components/VersionUpgradeModal.css`
  - Accept props: isOpen, onClose, newVersion, changelogEntries
  - Display new version number prominently
  - Render changelog entries (from BackupSettings.jsx structure)
  - Call onClose when user clicks close button
  - Use modal styling consistent with other modals
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ]* 6.1 Write unit tests for VersionUpgradeModal
  - Test modal renders with version and changelog
  - Test close button calls onClose handler
  - Test modal doesn't render when isOpen is false
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 7. Frontend: Create version upgrade check hook
  - Create `frontend/src/hooks/useVersionUpgradeCheck.js`
  - Fetch current version from /api/version on mount
  - Read "last_seen_version" from localStorage
  - Compare versions to detect upgrade
  - Return { showModal, newVersion, changelogEntries, handleClose }
  - handleClose updates localStorage and closes modal
  - Handle first-time users (no localStorage) - don't show modal
  - _Requirements: 7.5, 7.6, 7.7, 7.8_

- [ ]* 7.1 Write property test for frontend acknowledgment persistence
  - **Property 7: Frontend Acknowledgment Persistence**
  - **Validates: Requirements 7.5, 7.6**

- [ ]* 7.2 Write property test for first-time user behavior
  - **Property 8: First-Time User Behavior**
  - **Validates: Requirements 7.8**

- [ ]* 7.3 Write unit tests for useVersionUpgradeCheck hook
  - Test with no localStorage (first-time user)
  - Test with same version (no modal)
  - Test with different version (show modal)
  - Test handleClose updates localStorage
  - Test API failure handling
  - _Requirements: 7.5, 7.6, 7.7, 7.8_

- [ ] 8. Frontend: Integrate modal into App.jsx
  - Import VersionUpgradeModal and useVersionUpgradeCheck
  - Call useVersionUpgradeCheck() in App component
  - Render VersionUpgradeModal with hook values
  - Extract changelog entries from BackupSettings.jsx (or create shared constant)
  - _Requirements: 7.1, 7.4_

- [ ]* 8.1 Write integration test for App.jsx modal integration
  - Test modal appears on upgrade detection
  - Test modal doesn't appear for first-time users
  - Test modal doesn't appear after acknowledgment
  - _Requirements: 7.4, 7.6, 7.8_

- [ ] 9. Frontend: Update activity log UI for version events
  - Modify `frontend/src/components/ActivityLogTable.jsx`
  - Add case for "version_upgraded" event_type
  - Format as "Upgraded from vX.Y.Z to vA.B.C"
  - Extract old_version and new_version from metadata
  - Use system event styling (same as backup events)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 9.1 Write unit tests for activity log UI rendering
  - Test version_upgraded event renders correctly
  - Test format includes old and new versions
  - Test handles missing metadata gracefully
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 10. Frontend: Add version endpoint to config
  - Verify `API_ENDPOINTS.VERSION` exists in `frontend/src/config.js`
  - If missing, add it (should already exist based on codebase review)
  - _Requirements: 5.1_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Integration testing and validation
  - Test full upgrade flow: upgrade version → restart → check activity log
  - Test frontend modal appears on first load after upgrade
  - Test modal doesn't appear after closing
  - Test activity log displays upgrade events correctly
  - Test first-time startup doesn't log upgrade event
  - Test same-version restart doesn't log upgrade event
  - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The version check uses the fire-and-forget pattern (errors don't block startup)
- Frontend uses localStorage for upgrade acknowledgment tracking
- Backend uses settings table for version persistence
