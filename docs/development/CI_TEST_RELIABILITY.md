# CI Test Reliability

How the test suites behave differently in CI, the helpers that keep them deterministic, and how to run them in parallel locally. For the CI jobs, budgets and pipeline troubleshooting see [GitHub Actions CI/CD](./GITHUB_ACTIONS_CICD.md); for test types, naming and everyday commands see [Testing Rules](../../.github/instructions/testing.instructions.md).

## CI Mode

CI mode is on when `CI=true` or `GITHUB_ACTIONS=true`. It is detected separately in `backend/jest.setup.js`, `frontend/vitest.config.js`, `frontend/vitest.setup.js` and both `pbtArbitraries.js` files.

| Setting | Local | CI | Defined in |
|---------|-------|----|------------|
| Backend test timeout | 30s | 45s | `backend/jest.setup.js` |
| Backend retries | none | `jest.retryTimes(2, { logErrorsBeforeRetry: true })` | `backend/jest.setup.js` |
| Frontend `testTimeout` / `hookTimeout` | 30s / 20s | 45s / 30s | `frontend/vitest.config.js` |
| Frontend `retry` | 0 | 2 | `frontend/vitest.config.js` |
| Frontend `bail` | 0 | 1 | `frontend/vitest.config.js` |
| Frontend reporter | `default` | `verbose` | `frontend/vitest.config.js` |
| PBT seed (`pbtOptions` family only) | random | `12345` (`CI_SEED`) | `pbtArbitraries.js` |
| PBT default `numRuns` | higher | lower | `pbtArbitraries.js` (see below) |
| `console.log` / `console.warn` | backend: suppressed under `NODE_ENV=test`; frontend: shown | suppressed (`console.error` is kept) | `jest.setup.js`, `vitest.setup.js` |

Consequences:

- Retries can hide intermittent failures in CI; a test that only passes on retry is still flaky.
- Frontend `bail: 1` stops the run after the first failing file, so one reported failure can hide others with the same cause.
- Validate with CI settings before pushing:
  ```bash
  cd backend && npm run test:unit:ci          # or test:pbt:ci / test:backup:ci / test:ci
  cd frontend && npx cross-env CI=true npx vitest --run
  ```

## PBT Helpers

`backend/test/pbtArbitraries.js` (CommonJS) and `frontend/src/test/pbtArbitraries.js` (ESM) provide CI-aware fast-check options and edge-case-safe arbitraries.

### Options

| Helper | `numRuns` local / CI | `timeout` local / CI |
|--------|----------------------|----------------------|
| Backend `pbtOptions()` | 50 / 25 | 15s / 30s |
| Backend `asyncPbtOptions()` | 50 / 25 | 25s / 45s |
| Backend `dbPbtOptions()` | 15 / 10 (3 with `FAST_PBT=true`) | 60s / 90s |
| Frontend `pbtOptions()` | 20 / 10 | 15s / 30s |
| Frontend `asyncPbtOptions()` | 20 / 10 | 25s / 45s |
| Frontend `uiPbtOptions()` | 10 / 5 | 30s / 60s |

- `numRuns` precedence: explicit `numRuns` option > `FAST_CHECK_NUM_RUNS` > the defaults above. `uiPbtOptions()` sets `numRuns` explicitly, so it ignores `FAST_CHECK_NUM_RUNS`.
- The backend PBT shards set `FAST_CHECK_NUM_RUNS=15`; the frontend CI job does not set it.
- All helpers set `endOnFailure: true` and, in CI, `verbose: true`.
- Tests that pass a literal options object (e.g. `{ numRuns: 100 }`) instead of a helper get neither the CI seed nor the CI timeouts.

```javascript
// Backend
const { safeDate, safeAmount, pbtOptions } = require('../test/pbtArbitraries');

await fc.assert(
  fc.asyncProperty(safeDate(), safeAmount(), async (date, amount) => {
    // test logic
  }),
  pbtOptions()
);

// Frontend
import { safeDate, safeAmount, pbtOptions } from '../test/pbtArbitraries';
```

