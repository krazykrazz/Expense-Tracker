---
inclusion: fileMatch
fileMatchPattern: 'scripts/**,*.test.*,.github/**'
---

# CI Enforcement Scripts

These scripts run in CI (via `.github/workflows/ci.yml`) and block PRs on violation. They also have their own test coverage in `scripts/__tests__/`.

## Scripts

### validate-test-naming.js
Enforces naming conventions: `*.test.*` (transition), `*.unit.test.*`, `*.integration.test.*`, `*.pbt.test.*`. Scans `backend/` and `frontend/src/`.

### validate-no-raw-fetch.js
Blocks bare `fetch()` calls in frontend source files. All fetch must go through `authAwareFetch`, `getFetchFn()`, or `apiClient`. Exemptions: `authApi.js`, `fetchProvider.js`, test files.

### validate-pbt-guardrails.js
Enforces three rules:
1. Every `*.pbt.test.*` file must have `@invariant` or `Invariant:` comment in first 30 lines
2. PBT files must not exceed the percentage threshold in `test-budget.json` (currently 48%)
3. Unit test files must not import `database/db` directly (use mocks or rename to `*.integration.test.*`)

### check-test-budget.js
Compares actual CI job runtime against budgets in `test-budget.json`. Override with `[skip-budget]` in commit message.

### ci-consistency.test.js
Validates that CI workflow YAML stays in sync with `test-budget.json` job names and that enforcement scripts are wired into CI.

## test-budget.json

Central config at repo root. Contains:
- `pbtPercentageThreshold`: max PBT percentage (used by validate-pbt-guardrails)
- `budgets`: per-job runtime limits in seconds (used by check-test-budget)
- `overridePattern`: regex for commit message override (default: `[skip-budget]`)

## Adding New Enforcement

1. Create script in `scripts/` with `process.exit(1)` on failure
2. Add a CI step in `.github/workflows/ci.yml`
3. Add test coverage in `scripts/__tests__/`
4. Update `ci-consistency.test.js` if the script references `test-budget.json`
