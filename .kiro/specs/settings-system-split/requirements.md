# Requirements Document

## Introduction

This document specifies the requirements for splitting the current monolithic Settings modal into two separate top-level sections: "Settings" (user configuration) and "System" (system information and management). The current BackupSettings component has grown to 1219 lines and combines user-facing configuration with system administration tools, making it difficult to navigate and maintain. This reorganization will improve usability by clearly separating user preferences from system management functions.

## Glossary

- **Settings_Modal**: User-facing configuration interface for backup automation and people management
- **System_Modal**: System administration interface for information, management tools, and maintenance
- **BackupSettings_Component**: Current monolithic component that will be split into two separate components
- **Activity_Log_Table**: Table-based display of recent activity events with Time, Event Type, and Details columns
- **Event_Type_Badge**: Styled badge displaying the entity type with entity-specific colors
- **Current_Version_Badge**: Badge displayed on the changelog entry matching the current application version
- **Retention_Config**: Activity log retention policy configuration (from activity-log-retention-config spec)

## Requirements

### Requirement 1: Settings Modal - User Configuration

**User Story:** As a user, I want a dedicated Settings section for my personal configuration, so that I can quickly access and modify my preferences without navigating through system administration tools.

#### Acceptance Criteria

1. THE System SHALL create a new Settings modal accessible from the main navigation
2. THE Settings_Modal SHALL contain a "Backup Configuration" tab for automatic backup settings
3. THE Settings_Modal SHALL contain a "People" tab for family member management
4. WHEN the Settings modal opens, THE System SHALL default to the Backup Configuration tab
5. THE Settings_Modal SHALL use tab-based navigation between sections
6. THE Settings_Modal SHALL maintain all existing functionality from the current Backups and People tabs

### Requirement 2: System Modal - System Information and Management

**User Story:** As a system administrator, I want a dedicated System section for administrative functions, so that I can manage system settings and view system information separately from user preferences.

#### Acceptance Criteria

1. THE System SHALL create a new System modal accessible from the main navigation
2. THE System_Modal SHALL contain a "Backup Information" tab for manual backup/restore operations
3. THE System_Modal SHALL contain an "Activity Log" tab for event tracking and retention configuration
4. THE System_Modal SHALL contain a "Misc" tab for data management tools
5. THE System_Modal SHALL contain an "About" tab for version information and database statistics
6. THE System_Modal SHALL contain an "Updates" tab for changelog and version checking
7. WHEN the System modal opens, THE System SHALL default to the Backup Information tab
8. THE System_Modal SHALL use tab-based navigation between sections

### Requirement 3: Backup Configuration Tab (Settings Modal)

**User Story:** As a user, I want to configure automatic backup settings, so that my data is protected without manual intervention.

#### Acceptance Criteria

1. THE Backup_Configuration_Tab SHALL display automatic backup enable/disable toggle
2. WHEN automatic backups are enabled, THE System SHALL display backup time, location, and retention settings
3. THE Backup_Configuration_Tab SHALL display the next scheduled backup time
4. THE Backup_Configuration_Tab SHALL provide a Save button to persist configuration changes
5. THE System SHALL validate backup location is an absolute path
6. THE System SHALL validate retention count is between 1 and 365
7. WHEN settings are saved successfully, THE System SHALL display a success message
8. IF settings save fails, THEN THE System SHALL display an error message with details

### Requirement 4: People Tab (Settings Modal)

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
10. THE People_Tab SHALL maintain all existing functionality from the current People tab

### Requirement 5: Backup Information Tab (System Modal)

**User Story:** As a system administrator, I want to perform manual backup and restore operations, so that I can create backups on demand and recover from data loss.

#### Acceptance Criteria

1. THE Backup_Information_Tab SHALL provide a "Create Backup Now" button for manual backups
2. THE Backup_Information_Tab SHALL provide a "Download Backup" button to download a .tar.gz archive
3. THE Backup_Information_Tab SHALL display a list of recent backups with name, size, and creation date
4. WHEN a manual backup is created, THE System SHALL refresh the backup list
5. THE Backup_Information_Tab SHALL provide a separate "Restore" section with a file upload interface
6. THE System SHALL accept .tar.gz, .tgz, and .db files for restore
7. WHEN a restore is initiated, THE System SHALL display a warning dialog requiring confirmation
8. WHEN a restore completes successfully, THE System SHALL reload the application

