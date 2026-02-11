# Testing Rules

## Critical: Test Runner Differences

- **Backend**: Jest 30, run from `backend/` directory
  - Use `--testPathPatterns` (plural, not `--testPathPattern`)
  - Example: `cd backend && npx jest --testPathPatterns fixedExpenseService.test`
- **Frontend**: Vitest, run from `frontend/` directory
  - Use `npx vitest --run <pattern>` (NOT `npm test -- <pattern>`)
  - Example: `cd frontend && npx vitest --run SettingsModal`

## Test Types

- **Unit tests**: `*.test.js` / `*.test.jsx` — Fast, isolated, mocked dependencies
- **PBT tests**: `*.pbt.test.js` / `*.pbt.test.jsx` — Property-based tests using fast-check
- **Integration tests**: `*.integration.test.js` — Real database, full stack through service layer

## PBT Speed

PBT tests can be slow. Use `$env:FAST_PBT="true"` for reduced iterations during development.

## Backend Test Database

Integration tests use real SQLite databases (created per test via `dbHelper.js`). Unit tests mock repositories. The `jest.setup.js` configures global test timeout and cleanup.

## Frontend Test Utilities

- `frontend/src/test-utils/index.js` — Custom render with providers
- `frontend/src/test-utils/expenseFormHelpers.js` — ExpenseForm-specific helpers
- `frontend/src/test-utils/componentMocks.jsx` — Shared component mocks
- `frontend/src/test-utils/arbitraries.js` — PBT arbitrary generators

## Running Tests

```bash
# Backend - all tests
cd backend && npm test

# Backend - specific test
cd backend && npx jest --testPathPatterns "fixedExpenseService.test"

# Backend - PBT only
cd backend && npm run test:pbt

# Frontend - all tests
cd frontend && npx vitest --run

# Frontend - specific test
cd frontend && npx vitest --run SettingsModal

# Frontend - PBT only
cd frontend && npx vitest --run --testPathPattern pbt
```

## Parallel Testing

Backend supports parallel execution: `cd backend && npm run test:parallel`

This splits tests across workers for faster CI runs. See `docs/development/PARALLEL_TEST_EXECUTION.md` for details.

## Key Gotchas

- Backend services that import `activityLogService` need `jest.mock('./activityLogService')` in unit tests
- Frontend tests must use the custom `render` from `test-utils/index.js` (wraps with providers)
- Mock `fetch` globally in frontend tests — Vitest doesn't provide it by default
- Integration tests may hit SQLITE_BUSY or EBUSY errors under parallel load — these are pre-existing and not test failures
