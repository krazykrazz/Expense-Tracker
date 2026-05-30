# Requirements Document

## Introduction

Re-introduce a per-cycle "payment due date" field on billing cycle records to handle cases where the credit card's configured `payment_due_day` falls on a weekend. When a billing cycle has a `payment_due_date` override, the credit card payment reminder system uses that date instead of deriving the due date from the parent payment method's `payment_due_day`. This allows users to adjust the actual payment due date on a per-cycle basis (e.g., moved to the preceding Friday when the normal due day lands on a Saturday or Sunday).

## Glossary

- **Billing_Cycle**: A `credit_card_billing_cycles` record representing one statement period for a credit card, with start/end dates and balance information.
- **Payment_Due_Day**: The `payment_due_day` integer (1–31) configured on a `payment_methods` record, representing the recurring day of the month when payment is due.
- **Payment_Due_Date**: A new nullable `TEXT` column on `credit_card_billing_cycles` storing a specific `YYYY-MM-DD` date that overrides the derived due date for that cycle.
- **Derived_Due_Date**: The due date computed at display time as `payment_due_day` of the month following `cycle_end_date`, clamped to the last day of that month. This is the current behavior.
- **Effective_Due_Date**: The resolved due date for a billing cycle: `payment_due_date` if non-null, otherwise Derived_Due_Date. Used consistently across reminder service, frontend display, and reminder banners.
- **Reminder_Service**: The backend `reminderService` that calculates credit card payment reminders including days-until-due and overdue status.
- **Billing_Cycle_Scheduler**: The backend `billingCycleSchedulerService` that auto-generates billing cycle records on a cron schedule.
- **Billing_Cycle_History_Form**: The frontend form component (`BillingCycleHistoryForm`) used to enter or edit statement balance details for a billing cycle.
- **Unified_Billing_Cycle_List**: The frontend component (`UnifiedBillingCycleList`) that displays all billing cycles for a credit card.
- **Weekend_Adjustment**: The act of shifting a due date that falls on a Saturday or Sunday to the preceding Friday.

## Requirements

### Requirement 1: Database Schema — Add payment_due_date Column

**User Story:** As a developer, I want the billing cycle table to store an optional per-cycle payment due date, so that weekend-adjusted due dates can be persisted.

#### Acceptance Criteria

1. THE Database_Migration SHALL add a nullable `payment_due_date TEXT DEFAULT NULL` column to the `credit_card_billing_cycles` table.
2. THE Schema SHALL include a CHECK constraint ensuring `payment_due_date` is either NULL or matches the `YYYY-MM-DD` format pattern.
3. WHEN a Billing_Cycle record has `payment_due_date` set to NULL, THE system SHALL derive the due date from the parent payment method's Payment_Due_Day using the existing Derived_Due_Date logic.
4. THE Database_Migration SHALL preserve all existing Billing_Cycle records with `payment_due_date` set to NULL.
5. THE `backend/database/schema.js` consolidated schema SHALL be updated to include the new column and CHECK constraint so that test databases and fresh installs include it.

### Requirement 2: Backend Repository and Service — Persist payment_due_date

**User Story:** As a developer, I want the billing cycle repository to read and write the payment_due_date field, so that the value flows through the full backend stack.

#### Acceptance Criteria

1. WHEN a Billing_Cycle is created, THE Billing_Cycle_Repository SHALL accept an optional `payment_due_date` parameter and store the value in the database.
2. WHEN a Billing_Cycle is updated, THE Billing_Cycle_Repository SHALL accept an optional `payment_due_date` parameter and persist the updated value.
3. WHEN a Billing_Cycle is read, THE Billing_Cycle_Repository SHALL return the `payment_due_date` field in the result object.
4. THE Billing_Cycle_Controller SHALL accept `payment_due_date` in create and update request bodies and pass the value to the service layer.
5. IF `payment_due_date` is provided in a request body and the value is not a valid `YYYY-MM-DD` date string, THEN THE Billing_Cycle_Controller SHALL return a 400 error with a descriptive message.

### Requirement 3: Weekend Adjustment Logic

