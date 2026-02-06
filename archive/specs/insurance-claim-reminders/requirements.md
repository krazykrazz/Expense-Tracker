# Requirements Document

## Introduction

This feature introduces a reminder/alert system for medical expenses that have an insurance claim status of "In Progress". The system will notify users when insurance claims have been pending for an extended period, helping them follow up with their insurance providers. This extends the existing reminder infrastructure used for credit card payments and loan payment reminders, following the same compact banner pattern.

Additionally, this feature standardizes the existing budget alert system to use the same reminder banner framework, ensuring visual and behavioral consistency across all alert types.

## Glossary

- **Insurance_Claim_Reminder_System**: The subsystem responsible for tracking and alerting users about pending insurance claims
- **Medical_Expense**: An expense with type "Tax - Medical" that may have insurance tracking enabled
- **Claim_Status**: The current state of an insurance claim: "Not Claimed", "In Progress", "Paid", or "Denied"
- **In_Progress_Expense**: A medical expense with insurance_eligible = true and claim_status = "in_progress"
- **Reminder_Threshold**: The configurable number of days after which an "In Progress" claim triggers a reminder (default: 30 days)
- **Reminder_Banner**: A compact UI component that displays dismissible alerts, following the pattern of CreditCardReminderBanner and LoanPaymentReminderBanner
- **Budget_Alert**: An existing alert system for budget threshold warnings that will be migrated to use the reminder banner framework

## Requirements

### Requirement 1: Query In-Progress Insurance Claims

**User Story:** As a user, I want the system to identify medical expenses with pending insurance claims, so that I can be reminded to follow up on them.

#### Acceptance Criteria

1. WHEN the reminder status is requested, THE Insurance_Claim_Reminder_System SHALL query all medical expenses where insurance_eligible = true AND claim_status = "in_progress"
2. WHEN calculating days pending, THE Insurance_Claim_Reminder_System SHALL compute the number of days between the expense date and the current date
3. WHEN filtering pending claims, THE Insurance_Claim_Reminder_System SHALL only include expenses where days pending exceeds the reminder threshold
4. THE Insurance_Claim_Reminder_System SHALL return the count of pending claims along with detailed expense information

### Requirement 2: Display Insurance Claim Reminder Banner

**User Story:** As a user, I want to see a visual reminder when I have insurance claims that have been pending for too long, so that I can take action.

#### Acceptance Criteria

1. WHEN there are pending insurance claims exceeding the threshold, THE Insurance_Claim_Reminder_System SHALL display a reminder banner in the UI
2. WHEN displaying the banner, THE Insurance_Claim_Reminder_System SHALL show the expense place/description, amount, and days pending
3. WHEN multiple claims are pending, THE Insurance_Claim_Reminder_System SHALL display a summary count with expandable details
4. THE Insurance_Claim_Reminder_System SHALL use a distinct visual style (green/teal) to differentiate from credit card (yellow/red) and loan (blue/purple) reminders
5. WHEN the user dismisses the banner, THE Insurance_Claim_Reminder_System SHALL hide it for the current session

### Requirement 3: Navigate to Expense Details

**User Story:** As a user, I want to click on a reminder to navigate to the relevant expense or view, so that I can update the claim status.

#### Acceptance Criteria

1. WHEN the user clicks on a single-claim reminder, THE Insurance_Claim_Reminder_System SHALL navigate to the Tax Deductible view
2. WHEN the user clicks on a multi-claim reminder, THE Insurance_Claim_Reminder_System SHALL navigate to the Tax Deductible view with the Insurance filter set to "In Progress"
3. WHEN navigating, THE Insurance_Claim_Reminder_System SHALL scroll to or highlight the relevant expense section

### Requirement 4: Configurable Reminder Threshold

**User Story:** As a user, I want to configure how long a claim should be pending before I'm reminded, so that I can customize the reminder timing to my needs.

#### Acceptance Criteria

1. THE Insurance_Claim_Reminder_System SHALL use a default threshold of 30 days for triggering reminders
2. WHERE a custom threshold is configured, THE Insurance_Claim_Reminder_System SHALL use the configured value instead of the default
3. WHEN the threshold is changed, THE Insurance_Claim_Reminder_System SHALL immediately apply the new threshold to pending claim calculations

### Requirement 5: Integration with Existing Reminder System

**User Story:** As a developer, I want the insurance claim reminders to integrate with the existing reminder infrastructure, so that the codebase remains consistent and maintainable.

#### Acceptance Criteria

1. THE Insurance_Claim_Reminder_System SHALL extend the existing reminderService.js with a new getInsuranceClaimReminders() method
2. THE Insurance_Claim_Reminder_System SHALL include insurance claim reminders in the getReminderStatus() response
3. THE Insurance_Claim_Reminder_System SHALL follow the same API response structure as credit card and loan payment reminders
4. THE Insurance_Claim_Reminder_System SHALL use the existing reminder banner component patterns for consistency

### Requirement 6: Standardize Budget Alerts to Reminder Framework

**User Story:** As a user, I want all alerts to have a consistent look and behavior, so that the interface feels cohesive and predictable.

#### Acceptance Criteria

1. WHEN budget thresholds are exceeded, THE Budget_Alert SHALL display using the same compact reminder banner pattern as credit card and loan reminders
2. THE Budget_Alert SHALL support session-based dismissal like other reminder banners
3. THE Budget_Alert SHALL use a distinct color scheme (orange/amber) to indicate budget warnings while maintaining visual consistency with other reminder banners
4. WHEN the user clicks on a budget alert banner, THE Budget_Alert SHALL navigate to the expense list filtered by that category
5. THE Budget_Alert SHALL display category name, current spending percentage, and budget limit in a compact format
6. WHEN multiple budget alerts exist, THE Budget_Alert SHALL display a summary count with the ability to see individual alerts

### Requirement 7: Dedicated Notifications Section

**User Story:** As a user, I want notifications/reminders to be visually separated from the Monthly Summary data, so that I can clearly distinguish between alerts and financial information.

#### Acceptance Criteria

1. THE Notifications_Section SHALL appear above the Monthly Summary section in the SummaryPanel
2. THE Notifications_Section SHALL display a "Notifications" header with a count badge showing the total number of active notifications
3. WHEN there are no active notifications, THE Notifications_Section SHALL not render
4. THE Notifications_Section SHALL be collapsible, allowing users to minimize it while keeping the badge visible
5. THE Notifications_Section SHALL contain all reminder banners (credit card, loan, billing cycle, insurance claims, budget alerts, data reminders)
