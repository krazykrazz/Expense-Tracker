# Frontend Testing Guidelines

## When to Use Each Test Type

This section provides comprehensive guidance on selecting the appropriate test type for different scenarios. Understanding when to use each approach helps you write effective, maintainable tests without overthinking the decision.

### Testing Pyramid Overview

```
         /\
        /E2E\          Critical user paths, visual validation
       /------\        (Slowest, most expensive, highest confidence)
      /  PBT   \       Business logic, algorithms, data transformations
     /----------\      (Medium speed, explores input space)
    /Integration \     Component interactions, user workflows
   /--------------\    (Medium speed, realistic scenarios)
  /   Unit Tests   \   Component rendering, specific examples, edge cases
 /------------------\  (Fastest, most focused, lowest cost)
```

**Key Principles:**
- **Unit tests**: Fast, focused, test single components in isolation
- **Integration tests**: Test multiple components working together, user workflows
- **Property-based tests (PBT)**: Test algorithms and business logic with clear invariants
- **E2E tests**: Test critical paths in real browsers, visual validation

### Decision Flowchart

```
START: What are you testing?
│
├─ UI Component Rendering?
│  ├─ Single component in isolation? ──────────────────────► UNIT TEST
│  ├─ Multiple components interacting? ────────────────────► INTEGRATION TEST
│  └─ Complete user workflow in real browser? ─────────────► E2E TEST
│
├─ User Interactions (clicks, typing, form submission)?
│  ├─ Single component behavior? ──────────────────────────► UNIT TEST
│  ├─ Multi-component workflow? ───────────────────────────► INTEGRATION TEST
│  └─ Critical path requiring real browser? ───────────────► E2E TEST
│
├─ Business Logic / Algorithm?
│  ├─ Specific example or edge case? ──────────────────────► UNIT TEST
│  ├─ Finite, enumerable inputs (< 10 cases)? ─────────────► PARAMETERIZED TEST
│  └─ Large/infinite input space with invariants? ─────────► PROPERTY-BASED TEST
│
├─ Data Transformation / Calculation?
│  ├─ Specific calculation example? ───────────────────────► UNIT TEST
│  ├─ Mathematical property across all inputs? ────────────► PROPERTY-BASED TEST
│  └─ Finite set of transformation rules? ─────────────────► PARAMETERIZED TEST
│
├─ State Management / Context?
│  ├─ Specific state transition? ──────────────────────────► UNIT TEST
│  ├─ State machine with many possible sequences? ─────────► PROPERTY-BASED TEST
│  └─ Context integration with components? ────────────────► INTEGRATION TEST
│
└─ API Integration?
   ├─ Single API call with mock? ──────────────────────────► UNIT TEST
   ├─ Multiple API calls in workflow? ─────────────────────► INTEGRATION TEST
   └─ Real API in production environment? ──────────────────► E2E TEST
```

### Unit Tests

**Use When:**
- Testing a single component in isolation
- Verifying specific behavior or edge cases
- Testing component rendering with different props
- Testing error handling for specific scenarios
- Testing utility functions with concrete examples

**Examples:**

```javascript
// ✅ GOOD: Testing specific component rendering
describe('ExpenseForm', () => {
  it('should render all required fields', () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Place')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
  });
  
  it('should show validation error for empty amount', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    const amountInput = screen.getByLabelText('Amount');
    await userEvent.clear(amountInput);
    await userEvent.tab(); // Trigger blur
    
    expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
  });
});

// ✅ GOOD: Testing utility function with specific example
describe('calculateTaxCredit', () => {
  it('should calculate 15% federal credit for medical expenses', () => {
    const result = calculateTaxCredit(1000, 'medical');
    expect(result.federal).toBe(150);
  });
  
  it('should return zero for expenses below threshold', () => {
    const result = calculateTaxCredit(50, 'medical');
    expect(result.federal).toBe(0);
  });
});
```

**When NOT to Use:**
- ❌ Testing multiple components working together (use integration tests)
- ❌ Testing all possible input combinations (use PBT or parameterized tests)
- ❌ Testing browser-specific behavior (use E2E tests)

### Integration Tests

**Use When:**
- Testing multiple components working together
- Verifying user workflows that span components
- Testing context providers with consuming components
- Testing component interactions with real (mocked) APIs
- Testing form submission flows

**Examples:**

```javascript
// ✅ GOOD: Testing multiple components in a workflow
describe('Expense Management Workflow', () => {
  it('should add expense and update list', async () => {
    const mockApi = createExpenseApiMock({
      addExpense: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      fetchExpenses: vi.fn().mockResolvedValue({ data: [newExpense] }),
    });
    
    render(
      <ExpenseProvider api={mockApi}>
        <ExpenseForm />
        <ExpenseList />
      </ExpenseProvider>
    );
    
    // Fill form
    await userEvent.type(screen.getByLabelText('Place'), 'Grocery Store');
    await userEvent.type(screen.getByLabelText('Amount'), '50.00');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Groceries');
    
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /add expense/i }));
    
    // Verify API called
    expect(mockApi.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ place: 'Grocery Store', amount: 50.00 })
    );
    
    // Verify list updated
    await waitFor(() => {
      expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    });
  });
});

// ✅ GOOD: Testing context integration
describe('FilterContext Integration', () => {
  it('should filter expenses when category changes', async () => {
    render(
      <FilterProvider>
        <FilterControls />
        <ExpenseList expenses={testExpenses} />
      </FilterProvider>
    );
    
    // Change filter
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Groceries');
    
    // Verify filtered results
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.queryByText('Gas Station')).not.toBeInTheDocument();
  });
});
```

**When NOT to Use:**
- ❌ Testing single component in isolation (use unit tests)
- ❌ Testing all possible state transitions (use PBT)
- ❌ Testing visual appearance (use E2E tests)

### Property-Based Tests (PBT)

**Use When:**
- Testing algorithms with mathematical properties
- Testing data transformations with invariants
- Testing state machines with many possible sequences
- Testing business logic across large input ranges
- Testing that operations maintain system invariants

**Examples:**

```javascript
// ✅ GOOD: Testing mathematical property
describe('Budget Calculation Properties', () => {
  it('Property: total spent never exceeds sum of individual expenses', () => {
    fc.assert(
      fc.property(
        fc.array(expenseRecord(), { minLength: 1, maxLength: 50 }),
        (expenses) => {
          const total = calculateTotal(expenses);
          const sum = expenses.reduce((acc, e) => acc + e.amount, 0);
          expect(total).toBeCloseTo(sum, 2);
        }
      )
    );
  });
});

// ✅ GOOD: Testing state machine invariant
describe('Modal State Machine Properties', () => {
  it('Property: modal operations maintain single-modal invariant', () => {
    fc.assert(
      fc.property(
        modalOperationSequence({ minLength: 5, maxLength: 20 }),
        (operations) => {
          const { result } = renderHook(() => useModalContext(), {
            wrapper: createModalWrapper(),
          });
          
          operations.forEach(op => {
            act(() => {
              if (op.type === 'open') result.current.openModal(op.modal);
              else result.current.closeModal(op.modal);
            });
          });
          
          // Invariant: at most one modal open at a time
          const openModals = Object.entries(result.current)
            .filter(([key, value]) => key.startsWith('show') && value === true);
          expect(openModals.length).toBeLessThanOrEqual(1);
        }
      )
    );
  });
});

// ✅ GOOD: Testing data transformation invariant
describe('Expense Filtering Properties', () => {
  it('Property: filtering is idempotent', () => {
    fc.assert(
      fc.property(
        fc.array(expenseRecord(), { minLength: 1, maxLength: 30 }),
        expenseCategory(),
        (expenses, category) => {
          const filtered1 = filterByCategory(expenses, category);
          const filtered2 = filterByCategory(filtered1, category);
          expect(filtered2).toEqual(filtered1);
        }
      )
    );
  });
  
  it('Property: filtered results are subset of original', () => {
    fc.assert(
      fc.property(
        fc.array(expenseRecord(), { minLength: 1, maxLength: 30 }),
        paymentMethod(),
        (expenses, method) => {
          const filtered = filterByMethod(expenses, method);
          expect(filtered.length).toBeLessThanOrEqual(expenses.length);
          filtered.forEach(e => {
            expect(expenses).toContainEqual(e);
          });
        }
      )
    );
  });
});
```

**When NOT to Use:**
- ❌ Testing UI component rendering (use unit tests)
- ❌ Testing user interactions like clicks and typing (use integration tests)
- ❌ Testing finite, enumerable inputs (use parameterized tests)
- ❌ Testing visual appearance (use E2E tests)
- ❌ Testing specific examples or edge cases (use unit tests)

**Why NOT PBT for UI?**
- UI interactions are discrete events, not continuous input spaces
- Component rendering depends on specific prop combinations, not mathematical properties
- User events (clicks, typing) don't have meaningful invariants to test
- PBT adds complexity without discovering new issues in UI code
- Shrinking counterexamples is less useful for UI failures

### Parameterized Tests

**Use When:**
- Testing the same logic across a finite, enumerable set of inputs
- Testing behavior for each category, payment method, or status
- Testing validation rules for different field types
- Testing conditional rendering for known states
- Input space is small (< 10 cases) and fully enumerable

**Examples:**

