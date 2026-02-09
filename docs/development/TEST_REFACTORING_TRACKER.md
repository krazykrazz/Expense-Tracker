# Test Refactoring Tracker

This document tracks the progress of refactoring frontend tests to follow the patterns established in the `frontend-test-refactoring` spec.

## Overview

The goal is to gradually improve test quality by:
1. Reducing coupling to implementation details
2. Improving test reliability in jsdom
3. Using appropriate test types (unit, integration, PBT, E2E)
4. Establishing reusable patterns and utilities

## Refactoring Status

### ✅ Completed

| File | Priority | Issues Addressed | Completion Date |
|------|----------|------------------|-----------------|
| `ExpenseForm.sections.test.jsx` | High | CollapsibleSection mocking, accessible queries | 2025-01-27 |
| `ExpenseForm.pbt.test.jsx` | High | Converted finite-input PBTs to parameterized tests, userEvent for simple tests | 2025-01-27 |
| `test-utils/componentMocks.jsx` | High | Created MockCollapsibleSection | 2025-01-27 |
| `test-utils/expenseFormHelpers.js` | Medium | Enhanced with new assertion helpers | 2025-01-27 |

### 🚧 In Progress

| File | Priority | Issues | Estimated Effort | Assigned To |
|------|----------|--------|------------------|-------------|
| `ExpenseForm.core.test.jsx` | High | fireEvent → userEvent, accessible queries | Medium | - |
| `ExpenseForm.dataPreservation.test.jsx` | High | CollapsibleSection mocking, implementation detail coupling | Medium | - |

### 📋 Pending

| File | Priority | Issues | Estimated Effort | Notes |
|------|----------|--------|------------------|-------|
| `ExpenseForm.editMode.test.jsx` | Medium | fireEvent → userEvent | Small | Low priority - tests are stable |
| `ExpenseForm.invoice.test.jsx` | Medium | fireEvent → userEvent | Small | Low priority - tests are stable |
| `ExpenseForm.accessibility.test.jsx` | Low | Review for improvements | Small | Already uses accessible queries |
| `ExpenseList.test.jsx` | Medium | Review for PBT opportunities | Medium | Consider parameterized tests |
| `FilterContext.test.jsx` | Low | Review for improvements | Small | Tests are simple and stable |
| `ModalContext.test.jsx` | Low | Review for improvements | Small | Tests are simple and stable |
| `ExpenseContext.test.jsx` | Medium | Review for improvements | Medium | Consider mocking strategies |

## Refactoring Patterns

### Pattern 1: Mock CollapsibleSection

**When to use:** Integration tests that need to verify conditional field display without testing section expansion.

**Before:**
```javascript
await expandSection(container, 'Advanced Options');
const field = screen.getByLabelText('Posted Date');
```

**After:**
```javascript
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// Field is always rendered in tests
const field = screen.getByLabelText('Posted Date');
```

### Pattern 2: Convert Finite-Input PBT to Parameterized

**When to use:** PBT tests with < 10 distinct input values.

**Before:**
```javascript
it('Property: validates all payment methods', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...PAYMENT_METHODS.map(m => m.id)),
      (methodId) => {
        // test logic
      }
    )
  );
});
```

**After:**
```javascript
testEach(
  PAYMENT_METHODS.map(m => ({ methodId: m.id, name: m.display_name }))
).test('validates $name payment method', ({ methodId }) => {
  // test logic
});
```

### Pattern 3: Use userEvent for Simple Tests

**When to use:** Non-PBT tests with few iterations (< 10).

**Before:**
```javascript
fireEvent.change(input, { target: { value: 'test' } });
fireEvent.click(button);
```

**After:**
```javascript
await userEvent.type(input, 'test');
await userEvent.click(button);
```

**Note:** Keep fireEvent for PBT tests with many iterations (100+) for performance.

### Pattern 4: Use Accessible Queries

**When to use:** All tests.

**Before:**
```javascript
const button = container.querySelector('.submit-button');
const input = container.querySelector('#amount');
```

**After:**
```javascript
const button = screen.getByRole('button', { name: /submit/i });
const input = screen.getByLabelText('Amount');
```

## Refactoring Checklist

When refactoring a test file, follow this checklist:

- [ ] **Read the test file** - Understand what it's testing
- [ ] **Identify issues** - Look for:
  - [ ] fireEvent usage (consider userEvent)
  - [ ] Implementation detail queries (querySelector, getByTestId)
  - [ ] CollapsibleSection expansion issues
  - [ ] PBT with finite inputs (< 10 cases)
  - [ ] Brittle selectors or timing dependencies
- [ ] **Apply patterns** - Use established patterns from this document
- [ ] **Run tests** - Ensure all tests pass after refactoring
- [ ] **Measure performance** - Check execution time hasn't increased significantly
- [ ] **Update this tracker** - Move file from Pending to Completed
- [ ] **Commit changes** - Use descriptive commit message referencing this spec

## Performance Benchmarks

Track test execution times to ensure refactoring improves (or at least doesn't degrade) performance.

### Baseline (Before Refactoring)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Full suite | TBD | < 5 minutes | - |
| ExpenseForm.core.test.jsx | TBD | < 10 seconds | - |
| ExpenseForm.sections.test.jsx | TBD | < 10 seconds | - |
| ExpenseForm.pbt.test.jsx | TBD | < 10 seconds | - |

### Current (After Refactoring)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Full suite | TBD | < 5 minutes | ⏳ Pending measurement |
| ExpenseForm.core.test.jsx | TBD | < 10 seconds | ⏳ Pending measurement |
| ExpenseForm.sections.test.jsx | ~2-3 seconds | < 10 seconds | ✅ Pass |
| ExpenseForm.pbt.test.jsx | ~38 seconds | < 10 seconds | ❌ Exceeds (but acceptable for PBT) |

**Note:** Run `npm run test:perf` from the `frontend` directory to measure current performance.

## Guidelines for New Tests

When writing new tests, follow these guidelines from the start:

1. **Choose the right test type:**
   - Unit tests: Single component, specific examples, edge cases
   - Integration tests: Multiple components, user workflows
   - PBT: Algorithms, business logic with clear invariants
   - E2E: Critical paths, visual validation, browser-specific behavior

2. **Use accessible queries:**
   - Prefer `getByRole`, `getByLabelText`, `getByText`
   - Avoid `getByTestId`, `querySelector` unless necessary

3. **Use userEvent for realistic interactions:**
   - Use `userEvent.type()`, `userEvent.click()`, etc.
   - Exception: PBT with many iterations (use fireEvent for performance)

4. **Mock components when needed:**
   - Use `MockCollapsibleSection` for ExpenseForm tests
   - Mock external dependencies (APIs, modules)

5. **Write descriptive test names:**
   - Explain what is being tested and expected behavior
   - Use `testEach` for parameterized tests with clear descriptions

6. **Keep tests focused:**
   - One assertion per test (or closely related assertions)
   - Don't test multiple unrelated behaviors in one test

## Resources

- **Spec:** `.kiro/specs/frontend-test-refactoring/`
- **Testing Guidelines:** `docs/development/FRONTEND_TESTING_GUIDELINES.md`
- **Test Utilities:** `frontend/src/test-utils/`
- **Performance Script:** `scripts/measure-test-performance.js`

## Notes

- This is a gradual refactoring effort - don't block new features to refactor old tests
- Apply new patterns when touching existing test files
- New features should use new patterns from the start
- Track completion in this document to maintain visibility
