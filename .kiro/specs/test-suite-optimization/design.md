# Test Suite Optimization - Design

## Overview

This design outlines the approach for splitting ExpenseForm.test.jsx into focused test files and adding fast test commands to improve developer experience.

## Architecture

### Test File Organization

```
frontend/src/components/
├── ExpenseForm.jsx
├── ExpenseForm.core.test.jsx          (Basic rendering & submission)
├── ExpenseForm.sections.test.jsx      (Collapsible sections & badges)
├── ExpenseForm.people.test.jsx        (People assignment feature)
├── ExpenseForm.futureMonths.test.jsx  (Future months feature)
├── ExpenseForm.dataPreservation.test.jsx (Data persistence)
├── ExpenseForm.pbt.test.jsx           (Existing - unchanged)
├── ExpenseForm.editMode.test.jsx      (Existing - unchanged)
├── ExpenseForm.invoice.test.jsx       (Existing - unchanged)
├── ExpenseForm.integration.test.jsx   (Existing - unchanged)
└── ExpenseForm.accessibility.test.jsx (Existing - unchanged)
```

### Shared Test Utilities

Extract common setup code to avoid duplication:

```javascript
// test-utils/expenseFormHelpers.js
export const mockCategories = [
  'Other', 'Groceries', 'Gas', 'Dining Out', 'Tax - Medical', 'Tax - Donation'
];

export const mockPaymentMethods = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Credit Card', type: 'credit_card', is_active: 1 },
  { id: 3, display_name: 'Debit Card', type: 'debit', is_active: 1 }
];

export const setupExpenseFormMocks = () => {
  // Common mock setup
  categoriesApi.getCategories.mockResolvedValue(mockCategories);
  expenseApi.getPlaces.mockResolvedValue([]);
  peopleApi.getPeople.mockResolvedValue([]);
  // ... etc
};

export const expandSection = async (container, sectionName) => {
  const header = Array.from(container.querySelectorAll('.collapsible-header'))
    .find(h => h.textContent.includes(sectionName));
  
  if (!header) throw new Error(`Section "${sectionName}" not found`);
  
  fireEvent.click(header);
  
  await waitFor(() => {
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });
  
  return header;
};

export const fillBasicFields = async (container) => {
  fireEvent.change(screen.getByLabelText(/^Date \*/i), { 
    target: { value: '2025-01-15' } 
  });
  fireEvent.change(screen.getByLabelText(/Amount/i), { 
    target: { value: '100.00' } 
  });
  fireEvent.change(screen.getByLabelText(/Type/i), { 
    target: { value: 'Other' } 
  });
  fireEvent.change(screen.getByLabelText(/Payment Method/i), { 
    target: { value: '1' } 
  });
};
```

## Test File Breakdown

### 1. ExpenseForm.core.test.jsx

**Purpose:** Basic form functionality - rendering, submission, validation

**Test Groups:**
- Form rendering and initial state
- Required field validation
- Basic form submission
- Form reset after successful submission
- Default values (date, payment method memory)
- Error handling

**Estimated Tests:** 10-12

**Key Patterns:**
```javascript
describe('ExpenseForm - Core Functionality', () => {
  beforeEach(() => {
    setupExpenseFormMocks();
  });

  it('should render all required fields', async () => { ... });
  it('should validate required fields', async () => { ... });
  it('should submit form with valid data', async () => { ... });
  it('should reset form after successful submission', async () => { ... });
});
```

### 2. ExpenseForm.sections.test.jsx

**Purpose:** Collapsible sections, badges, help tooltips

**Test Groups:**
- Advanced Options section (visibility, expansion, badges)
- Reimbursement section (visibility, badges, validation)
- Insurance section (visibility, badges)
- People Assignment section (visibility, badges)
- Help tooltip display

**Estimated Tests:** 15-18

