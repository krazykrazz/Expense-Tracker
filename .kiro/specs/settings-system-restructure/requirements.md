# Requirements Document

## Introduction

This document specifies the requirements for restructuring the existing Settings and System modals to better organize functionality. The initial split from the monolithic BackupSettings component has been completed, but the tab layout needs to be revised. Settings should focus purely on user configuration (backup config + people), while System should be expanded with dedicated tabs for backup operations, activity log, misc tools, about info, and updates/changelog.

## Glossary

- **Settings_Modal**: User-facing configuration interface for backup automation and people management
- **System_Modal**: System administration interface for backup operations, activity log, tools, version info, and updates
- **Backup_Configuration_Tab**: Tab in Settings_Modal containing only automatic backup settings
- **Backup_Information_Tab**: Tab in System_Modal containing manual backup/restore and recent backups list
- **Activity_Log_Tab**: Dedicated tab in System_Modal for activity event table and retention configuration
- **Activity_Log_Table**: Table-based display of recent activity events with Time, Event Type, and Details columns
- **Event_Type_Badge**: Styled badge displaying the entity type with entity-specific colors
- **Misc_Tab**: Tab in System_Modal containing only the Place Name Standardization tool
- **About_Tab**: Tab in System_Modal containing version information and database statistics
- **Updates_Tab**: Tab in System_Modal containing changelog with current version badge
- **Current_Version_Badge**: Badge displayed on the changelog entry matching the current application version
- **Retention_Config**: Activity log retention policy configuration

## Requirements

### Requirement 1: Settings Modal - Tab Structure

**User Story:** As a user, I want a focused Settings modal with only my personal configuration options, so that I can quickly adjust my preferences without seeing system administration tools.

#### Acceptance Criteria

1. THE Settings_Modal SHALL contain exactly two tabs: "Backup Configuration" and "People"
2. WHEN the Settings_Modal opens, THE System SHALL default to the Backup Configuration tab
3. THE Settings_Modal SHALL NOT contain a Restore tab
4. THE Settings_Modal SHALL NOT contain manual backup or recent backups list functionality
5. THE Settings_Modal SHALL use tab-based navigation between sections

### Requirement 2: Backup Configuration Tab (Settings Modal)

**User Story:** As a user, I want to configure automatic backup settings, so that my data is protected without manual intervention.

#### Acceptance Criteria

1. THE Backup_Configuration_Tab SHALL display automatic backup enable/disable toggle
2. WHEN automatic backups are enabled, THE Backup_Configuration_Tab SHALL display backup time, location, and retention settings
3. THE Backup_Configuration_Tab SHALL display the next scheduled backup time when enabled
4. THE Backup_Configuration_Tab SHALL provide a Save button to persist configuration changes
5. THE System SHALL validate backup location is an absolute path
6. THE System SHALL validate retention count is between 1 and 365
7. WHEN settings are saved successfully, THE System SHALL display a success message
8. IF settings save fails, THEN THE System SHALL display an error message with details
9. THE Backup_Configuration_Tab SHALL NOT include manual backup, download backup, or recent backups list

### Requirement 3: People Tab (Settings Modal)

**User Story:** As a user, I want to manage family members for medical expense tracking, so that I can associate medical expenses with specific people for tax reporting.

#### Acceptance Criteria

1. THE People_Tab SHALL display a list of all family members
2. THE People_Tab SHALL provide an "Add Family Member" button
3. WHEN adding or editing a person, THE System SHALL display a form with name and date of birth fields
4. THE System SHALL validate that name is required
5. THE System SHALL validate that date of birth is in YYYY-MM-DD format if provided
6. THE System SHALL validate that date of birth is not in the future
7. THE People_Tab SHALL provide edit and delete buttons for each family member
8. WHEN a person is deleted, THE System SHALL display a confirmation dialog warning about data loss
9. WHEN a person is added, updated, or deleted, THE System SHALL dispatch a global "peopleUpdated" event
10. THE People_Tab SHALL maintain all existing people management functionality

### Requirement 4: System Modal - Tab Structure

**User Story:** As a system administrator, I want a comprehensive System modal with dedicated tabs for each administrative function, so that I can easily find and use system tools.

#### Acceptance Criteria

1. THE System_Modal SHALL contain exactly five tabs in this order: "Backup Information", "Activity Log", "Misc", "About", "Updates"
2. WHEN the System_Modal opens, THE System SHALL default to the Backup Information tab
3. THE System_Modal SHALL use tab-based navigation between sections

### Requirement 5: Backup Information Tab (System Modal)

**User Story:** As a system administrator, I want to perform manual backup and restore operations, so that I can create backups on demand and recover from data loss.

#### Acceptance Criteria

1. THE Backup_Information_Tab SHALL provide a "Create Backup Now" button for manual backups
2. THE Backup_Information_Tab SHALL provide a "Download Backup" button to download a .tar.gz archive
3. THE Backup_Information_Tab SHALL display a list of recent backups with name, size, and creation date
4. WHEN a manual backup is created, THE System SHALL refresh the backup list
5. THE Backup_Information_Tab SHALL provide a "Restore" section with a file upload interface
6. THE System SHALL accept .tar.gz, .tgz, and .db files for restore
7. WHEN a restore is initiated, THE System SHALL display a warning dialog requiring confirmation
8. WHEN a restore completes successfully, THE System SHALL reload the application