```javascript
// ✅ GOOD: Testing validation for each required field
import { testEach } from '../test-utils';

describe('ExpenseForm Validation', () => {
  testEach([
    { field: 'Date', label: 'Date', error: 'Date is required' },
    { field: 'Place', label: 'Place', error: 'Place is required' },
    { field: 'Amount', label: 'Amount', error: 'Amount is required' },
    { field: 'Category', label: 'Category', error: 'Category is required' },
  ]).test('shows error when $field is empty', async ({ label, error }) => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    await userEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(error)).toBeInTheDocument();
    });
  });
});

// ✅ GOOD: Testing conditional fields for each category
describe('ExpenseForm Conditional Fields', () => {
  testEach([
    { 
      category: 'Tax - Medical', 
      expectedFields: ['Insurance Status', 'Assign to People'],
      description: 'medical category'
    },
    { 
      category: 'Tax - Donation', 
      expectedFields: ['Donation Receipt'],
      description: 'donation category'
    },
    { 
      category: 'Groceries', 
      expectedFields: [],
      description: 'regular category'
    },
  ]).test('shows correct fields for $description', async ({ category, expectedFields }) => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await userEvent.selectOptions(screen.getByLabelText('Category'), category);
    
    expectedFields.forEach(field => {
      expect(screen.getByLabelText(field)).toBeInTheDocument();
    });
  });
});

// ✅ GOOD: Testing status badge colors
describe('InsuranceStatusIndicator', () => {
  testEach([
    { status: 'pending', color: 'orange', description: 'pending status' },
    { status: 'submitted', color: 'blue', description: 'submitted status' },
    { status: 'approved', color: 'green', description: 'approved status' },
    { status: 'denied', color: 'red', description: 'denied status' },
  ]).test('displays $color badge for $description', ({ status, color }) => {
    render(<InsuranceStatusIndicator status={status} />);
    
    const badge = screen.getByTestId('status-badge');
    expect(badge).toHaveClass(`badge-${color}`);
  });
});
```

**When NOT to Use:**
- ❌ Input space is large or infinite (use PBT)
- ❌ Testing a single specific scenario (use unit test)
- ❌ Testing complex workflows (use integration tests)

### E2E Tests

**Use When:**
- Testing critical user paths in production-like environment
- Verifying browser-specific behavior (file uploads, downloads)
- Testing visual appearance and layout
- Testing real API integration (not mocked)
- Testing cross-browser compatibility
- Testing accessibility with real assistive technologies

**Examples:**

```javascript
// ✅ GOOD: Critical user path (using Playwright/Cypress)
describe('Expense Management E2E', () => {
  it('should complete full expense workflow', async () => {
    await page.goto('http://localhost:5173');
    
    // Add expense
    await page.click('button:has-text("Add Expense")');
    await page.fill('input[name="place"]', 'Grocery Store');
    await page.fill('input[name="amount"]', '50.00');
    await page.selectOption('select[name="category"]', 'Groceries');
    await page.click('button:has-text("Save")');
    
    // Verify in list
    await expect(page.locator('text=Grocery Store')).toBeVisible();
    
    // Edit expense
    await page.click('button[aria-label="Edit Grocery Store expense"]');
    await page.fill('input[name="amount"]', '55.00');
    await page.click('button:has-text("Update")');
    
    // Verify updated
    await expect(page.locator('text=$55.00')).toBeVisible();
    
    // Delete expense
    await page.click('button[aria-label="Delete Grocery Store expense"]');
    await page.click('button:has-text("Confirm")');
    
    // Verify removed
    await expect(page.locator('text=Grocery Store')).not.toBeVisible();
  });
});

// ✅ GOOD: Visual validation
describe('Responsive Layout E2E', () => {
  it('should display mobile layout on small screens', async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5173');
    
    // Verify mobile menu visible
    await expect(page.locator('button[aria-label="Menu"]')).toBeVisible();
    
    // Verify desktop sidebar hidden
    await expect(page.locator('aside.sidebar')).not.toBeVisible();
  });
});

// ✅ GOOD: File upload
describe('Invoice Upload E2E', () => {
  it('should upload and display invoice PDF', async () => {
    await page.goto('http://localhost:5173/expenses');
    
    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('./test-fixtures/invoice.pdf');
    
    // Verify preview
    await expect(page.locator('iframe[title="Invoice Preview"]')).toBeVisible();
    
    // Verify download link
    const downloadLink = page.locator('a:has-text("Download Invoice")');
    await expect(downloadLink).toHaveAttribute('href', /\.pdf$/);
  });
});
```

**When NOT to Use:**
- ❌ Testing business logic (use unit tests or PBT)
- ❌ Testing component rendering (use unit tests)
- ❌ Testing state management (use integration tests)
- ❌ Non-critical paths that can be covered by faster tests

**Why E2E is Expensive:**
- Slowest test type (seconds per test vs milliseconds)
- Requires real browser and server
- Flakier due to network, timing, and environment issues
- Harder to debug failures
- More expensive to maintain

**E2E Best Practices:**
- Reserve for critical user paths only
- Use unit/integration tests for most coverage
- Run E2E tests in CI, not on every save
- Keep E2E test count small (< 20 tests)

### Quick Reference Table

| Test Type | Speed | Cost | Use For | Avoid For |
|-----------|-------|------|---------|-----------|
| **Unit** | ⚡⚡⚡ Fast | 💰 Low | Single component, specific examples, edge cases | Multi-component workflows, all input combinations |
| **Integration** | ⚡⚡ Medium | 💰💰 Medium | Component interactions, user workflows, context integration | Single component, visual validation |
| **Parameterized** | ⚡⚡⚡ Fast | 💰 Low | Finite enumerable inputs (< 10 cases), validation rules | Large input spaces, specific examples |
| **PBT** | ⚡⚡ Medium | 💰💰 Medium | Algorithms, invariants, state machines, large input spaces | UI rendering, user interactions, finite inputs |
| **E2E** | ⚡ Slow | 💰💰💰 High | Critical paths, visual validation, browser-specific behavior | Business logic, component rendering, state management |

### File Naming Conventions

- Unit tests: `Component.test.jsx`
- PBT tests: `Component.pbt.test.jsx`
- Integration tests: `Component.integration.test.jsx`
- E2E tests: `Component.e2e.test.js` (separate directory)

---

## Test Types and When to Use Them (Summary)

| Type | Use When | Example |
|------|----------|---------|
| Standard unit tests | Testing specific behavior, edge cases, integration flows | `ExpenseForm.test.jsx` |
| Parameterized tests | Same logic across a finite, enumerable set of inputs | `CollapsibleSection.test.jsx` |
| Property-based tests (PBT) | Invariants over large/infinite input spaces, state machines | `FilterContext.pbt.test.jsx` |

### Decision Guide (Quick)

1. **Is the input space finite and small?** (e.g., 5 categories, 3 toggle states)
   → **Parameterized tests** — enumerate all cases explicitly
2. **Is the input space large or infinite?** (e.g., arbitrary strings, number ranges, operation sequences)
   → **Property-based tests** — let fast-check explore the space
3. **Testing a specific scenario or edge case?**
   → **Standard unit test**

---

## Test Utilities (`frontend/src/test-utils/`)

Import from the unified index:

```javascript
import { safeDate, createModalWrapper, waitForState, testEach } from '../test-utils';
```

### Arbitraries (`arbitraries.js`)

Pre-built fast-check generators for domain objects.

| Generator | Description |
|-----------|-------------|
| `safeDate(options?)` | YYYY-MM-DD string, defaults 2020–2030 |
| `safeDateObject(options?)` | JavaScript Date object |
| `dateRange(options?)` | `{ start, end }` where start ≤ end |
| `safeAmount(options?)` | Positive dollar amount (0.01–99999.99) |
| `positiveAmount()` | Shorthand for `safeAmount({ min: 0.01 })` |
| `amountWithCents()` | Integer dollars + cents combination |
| `safeString(options?)` | Non-empty trimmed string |
| `placeName()` | Alphanumeric place name (2–40 chars) |
| `expenseCategory()` | One of the valid expense categories |
| `taxDeductibleCategory()` | `"Tax - Medical"` or `"Tax - Donation"` |
| `paymentMethod()` | `"cash"`, `"cheque"`, `"debit"`, or `"credit_card"` |
| `insuranceStatus()` | `""`, `"pending"`, `"submitted"`, `"approved"`, or `"denied"` |
| `expenseRecord(overrides?)` | Complete expense object |
| `personRecord()` | Person with id, name, relationship |
| `budgetRecord()` | Budget with category, amount, year, month |
| `modalOperationSequence(options?)` | Array of `"open"`/`"close"` strings |
| `stateTransitionSequence(states)` | Array drawn from provided state values |


**Example — using arbitraries in a PBT:**

```javascript
import fc from 'fast-check';
import { expenseRecord, paymentMethod } from '../test-utils';

it('filters expenses by payment method', () => {
  fc.assert(
    fc.property(
      fc.array(expenseRecord(), { minLength: 1, maxLength: 20 }),
      paymentMethod(),
      (expenses, method) => {
        const filtered = filterByMethod(expenses, method);
        filtered.forEach(e => expect(e.payment_type).toBe(method));
      }
    )
  );
});
```

### Wrappers (`wrappers.jsx`)

Provider wrapper factories for `renderHook` and `render`.

| Factory | Description |
|---------|-------------|
| `createModalWrapper(props?)` | Wraps with `ModalProvider` |
| `createFilterWrapper(props?)` | Wraps with `FilterProvider` |
| `createExpenseWrapper(props?)` | Wraps with `ExpenseProvider` |
| `createSharedDataWrapper(props?)` | Wraps with `SharedDataProvider` |
| `createFullContextWrapper(props?)` | All four providers nested |
| `createMinimalWrapper(contexts)` | Selective providers by name |
| `wrapperBuilder()` | Fluent API for composing providers |

**Example — simple wrapper:**

```javascript
import { renderHook } from '@testing-library/react';
import { createFilterWrapper } from '../test-utils';

const { result } = renderHook(() => useFilterContext(), {
  wrapper: createFilterWrapper({ paymentMethods: ['Credit Card', 'Cash'] }),
});
```

**Example — fluent builder:**

```javascript
import { wrapperBuilder } from '../test-utils';

const { result } = renderHook(() => useExpenseContext(), {
  wrapper: wrapperBuilder()
    .withFilter({ paymentMethods: ['Credit Card'] })
    .withExpense({ fetchExpenses: mockFetch })
    .build(),
});
```

