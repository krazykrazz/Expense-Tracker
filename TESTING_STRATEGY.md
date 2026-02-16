# Testing Strategy

This document defines when to use each test type, what anti-patterns to avoid, and how to write high-value property-based tests. It is the canonical reference for test type decisions in this project.

For runner-specific commands and configuration, see [.kiro/steering/testing.md](.kiro/steering/testing.md).

## Test Type Decision Matrix

| Scenario | Test Type | Naming Convention | Example |
|---|---|---|---|
| Pure function, deterministic output | Unit test | `*.test.js` / `*.test.jsx` | Formatting a date string |
| Component rendering with specific props | Unit test | `*.test.jsx` | Component renders correct text for given input |
| Service → repository → SQLite interaction | Integration test | `*.integration.test.js` | Creating an expense and reading it back |
| Activity log verification through service layer | Integration test | `*.integration.test.js` | Verifying CRUD operations log correctly |
| Invariant over randomized inputs (financial math, date boundaries) | PBT | `*.pbt.test.js` / `*.pbt.test.jsx` | Balance aggregation across random expenses |
| Round-trip property (serialize → deserialize) | PBT | `*.pbt.test.js` | Expense JSON round-trip, localStorage persistence |
| SQL edge-case handling (COALESCE, NULL patterns) | PBT | `*.pbt.test.js` | COALESCE(posted_date, date) with randomized NULLs |
| Date boundary handling across months/years | PBT | `*.pbt.test.js` | Billing cycle due dates across leap years |

## When to Use Each Test Type

### Unit Tests

Use unit tests when the output is deterministic given the input and dependencies can be mocked.

- Component rendering with known props
- Service methods with mocked repositories
- Utility functions with fixed inputs
- Error handling paths
- Callback wiring and event handling

### Integration Tests

Use integration tests when you need to verify real database interactions through the service layer.

- CRUD operations against real SQLite
- Activity log metadata verification
- Migration correctness
- Cascade delete behavior
- Multi-service workflows (e.g., expense creation triggers budget recalculation)

### Property-Based Tests (PBT)

Use PBT **only** when randomized inputs provide value beyond fixed examples. The test must exercise real logic — not mocked return values.

Good candidates:
- Financial calculations where edge cases are hard to enumerate (tax credits, balance aggregation, statement balances)
- Date boundary logic (month-end handling, leap years, timezone-aware comparisons)
- Data integrity invariants (round-trip persistence, cascade consistency)
- SQL behavior with randomized NULL/non-NULL patterns (COALESCE, aggregation)
- State management properties (idempotency, commutativity of operations)

## Anti-Patterns (DO NOT)

### 1. PBT over mocked return values

Generating random inputs only to assert against mocked outputs tests the mock, not the code.

**Removed example**: `SummaryPanel.scrolling.pbt.test.jsx` — generated random scroll positions but validated mocked `getComputedStyle` returns. The randomization added zero value because the mock always returned the same thing regardless of input.

### 2. Math.random() instead of fast-check generators

Using `Math.random()` in a PBT file defeats the purpose — you lose shrinking, reproducibility, and seed-based replay.

**Converted example**: `expenseService.backwardcompatibility.pbt.test.js` used `Math.random()` to generate test data with 5 sequential fixed assertions. It was converted to `expenseService.backwardcompatibility.integration.test.js` with deterministic test data.

### 3. Deterministic assertions wrapped in property loops

If every iteration of `fc.assert` produces the same output regardless of the generated input, it's a unit test wearing a PBT costume.

**Removed example**: `ExpenseForm.ariaAttributes.pbt.test.jsx` — PBT over a boolean (expanded/collapsed) is just 2 examples. Two unit test cases cover it completely.

### 4. PBT over boolean or tiny enum inputs

If the input space has fewer than ~5 values, enumerate them as unit tests instead. PBT's value comes from exploring large input spaces.

### 5. PBT that tests rendering with random props

Generating random component props to check that the DOM contains certain elements tests React's rendering, not your logic. Use a unit test with representative props instead.

**Removed example**: `ExpenseList.editModal.pbt.test.jsx` — rendered the component with random props and checked DOM structure. A single unit test with fixed props validates the same behavior.

## High-Value PBT Patterns (DO)

### Financial calculations with randomized amounts and dates

```javascript
// From: taxCreditCalculator.pbt.test.js
// Validates: AGI threshold = min(income × 0.03, federal max) for ANY income and year
test('AGI threshold equals min(income × 0.03, federal max)', () => {
  fc.assert(
    fc.property(safeIncome, taxYear, (netIncome, year) => {
      const { federal } = getTaxRatesForYear(year);
      const threshold = calculateAGIThreshold(netIncome, year);
      const expected = Math.min(netIncome * federal.agiThresholdPercent, federal.agiThresholdMax);
      expect(threshold).toBeCloseTo(expected, 2);
    }),
    pbtOptions({ numRuns: 100 })
  );
});
```

Why PBT: The input space (income × year × province) is too large to enumerate. Randomization catches floating-point edge cases and boundary interactions that fixed examples miss.

### SQL COALESCE behavior with randomized NULL patterns

```javascript
// From: paymentMethodService.balance.pbt.test.js
// Validates: Balance uses COALESCE(posted_date, date) as effective posting date
// Randomness tests various combinations of NULL and non-NULL posted_dates
// against real SQLite to ensure the COALESCE logic works correctly
```

Why PBT: NULL/non-NULL combinations across multiple expenses create a combinatorial space. Random generation with real SQLite catches SQL edge cases that hand-picked examples miss.

### Date boundary handling

```javascript
// From: billingCycleDueDate.pbt.test.js
// Validates: Due date calculation handles month-end, leap years, year boundaries
// Randomized cycle day + statement date combinations
```

Why PBT: Month lengths vary (28–31 days), leap years add complexity, and year boundaries create edge cases. Randomization across the full date space catches boundary bugs.

### Round-trip persistence properties

```javascript
// From: loanService.roundtrip.pbt.test.js
// Validates: create(data) → getById(id) returns equivalent data
// For ANY valid loan input, the round-trip preserves all fields
```

Why PBT: Serialization/deserialization bugs often hide in specific field combinations. Randomizing all fields catches issues that targeted examples miss.

## PBT File Requirements

Every `*.pbt.test.*` file must include:

1. An `@invariant` or `Invariant:` comment block within the first 30 lines describing:
   - What invariant is being tested
   - Why randomization adds value over example-based tests
2. Use of `fast-check` generators (never `Math.random()`)
3. Proper options: `dbPbtOptions()` for database-backed tests, `pbtOptions()` for pure logic

## File Organization

- Backend PBT files are consolidated per service into logical groups (e.g., `expenseService.financial.pbt.test.js`, `expenseService.people.pbt.test.js`)
- Each consolidated file uses `describe` blocks to group related properties
- PBT files should not exceed 20% of total test files in the project
- New PBT files require justification via the invariant comment block

## Configuration

| Setting | CI | Local |
|---|---|---|
| `FAST_CHECK_NUM_RUNS` | 15 | 100 (default) |
| `FAST_PBT` env var | not set | `"true"` for reduced iterations |
| Database PBT options | `dbPbtOptions()` | `dbPbtOptions()` |
| Pure logic PBT options | `pbtOptions()` | `pbtOptions()` |
