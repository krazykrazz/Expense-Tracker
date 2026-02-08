# Requirements Document

## Introduction

The ExpenseForm component has grown to over 1600 lines and presents all fields simultaneously, creating cognitive overload for users entering simple expenses. This feature will reorganize the form using progressive disclosure, collapsible sections, and contextual help to reduce complexity while maintaining all existing functionality.

## Glossary

- **ExpenseForm**: The React component responsible for creating and editing expense records
- **Progressive_Disclosure**: A design pattern that shows only essential information initially, revealing additional options as needed
- **Quick_Add_Mode**: A simplified form view showing only essential fields for common expense entry
- **Full_Form_Mode**: A comprehensive form view showing all available fields and options
- **Advanced_Options**: Less frequently used fields such as future months, posted date, and reimbursement tracking
- **Contextual_Help**: Tooltips and hints that explain when and why to use specific fields
- **Collapsible_Section**: A UI component that can be expanded or collapsed to show/hide content
- **Form_State**: The current data and configuration of the form, including which sections are expanded

## Requirements

### Requirement 1: Progressive Disclosure for Form Complexity

**User Story:** As a user entering simple expenses, I want to see only essential fields by default, so that I can quickly add common expenses without visual clutter.

#### Acceptance Criteria

1. WHEN the form loads in create mode, THE ExpenseForm SHALL display only core fields (Date, Place, Amount, Type, Payment Method, Notes)
2. WHEN the form loads in edit mode, THE ExpenseForm SHALL display all sections that contain data from the existing expense
3. WHEN a user expands an advanced section, THE ExpenseForm SHALL persist that expansion state during the current session
4. WHEN a user collapses an advanced section, THE ExpenseForm SHALL hide the section's fields while preserving any entered data
5. THE ExpenseForm SHALL provide visual indicators showing which advanced sections contain data

### Requirement 2: Collapsible Advanced Options Section

**User Story:** As a user, I want advanced features organized in collapsible sections, so that I can access them when needed without cluttering the main form.

#### Acceptance Criteria

1. WHEN the form displays, THE ExpenseForm SHALL group future months and posted date fields into an "Advanced Options" collapsible section
2. WHEN the Advanced Options section is collapsed, THE ExpenseForm SHALL show a summary badge indicating if any advanced fields contain data
3. WHEN a user clicks the Advanced Options header, THE ExpenseForm SHALL toggle the section between expanded and collapsed states
4. WHEN advanced fields contain validation errors, THE ExpenseForm SHALL automatically expand the Advanced Options section and highlight the error
5. THE ExpenseForm SHALL remember the Advanced Options expansion state within the current browser session

### Requirement 3: Contextual Help System

**User Story:** As a user, I want helpful tooltips explaining when to use each field, so that I can understand the purpose of advanced features without external documentation.

#### Acceptance Criteria

1. WHEN a user hovers over a field label with a help icon, THE ExpenseForm SHALL display a tooltip explaining the field's purpose
2. WHEN a user hovers over the Posted Date field, THE ExpenseForm SHALL explain that it's for tracking when credit card transactions post to statements
3. WHEN a user hovers over the Future Months field, THE ExpenseForm SHALL explain that it creates recurring expenses for multiple months
4. WHEN a user hovers over the Original Cost field, THE ExpenseForm SHALL explain that it tracks reimbursement amounts
5. THE ExpenseForm SHALL display tooltips without requiring clicks, using hover or focus events

### Requirement 4: Conditional Field Display

**User Story:** As a user, I want fields to appear only when relevant to my expense type, so that I don't see options that don't apply to my current entry.

#### Acceptance Criteria

1. WHEN a user selects a credit card payment method, THE ExpenseForm SHALL show the Posted Date field
2. WHEN a user selects a non-credit-card payment method, THE ExpenseForm SHALL hide the Posted Date field
3. WHEN a user selects "Tax - Medical" as the expense type, THE ExpenseForm SHALL show the insurance tracking section
4. WHEN a user selects a non-medical expense type, THE ExpenseForm SHALL hide the insurance tracking section
5. WHEN a user selects "Tax - Medical" or "Tax - Donation", THE ExpenseForm SHALL show the invoice upload section

### Requirement 5: Reimbursement Section Organization

**User Story:** As a user tracking reimbursed expenses, I want reimbursement fields grouped in a clear section, so that I can easily understand the relationship between original cost and out-of-pocket amount.

#### Acceptance Criteria

1. WHEN a user enters a non-medical expense, THE ExpenseForm SHALL display a collapsible "Reimbursement" section
2. WHEN the Reimbursement section is collapsed and contains data, THE ExpenseForm SHALL show a badge with the reimbursement amount
3. WHEN a user expands the Reimbursement section, THE ExpenseForm SHALL display Original Cost input and reimbursement calculation
4. WHEN a user enters both Original Cost and Amount, THE ExpenseForm SHALL display a breakdown showing Charged/Reimbursed/Net values
5. THE ExpenseForm SHALL validate that Net amount does not exceed Original Cost