### Assertions (`assertions.js`)

Async state helpers and sequence validators.

| Helper | Description |
|--------|-------------|
| `waitForState(getter, expected, options?)` | Polls until getter returns expected value |
| `waitForStateChange(getter, options?)` | Waits for any change from initial value |
| `waitForApiCall(mockFn, options?)` | Waits until mock called N times |
| `assertModalOpen(state, name)` | Asserts modal is open |
| `assertModalClosed(state, name)` | Asserts modal is closed |
| `assertAllModalsClosed(state)` | Asserts all `show*` keys are false |
| `assertSequenceResult(ops, actual)` | Validates final state matches last operation |
| `assertIdempotence(operation, getter)` | Verifies repeated calls produce same result |

**Example:**

```javascript
import { waitForState, assertAllModalsClosed } from '../test-utils';

await waitForState(() => result.current.isLoading, false);
assertAllModalsClosed(result.current);
```

### Mocks (`mocks.js`)

API mock factories and call tracking.

| Factory | Description |
|---------|-------------|
| `createExpenseApiMock(overrides?)` | Mock expense CRUD API |
| `createPaymentMethodApiMock(overrides?)` | Mock payment method API |
| `createPeopleApiMock(overrides?)` | Mock people API |
| `createBudgetApiMock(overrides?)` | Mock budget API |
| `mockExpenseResponse(data?)` | Standard expense list response |
| `mockErrorResponse(status?, message?)` | Error response with status |
| `mockSuccessResponse(data)` | Generic success response |
| `createCallTracker()` | Manual call tracking utility |

**Example:**

```javascript
import { createExpenseApiMock } from '../test-utils';

const mockApi = createExpenseApiMock({
  fetchExpenses: vi.fn().mockResolvedValue({ data: testExpenses }),
});
```

### Parameterized Tests (`parameterized.js`)

Run the same test logic across multiple named cases.

```javascript
import { testEach } from '../test-utils';

testEach([
  { input: '', expected: false, description: 'empty string' },
  { input: '   ', expected: false, description: 'whitespace only' },
  { input: 'hello', expected: true, description: 'normal text' },
]).test('validates $description', ({ input, expected }) => {
  expect(isValid(input)).toBe(expected);
});
```

Each case object supports:
- `description` — appended to test name
- `input` / `expected` — test data (any shape you need)
- `skip: true` — skip this case
- `only: true` — run only this case

Template strings use `$fieldName` for interpolation in the test name.

---

## Migration Guide: PBT → Parameterized

Convert a PBT test to parameterized when the property only exercises a small, finite set of inputs.

### Before (PBT over finite inputs)

```javascript
import fc from 'fast-check';

describe('CollapsibleSection PBT', () => {
  it('Property: toggle interaction works for all trigger types', () => {
    const onToggle = vi.fn();
    fc.assert(
      fc.property(
        fc.constantFrom('click', 'Enter', 'Space'),
        (trigger) => {
          onToggle.mockClear();
          const { getByRole } = render(
            <CollapsibleSection title="Test" isExpanded={false} onToggle={onToggle}>
              <div>Content</div>
            </CollapsibleSection>
          );
          const header = getByRole('button');
          if (trigger === 'click') fireEvent.click(header);
          else fireEvent.keyDown(header, { key: trigger });
          expect(onToggle).toHaveBeenCalled();
          cleanup();
        }
      )
    );
  });
});
```

### After (Parameterized)

```javascript
import { testEach } from '../test-utils';

describe('CollapsibleSection', () => {
  testEach([
    { description: 'click', trigger: 'click' },
    { description: 'Enter key', trigger: 'Enter' },
    { description: 'Space key', trigger: 'Space' },
  ]).test('calls onToggle via $description', ({ trigger }) => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={onToggle}>
        <div>Content</div>
      </CollapsibleSection>
    );
    const header = screen.getByRole('button');
    if (trigger === 'click') fireEvent.click(header);
    else fireEvent.keyDown(header, { key: trigger });
    expect(onToggle).toHaveBeenCalled();
  });
});
```

### Why convert?

- Only 3 possible inputs — PBT adds overhead without discovering new cases
- Parameterized tests are faster (no shrinking, no random generation)
- Each case is explicit and readable in test output
- Easier to debug failures (exact case shown, not a shrunk counterexample)

### When NOT to convert

Keep PBT when:
- The input space is large (arbitrary strings, numbers, dates)
- You're testing state machine invariants (modal sequences, filter transitions)
- The property genuinely benefits from random exploration
- Shrinking helps find minimal failing cases

---

## Best Practices

1. **Use shared arbitraries** — don't redefine expense categories or payment methods in each test file
2. **Use wrapper factories** — avoid copy-pasting provider setup across tests
3. **Keep `numRuns` reasonable** — 100 default, lower (25–50) for slow component tests
4. **Use `fc.pre()` for preconditions** — cleaner than `.filter()` for conditional properties
5. **Name properties clearly** — `"Property N: description"` format for PBT tests
6. **Clean up in PBT loops** — call `cleanup()` after each render inside `fc.assert`
7. **Prefer `testEach` over manual loops** — gives proper test isolation and reporting

---

## Testing UI Components

This section provides practical patterns for testing React components, focusing on user-facing behavior rather than implementation details. These patterns help you write reliable, maintainable tests that work well in the jsdom environment.

### Pattern 1: Mocking CollapsibleSection

**Problem**: The real `CollapsibleSection` component uses CSS `display` properties to show/hide content based on the `isExpanded` state. In jsdom, CSS is not fully evaluated, so visibility checks fail and tests become brittle.

**Solution**: Use `MockCollapsibleSection` from test-utils, which always renders children regardless of expansion state. This allows tests to focus on user-facing behavior (field values, validation, submission) rather than section expansion mechanics.

#### When to Mock CollapsibleSection

✅ **Use MockCollapsibleSection when:**
- Testing form interactions that involve fields inside collapsible sections
- Testing conditional field display based on form state
- Testing form submission with data from multiple sections
- Running integration tests that need to interact with section content

❌ **Use real CollapsibleSection when:**
- Writing unit tests specifically for CollapsibleSection behavior
- Testing section expansion/collapse interactions
- Running E2E tests in real browsers

#### How to Mock CollapsibleSection

Add this at the **TOP** of your test file, before importing components that use CollapsibleSection:

```javascript
import { vi } from 'vitest';
import { MockCollapsibleSection } from '../test-utils';

// Mock BEFORE importing components that use CollapsibleSection
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// Now import your component
import ExpenseForm from './ExpenseForm';
```

#### Before/After Example

**Before** (brittle, jsdom issues):
```javascript
it('should show insurance fields when Tax - Medical is selected', async () => {
  const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // This fails in jsdom - section doesn't actually expand
  const advancedHeader = container.querySelector('.collapsible-header');
  fireEvent.click(advancedHeader);
  
  // Wait for expansion (unreliable in jsdom)
  await waitFor(() => {
    expect(advancedHeader.getAttribute('aria-expanded')).toBe('true');
  });
  
  // Field may not be visible even though section is "expanded"
  const insuranceField = screen.getByLabelText('Insurance Status');
  expect(insuranceField).toBeVisible(); // ❌ Fails in jsdom
});
```

**After** (reliable, mocked):
```javascript
// At top of file
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

it('should show insurance fields when Tax - Medical is selected', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Select tax-deductible category
  const categorySelect = screen.getByLabelText('Category');
  await userEvent.selectOptions(categorySelect, 'Tax - Medical');
  
  // Field is now visible (no section expansion needed)
  const insuranceField = screen.getByLabelText('Insurance Status');
  expect(insuranceField).toBeInTheDocument(); // ✅ Works reliably
});
```

#### Testing CollapsibleSection Separately

Test the CollapsibleSection component itself in a dedicated unit test file:

```javascript
// CollapsibleSection.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollapsibleSection from './CollapsibleSection';

describe('CollapsibleSection', () => {
  it('should toggle expansion on click', async () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Test Section" isExpanded={false} onToggle={onToggle}>
        <div>Content</div>
      </CollapsibleSection>
    );
    
    const header = screen.getByRole('button', { name: /test section/i });
    await userEvent.click(header);
    
    expect(onToggle).toHaveBeenCalled();
  });
  
  it('should show badge when provided', () => {
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={vi.fn()} badge="3">
        <div>Content</div>
      </CollapsibleSection>
    );
    
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  
  it('should display error indicator when hasError is true', () => {
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={vi.fn()} hasError={true}>
        <div>Content</div>
      </CollapsibleSection>
    );
    
    expect(screen.getByTestId('section-error-indicator')).toBeInTheDocument();
  });
});
```

### Pattern 2: Testing Conditional Field Display

**Problem**: Forms often show/hide fields based on user selections (e.g., insurance fields for medical expenses). Tests need to verify this behavior without coupling to implementation details.

**Solution**: Use accessible queries and helper functions to verify field visibility based on user-visible state changes.

#### Before/After Example

**Before** (implementation detail coupling):
```javascript
it('should show insurance fields for medical expenses', async () => {
  const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Coupled to CSS class names
  const insuranceSection = container.querySelector('.insurance-section');
  expect(insuranceSection).toHaveClass('hidden'); // ❌ Implementation detail
  
  // Change category
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'Tax - Medical' }
  });
  
  // Still coupled to CSS
  expect(insuranceSection).not.toHaveClass('hidden'); // ❌ Brittle
});
```

**After** (user-facing behavior):
```javascript
import { assertFieldVisible, assertFieldHidden } from '../test-utils/expenseFormHelpers';

it('should show insurance fields for medical expenses', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Verify fields are hidden initially
  assertFieldHidden('Insurance Status');
  assertFieldHidden('Claim Amount');
  
  // Change category using user-event (more realistic)
  const categorySelect = screen.getByLabelText('Category');
  await userEvent.selectOptions(categorySelect, 'Tax - Medical');
  
  // Verify fields appear (queries by accessible label)
  assertFieldVisible('Insurance Status'); // ✅ User-facing
  assertFieldVisible('Claim Amount');
});
```

