# Requirements Document

## Introduction

Recurring Expenses v2 is a simplified reimplementation of the recurring expenses feature that was removed in v4.0.0. The original feature was removed due to low utility and unnecessary complexity. This v2 implementation takes a radically simpler approach: instead of templates and automatic generation, users can simply copy an expense forward to multiple future months when creating or editing.

**Key Principle:** Copy-forward, not templates. Each copied expense is completely independent and can be modified after creation.

## Glossary

- **Add_To_Future_Months**: The action of creating duplicate expense entries in future months based on a source expense
- **Source_Expense**: The original expense being added to future months
- **Future_Expense**: An independent expense entry created in a future month via Add_To_Future_Months

## Requirements

### Requirement 1: Add to Future Months on Create

**User Story:** As a user, I want to add a new expense to multiple future months, so that I can quickly enter predictable recurring expenses.

#### Acceptance Criteria

1. WHEN creating a new expense, THE Expense_Form SHALL display an optional "Add to future months" control
2. THE Add_To_Future_Months control SHALL allow the user to select how many months to add (1-12)
3. WHEN the user selects a number of months AND saves the expense, THE System SHALL create the source expense plus one Future_Expense for each selected future month
4. THE Future_Expense SHALL have the same place, amount, type, method, and notes as the Source_Expense
5. THE Future_Expense date SHALL be set to the same day of month in each future month
6. IF the source expense day does not exist in a future month (e.g., day 31 in February), THEN THE System SHALL use the last day of that month
7. THE Add_To_Future_Months control SHALL default to "Don't add" (0 months)
8. IF the expense is a medical expense with people allocations, THEN THE Future_Expense SHALL include the same people allocations
9. THE Future_Expense SHALL NOT include any invoices from the Source_Expense (invoices are unique per expense)

### Requirement 2: Add to Future Months on Edit

**User Story:** As a user, I want to add an existing expense to future months, so that I can extend recurring expenses without re-entering all details.

#### Acceptance Criteria

1. WHEN editing an existing expense, THE Expense_Form SHALL display an optional "Add to future months" control
2. THE Add_To_Future_Months control SHALL allow the user to select how many months to add (1-12)
3. WHEN the user selects a number of months AND saves the expense, THE System SHALL update the existing expense AND create Future_Expenses for future months
4. THE Future_Expense SHALL use the updated expense values (not the original values before editing)

### Requirement 3: Independent Future Expenses

**User Story:** As a user, I want future expenses to be completely independent, so that I can modify them individually without affecting other copies.

#### Acceptance Criteria

1. THE Future_Expense SHALL be a completely independent expense entry with no link to the Source_Expense
2. WHEN a user edits a Future_Expense, THE System SHALL NOT affect the Source_Expense or other Future_Expenses
3. WHEN a user deletes a Future_Expense, THE System SHALL NOT affect the Source_Expense or other Future_Expenses
4. WHEN a user deletes the Source_Expense, THE System SHALL NOT affect any Future_Expenses

### Requirement 4: Add to Future Months Feedback

**User Story:** As a user, I want confirmation when expenses are added to future months, so that I know the operation succeeded.

#### Acceptance Criteria

1. WHEN expenses are successfully added to future months, THE System SHALL display a success message indicating how many expenses were created
2. THE Success_Message SHALL indicate the date range of the future expenses (e.g., "Added to 3 future months through September 2025")
3. IF an error occurs during add to future months, THEN THE System SHALL display an error message and not create partial copies

### Requirement 5: Budget Integration

**User Story:** As a user, I want future expenses to count toward my budgets, so that my budget tracking remains accurate.

#### Acceptance Criteria

1. WHEN a Future_Expense is created, THE System SHALL trigger budget recalculation for the affected category and month
2. THE Future_Expense SHALL be included in all budget calculations and alerts for its respective month