### Arbitraries

- Both: `safeDate()` (`YYYY-MM-DD` strings, default range 2020-01-01 to 2025-12-31), `safeDateObject()`, `safeAmount()`, `safeIntAmount()`, `safeString()` (non-empty, trimmed), `safePlaceName()`, `expenseType`, `taxDeductibleType`, `paymentMethod`, `weekNumber`, `monthNumber`, `year()`
- Backend only: `safeISODate()`, `safeFilename()`, `nonTaxDeductibleType`, `safeExpense()`, `safeExpenseWithId()`, anomaly/budget generators (`arbExpenseDataset`, `arbAnomalyArray`, `arbBudgetData`, `arbCategoryBaseline`) and `calculatePreviousCycleDates()`
- Frontend only: `safeExpenseFormData()`

`safeAmount()` wraps `fc.float()` and filters out NaN, Infinity and values ≤ 0, but produces **full-precision** floats, not 2-decimal money. An oracle compared against code that rounds money must round the same way (e.g. `Math.round(x * 100) / 100`).

## Frontend Test Cleanup

`frontend/vitest.setup.js` runs after each test: `vi.clearAllTimers()`, `vi.clearAllMocks()` and a reset of the global `MockEventSource` (jsdom has no `EventSource`). After all tests in a file it calls `vi.useRealTimers()`. Fake timers are not enabled globally.

Components should still clear their own timers on unmount — a callback firing after the environment is torn down surfaces as an unhandled error, which fails the Vitest run even when every test passed.

## Best Practices

### Writing Reliable PBT Tests

1. **Use safe arbitraries:**
   ```javascript
   // Bad - can generate invalid dates
   fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
   
   // Good - handles edge cases
   safeDate({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
   ```

2. **Use pbtOptions() for configuration:**
   ```javascript
   // Bad - hardcoded values
   { numRuns: 20, timeout: 15000 }
   
   // Good - CI-aware configuration
   pbtOptions({ numRuns: 20 })
   ```

3. **Filter problematic values:**
   ```javascript
   // If you need custom arbitraries, always filter edge cases
   // (fast-check requires 32-bit float bounds, hence Math.fround)
   fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true })
     .filter(n => !isNaN(n) && isFinite(n) && n > 0)
   ```

### Writing Reliable React Tests

1. **Clean up timers in components:**
   ```javascript
   useEffect(() => {
     const timeoutId = setTimeout(() => { ... }, 1000);
     return () => clearTimeout(timeoutId);
   }, []);
   ```

2. **Use fake timers for timing-sensitive tests:**
   ```javascript
   beforeEach(() => {
     vi.useFakeTimers();
   });
   
   afterEach(() => {
     vi.useRealTimers();
   });
   ```

3. **Wait for async operations:**
   ```javascript
   await waitFor(() => {
     expect(screen.getByText('Success')).toBeInTheDocument();
   });
   ```

4. **Stub what jsdom lacks:** `Element.prototype.scrollIntoView` (e.g. pagination) and, under Vitest 5, `localStorage`/`sessionStorage` via `vi.stubGlobal(...)` + `vi.unstubAllGlobals()` rather than assignment.

### Debugging CI Failures