#### Testing Multiple Conditional States

Use parameterized tests for multiple category/field combinations:

```javascript
import { testEach } from '../test-utils';

describe('ExpenseForm Conditional Fields', () => {
  testEach([
    { 
      category: 'Tax - Medical', 
      expectedFields: ['Insurance Status', 'Claim Amount', 'Assign to People'],
      hiddenFields: ['Donation Receipt'],
      description: 'medical category'
    },
    { 
      category: 'Tax - Donation', 
      expectedFields: ['Donation Receipt'],
      hiddenFields: ['Insurance Status', 'Claim Amount'],
      description: 'donation category'
    },
    { 
      category: 'Groceries', 
      expectedFields: [],
      hiddenFields: ['Insurance Status', 'Donation Receipt'],
      description: 'regular category'
    },
  ]).test('shows correct fields for $description', async ({ category, expectedFields, hiddenFields }) => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await userEvent.selectOptions(screen.getByLabelText('Category'), category);
    
    // Verify expected fields are visible
    expectedFields.forEach(field => {
      assertFieldVisible(field);
    });
    
    // Verify other fields are hidden
    hiddenFields.forEach(field => {
      assertFieldHidden(field);
    });
  });
});
```

### Pattern 3: Testing Form Submission

**Problem**: Form submission tests often become brittle by asserting on exact data structures, including computed fields and implementation details.

**Solution**: Use `assertSubmittedData` helper with partial matching to focus on the data that matters for the test.

#### Before/After Example

**Before** (brittle, exact matching):
```javascript
it('should submit expense with all fields', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Fill form
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-01-15' } });
  fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'Store' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Groceries' } });
  fireEvent.change(screen.getByLabelText('Payment Method'), { target: { value: '1' } });
  
  // Submit
  fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
  
  // Brittle assertion - must match exact structure
  await waitFor(() => {
    expect(expenseApi.createExpense).toHaveBeenCalledWith({
      date: '2025-01-15',
      place: 'Store',
      amount: '100',
      type: 'Groceries',
      payment_method_id: 1,
      week: 3, // ❌ Computed field - implementation detail
      posted_date: null, // ❌ Optional field - unnecessary to assert
      insurance_status: '', // ❌ Default value - implementation detail
      // ... many more fields
    });
  });
});
```

**After** (focused, partial matching):
```javascript
import { fillBasicFields, submitForm, assertSubmittedData } from '../test-utils/expenseFormHelpers';

it('should submit expense with all fields', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Use helper for common fields
  await fillBasicFields();
  
  // Add place
  await userEvent.type(screen.getByLabelText('Place'), 'Store');
  
  // Submit using helper
  await submitForm();
  
  // Assert only on fields that matter for this test
  assertSubmittedData(expenseApi.createExpense, {
    date: '2025-01-15',
    place: 'Store',
    amount: '100.00',
    type: 'Other'
  }); // ✅ Focused, maintainable
});
```

#### Testing Complex Submission Scenarios

```javascript
describe('ExpenseForm Submission', () => {
  it('should submit medical expense with insurance data', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await fillBasicFields();
    
    // Select medical category
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Tax - Medical');
    
    // Fill insurance fields
    await userEvent.selectOptions(screen.getByLabelText('Insurance Status'), 'pending');
    await userEvent.type(screen.getByLabelText('Claim Amount'), '50.00');
    
    await submitForm();
    
    // Assert only on insurance-related fields
    assertSubmittedData(expenseApi.createExpense, {
      type: 'Tax - Medical',
      insurance_status: 'pending',
      claim_amount: 50.00
    });
  });
  
  it('should submit expense with reimbursement data', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await fillBasicFields();
    
    // Fill reimbursement fields (assuming section is always visible with mock)
    await userEvent.type(screen.getByLabelText('Reimbursement Amount'), '25.00');
    await userEvent.selectOptions(screen.getByLabelText('Reimbursement Status'), 'pending');
    
    await submitForm();
    
    assertSubmittedData(expenseApi.createExpense, {
      reimbursement_amount: 25.00,
      reimbursement_status: 'pending'
    });
  });
});
```

### Pattern 4: Testing Form Validation

**Problem**: Validation tests often use arbitrary delays or poll for error messages in unreliable ways.

**Solution**: Use `assertValidationError` helper with proper async utilities to wait for error messages.

#### Before/After Example

**Before** (unreliable timing):
```javascript
it('should validate required fields', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Submit without filling fields
  fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
  
  // Arbitrary delay - may be too short or too long
  await new Promise(resolve => setTimeout(resolve, 500)); // ❌ Flaky
  
  // May fail if error appears later
  expect(screen.getByText('Date is required')).toBeInTheDocument();
});
```

**After** (reliable async waiting):
```javascript
import { submitForm, assertValidationError } from '../test-utils/expenseFormHelpers';

it('should validate required fields', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Submit without filling fields
  await submitForm();
  
  // Wait for error messages to appear
  await assertValidationError('Date is required'); // ✅ Waits properly
  await assertValidationError('Amount is required');
  await assertValidationError('Category is required');
});
```

#### Testing Field-Specific Validation

```javascript
describe('ExpenseForm Validation', () => {
  it('should validate amount is positive', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Fill required fields
    await fillBasicFields();
    
    // Enter negative amount
    const amountInput = screen.getByLabelText('Amount');
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '-50');
    
    await submitForm();
    
    await assertValidationError(/amount must be positive/i);
  });
  
  it('should validate date is not in future', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    await fillBasicFields();
    
    // Enter future date
    const dateInput = screen.getByLabelText('Date');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2099-12-31');
    
    await submitForm();
    
    await assertValidationError(/date cannot be in the future/i);
  });
});
```

#### Testing Validation with Parameterized Tests

```javascript
import { testEach } from '../test-utils';

describe('ExpenseForm Required Field Validation', () => {
  testEach([
    { field: 'Date', label: 'Date', error: 'Date is required' },
    { field: 'Amount', label: 'Amount', error: 'Amount is required' },
    { field: 'Category', label: 'Category', error: 'Category is required' },
    { field: 'Payment Method', label: 'Payment Method', error: 'Payment method is required' },
  ]).test('shows error when $field is empty', async ({ label, error }) => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Fill all fields except the one being tested
    await fillBasicFields();
    
    // Clear the field being tested
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    
    await submitForm();
    
    await assertValidationError(error);
  });
});
```

### Key Takeaways

1. **Mock CollapsibleSection** in integration tests to avoid jsdom limitations
2. **Test CollapsibleSection separately** in dedicated unit tests
3. **Use accessible queries** (getByLabelText, getByRole) instead of CSS selectors
4. **Use helper functions** (assertFieldVisible, assertSubmittedData, assertValidationError) for consistency
5. **Focus on user-facing behavior** rather than implementation details
6. **Use user-event** instead of fireEvent for realistic interactions
7. **Use parameterized tests** for multiple similar scenarios
8. **Use partial matching** (expect.objectContaining) for form submission assertions
9. **Wait properly** for async operations with waitFor and findBy queries

### Common Pitfalls to Avoid

❌ **Don't** test section expansion mechanics in form integration tests  
✅ **Do** mock CollapsibleSection and test expansion separately

❌ **Don't** query by CSS classes or test IDs  
✅ **Do** query by accessible labels and roles

❌ **Don't** assert on computed fields or implementation details  
✅ **Do** assert on user-provided data that matters for the test

❌ **Don't** use arbitrary delays (setTimeout)  
✅ **Do** use waitFor and findBy queries for async operations

❌ **Don't** use fireEvent for user interactions  
✅ **Do** use user-event for realistic simulation

❌ **Don't** write PBT tests for UI interactions  
✅ **Do** use unit tests or parameterized tests for UI

---

## Mocking Strategies

This section provides comprehensive guidance on when and how to mock different parts of your application in tests. Effective mocking helps isolate the code under test, improve test reliability, and speed up test execution.

### When to Mock

**Mock when:**
- Testing component interactions without needing real implementations
- Avoiding slow operations (network requests, file I/O, complex calculations)
- Isolating the code under test from external dependencies
- Working around jsdom limitations (CSS rendering, browser APIs)
- Testing error scenarios that are hard to reproduce with real implementations

**Don't mock when:**
- Testing the actual integration between components (use integration tests)
- The real implementation is simple and fast
- Mocking adds more complexity than value
- You need to verify the real behavior (use E2E tests)

### Mocking Components

#### When to Mock Components

Mock components when:
- The component has complex rendering logic that's not relevant to your test
- The component has jsdom limitations (like CollapsibleSection)
- You want to test parent component logic without child component interference
- The child component is slow or has external dependencies

#### How to Mock Components

**Pattern 1: Mock with vi.mock() at file level**

```javascript
import { vi } from 'vitest';
import { MockCollapsibleSection } from '../test-utils';

// Mock BEFORE importing components that use it
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// Now import your component
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm', () => {
  it('should render form fields', () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    // CollapsibleSection is now mocked throughout this file
  });
});
```


**Pattern 2: Mock with inline implementation**

```javascript
import { vi } from 'vitest';

describe('ExpenseList', () => {
  it('should handle loading state', () => {
    // Mock a component inline for this test only
    vi.mock('./LoadingSpinner', () => ({
      default: () => <div data-testid="loading">Loading...</div>
    }));
    
    render(<ExpenseList isLoading={true} />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
```

**Pattern 3: Mock with spy to verify props**

