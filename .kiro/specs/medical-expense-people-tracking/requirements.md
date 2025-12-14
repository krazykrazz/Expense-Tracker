# Requirements Document

## Introduction

The Medical Expense People Tracking feature enables users to associate medical expenses with specific family members and generate detailed tax reporting summaries organized by person and provider. This enhancement builds on the existing "Tax - Medical" category to provide more granular tracking for tax preparation and family expense management.

## Glossary

- **Medical Expense**: An expense categorized as "Tax - Medical" in the expense tracking system
- **Person**: A family member or individual who can be associated with medical expenses
- **Provider**: The medical service provider (place field) where the expense occurred
- **Expense Splitting**: Dividing a single expense amount across multiple people with specific allocations
- **Tax Summary**: A report showing medical expenses organized by person and provider for tax preparation

## Requirements

### Requirement 1

**User Story:** As a user, I want to manage a list of people (family members) in my household, so that I can associate medical expenses with specific individuals.

#### Acceptance Criteria

1. WHEN a user accesses the People Management section in Settings, THE system SHALL display a form for adding, editing, and deleting people
2. WHEN a user adds a new person, THE system SHALL require a name and optional date of birth
3. WHEN a user saves a person, THE system SHALL validate that the name is not empty and store the person information
4. WHEN a user deletes a person, THE system SHALL remove the person and update any associated medical expenses to remove that person association
5. WHEN a user edits a person's information, THE system SHALL update the person details and reflect changes in all associated expenses

### Requirement 2

**User Story:** As a user, I want to associate medical expenses with one or more people, so that I can track which family members incurred specific medical costs.

#### Acceptance Criteria

1. WHEN a user creates or edits a medical expense (Tax - Medical category), THE system SHALL display a people selection dropdown
2. WHEN a user selects a single person, THE system SHALL associate the full expense amount with that person
3. WHEN a user selects multiple people, THE system SHALL prompt for amount allocation across the selected people
4. WHEN a user allocates amounts across multiple people, THE system SHALL validate that the sum equals the total expense amount
5. WHEN a user saves a medical expense with people associations, THE system SHALL store the person-amount relationships

### Requirement 3

**User Story:** As a user, I want to view medical expense summaries organized by person and provider, so that I can easily prepare tax documentation and understand family medical spending patterns.

#### Acceptance Criteria

1. WHEN a user accesses the Tax Deductible view, THE system SHALL display medical expenses grouped by person
2. WHEN viewing person-grouped expenses, THE system SHALL show subtotals per provider for each person
3. WHEN a user views the medical expense summary, THE system SHALL display person name, provider name, and total amount spent
4. WHEN an expense covers multiple people, THE system SHALL show the allocated amount for each person separately
5. WHEN generating tax reports, THE system SHALL provide clean per-person totals suitable for tax form preparation

### Requirement 4

**User Story:** As a user, I want the system to handle both single-person and multi-person medical expenses efficiently, so that I can quickly enter expenses regardless of complexity.

#### Acceptance Criteria

1. WHEN a user selects one person for a medical expense, THE system SHALL automatically assign the full amount to that person
2. WHEN a user selects multiple people, THE system SHALL provide an amount allocation interface
3. WHEN allocating amounts, THE system SHALL offer an "Split Equally" option for convenience
4. WHEN the user manually enters amounts, THE system SHALL validate that allocations sum to the total expense amount
5. WHEN saving multi-person expenses, THE system SHALL store individual person-amount pairs for accurate reporting

### Requirement 5

**User Story:** As a system administrator, I want existing medical expenses to remain functional after the people tracking feature is added, so that historical data is preserved and the system remains stable.

#### Acceptance Criteria

1. WHEN the people tracking feature is deployed, THE system SHALL continue to display existing medical expenses without people associations
2. WHEN viewing historical medical expenses, THE system SHALL show expenses without people as "Unassigned" in person-grouped views
3. WHEN editing existing medical expenses, THE system SHALL allow users to add people associations retroactively without requiring data migration
4. WHEN generating reports, THE system SHALL include both assigned and unassigned medical expenses in appropriate totals
5. WHEN calculating tax summaries, THE system SHALL handle mixed data (expenses with and without people associations) gracefully and show unassigned expenses in a separate "Unassigned" section

### Requirement 6

**User Story:** As a user, I want to easily identify and update medical expenses that haven't been assigned to people yet, so that I can maintain complete and accurate records.

#### Acceptance Criteria

1. WHEN viewing the Tax Deductible summary, THE system SHALL clearly indicate which medical expenses are not yet assigned to people
2. WHEN displaying unassigned medical expenses, THE system SHALL provide a quick way to assign them to people
3. WHEN a user assigns people to previously unassigned expenses, THE system SHALL update the expense and refresh the summary view
4. WHEN generating tax reports, THE system SHALL optionally allow users to exclude unassigned expenses from per-person totals
5. WHEN viewing expense lists, THE system SHALL provide a visual indicator (icon or badge) for medical expenses that lack people assignments