# Frontend Testing Guidelines

Practical guide for writing and running frontend tests (`frontend/`). It covers the test stack, the shared test utilities, proven patterns, and jsdom/Vitest gotchas.

- Choosing a test type, PBT rules, commands and CI guardrails for both frontend and backend: [testing.instructions.md](../../.github/instructions/testing.instructions.md)

---

## Stack and Configuration

| Package | Version range (`frontend/package.json`) |
|---------|------------------------------------------|
| `vitest` / `@vitest/ui` | `^5.0.0` / `^5.0.2` (must be bumped together) |
| `jsdom` | `^30.1.1` |
| `@testing-library/react` | `^16.3.3` |
| `@testing-library/user-event` | `^14.6.7` |
| `@testing-library/jest-dom` | `^7.0.1` |
| `fast-check` | `^4.10.2` |

There is no browser/E2E runner (Playwright, Cypress) in the project. Everything runs in Vitest + jsdom.

### `vitest.config.js`

`globals: true`, `environment: 'jsdom'`, `setupFiles: './vitest.setup.js'`, `pool: 'forks'`. Several settings depend on CI detection (`CI === 'true'` or `GITHUB_ACTIONS === 'true'`):

| Setting | CI | Local |
|---------|----|-------|
| `testTimeout` | 45000 | 30000 |
| `hookTimeout` | 30000 | 20000 |
| `retry` | 2 | 0 |
| `bail` | 1 | 0 |
| `poolOptions.forks.maxForks` | 2 | default |
| `reporters` | `verbose` | `default` |

It also defines `import.meta.env.VITE_API_BASE_URL` (`http://localhost:2424`), `import.meta.env.CI` and `import.meta.env.GITHUB_ACTIONS`.

### `vitest.setup.js`

- Imports `@testing-library/jest-dom` matchers.
- Sets `globalThis.isCI`.
- Installs a `MockEventSource` as `globalThis.EventSource` (jsdom has none). Instances are recorded in `EventSource.instances` and expose `_triggerOpen()`, `_triggerMessage(data)`, `_triggerError()`. Override per test with `vi.stubGlobal('EventSource', ...)`.
- `afterEach`: resets `MockEventSource.instances`, `vi.clearAllTimers()`, `vi.clearAllMocks()` (clears call history, keeps implementations).
- `afterAll`: `vi.useRealTimers()`.
- In CI only: `console.log` / `console.warn` are replaced with `vi.fn()`; `console.error` is kept.