1. **Reproduce with CI settings** (see [CI Mode](#ci-mode)). For backend PBT also set `FAST_CHECK_NUM_RUNS=15`, as the shards do.
2. **Replay the counterexample:** a fast-check failure prints the `seed` and `path` that produced it. Pass them to `fc.assert(..., { seed, path })` (or `pbtOptions({ seed, path })`) to replay the exact case. Tests using the `pbtOptions` family always run with seed `12345` in CI.
3. **Treat seed-dependent failures as real:** a property that fails on some seeds is an edge case (often in the test's oracle), not a flake.
4. **Look for "Unhandled Errors"** in Vitest output — they fail the run with all tests passing.

## Test Database Isolation

- `backend/jest.globalSetup.js` wipes and recreates `backend/.test-config/` at the start of every run and points `CONFIG_DIR` at it, so tests never touch real data.
- Under `NODE_ENV=test`, `database/db.js` gives each Jest worker its own SQLite file, `test-expenses-worker-<JEST_WORKER_ID>.db`. `jest.setup.js` initialises it in `beforeAll` and closes it in `afterAll`; each test cleans up its own rows.
- Suites that need real files (backup tests) set `SKIP_TEST_DB=true` and must run serially (`--runInBand`).

## Parallel Execution

### Local scripts

| Directory | Script | Mode |
|-----------|--------|------|
| `backend` | `npm test`, `test:unit`, `test:pbt`, `test:fast`, `test:backup` | `--runInBand` (serial) |
| `backend` | `test:parallel`, `test:unit:parallel`, `test:pbt:parallel`, `test:fast:parallel` | `--maxWorkers=75%` |
| `frontend` | `npm test` (`vitest --run`), `test:fast` | `forks` pool, Vitest's default worker count |
| `frontend` | `test:parallel`, `test:fast:parallel` | adds `--pool=forks --poolOptions.forks.maxForks=75%` (see [Known Issues](#known-issues)) |

`test:fast*` set `FAST_CHECK_NUM_RUNS=10`. For routine backend validation use `npm run test:unit:parallel` followed by `npm run test:backup:ci`; `test:parallel` also runs the backup suites in parallel.

`scripts/promote-feature.ps1` runs `npm run test:parallel` in `frontend/` and `backend/` unless `-SkipTests` is passed. `scripts/run-test-summary.ps1` runs backend non-integration suites with `--maxWorkers=75%` and `integration|backupService` suites with `--runInBand`.

### In CI

- Backend unit tests: one job, Jest's default worker count, backup suites excluded
- Backend PBT: three `--shard` jobs on separate runners, each with parallel workers; shard 1 then runs the backup suites serially
- Frontend: one job, `forks` pool

Races happen between Jest workers inside one job, not between shards. To reproduce a per-worker database race locally, run the affected files with `--maxWorkers=2` rather than the shard command.

## Known Issues

- `frontend/vitest.config.js` sets `poolOptions.forks.maxForks` (2 in CI). Vitest 4 removed `test.poolOptions` and the installed Vitest 5 only logs a deprecation for it, so the 2-fork CI cap is not applied. The `--poolOptions.forks.maxForks=75%` flag in the frontend `test:parallel` scripts relies on the same removed option.

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/jest.globalSetup.js` | Creates the isolated `backend/.test-config/` tree |
| `backend/jest.setup.js` | CI detection, timeout, retries, per-worker test DB lifecycle, console suppression |
| `backend/test/pbtArbitraries.js` | Backend PBT options and arbitraries |
| `backend/test/testConstants.js` | Shared backend test constants |
| `frontend/vitest.config.js` | CI timeouts, retries, bail, reporter, pool |
| `frontend/vitest.setup.js` | Cleanup, `EventSource` mock, CI console suppression |
| `frontend/src/test/pbtArbitraries.js` | Frontend PBT options and arbitraries |

## Environment Variables

| Variable | Effect |
|----------|--------|
| `CI=true` / `GITHUB_ACTIONS=true` | CI mode (see [CI Mode](#ci-mode)) |
| `NODE_ENV=test` | Backend test mode: per-worker test database, console suppression. Set by the backend npm scripts |
| `FAST_CHECK_NUM_RUNS` | Overrides default PBT `numRuns` (not explicit ones) |
| `FAST_PBT=true` | Backend only: `dbPbtOptions()` default drops to 3 runs |
| `SKIP_TEST_DB=true` | Backend: skip the per-worker test database for suites that use real files |
