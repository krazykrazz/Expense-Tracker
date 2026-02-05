# Implementation Plan: Activity Log

## Overview

This implementation plan breaks down the Activity Log feature into discrete, incremental tasks following the layered architecture pattern (Controller → Service → Repository → Database). The plan starts with database schema and core infrastructure, then adds event logging integration points, and finally implements the UI. Each task builds on previous work to ensure continuous integration and early validation.

## Tasks

- [ ] 1. Set up database schema and migration
  - Create `activity_logs` table with all required fields (id, event_type, entity_type, entity_id, user_action, metadata, timestamp)
  - Add indexes for timestamp (DESC) and entity lookups
  - Create migration script following the pattern in `backend/database/migrations.js`
  - Update `initializeDatabase()` in `backend/database/db.js`
  - Update `initializeTestDatabase()` in `backend/database/db.js` to match production schema
  - _Requirements: 1.1_

- [ ] 2. Implement repository layer
  - [ ] 2.1 Create `backend/repositories/activityLogRepository.js`
    - Implement `insert(event)` method
    - Implement `findRecent(limit, offset)` method with pagination
    - Implement `count()` method for total event count
    - Implement `deleteOlderThan(date)` method for age-based cleanup
    - Implement `deleteExcessEvents(maxCount)` method for count-based cleanup
    - Implement `getOldestEventTimestamp()` method
    - _Requirements: 1.1, 8.1, 8.2, 8.3, 9.2, 9.3_
  
  - [ ] 2.2 Write property test for repository round-trip
    - **Property 1: Event Storage Round Trip**
    - **Validates: Requirements 1.1, 1.3, 8.5**
  
  - [ ] 2.3 Write property test for repository ordering
    - **Property 7: Reverse Chronological Ordering**
    - **Validates: Requirements 8.2**
  
  - [ ] 2.4 Write property tests for cleanup operations
    - **Property 11: Retention Policy Age-Based Cleanup**
    - **Property 12: Retention Policy Count-Based Cleanup**
    - **Validates: Requirements 9.2, 9.3**

- [ ] 3. Implement service layer
  - [ ] 3.1 Create `backend/services/activityLogService.js`
    - Implement `logEvent(eventType, entityType, entityId, userAction, metadata)` with validation
    - Implement automatic timestamp assignment
    - Implement metadata JSON serialization
    - Implement error handling (try-catch, silent failure, error logging)
    - Implement `getRecentEvents(limit, offset)` with metadata parsing
    - Implement `cleanupOldEvents()` with configurable retention policy
    - Implement `getCleanupStats()` for monitoring
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 8.1, 8.4, 8.5, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ] 3.2 Write property test for automatic timestamp assignment
    - **Property 2: Automatic Timestamp Assignment**
    - **Validates: Requirements 1.2**
  
  - [ ] 3.3 Write property test for required field validation
    - **Property 3: Required Field Validation**
    - **Validates: Requirements 1.4, 10.4**
  
  - [ ] 3.4 Write property test for metadata serialization round-trip
    - **Property 17: Metadata Serialization Round Trip**
    - **Validates: Requirements 10.5**
  
  - [ ] 3.5 Write property test for logging failure resilience
    - **Property 16: Logging Failure Resilience**
    - **Validates: Requirements 10.2, 10.3**
  
  - [ ] 3.6 Write unit tests for cleanup statistics logging
    - **Property 15: Cleanup Statistics Logging**
    - **Validates: Requirements 9B.1, 9B.2**

- [ ] 4. Implement scheduled cleanup job
  - [ ] 4.1 Add node-cron dependency to `backend/package.json`
    - Install node-cron for scheduled task execution
    - _Requirements: 9.4_
  
  - [ ] 4.2 Create cleanup scheduler in `backend/server.js`
    - Schedule daily cleanup at 2:00 AM using node-cron
    - Call `activityLogService.cleanupOldEvents()`
    - Log cleanup results (deleted count, oldest remaining)
    - Handle errors gracefully
    - _Requirements: 9.4, 9B.1, 9B.2, 9B.3_

- [ ] 5. Implement controller and routes
  - [ ] 5.1 Create `backend/controllers/activityLogController.js`
    - Implement `getRecentEvents` handler with query parameter validation
    - Implement `getCleanupStats` handler
    - Add error handling for 400 and 500 responses
    - _Requirements: 8.1, 8.3, 8.4, 9B.4_
  
  - [ ] 5.2 Create `backend/routes/activityLogRoutes.js`
    - Add GET `/api/activity-logs` route
    - Add GET `/api/activity-logs/stats` route
    - Register routes in `backend/server.js`
    - _Requirements: 8.1, 9B.4_
  
  - [ ] 5.3 Add API endpoints to `frontend/src/config.js`
    - Add `ACTIVITY_LOGS: '/api/activity-logs'` to API_ENDPOINTS
    - Add `ACTIVITY_LOGS_STATS: '/api/activity-logs/stats'` to API_ENDPOINTS
    - _Requirements: 8.1, 9B.4_
  
  - [ ] 5.4 Write property test for API pagination
    - **Property 10: API Pagination Limit**
    - **Validates: Requirements 8.3**

