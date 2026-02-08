# Design Document: ExpenseForm Simplification

## Overview

This design refactors the ExpenseForm component to reduce cognitive load through progressive disclosure, collapsible sections, and contextual help. The refactoring maintains all existing functionality while organizing the 1600+ line component into logical, manageable sections.

### Key Design Principles

1. **Progressive Disclosure**: Show essential fields first, reveal advanced options on demand
2. **Contextual Relevance**: Display fields only when applicable to the current expense type
3. **State Preservation**: Remember user preferences for section expansion during the session
4. **Accessibility First**: Ensure keyboard navigation and screen reader support
5. **Zero Data Loss**: Collapsing sections hides UI but preserves entered data

### Design Goals

- Reduce initial visual complexity for simple expense entry
- Improve feature discoverability through organized sections
- Maintain all existing validation and business logic
- Preserve current form submission behavior
- Support both create and edit modes with appropriate defaults

## Architecture

### Component Structure

The refactored ExpenseForm will use a modular architecture with extracted sub-components:

```
ExpenseForm (main container)
├── CoreFieldsSection (always visible)
│   ├── Date input
│   ├── Place autocomplete
│   ├── Type dropdown
│   ├── Amount input
│   ├── Payment Method dropdown
│   └── Notes textarea
├── CollapsibleSection (reusable wrapper)
│   ├── SectionHeader (with expand/collapse)
│   ├── SectionBadge (data indicators)
│   └── SectionContent (conditional render)
├── AdvancedOptionsSection (collapsible)
│   ├── FutureMonthsField
│   └── PostedDateField (conditional on credit card)
├── ReimbursementSection (collapsible, non-medical)
│   ├── OriginalCostField
│   └── ReimbursementBreakdown
├── InsuranceTrackingSection (collapsible, medical only)
│   ├── InsuranceEligibilityCheckbox
│   └── InsuranceDetailsFields (conditional)
├── PeopleAssignmentSection (collapsible, medical only)
│   ├── PeopleSelector
│   └── AllocationSummary
└── InvoiceAttachmentsSection (collapsible, tax-deductible)
    ├── InvoiceUpload (edit mode)
    └── InvoiceFileSelection (create mode)
```

### State Management


The form will manage expansion state separately from form data:

**Form Data State** (existing):
- All expense fields (date, place, amount, type, etc.)
- Insurance fields (insuranceEligible, claimStatus, originalCost)
- People assignments (selectedPeople)
- Invoice files (invoices, invoiceFiles)
- Posted date (postedDate)
- Future months (futureMonths)
- Generic reimbursement (genericOriginalCost)

**UI State** (new):
- Section expansion states (advancedOptionsExpanded, reimbursementExpanded, etc.)
- Tooltip visibility states
- Session storage keys for persistence

**State Persistence Strategy**:
- Use sessionStorage for expansion preferences (cleared on browser close)
- Store separate keys for create mode vs edit mode
- Auto-expand sections containing validation errors
- Auto-expand sections with existing data in edit mode

### Conditional Rendering Logic

Fields will be conditionally rendered based on:

1. **Expense Type**:
   - Medical expenses → Show insurance, people, invoice sections
   - Donation expenses → Show invoice section only
   - Other expenses → Show reimbursement section

2. **Payment Method**:
   - Credit card → Show posted date field in Advanced Options
   - Other methods → Hide posted date field

3. **Insurance Eligibility**:
   - Enabled → Show insurance detail fields
   - Disabled → Hide insurance detail fields

4. **Section Expansion**:
   - Expanded → Render section content
   - Collapsed → Render section header with badge only



## Components and Interfaces

### CollapsibleSection Component

A reusable wrapper component for all collapsible sections.

**Props**:
```typescript
interface CollapsibleSectionProps {
  title: string;                    // Section header text
  isExpanded: boolean;              // Expansion state
  onToggle: () => void;             // Toggle handler
  badge?: string | number;          // Optional badge content
  hasError?: boolean;               // Error indicator
  children: React.ReactNode;        // Section content
  helpText?: string;                // Optional tooltip text
  className?: string;               // Additional CSS classes
}
```

