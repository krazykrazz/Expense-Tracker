---
inclusion: fileMatch
fileMatchPattern: '**/*.test.*,**/*.pbt.test.*,**/test-utils/**'
---

# Testing Rules

For detailed guidance on when to use each test type, anti-patterns, and high-value PBT patterns, see [TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## Critical: Test Runner Differences

- **Backend**: Jest 30, run from `backend/` directory
  - Use `--testPathPatterns` (plural, not `--testPathPattern`)
  - Example: `cd backend && npx jest --testPathPatterns fixedExpenseService.test`
- **Frontend**: Vitest, run from `frontend/` directory
  - Use `npx vitest --run <pattern>` (NOT `npm test -- <pattern>`)
  - Example: `cd frontend && npx vitest --run SettingsModal`

## Test Types and Naming Conventions

- **Unit tests**: `*.test.js` / `*.test.jsx` — Fast, isolated, mocked dependencies. Deterministic logic with known inputs.
- **Integration tests**: `*.integration.test.js` — Real SQLite database, full stack through service layer. Service → repository → database interactions.
- **PBT tests**: `*.pbt.test.js` / `*.pbt.test.jsx` — Property-based tests using fast-check. Only for invariant-based logic where randomized inputs provide value beyond fixed examples (financial math, date boundaries, SQL edge cases, round-trip properties).

All new test files must use the explicit naming convention. Plain `*.test.*` is permitted for existing tests that have not yet been renamed.

## PBT Rules

- Every PBT file must have an `@invariant` comment block within the first 30 lines
- PBT files must use `fast-check` generators — never `Math.random()`
- Use `dbPbtOptions()` for database-backed PBT, `pbtOptions()` for pure logic
- PBT files should not exceed 48% of total test files (configured in `test-budget.json`)
- PBT tests can be slow. Use `$env:FAST_PBT="true"` for reduced iterations during development

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

## Full Suite Test Runs

When running the full frontend and backend test suites together (e.g., spec checkpoint tasks, verifying a fix, pre-deployment validation), always use the test summary script:

```powershell
.\scripts\run-test-summary.ps1
```

This runs both suites, preserves raw output to `test-results/`, and prints a consolidated pass/fail summary with inline failure details. Do NOT run `cd backend && npm test` and `cd frontend && npx vitest --run` separately for full-suite validation — use the script so results are archived and comparable.

## CI Enforcement Scripts

These scripts run in CI and reject PRs on violation:

- `scripts/validate-test-naming.js` — enforces `*.test.*`, `*.integration.test.*`, `*.pbt.test.*` naming
- `scripts/validate-no-raw-fetch.js` — blocks bare `fetch()` in frontend source (must use `authAwareFetch` / `apiClient`)
- `scripts/validate-pbt-guardrails.js` — enforces `@invariant` comments, PBT percentage threshold, no direct DB imports in unit tests
- `scripts/check-test-budget.js` — enforces per-job runtime budgets from `test-budget.json`
- `scripts/__tests__/ci-consistency.test.js` — validates CI workflow stays in sync with test-budget and enforcement scripts

## Key Gotchas

- Backend services that import `activityLogService` need `jest.mock('./activityLogService')` in unit tests
- Frontend tests must use the custom `render` from `test-utils/index.js` (wraps with providers)
- Mock `fetch` globally in frontend tests — Vitest doesn't provide it by default
- Integration tests may hit SQLITE_BUSY or EBUSY errors under parallel load — these are pre-existing and not test failures
