# Frontend Testing Guidelines

## Test Types and When to Use Them

| Type | Use When | Example |
|------|----------|---------|
| Standard unit tests | Testing specific behavior, edge cases, integration flows | `ExpenseForm.test.jsx` |
| Parameterized tests | Same logic across a finite, enumerable set of inputs | `CollapsibleSection.test.jsx` |
| Property-based tests (PBT) | Invariants over large/infinite input spaces, state machines | `FilterContext.pbt.test.jsx` |

### Decision Guide

1. **Is the input space finite and small?** (e.g., 5 categories, 3 toggle states)
   → **Parameterized tests** — enumerate all cases explicitly
2. **Is the input space large or infinite?** (e.g., arbitrary strings, number ranges, operation sequences)
   → **Property-based tests** — let fast-check explore the space
3. **Testing a specific scenario or edge case?**
   → **Standard unit test**

### File Naming

- Unit tests: `Component.test.jsx`
- PBT tests: `Component.pbt.test.jsx`
- Integration tests: `Component.integration.test.jsx`

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
