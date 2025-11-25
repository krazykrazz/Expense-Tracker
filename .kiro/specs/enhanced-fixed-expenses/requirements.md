# Requirements Document

## Introduction

This feature enhances the fixed expenses functionality to include category and payment type fields, making fixed expenses more consistent with regular expenses. Users will be able to categorize their fixed expenses (e.g., Housing, Utilities, Subscriptions) and specify the payment method used (e.g., Debit, Credit Card), providing better tracking and reporting capabilities.

## Glossary

- **Expense Tracker System**: The web application that manages household expenses and income
- **Fixed Expense**: A monthly expense entry with a name, amount, category, and payment type that represents a predictable cost
- **Category**: The expense classification (e.g., Housing, Utilities, Subscriptions, Insurance)
- **Payment Type**: The payment method used for the expense (e.g., Cash, Debit, CIBC MC, PCF MC, WS VISA, VISA, Cheque)
- **Fixed Expenses Management Modal**: A popup interface for viewing and editing fixed expense items for a specific month
- **Database Migration**: An automated process that updates the database schema to add new fields to existing tables

## Requirements

### Requirement 1

**User Story:** As a user, I want to assign a category to each fixed expense, so that I can track which types of expenses are fixed costs

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a category dropdown field when adding or editing fixed expenses
2. THE Expense Tracker System SHALL validate that the category is one of the valid expense categories
3. THE Expense Tracker System SHALL store the category with each fixed expense item
4. THE Expense Tracker System SHALL display the category for each fixed expense in the management modal
5. THE Expense Tracker System SHALL use the same category list as regular expenses for consistency

### Requirement 2

**User Story:** As a user, I want to specify the payment type for each fixed expense, so that I can track which payment methods are used for fixed costs

#### Acceptance Criteria

1. THE Expense Tracker System SHALL provide a payment type dropdown field when adding or editing fixed expenses
2. THE Expense Tracker System SHALL validate that the payment type is one of the valid payment methods
3. THE Expense Tracker System SHALL store the payment type with each fixed expense item
4. THE Expense Tracker System SHALL display the payment type for each fixed expense in the management modal
5. THE Expense Tracker System SHALL use the same payment type list as regular expenses for consistency

### Requirement 3

**User Story:** As a user with existing fixed expenses, I want the system to automatically migrate my data, so that I don't lose any information when the new fields are added

#### Acceptance Criteria

1. WHEN the database schema is updated, THE Expense Tracker System SHALL add category and payment_type columns to the fixed_expenses table
2. WHEN migrating existing fixed expenses, THE Expense Tracker System SHALL assign a default category value to existing records
3. WHEN migrating existing fixed expenses, THE Expense Tracker System SHALL assign a default payment type value to existing records
4. THE Expense Tracker System SHALL preserve all existing fixed expense data during migration
5. THE Expense Tracker System SHALL execute the migration automatically when the application starts

### Requirement 4

**User Story:** As a user, I want to see the category and payment type when viewing my fixed expenses list, so that I can quickly identify expense details

#### Acceptance Criteria

1. THE Expense Tracker System SHALL display the category for each fixed expense item in the list view
2. THE Expense Tracker System SHALL display the payment type for each fixed expense item in the list view
3. THE Expense Tracker System SHALL organize the display to show name, category, payment type, and amount clearly
4. THE Expense Tracker System SHALL maintain readability when displaying the additional fields
5. THE Expense Tracker System SHALL update the display immediately when category or payment type is changed

### Requirement 5

**User Story:** As a user, I want the carry forward feature to include category and payment type, so that all expense details are preserved when copying to the next month

#### Acceptance Criteria

1. WHEN carrying forward fixed expenses from the previous month, THE Expense Tracker System SHALL copy the category field
2. WHEN carrying forward fixed expenses from the previous month, THE Expense Tracker System SHALL copy the payment type field
3. WHEN carrying forward fixed expenses from the previous month, THE Expense Tracker System SHALL copy the name and amount fields
4. THE Expense Tracker System SHALL create complete fixed expense records in the target month with all fields populated
5. THE Expense Tracker System SHALL maintain data integrity when carrying forward expenses across month boundaries

### Requirement 6

**User Story:** As a user, I want validation to ensure I select both category and payment type, so that my fixed expense records are complete

#### Acceptance Criteria

1. WHEN adding a new fixed expense, THE Expense Tracker System SHALL require a category to be selected
2. WHEN adding a new fixed expense, THE Expense Tracker System SHALL require a payment type to be selected
3. WHEN editing a fixed expense, THE Expense Tracker System SHALL validate that the category is not empty
4. WHEN editing a fixed expense, THE Expense Tracker System SHALL validate that the payment type is not empty
5. THE Expense Tracker System SHALL display clear error messages when required fields are missing

### Requirement 7

**User Story:** As a user, I want fixed expenses to be included in category totals, so that I can see the complete spending for each category including both regular and fixed expenses

#### Acceptance Criteria

1. WHEN calculating category totals, THE Expense Tracker System SHALL include fixed expenses in the total for their assigned category
2. WHEN displaying category breakdowns, THE Expense Tracker System SHALL aggregate both regular expenses and fixed expenses by category
3. THE Expense Tracker System SHALL maintain separate visibility of fixed vs regular expenses while including both in category totals
4. WHEN generating reports by category, THE Expense Tracker System SHALL include fixed expenses in the category calculations
5. THE Expense Tracker System SHALL update category totals immediately when fixed expenses are added, edited, or deleted

### Requirement 8

**User Story:** As a user, I want fixed expenses to be included in payment type totals, so that I can see the complete spending for each payment method including both regular and fixed expenses

#### Acceptance Criteria

1. WHEN calculating payment type totals, THE Expense Tracker System SHALL include fixed expenses in the total for their assigned payment type
2. WHEN displaying payment method breakdowns, THE Expense Tracker System SHALL aggregate both regular expenses and fixed expenses by payment type
3. THE Expense Tracker System SHALL maintain separate visibility of fixed vs regular expenses while including both in payment type totals
4. WHEN generating reports by payment method, THE Expense Tracker System SHALL include fixed expenses in the payment type calculations
5. THE Expense Tracker System SHALL update payment type totals immediately when fixed expenses are added, edited, or deleted
