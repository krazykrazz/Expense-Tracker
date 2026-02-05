# Requirements Document

## Introduction

The Activity Log feature provides a centralized event tracking system that captures key user actions and system events within the expense tracking application. This feature establishes an extensible framework for event logging, with the initial implementation focusing on a "recent activity" view accessible through the Settings interface. The system will track financial data modifications (expenses, fixed expenses, loans, investments) and status changes (insurance claims), providing users with visibility into their recent interactions with the application.

## Glossary

- **Activity_Log_System**: The centralized event tracking and storage system
- **Event**: A recorded action or state change in the application
- **Event_Type**: The category of event (e.g., "expense_added", "loan_updated")
- **Entity_Type**: The type of data being acted upon (e.g., "expense", "loan", "investment")
- **Entity_ID**: The unique identifier of the specific record being acted upon
- **User_Action**: The human-readable description of what occurred
- **Event_Metadata**: Additional contextual information stored as JSON
- **Recent_Activity_View**: The UI component displaying recent events in Settings->Misc
- **Retention_Policy**: Rules governing how long activity logs are stored
- **Event_Emitter**: A pattern for publishing events from various parts of the application

## Requirements

### Requirement 1: Event Storage and Persistence

**User Story:** As a system, I want to store activity events in a persistent database, so that user actions are recorded and can be retrieved later.

#### Acceptance Criteria

1. THE Activity_Log_System SHALL store events in a dedicated database table with fields: id, event_type, entity_type, entity_id, user_action, metadata, timestamp
2. WHEN an event is recorded, THE Activity_Log_System SHALL automatically set the timestamp to the current date and time
3. THE Activity_Log_System SHALL store metadata as JSON to support flexible event-specific data
4. WHEN storing an event, THE Activity_Log_System SHALL validate that event_type and entity_type are non-empty strings
5. THE Activity_Log_System SHALL support NULL values for entity_id when events are not associated with specific records

### Requirement 2: Expense Event Tracking

**User Story:** As a user, I want my expense modifications to be logged, so that I can see a history of my expense-related actions.

#### Acceptance Criteria

1. WHEN a user creates a new expense, THE Activity_Log_System SHALL record an event with event_type "expense_added"
2. WHEN a user updates an existing expense, THE Activity_Log_System SHALL record an event with event_type "expense_updated"
3. WHEN a user deletes an expense, THE Activity_Log_System SHALL record an event with event_type "expense_deleted"
4. WHEN recording expense events, THE Activity_Log_System SHALL include the expense amount and category in the metadata
5. WHEN recording expense events, THE Activity_Log_System SHALL store the expense ID as entity_id

### Requirement 3: Fixed Expense Event Tracking

**User Story:** As a user, I want my fixed expense modifications to be logged, so that I can track changes to my recurring expenses.

#### Acceptance Criteria

1. WHEN a user creates a new fixed expense, THE Activity_Log_System SHALL record an event with event_type "fixed_expense_added"
2. WHEN a user updates an existing fixed expense, THE Activity_Log_System SHALL record an event with event_type "fixed_expense_updated"
3. WHEN a user deletes a fixed expense, THE Activity_Log_System SHALL record an event with event_type "fixed_expense_deleted"
4. WHEN recording fixed expense events, THE Activity_Log_System SHALL include the expense name and amount in the metadata
5. WHEN recording fixed expense events, THE Activity_Log_System SHALL store the fixed expense ID as entity_id

### Requirement 4: Loan Event Tracking

**User Story:** As a user, I want my loan modifications to be logged, so that I can see a history of changes to my debt accounts.

#### Acceptance Criteria

1. WHEN a user creates a new loan, THE Activity_Log_System SHALL record an event with event_type "loan_added"
2. WHEN a user updates an existing loan, THE Activity_Log_System SHALL record an event with event_type "loan_updated"
3. WHEN a user deletes a loan, THE Activity_Log_System SHALL record an event with event_type "loan_deleted"
4. WHEN recording loan events, THE Activity_Log_System SHALL include the loan name and loan type in the metadata
5. WHEN recording loan events, THE Activity_Log_System SHALL store the loan ID as entity_id

### Requirement 5: Investment Event Tracking

**User Story:** As a user, I want my investment modifications to be logged, so that I can track changes to my investment accounts.

