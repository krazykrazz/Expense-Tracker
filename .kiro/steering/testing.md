# Testing Conventions

## Backend Testing (Jest 30)

This project uses Jest 30 for backend tests, which has different CLI options than earlier versions.

### Running Specific Tests

**CORRECT (Jest 30):**
```bash
# Filter by test file path pattern
npm test -- --testPathPatterns="pattern"

# Run a specific test file
npm test -- --testPathPatterns="billingCycleHistoryService.effective"

# Run all PBT tests
npm test -- --testPathPatterns="pbt"
```

**WRONG (deprecated in Jest 30):**
```bash
# These will NOT work:
npm test -- --testPathPattern="pattern"  # singular - DEPRECATED
npm test -- --testNamePattern="pattern"  # for test names, not file paths
```

### Key Differences

| Purpose | Jest 29 (old) | Jest 30 (current) |
|---------|---------------|-------------------|
| Filter by file path | `--testPathPattern` | `--testPathPatterns` |
| Filter by test name | `--testNamePattern` | `--testNamePatterns` |

### Common Backend Test Commands

```bash
# Run all backend tests (sequential - for local dev)
npm test

# Run all backend tests (parallel - FASTER, recommended for promote script)
npm run test:parallel

# Run fast tests (reduced PBT iterations, sequential)
npm run test:fast

# Run fast tests (reduced PBT iterations, parallel - FASTEST)
npm run test:fast:parallel

# Run only unit tests (no PBT, sequential)
npm run test:unit

# Run only unit tests (no PBT, parallel)
npm run test:unit:parallel

# Run only PBT tests (sequential)
npm run test:pbt

# Run only PBT tests (parallel)
npm run test:pbt:parallel

# Run specific test file
npm test -- --testPathPatterns="serviceName"

# Run tests with verbose output
npm test -- --testPathPatterns="serviceName" --verbose
```

**Parallel vs Sequential:**
- **Sequential (`--runInBand`)**: Tests run one at a time. Slower but easier to debug.
- **Parallel (`--maxWorkers=50%`)**: Tests run in parallel using 50% of CPU cores. Much faster (3-5x speedup).
- Each Jest worker gets its own isolated database file (`test-expenses-worker-N.db`).
- Use parallel tests in the promote script for faster feedback.
- Use sequential tests when debugging specific test failures.

Note: Local test commands use `--runInBand` (sequential) for simplicity.
CI commands (`test:unit:ci`, `test:pbt:ci`) run in parallel with per-worker database isolation.

### Working Directory

Always run backend tests from the `backend` directory:
```bash
# Using cwd parameter (preferred)
cwd: backend
command: npm test -- --testPathPatterns="pattern"
```

## Frontend Testing (Vitest)

The frontend uses Vitest with @testing-library/react and fast-check for property-based tests.

### Common Frontend Test Commands

```bash
# Run all frontend tests (single run, default parallelism)
npm test

# Run all frontend tests (explicit parallel with 50% CPU cores - FASTER)
npm run test:parallel

# Run tests in watch mode
npm run test:watch

# Run only changed tests
npm run test:changed

# Run fast tests (reduced PBT iterations)
npm run test:fast

# Run fast tests (reduced PBT iterations, parallel - FASTEST)
npm run test:fast:parallel
```

**Parallel Execution:**
- **Default (`npm test`)**: Vitest automatically uses parallel execution in local dev (sequential in CI)
- **Explicit parallel (`test:parallel`)**: Forces parallel execution with 50% of CPU cores
- Vitest uses worker pools (forks) to isolate tests
- Each worker gets its own jsdom environment
- Much faster than sequential execution (2-4x speedup)

### CRITICAL: Frontend Test Command Rules

**WRONG** ❌ - This causes "duplicate --run flag" error:
```bash
npm test -- --run ExpenseForm
npm test -- ExpenseForm
```

**CORRECT** ✅ - Use npx vitest directly:
```bash
npx vitest --run ExpenseForm
npx vitest --run BillingCycleHistoryForm
npx vitest --run "PaymentMethodForm|LoanPaymentForm"
```

**Why:** The `npm test` script in package.json already includes `--run`, so passing it again or using `npm test --` with a pattern causes the duplicate flag error. Always use `npx vitest --run` for specific test patterns.

### Working Directory

Always run frontend tests from the `frontend` directory:
```bash
cwd: frontend
command: npm test
```

### Frontend Test Stack
- **Vitest**: Test runner (configured in `vitest.config.js`)
- **@testing-library/react**: Component rendering and interaction
- **@testing-library/jest-dom**: DOM assertion matchers
- **jsdom**: Browser environment simulation
- **fast-check**: Property-based testing

