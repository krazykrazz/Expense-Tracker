# Implementation Plan: Activity Log Retention Configuration

## Overview

This implementation plan breaks down the activity log retention configuration feature into discrete, testable tasks. The approach follows the existing architecture patterns and integrates with the current activity log system. Tasks are ordered to build incrementally, with testing integrated throughout.

## Tasks

- [ ] 1. Create database migration for settings table
  - Add migration function `migration_add_settings_table` in `backend/database/migrations.js`
  - Create settings table with columns: key (TEXT PRIMARY KEY), value (TEXT), updated_at (TEXT)
  - Add migration to the migration sequence in `initializeDatabase()`
  - Test migration runs successfully on fresh database
  - _Requirements: 1.1, 6.1_

- [ ] 2. Implement settings repository layer
  - [ ] 2.1 Create `backend/repositories/settingsRepository.js`
    - Implement `getSetting(key)` - returns value or null
    - Implement `setSetting(key, value)` - creates or updates setting
    - Implement `getMultiple(keys)` - returns map of key-value pairs
    - Use parameterized queries for SQL injection prevention
    - _Requirements: 8.2_
  
  - [ ]* 2.2 Write unit tests for settings repository
    - Test getSetting returns correct value for existing key
    - Test getSetting returns null for non-existent key
    - Test setSetting creates new setting
    - Test setSetting updates existing setting with new timestamp
    - Test getMultiple returns all requested keys
    - Test database errors are handled gracefully
    - _Requirements: 8.2_

- [ ] 3. Implement settings service layer
  - [ ] 3.1 Create `backend/services/settingsService.js`
    - Define DEFAULT_SETTINGS constant (maxAgeDays: 90, maxCount: 1000)
    - Implement `getRetentionSettings()` - returns settings or defaults
    - Implement `updateRetentionSettings(maxAgeDays, maxCount)` - validates and persists
    - Implement `validateRetentionSettings(maxAgeDays, maxCount)` - throws on invalid input
    - Parse stored string values to integers
    - _Requirements: 1.2, 1.3, 1.4, 8.1, 8.3_
  
  - [ ]* 3.2 Write unit tests for settings service
    - Test getRetentionSettings returns stored values when they exist
    - Test getRetentionSettings returns defaults when no settings exist
    - Test updateRetentionSettings validates maxAgeDays range (7-365)
    - Test updateRetentionSettings validates maxCount range (100-10000)
    - Test updateRetentionSettings rejects invalid inputs with descriptive errors
    - Test updateRetentionSettings persists valid values
    - Test integer parsing from stored string values
    - _Requirements: 1.3, 2.4, 2.5, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 3.3 Write property test for settings persistence round-trip
    - **Property 1: Settings Persistence Round-Trip**
    - **Validates: Requirements 1.5, 2.7**
    - Generate random valid settings (maxAgeDays: 7-365, maxCount: 100-10000)
    - Update settings via service
    - Retrieve settings via service
    - Assert retrieved values match updated values exactly
    - _Requirements: 1.5, 2.7_
  
  - [ ]* 3.4 Write property tests for range validation
    - **Property 2: Range Validation for Max Age Days**
    - **Validates: Requirements 2.4, 7.1, 7.2**
    - Generate random integers (including out-of-range values)
    - Test values in [7, 365] are accepted
    - Test values outside range are rejected with error
    - **Property 3: Range Validation for Max Count**
    - **Validates: Requirements 2.5, 7.3, 7.4**
    - Generate random integers (including out-of-range values)
    - Test values in [100, 10000] are accepted
    - Test values outside range are rejected with error
    - _Requirements: 2.4, 2.5, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 3.5 Write property test for integer storage and retrieval
    - **Property 9: Integer Storage and Retrieval**
    - **Validates: Requirements 1.4**
    - Generate random integer values
    - Store as settings
    - Retrieve settings
    - Assert retrieved values are integers (not strings)
    - Assert values match exactly
    - _Requirements: 1.4_