#### Acceptance Criteria

1. WHEN a user creates a new investment, THE Activity_Log_System SHALL record an event with event_type "investment_added"
2. WHEN a user updates an existing investment, THE Activity_Log_System SHALL record an event with event_type "investment_updated"
3. WHEN a user deletes an investment, THE Activity_Log_System SHALL record an event with event_type "investment_deleted"
4. WHEN recording investment events, THE Activity_Log_System SHALL include the investment name and account type in the metadata
5. WHEN recording investment events, THE Activity_Log_System SHALL store the investment ID as entity_id

### Requirement 6: Insurance Status Event Tracking

**User Story:** As a user, I want insurance status changes to be logged, so that I can track when medical expenses are marked as paid.

#### Acceptance Criteria

1. WHEN a user marks a medical expense insurance status as "Paid", THE Activity_Log_System SHALL record an event with event_type "insurance_status_changed"
2. WHEN recording insurance status events, THE Activity_Log_System SHALL include the previous status and new status in the metadata
3. WHEN recording insurance status events, THE Activity_Log_System SHALL include the expense place and amount in the metadata
4. WHEN recording insurance status events, THE Activity_Log_System SHALL store the expense ID as entity_id
5. THE Activity_Log_System SHALL only log insurance status changes when the status actually changes (not on every update)

### Requirement 6A: Budget Event Tracking

**User Story:** As a user, I want budget modifications to be logged, so that I can track changes to my spending limits.

#### Acceptance Criteria

1. WHEN a user creates a new budget, THE Activity_Log_System SHALL record an event with event_type "budget_added"
2. WHEN a user updates an existing budget, THE Activity_Log_System SHALL record an event with event_type "budget_updated"
3. WHEN a user deletes a budget, THE Activity_Log_System SHALL record an event with event_type "budget_deleted"
4. WHEN recording budget events, THE Activity_Log_System SHALL include the category and limit amount in the metadata
5. WHEN recording budget events, THE Activity_Log_System SHALL store the budget ID as entity_id

### Requirement 6B: Payment Method Event Tracking

**User Story:** As a user, I want payment method modifications to be logged, so that I can track changes to my credit cards and payment accounts.

#### Acceptance Criteria

1. WHEN a user creates a new payment method, THE Activity_Log_System SHALL record an event with event_type "payment_method_added"
2. WHEN a user updates an existing payment method, THE Activity_Log_System SHALL record an event with event_type "payment_method_updated"
3. WHEN a user deactivates a payment method, THE Activity_Log_System SHALL record an event with event_type "payment_method_deactivated"
4. WHEN recording payment method events, THE Activity_Log_System SHALL include the method name and payment type in the metadata
5. WHEN recording payment method events, THE Activity_Log_System SHALL store the payment method ID as entity_id

### Requirement 6C: Loan Payment Event Tracking

**User Story:** As a user, I want loan payments to be logged, so that I can see a history of my debt payments.

#### Acceptance Criteria

1. WHEN a user records a loan payment, THE Activity_Log_System SHALL record an event with event_type "loan_payment_added"
2. WHEN a user updates a loan payment, THE Activity_Log_System SHALL record an event with event_type "loan_payment_updated"
3. WHEN a user deletes a loan payment, THE Activity_Log_System SHALL record an event with event_type "loan_payment_deleted"
4. WHEN recording loan payment events, THE Activity_Log_System SHALL include the loan name and payment amount in the metadata
5. WHEN recording loan payment events, THE Activity_Log_System SHALL store the loan payment ID as entity_id

### Requirement 6D: Backup and Restore Event Tracking

**User Story:** As a user, I want backup and restore operations to be logged, so that I can track when data backups were created or restored.

#### Acceptance Criteria

1. WHEN a backup is created, THE Activity_Log_System SHALL record an event with event_type "backup_created"
2. WHEN a backup is restored, THE Activity_Log_System SHALL record an event with event_type "backup_restored"
3. WHEN recording backup events, THE Activity_Log_System SHALL include the backup filename in the metadata
4. WHEN recording restore events, THE Activity_Log_System SHALL include the source filename in the metadata
5. WHEN recording backup/restore events, THE Activity_Log_System SHALL set entity_id to NULL as these are system-level events

### Requirement 7: Recent Activity View