```javascript
import { vi } from 'vitest';

describe('ExpenseForm', () => {
  it('should pass correct props to CollapsibleSection', () => {
    const MockSection = vi.fn(({ children }) => <div>{children}</div>);
    
    vi.mock('./CollapsibleSection', () => ({
      default: MockSection
    }));
    
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Verify mock was called with expected props
    expect(MockSection).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Advanced Options',
        isExpanded: false,
        badge: undefined
      }),
      expect.anything()
    );
  });
});
```

#### MockCollapsibleSection Usage

The `MockCollapsibleSection` component from test-utils is specifically designed to work around jsdom limitations:

```javascript
import { MockCollapsibleSection } from '../test-utils';

vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));
```

**What it does:**
- Always renders children regardless of `isExpanded` state
- Maintains same prop interface as real component
- Includes data-testid attributes for easy querying
- Shows badge and error indicators correctly


### Mocking Modules

#### When to Mock Modules

Mock modules when:
- Testing code that uses external libraries (date libraries, validation libraries)
- Avoiding slow operations (crypto, compression, complex calculations)
- Testing error scenarios from third-party code
- Isolating your code from module implementation details

#### How to Mock Modules

**Pattern 1: Mock entire module**

```javascript
import { vi } from 'vitest';

// Mock date-fns module
vi.mock('date-fns', () => ({
  format: vi.fn(() => '2025-01-15'),
  parseISO: vi.fn((str) => new Date(str)),
  isValid: vi.fn(() => true)
}));

describe('DateUtils', () => {
  it('should format date correctly', () => {
    const result = formatExpenseDate('2025-01-15');
    expect(result).toBe('2025-01-15');
  });
});
```

**Pattern 2: Mock specific module functions**

```javascript
import { vi } from 'vitest';
import * as dateUtils from '../utils/dateUtils';

describe('ExpenseService', () => {
  it('should handle invalid dates', () => {
    // Spy on specific function
    vi.spyOn(dateUtils, 'isValidDate').mockReturnValue(false);
    
    const result = validateExpense({ date: 'invalid' });
    expect(result.errors).toContain('Invalid date');
    
    // Restore original implementation
    vi.restoreAllMocks();
  });
});
```

**Pattern 3: Mock with factory function**

```javascript
import { vi } from 'vitest';

vi.mock('../utils/calculations', () => ({
  calculateTaxCredit: vi.fn((amount) => amount * 0.15),
  calculateTotal: vi.fn((expenses) => expenses.reduce((sum, e) => sum + e.amount, 0))
}));
```


### Mocking APIs

#### When to Mock APIs

Mock APIs when:
- Testing component behavior without real backend
- Testing error scenarios (network failures, 404s, 500s)
- Testing loading states and async behavior
- Running tests in CI without backend server
- Speeding up test execution

#### How to Mock APIs

**Pattern 1: Use test-utils API mocks**

```javascript
import { createExpenseApiMock } from '../test-utils';

describe('ExpenseList', () => {
  it('should display expenses from API', async () => {
    const mockApi = createExpenseApiMock({
      fetchExpenses: vi.fn().mockResolvedValue({
        data: [
          { id: 1, place: 'Store', amount: 50.00 },
          { id: 2, place: 'Gas Station', amount: 40.00 }
        ]
      })
    });
    
    render(<ExpenseList api={mockApi} />);
    
    await waitFor(() => {
      expect(screen.getByText('Store')).toBeInTheDocument();
      expect(screen.getByText('Gas Station')).toBeInTheDocument();
    });
  });
});
```

**Pattern 2: Mock API module**

```javascript
import { vi } from 'vitest';
import * as expenseApi from '../services/expenseApi';

describe('ExpenseContext', () => {
  it('should handle API errors', async () => {
    vi.spyOn(expenseApi, 'fetchExpenses').mockRejectedValue(
      new Error('Network error')
    );
    
    const { result } = renderHook(() => useExpenseContext(), {
      wrapper: createExpenseWrapper()
    });
    
    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
  });
});
```

**Pattern 3: Mock with different responses**

```javascript
describe('ExpenseForm', () => {
  it('should handle successful submission', async () => {
    const mockApi = createExpenseApiMock({
      createExpense: vi.fn().mockResolvedValue({ data: { id: 1 } })
    });
    
    render(<ExpenseForm api={mockApi} />);
    await fillBasicFields();
    await submitForm();
    
    expect(mockApi.createExpense).toHaveBeenCalled();
  });
  
  it('should handle submission errors', async () => {
    const mockApi = createExpenseApiMock({
      createExpense: vi.fn().mockRejectedValue(
        new Error('Validation failed')
      )
    });
    
    render(<ExpenseForm api={mockApi} />);
    await fillBasicFields();
    await submitForm();
    
    await waitFor(() => {
      expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
    });
  });
});
```


#### Testing API Call Tracking

```javascript
import { createCallTracker } from '../test-utils';

describe('ExpenseContext', () => {
  it('should call API only once on mount', async () => {
    const tracker = createCallTracker();
    const mockApi = createExpenseApiMock({
      fetchExpenses: tracker.track(vi.fn().mockResolvedValue({ data: [] }))
    });
    
    render(<ExpenseProvider api={mockApi}><div /></ExpenseProvider>);
    
    await waitFor(() => {
      expect(tracker.callCount('fetchExpenses')).toBe(1);
    });
  });
});
```

### Mocking Best Practices

**✅ DO:**
- Mock at the appropriate level (component, module, or API)
- Use test-utils mocks for consistency
- Verify mock calls with meaningful assertions
- Restore mocks after tests (`vi.restoreAllMocks()`)
- Mock external dependencies, not your own code (unless necessary)

**❌ DON'T:**
- Mock everything - only mock what's necessary
- Mock implementation details of the code under test
- Use mocks to make tests pass without testing real behavior
- Forget to clean up mocks between tests
- Mock when integration testing is more appropriate

### Mock Cleanup

```javascript
import { vi, describe, it, afterEach } from 'vitest';

describe('ExpenseForm', () => {
  afterEach(() => {
    // Restore all mocks after each test
    vi.restoreAllMocks();
  });
  
  it('should test something', () => {
    // Test code
  });
});
```

---

## Async Testing Best Practices

Testing asynchronous code requires special attention to timing, state changes, and error handling. This section provides patterns for reliable async testing in the jsdom environment.

### Understanding Async Utilities

React Testing Library provides several utilities for async testing:

| Utility | Use When | Returns |
|---------|----------|---------|
| `waitFor` | Waiting for any async condition | Promise that resolves when condition is true |
| `findBy*` | Querying for element that appears async | Promise that resolves to element |
| `waitForElementToBeRemoved` | Waiting for element to disappear | Promise that resolves when element is gone |
| `act` | Wrapping state updates in tests | Promise (when async) or void |


### Using waitFor

`waitFor` is the most flexible async utility. Use it when you need to wait for any condition to become true.

#### Basic Usage

```javascript
import { waitFor } from '@testing-library/react';

it('should update state after API call', async () => {
  render(<ExpenseList />);
  
  // Wait for loading to finish
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
  
  // Now verify the data is displayed
  expect(screen.getByText('Store')).toBeInTheDocument();
});
```

#### With Custom Timeout

```javascript
it('should handle slow API responses', async () => {
  render(<ExpenseList />);
  
  // Wait up to 5 seconds for data to load
  await waitFor(
    () => {
      expect(screen.getByText('Store')).toBeInTheDocument();
    },
    { timeout: 5000 }
  );
});
```

#### With Custom Interval

```javascript
it('should poll for state changes', async () => {
  const { result } = renderHook(() => useExpenseContext());
  
  // Check every 100ms instead of default 50ms
  await waitFor(
    () => {
      expect(result.current.isLoading).toBe(false);
    },
    { interval: 100 }
  );
});
```

#### Multiple Conditions

```javascript
it('should wait for multiple async operations', async () => {
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.queryByText('Loading expenses...')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading budgets...')).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
```

#### Common waitFor Patterns

```javascript
// ✅ GOOD: Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});

// ✅ GOOD: Wait for element to disappear
await waitFor(() => {
  expect(screen.queryByText('Loading')).not.toBeInTheDocument();
});

// ✅ GOOD: Wait for state change
await waitFor(() => {
  expect(result.current.data).toHaveLength(5);
});

// ❌ BAD: Using arbitrary timeout
await new Promise(resolve => setTimeout(resolve, 1000));

// ❌ BAD: Not using waitFor for async operations
expect(screen.getByText('Success')).toBeInTheDocument(); // May fail if async
```


### Using findBy Queries

`findBy` queries are a shorthand for `waitFor` + `getBy`. They automatically wait for elements to appear.

#### Basic Usage

```javascript
it('should display expense after loading', async () => {
  render(<ExpenseList />);
  
  // findByText automatically waits for element to appear
  const expense = await screen.findByText('Store');
  expect(expense).toBeInTheDocument();
});
```

#### With Custom Timeout

```javascript
it('should wait for slow-loading content', async () => {
  render(<ExpenseList />);
  
  // Wait up to 3 seconds
  const expense = await screen.findByText('Store', {}, { timeout: 3000 });
  expect(expense).toBeInTheDocument();
});
```

#### Multiple Elements

```javascript
it('should display all expenses', async () => {
  render(<ExpenseList />);
  
  // Wait for multiple elements
  const store = await screen.findByText('Store');
  const gas = await screen.findByText('Gas Station');
  
  expect(store).toBeInTheDocument();
  expect(gas).toBeInTheDocument();
});
```

#### findBy vs getBy vs queryBy

```javascript
// getBy - Throws immediately if not found (synchronous)
const element = screen.getByText('Store'); // ❌ Fails if async

// queryBy - Returns null if not found (synchronous)
const element = screen.queryByText('Store'); // Returns null if async

// findBy - Waits for element to appear (asynchronous)
const element = await screen.findByText('Store'); // ✅ Waits for async
```

#### When to Use Each