- [ ] 4. Add settings API endpoints
  - [ ] 4.1 Add controller methods to `backend/controllers/activityLogController.js`
    - Implement `getSettings(req, res)` - returns current retention settings
    - Implement `updateSettings(req, res)` - validates and updates settings
    - Handle validation errors with 400 status and descriptive messages
    - Handle server errors with 500 status
    - Log all settings changes for audit
    - _Requirements: 2.1, 2.2, 2.6, 8.5_
  
  - [ ] 4.2 Add routes to `backend/routes/activityLogRoutes.js`
    - Add GET /settings route
    - Add PUT /settings route
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 4.3 Write unit tests for settings controller
    - Test getSettings returns 200 with current settings
    - Test updateSettings validates request body
    - Test updateSettings returns 400 for missing fields
    - Test updateSettings returns 400 for invalid ranges
    - Test updateSettings returns 200 with updated settings
    - Test error responses include descriptive messages
    - _Requirements: 2.1, 2.2, 2.6, 2.7_
  
  - [ ]* 4.4 Write property test for settings response structure
    - **Property 4: Settings Response Structure**
    - **Validates: Requirements 2.3, 8.3**
    - Generate random valid settings
    - Update settings via API
    - Retrieve settings via API
    - Assert response contains maxAgeDays and maxCount fields
    - Assert both fields are integers
    - _Requirements: 2.3, 8.3_
  
  - [ ]* 4.5 Write property test for validation error messages
    - **Property 5: Validation Error Messages**
    - **Validates: Requirements 2.6**
    - Generate random invalid settings
    - Attempt to update via API
    - Assert 400 status code
    - Assert error message describes which field failed and why
    - _Requirements: 2.6_

- [ ] 5. Checkpoint - Backend API complete
  - Ensure all backend tests pass
  - Test API endpoints manually with curl or Postman
  - Verify settings persist across application restarts
  - Ask the user if questions arise

- [ ] 6. Integrate settings with activity log cleanup
  - [ ] 6.1 Modify `backend/services/activityLogService.js`
    - Remove hardcoded RETENTION_POLICY constant
    - Import settingsService
    - Modify `cleanupOldEvents()` to read settings from settingsService
    - Use configured maxAgeDays for age-based cleanup
    - Use configured maxCount for count-based cleanup
    - Modify `getCleanupStats()` to include current settings
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  
  - [ ]* 6.2 Write unit tests for cleanup integration
    - Test cleanupOldEvents reads settings from settingsService
    - Test cleanupOldEvents uses configured maxAgeDays
    - Test cleanupOldEvents uses configured maxCount
    - Test getCleanupStats includes current settings
    - Test cleanup falls back to defaults if settings load fails
    - _Requirements: 5.1, 5.5_
  
  - [ ]* 6.3 Write property test for age-based cleanup
    - **Property 7: Age-Based Cleanup**
    - **Validates: Requirements 5.2**
    - Generate random maxAgeDays value (7-365)
    - Generate random set of activity events with various timestamps
    - Run cleanup with configured maxAgeDays
    - Assert all events older than (now - maxAgeDays) are deleted
    - Assert events within maxAgeDays are retained
    - _Requirements: 5.2_
  
  - [ ]* 6.4 Write property test for count-based cleanup
    - **Property 8: Count-Based Cleanup**
    - **Validates: Requirements 5.3**
    - Generate random maxCount value (100-10000)
    - Generate random set of activity events (count > maxCount)
    - Run cleanup with configured maxCount
    - Assert total remaining events equals maxCount
    - Assert oldest events were deleted first
    - _Requirements: 5.3_

- [ ] 7. Add API endpoint to frontend config
  - Add `ACTIVITY_LOG_SETTINGS` constant to `frontend/src/config.js`
  - Value: `${API_BASE_URL}/activity-logs/settings`
  - _Requirements: 2.1, 2.2_

- [ ] 8. Create activity log API service (if not exists)
  - Check if `frontend/src/services/activityLogApi.js` exists
  - If not, create it with existing functions (fetchRecentEvents, fetchCleanupStats)
  - Add `fetchRetentionSettings()` function - GET request to settings endpoint
  - Add `updateRetentionSettings(maxAgeDays, maxCount)` function - PUT request to settings endpoint
  - Handle network errors and return appropriate error messages
  - _Requirements: 2.1, 2.2_