- [ ] 6. Checkpoint - Verify core infrastructure
  - Ensure all tests pass
  - Test API endpoints manually (curl or browser)
  - Verify database schema is correct
  - Ask the user if questions arise

- [ ] 7. Integrate event logging into expense service
  - [ ] 7.1 Add activity log calls to `backend/services/expenseService.js`
    - Call `activityLogService.logEvent()` after successful expense creation
    - Call `activityLogService.logEvent()` after successful expense update
    - Call `activityLogService.logEvent()` after successful expense deletion
    - Include amount, category, date, and place in metadata
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ] 7.2 Write integration test for expense event logging
    - Test that creating/updating/deleting expenses logs correct events
    - **Property 4: Entity CRUD Event Tracking** (expense portion)
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 8. Integrate event logging into fixed expense service
  - [ ] 8.1 Add activity log calls to `backend/services/fixedExpenseService.js`
    - Call `activityLogService.logEvent()` after successful fixed expense creation
    - Call `activityLogService.logEvent()` after successful fixed expense update
    - Call `activityLogService.logEvent()` after successful fixed expense deletion
    - Include name and amount in metadata
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ] 8.2 Write integration test for fixed expense event logging
    - **Property 4: Entity CRUD Event Tracking** (fixed_expense portion)
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [ ] 9. Integrate event logging into loan service
  - [ ] 9.1 Add activity log calls to `backend/services/loanService.js`
    - Call `activityLogService.logEvent()` after successful loan creation
    - Call `activityLogService.logEvent()` after successful loan update
    - Call `activityLogService.logEvent()` after successful loan deletion
    - Include loan name and loan type in metadata
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [ ] 9.2 Write integration test for loan event logging
    - **Property 4: Entity CRUD Event Tracking** (loan portion)
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [ ] 10. Integrate event logging into investment service
  - [ ] 10.1 Add activity log calls to `backend/services/investmentService.js`
    - Call `activityLogService.logEvent()` after successful investment creation
    - Call `activityLogService.logEvent()` after successful investment update
    - Call `activityLogService.logEvent()` after successful investment deletion
    - Include investment name and account type in metadata
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ] 10.2 Write integration test for investment event logging
    - **Property 4: Entity CRUD Event Tracking** (investment portion)
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [ ] 11. Integrate event logging for insurance status changes
  - [ ] 11.1 Add insurance status change logging to `backend/services/expenseService.js`
    - Detect when insurance_status field changes during expense update
    - Call `activityLogService.logEvent()` only when status actually changes
    - Include previous status, new status, place, and amount in metadata
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 11.2 Write property test for insurance status change logging
    - **Property 5: Insurance Status Change Logging**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [ ] 12. Integrate event logging into budget service
  - [ ] 12.1 Add activity log calls to `backend/services/budgetService.js`
    - Call `activityLogService.logEvent()` after successful budget creation
    - Call `activityLogService.logEvent()` after successful budget update
    - Call `activityLogService.logEvent()` after successful budget deletion
    - Include category and limit amount in metadata
    - _Requirements: 6A.1, 6A.2, 6A.3, 6A.4, 6A.5_
  
  - [ ] 12.2 Write integration test for budget event logging
    - **Property 4: Entity CRUD Event Tracking** (budget portion)
    - **Validates: Requirements 6A.1, 6A.2, 6A.3, 6A.4, 6A.5**

- [ ] 13. Integrate event logging into payment method service
  - [ ] 13.1 Add activity log calls to `backend/services/paymentMethodService.js`
    - Call `activityLogService.logEvent()` after successful payment method creation
    - Call `activityLogService.logEvent()` after successful payment method update
    - Call `activityLogService.logEvent()` when payment method is deactivated
    - Include method name and payment type in metadata
    - _Requirements: 6B.1, 6B.2, 6B.3, 6B.4, 6B.5_
  
  - [ ] 13.2 Write integration test for payment method event logging
    - **Property 4: Entity CRUD Event Tracking** (payment_method portion)
    - **Validates: Requirements 6B.1, 6B.2, 6B.3, 6B.4, 6B.5**

- [ ] 14. Integrate event logging into loan payment service
  - [ ] 14.1 Add activity log calls to `backend/services/loanPaymentService.js`
    - Call `activityLogService.logEvent()` after successful loan payment creation
    - Call `activityLogService.logEvent()` after successful loan payment update
    - Call `activityLogService.logEvent()` after successful loan payment deletion
    - Include loan name and payment amount in metadata
    - _Requirements: 6C.1, 6C.2, 6C.3, 6C.4, 6C.5_
  
  - [ ] 14.2 Write integration test for loan payment event logging
    - **Property 4: Entity CRUD Event Tracking** (loan_payment portion)
    - **Validates: Requirements 6C.1, 6C.2, 6C.3, 6C.4, 6C.5**