```javascript
// ✅ Use getBy for elements that should be immediately present
expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();

// ✅ Use queryBy for elements that might not exist
expect(screen.queryByText('Error')).not.toBeInTheDocument();

// ✅ Use findBy for elements that appear after async operations
const success = await screen.findByText('Expense added successfully');
```


### user-event vs fireEvent

`user-event` simulates real user interactions more accurately than `fireEvent`. Always prefer `user-event` for realistic testing.

#### Comparison Table

| Interaction | fireEvent | user-event | Difference |
|-------------|-----------|------------|------------|
| **Click** | `fireEvent.click(button)` | `await userEvent.click(button)` | user-event triggers hover, focus, and other events |
| **Type** | `fireEvent.change(input, { target: { value: 'text' } })` | `await userEvent.type(input, 'text')` | user-event types character by character, triggers keydown/keyup |
| **Clear** | `fireEvent.change(input, { target: { value: '' } })` | `await userEvent.clear(input)` | user-event selects all then deletes |
| **Select** | `fireEvent.change(select, { target: { value: 'option' } })` | `await userEvent.selectOptions(select, 'option')` | user-event triggers focus and change events |
| **Tab** | `fireEvent.keyDown(element, { key: 'Tab' })` | `await userEvent.tab()` | user-event moves focus to next element |

#### Click Examples

```javascript
// ❌ BAD: fireEvent doesn't trigger all events
fireEvent.click(button);

// ✅ GOOD: user-event simulates real click
await userEvent.click(button);

// ✅ GOOD: Double click
await userEvent.dblClick(button);

// ✅ GOOD: Right click
await userEvent.pointer({ keys: '[MouseRight]', target: button });
```

#### Type Examples

```javascript
// ❌ BAD: fireEvent sets value directly
fireEvent.change(input, { target: { value: 'Hello' } });

// ✅ GOOD: user-event types character by character
await userEvent.type(input, 'Hello');

// ✅ GOOD: Type with delay between characters
await userEvent.type(input, 'Hello', { delay: 100 });

// ✅ GOOD: Type special characters
await userEvent.type(input, 'Hello{Enter}');
await userEvent.type(input, '{Backspace}{Backspace}');
```

#### Select Examples

```javascript
// ❌ BAD: fireEvent doesn't trigger focus
fireEvent.change(select, { target: { value: 'option1' } });

// ✅ GOOD: user-event triggers focus and change
await userEvent.selectOptions(select, 'option1');

// ✅ GOOD: Select by label text
await userEvent.selectOptions(
  screen.getByLabelText('Category'),
  'Groceries'
);

// ✅ GOOD: Select multiple options
await userEvent.selectOptions(select, ['option1', 'option2']);
```


#### Keyboard Navigation Examples

```javascript
// ✅ GOOD: Tab through form fields
await userEvent.tab(); // Focus next element
await userEvent.tab(); // Focus next element
await userEvent.tab({ shift: true }); // Focus previous element

// ✅ GOOD: Keyboard shortcuts
await userEvent.keyboard('{Control>}s{/Control}'); // Ctrl+S
await userEvent.keyboard('{Meta>}k{/Meta}'); // Cmd+K (Mac)

// ✅ GOOD: Arrow key navigation
await userEvent.keyboard('{ArrowDown}');
await userEvent.keyboard('{ArrowUp}');
```

#### Form Submission Examples

```javascript
// ❌ BAD: Direct form submission
fireEvent.submit(form);

// ✅ GOOD: Click submit button (more realistic)
await userEvent.click(screen.getByRole('button', { name: /submit/i }));

// ✅ GOOD: Press Enter in input field
await userEvent.type(input, 'value{Enter}');
```

#### Why user-event is Better

**fireEvent:**
- Only triggers the specified event
- Doesn't update focus or selection
- Doesn't trigger related events (hover, blur, etc.)
- Sets values directly without intermediate states

**user-event:**
- Triggers all related events in correct order
- Updates focus and selection realistically
- Simulates actual user behavior
- Types character by character with proper events

### Common Async Patterns

#### Pattern 1: Wait for Loading to Finish

```javascript
it('should display data after loading', async () => {
  render(<ExpenseList />);
  
  // Wait for loading indicator to disappear
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
  
  // Verify data is displayed
  expect(screen.getByText('Store')).toBeInTheDocument();
});
```

#### Pattern 2: Wait for API Call

```javascript
it('should call API on mount', async () => {
  const mockFetch = vi.fn().mockResolvedValue({ data: [] });
  
  render(<ExpenseList fetchExpenses={mockFetch} />);
  
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

#### Pattern 3: Wait for State Update

```javascript
it('should update context state', async () => {
  const { result } = renderHook(() => useExpenseContext());
  
  act(() => {
    result.current.addExpense({ place: 'Store', amount: 50 });
  });
  
  await waitFor(() => {
    expect(result.current.expenses).toHaveLength(1);
  });
});
```


#### Pattern 4: Wait for Multiple Async Operations

```javascript
it('should handle multiple async operations', async () => {
  render(<Dashboard />);
  
  // Wait for all async operations to complete
  await waitFor(() => {
    expect(screen.queryByText('Loading expenses...')).not.toBeInTheDocument();
  });
  
  await waitFor(() => {
    expect(screen.queryByText('Loading budgets...')).not.toBeInTheDocument();
  });
  
  // Or combine into single waitFor
  await waitFor(() => {
    expect(screen.queryByText('Loading expenses...')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading budgets...')).not.toBeInTheDocument();
  });
});
```

#### Pattern 5: Wait for Element to Be Removed

```javascript
it('should remove expense from list', async () => {
  render(<ExpenseList />);
  
  const deleteButton = screen.getByRole('button', { name: /delete/i });
  await userEvent.click(deleteButton);
  
  // Wait for element to be removed
  await waitForElementToBeRemoved(() => screen.queryByText('Store'));
});
```

### Common Async Anti-Patterns

#### ❌ Anti-Pattern 1: Arbitrary Timeouts

```javascript
// ❌ BAD: Arbitrary delay
await new Promise(resolve => setTimeout(resolve, 1000));
expect(screen.getByText('Success')).toBeInTheDocument();

// ✅ GOOD: Wait for specific condition
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});
```

#### ❌ Anti-Pattern 2: Not Awaiting Async Operations

```javascript
// ❌ BAD: Not awaiting user-event
userEvent.click(button); // Missing await
expect(screen.getByText('Clicked')).toBeInTheDocument(); // May fail

// ✅ GOOD: Await user-event
await userEvent.click(button);
await waitFor(() => {
  expect(screen.getByText('Clicked')).toBeInTheDocument();
});
```

#### ❌ Anti-Pattern 3: Using getBy for Async Elements

```javascript
// ❌ BAD: getBy throws immediately if not found
expect(screen.getByText('Success')).toBeInTheDocument(); // Fails if async

// ✅ GOOD: Use findBy for async elements
const success = await screen.findByText('Success');
expect(success).toBeInTheDocument();
```

#### ❌ Anti-Pattern 4: Not Wrapping State Updates in act()

```javascript
// ❌ BAD: State update without act()
result.current.setState({ value: 'new' });
expect(result.current.value).toBe('new'); // May fail

// ✅ GOOD: Wrap in act()
act(() => {
  result.current.setState({ value: 'new' });
});
expect(result.current.value).toBe('new');
```

---

## Common Pitfalls and Solutions

This section documents common issues you may encounter when testing frontend code, along with practical solutions and workarounds.


### jsdom Limitations

jsdom is a JavaScript implementation of web standards, but it has limitations compared to real browsers.

#### Limitation 1: CSS Display and Visibility

**Problem:** jsdom doesn't fully evaluate CSS, so `display: none` and `visibility: hidden` don't work as expected.

**Symptoms:**
- Elements with `display: none` are still found by queries
- `toBeVisible()` assertions fail unexpectedly
- CollapsibleSection expansion doesn't hide/show content

**Solution:**

```javascript
// ❌ BAD: Relying on CSS visibility in jsdom
it('should hide section when collapsed', () => {
  render(<CollapsibleSection isExpanded={false}>Content</CollapsibleSection>);
  expect(screen.queryByText('Content')).not.toBeVisible(); // Fails in jsdom
});

// ✅ GOOD: Mock the component
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

it('should render section content', () => {
  render(<CollapsibleSection isExpanded={false}>Content</CollapsibleSection>);
  // Content is always rendered in mock, test other behavior
  expect(screen.getByText('Content')).toBeInTheDocument();
});

// ✅ GOOD: Test visibility in E2E tests
// E2E test (Playwright/Cypress)
test('should hide section when collapsed', async () => {
  await page.goto('http://localhost:5173');
  const section = page.locator('.collapsible-content');
  await expect(section).not.toBeVisible();
});
```

#### Limitation 2: Layout and Positioning

**Problem:** jsdom doesn't calculate layout, so `getBoundingClientRect()` returns zeros.

**Symptoms:**
- Scroll position tests fail
- Sticky positioning tests fail
- Element position calculations return 0

**Solution:**

```javascript
// ❌ BAD: Testing layout in jsdom
it('should position element correctly', () => {
  render(<FloatingButton />);
  const button = screen.getByRole('button');
  const rect = button.getBoundingClientRect();
  expect(rect.top).toBe(100); // Always 0 in jsdom
});

// ✅ GOOD: Mock getBoundingClientRect
it('should position element correctly', () => {
  const mockGetBoundingClientRect = vi.fn(() => ({
    top: 100,
    left: 50,
    width: 200,
    height: 50
  }));
  
  Element.prototype.getBoundingClientRect = mockGetBoundingClientRect;
  
  render(<FloatingButton />);
  // Test logic that uses position
});

