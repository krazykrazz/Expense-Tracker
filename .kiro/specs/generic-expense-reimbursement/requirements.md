# Requirements Document

## Introduction

This feature extends the existing expense reimbursement tracking capability (currently limited to medical insurance) to support generic partial reimbursements on any expense type. The use case is when a user pays for something (e.g., $100 on credit card) and later receives partial reimbursement from someone (e.g., kids e-transfer $25 for their portion). The system should track both the original charged amount and the net out-of-pocket cost.

## Glossary

- **Expense_Form**: The UI component for creating and editing expenses
- **Expense_List**: The UI component displaying the list of expenses
- **Reimbursement**: A partial or full refund received after paying for an expense
- **Original_Cost**: The full amount charged to the payment method
- **Net_Amount**: The out-of-pocket cost after reimbursement (stored in the `amount` field)
- **Expense_Service**: The backend service handling expense business logic
- **Credit_Card_Balance**: The calculated balance for credit card payment methods

## Requirements

### Requirement 1: Reimbursement Field in Expense Form

**User Story:** As a user, I want to enter a reimbursement amount when creating or editing any expense, so that I can track partial refunds I receive from others.

#### Acceptance Criteria

1. WHEN a user creates or edits an expense of any type (not just medical), THE Expense_Form SHALL display an optional "Reimbursement" input field
2. WHEN the expense type is "Tax - Medical" with insurance tracking enabled, THE Expense_Form SHALL NOT display the generic reimbursement field (to avoid conflict with existing insurance UI)
3. WHEN a user enters a reimbursement amount, THE Expense_Form SHALL validate that the reimbursement does not exceed the expense amount
4. WHEN a user enters a valid reimbursement amount, THE Expense_Form SHALL display a breakdown showing "Charged: $X, Reimbursed: $Y, Net: $Z"
5. THE Expense_Form SHALL allow the reimbursement field to be empty (defaulting to no reimbursement)

### Requirement 2: Data Storage for Reimbursements

**User Story:** As a user, I want my reimbursement data to be correctly stored, so that reports and balances reflect accurate information.

#### Acceptance Criteria

1. WHEN a reimbursement amount is entered, THE Expense_Service SHALL set `original_cost` to the full charged amount
2. WHEN a reimbursement amount is entered, THE Expense_Service SHALL set `amount` to the net cost (original minus reimbursement)
3. WHEN no reimbursement is entered, THE Expense_Service SHALL leave `original_cost` as NULL and store the full amount in `amount`
4. WHEN an expense with reimbursement is updated to remove the reimbursement, THE Expense_Service SHALL set `original_cost` to NULL and restore `amount` to the original value

### Requirement 3: Credit Card Balance Calculation

**User Story:** As a user, I want credit card balances to reflect the actual amount charged, so that I know how much I owe on my card.

#### Acceptance Criteria

1. WHEN calculating credit card balance, THE Credit_Card_Balance calculation SHALL use `COALESCE(original_cost, amount)` to get the charged amount
2. WHEN an expense has a reimbursement, THE Credit_Card_Balance SHALL include the full original charged amount (not the net amount)

### Requirement 4: Spending Reports

**User Story:** As a user, I want spending reports to show my actual out-of-pocket costs, so that I can track my real expenses.

#### Acceptance Criteria

1. WHEN displaying expense summaries and totals, THE system SHALL use the `amount` field (net cost after reimbursement)
2. WHEN displaying individual expense details, THE system SHALL show both the original charged amount and the net amount for reimbursed expenses

### Requirement 5: Expense List Display

**User Story:** As a user, I want to see which expenses have been partially reimbursed, so that I can quickly identify them in my expense list.

#### Acceptance Criteria

1. WHEN an expense has `original_cost` set (indicating reimbursement), THE Expense_List SHALL display a visual indicator
2. WHEN hovering over or clicking the reimbursement indicator, THE Expense_List SHALL show the breakdown (original, reimbursed, net)
3. THE Expense_List SHALL display the net amount (`amount` field) as the primary amount shown

### Requirement 6: Edit Existing Expenses

**User Story:** As a user, I want to add, modify, or remove reimbursements on existing expenses, so that I can update my records when reimbursements are received.

#### Acceptance Criteria

1. WHEN editing an expense that has `original_cost` set, THE Expense_Form SHALL pre-populate the reimbursement field with the calculated reimbursement (original_cost - amount)
2. WHEN a user modifies the reimbursement amount, THE Expense_Form SHALL recalculate and update both `original_cost` and `amount`
3. WHEN a user clears the reimbursement field, THE Expense_Form SHALL set `original_cost` to NULL and keep the current `amount` as the full expense amount

### Requirement 7: Backward Compatibility

**User Story:** As a user, I want my existing expenses to continue working correctly, so that the new feature doesn't break my historical data.

#### Acceptance Criteria

1. WHEN an expense has `original_cost` = NULL, THE system SHALL treat it as having no reimbursement
2. WHEN displaying expenses without reimbursement, THE system SHALL NOT show any reimbursement indicator
3. THE system SHALL NOT require any database migration (the `original_cost` column already exists)
