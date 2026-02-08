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

# Run fast tests (reduced PBT iterations)
npm run test:fast

# Run only unit tests (no PBT)
npm run test:unit

# Run only PBT tests
npm run test:pbt

# Run specific test file
npm test -- --testPathPatterns="serviceName"

# Run tests with verbose output
npm test -- --testPathPatterns="serviceName" --verbose
```

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
# Run all frontend tests (single run)
npm test

# Run specific test file
npx vitest --run src/components/ExpenseForm.test.jsx

# Run tests matching a pattern
npx vitest --run --reporter=verbose "pattern"
```

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
