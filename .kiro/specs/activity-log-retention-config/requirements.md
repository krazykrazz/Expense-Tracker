# Requirements Document

## Introduction

This document specifies the requirements for making the activity log retention policy configurable through the user interface. Currently, the retention policy is hardcoded in the backend service with fixed values (90 days max age, 1000 events max count). This feature will allow users to customize these settings through the Settings UI, providing flexibility for different storage and retention needs.

## Glossary

- **Activity_Log**: System-wide event tracking mechanism that records all data modifications
- **Retention_Policy**: Rules governing how long activity log events are kept before automatic deletion
- **Cleanup_Job**: Scheduled background task that removes old activity log events based on retention policy
- **Settings_UI**: User interface in the Misc tab of BackupSettings component where configuration is managed
- **Max_Age**: Maximum number of days to retain activity log events
- **Max_Count**: Maximum number of activity log events to retain regardless of age

## Requirements

### Requirement 1: Retention Policy Configuration Storage

**User Story:** As a system administrator, I want retention policy settings to be persisted in the database, so that my preferences are maintained across application restarts.

#### Acceptance Criteria

1. THE System SHALL create a settings table in the database to store configuration key-value pairs
2. WHEN the application starts, THE System SHALL load retention policy settings from the database
3. IF no settings exist in the database, THEN THE System SHALL use default values (90 days, 1000 events)
4. THE System SHALL support storing integer values for max_age_days and max_count settings
5. WHEN settings are updated, THE System SHALL persist changes to the database immediately

### Requirement 2: Settings API Endpoints

**User Story:** As a frontend developer, I want API endpoints for managing retention settings, so that the UI can read and update configuration.

#### Acceptance Criteria

1. THE System SHALL provide a GET endpoint at /api/activity-logs/settings to retrieve current retention policy
2. THE System SHALL provide a PUT endpoint at /api/activity-logs/settings to update retention policy
3. WHEN retrieving settings, THE System SHALL return max_age_days and max_count values
4. WHEN updating settings, THE System SHALL validate that max_age_days is between 7 and 365
5. WHEN updating settings, THE System SHALL validate that max_count is between 100 and 10000
6. IF validation fails, THEN THE System SHALL return a 400 error with descriptive message
7. WHEN settings are successfully updated, THE System SHALL return the updated settings

### Requirement 3: Settings UI in Misc Tab

**User Story:** As a user, I want to configure retention policy through the Settings UI, so that I can control how much activity history is kept.

#### Acceptance Criteria

1. THE Settings_UI SHALL display current retention policy settings in the Misc tab
2. THE Settings_UI SHALL provide input fields for max_age_days and max_count
3. THE Settings_UI SHALL display helpful labels and descriptions for each setting
4. WHEN the user changes a setting, THE Settings_UI SHALL validate the input client-side
5. THE Settings_UI SHALL provide a Save button to persist changes
6. WHEN the Save button is clicked, THE Settings_UI SHALL call the PUT endpoint
7. IF the save succeeds, THEN THE Settings_UI SHALL display a success message
8. IF the save fails, THEN THE Settings_UI SHALL display an error message with details
9. THE Settings_UI SHALL disable the Save button while a save operation is in progress

### Requirement 4: Impact Visualization

**User Story:** As a user, I want to see the impact of my retention settings, so that I can make informed decisions about storage.

#### Acceptance Criteria

1. THE Settings_UI SHALL display the current number of activity log events
2. THE Settings_UI SHALL display the timestamp of the oldest event
3. WHEN retention settings are displayed, THE Settings_UI SHALL show how many events would be affected by current policy
4. THE Settings_UI SHALL calculate and display the approximate age of the oldest event in human-readable format

### Requirement 5: Dynamic Cleanup Job Configuration

**User Story:** As a system administrator, I want the cleanup job to use the configured retention policy, so that changes take effect immediately.

#### Acceptance Criteria

1. WHEN the cleanup job runs, THE System SHALL read retention policy settings from the database
2. THE Cleanup_Job SHALL delete events older than the configured max_age_days
3. THE Cleanup_Job SHALL delete excess events beyond the configured max_count
4. THE Cleanup_Job SHALL continue running on its daily schedule (2:00 AM)
5. WHEN settings are updated, THE System SHALL use new values on the next cleanup run

### Requirement 6: Backward Compatibility

**User Story:** As a system maintainer, I want the feature to work with existing installations, so that upgrades are seamless.

#### Acceptance Criteria

1. WHEN the application starts with no settings table, THE System SHALL create the table automatically
2. WHEN the settings table exists but is empty, THE System SHALL use default values (90 days, 1000 events)
3. THE System SHALL maintain existing activity log functionality during migration
4. THE System SHALL not require manual intervention to enable the feature

### Requirement 7: Input Validation and Constraints

**User Story:** As a user, I want reasonable limits on retention settings, so that I don't accidentally configure extreme values.

#### Acceptance Criteria

1. THE System SHALL enforce a minimum max_age_days of 7 days
2. THE System SHALL enforce a maximum max_age_days of 365 days
3. THE System SHALL enforce a minimum max_count of 100 events
4. THE System SHALL enforce a maximum max_count of 10000 events
5. THE Settings_UI SHALL display these constraints to the user
6. WHEN the user enters a value outside the valid range, THE Settings_UI SHALL show a validation error
7. THE Settings_UI SHALL prevent submission of invalid values

### Requirement 8: Settings Persistence and Retrieval

**User Story:** As a developer, I want a clean service layer for settings management, so that the code is maintainable and testable.

#### Acceptance Criteria

1. THE System SHALL provide a settings service with methods for get and update operations
2. THE System SHALL provide a settings repository for database access
3. WHEN retrieving settings, THE System SHALL return a settings object with max_age_days and max_count
4. WHEN updating settings, THE System SHALL use database transactions for atomicity
5. THE System SHALL log all settings changes for audit purposes