### Requirement 6: Activity Log Tab (System Modal)

**User Story:** As a system administrator, I want to view recent activity events in a table format, so that I can quickly scan and understand system changes.

#### Acceptance Criteria

1. THE Activity_Log_Tab SHALL display recent activity events in a table with three columns: Time, Event Type, Details
2. THE Time column SHALL display human-readable relative timestamps (e.g., "5 minutes ago", "Yesterday at 2:30 PM")
3. THE Event_Type column SHALL display styled badges with entity-specific colors
4. THE Details column SHALL display the user_action text from the activity event
5. THE Activity_Log_Tab SHALL provide a dropdown to select display limit (25, 50, 100, 200 events)
6. THE Activity_Log_Tab SHALL provide a "Load More" button when additional events are available
7. THE Activity_Log_Tab SHALL display the total event count (e.g., "Showing 50 of 237 events")
8. THE Activity_Log_Tab SHALL include retention policy configuration section
9. THE Retention_Config section SHALL display current retention settings (max age days, max count)
10. THE Retention_Config section SHALL provide input fields to modify retention settings
11. THE Retention_Config section SHALL validate retention settings client-side before submission
12. THE Retention_Config section SHALL display current activity log statistics (event count, oldest event)

### Requirement 7: Event Type Badge Styling

**User Story:** As a system administrator, I want event types to be visually distinct, so that I can quickly identify the type of activity at a glance.

#### Acceptance Criteria