**User Story:** As a user, I want the system to automatically suggest a weekend-adjusted payment due date when auto-generating billing cycles, so that I see the correct business-day due date without manual entry.

#### Acceptance Criteria

1. THE Weekend_Adjustment_Utility SHALL accept a date in `YYYY-MM-DD` format and return the same date if it falls on a weekday (Monday–Friday).
2. WHEN the input date falls on a Saturday, THE Weekend_Adjustment_Utility SHALL return the preceding Friday's date.
3. WHEN the input date falls on a Sunday, THE Weekend_Adjustment_Utility SHALL return the preceding Friday's date.
4. WHEN the Billing_Cycle_Scheduler auto-generates a Billing_Cycle, THE Billing_Cycle_Scheduler SHALL compute the Derived_Due_Date from the payment method's Payment_Due_Day, apply Weekend_Adjustment, and store the result in `payment_due_date` only if the adjusted date differs from the Derived_Due_Date.
5. WHEN the Derived_Due_Date does not fall on a weekend, THE Billing_Cycle_Scheduler SHALL set `payment_due_date` to NULL for that cycle.
6. FOR ALL valid date inputs, applying Weekend_Adjustment and then checking the day of week SHALL yield a weekday (Monday–Friday) (round-trip property).
7. THE Weekend_Adjustment_Utility SHALL be implemented in `backend/utils/dateUtils.js` alongside the existing `calculateDaysUntilDue` function, and exported for use by both the scheduler and tests.

### Requirement 4: Reminder Service — Use payment_due_date Override

**User Story:** As a user, I want payment reminders to use the per-cycle adjusted due date when available, so that I am reminded based on the actual business-day due date rather than the generic configured day.

#### Acceptance Criteria

1. WHEN a Billing_Cycle has a non-null `payment_due_date`, THE Reminder_Service SHALL use that date to calculate days-until-due instead of deriving the date from Payment_Due_Day.
2. WHEN a Billing_Cycle has a null `payment_due_date`, THE Reminder_Service SHALL continue to derive the due date from the payment method's Payment_Due_Day using the existing logic.
3. THE Reminder_Service SHALL include the Effective_Due_Date (either `payment_due_date` override or Derived_Due_Date) in the credit card reminder response payload as an `effective_due_date` field.
4. WHEN the Effective_Due_Date is in the past relative to the reference date, THE Reminder_Service SHALL mark the card as overdue.
5. WHEN the Effective_Due_Date is within 7 days of the reference date, THE Reminder_Service SHALL mark the card as due-soon.
6. THE Reminder_Repository query (`getCreditCardsWithDueDates`) SHALL be updated to JOIN the most recent Billing_Cycle for each card and return its `payment_due_date` field, so the Reminder_Service can resolve the Effective_Due_Date without additional queries.

### Requirement 5: Frontend — Display and Edit payment_due_date

**User Story:** As a user, I want to see the adjusted payment due date in the billing cycle list and be able to edit it in the statement entry form, so that I can verify or override the weekend adjustment.

#### Acceptance Criteria

1. WHEN a Billing_Cycle has a non-null `payment_due_date`, THE Unified_Billing_Cycle_List SHALL display that date as the due date for the cycle.
2. WHEN a Billing_Cycle has a null `payment_due_date`, THE Unified_Billing_Cycle_List SHALL display the Derived_Due_Date computed from Payment_Due_Day and `cycle_end_date`.
3. THE Billing_Cycle_History_Form SHALL include an optional "Payment Due Date" date input field.
4. WHEN editing a Billing_Cycle that has a non-null `payment_due_date`, THE Billing_Cycle_History_Form SHALL pre-populate the date input with the existing value.
5. WHEN the user clears the payment due date field and saves, THE Billing_Cycle_History_Form SHALL send `payment_due_date` as null, reverting to the Derived_Due_Date.
6. THE CreditCard_Reminder_Banner SHALL display the Effective_Due_Date (override or derived) in the reminder message instead of showing only the generic "Due on day N of each month" text.

### Requirement 6: Frontend Due Date Derivation — Fallback Logic

