# Design Document

## Overview

The Medical Expense People Tracking feature extends the existing expense tracking system to associate medical expenses with specific family members and provide detailed tax reporting organized by person and provider. This enhancement builds upon the current "Tax - Medical" category to enable more granular tracking for tax preparation and family expense management.

The system supports both single-person and multi-person expense allocation, maintains backward compatibility with existing medical expenses, and provides comprehensive reporting views for tax documentation.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
├─────────────────────────────────────────────────────────────┤
│  PeopleManagementModal  │  ExpenseForm (Enhanced)          │
│  TaxDeductible (Enhanced) │  PersonAllocationModal          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ API Calls
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                      Backend API                             │
├─────────────────────────────────────────────────────────────┤
│  peopleController  →  peopleService  →  peopleRepository    │
│  expenseController (Enhanced) → expenseService (Enhanced)   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ Database Queries
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                       Database                               │
├─────────────────────────────────────────────────────────────┤
│  people table (new)                                         │
│  expense_people table (new - junction table)                │
│  expenses table (existing)                                   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **People Management**: User → PeopleManagementModal → peopleController → peopleService → peopleRepository → Database

2. **Medical Expense with People**: User → ExpenseForm → PersonAllocationModal (if multi-person) → expenseController → expenseService → Database (expenses + expense_people tables)

3. **Tax Reporting**: User → TaxDeductible → expenseController.getTaxDeductible() → expenseService aggregates with people data → returns grouped summary

4. **Backward Compatibility**: Existing expenses without people associations display as "Unassigned" in person-grouped views

## Components and Interfaces

### Database Schema