1. THE System SHALL display event type badges with entity-specific background colors
2. THE System SHALL use the following color scheme for entity types:
   - expense: blue (#2196F3)
   - fixed_expense: purple (#9C27B0)
   - loan: orange (#FF9800)
   - investment: green (#4CAF50)
   - budget: teal (#009688)
   - payment_method: indigo (#3F51B5)
   - backup: gray (#607D8B)
3. THE Event_Type_Badge SHALL have rounded corners and padding for readability
4. THE Event_Type_Badge SHALL display the event type in title case (e.g., "Created", "Updated", "Deleted")

### Requirement 8: Misc Tab (System Modal)

**User Story:** As a system administrator, I want access to data management tools, so that I can maintain data quality and consistency.

#### Acceptance Criteria

1. THE Misc_Tab SHALL display a list of available data management tools
2. THE Misc_Tab SHALL include the Place Name Standardization tool
3. WHEN a tool is opened, THE System SHALL display the tool interface in place of the tool list
4. WHEN a tool is closed, THE System SHALL return to the tool list view
5. THE Misc_Tab SHALL maintain all existing functionality from the current Misc tab

### Requirement 9: About Tab (System Modal)

**User Story:** As a system administrator, I want to view version information and database statistics, so that I can verify the application version and monitor database size.

#### Acceptance Criteria

1. THE About_Tab SHALL display version information including version number and environment
2. WHEN running in Docker, THE About_Tab SHALL display Docker tag, build date, and git commit
3. THE About_Tab SHALL display database statistics including:
   - Total expenses count
   - Total invoices count
   - Payment methods count
   - Credit card statements count
   - Credit card payments count
   - Database size in MB
   - Invoice storage size in MB
   - Backup storage size in MB and count
4. THE About_Tab SHALL fetch database statistics when the tab becomes active
5. THE About_Tab SHALL maintain all existing functionality from the current About tab

### Requirement 10: Updates Tab (System Modal)

**User Story:** As a user, I want to see recent updates with the current version highlighted, so that I know what features are available and which version I'm running.

#### Acceptance Criteria

1. THE Updates_Tab SHALL display a changelog with recent version entries
2. EACH changelog entry SHALL include version number, release date, and list of changes
3. THE Updates_Tab SHALL display the 10-15 most recent versions
4. THE Updates_Tab SHALL display a badge on the current version entry to indicate "Current Version"
5. THE Current_Version_Badge SHALL be visually distinct with a highlighted color (e.g., green or blue)
6. THE Updates_Tab SHALL fetch the current version from the backend API
7. THE Updates_Tab SHALL maintain the existing changelog content from the current About tab

### Requirement 11: Navigation and Modal Management

**User Story:** As a user, I want clear navigation between Settings and System sections, so that I can easily access the functionality I need.

#### Acceptance Criteria

1. THE System SHALL provide separate navigation items for Settings and System modals
2. THE System SHALL use the ModalContext to manage modal visibility
3. WHEN a modal is opened, THE System SHALL close any other open modals
4. EACH modal SHALL provide a close button to dismiss the modal
5. THE System SHALL preserve tab selection within each modal during a session
6. WHEN a modal is reopened, THE System SHALL restore the previously selected tab

### Requirement 12: Component Refactoring and Code Organization

**User Story:** As a developer, I want the Settings and System components to be well-organized and maintainable, so that future changes are easier to implement.

#### Acceptance Criteria

1. THE System SHALL create a new SettingsModal component for user configuration
2. THE System SHALL create a new SystemModal component for system administration
3. THE System SHALL extract shared functionality into reusable hooks or utility functions
4. THE System SHALL maintain consistent styling between Settings and System modals
5. THE System SHALL use the existing BackupSettings.css as a base for styling
6. THE System SHALL follow the existing component patterns and conventions
7. THE System SHALL maintain backward compatibility with existing API endpoints
8. THE System SHALL not require database schema changes

### Requirement 13: Activity Log Table Formatting

**User Story:** As a system administrator, I want activity events displayed in a clean table format, so that I can easily scan and compare events.

#### Acceptance Criteria

1. THE Activity_Log_Table SHALL use a fixed table layout with defined column widths
2. THE Time column SHALL be narrow (approximately 150px) for compact timestamp display
3. THE Event_Type column SHALL be narrow (approximately 120px) for badge display
4. THE Details column SHALL expand to fill remaining space
5. THE Activity_Log_Table SHALL have alternating row colors for readability
6. THE Activity_Log_Table SHALL have a header row with column labels
7. THE Activity_Log_Table SHALL be scrollable when content exceeds viewport height
8. THE Activity_Log_Table SHALL maintain consistent row height for visual alignment

### Requirement 14: Retention Configuration Integration

**User Story:** As a system administrator, I want retention policy configuration integrated into the Activity Log tab, so that I can manage event retention alongside viewing events.

#### Acceptance Criteria

1. THE Activity_Log_Tab SHALL include the retention configuration section from the activity-log-retention-config spec
2. THE Retention_Config section SHALL be positioned above the activity event table
3. THE Retention_Config section SHALL display current retention settings (max age days, max count)
4. THE Retention_Config section SHALL provide input fields with validation for modifying settings
5. THE Retention_Config section SHALL display impact information (current event count, oldest event)
6. THE Retention_Config section SHALL provide a Save button to persist retention settings
7. WHEN retention settings are saved, THE System SHALL display a success or error message
8. THE Retention_Config section SHALL maintain all functionality from the activity-log-retention-config spec

### Requirement 15: Version Check Feature

**User Story:** As a user, I want to check for application updates, so that I know when new features or bug fixes are available.

#### Acceptance Criteria
### Requirement 15: Backward Compatibility and Migration

**User Story:** As a system maintainer, I want the split to be seamless for existing users, so that no data is lost and functionality continues to work.

#### Acceptance Criteria

1. THE System SHALL maintain all existing API endpoints without changes
2. THE System SHALL maintain all existing database tables and schemas
3. THE System SHALL maintain all existing functionality from the BackupSettings component
4. THE System SHALL not require manual user intervention after deployment
5. THE System SHALL preserve all user preferences and settings
6. THE System SHALL maintain the existing peopleUpdated event for cross-component communication
7. THE System SHALL maintain the existing activity log display limit preference in localStorage
