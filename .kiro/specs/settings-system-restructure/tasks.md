# Implementation Plan: Settings and System Modal Restructuring

## Overview

Refactor the existing SettingsModal and SystemModal components to implement the revised tab layout. SettingsModal goes from 3 tabs to 2 (removing Restore, stripping manual backup/backups list). SystemModal goes from 2 tabs to 5 (adding Backup Information, Activity Log, Updates). All shared hooks and utilities are preserved unchanged. No new API endpoints or database changes needed.

## Tasks

- [x] 1. Refactor SettingsModal — strip down to 2 tabs
  - [x] 1.1 Remove Restore tab and manual backup functionality from SettingsModal
    - Remove the "Restore" tab button and its entire tab panel
    - Remove the "Manual Backup" section (Create Backup Now button, Download Backup button, backup hint) from the Backups tab
    - Remove the "Recent Backups" list section from the Backups tab
    - Remove state: `backups` array
    - Remove functions: `fetchBackupList()`, `handleManualBackup()`, `handleDownloadBackup()`, `handleRestoreBackup()`, `formatFileSize()`, `formatDate`
    - Remove `fetchBackupList()` call from the mount useEffect
    - Remove import of `formatDateTime` (no longer needed)
    - Rename "Backups" tab to "Backup Configuration" (tab key: `backup-config`)
    - Update `useTabState` default from `'backups'` to `'backup-config'`
    - Keep only: auto backup toggle, time/location/retention fields, save button, next backup info, message display
    - Keep all People tab functionality unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1–2.4, 2.9_

  - [x] 1.2 Clean up SettingsModal.css
    - Remove restore-related styles (warning-text, restore-info, restore-button, file-upload-button)
    - Remove manual backup styles (manual-backup-buttons, backup-button, download-button, backup-hint)
    - Remove backup list styles (backup-list, backup-item, backup-info, backup-name, backup-details)
    - Keep backup configuration form styles, people tab styles, modal container styles
    - _Requirements: 1.1_

- [x] 2. Refactor SystemModal — expand to 5 tabs
  - [x] 2.1 Add Backup Information tab to SystemModal
    - Add new state: `backups`, `backupMessage`, `backupLoading`
    - Add functions moved from SettingsModal: `fetchBackupList()`, `handleManualBackup()`, `handleDownloadBackup()`, `handleRestoreBackup()`, `formatFileSize()`
    - Add import: `formatDateTime` from `../utils/formatters`
    - Add useEffect to fetch backup list on mount
    - Add "Backup Information" tab button (key: `backup-info`, first position)
    - Render tab panel: manual backup section (Create Backup Now + Download Backup buttons), recent backups list, restore section (file upload + warning), backup message display
    - _Requirements: 4.1, 5.1–5.8_

  - [x] 2.2 Extract Activity Log into its own dedicated tab
    - Remove ActivityLogTable rendering from the Misc tab's `renderMiscTab()` function
    - Add "Activity Log" tab button (key: `activity-log`)
    - Render ActivityLogTable in the Activity Log tab panel with all existing props from useActivityLog hook
    - Include retention configuration section in the Activity Log tab (stats display already in ActivityLogTable)
    - _Requirements: 4.1, 6.1, 6.2, 6.9, 7.2_

  - [x] 2.3 Create Updates tab — split changelog from About
    - Remove the "Recent Updates" / changelog section from `renderAboutTab()`
    - Add "Updates" tab button (key: `updates`, last position)
    - Move changelog entries to Updates tab panel
    - Add `isCurrentVersion(entryVersion)` helper that compares against `versionInfo.version`
    - Render `current-version-badge` span on the changelog entry matching the current version
    - _Requirements: 4.1, 8.5, 9.1–9.3, 9.5_

  - [x] 2.4 Update SystemModal tab navigation and defaults
    - Change tab order to: `backup-info`, `activity-log`, `misc`, `about`, `updates`
    - Change `useTabState` default from `'misc'` to `'backup-info'`
    - Verify Misc tab only renders Place Name Standardization tool (no activity log)
    - Verify About tab only renders version info + database stats (no changelog)
    - _Requirements: 4.1, 4.2, 7.1, 8.1–8.4_

  - [x] 2.5 Update SystemModal.css for new tabs
    - Add Backup Information tab styles (reuse/adapt from SettingsModal: manual-backup-buttons, backup-button, download-button, backup-list, backup-item, restore section, warning-text, file-upload-button)
    - Add `current-version-badge` style: highlighted background, rounded corners, small font, inline display next to version number
    - Ensure tab navigation accommodates 5 tabs on smaller screens (reduce padding or allow horizontal scroll)
    - _Requirements: 9.3, 9.4_

- [x] 3. Checkpoint — Verify restructuring works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update and add tests
  - [x] 4.1 Update SettingsModal unit tests
    - Update tab assertions: expect exactly 2 tabs (Backup Configuration, People)
    - Add test: defaults to Backup Configuration tab
    - Add test: Restore tab does NOT exist
    - Add test: manual backup/download buttons do NOT exist
    - Add test: recent backups list does NOT exist
    - Remove any existing tests for Restore tab, manual backup, download, backups list
    - Keep all People tab tests unchanged
    - _Requirements: 1.1–1.4_

  - [x] 4.2 Update SystemModal unit tests
    - Update tab assertions: expect exactly 5 tabs in correct order
    - Add test: defaults to Backup Information tab
    - Add test: Backup Information tab renders manual backup, download, restore, backups list
    - Add test: Activity Log tab renders ActivityLogTable (not in Misc)
    - Add test: Misc tab renders Place Name Standardization only (no activity log)
    - Add test: About tab renders version info + db stats (no changelog)
    - Add test: Updates tab renders changelog entries
    - Add test: Updates tab shows current version badge on matching entry
    - _Requirements: 4.1, 4.2, 5.1, 6.1, 7.1, 7.2, 8.5, 9.1, 9.3_

  - [x] 4.3 Write property test for tab content correspondence
    - **Property 1: Tab Content Correspondence**
    - Generate random tab selections for SettingsModal and SystemModal
    - Verify exactly one content panel is visible and matches the selected tab
    - **Validates: Requirements 1.5, 4.3**

  - [x] 4.4 Write property test for current version badge matching
    - **Property 2: Current Version Badge Matching**
    - Generate random version strings and changelog entry lists
    - Verify badge appears on exactly the matching entry or no entries if no match
    - **Validates: Requirements 9.3**

  - [x] 4.5 Write property test for person form validation
    - **Property 3: Person Form Validation Completeness**
    - Generate random name/dateOfBirth combinations (empty, whitespace, invalid format, future dates, valid)
    - Verify validation correctly accepts or rejects each combination
    - **Validates: Requirements 3.4, 3.5, 3.6**

- [x] 5. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No new API endpoints or database changes needed — all existing endpoints are reused
- All shared hooks (useTabState, useActivityLog), ActivityLogTable, and timeFormatters are preserved unchanged
- Existing PBTs for useTabState, timeFormatters, and ActivityLogTable remain valid and do not need updates
- The restructuring is purely frontend component reorganization
