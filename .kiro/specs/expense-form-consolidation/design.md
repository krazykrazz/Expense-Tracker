# Design Document: Expense Form Consolidation

## Overview

This design document describes the refactoring of the expense editing functionality to eliminate code duplication between `ExpenseForm.jsx` and `ExpenseList.jsx`. Currently, `ExpenseList.jsx` contains a complete inline edit form that duplicates most of `ExpenseForm.jsx`'s functionality, leading to maintenance issues where features added to one form are missed in the other.

The solution is to have `ExpenseList.jsx` render `ExpenseForm` inside its edit modal, passing the expense to edit via the `expense` prop (which ExpenseForm already supports for edit mode).

## Architecture

### Data Flow

```
User clicks Edit → ExpenseList sets expenseToEdit → Modal opens with ExpenseForm
                                                            ↓
User modifies and submits → ExpenseForm calls API → API returns updated expense
                                                            ↓
ExpenseForm calls onExpenseAdded → ExpenseList.handleExpenseUpdated
                                                            ↓
ExpenseList calls onExpenseUpdated (to App.jsx) → Modal closes
```

## Components and Interfaces

### ExpenseList Component (Refactored)

The ExpenseList component will be simplified to only manage modal visibility state.

#### State to Retain
```javascript
// Modal visibility state
const [showEditModal, setShowEditModal] = useState(false);
const [expenseToEdit, setExpenseToEdit] = useState(null);
```

#### Handlers (Simplified)
```javascript
// Simplified edit click handler
const handleEditClick = useCallback((expense) => {
  setExpenseToEdit(expense);
  setShowEditModal(true);
}, []);

// Simplified cancel handler
const handleCancelEdit = useCallback(() => {
  setShowEditModal(false);
  setExpenseToEdit(null);
}, []);

// Callback for ExpenseForm - handles update and closes modal
const handleExpenseUpdated = useCallback((updatedExpense) => {
  if (onExpenseUpdated) {
    onExpenseUpdated(updatedExpense);
  }
  setShowEditModal(false);
  setExpenseToEdit(null);
}, [onExpenseUpdated]);
```

### Edit Modal Structure

The edit modal wraps ExpenseForm while maintaining existing UX:

```jsx
{showEditModal && expenseToEdit && (
  <div className="modal-overlay" onClick={handleCancelEdit}>
    <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
      <button 
        className="modal-close-button" 
        onClick={handleCancelEdit}
        aria-label="Close"
      >
        ×
      </button>
      <ExpenseForm
        expense={expenseToEdit}
        people={people}
        onExpenseAdded={handleExpenseUpdated}
      />
    </div>
  </div>
)}
```

### ExpenseForm Props Interface

ExpenseForm already supports these props:

| Prop | Type | Description |
|------|------|-------------|
| `expense` | `object \| null` | Expense to edit (null for create mode) |
| `people` | `array` | List of people for medical expense assignment |
| `onExpenseAdded` | `function` | Callback when expense is created/updated |

## Correctness Properties

### Property 1: Modal Renders ExpenseForm with Correct Props
*For any* expense in the expense list, when the user clicks the Edit button, the edit modal SHALL render ExpenseForm with the `expense` prop set to the clicked expense and the `people` prop containing the available family members.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 3: Form Pre-population
*For any* expense being edited, the ExpenseForm SHALL display the expense's existing values (date, place, notes, amount, type, method, and any insurance/people/invoice data) as the initial form state.
**Validates: Requirements 3.5**

### Property 4: Medical Expense Sections Visibility
*For any* expense with type "Tax - Medical", the ExpenseForm SHALL display both the insurance tracking section (eligibility checkbox, original cost, claim status, reimbursement) AND the people assignment section.
**Validates: Requirements 4.1, 4.2**

### Property 5: Tax-Deductible Invoice Section Visibility
*For any* expense with type "Tax - Medical" OR "Tax - Donation", the ExpenseForm SHALL display the invoice upload section with support for multiple invoices.
**Validates: Requirements 4.3**

### Property 6: General Form Features Availability
*For any* expense being edited, the ExpenseForm SHALL display the "Add to Future Months" option, all available expense categories in the type dropdown, and all available payment methods in the method dropdown.
**Validates: Requirements 4.4, 4.5, 4.6**

### Property 7: Successful Update Callback Chain
*For any* successful expense update, ExpenseForm SHALL call onExpenseAdded with the updated expense data, which SHALL trigger ExpenseList to call onExpenseUpdated AND close the edit modal.
**Validates: Requirements 5.1, 5.2, 5.3, 3.3**

### Property 8: Error Handling Preserves Modal State
*For any* failed expense update attempt, the ExpenseForm SHALL display an error message AND the edit modal SHALL remain open with the user's entered data preserved.
**Validates: Requirements 5.4**

### Property 9: Invoice Data Loading and Display
*For any* tax-deductible expense (medical or donation) being edited, the system SHALL load existing invoice data and ExpenseForm SHALL display all associated invoices.
**Validates: Requirements 6.1, 6.2**

### Property 11: People Data Loading and Display
*For any* medical expense being edited, the system SHALL load existing people assignments and ExpenseForm SHALL display the currently assigned people.
**Validates: Requirements 7.1, 7.2**

## Testing Strategy

### Property-Based Tests

Property-based tests verify universal properties across all inputs using fast-check.

**Test Files:**
- `ExpenseList.editModal.pbt.test.jsx` - Properties 1, 3, 4, 5, 6
- `ExpenseList.editModal.callback.pbt.test.jsx` - Properties 7, 8
- `ExpenseList.editModal.dataLoading.pbt.test.jsx` - Properties 9, 11

## Migration Notes

### Files Modified

1. **frontend/src/components/ExpenseList.jsx**
   - Removed duplicate state variables
   - Removed duplicate handler functions
   - Removed duplicate constants
   - Simplified edit modal to render ExpenseForm
   - Added import for ExpenseForm

### Backward Compatibility

- No API changes required
- No database changes required
- User experience remains the same (same modal, same fields, same behavior)
- All existing functionality preserved through ExpenseForm