### Requirement 6: Insurance Tracking Section Organization

**User Story:** As a user tracking medical expenses with insurance, I want insurance fields grouped in a clear section, so that I can manage insurance claims without confusion.

#### Acceptance Criteria

1. WHEN a user selects "Tax - Medical" as expense type, THE ExpenseForm SHALL display a collapsible "Insurance Tracking" section
2. WHEN the Insurance Tracking section is collapsed and insurance is enabled, THE ExpenseForm SHALL show a badge with claim status
3. WHEN a user checks "Eligible for Insurance Reimbursement", THE ExpenseForm SHALL expand the insurance details fields
4. WHEN a user unchecks "Eligible for Insurance Reimbursement", THE ExpenseForm SHALL collapse the insurance details fields
5. THE ExpenseForm SHALL display insurance status notes based on the selected claim status

### Requirement 7: People Assignment Section Organization

**User Story:** As a user assigning medical expenses to family members, I want people assignment in a clear section, so that I can easily manage allocations.

#### Acceptance Criteria

1. WHEN a user selects "Tax - Medical" as expense type, THE ExpenseForm SHALL display a "People Assignment" section
2. WHEN multiple people are selected, THE ExpenseForm SHALL show an allocation summary with an Edit button
3. WHEN a user clicks Edit allocations, THE ExpenseForm SHALL open the PersonAllocationModal
4. WHEN allocations are saved, THE ExpenseForm SHALL display the allocation breakdown in the section
5. THE ExpenseForm SHALL validate that total allocations equal the expense amount

### Requirement 8: Invoice Upload Section Organization

**User Story:** As a user uploading invoices for tax-deductible expenses, I want invoice upload in a clear section, so that I can manage attachments without cluttering the form.

#### Acceptance Criteria

1. WHEN a user selects "Tax - Medical" or "Tax - Donation", THE ExpenseForm SHALL display an "Invoice Attachments" section
2. WHEN invoices are uploaded, THE ExpenseForm SHALL show a count badge on the section header
3. WHEN editing an expense with invoices, THE ExpenseForm SHALL display the invoice list within the section
4. WHEN creating a new expense, THE ExpenseForm SHALL show a file selection interface within the section
5. THE ExpenseForm SHALL support multiple invoice uploads with person assignment for medical expenses

### Requirement 9: Form Layout Optimization

**User Story:** As a user, I want the form layout to be clean and scannable, so that I can quickly find the fields I need.

#### Acceptance Criteria

1. THE ExpenseForm SHALL group related fields into logical sections with clear visual separation
2. THE ExpenseForm SHALL use consistent spacing and alignment for all form elements
3. THE ExpenseForm SHALL display section headers with expand/collapse icons for collapsible sections
4. THE ExpenseForm SHALL use visual hierarchy (font size, weight, color) to distinguish section headers from field labels
5. THE ExpenseForm SHALL maintain the current two-column layout for Date/Place and Type/Amount rows

### Requirement 10: Accessibility and Keyboard Navigation

**User Story:** As a user relying on keyboard navigation, I want to navigate the form efficiently, so that I can enter expenses without using a mouse.

#### Acceptance Criteria

1. WHEN a user presses Tab, THE ExpenseForm SHALL move focus to the next visible field in logical order
2. WHEN a user presses Enter on a collapsible section header, THE ExpenseForm SHALL toggle the section expansion
3. WHEN a user presses Escape while a tooltip is visible, THE ExpenseForm SHALL hide the tooltip
4. THE ExpenseForm SHALL maintain focus within expanded sections when navigating with Tab
5. THE ExpenseForm SHALL provide aria-labels and aria-expanded attributes for screen readers

### Requirement 11: Form State Persistence

**User Story:** As a user, I want my section expansion preferences remembered during my session, so that I don't have to re-expand sections repeatedly.

#### Acceptance Criteria

1. WHEN a user expands or collapses a section, THE ExpenseForm SHALL store the state in sessionStorage
2. WHEN the form reloads during the same session, THE ExpenseForm SHALL restore the previous expansion states
3. WHEN a user submits the form successfully, THE ExpenseForm SHALL reset expansion states to defaults
4. WHEN a user closes the browser, THE ExpenseForm SHALL clear the stored expansion states
5. THE ExpenseForm SHALL store expansion state separately for create mode and edit mode

### Requirement 12: Visual Feedback and Indicators

**User Story:** As a user, I want clear visual feedback about section states, so that I can understand what data is present without expanding every section.

#### Acceptance Criteria

1. WHEN a collapsible section contains data, THE ExpenseForm SHALL display a badge or indicator on the section header
2. WHEN a collapsible section is expanded, THE ExpenseForm SHALL show a different icon (e.g., chevron-down vs chevron-right)
3. WHEN a field has a validation error in a collapsed section, THE ExpenseForm SHALL show an error indicator on the section header
4. WHEN a user hovers over a section header, THE ExpenseForm SHALL highlight the header to indicate it's clickable
5. THE ExpenseForm SHALL use consistent iconography for expand/collapse actions throughout the form