#### people Table
```sql
CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### expense_people Table (Junction Table)
```sql
CREATE TABLE expense_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
    UNIQUE(expense_id, person_id)
);
```

### Frontend Components

#### PeopleManagementModal
Modal interface for managing family members.

**Props**:
- `isOpen`: boolean - Modal visibility
- `onClose`: () => void - Close modal callback
- `onPeopleUpdated`: () => void - Callback after people changes

**State**:
- `people`: Person[] - List of family members
- `editingPerson`: Person | null - Person being edited
- `loading`: boolean - Loading state
- `error`: string | null - Error message

**Key Methods**:
- `handleAddPerson(name, dateOfBirth)` - Add new person
- `handleUpdatePerson(id, name, dateOfBirth)` - Update person details
- `handleDeletePerson(id)` - Remove person (with cascade warning)

#### PersonAllocationModal
Modal for allocating expense amounts across multiple people.

**Props**:
- `isOpen`: boolean - Modal visibility
- `expense`: Expense - The expense being allocated
- `selectedPeople`: Person[] - People to allocate to
- `onSave`: (allocations: PersonAllocation[]) => void - Save callback
- `onCancel`: () => void - Cancel callback

**State**:
- `allocations`: PersonAllocation[] - Amount per person
- `totalAllocated`: number - Sum of allocations
- `isValid`: boolean - Whether allocations sum to expense total

**Key Methods**:
- `handleSplitEqually()` - Divide amount equally among people
- `handleAmountChange(personId, amount)` - Update person's allocation
- `validateAllocations()` - Check if allocations sum to total

#### Enhanced ExpenseForm
Extended expense form with people selection for medical expenses.

**Additional Props**:
- `people`: Person[] - Available people for selection

**Additional State**:
- `selectedPeople`: Person[] - Selected people for medical expenses
- `showPersonAllocation`: boolean - Whether to show allocation modal

**Key Methods**:
- `handlePeopleChange(selectedPeople)` - Handle people selection
- `handlePersonAllocation(allocations)` - Save person-amount allocations

#### Enhanced TaxDeductible
Extended tax deductible view with person-grouped medical expenses.

**Additional State**:
- `groupByPerson`: boolean - Toggle for person grouping
- `showUnassigned`: boolean - Whether to show unassigned expenses

**Key Methods**:
- `groupExpensesByPerson(expenses)` - Group medical expenses by person
- `calculatePersonTotals(expenses)` - Calculate per-person totals
- `handleAssignPerson(expenseId, personId, amount)` - Quick assign person

### Backend Services

#### peopleService
Service for managing family members.

**Key Methods**:
- `createPerson(name, dateOfBirth)` - Create new person
- `updatePerson(id, name, dateOfBirth)` - Update person details
- `deletePerson(id)` - Delete person and cascade to expense associations
- `getAllPeople()` - Get all family members
- `getPersonById(id)` - Get specific person

#### Enhanced expenseService
Extended expense service with people association support.

**Additional Methods**:
- `createExpenseWithPeople(expenseData, personAllocations)` - Create expense with people
- `updateExpenseWithPeople(id, expenseData, personAllocations)` - Update expense and people
- `getExpenseWithPeople(id)` - Get expense with associated people
- `getTaxDeductibleWithPeople(year)` - Get tax deductible expenses grouped by person

### Data Models

#### Person
```typescript
interface Person {
  id: number;
  name: string;
  dateOfBirth?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### PersonAllocation
```typescript
interface PersonAllocation {
  personId: number;
  personName: string;
  amount: number;
}
```

#### Enhanced Expense
```typescript
interface ExpenseWithPeople extends Expense {
  people?: PersonAllocation[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all properties identified in the prework analysis, I identified several areas where properties can be combined or where redundancy exists:

- Properties 2.4 and 4.4 both test amount allocation validation - these can be combined into one comprehensive validation property
- Properties 2.5 and 4.5 both test storage of person-amount relationships - these can be combined into one storage property
- Properties 5.4 and 5.5 both test handling of mixed assigned/unassigned data - these can be combined into one comprehensive mixed-data property

The following properties represent the unique validation requirements after eliminating redundancy:

**Property 1: Person data round-trip**
*For any* valid person with name and optional date of birth, storing then retrieving the person should produce equivalent data
**Validates: Requirements 1.3**

**Property 2: Person deletion cascades to expense associations**
*For any* person with associated medical expenses, deleting the person should remove all expense-person associations
**Validates: Requirements 1.4**

**Property 3: Person updates propagate to associated expenses**
*For any* person with associated expenses, updating the person's information should reflect in all expense associations
**Validates: Requirements 1.5**

**Property 4: Amount allocation validation**
*For any* medical expense with multiple people, the sum of allocated amounts must equal the total expense amount
**Validates: Requirements 2.4, 4.4**

**Property 5: Person-amount relationship storage**
*For any* medical expense with people associations, storing then retrieving should preserve all person-amount pairs accurately
**Validates: Requirements 2.5, 4.5**

**Property 6: Single person assignment**
*For any* medical expense assigned to one person, the full expense amount should be associated with that person
**Validates: Requirements 4.1**

**Property 7: Person-grouped expense aggregation**
*For any* set of medical expenses with people associations, grouping by person should correctly sum amounts per person per provider
**Validates: Requirements 3.2**

**Property 8: Tax summary calculation accuracy**
*For any* collection of medical expenses with people associations, per-person totals should equal the sum of that person's allocated amounts
**Validates: Requirements 3.5**

**Property 9: Backward compatibility preservation**
*For any* existing medical expense without people associations, the expense should remain displayable and editable after the feature deployment
**Validates: Requirements 5.1, 5.3**

**Property 10: Mixed data handling**
*For any* combination of assigned and unassigned medical expenses, reports should correctly include both types and show unassigned expenses in appropriate sections
**Validates: Requirements 5.4, 5.5**

**Property 11: Unassigned expense identification**
*For any* medical expense without people associations, the system should clearly indicate its unassigned status in person-grouped views
**Validates: Requirements 6.1, 6.5**

**Property 12: Assignment workflow correctness**
*For any* previously unassigned medical expense, adding people associations should update the expense and refresh summary calculations
**Validates: Requirements 6.3**

**Property 13: Report filtering accuracy**
*For any* tax report with optional unassigned expense exclusion, the filtered totals should only include expenses with people associations
**Validates: Requirements 6.4**

## Error Handling

### Validation Errors
- **Invalid Person Data**: Empty names, invalid date formats
- **Amount Allocation Errors**: Allocations that don't sum to expense total
- **Duplicate Person Names**: Prevent duplicate family member names
- **Orphaned Associations**: Handle cases where person is deleted but associations remain

### Data Integrity
- **Cascade Deletes**: Ensure expense-people associations are removed when person is deleted
- **Transaction Safety**: Ensure expense and people associations are created/updated atomically
- **Constraint Violations**: Handle foreign key constraint violations gracefully

### User Experience
- **Loading States**: Show loading indicators during people operations
- **Confirmation Dialogs**: Confirm person deletion with cascade warning
- **Validation Feedback**: Clear error messages for allocation validation failures
- **Graceful Degradation**: Handle missing people data in expense displays

## Testing Strategy

### Unit Testing
- Test people CRUD operations
- Test expense-people association logic
- Test amount allocation validation
- Test person deletion cascade behavior
- Test tax summary calculation accuracy

### Property-Based Testing
The system will use property-based testing with fast-check library to validate the 13 correctness properties listed above. Each property will run 100+ iterations with randomly generated test data to ensure comprehensive coverage.

**Property Test Configuration**:
- Minimum 100 iterations per property
- Random generation of people, expenses, and allocations
- Edge case testing (zero amounts, single person, maximum people)
- Boundary testing (amount precision, name length limits)

### Integration Testing
- Test complete expense creation workflow with people
- Test tax deductible view with person grouping
- Test people management modal operations
- Test backward compatibility with existing expenses
- Test person allocation modal workflow

### Manual Testing Scenarios
- Create family members with various name/date combinations
- Create single-person medical expenses
- Create multi-person medical expenses with equal and unequal splits
- View tax deductible summary with person grouping
- Edit existing medical expenses to add people associations
- Delete people and verify cascade behavior
- Test with mix of assigned and unassigned medical expenses