**Key Patterns:**
```javascript
describe('ExpenseForm - Advanced Options Section', () => {
  it('should display badge with posted date when set', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await expandSection(container, 'Advanced Options');
    
    // Set posted date
    const postedDateInput = container.querySelector('input[name="posted_date"]');
    fireEvent.change(postedDateInput, { target: { value: '2025-01-20' } });
    
    // Verify badge
    const header = container.querySelector('[aria-label*="Advanced Options"]');
    const badge = header.querySelector('.collapsible-badge');
    expect(badge.textContent).toMatch(/Posted:/);
  });
});
```

### 3. ExpenseForm.people.test.jsx

**Purpose:** People assignment feature for medical expenses

**Test Groups:**
- People dropdown visibility (medical vs non-medical)
- Single person selection
- Multiple people selection
- Person allocation modal
- People selection clearing

**Estimated Tests:** 8-10

**Key Patterns:**
```javascript
describe('ExpenseForm - People Selection Enhancement', () => {
  const mockPeople = [
    { id: 1, name: 'John Doe', dateOfBirth: '1990-01-01' },
    { id: 2, name: 'Jane Smith', dateOfBirth: '1985-05-15' }
  ];

  beforeEach(() => {
    setupExpenseFormMocks();
    peopleApi.getPeople.mockResolvedValue(mockPeople);
  });

  it('should show people dropdown only for medical expenses', async () => { ... });
});
```

### 4. ExpenseForm.futureMonths.test.jsx

**Purpose:** Future months feature for recurring expenses

**Test Groups:**
- Future months checkbox rendering
- Date range preview
- Future months dropdown
- API parameter passing
- Success messages
- Reset after submission

**Estimated Tests:** 8-10

**Key Patterns:**
```javascript
describe('ExpenseForm - Future Months Feature', () => {
  it('should pass futureMonths to createExpense API', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await fillBasicFields(container);
    await expandSection(container, 'Advanced Options');
    
    // Enable future months
    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);
    
    // Select 3 months
    const dropdown = container.querySelector('select[name="futureMonths"]');
    fireEvent.change(dropdown, { target: { value: '3' } });
    
    // Submit
    fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));
    
    // Verify API call
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.any(Object),
        null,
        3 // futureMonths
      );
    });
  });
});
```

### 5. ExpenseForm.dataPreservation.test.jsx

**Purpose:** Data persistence during section collapse/expand

**Test Groups:**
- Reimbursement data preservation
- Insurance data preservation
- Advanced options data preservation
- People assignment data preservation

**Estimated Tests:** 8-10

**Key Patterns:**
```javascript
describe('ExpenseForm - Data Preservation During Collapse', () => {
  it('should preserve generic original cost when Reimbursement section is collapsed', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Set type to non-medical
    fireEvent.change(screen.getByLabelText(/Type/i), { 
      target: { value: 'Groceries' } 
    });
    
    // Expand Reimbursement section
    const header = await expandSection(container, 'Reimbursement');
    
    // Set original cost
    const originalCostInput = container.querySelector('#genericOriginalCost');
    fireEvent.change(originalCostInput, { target: { value: '150.00' } });
    
    // Collapse section
    fireEvent.click(header);
    
    // Re-expand section
    fireEvent.click(header);
    await waitFor(() => {
      expect(header.getAttribute('aria-expanded')).toBe('true');
    });
    
    // Verify value preserved
    const preservedInput = container.querySelector('#genericOriginalCost');
    expect(preservedInput.value).toBe('150.00');
  });
});
```

## NPM Scripts

Add to `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest --run",
    "test:watch": "vitest",
    "test:changed": "vitest --changed --run",
    "test:fast": "FAST_CHECK_NUM_RUNS=10 vitest --run",
    "test:core": "vitest --run ExpenseForm.core",
    "test:sections": "vitest --run ExpenseForm.sections",
    "test:people": "vitest --run ExpenseForm.people",
    "test:futureMonths": "vitest --run ExpenseForm.futureMonths",
    "test:dataPreservation": "vitest --run ExpenseForm.dataPreservation"
  }
}
```

## Migration Process

