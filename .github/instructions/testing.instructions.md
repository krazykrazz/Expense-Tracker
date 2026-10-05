---
description: "Use when writing, running, or debugging tests: Jest (backend), Vitest (frontend), fast-check property-based tests, test naming, PBT guardrails, flaky tests."
applyTo: "**/*.test.*,**/test-utils/**,backend/test/**,frontend/src/test/**"
---
# Testing Rules

Details: `docs/development/FRONTEND_TESTING_GUIDELINES.md`, `docs/development/CI_TEST_RELIABILITY.md`.

## Running Tests

- Backend (Jest, from `backend/`): always use npm scripts — never bare `npx jest` (it skips `NODE_ENV=test`/`--runInBand` and suites fail randomly on the shared test DB).
  - Fast validation: `npm run test:unit:parallel` then `npm run test:backup:ci`
  - One file: `npm test -- --testPathPatterns <name>` (plural flag)
  - `npm test` runs everything including PBT serially (very slow); CI's 3 PBT shards are the authoritative PBT signal
- Frontend (Vitest, from `frontend/`): `npx vitest --run <pattern>`. Before pushing, validate with CI settings: `npx cross-env CI=true npx vitest --run`.
- Full suites together: `.\scripts\run-test-summary.ps1` (writes `test-failure-summary.txt` and raw output files, gitignored).

## Choosing a Test Type

| Scenario | Type | Naming |
|---|---|---|
| Deterministic logic, mocked dependencies, rendering with fixed props | Unit | `*.test.js(x)` |
| Service → repository → real SQLite, activity-log verification | Integration | `*.integration.test.js` |
| Invariant over large/unbounded inputs (money, dates, SQL NULL patterns, round-trips) | PBT | `*.pbt.test.js(x)` |
| Small enumerable inputs (< ~10 values) | Parameterized unit | `testEach` (frontend) / `test.each` (Jest) |

Don't write PBT over mocked return values, booleans/tiny enums, or random props just to check the DOM.

## PBT Rules (enforced by `scripts/validate-pbt-guardrails.js`)

- `@invariant` or `Invariant:` comment in the first 30 lines, stating the invariant and why randomization helps.
- PBT files ≤ 48% of all test files.
- Unit tests must not import `database/db` directly unless they `jest.mock` it.
- Use the options helpers: backend `dbPbtOptions()` / `pbtOptions()` / `asyncPbtOptions()` (`backend/test/pbtArbitraries.js`); frontend `pbtOptions()` / `asyncPbtOptions()` / `uiPbtOptions()` (`frontend/src/test/pbtArbitraries.js`). `numRuns` precedence: explicit option > `FAST_CHECK_NUM_RUNS` > default.
- Generate inputs with fast-check, not `Math.random()`.
- Backend `safeAmount` yields full-precision floats; oracles must round money exactly like the code under test. A property failing on some seeds is a real edge case, not a flake.

## Gotchas

- Backend services importing `activityLogService` need `jest.mock('./activityLogService')` in unit tests.
- `jest.globalSetup.js` redirects `CONFIG_DIR` to `backend/.test-config/`; each Jest worker gets its own test DB. Backup suites set `SKIP_TEST_DB=true`.
- Vitest 5: jsdom `localStorage`/`sessionStorage` are getter-only — use `vi.stubGlobal` + `vi.unstubAllGlobals()`.
- jsdom lacks `Element.prototype.scrollIntoView` — stub it when pagination/scrolling runs.
- Vitest exits non-zero on unhandled errors even when all tests pass — check the exit code.
- Date helpers: call `setDate(1)` before `setMonth()` to avoid month-end overflow; avoid comparing "current month" data on the 1st (end-exclusive windows).
- Frontend tests needing context: `render`/`renderHook` from `@testing-library/react` with a wrapper from `test-utils/wrappers.jsx`. Mock service modules rather than `fetch`.