- [ ] 9. Implement retention settings UI in BackupSettings component
  - [ ] 9.1 Add state management for retention settings
    - Add state: retentionSettings, retentionLoading, retentionError, retentionMessage, retentionValidationErrors
    - Add useEffect to fetch settings when Misc tab becomes active
    - _Requirements: 3.1_
  
  - [ ] 9.2 Implement retention settings functions
    - Implement `fetchRetentionSettings()` - calls API and updates state
    - Implement `validateRetentionSettings()` - client-side validation
    - Implement `handleRetentionInputChange(field, value)` - updates state and clears errors
    - Implement `handleSaveRetentionSettings()` - validates, calls API, shows success/error
    - _Requirements: 3.4, 3.6, 3.7, 3.8, 3.9_
  
  - [ ] 9.3 Add retention settings UI section in Misc tab
    - Add section before existing Activity Log section
    - Add heading "📋 Activity Log Retention Policy"
    - Add description text
    - Add form with two input fields (maxAgeDays, maxCount)
    - Add labels, hints, and validation error displays
    - Add Save button (disabled during save)
    - Add success/error message display
    - Add impact visualization showing current stats
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 7.5_
  
  - [ ] 9.4 Update activity log display to table format
    - Replace card-based layout with HTML table
    - Add three columns: Time, Event Type, Details
    - Add `formatEventType()` helper function to format event_type field
    - Display event_type as styled badge with entity-specific colors
    - Display user_action in Details column
    - Maintain existing controls (display limit selector, load more button)
    - _Requirements: 3.1_

- [ ] 10. Add CSS styling for retention settings and activity log table
  - Add styles to `frontend/src/components/BackupSettings.css`
  - Style `.retention-settings-form` container
  - Style `.retention-impact-info` for stats display
  - Style `.activity-table-container` for table wrapper with overflow
  - Style `.activity-table` with borders, spacing, and responsive behavior
  - Style `.activity-col-time`, `.activity-col-type`, `.activity-col-details` columns
  - Style `.activity-table-row` with hover effects
  - Style `.event-type-badge` for event type display
  - Style `.event-type-{entity_type}` variants for different entity types
  - Reuse existing form styles (`.form-group`, `.field-hint`, `.validation-error`, `.save-button`)
  - Ensure consistent spacing and alignment with other sections
  - _Requirements: 3.1_

- [ ] 11. Write frontend tests for retention settings
  - [ ]* 11.1 Write unit tests for retention settings UI
    - Test retention settings form renders with current values
    - Test input fields are bound to state
    - Test validation errors display for invalid input
    - Test save button is disabled during save operation
    - Test success message displays after successful save
    - Test error message displays after failed save
    - Test impact visualization displays current stats
    - Test settings are fetched when Misc tab becomes active
    - Test activity log table renders with correct columns
    - Test event type badges display correctly
    - Test formatEventType helper function
    - _Requirements: 3.1, 3.2, 3.4, 3.7, 3.8, 3.9, 4.1, 4.2_
  
  - [ ]* 11.2 Write property test for client-side validation
    - **Property 6: Client-Side Validation**
    - **Validates: Requirements 3.4, 7.6**
    - Generate random input values (including invalid ones)
    - Simulate user input in form fields
    - Assert validation errors appear for invalid values
    - Assert save button is disabled when validation fails
    - _Requirements: 3.4, 7.6_
  
  - [ ]* 11.3 Write property test for impact calculation
    - **Property 10: Impact Calculation Accuracy**
    - **Validates: Requirements 4.3**
    - Generate random activity events with various timestamps
    - Generate random retention settings
    - Calculate impact (events that would be deleted)
    - Assert calculation matches actual cleanup behavior
    - _Requirements: 4.3_
  
  - [ ]* 11.4 Write property test for timestamp formatting
    - **Property 11: Timestamp Formatting Consistency**
    - **Validates: Requirements 4.4**
    - Generate random ISO timestamps (various ages)
    - Format as human-readable age
    - Assert format uses appropriate units (minutes/hours/days)
    - Assert calculations are accurate
    - _Requirements: 4.4_

- [ ] 12. Integration testing
  - [ ]* 12.1 Write integration test for full settings flow
    - Test fetch settings → modify → save → verify persistence
    - Test settings update triggers stats refresh
    - Test error handling for network failures
    - Test default values are used when settings don't exist
    - Test cleanup job uses updated settings on next run
    - _Requirements: 1.2, 1.3, 1.5, 5.5, 6.3_

- [ ] 13. Final checkpoint - Feature complete
  - Run all backend tests (unit + property)
  - Run all frontend tests (unit + property + integration)
  - Test full user flow in browser:
    - Open Settings → Misc tab
    - Verify current settings display
    - Modify retention values
    - Save and verify success message
    - Refresh page and verify settings persist
    - Check activity log stats reflect new policy
  - Verify cleanup job uses new settings (check logs after 2:00 AM or trigger manually)
  - Ensure all tests pass
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end functionality
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- The feature maintains backward compatibility - existing installations will use default values until users configure custom settings
- All database operations use parameterized queries for security
- Client-side validation is for UX; server-side validation is mandatory
- Settings are stored as strings in database but parsed to integers in service layer
- No caching is used - settings are read from database on each access for consistency
