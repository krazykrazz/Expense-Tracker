# Test Refactoring Process

This document explains when and how to apply the new testing patterns established in the `frontend-test-refactoring` spec.

## When to Apply New Patterns

### 1. When Writing New Tests

**Always use new patterns from the start:**
- Use accessible queries (`getByRole`, `getByLabelText`)
- Use `userEvent` for user interactions (except PBT with 100+ iterations)
- Mock `CollapsibleSection` in ExpenseForm tests
- Choose appropriate test type (unit, integration, PBT, E2E)
- Use `testEach` for parameterized tests with finite inputs

### 2. When Touching Existing Tests

**Apply patterns opportunistically:**
- If fixing a bug in a test, refactor it to use new patterns
- If adding new test cases, refactor the entire file
- If a test is brittle or flaky, refactor it immediately
- Don't refactor tests that are stable and working well (low priority)

### 3. When Tests Are Failing

**Refactor as part of the fix:**
- If a test fails due to implementation details, refactor to test behavior
- If a test fails due to jsdom limitations, add mocking
- If a test is slow or timing out, optimize or simplify

## Refactoring Checklist

Use this checklist when refactoring a test file:

### Pre-Refactoring

- [ ] **Understand the tests** - Read through the file and understand what's being tested
- [ ] **Run the tests** - Ensure they pass before refactoring
- [ ] **Identify issues** - Note specific problems (see "Common Issues" below)
- [ ] **Plan the refactoring** - Decide which patterns to apply

### During Refactoring

- [ ] **Apply patterns incrementally** - Refactor one test at a time
- [ ] **Run tests frequently** - Verify each change doesn't break tests
- [ ] **Keep coverage** - Don't remove tests without equivalent replacements
- [ ] **Update imports** - Add new utilities as needed

### Post-Refactoring

- [ ] **Run all tests** - Ensure the entire file passes
- [ ] **Check performance** - Verify execution time hasn't increased significantly
- [ ] **Update tracker** - Mark file as completed in `TEST_REFACTORING_TRACKER.md`
- [ ] **Commit changes** - Use descriptive commit message

## Common Issues and Solutions

### Issue 1: CollapsibleSection Expansion Doesn't Work in jsdom

**Symptom:** Tests that click section headers to expand sections fail or are flaky.

**Solution:** Mock CollapsibleSection
```javascript
// At top of test file
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// Remove expandSection calls - fields are always rendered in tests
```

**Files affected:** Any test that uses `expandSection()` or clicks `.collapsible-header`

### Issue 2: Tests Use Implementation Details

**Symptom:** Tests break when refactoring internal structure without changing behavior.

**Solution:** Use accessible queries
```javascript
// Before (brittle)
const button = container.querySelector('.submit-button');
const input = container.querySelector('#amount');

// After (resilient)
const button = screen.getByRole('button', { name: /submit/i });
const input = screen.getByLabelText('Amount');
```

**Files affected:** Most test files

### Issue 3: PBT Tests with Finite Inputs

**Symptom:** PBT test uses `fc.constantFrom()` with < 10 values.

**Solution:** Convert to parameterized test
```javascript
// Before (overkill)
it('Property: validates payment methods', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('cash', 'debit', 'credit'),
      (method) => {
        // test logic
      }
    )
  );
});

// After (clearer)
testEach([
  { method: 'cash', description: 'cash payment' },
  { method: 'debit', description: 'debit payment' },
  { method: 'credit', description: 'credit payment' }
]).test('validates $description', ({ method }) => {
  // test logic
});
```

**Files affected:** `ExpenseForm.pbt.test.jsx`, any file with PBT

### Issue 4: Tests Use fireEvent Instead of userEvent

**Symptom:** Tests use `fireEvent.change()`, `fireEvent.click()`, etc.

**Solution:** Use userEvent (except for PBT with 100+ iterations)
```javascript
// Before
fireEvent.change(input, { target: { value: 'test' } });
fireEvent.click(button);

// After
await userEvent.type(input, 'test');
await userEvent.click(button);
```

**Exception:** Keep `fireEvent` for PBT tests with many iterations for performance.

**Files affected:** Most test files

### Issue 5: Tests Are Slow

**Symptom:** Test file takes > 10 seconds to run.

**Solutions:**
1. Reduce PBT iteration count (use `numRuns: 25` instead of `numRuns: 100`)
2. Use `fireEvent` instead of `userEvent` for PBT tests
3. Remove unnecessary `waitFor` calls with long timeouts
4. Split large test files into focused files

**Files affected:** `ExpenseForm.pbt.test.jsx`, large integration tests

## Commit Message Guidelines

When committing refactored tests, use descriptive messages:

### Format
```
test: refactor [file] to use new testing patterns

- Applied pattern: [pattern name]
- Fixed: [specific issue]
- Refs: frontend-test-refactoring spec
```

### Examples

**Good:**
```
test: refactor ExpenseForm.core.test.jsx to use userEvent

- Replaced fireEvent with userEvent for realistic interactions
- Updated DOM queries to use accessible selectors
- Refs: frontend-test-refactoring spec
```

**Good:**
```
test: convert ExpenseForm PBT to parameterized tests

- Converted category dropdown test to simple test (finite input)
- Converted payment method persistence to testEach (5 cases)
- Kept PBT for form validation (infinite input space)
- Refs: frontend-test-refactoring spec
```

**Bad:**
```
fix tests
```

**Bad:**
```
update ExpenseForm tests
```

## Gradual Adoption Strategy

This is a **gradual refactoring effort**. Don't block new features to refactor old tests.

### Priority Levels

**High Priority (Refactor ASAP):**
- Tests that are failing or flaky
- Tests that block new features
- Tests with CollapsibleSection expansion issues
- Tests that are slow (> 10 seconds)

**Medium Priority (Refactor When Touching):**
- Tests that use `fireEvent` instead of `userEvent`
- Tests that use implementation detail queries
- Tests with finite-input PBT

**Low Priority (Refactor Eventually):**
- Tests that are stable and working well
- Tests that are simple and fast
- Tests that already use good patterns

### Team Guidelines

1. **New features:** Use new patterns from the start
2. **Bug fixes:** Refactor the affected test file
3. **Code reviews:** Suggest pattern improvements
4. **Weekly:** Review `TEST_REFACTORING_TRACKER.md` and pick one file to refactor

## Resources

- **Spec:** `.kiro/specs/frontend-test-refactoring/`
- **Testing Guidelines:** `docs/development/FRONTEND_TESTING_GUIDELINES.md`
- **Refactoring Tracker:** `docs/development/TEST_REFACTORING_TRACKER.md`
- **Test Utilities:** `frontend/src/test-utils/`
- **Performance Script:** `scripts/measure-test-performance.js`

## Questions?

If you're unsure about how to refactor a specific test:
1. Check the patterns in `TEST_REFACTORING_TRACKER.md`
2. Look at recently refactored files for examples
3. Review the testing guidelines
4. Ask the team for guidance