**Behavior**:
- Renders header with expand/collapse icon (chevron-right/chevron-down)
- Shows badge when provided (e.g., "2 invoices", "$50.00 reimbursed")
- Displays error indicator icon when hasError is true
- Conditionally renders children based on isExpanded
- Supports keyboard navigation (Enter/Space to toggle)
- Provides aria-expanded attribute for accessibility

**Visual States**:
- Collapsed: Header with right-pointing chevron, badge visible
- Expanded: Header with down-pointing chevron, content visible
- Hover: Subtle background highlight on header
- Error: Red indicator icon on header, auto-expands section

### HelpTooltip Component

A reusable tooltip component for contextual help.

**Props**:
```typescript
interface HelpTooltipProps {
  content: string;                  // Tooltip text
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;                // Max width in pixels
}
```

**Behavior**:
- Renders info icon (ⓘ) next to field labels
- Shows tooltip on hover or focus
- Hides tooltip on mouse leave or Escape key
- Positions tooltip to avoid viewport overflow
- Uses aria-describedby for screen readers



### Section-Specific Components

#### AdvancedOptionsSection

**Content**:
- Future Months checkbox and dropdown
- Posted Date field (conditional on credit card payment method)

**Badge Logic**:
- Show "Future: N months" when futureMonths > 0
- Show "Posted: MM/DD/YYYY" when postedDate is set
- Show both if both are set

**Default State**:
- Collapsed in create mode
- Expanded in edit mode if futureMonths > 0 or postedDate is set

#### ReimbursementSection

**Content**:
- Original Cost input field
- Reimbursement breakdown (Charged/Reimbursed/Net)
- Clear button for original cost

**Badge Logic**:
- Show "Reimbursed: $XX.XX" when genericOriginalCost > amount

**Default State**:
- Collapsed in create mode
- Expanded in edit mode if genericOriginalCost is set

**Visibility**:
- Hidden when expense type is "Tax - Medical"
- Visible for all other expense types

#### InsuranceTrackingSection

**Content**:
- Insurance Eligibility checkbox
- Original Cost field (conditional)
- Claim Status dropdown (conditional)
- Reimbursement display (conditional)
- Status notes (conditional)

**Badge Logic**:
- Show claim status when insuranceEligible is true
- Format: "Claim: Not Claimed", "Claim: In Progress", "Claim: Paid", "Claim: Denied"

**Default State**:
- Collapsed in create mode
- Expanded in edit mode if insuranceEligible is true

**Visibility**:
- Only visible when expense type is "Tax - Medical"



#### PeopleAssignmentSection

**Content**:
- People multi-select dropdown
- Allocation summary with Edit button
- Current allocations display

**Badge Logic**:
- Show "N people" when selectedPeople.length > 0
- Format: "1 person", "2 people", etc.

**Default State**:
- Collapsed in create mode
- Expanded in edit mode if selectedPeople.length > 0

**Visibility**:
- Only visible when expense type is "Tax - Medical"

#### InvoiceAttachmentsSection

**Content**:
- InvoiceUpload component (edit mode)
- File selection interface (create mode)
- Invoice list with person assignments

**Badge Logic**:
- Show "N invoices" when invoices.length > 0 or invoiceFiles.length > 0
- Format: "1 invoice", "2 invoices", etc.

**Default State**:
- Collapsed in create mode
- Expanded in edit mode if invoices.length > 0

**Visibility**:
- Only visible when expense type is "Tax - Medical" or "Tax - Donation"

## Data Models

### Section Expansion State

```typescript
interface SectionExpansionState {
  advancedOptions: boolean;
  reimbursement: boolean;
  insurance: boolean;
  people: boolean;
  invoices: boolean;
}
```

**Storage Key Format**:
- Create mode: `expenseForm_expansion_create`
- Edit mode: `expenseForm_expansion_edit`

**Default Values**:
- Create mode: All sections collapsed (false)
- Edit mode: Sections expanded based on existing data



### Help Text Content