// ✅ GOOD: Test in E2E
test('should position button at bottom right', async () => {
  await page.goto('http://localhost:5173');
  const button = page.locator('.floating-button');
  const box = await button.boundingBox();
  expect(box.y).toBeGreaterThan(500);
});
```


#### Limitation 3: File Uploads

**Problem:** jsdom doesn't support real file uploads.

**Symptoms:**
- File input tests fail
- FileReader API doesn't work
- Blob/File objects behave differently

**Solution:**

```javascript
// ✅ GOOD: Mock file upload
it('should handle file upload', async () => {
  render(<InvoiceUpload onUpload={vi.fn()} />);
  
  const file = new File(['invoice content'], 'invoice.pdf', { type: 'application/pdf' });
  const input = screen.getByLabelText('Upload Invoice');
  
  await userEvent.upload(input, file);
  
  expect(input.files[0]).toBe(file);
  expect(input.files).toHaveLength(1);
});

// ✅ GOOD: Test file upload in E2E
test('should upload and display invoice', async () => {
  await page.goto('http://localhost:5173');
  await page.setInputFiles('input[type="file"]', './test-fixtures/invoice.pdf');
  await expect(page.locator('.invoice-preview')).toBeVisible();
});
```

#### Limitation 4: Browser APIs

**Problem:** Many browser APIs are not implemented in jsdom (localStorage, sessionStorage, IntersectionObserver, etc.).

**Solution:**

```javascript
// ✅ GOOD: Mock browser APIs
beforeEach(() => {
  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  global.localStorage = localStorageMock;
  
  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
    takeRecords() { return []; }
  };
});
```

### Timing Issues

#### Issue 1: Race Conditions

**Problem:** Tests fail intermittently because async operations complete in unpredictable order.

**Symptoms:**
- Tests pass sometimes, fail other times
- Tests fail in CI but pass locally
- "Element not found" errors that are inconsistent

**Solution:**

```javascript
// ❌ BAD: Assuming order of async operations
it('should load data', async () => {
  render(<Dashboard />);
  expect(screen.getByText('Expenses')).toBeInTheDocument(); // May fail
  expect(screen.getByText('Budgets')).toBeInTheDocument(); // May fail
});

// ✅ GOOD: Wait for each async operation
it('should load data', async () => {
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.getByText('Expenses')).toBeInTheDocument();
  });
  
  await waitFor(() => {
    expect(screen.getByText('Budgets')).toBeInTheDocument();
  });
});
```


#### Issue 2: State Updates Not Reflected

**Problem:** State updates happen but tests don't see them.

**Symptoms:**
- Assertions fail even though state should have changed
- "act" warnings in console
- Tests work with arbitrary delays

**Solution:**

```javascript
// ❌ BAD: Not waiting for state update
it('should update count', () => {
  const { result } = renderHook(() => useCounter());
  result.current.increment();
  expect(result.current.count).toBe(1); // May fail
});

// ✅ GOOD: Wrap in act() for synchronous updates
it('should update count', () => {
  const { result } = renderHook(() => useCounter());
  act(() => {
    result.current.increment();
  });
  expect(result.current.count).toBe(1);
});

// ✅ GOOD: Use waitFor for async updates
it('should update count after API call', async () => {
  const { result } = renderHook(() => useCounter());
  
  act(() => {
    result.current.incrementAsync();
  });
  
  await waitFor(() => {
    expect(result.current.count).toBe(1);
  });
});
```

#### Issue 3: Cleanup Not Happening

**Problem:** State from previous tests affects current test.

**Symptoms:**
- Tests pass individually but fail when run together
- Tests fail in different order
- Unexpected data appears in tests

**Solution:**

```javascript
// ✅ GOOD: Clean up after each test
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup(); // Unmount components
  vi.clearAllMocks(); // Clear mock call history
  vi.restoreAllMocks(); // Restore original implementations
});

// ✅ GOOD: Reset module state
afterEach(() => {
  vi.resetModules(); // Clear module cache
});
```

### Implementation Detail Coupling

#### Issue 1: Testing Internal State

**Problem:** Tests access component internal state directly.

**Symptoms:**
- Tests break when refactoring internal implementation
- Tests don't reflect user experience
- Hard to understand what's being tested

**Solution:**

```javascript
// ❌ BAD: Testing internal state
it('should update internal state', () => {
  const wrapper = mount(<ExpenseForm />);
  wrapper.instance().setState({ amount: 100 });
  expect(wrapper.state('amount')).toBe(100);
});

// ✅ GOOD: Test through user interactions
it('should update amount field', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  const amountInput = screen.getByLabelText('Amount');
  await userEvent.type(amountInput, '100');
  
  expect(amountInput).toHaveValue('100');
});
```


#### Issue 2: Testing CSS Classes

**Problem:** Tests assert on CSS class names.

**Symptoms:**
- Tests break when renaming CSS classes
- Tests don't verify actual visual behavior
- Coupling to styling implementation

**Solution:**

```javascript
// ❌ BAD: Testing CSS classes
it('should apply error class', () => {
  render(<Input error={true} />);
  expect(screen.getByRole('textbox')).toHaveClass('input-error');
});

// ✅ GOOD: Test accessible attributes
it('should mark input as invalid', () => {
  render(<Input error={true} />);
  expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
});

// ✅ GOOD: Test error message display
it('should show error message', () => {
  render(<Input error="Amount is required" />);
  expect(screen.getByText('Amount is required')).toBeInTheDocument();
});
```

#### Issue 3: Using Test IDs Unnecessarily

**Problem:** Tests use data-testid instead of accessible queries.

**Symptoms:**
- Tests don't verify accessibility
- Tests are harder to understand
- Clutters production code with test-only attributes

**Solution:**

```javascript
// ❌ BAD: Using test IDs for everything
it('should render form', () => {
  render(<ExpenseForm />);
  expect(screen.getByTestId('expense-form')).toBeInTheDocument();
  expect(screen.getByTestId('amount-input')).toBeInTheDocument();
});

// ✅ GOOD: Use accessible queries
it('should render form', () => {
  render(<ExpenseForm />);
  expect(screen.getByRole('form')).toBeInTheDocument();
  expect(screen.getByLabelText('Amount')).toBeInTheDocument();
});

// ✅ ACCEPTABLE: Use test IDs only when no accessible alternative
it('should render complex component', () => {
  render(<ComplexChart data={[]} />);
  // No accessible role or label for chart container
  expect(screen.getByTestId('chart-container')).toBeInTheDocument();
});
```

### Troubleshooting Guide

#### Problem: "Unable to find element"

**Possible Causes:**
1. Element hasn't appeared yet (async)
2. Element is hidden by CSS (jsdom limitation)
3. Query is incorrect (wrong role, label, or text)
4. Element doesn't exist in the rendered output

**Solutions:**

```javascript
// 1. Wait for element to appear
const element = await screen.findByText('Success');

// 2. Mock component that hides content
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// 3. Check what's actually rendered
screen.debug(); // Print entire DOM
screen.debug(screen.getByRole('form')); // Print specific element

// 4. Use queryBy to check if element exists
const element = screen.queryByText('Success');
expect(element).not.toBeInTheDocument();
```


#### Problem: "act" Warnings

**Possible Causes:**
1. State update not wrapped in act()
2. Async operation not awaited
3. Component updates after test completes

**Solutions:**

```javascript
// 1. Wrap synchronous state updates
act(() => {
  result.current.updateState();
});

// 2. Await async operations
await waitFor(() => {
  expect(result.current.isLoading).toBe(false);
});

// 3. Clean up subscriptions
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe(); // Cleanup
}, []);
```

#### Problem: Tests Pass Individually But Fail Together

**Possible Causes:**
1. Shared state between tests
2. Mocks not cleaned up
3. Timers not cleared
4. Event listeners not removed

**Solutions:**

```javascript
// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.restoreAllMocks();
});

// Reset modules if needed
afterEach(() => {
  vi.resetModules();
});
```

#### Problem: Tests Timeout

**Possible Causes:**
1. Waiting for element that never appears
2. Infinite loop in component
3. waitFor timeout too short
4. Missing await on async operation

**Solutions:**

```javascript
// 1. Check if element actually appears
screen.debug(); // See what's rendered

// 2. Add timeout to waitFor
await waitFor(
  () => expect(screen.getByText('Success')).toBeInTheDocument(),
  { timeout: 5000 }
);

// 3. Use queryBy to check if element exists
const element = screen.queryByText('Success');
if (!element) {
  console.log('Element not found');
}

// 4. Ensure all async operations are awaited
await userEvent.click(button);
await waitFor(() => {
  expect(mockFn).toHaveBeenCalled();
});
```

#### Problem: Mock Not Working

**Possible Causes:**
1. Mock defined after import
2. Wrong module path
3. Mock not matching actual export
4. Mock cleared between tests

**Solutions:**

```javascript
// 1. Define mock BEFORE importing component
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));
import ExpenseForm from './ExpenseForm'; // After mock

// 2. Check module path is correct
vi.mock('../components/CollapsibleSection'); // Relative to test file

// 3. Match actual export structure
vi.mock('./utils', () => ({
  default: { // Default export
    calculate: vi.fn()
  },
  helper: vi.fn() // Named export
}));

// 4. Don't restore mocks if you need them
// Remove vi.restoreAllMocks() from afterEach
```

---

## Migration Examples

This section provides before/after examples for common refactoring patterns when improving test quality.


### Example 1: Mocking CollapsibleSection

#### Before (Brittle, jsdom Issues)

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm', () => {
  it('should show insurance fields when Tax - Medical is selected', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Try to expand Advanced Options section
    const advancedHeader = container.querySelector('.collapsible-header');
    fireEvent.click(advancedHeader);
    
    // Wait for expansion (unreliable in jsdom)
    await waitFor(() => {
      expect(advancedHeader.getAttribute('aria-expanded')).toBe('true');
    });
    
    // Select medical category
    const categorySelect = container.querySelector('select[name="category"]');
    fireEvent.change(categorySelect, { target: { value: 'Tax - Medical' } });
    
    // Try to find insurance field (may not be visible in jsdom)
    const insuranceField = container.querySelector('select[name="insurance_status"]');
    expect(insuranceField).toBeVisible(); // ❌ Fails in jsdom
  });
});
```