**User Story:** As a user, I want to view my recent activity in the Settings interface, so that I can see what actions I've performed recently.

#### Acceptance Criteria

1. WHEN a user navigates to Settings->Misc, THE Recent_Activity_View SHALL display a list of recent events
2. THE Recent_Activity_View SHALL display events in reverse chronological order (newest first)
3. WHEN displaying an event, THE Recent_Activity_View SHALL show the user_action text and timestamp
4. WHEN displaying an event, THE Recent_Activity_View SHALL format the timestamp in a human-readable format (e.g., "2 hours ago", "Yesterday at 3:45 PM")
5. THE Recent_Activity_View SHALL display a maximum of 50 recent events

### Requirement 8: Activity Log Retrieval

**User Story:** As a system, I want to efficiently retrieve recent activity logs, so that the UI can display them quickly.

#### Acceptance Criteria

1. THE Activity_Log_System SHALL provide an API endpoint to retrieve recent activity logs
2. WHEN retrieving activity logs, THE Activity_Log_System SHALL return events ordered by timestamp descending
3. THE Activity_Log_System SHALL support limiting the number of returned events via a query parameter
4. WHEN no limit is specified, THE Activity_Log_System SHALL default to returning the 50 most recent events
5. THE Activity_Log_System SHALL return events with all fields including parsed metadata

### Requirement 9: Retention Policy and Management

**User Story:** As a system administrator, I want to configure how activity logs are stored and displayed, so that I can balance between historical visibility and database size.

#### Acceptance Criteria

1. THE Activity_Log_System SHALL support configurable retention policies for maximum days (default 90 days) and maximum entries (default 1000 entries)
2. THE Activity_Log_System SHALL automatically delete events that exceed either the age limit OR the entry count limit
3. WHEN the entry count exceeds the maximum, THE Activity_Log_System SHALL delete the oldest events first
4. THE Activity_Log_System SHALL run the cleanup process daily at a scheduled time
5. WHEN cleaning up old events, THE Activity_Log_System SHALL delete events in batches to avoid locking the database

### Requirement 9A: Activity Log Display Configuration

**User Story:** As a user, I want to control how many recent activities are displayed, so that I can see more or fewer events based on my preference.

#### Acceptance Criteria

1. THE Recent_Activity_View SHALL provide a dropdown to select display limit (25, 50, 100, 200 events)
2. WHEN a user changes the display limit, THE Recent_Activity_View SHALL remember the preference in browser local storage
3. WHEN loading the Recent_Activity_View, THE Activity_Log_System SHALL use the user's saved preference or default to 50 events
4. THE Recent_Activity_View SHALL display the current count of visible events (e.g., "Showing 50 of 150 events")
5. THE Recent_Activity_View SHALL provide a "Load More" button to fetch additional older events if available

### Requirement 9B: Activity Log Cleanup Monitoring

**User Story:** As a system administrator, I want to monitor cleanup operations, so that I can verify the retention policy is working correctly.

#### Acceptance Criteria

1. WHEN the cleanup process runs, THE Activity_Log_System SHALL log the number of events deleted
2. WHEN the cleanup process runs, THE Activity_Log_System SHALL log the oldest remaining event timestamp
3. IF the cleanup process fails, THE Activity_Log_System SHALL log the error and continue normal operation
4. THE Activity_Log_System SHALL provide an API endpoint to retrieve cleanup statistics (last run time, events deleted, oldest event)
5. THE Recent_Activity_View SHALL display the retention policy settings (e.g., "Keeping last 90 days or 1000 events")

### Requirement 10: Event Logging Integration

**User Story:** As a developer, I want a simple API for logging events, so that I can easily add event tracking to existing code.

#### Acceptance Criteria

1. THE Activity_Log_System SHALL provide a service method for logging events that accepts event_type, entity_type, entity_id, user_action, and metadata
2. WHEN logging an event, THE Activity_Log_System SHALL not throw errors if the logging fails (fail silently to avoid breaking main functionality)
3. WHEN logging an event fails, THE Activity_Log_System SHALL log the error for debugging purposes
4. THE Activity_Log_System SHALL validate required fields (event_type, entity_type, user_action) before attempting to store
5. THE Activity_Log_System SHALL automatically serialize metadata objects to JSON strings