```typescript
const HELP_TEXT = {
  postedDate: "For credit card expenses, set when the transaction posts to your statement. Leave empty to use the transaction date for balance calculations.",
  
  futureMonths: "Automatically create this expense for multiple future months. Useful for recurring expenses like subscriptions or monthly bills.",
  
  originalCost: "If you were reimbursed for this expense, enter the full amount charged here. The Amount field above should be your out-of-pocket cost.",
  
  insuranceEligible: "Check this if you plan to submit or have submitted this expense to insurance for reimbursement.",
  
  insuranceOriginalCost: "The full cost before insurance coverage. Your out-of-pocket amount is set in the Amount field above.",
  
  claimStatus: "Track the status of your insurance claim: Not Claimed (not yet submitted), In Progress (submitted and pending), Paid (reimbursed), or Denied (rejected).",
  
  peopleAssignment: "Assign this medical expense to one or more family members. For multiple people, you can allocate specific amounts to each person.",
  
  invoiceAttachment: "Upload PDF invoices or receipts for tax-deductible expenses. For medical expenses, you can link invoices to specific family members."
};
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several redundancies were identified:

**Redundant Properties Eliminated**:
- 2.5 (Advanced Options expansion persistence) → Covered by general property 1.3
- 6.1 (Insurance section display for medical) → Covered by 4.3 example
- 8.1 (Invoice section display for tax-deductible) → Covered by property 4.5
- 11.1 (Section expansion storage) → Covered by property 1.3
- 12.1 (Badge display for sections with data) → Covered by property 1.5
- 12.3 (Error indicator on collapsed sections) → Covered by property 2.4

**Properties Combined**:
- 4.1 and 4.2 (Posted date field visibility) → Combined into single property about conditional rendering based on payment method type
- 6.3 and 6.4 (Insurance details expansion) → Combined into single property about insurance eligibility toggle behavior

The following properties provide unique validation value:



### Core Properties

**Property 1: Initial visibility in create mode**
*For any* form render in create mode, only the core fields (Date, Place, Type, Amount, Payment Method, Notes) should be visible, and all advanced sections should be collapsed.
**Validates: Requirements 1.1**

**Property 2: Section expansion based on existing data**
*For any* expense object in edit mode, all sections containing non-null/non-empty data from that expense should be expanded, and sections without data should be collapsed.
**Validates: Requirements 1.2**

**Property 3: Session state persistence**
*For any* section expansion state change, the new state should be stored in sessionStorage with the appropriate key (create or edit mode), and should be retrievable on subsequent renders within the same session.
**Validates: Requirements 1.3, 11.2, 11.5**

**Property 4: Data preservation during collapse**
*For any* section with entered form data, collapsing the section should hide the UI elements but preserve all data values in the form state, and re-expanding should display the preserved data.
**Validates: Requirements 1.4**

**Property 5: Badge display for data presence**
*For any* collapsible section, if the section contains non-empty data values, a badge should be visible on the section header indicating the data presence (e.g., count, amount, or status).
**Validates: Requirements 1.5, 2.2, 5.2, 6.2, 8.2**

**Property 6: Section toggle interaction**
*For any* collapsible section header, clicking or pressing Enter/Space should toggle the section between expanded and collapsed states.
**Validates: Requirements 2.3, 10.2**

**Property 7: Auto-expansion on validation errors**
*For any* validation error in a collapsed section, the section should automatically expand and display an error indicator on the section header.
**Validates: Requirements 2.4**



### Tooltip Properties

**Property 8: Tooltip display on hover/focus**
*For any* field with a help icon, hovering over or focusing on the icon should display the tooltip, and the tooltip should hide on mouse leave or Escape key press.
**Validates: Requirements 3.1, 3.5, 10.3**

### Conditional Rendering Properties

**Property 9: Posted date field visibility**
*For any* payment method selection, the Posted Date field should be visible if and only if the selected payment method type is 'credit_card'.
**Validates: Requirements 4.1, 4.2**

**Property 10: Section visibility based on expense type**
*For any* expense type selection, the Insurance Tracking section should be visible only for "Tax - Medical", the People Assignment section should be visible only for "Tax - Medical", and the Invoice Attachments section should be visible only for "Tax - Medical" or "Tax - Donation".
**Validates: Requirements 4.3, 4.4, 4.5, 5.1**

**Property 11: Insurance details conditional rendering**
*For any* insurance eligibility checkbox state, the insurance detail fields (Original Cost, Claim Status, Reimbursement display) should be visible if and only if the checkbox is checked.
**Validates: Requirements 6.3, 6.4**

### Reimbursement Properties

**Property 12: Reimbursement breakdown display**
*For any* non-medical expense with both Original Cost and Amount entered, the reimbursement breakdown should display Charged (Original Cost), Reimbursed (Original Cost - Amount), and Net (Amount) values.
**Validates: Requirements 5.3, 5.4**

**Property 13: Reimbursement validation**
*For any* non-medical expense, if Amount exceeds Original Cost, a validation error should be displayed preventing form submission.
**Validates: Requirements 5.5**



### People Assignment Properties

**Property 14: Allocation summary display**
*For any* medical expense with multiple selected people, the People Assignment section should display an allocation summary with an Edit button, and the summary should show individual allocations when amounts are set.
**Validates: Requirements 7.2, 7.4**

**Property 15: Allocation total validation**
*For any* medical expense with multiple people allocations, the sum of all individual allocation amounts should equal the total expense amount, or a validation error should prevent form submission.
**Validates: Requirements 7.5**

### Invoice Properties

**Property 16: Invoice list display in edit mode**
*For any* tax-deductible expense in edit mode with existing invoices, the Invoice Attachments section should display the complete list of invoices with their metadata (filename, person assignment for medical expenses).
**Validates: Requirements 8.3**

**Property 17: Multiple invoice upload support**
*For any* tax-deductible expense, the form should accept multiple PDF file uploads, and for medical expenses, each invoice should support optional person assignment from the selected people list.
**Validates: Requirements 8.5**

### Layout and Structure Properties

**Property 18: Section header structure**
*For any* collapsible section, the section header should contain an expand/collapse icon that changes based on the expansion state (chevron-right when collapsed, chevron-down when expanded).
**Validates: Requirements 9.3, 12.2, 12.5**



### Accessibility Properties

**Property 19: Keyboard navigation order**
*For any* form state with various section expansion combinations, pressing Tab should move focus through all visible fields in logical order (top to bottom, left to right within rows), skipping collapsed section contents.
**Validates: Requirements 10.1, 10.4**

**Property 20: ARIA attributes for sections**
*For any* collapsible section, the section header should have appropriate aria-expanded attribute (true when expanded, false when collapsed) and aria-controls pointing to the content region.
**Validates: Requirements 10.5**

### State Management Properties

**Property 21: State reset after submission**
*For any* successful form submission in create mode, all section expansion states should reset to their default collapsed state, and sessionStorage should be updated accordingly.
**Validates: Requirements 11.3**

**Property 22: Insurance status notes display**
*For any* medical expense with insurance enabled, the appropriate status note should be displayed based on the claim status value: "Not Claimed" shows submission prompt, "In Progress" shows update prompt, "Paid" shows confirmation, "Denied" shows cost note.
**Validates: Requirements 6.5**



## Error Handling

### Validation Error Display

**Error Location Strategy**:
- Display field-level errors inline below the field
- Display section-level errors at the top of the section
- Auto-expand collapsed sections containing validation errors
- Show error indicator badge on collapsed section headers

**Error Types**:

1. **Field Validation Errors**:
   - Required field missing
   - Invalid format (e.g., negative amounts)
   - Business rule violations (e.g., amount > original cost)

2. **Section Validation Errors**:
   - Allocation totals don't match expense amount
   - Insurance fields incomplete when enabled
   - Posted date before transaction date

3. **Form Submission Errors**:
   - Network errors during API calls
   - Server-side validation failures
   - File upload failures

**Error Recovery**:
- Preserve all entered data when validation fails
- Focus first field with error after validation
- Provide clear, actionable error messages
- Allow users to fix errors without losing other data

### State Consistency

**Invariants to Maintain**:
- Collapsed sections never lose entered data
- Section expansion state always matches sessionStorage
- Badge content always reflects current form data
- Conditional fields appear/disappear based on current selections

**Edge Cases**:
- Switching expense type with data in type-specific sections (preserve data, hide sections)
- Switching payment method with posted date set (clear posted date for non-credit-card)
- Unchecking insurance eligibility with insurance data entered (preserve data, hide fields)
- Browser back/forward navigation (restore from sessionStorage)



## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
**Property Tests**: Verify universal properties across all input combinations

### Unit Testing Focus

Unit tests should cover:

1. **Component Rendering**:
   - CollapsibleSection renders correctly in expanded/collapsed states
   - HelpTooltip displays on hover and hides on mouse leave
   - Section badges display correct content

2. **User Interactions**:
   - Clicking section headers toggles expansion
   - Pressing Enter/Space on headers toggles expansion
   - Hovering over help icons shows tooltips
   - Pressing Escape hides tooltips

3. **Edge Cases**:
   - Switching expense type with data in sections
   - Switching payment method with posted date set
   - Unchecking insurance with insurance data entered
   - Form submission with validation errors in collapsed sections

4. **Integration Points**:
   - SessionStorage read/write operations
   - PersonAllocationModal integration
   - InvoiceUpload component integration
   - Form submission with all section combinations

### Property-Based Testing Focus

Property tests should verify universal behaviors across randomized inputs. Each test should run a minimum of 100 iterations.

**Test Library**: Use fast-check for frontend property-based testing

**Property Test Configuration**:
```javascript
// Example configuration
fc.assert(
  fc.property(
    // arbitraries here
    (inputs) => {
      // test property
    }
  ),
  { numRuns: 100 }
);
```



**Property Test Mapping**:

Each correctness property should be implemented as a property-based test with the following tag format:

```javascript
// Feature: expense-form-simplification, Property 1: Initial visibility in create mode
test('Property 1: Core fields visible in create mode', () => {
  fc.assert(
    fc.property(
      // Generate random initial props
      fc.record({
        people: fc.array(fc.record({ id: fc.nat(), name: fc.string() })),
        expense: fc.constant(null) // create mode
      }),
      (props) => {
        const { container } = render(<ExpenseForm {...props} />);
        
        // Verify only core fields are visible
        expect(container.querySelector('#date')).toBeInTheDocument();
        expect(container.querySelector('#place')).toBeInTheDocument();
        expect(container.querySelector('#type')).toBeInTheDocument();
        expect(container.querySelector('#amount')).toBeInTheDocument();
        expect(container.querySelector('#payment_method_id')).toBeInTheDocument();
        expect(container.querySelector('#notes')).toBeInTheDocument();
        
        // Verify advanced sections are collapsed
        const advancedSection = container.querySelector('.advanced-options-section');
        expect(advancedSection).toHaveAttribute('aria-expanded', 'false');
      }
    ),
    { numRuns: 100 }
  );
});
```

**Arbitraries to Create**:

1. **Expense Objects**: Generate random expenses with various field combinations
2. **Section States**: Generate random expansion state combinations
3. **Form Data**: Generate random valid and invalid form data
4. **Payment Methods**: Generate random payment method configurations
5. **People Lists**: Generate random people arrays for medical expenses
6. **Invoice Lists**: Generate random invoice arrays

**Key Properties to Test**:
- Property 1: Initial visibility (100 runs with random props)
- Property 2: Section expansion based on data (100 runs with random expenses)
- Property 3: Session state persistence (100 runs with random state changes)
- Property 4: Data preservation during collapse (100 runs with random data)
- Property 5: Badge display logic (100 runs with random data combinations)
- Property 9: Posted date visibility (100 runs with random payment methods)
- Property 10: Section visibility by type (100 runs with random expense types)
- Property 13: Reimbursement validation (100 runs with random amounts)
- Property 19: Keyboard navigation (100 runs with random expansion states)

### Test Coverage Goals

- **Unit Test Coverage**: 80%+ of component code
- **Property Test Coverage**: All 22 correctness properties
- **Integration Test Coverage**: All section interactions and form submission flows
- **Accessibility Test Coverage**: All ARIA attributes and keyboard interactions

### Testing Tools

- **Vitest**: Test runner for frontend tests
- **@testing-library/react**: Component rendering and interaction
- **@testing-library/user-event**: User interaction simulation
- **fast-check**: Property-based testing library
- **jest-axe**: Accessibility testing (optional enhancement)