**Problems:**
- Uses querySelector (implementation detail)
- Relies on CSS visibility (doesn't work in jsdom)
- Uses fireEvent instead of user-event
- Section expansion is unreliable
- Hard to understand what's being tested

#### After (Reliable, User-Focused)

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MockCollapsibleSection } from '../test-utils';
import ExpenseForm from './ExpenseForm';

// Mock CollapsibleSection BEFORE importing component
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

describe('ExpenseForm', () => {
  it('should show insurance fields when Tax - Medical is selected', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Select medical category using accessible query and user-event
    const categorySelect = screen.getByLabelText('Category');
    await userEvent.selectOptions(categorySelect, 'Tax - Medical');
    
    // Verify insurance field appears (no section expansion needed)
    await waitFor(() => {
      expect(screen.getByLabelText('Insurance Status')).toBeInTheDocument();
    });
  });
});
```

**Improvements:**
- ✅ Mocks CollapsibleSection to avoid jsdom issues
- ✅ Uses accessible queries (getByLabelText)
- ✅ Uses user-event for realistic interactions
- ✅ Focuses on user-facing behavior
- ✅ Clear and maintainable


### Example 2: PBT to Parameterized Conversion

#### Before (PBT for Finite Inputs)

```javascript
import fc from 'fast-check';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CollapsibleSection from './CollapsibleSection';

describe('CollapsibleSection PBT', () => {
  it('Property: toggle interaction works for all trigger types', () => {
    const onToggle = vi.fn();
    
    fc.assert(
      fc.property(
        fc.constantFrom('click', 'Enter', 'Space'),
        (trigger) => {
          onToggle.mockClear();
          
          const { getByRole } = render(
            <CollapsibleSection title="Test" isExpanded={false} onToggle={onToggle}>
              <div>Content</div>
            </CollapsibleSection>
          );
          
          const header = getByRole('button');
          
          if (trigger === 'click') {
            fireEvent.click(header);
          } else {
            fireEvent.keyDown(header, { key: trigger });
          }
          
          expect(onToggle).toHaveBeenCalled();
          cleanup();
        }
      ),
      { numRuns: 100 } // Runs 100 times for only 3 possible inputs!
    );
  });
});
```

**Problems:**
- Only 3 possible inputs (click, Enter, Space)
- Runs 100 times unnecessarily
- Uses fireEvent instead of user-event
- Cleanup inside property function
- Hard to see which case failed
- Slower than needed

#### After (Parameterized)

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testEach } from '../test-utils';
import CollapsibleSection from './CollapsibleSection';

describe('CollapsibleSection', () => {
  testEach([
    { trigger: 'click', description: 'mouse click' },
    { trigger: 'Enter', description: 'Enter key' },
    { trigger: 'Space', description: 'Space key' },
  ]).test('calls onToggle via $description', async ({ trigger }) => {
    const onToggle = vi.fn();
    
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={onToggle}>
        <div>Content</div>
      </CollapsibleSection>
    );
    
    const header = screen.getByRole('button', { name: /test/i });
    
    if (trigger === 'click') {
      await userEvent.click(header);
    } else {
      await userEvent.keyboard(`{${trigger}}`);
    }
    
    expect(onToggle).toHaveBeenCalled();
  });
});
```

**Improvements:**
- ✅ Runs exactly 3 times (once per case)
- ✅ Clear test names show which case is running
- ✅ Uses user-event for realistic interactions
- ✅ Automatic cleanup between tests
- ✅ Easier to debug failures
- ✅ Faster execution


### Example 3: fireEvent to user-event

#### Before (fireEvent)

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm', () => {
  it('should submit expense with all fields', async () => {
    const onExpenseAdded = vi.fn();
    render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);
    
    // Fill form fields with fireEvent
    const dateInput = screen.getByLabelText('Date');
    fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
    
    const placeInput = screen.getByLabelText('Place');
    fireEvent.change(placeInput, { target: { value: 'Store' } });
    
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.change(amountInput, { target: { value: '100' } });
    
    const categorySelect = screen.getByLabelText('Category');
    fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
    
    // Submit form
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitButton);
    
    // Verify submission
    expect(onExpenseAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2025-01-15',
        place: 'Store',
        amount: '100',
        type: 'Groceries'
      })
    );
  });
});
```

**Problems:**
- fireEvent doesn't trigger focus/blur events
- fireEvent doesn't simulate typing character by character
- fireEvent doesn't trigger validation on blur
- Not realistic user interaction
- May miss bugs that real users would encounter

#### After (user-event)

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm', () => {
  it('should submit expense with all fields', async () => {
    const onExpenseAdded = vi.fn();
    render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);
    
    // Fill form fields with user-event
    const dateInput = screen.getByLabelText('Date');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-01-15');
    
    const placeInput = screen.getByLabelText('Place');
    await userEvent.type(placeInput, 'Store');
    
    const amountInput = screen.getByLabelText('Amount');
    await userEvent.type(amountInput, '100');
    
    const categorySelect = screen.getByLabelText('Category');
    await userEvent.selectOptions(categorySelect, 'Groceries');
    
    // Submit form
    const submitButton = screen.getByRole('button', { name: /add expense/i });
    await userEvent.click(submitButton);
    
    // Verify submission (wait for async operation)
    await waitFor(() => {
      expect(onExpenseAdded).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2025-01-15',
          place: 'Store',
          amount: '100',
          type: 'Groceries'
        })
      );
    });
  });
});
```

**Improvements:**
- ✅ Triggers focus/blur events realistically
- ✅ Types character by character
- ✅ Triggers validation at appropriate times
- ✅ Simulates real user behavior
- ✅ More likely to catch real bugs
- ✅ Uses waitFor for async operations


### Example 4: Implementation Detail Queries

#### Before (Implementation Details)

```javascript
import { render, fireEvent } from '@testing-library/react';
import ExpenseList from './ExpenseList';

describe('ExpenseList', () => {
  it('should filter expenses by category', () => {
    const { container } = render(
      <ExpenseList expenses={testExpenses} />
    );
    
    // Query by CSS class (implementation detail)
    const filterDropdown = container.querySelector('.filter-dropdown');
    fireEvent.change(filterDropdown, { target: { value: 'Groceries' } });
    
    // Query by test ID (not accessible)
    const expenseItems = container.querySelectorAll('[data-testid="expense-item"]');
    expect(expenseItems).toHaveLength(2);
    
    // Query by CSS class for expense place
    const firstPlace = container.querySelector('.expense-place');
    expect(firstPlace.textContent).toBe('Store');
  });
  
  it('should show delete button on hover', () => {
    const { container } = render(
      <ExpenseList expenses={testExpenses} />
    );
    
    // Query by CSS class
    const expenseRow = container.querySelector('.expense-row');
    fireEvent.mouseEnter(expenseRow);
    
    // Query by CSS class for button
    const deleteButton = container.querySelector('.delete-button');
    expect(deleteButton).toBeVisible();
  });
});
```

**Problems:**
- Uses querySelector (brittle, implementation-specific)
- Uses CSS classes (breaks when styling changes)
- Uses test IDs unnecessarily
- Doesn't verify accessibility
- Hard to understand user perspective

#### After (Accessible Queries)

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseList from './ExpenseList';

describe('ExpenseList', () => {
  it('should filter expenses by category', async () => {
    render(<ExpenseList expenses={testExpenses} />);
    
    // Query by accessible label
    const filterDropdown = screen.getByLabelText('Filter by Category');
    await userEvent.selectOptions(filterDropdown, 'Groceries');
    
    // Query by role and text content
    await waitFor(() => {
      const expenses = screen.getAllByRole('listitem');
      expect(expenses).toHaveLength(2);
    });
    
    // Query by text content (user-visible)
    expect(screen.getByText('Store')).toBeInTheDocument();
  });
  
  it('should show delete button for each expense', () => {
    render(<ExpenseList expenses={testExpenses} />);
    
    // Query by accessible role and name
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(testExpenses.length);
    
    // Verify first delete button has accessible label
    expect(deleteButtons[0]).toHaveAttribute('aria-label', 'Delete Store expense');
  });
});
```

**Improvements:**
- ✅ Uses accessible queries (getByRole, getByLabelText)
- ✅ Verifies accessibility attributes
- ✅ Queries by user-visible content
- ✅ Resilient to styling changes
- ✅ Tests from user perspective
- ✅ Uses user-event for interactions

---

## Summary

### Key Takeaways

1. **Mock strategically**: Mock components with jsdom limitations, external dependencies, and slow operations
2. **Test asynchronously**: Use waitFor, findBy, and user-event for reliable async testing
3. **Avoid pitfalls**: Watch for jsdom limitations, timing issues, and implementation detail coupling
4. **Migrate gradually**: Apply patterns as you touch existing code, prioritize problematic tests
5. **Focus on users**: Test what users see and do, not internal implementation

### Quick Reference

| Scenario | Solution |
|----------|----------|
| CollapsibleSection in tests | Mock with MockCollapsibleSection |
| Waiting for element | Use findBy or waitFor |
| User interactions | Use user-event, not fireEvent |
| Querying elements | Use getByRole, getByLabelText |
| Async operations | Always await and use waitFor |
| Test cleanup | Use afterEach with cleanup() |
| Finite inputs | Use parameterized tests |
| Large input spaces | Use property-based tests |

### When to Use Each Test Type

- **Unit tests**: Single component, specific examples, edge cases
- **Parameterized tests**: Finite enumerable inputs (< 10 cases)
- **Property-based tests**: Algorithms, invariants, large input spaces
- **Integration tests**: Multiple components, user workflows
- **E2E tests**: Critical paths, visual validation, browser-specific behavior