### Phase 1: Extract Shared Utilities
1. Create `test-utils/expenseFormHelpers.js`
2. Extract common mock data
3. Extract helper functions (expandSection, fillBasicFields)
4. Test helpers in isolation

### Phase 2: Create New Test Files
1. Create 5 new test files with basic structure
2. Copy relevant tests from ExpenseForm.test.jsx
3. Update imports to use shared utilities
4. Verify each file runs independently

### Phase 3: Verification
1. Run all new test files together
2. Verify test count: should be 67 total
3. Verify all tests pass
4. Check for duplicate tests

### Phase 4: Cleanup
1. Delete original ExpenseForm.test.jsx
2. Update documentation
3. Add npm scripts
4. Update CI configuration if needed

## Correctness Properties

### Property 1: Test Count Preservation
**Statement:** The total number of tests across all split files equals the original test count

**Validation:**
```javascript
// Before split
const originalCount = 67;

// After split
const coreCount = countTests('ExpenseForm.core.test.jsx');
const sectionsCount = countTests('ExpenseForm.sections.test.jsx');
const peopleCount = countTests('ExpenseForm.people.test.jsx');
const futureMonthsCount = countTests('ExpenseForm.futureMonths.test.jsx');
const dataPreservationCount = countTests('ExpenseForm.dataPreservation.test.jsx');

const totalCount = coreCount + sectionsCount + peopleCount + 
                   futureMonthsCount + dataPreservationCount;

assert(totalCount === originalCount, 'Test count mismatch');
```

### Property 2: Test Independence
**Statement:** Each test file can run independently without failures

**Validation:**
```bash
# Run each file individually
npm test -- ExpenseForm.core.test.jsx
npm test -- ExpenseForm.sections.test.jsx
npm test -- ExpenseForm.people.test.jsx
npm test -- ExpenseForm.futureMonths.test.jsx
npm test -- ExpenseForm.dataPreservation.test.jsx

# All should pass
```

### Property 3: Parallel Execution Safety
**Statement:** Running all test files in parallel produces the same results as sequential execution

**Validation:**
```bash
# Sequential
npm test -- --run ExpenseForm.*.test.jsx

# Parallel (default Vitest behavior)
npm test -- ExpenseForm.*.test.jsx

# Results should be identical
```

## Documentation Updates

### testing.md Updates

Add section:

```markdown
## ExpenseForm Test Organization

The ExpenseForm tests are split into focused files for better organization and parallel execution:

- **ExpenseForm.core.test.jsx** - Basic rendering, submission, validation
- **ExpenseForm.sections.test.jsx** - Collapsible sections, badges, tooltips
- **ExpenseForm.people.test.jsx** - People assignment for medical expenses
- **ExpenseForm.futureMonths.test.jsx** - Future months recurring feature
- **ExpenseForm.dataPreservation.test.jsx** - Data persistence during collapse/expand

### Running Specific Test Groups

```bash
# Run only core tests
npm run test:core

# Run only section tests
npm run test:sections

# Run all ExpenseForm tests
npm test -- ExpenseForm

# Run only changed tests
npm run test:changed
```
```

## Risk Mitigation

### Risk: Tests Lost During Split
**Mitigation:** 
- Count tests before and after split
- Use grep to verify all test names are present
- Manual review of test list

### Risk: Shared State Between Tests
**Mitigation:**
- Use `beforeEach` to reset mocks
- Clear sessionStorage in global beforeEach
- Verify tests pass when run in isolation

### Risk: Timing Issues in Parallel Execution
**Mitigation:**
- Use proper `waitFor` for async operations
- Avoid hardcoded timeouts
- Test parallel execution multiple times

## Success Criteria

- ✅ All 67 tests preserved
- ✅ All tests pass after split
- ✅ Each file runs independently
- ✅ Parallel execution works correctly
- ✅ Documentation updated
- ✅ NPM scripts added
- ✅ Shared utilities extracted
- ✅ Test execution time improved