**User Story:** As a developer, I want the frontend due date display to use a consistent fallback chain, so that the correct due date is always shown regardless of whether an override exists.

#### Acceptance Criteria

1. THE Unified_Billing_Cycle_List SHALL determine the display due date using the following priority: (a) `payment_due_date` from the Billing_Cycle record if non-null, (b) Derived_Due_Date computed via `deriveDueDate(cycle_end_date, payment_due_day)`.
2. FOR ALL Billing_Cycle records, the displayed due date SHALL be a valid `YYYY-MM-DD` date string.
3. WHEN `payment_due_date` is set and differs from the Derived_Due_Date, THE Unified_Billing_Cycle_List SHALL display a visual indicator (e.g., "Adjusted" badge) next to the due date.
4. THE `getEffectiveDueDate(cycle, paymentDueDay)` utility function SHALL be added to `frontend/src/utils/billingCycleDueDate.js` to encapsulate the fallback chain, returning `cycle.payment_due_date` if non-null, otherwise `deriveDueDate(cycle.cycle_end_date, paymentDueDay)`.

### Requirement 7: Activity Log — payment_due_date Change Tracking

**User Story:** As a user, I want changes to the payment due date to appear in the activity log, so that I have an audit trail of due date adjustments.

#### Acceptance Criteria

1. WHEN a Billing_Cycle is created with a non-null `payment_due_date`, THE activity log metadata SHALL include the `payment_due_date` value.
2. WHEN a Billing_Cycle's `payment_due_date` is updated (set, changed, or cleared), THE activity log `changes` array SHALL include a `payment_due_date` entry with `from` and `to` values.
3. WHEN the Billing_Cycle_Scheduler auto-generates a cycle with a weekend-adjusted `payment_due_date`, THE `billing_cycle_auto_generated` activity log event metadata SHALL include the `paymentDueDate` field and a `weekendAdjusted: true` flag.
4. THE existing activity log integration tests (`billingCycleHistoryService.activityLog.integration.test.js`) SHALL be extended to cover `payment_due_date` change tracking.

### Requirement 8: Documentation Updates

**User Story:** As a developer, I want project documentation to reflect the new payment_due_date field, so that the codebase remains well-documented.

#### Acceptance Criteria

1. THE `docs/DATABASE_SCHEMA.md` SHALL be updated to include the `payment_due_date` column in the `credit_card_billing_cycles` table documentation.
2. THE `docs/features/CREDIT_CARD_BILLING_CYCLES.md` SHALL be updated to describe the per-cycle payment due date override and weekend adjustment behavior.
3. THE `docs/development/FEATURE_ROADMAP.md` SHALL be updated to add this feature as a completed item under the appropriate section.

### Requirement 9: Testing Strategy

**User Story:** As a developer, I want comprehensive test coverage for the payment due date feature following project testing conventions.

#### Acceptance Criteria

1. THE Weekend_Adjustment_Utility SHALL have a PBT test file (`backend/utils/dateUtils.weekendAdjustment.pbt.test.js` or added to existing `dateUtils.pbt.test.js`) verifying the round-trip property (Req 3.6) and Saturday/Sunday adjustment correctness across randomized date inputs.
2. THE Reminder_Service override logic (Req 4.1–4.5) SHALL have PBT tests verifying that for any billing cycle with a non-null `payment_due_date`, the effective due date used for days-until-due calculation matches the override, and for null `payment_due_date` it matches the derived date.
3. THE frontend `getEffectiveDueDate` utility (Req 6.4) SHALL have PBT tests verifying the fallback chain property: for any cycle with non-null `payment_due_date`, the result equals `payment_due_date`; for null, the result equals `deriveDueDate(cycle_end_date, payment_due_day)`.
4. THE Billing_Cycle_Controller validation (Req 2.5) SHALL have unit tests for invalid `payment_due_date` formats returning 400 errors.
5. THE Billing_Cycle_Scheduler weekend adjustment integration (Req 3.4–3.5) SHALL have tests verifying that auto-generated cycles have `payment_due_date` set only when the derived date falls on a weekend.
6. ALL PBT test files SHALL include an `@invariant` comment block within the first 30 lines per project convention.