### Requirement 6: Activity Log Tab (System Modal)

**User Story:** As a system administrator, I want a dedicated Activity Log tab with event table and retention configuration, so that I can monitor system changes and manage log retention in one place.

#### Acceptance Criteria

1. THE Activity_Log_Tab SHALL be a dedicated tab in the System_Modal, not embedded within the Misc tab
2. THE Activity_Log_Tab SHALL display recent activity events in a table with three columns: Time, Event Type, Details
3. THE Time column SHALL display human-readable relative timestamps
4. THE Event_Type column SHALL display styled badges with entity-specific colors
5. THE Details column SHALL display the user_action text from the activity event
6. THE Activity_Log_Tab SHALL provide a dropdown to select display limit (25, 50, 100, 200 events)
7. THE Activity_Log_Tab SHALL provide a "Load More" button when additional events are available
8. THE Activity_Log_Tab SHALL display the total event count
9. THE Activity_Log_Tab SHALL include retention policy configuration section
10. THE Retention_Config section SHALL display current retention settings and provide input fields to modify them
11. THE Retention_Config section SHALL validate retention settings client-side before submission

### Requirement 7: Misc Tab (System Modal)

**User Story:** As a system administrator, I want access to data management tools in a clean Misc tab, so that I can maintain data quality without clutter.

#### Acceptance Criteria

1. THE Misc_Tab SHALL include the Place Name Standardization tool
2. THE Misc_Tab SHALL NOT include the Activity Log (moved to dedicated tab)
3. WHEN a tool is opened, THE System SHALL display the tool interface in place of the tool list
4. WHEN a tool is closed, THE System SHALL return to the tool list view

### Requirement 8: About Tab (System Modal)

**User Story:** As a system administrator, I want to view version information and database statistics, so that I can verify the application version and monitor database health.

#### Acceptance Criteria

1. THE About_Tab SHALL display version information including version number and environment
2. WHEN running in Docker, THE About_Tab SHALL display Docker tag, build date, and git commit
3. THE About_Tab SHALL display database statistics including expense count, invoice count, payment methods count, credit card statements count, credit card payments count, database size, invoice storage size, and backup storage size
4. THE About_Tab SHALL fetch database statistics when the tab becomes active
5. THE About_Tab SHALL NOT include the changelog (moved to Updates tab)

### Requirement 9: Updates Tab (System Modal)

**User Story:** As a user, I want to see recent updates with the current version highlighted, so that I know what features are available and which version I'm running.

#### Acceptance Criteria

1. THE Updates_Tab SHALL display a changelog with recent version entries
2. EACH changelog entry SHALL include version number, release date, and list of changes
3. THE Updates_Tab SHALL display a badge on the current version entry to indicate "Current Version"
4. THE Current_Version_Badge SHALL be visually distinct with a highlighted color
5. THE Updates_Tab SHALL use the version information from the backend API to determine the current version

### Requirement 10: Event Type Badge Styling

**User Story:** As a system administrator, I want event types to be visually distinct, so that I can quickly identify the type of activity at a glance.

#### Acceptance Criteria

1. THE System SHALL display event type badges with entity-specific background colors
2. THE System SHALL use the following color scheme for entity types: expense (blue), fixed_expense (purple), loan (orange), investment (green), budget (teal), payment_method (indigo), backup (gray)
3. THE Event_Type_Badge SHALL have rounded corners and padding for readability
4. THE Event_Type_Badge SHALL display the event type in title case

### Requirement 11: Navigation and Modal Management

**User Story:** As a user, I want clear navigation between Settings and System sections, so that I can easily access the functionality I need.

#### Acceptance Criteria

1. THE System SHALL provide separate navigation items for Settings and System modals
2. THE System SHALL use the ModalContext to manage modal visibility
3. WHEN a modal is opened, THE System SHALL close any other open modals
4. EACH modal SHALL provide a close button to dismiss the modal
5. THE System SHALL preserve tab selection within each modal during a session
6. WHEN a modal is reopened, THE System SHALL restore the previously selected tab

### Requirement 12: Backward Compatibility

**User Story:** As a system maintainer, I want the restructuring to be seamless for existing users, so that no data is lost and functionality continues to work.

#### Acceptance Criteria

1. THE System SHALL maintain all existing API endpoints without changes
2. THE System SHALL maintain all existing database tables and schemas
3. THE System SHALL preserve all user preferences and settings
4. THE System SHALL maintain the existing peopleUpdated event for cross-component communication
5. THE System SHALL maintain the existing activity log display limit preference in localStorage
6. THE System SHALL preserve the existing shared hooks (useTabState, useActivityLog) and ActivityLogTable component
7. THE System SHALL preserve the existing time formatting utilities
