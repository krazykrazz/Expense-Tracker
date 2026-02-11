# Requirements Document

## Introduction

This feature adds automatic version upgrade tracking to the activity log system. When the application starts and detects that its version has changed from the last run, it will log a "version_upgraded" event with metadata about the old and new versions. This provides a historical record of application upgrades and helps correlate system behavior with specific versions.

## Glossary

- **Application_Version**: The semantic version string (e.g., "5.10.0") identifying the current build of the application
- **Activity_Log**: The system's event tracking mechanism that records all significant data changes and system events
- **Version_Upgrade_Event**: A system-level activity log entry recording a change in application version
- **Settings_Table**: Database table storing persistent application configuration including the last known version
- **Startup_Check**: The version comparison process that occurs when the backend server initializes
- **Upgrade_Modal**: A modal dialog that displays changelog information after a version upgrade
- **Last_Seen_Version**: A localStorage value tracking the last version the user has acknowledged

## Requirements

### Requirement 1: Version Persistence

**User Story:** As a system administrator, I want the application to remember its last known version, so that version changes can be detected on subsequent startups.

#### Acceptance Criteria

1. THE Settings_Table SHALL store a "last_known_version" key with the current application version as its value
2. WHEN the application starts for the first time, THE Startup_Check SHALL initialize "last_known_version" with the current version
3. WHEN a version upgrade is detected, THE Settings_Table SHALL update "last_known_version" to the new version
4. THE Settings_Table SHALL persist the version value across application restarts

### Requirement 2: Version Change Detection

**User Story:** As a system administrator, I want the application to detect when its version has changed, so that upgrades can be tracked automatically.

#### Acceptance Criteria

1. WHEN the application starts, THE Startup_Check SHALL retrieve the "last_known_version" from the Settings_Table
2. WHEN the application starts, THE Startup_Check SHALL compare the stored version with the current application version
3. IF the stored version differs from the current version, THEN THE Startup_Check SHALL identify this as a version upgrade
4. IF no stored version exists (first startup), THEN THE Startup_Check SHALL NOT log a version upgrade event
5. THE Startup_Check SHALL execute during server initialization before handling any HTTP requests

### Requirement 3: Version Upgrade Event Logging

**User Story:** As a system administrator, I want version upgrades to be logged in the activity log, so that I have a historical record of application versions.

#### Acceptance Criteria

1. WHEN a version upgrade is detected, THE Activity_Log SHALL create a "version_upgraded" event
2. THE Version_Upgrade_Event SHALL use entity_type "system"
3. THE Version_Upgrade_Event SHALL use entity_id null
4. THE Version_Upgrade_Event SHALL include metadata with "old_version" containing the previous version string
5. THE Version_Upgrade_Event SHALL include metadata with "new_version" containing the current version string
6. THE Version_Upgrade_Event SHALL use the fire-and-forget logging pattern (no error blocking)
7. IF the activity log service fails, THEN THE Startup_Check SHALL continue without blocking application startup

### Requirement 4: Activity Log UI Display

**User Story:** As a user, I want to see version upgrade events in the activity log, so that I can track when the application was updated.

#### Acceptance Criteria

1. WHEN displaying activity log entries, THE Activity_Log_UI SHALL render "version_upgraded" events with a descriptive message
2. THE Activity_Log_UI SHALL display the old version and new version from the event metadata
3. THE Activity_Log_UI SHALL format version upgrade events as "Upgraded from vX.Y.Z to vA.B.C"
4. THE Activity_Log_UI SHALL display version upgrade events with the same styling as other system events

### Requirement 5: Version Source Integration

**User Story:** As a developer, I want the version check to use the existing version endpoint, so that version information remains centralized.

#### Acceptance Criteria

1. THE Startup_Check SHALL retrieve the current version from the same source used by the /api/version endpoint
2. THE Startup_Check SHALL use the version value from package.json
3. THE Startup_Check SHALL NOT duplicate version string definitions
4. THE Startup_Check SHALL handle missing or malformed version strings gracefully

### Requirement 6: Idempotent Startup Behavior

**User Story:** As a system administrator, I want version checks to be safe for repeated startups, so that restarting the application doesn't create duplicate events.

#### Acceptance Criteria

1. WHEN the application restarts with the same version, THE Startup_Check SHALL NOT log a version upgrade event
2. WHEN the application restarts multiple times after an upgrade, THE Startup_Check SHALL log the upgrade event only once
3. THE Startup_Check SHALL be idempotent (repeated execution with same version produces same result)
4. THE Startup_Check SHALL NOT interfere with normal application startup timing

### Requirement 7: Upgrade Notification Modal

**User Story:** As a user, I want to see what changed when the application is upgraded, so that I understand new features and improvements.

#### Acceptance Criteria

1. WHEN the application detects a version upgrade on startup, THE Frontend SHALL display a modal showing the changelog
2. THE Upgrade_Modal SHALL display the new version number prominently
3. THE Upgrade_Modal SHALL show changelog entries from the in-app changelog (BackupSettings.jsx)
4. THE Upgrade_Modal SHALL appear automatically on the first page load after an upgrade
5. WHEN the user closes the modal, THE Frontend SHALL mark the upgrade notification as seen
6. WHEN the user refreshes the page after closing the modal, THE Upgrade_Modal SHALL NOT appear again for the same version
7. THE Frontend SHALL check for version upgrades by comparing the current version with a stored "last_seen_version" in localStorage
8. IF no "last_seen_version" exists (first time user), THEN THE Frontend SHALL NOT display the upgrade modal
