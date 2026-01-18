# Requirements Document

## Introduction

This feature adds insurance tracking capabilities to medical expenses (Tax - Medical type) in the expense tracker application. Users will be able to track whether medical expenses are eligible for insurance reimbursement, monitor claim status through the submission process, and record the original cost versus out-of-pocket amounts. This enhances the existing medical expense tracking system which already supports people assignment and invoice attachments.

## Glossary

- **Expense_Tracker**: The main application system for tracking personal expenses
- **Medical_Expense**: An expense record with type "Tax - Medical"
- **Insurance_Claim**: A request for reimbursement submitted to an insurance provider
- **Claim_Status**: The current state of an insurance claim (Not Claimed, In Progress, Paid, Denied)
- **Original_Cost**: The full amount of the medical expense before any insurance reimbursement
- **Out_of_Pocket**: The amount field representing what the user actually paid after reimbursement

## Requirements

### Requirement 1: Insurance Eligibility Flag

**User Story:** As a user, I want to mark medical expenses as eligible or not eligible for insurance, so that I can track which expenses can be submitted for reimbursement.

#### Acceptance Criteria

1. WHEN a user creates or edits a medical expense, THE Expense_Tracker SHALL display an insurance eligibility checkbox
2. THE Expense_Tracker SHALL default the insurance eligibility flag to "not eligible" for new medical expenses
3. WHEN a user marks an expense as insurance eligible, THE Expense_Tracker SHALL persist this flag to the database
4. THE Expense_Tracker SHALL only display insurance fields for expenses with type "Tax - Medical"
5. WHEN viewing existing medical expenses, THE Expense_Tracker SHALL display the current insurance eligibility status

### Requirement 2: Claim Status Tracking

**User Story:** As a user, I want to track the status of my insurance claims, so that I can monitor which expenses have been submitted and their reimbursement progress.

#### Acceptance Criteria

1. WHEN a medical expense is marked as insurance eligible, THE Expense_Tracker SHALL display a claim status dropdown
2. THE Expense_Tracker SHALL support the following claim statuses: "Not Claimed", "In Progress", "Paid", "Denied"
3. WHEN a user changes the claim status, THE Expense_Tracker SHALL persist the new status to the database
4. THE Expense_Tracker SHALL default the claim status to "Not Claimed" for newly eligible expenses
5. WHEN the claim status is "Not Claimed" or "In Progress", THE Expense_Tracker SHALL keep the amount field equal to the original cost

### Requirement 3: Original Cost and Out-of-Pocket Tracking

**User Story:** As a user, I want to track both the original cost and my out-of-pocket amount, so that I can see the full expense value and what I actually paid.

#### Acceptance Criteria

1. WHEN a medical expense is marked as insurance eligible, THE Expense_Tracker SHALL display an original cost field
2. THE Expense_Tracker SHALL store the original cost separately from the amount field
3. THE Expense_Tracker SHALL use the amount field to represent the out-of-pocket cost
4. WHEN the claim status changes to "Paid", THE Expense_Tracker SHALL allow the user to update the amount to reflect out-of-pocket cost
5. THE Expense_Tracker SHALL validate that the out-of-pocket amount does not exceed the original cost
6. THE Expense_Tracker SHALL calculate and display the reimbursement as (original cost - out-of-pocket amount)

### Requirement 4: People Allocation with Original Cost

**User Story:** As a user, I want to split medical expenses between family members using the original cost, so that I can track insurance claims per person accurately.

#### Acceptance Criteria

1. WHEN allocating a medical expense to multiple people, THE Expense_Tracker SHALL use the original cost for allocation
2. THE Expense_Tracker SHALL track both original cost allocation and out-of-pocket allocation per person
3. WHEN the claim status changes to "Paid", THE Expense_Tracker SHALL allow updating per-person out-of-pocket amounts
4. THE Expense_Tracker SHALL validate that per-person out-of-pocket amounts do not exceed their original cost allocations
5. THE Expense_Tracker SHALL display both original cost and out-of-pocket amounts in person-grouped tax reports

### Requirement 5: Quick Status Update

**User Story:** As a user, I want to quickly update the insurance claim status without opening the full edit form, so that I can efficiently manage my claims.

#### Acceptance Criteria

1. WHEN viewing medical expenses in the expense list, THE Expense_Tracker SHALL provide a quick status update control
2. THE Expense_Tracker SHALL allow changing status from "Not Claimed" to "In Progress" with one click
3. THE Expense_Tracker SHALL allow changing status from "In Progress" to "Paid" or "Denied" with one click
4. THE Expense_Tracker SHALL persist status changes immediately without requiring form submission

### Requirement 6: Tax Deductible Report Integration

**User Story:** As a user, I want to see insurance claim status and reimbursement information in the tax deductible report, so that I can understand my actual deductible amounts.

#### Acceptance Criteria

1. WHEN displaying medical expenses in the tax deductible view, THE Expense_Tracker SHALL show the insurance eligibility status
2. WHEN displaying medical expenses in the tax deductible view, THE Expense_Tracker SHALL show the claim status with visual indicators
3. THE Expense_Tracker SHALL calculate and display total original costs for the year
4. THE Expense_Tracker SHALL calculate and display total out-of-pocket (deductible) amount for the year
5. WHEN filtering expenses in the tax deductible view, THE Expense_Tracker SHALL support filtering by claim status

### Requirement 7: Expense List Insurance Indicators

**User Story:** As a user, I want to see insurance status indicators in the expense list, so that I can quickly identify which expenses need insurance action.

#### Acceptance Criteria

1. WHEN displaying medical expenses in the expense list, THE Expense_Tracker SHALL show an insurance status indicator
2. THE Expense_Tracker SHALL use distinct visual indicators for each claim status (Not Claimed, In Progress, Paid, Denied)
3. WHEN an expense is not insurance eligible, THE Expense_Tracker SHALL not display any insurance indicator
4. THE Expense_Tracker SHALL support filtering the expense list by insurance claim status

### Requirement 8: Backward Compatibility

**User Story:** As a user with existing medical expenses, I want my data to remain intact after the update, so that I don't lose any expense history.

#### Acceptance Criteria

1. WHEN the database migration runs, THE Expense_Tracker SHALL preserve all existing medical expense data
2. THE Expense_Tracker SHALL default existing medical expenses to "not eligible" for insurance
3. THE Expense_Tracker SHALL set original cost equal to amount for existing medical expenses
4. IF the migration fails, THEN THE Expense_Tracker SHALL rollback all changes and preserve the original data
5. THE Expense_Tracker SHALL create a backup before running the migration

### Requirement 9: Insurance Data Serialization

**User Story:** As a user, I want insurance data to be included in backups and exports, so that I don't lose this information.

#### Acceptance Criteria

1. WHEN creating a database backup, THE Expense_Tracker SHALL include all insurance-related fields
2. WHEN restoring from a backup, THE Expense_Tracker SHALL restore all insurance-related fields
3. FOR ALL valid expense objects with insurance data, serializing then deserializing SHALL produce an equivalent object (round-trip property)