It does **not** stub `fetch`, `localStorage`/`sessionStorage`, or `Element.prototype.scrollIntoView` — see [jsdom and Vitest Gotchas](#jsdom-and-vitest-gotchas).

---

## Running Tests

Run from `frontend/`:

```bash
npm test                          # vitest --run (whole suite)
npx vitest --run ExpenseForm      # filter by file name
npx vitest --run pbt              # only files whose path contains "pbt"
npm run test:fast                 # FAST_CHECK_NUM_RUNS=10 (see PBT section)
npm run test:parallel             # forks pool, maxForks=75%
npm run test:watch                # watch mode
npm run test:changed              # only tests affected by uncommitted changes
npm run test:core                 # also: test:sections, test:people, test:futureMonths, test:dataPreservation
```

**Always validate with `CI=true` before pushing.** `vitest.config.js`, `vitest.setup.js` and `src/test/pbtArbitraries.js` all branch on CI detection, so a suite can pass locally and fail in CI:

```bash
npx cross-env CI=true npx vitest --run
```

CI runs `npx vitest --run --exclude '**/App.performance.test.jsx'`, then `scripts/check-test-budget.js frontend-tests` (see [GitHub Actions CI/CD](./GITHUB_ACTIONS_CICD.md#runtime-budgets)).

**Unhandled errors fail the run even when every test passes** (`Test Files N passed` but exit code 1, with an "Unhandled Errors" section). When summarising output, also look for `Unhandled|Uncaught` and check the exit code.

---

## File Naming and Location

Tests are co-located with the code they test. Components live in domain subfolders (`src/components/expenses/`, `src/components/shared/`, ...), so imports from a component test are usually `../../test-utils` and sibling-domain modules are `../shared/...`.

| Pattern | Use |
|---------|-----|
| `Component.test.jsx` | Unit tests |
| `Component.<aspect>.test.jsx` | Split unit-test files (e.g. `ExpenseForm.core.test.jsx`, `ExpenseForm.sections.test.jsx`) |
| `Component.integration.test.jsx` | Multi-component / provider workflows |
| `Component.pbt.test.jsx` / `util.pbt.test.js` | Property-based tests (must carry an `@invariant` comment in the first 30 lines) |

---

## Shared Test Utilities

There are two shared modules. They export some **identically named but different** generators — import from the one you mean.

| Module | Contents |
|--------|----------|
| `src/test-utils/` (import from `index.js`) | Domain arbitraries, provider wrappers, async assertions, API mock factories, `testEach`, ExpenseForm helpers, `MockCollapsibleSection` |
| `src/test/pbtArbitraries.js` | `pbtOptions` / `asyncPbtOptions` / `uiPbtOptions`, `isCI`, `CI_SEED`, plus CI-safe arbitraries (`safeDate`, `safeAmount`, `safeIntAmount`, `safeString`, `safePlaceName`, `expenseType`, `taxDeductibleType`, `paymentMethod`, `weekNumber`, `monthNumber`, `year`, `safeExpenseFormData`) |

```javascript
import { createFilterWrapper, waitForState, testEach } from '../../test-utils';
import { pbtOptions } from '../../test/pbtArbitraries';
```

Name collisions to watch for:

| Name | `test-utils/arbitraries.js` | `test/pbtArbitraries.js` |
|------|-----------------------------|--------------------------|
| `safeDate` | `({ minYear = 2020, maxYear = 2030 })`, day capped at 28 | `({ min, max })` Date bounds, default 2020-01-01 – 2025-12-31 |
| `safeAmount` | `fc.double` 0.01–99999.99, **rounded to cents** | `fc.float` 0.01–10000, **not rounded** (oracles must round like the code under test) |
| `safeString` | untrimmed, 1–50 chars | trimmed, 1–100 chars |
| `paymentMethod` | function: `paymentMethod()` → `'cash' \| 'cheque' \| 'debit' \| 'credit_card'` | constant arbitrary: `paymentMethod` → `'Cash' \| 'Debit' \| 'CIBC MC' \| 'VISA' \| 'Cheque'` |

### Arbitraries (`test-utils/arbitraries.js`)

| Generator | Produces |
|-----------|----------|
| `safeDate({ minYear, maxYear })` | `YYYY-MM-DD` string, default 2020–2030, day 1–28 |
| `safeDateObject(options)` | `Date` at local midnight from `safeDate` |
| `dateRange(options)` | `{ start, end }` strings with `start <= end` |
| `safeAmount({ min, max })` | Number rounded to cents, default 0.01–99999.99 |
| `positiveAmount()` | `safeAmount({ min: 0.01 })` |
| `amountWithCents()` | Integer dollars (0–99999) + cents/100 (can be 0) |
| `safeString({ minLength, maxLength })` / `nonEmptyString(options)` | String with non-whitespace content |
| `placeName()` | 2–40 chars, letters/digits/spaces |
| `expenseCategory()` | One of 15 hard-coded categories (not the backend `CATEGORIES` list) |
| `taxDeductibleCategory()` | `'Tax - Medical'` or `'Tax - Donation'` |
| `paymentMethod()` | `'cash'`, `'cheque'`, `'debit'`, `'credit_card'` |
| `insuranceStatus()` | `''`, `'pending'`, `'submitted'`, `'approved'`, `'denied'` |
| `expenseRecord(overrides)` | `{ id, date, place, amount, category, payment_type, payment_method, week, notes, tax_deductible, insurance_status, reimbursement_status }` — `overrides` are arbitraries merged into the record |
| `personRecord()` | `{ id, name, relationship }` |
| `budgetRecord()` | `{ id, category, amount, year, month }` |
| `modalOperationSequence({ minLength, maxLength })` | Array of `'open'` / `'close'` |
| `stateTransitionSequence(states)` | Array (1–20) drawn from `states` |
| `arbEnrichedAnomaly`, `arbClusterAnomaly`, `arbDriftAnomaly`, `arbLegacyAnomaly` | Anomaly-detection payloads (see `AnomalyAlertItem.pbt.test.jsx`) |

### Wrappers (`test-utils/wrappers.jsx`)

| Factory | Notes |
|---------|-------|
| `createModalWrapper(props)` | `ModalProvider` (takes no props besides `children`) |
| `createFilterWrapper(props)` | `FilterProvider` — accepts `paymentMethods` |
| `createExpenseWrapper(props)` | `ExpenseProvider` (takes no props besides `children`) |
| `createSharedDataWrapper(props)` | `SharedDataProvider` — accepts `selectedYear`, `selectedMonth` |
| `createFullContextWrapper({ filter, sharedData, expense, modal })` | Nesting: Filter → SharedData → Expense → Modal; each key is that provider's props |
| `createMinimalWrapper(contexts)` | `contexts` items are `'modal' \| 'filter' \| 'expense' \| 'sharedData'` or `{ name, props }`; first item is outermost; throws if empty |
| `wrapperBuilder()` | `.withModal()`, `.withFilter()`, `.withExpense()`, `.withSharedData()`, then `.build()`; throws if no layer was added |

Props a provider does not accept are silently ignored, so `withExpense({ fetchExpenses })` does **not** inject an API.

```javascript
// From ExpenseContext.pbt.test.jsx
const wrapper = wrapperBuilder()
  .withFilter({ paymentMethods: VALID_METHODS })
  .withExpense()
  .build();
const { result } = renderHook(() => useExpenseContext(), { wrapper });
```

### Assertions (`test-utils/assertions.js`)

| Helper | Behaviour |
|--------|-----------|
| `waitForState(getter, expected, { timeout = 3000, interval = 50, errorMessage })` | `waitFor` until `getter() === expected` (strict equality) |
| `waitForStateChange(getter, { timeout, interval })` | Waits until `getter()` differs from its initial value; returns the new value |
| `waitForApiCall(mockFn, { times = 1, timeout, interval })` | Waits until the mock has **at least** `times` calls |
| `assertModalOpen(state, name)` / `assertModalClosed(state, name)` | Reads `state[name]`, falling back to `state['show' + Name]` |
| `assertAllModalsClosed(state)` | Every `show*` key is not `true` |
| `assertSequenceResult(ops, actualState)` | For `'open'`/`'close'` sequences: final state is `true` iff the last op is `'open'` |
| `assertIdempotence(operation, getter)` | Async; runs `operation` twice and compares `getter()` |

### API mock factories (`test-utils/mocks.js`)

`createExpenseApiMock`, `createPaymentMethodApiMock`, `createPeopleApiMock`, `createCategorySuggestionApiMock`, `createCategoriesApiMock`, `createInvoiceApiMock`, `createBudgetApiMock` each return an object of resolved `vi.fn()`s merged with your `overrides`. Response builders: `mockExpenseResponse(data = [])` → `{ data, total, page, pageSize }`; `mockErrorResponse(status = 500, message)` → an `Error` with `.response = { status, data: { error } }`; `mockSuccessResponse(data)` → `{ data, success: true }`.

`createCallTracker()` returns `{ track(fn), getCallCount(), getLastCall(), getCalls(), reset() }`.

Components and providers do **not** take an `api` prop. To use a factory, return it from a `vi.mock` factory. `vi.mock` is hoisted, so the factory cannot close over top-level variables — create the mock inside the factory (or with `vi.hoisted`):

```javascript
vi.mock('../../services/paymentMethodApi', async () => {
  const { createPaymentMethodApiMock } = await import('../../test-utils/mocks');
  return createPaymentMethodApiMock({
    getActivePaymentMethods: vi.fn().mockResolvedValue([{ id: 1, display_name: 'Cash', type: 'cash', is_active: 1 }]),
  });
});
```

### Parameterized tests (`test-utils/parameterized.js`)

```javascript
import { testEach } from '../../test-utils';

testEach([
  { input: '', expected: false, description: 'empty string' },
  { input: 'hello', expected: true, description: 'normal text' },
]).test('returns $expected for input "$input"', ({ input, expected }) => {
  expect(isValid(input)).toBe(expected);
});
```

- `$key` in the name is replaced with `String(case[key])`.
- If a case has `description`, it is **appended** as ` (description)` — don't also put `$description` in the template or it appears twice.
- `only: true` / `skip: true` on a case map to `test.only` / `test.skip`.
- `testEach(cases).it(...)` is also available.

### ExpenseForm helpers (`test-utils/expenseFormHelpers.js`)

These assume the test file has already `vi.mock`ed `services/peopleApi`, `services/expenseApi`, `services/categoriesApi`, `services/categorySuggestionApi` and `services/paymentMethodApi`, and set `global.fetch = vi.fn()` — `setupExpenseFormMocks()` calls `.mockResolvedValue` / `.mockImplementation` on them. See `ExpenseForm.sections.test.jsx` for the full set-up.

| Export | Behaviour |
|--------|-----------|
| `mockCategories`, `mockPaymentMethods` (Cash=1, Credit Card=2, Debit Card=3), `mockPeople` | Standard fixtures |
| `setupExpenseFormMocks()` | Configures the mocked service functions and `global.fetch` (`/api/categories`, `/places`, `/api/people`) |
| `fillBasicFields()` | Fills Date `2025-01-15`, Amount `100`, Type `Other`, Payment Method `1` via `userEvent.setup()`; does not submit |
| `fillBasicFieldsWithValues({ date, amount, type, paymentMethod })` | Same with custom values (all strings) |
| `expandSection(container, sectionName)` | Clicks the `.collapsible-header` containing `sectionName` and waits for `aria-expanded="true"` |
| `selectSinglePerson(index)` / `selectMultiplePeople(indices)` | Selects from the "Assign to people" select (index into `mockPeople`) |
| `waitForAllocationModal()` | Waits for "Allocate Expense Amount" |
| `submitForm()` | Clicks the "Add Expense" button |
| `assertFieldVisible(name)` / `assertFieldHidden(name)` | Looks up by label (`exact: false`), then textbox/combobox/spinbutton role; `Visible` also asserts `toBeVisible()` |
| `assertSubmittedData(mockFn, partial)` | `toHaveBeenCalledWith(expect.objectContaining(partial))` |
| `assertValidationError(textOrRegex)` | Async; `waitFor` + `getByText` |

ExpenseForm's real labels include `Date *`, `Place`, `Type *`, `Amount *`, `Payment Method *`, `Posted Date (optional)`, `Assign to People`, `Original Cost`, `Claim Status` and `Notes` (there is no "Category" or "Insurance Status" label). The submit button is "Add Expense" (or "Update Expense" when editing).

### `MockCollapsibleSection` (`test-utils/componentMocks.jsx`)

Drop-in replacement for `components/shared/CollapsibleSection` that **always renders its children**, so fields inside collapsed sections are queryable. Same props (`title`, `isExpanded`, `onToggle`, `badge`, `hasError`, `helpText`, `className`). The header is `role="button"` with `aria-expanded`, toggles on click / Enter / Space, and exposes `data-testid`s `collapsible-section-<slug>`, `collapsible-header-<slug>`, `collapsible-content-<slug>`, `section-badge` and `section-error-indicator` (`<slug>` = lower-cased title with spaces → `-`).

```javascript
// From ExpenseForm.sections.test.jsx (components/expenses/)
import { MockCollapsibleSection } from '../../test-utils/componentMocks';

vi.mock('../shared/CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));
```

Use it when a test is about fields, validation or submission. Use the real component when testing the section's own expand/collapse behaviour (`CollapsibleSection.test.jsx`) or when the test asserts section state (`expandSection`, as in `ExpenseForm.people.test.jsx`).

---

## Patterns

### Queries

Prefer, in order: `getByRole` → `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue` → `getByAltText` → `getByTitle` → `getByTestId` (last resort). Avoid `container.querySelector` on class names.

```javascript
const submit = screen.getByRole('button', { name: /add expense/i });
const amount = screen.getByLabelText(/Amount/i);
```

Use `getBy*` for elements that must already be there, `queryBy*` to assert absence, and `findBy*` (or `waitFor`) for anything that appears after an async update. Never use fixed `setTimeout` sleeps.

### `userEvent` vs `fireEvent`

Use `userEvent` (ideally `const user = userEvent.setup()`) for normal tests — it fires focus/keyboard/input events the way a user would. `fireEvent` is acceptable inside PBT loops with many iterations where `userEvent`'s per-keystroke cost dominates (e.g. `ExpenseForm.pbt.test.jsx`). Always `await` `userEvent` calls.

### Mocking services and `fetch`

Production code must not call `fetch` directly (`scripts/validate-no-raw-fetch.js` enforces this); requests go through `utils/fetchProvider.js` (`getFetchFn`, `authAwareFetch`) via `apiClient` / service modules. In tests, either:

1. **Mock the service module** (preferred for component tests):

   ```javascript
   vi.mock('../../services/expenseApi', () => ({
     createExpense: vi.fn(),
     getPlaces: vi.fn(),
   }));
   ```

2. **Route `fetchProvider` to a mocked `global.fetch`** when you want to assert on URLs/requests:

   ```javascript
   vi.mock('../../utils/fetchProvider', async () => {
     const actual = await vi.importActual('../../utils/fetchProvider');
     return {
       ...actual,
       getFetchFn: () => (...args) => globalThis.fetch(...args),
       authAwareFetch: (...args) => globalThis.fetch(...args),
     };
   });
   global.fetch = vi.fn();
   ```

`vi.mock` calls are hoisted above imports, so their factories cannot reference variables declared in the test file (imports are fine; otherwise use `vi.hoisted`).

### Parameterized instead of PBT for small input sets

If the input space has fewer than ~10 values (a boolean, a handful of trigger keys, the five payment methods), enumerate it with `testEach` rather than `fc.constantFrom(...)` — each case is named in the output, there is no shrinking, and it runs once per case instead of `numRuns` times. Keep PBT for large or unbounded spaces (amounts, dates, strings, operation sequences). See [testing.instructions.md](../../.github/instructions/testing.instructions.md) for the anti-patterns.

### Property-based tests in the frontend

```javascript
/**
 * @invariant <what holds for all inputs, and why randomization adds value>
 */
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';

test('Property 1: ...', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 500000 }), (income) => {
      // assert on real logic, not on mock return values
    }),
    pbtOptions()
  );
});
```

- `pbtOptions(options)` (`src/test/pbtArbitraries.js`) sets `numRuns` with precedence **explicit `numRuns` > `FAST_CHECK_NUM_RUNS` > CI default** (10 in CI, 20 locally), plus `timeout` (30s CI / 15s local), a fixed `seed` (`CI_SEED = 12345`) in CI, `endOnFailure: true` and `verbose` in CI.
- `asyncPbtOptions` raises the timeout (45s / 25s). `uiPbtOptions` raises it further (60s / 30s) and **always** sets `numRuns` to 5 (CI) / 10 (local), so `FAST_CHECK_NUM_RUNS` has no effect on it.
- Many PBT files pass `{ numRuns: N }` explicitly (or a literal options object), which also bypasses `FAST_CHECK_NUM_RUNS` — `npm run test:fast` only speeds up tests that rely on the default.
- When rendering inside a property, call `cleanup()` at the end of each iteration.
- A property that fails on some seeds is a real edge case (often in the test's oracle) — investigate before re-running.

---

## jsdom and Vitest Gotchas

| Problem | Fix |
|---------|-----|
| `Element.prototype.scrollIntoView` is not implemented (e.g. `ExpenseList` pagination calls it) — surfaces as an unhandled error that fails the run | `Element.prototype.scrollIntoView = vi.fn();` in the test file |
| Vitest 5: jsdom `localStorage` / `sessionStorage` are getter-only; `global.sessionStorage = mock` throws `TypeError` | `vi.stubGlobal('sessionStorage', mock)` and `vi.unstubAllGlobals()` in `afterEach` (see `BudgetAlertFlow.integration.test.jsx`) |
| CSS isn't evaluated, so `toBeVisible()` / collapsed sections are unreliable | Use `MockCollapsibleSection`, or assert on `aria-expanded` / presence instead of visibility |
| `getBoundingClientRect()` returns zeros; no layout | Stub it for the test, or test the logic separately |
| `EventSource` missing | Already provided by `vitest.setup.js` |
| `fetch` not stubbed by setup | Mock the service module or `fetchProvider` (above) |
| Month-end date flakiness (e.g. running on the 31st) | Call `date.setDate(1)` before `date.setMonth(...)` when building relative months |
| Passes locally, fails in CI | Re-run with `npx cross-env CI=true npx vitest --run`; CI has retries, `bail: 1`, 2 forks, console suppression and a fixed PBT seed |
| Tests pass alone, fail together | Leaked globals/timers/module state. Restore spies (`vi.restoreAllMocks()`), unstub globals, and use `vi.useRealTimers()` after fake timers. `vi.clearAllMocks()` already runs after each test |
| "act" warnings | `await` every `userEvent` call; wait for async effects with `findBy*` / `waitFor` before the test ends |
| Mock not applied | Check the path is relative to the **test file** (e.g. `../shared/CollapsibleSection` from `components/expenses/`) and that the factory returns the right `default` / named exports |