## Parallel Testing Strategy

Both backend and frontend support parallel test execution for faster feedback:

### When to Use Parallel Tests

| Scenario | Backend Command | Frontend Command | Expected Speedup |
|----------|----------------|------------------|------------------|
| **Promote script** | `npm run test:parallel` | `npm run test:parallel` | 3-5x faster |
| **Quick feedback** | `npm run test:fast:parallel` | `npm run test:fast:parallel` | 5-8x faster |
| **Development** | `npm test` | `npm test` | Default (varies) |
| **Debugging** | `npm test` | `npm test` | Sequential (easier) |

### How Parallel Execution Works

**Backend (Jest):**
- Each worker gets isolated database: `test-expenses-worker-N.db`
- Workers run in separate processes
- `--maxWorkers=50%` uses half of CPU cores

**Frontend (Vitest):**
- Each worker gets isolated jsdom environment
- Workers run in forked processes
- Automatic parallelism in local dev, sequential in CI

### Performance Tips

1. **Use parallel tests in promote script** - Already configured for maximum speed
2. **Use fast+parallel for development** - Reduced PBT iterations + parallel execution
3. **Use sequential for debugging** - Easier to trace issues when tests run one at a time
4. **CI uses optimized settings** - Sequential with retries for stability

### ExpenseForm Test Organization

The ExpenseForm tests are split into focused files for better organization and parallel execution:

- **ExpenseForm.core.test.jsx** (13 tests) - Basic rendering, submission, validation, form reset, default values
- **ExpenseForm.sections.test.jsx** (23 tests) - Collapsible sections, badges, tooltips, section-specific behavior
- **ExpenseForm.people.test.jsx** (6 tests) - People assignment for medical expenses
- **ExpenseForm.futureMonths.test.jsx** (7 tests) - Future months recurring feature
- **ExpenseForm.dataPreservation.test.jsx** (5 tests) - Data persistence during collapse/expand
- **ExpenseForm.pbt.test.jsx** - Property-based tests (existing)
- **ExpenseForm.editMode.test.jsx** - Edit mode behavior (existing)
- **ExpenseForm.invoice.test.jsx** - Invoice upload integration (existing)
- **ExpenseForm.accessibility.test.jsx** - Accessibility features (existing)

#### Running Specific Test Groups

```bash
# Run only core tests (basic functionality)
npm run test:core

# Run only section tests (collapsible sections)
npm run test:sections

# Run only people assignment tests
npm run test:people

# Run only future months tests
npm run test:futureMonths

# Run only data preservation tests
npm run test:dataPreservation

# Run all ExpenseForm tests (all categories)
npx vitest --run ExpenseForm

# Run fast tests (reduced PBT iterations)
npm run test:fast

# Run only changed tests
npm run test:changed
```

#### When to Run Each Test Category

- **During form UI changes**: Run `test:core` and `test:sections`
- **During people feature work**: Run `test:people`
- **During future months feature work**: Run `test:futureMonths`
- **During section collapse/expand work**: Run `test:dataPreservation`
- **Before committing**: Run all tests with `npm test`
- **Quick feedback loop**: Use `npm run test:changed` or `npm run test:fast`

## Test Utilities

### Frontend (`frontend/src/test-utils/`)
Shared modules for reducing test boilerplate. Import from the unified index:
```javascript
import { safeDate, createModalWrapper, waitForState, testEach } from '../test-utils';
```

- `arbitraries.js` — fast-check generators: `safeDate`, `expenseRecord`, `paymentMethod`, `modalOperationSequence`, etc.
- `wrappers.jsx` — provider factories: `createFilterWrapper`, `createModalWrapper`, `wrapperBuilder()`, etc.
- `assertions.js` — async helpers: `waitForState`, `assertSequenceResult`, `assertAllModalsClosed`, etc.
- `mocks.js` — API mock factories: `createExpenseApiMock`, `createCallTracker`, etc.
- `parameterized.js` — `testEach` for parameterized test cases

See `docs/development/FRONTEND_TESTING_GUIDELINES.md` for full API reference and migration guide.

### Backend (`backend/test/`)
- `pbtArbitraries.js` — shared PBT arbitraries for backend services

## Parameterized Tests
Use `testEach` from `test-utils/parameterized.js` when a test covers a finite, enumerable set of inputs:
```javascript
import { testEach } from '../test-utils';

testEach([
  { input: 'click', expected: true, description: 'click trigger' },
  { input: 'Enter', expected: true, description: 'Enter key' },
]).test('calls handler via $description', ({ input, expected }) => {
  // test logic
});
```

Prefer parameterized tests over PBT when the input space is small and fully enumerable.