- [ ] 15. Integrate event logging into backup service
  - [ ] 15.1 Add activity log calls to `backend/services/backupService.js`
    - Call `activityLogService.logEvent()` after successful backup creation
    - Call `activityLogService.logEvent()` after successful backup restoration
    - Include filename and size in metadata
    - Set entity_id to NULL for system events
    - _Requirements: 6D.1, 6D.2, 6D.3, 6D.4, 6D.5_
  
  - [ ] 15.2 Write property test for system event null entity ID
    - **Property 6: System Event Null Entity ID**
    - **Validates: Requirements 6D.1, 6D.2, 6D.3, 6D.4, 6D.5**

- [ ] 16. Checkpoint - Verify all event logging integrations
  - Ensure all integration tests pass
  - Manually test each entity CRUD operation and verify events are logged
  - Check that logging failures don't break main functionality
  - Ask the user if questions arise

- [ ] 17. Create frontend API service
  - [ ] 17.1 Create `frontend/src/services/activityLogApi.js`
    - Implement `fetchRecentEvents(limit, offset)` function
    - Implement `fetchCleanupStats()` function
    - Use API_ENDPOINTS constants from config.js
    - Add error handling for network failures
    - _Requirements: 8.1, 9B.4_

- [ ] 18. Implement ActivityLogView component
  - [ ] 18.1 Create ActivityLogView component in `frontend/src/components/BackupSettings.jsx`
    - Add new section in Misc tab for "Recent Activity"
    - Implement state management (events, loading, displayLimit, hasMore, stats)
    - Implement `fetchEvents()` method to load events from API
    - Implement event list rendering with user_action and timestamp
    - Implement timestamp formatting (human-readable: "2 hours ago", "Yesterday at 3:45 PM")
    - Display retention policy information from stats
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9B.5_
  
  - [ ] 18.2 Write property test for timestamp human readability
    - **Property 8: Timestamp Human Readability**
    - **Validates: Requirements 7.4**
  
  - [ ] 18.3 Write property test for event display completeness
    - **Property 9: Event Display Completeness**
    - **Validates: Requirements 7.3**

- [ ] 19. Implement display limit selector
  - [ ] 19.1 Add display limit dropdown to ActivityLogView
    - Create dropdown with options: 25, 50, 100, 200
    - Implement `handleLimitChange()` to save preference to local storage
    - Load saved preference on component mount (default to 50)
    - Refetch events when limit changes
    - _Requirements: 9A.1, 9A.2, 9A.3_
  
  - [ ] 19.2 Write property test for display limit persistence
    - **Property 13: Display Limit Persistence**
    - **Validates: Requirements 9A.2, 9A.3**

- [ ] 20. Implement Load More functionality
  - [ ] 20.1 Add Load More button to ActivityLogView
    - Display button only when hasMore is true
    - Implement `loadMore()` method to fetch additional events with offset
    - Append new events to existing list
    - Update hasMore based on response
    - _Requirements: 9A.5_
  
  - [ ] 20.2 Add visible event count display
    - Show "Showing X of Y events" indicator
    - Update count when events are loaded or limit changes
    - _Requirements: 9A.4_
  
  - [ ] 20.3 Write property test for visible event count accuracy
    - **Property 14: Visible Event Count Accuracy**
    - **Validates: Requirements 9A.4**

- [ ] 21. Add CSS styling for ActivityLogView
  - [ ] 21.1 Add styles to `frontend/src/components/BackupSettings.css`
    - Style activity log section to match existing Settings UI
    - Style event list items with proper spacing and typography
    - Style display limit dropdown
    - Style Load More button
    - Style retention policy information display
    - Ensure responsive design for mobile devices
    - _Requirements: 7.1_

- [ ] 22. Final checkpoint and integration testing
  - [ ] 22.1 Run all backend tests
    - Run `npm test` in backend directory
    - Verify all unit tests and property tests pass
    - _Requirements: All_
  
  - [ ] 22.2 Run all frontend tests
    - Run `npm test` in frontend directory
    - Verify all component tests pass
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9A.1, 9A.2, 9A.3, 9A.4, 9A.5_
  
  - [ ] 22.3 Manual end-to-end testing
    - Perform various actions (add expense, update loan, etc.)
    - Navigate to Settings->Misc and verify events appear
    - Test display limit selector and Load More button
    - Verify timestamps are formatted correctly
    - Test that logging failures don't break main functionality
    - _Requirements: All_
  
  - [ ] 22.4 Verify cleanup job
    - Wait for scheduled cleanup or manually trigger
    - Verify old events are deleted according to retention policy
    - Check cleanup statistics are logged correctly
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9B.1, 9B.2, 9B.3_

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end flows
- The implementation follows the layered architecture: Database → Repository → Service → Controller → Frontend
- Event logging uses a "fire-and-forget" pattern to ensure failures don't impact main functionality
- The scheduled cleanup job runs daily to maintain database size
