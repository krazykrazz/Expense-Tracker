# Codebase Quality Remediation

> **Spec format:** Single-document spec (requirements + design + tasks combined). One file per feature.
> **Source:** Full-codebase audit performed 2026-09-04 using the `expense-tracker-audit` skill.
> **Status:** Phase 0 complete (R1–R3). Phase 1 not started.

## Introduction

This spec captures the findings of a full backend + frontend audit of the Expense Tracker
and converts them into an execution-ready, trackable backlog. Every finding below was
**verified by reading the cited source file** — subagent-reported findings that could not
be reproduced were dropped (see [Rejected Findings](#rejected-findings-do-not-re-log)).

The codebase is mature and well-tested (property-based tests on both layers, strong
security baseline, correct date/money handling). The debt is concentrated in four places:

1. **Missing lint guardrails** — there is no ESLint or Prettier config anywhere in the
   repo. This is the root cause that allowed items 3, 7, 8, and 13 to accumulate silently.
2. **Frontend resilience & accessibility** — no error boundary exists, and only 4 of 25
   modals have correct dialog semantics.
3. **Backend correctness infrastructure that exists but is unused** — `asyncHandler` has
   zero adopters; two rival transaction helpers each have exactly one adopter.
4. **Analytics query performance** — two services still load the full `expenses` table
   into memory, one of them inside a loop.

### Scope

- **In scope:** Backend (`backend/`), frontend (`frontend/src/`), repo tooling.
- **Out of scope:** Architecture changes (the modular monolith stays), new infrastructure
  (no Postgres, queues, or microservices), TypeScript migration, feature work.

### Delivery Guardrails

- One requirement per PR unless two are explicitly paired below.
- Preserve public APIs and observable behavior unless a requirement states otherwise.
- Run the narrowest validation available after each slice; run
  `scripts/run-test-summary.ps1` before closing a phase.
- If new debt is discovered mid-task, record it in this spec rather than broadening the PR.

---

## Glossary

- **`asyncHandler`** — `backend/middleware/errorHandler.js#L31`. Wraps an async route
  handler and forwards rejections to `next()`. Currently **unused**.
- **`errorHandler`** — `backend/middleware/errorHandler.js#L7`. Centralized Express error
  middleware, registered at `backend/server.js#L239`.
- **`withTransaction(db, fn)`** — `backend/database/db.js#L408`. Transaction helper that
  passes a transaction-scoped db to the callback. Used only by `expenseService`.
- **`runInTransaction(fn)`** — `backend/utils/dbHelper.js#L165`. Second, functionally
  overlapping transaction helper that passes `{run, get, all}` promisified wrappers.
  Used only by `creditCardPaymentService`.
- **UxConsistency PBT guardrails** — `frontend/src/components/shared/UxConsistency.*.pbt.test.jsx`
  (9 files). Property-based tests asserting modal overlay, modal width, z-index, button
  hierarchy, and form-input consistency. **Any new shared `Modal` must satisfy these.**
- **`frontend/src/utils/logger.js`** — existing structured frontend logger, currently
  bypassed by 36 raw `console.error` calls in production components.
- **`backend/config/logger.js`** — backend structured logger. Already used consistently;
  no `console.*` leakage found in backend production code.

---

## Current-State Map (verified ground truth)

### Backend

| Fact | Evidence | Verified |
|---|---|---|
| `asyncHandler` adopters | 0 matches across all 25 files in `backend/controllers/` | ✅ |
| Hand-rolled 500 responses | 141 `res.status(500).json(...)` across 25 controllers | ✅ |
| `withTransaction` adopters | 1 service, 2 call sites (`expenseService.js#L394`, `#L620`) | ✅ |
| `runInTransaction` adopters | 1 service (`creditCardPaymentService.js`) | ✅ |
| Raw `BEGIN TRANSACTION` in repo layer | `expensePeopleRepository.js#L17` | ✅ |
| Unbounded `expenseRepository.findAll()` | 2 sites: `anomalyDetectionService.js#L132`, `predictionService.js#L308` | ✅ |
| Non-awaited `logEvent` without `.catch()` | ~15 sites across 6 services + `authController` | ✅ |
| SQL string interpolation | `expenseRepository.js#L885`, `#L902` (`${months}`) | ✅ |
| `console.*` in backend prod code | 0 (scripts only, which is acceptable) | ✅ |
| Date clamping correctness | `autoPaymentLoggerService` clamps correctly | ✅ correct |

Largest backend source files (lines, excluding tests):

| Lines | File |
|---|---|
| 3248 | `backend/services/anomalyDetectionService.js` |
| 1205 | `backend/repositories/expenseRepository.js` |
| 1037 | `backend/services/backupService.js` |
| 1018 | `backend/controllers/billingCycleController.js` |
| 970 | `backend/services/invoiceService.js` |
| 941 | `backend/services/expenseService.js` |

### Frontend

| Fact | Evidence | Verified |
|---|---|---|
| Modal overlays | 25 sites across 18 files | ✅ |
| Modals with `role="dialog"` + `aria-modal` | 4 (`ConfirmDialog`, `VersionUpgradeModal`, `InvoiceIndicator`, `InvoicePDFViewer`) | ✅ |
| Modals with Escape-to-close | 6 components handle `'Escape'` | ✅ |
| Body scroll lock | **0** occurrences of `body.style.overflow` repo-wide | ✅ |
| Error boundaries | **0** — no `componentDidCatch` / `getDerivedStateFromError` anywhere | ✅ |
| `console.*` in prod components/contexts | 36 (33 `console.error`, 2 `console.warn`, 0 `console.log`) | ✅ |
| Index-based list keys | 20 occurrences across 13 files | ✅ |
| Raw `fetch()` in components | 0 — API layer is clean, enforced by `scripts/validate-no-raw-fetch.js` | ✅ correct |
| Routing | None — single page with context-driven modal overlays | ✅ |

Largest frontend source files:

| Lines | `useState` | File |
|---|---|---|
| 1647 | 24 | `frontend/src/components/loans/LoanDetailView.jsx` |
| 1621 | 22 | `frontend/src/components/expenses/ExpenseForm.jsx` |
| 1593 | 19 | `frontend/src/components/tax/TaxDeductible.jsx` |
| 1441 | 28 | `frontend/src/components/system/BackupSettings.jsx` |
| 1194 | 17 | `frontend/src/components/expenses/ExpenseList.jsx` |
| 1149 | **40** | `frontend/src/components/financial/FinancialOverviewModal.jsx` |
| 987 | 29 | `frontend/src/components/financial/FixedExpensesModal.jsx` |
| 977 | 18 | `frontend/src/components/financial/SummaryPanel.jsx` |

### Tooling

| Fact | Evidence |
|---|---|
| ESLint config | **None** — no `.eslintrc*` or `eslint.config.*` anywhere |
| Prettier config | **None** |
| `lint` script | Absent from all three `package.json` files |
| Version drift | root `1.6.0` vs frontend `1.10.0` vs backend `1.10.0` |
| Untracked-worthy artifacts committed | `test-backend-raw.txt`, `test-frontend-raw.txt`, `test-failure-summary.txt`, `frontend/test-results*.txt`, `frontend/vitest-output.txt`, `backend/test-results-backend.txt` |

---

## Prioritized Backlog

| # | Requirement | Phase | Area | Severity | Effort | Risk | Depends on |
|---|---|---|---|---|---|---|---|
| R1 | ESLint + Prettier toolchain | 0 | Tooling | High | Low | Low | — |
| R2 | Ignore generated test artifacts | 0 | Tooling | Low | Low | Low | — |
| R3 | Sync root package version | 0 | Tooling | Low | Low | Low | — |
| R4 | Shared accessible `<Modal>` shell | 1 | UI/a11y | High | Medium | Medium | R1 |
| R5 | Migrate 25 modals to the shell | 1 | UI/a11y | High | Medium | Medium | R4 |
| R6 | Add `ErrorBoundary` | 1 | Frontend | Medium | Low | Low | — |
| R7 | Structured logging + user-visible error states | 1 | Frontend | Medium | Medium | Low | R6 |
| R8 | Bound analytics queries | 2 | Backend perf | High | Medium | Medium | — |
| R9 | Adopt `asyncHandler` in controllers | 2 | Backend | High | Medium | Medium | R1 |
| R10 | Stop leaking `error.message` to clients | 2 | Security | Medium | Low | Low | R9 |
| R11 | Consolidate transaction helpers | 2 | Backend | Medium | Low | Medium | — |
| R12 | Fix error masking in `createExpense` | 2 | Backend | Medium | Low | Low | — |
| R13 | Standardize activity-log fire-and-forget | 2 | Backend | Medium | Medium | Low | — |
| R14 | Parameterize `${months}` SQL | 2 | Security | Low | Low | Low | — |
| R15 | Replace index-based list keys | 3 | Frontend | Low | Low | Low | R1 |
| R16 | Virtualize long lists | 3 | Frontend perf | Medium | Medium | Medium | — |
| R17 | Decompose mega-components & mega-service | 4 | Both | Medium | High | Medium | R4, R7 |
| R18 | Remove duplicate `findById` methods | 3 | Backend | Low | Low | Low | R1 |
| R19 | Fix conditional hooks in `InsuranceStatusIndicator` | 1 | Frontend | High | Low | Low | R1 |
| R20 | Make frontend `test:fast*` scripts Windows-compatible | 0 | Tooling | Low | Low | Low | — |
| R21 | Dependabot PRs bypass all CI checks | 0 | CI | Medium | Low | Low | — |

> R18–R20 were **discovered by the linter added in R1**, not by the manual audit.
> R21 was discovered while triaging the dependabot queue after the Phase 0 PR.

**Recommended execution order:** R1 → R2/R3 → R21 → R20 → R19 → R6 → R4 → R5 → R8 → R9 →
R10 → R11/R12/R13 → R7 → R14/R15/R18 → R16 → R17.

---

# Phase 0 — Tooling Guardrails

Goal: install the automated checks that would have prevented most of Phases 1–3, before
changing any application code.

**Status: complete.** Outcome summary:

| Item | Result |
|---|---|
| R1 | ✅ Done — ESLint 9 flat config + Prettier landed; **0 errors, 609 warnings**, exit 0 |
| R2 | ✅ Already satisfied — no change required (see R2 findings) |
| R3 | ✅ Done — root `version` removed, `private: true` added |
| R20 | ☐ New — surfaced while validating R1 |
| R21 | ☐ New — surfaced while triaging the dependabot queue |

Shipped as **PR #346** (issue #345), merged 2026-09-04 with all 12 CI checks green.

**Validation (2026-09-04):**

| Check | Result |
|---|---|
| `npm run lint` | exit 0 — 0 errors, 609 warnings |
| `npm ci --ignore-scripts` (root) | exit 0 — lockfile installable |
| `cd frontend; npm run test` | **213 files, 2474 passed, 7 skipped, 0 failed** |
| `cd backend; npm run test:unit:parallel` | **138 suites, 2229 passed, 0 failed** |
| Source files changed | **0** |

The linter immediately produced value: it found **three defects the manual audit missed**
(R18, R19) and one broken npm script (R20).

## R1: ESLint + Prettier toolchain — ✅ DONE

**User Story:** As a maintainer, I want lint rules enforcing hook dependencies and JSX
accessibility, so that stale-closure bugs and inaccessible markup are caught at author
time instead of in a manual audit.

### Current Behavior

No ESLint, no Prettier, no `lint` script. `react-hooks/exhaustive-deps` and `jsx-a11y`
violations accumulate undetected — they are the direct cause of R5, R7, and R15.

### Acceptance Criteria

1. THE repo SHALL contain a flat `eslint.config.js` at the root covering both `backend/`
   and `frontend/src/` with per-directory overrides.
2. THE frontend config SHALL enable `eslint-plugin-react`, `eslint-plugin-react-hooks`,
   and `eslint-plugin-jsx-a11y`.
3. THE backend config SHALL target `sourceType: "commonjs"`, Node globals, and enable
   `no-console` as an **error** for `backend/**` excluding `backend/scripts/**`.
4. THE frontend config SHALL enable `no-console` as a **warning** (upgraded to error by R7).
5. ALL rules that currently fail SHALL be configured as `warn`, not `error`, on first
   landing, so that CI is not broken by the initial adoption.
6. Test files (`**/*.test.js`, `**/*.test.jsx`, `**/*.pbt.test.*`, `**/*.integration.test.*`)
   SHALL relax `no-console` and unused-var rules.
7. `.jest-cache/`, `node_modules/`, `dist/`, and all data directories (`config/`,
   `preview-data/`, `staging-data/`, `backend/backups/`) SHALL be lint-ignored.
8. Root `package.json` SHALL expose `lint` (check) and `lint:fix` scripts.
9. A Prettier config SHALL be added with settings matching the existing dominant style
   (2-space indent, single quotes, semicolons, 100-char print width) and a
   `format:check` script. Prettier SHALL NOT be run as a bulk reformat in this PR.
10. THE PR SHALL make **zero** source-code changes beyond config and `package.json`.

### Design / Implementation Notes

- Use ESLint 9 flat config (`eslint.config.js`) — the repo is already on modern tooling
  (Vite 8, React 19), so legacy `.eslintrc` is not warranted.
- Frontend is ESM (`"type": "module"`), backend is CommonJS. This **must** be handled
  with two config objects keyed by `files:` glob, not a single global config.
- Do not add `eslint-config-prettier` conflicts: include it last in the frontend config.
- Record the baseline warning count in the PR description so R5/R7/R15 can be measured
  against it.

### Test Plan

- `npm run lint` completes with exit code 0 (warnings allowed, no errors).
- `npm run lint` reports a non-zero warning count (proving rules actually match files).
- Existing test suites unaffected: `scripts/run-test-summary.ps1`.

### Outcome (as landed)

**Files added:** `eslint.config.js`, `.prettierrc.json`, `.prettierignore`.
**Files changed:** `package.json` (scripts + devDependencies), `package-lock.json`.
**Source-code changes: zero** (AC10 satisfied).

**Deviation — ESLint 9, not 10.** `eslint-plugin-react` declares a peer range of
`^3 || … || ^9.7` and `eslint-plugin-jsx-a11y` `^3 || … || ^9`; neither supports ESLint 10
yet, and installing `eslint@^10` fails with `ERESOLVE`. Pinned to ESLint 9 with a comment
in the config. **Revisit when both plugins publish ESLint 10 peer support.**

**Deviation — `react/prop-types` set to `off`, not `warn`.** It produced 915 warnings
(56% of all output) because the codebase uses PropTypes only sporadically and has no
requirement to use it at all. Leaving it on would have buried the actionable signal.

**Deviation — `require-atomic-updates` removed.** Produced 90 warnings, overwhelmingly
false positives on the `await`-then-assign pattern used throughout the repositories.

**Baseline: 0 errors, 609 warnings.** By rule:

| Count | Rule | Owned by |
|---|---|---|
| 116 | `no-unused-vars` | opportunistic |
| 74 | `jsx-a11y/click-events-have-key-events` | R5 |
| 70 | `no-console` (frontend) | R7 |
| 70 | `jsx-a11y/no-static-element-interactions` | R5 |
| 44 | `react-hooks/immutability` | R17 |
| 39 | `react/no-array-index-key` | R15 |
| 32 | `jsx-a11y/label-has-associated-control` | R5 |
| 28 | `react-hooks/set-state-in-effect` | R17 |
| 27 | `react-hooks/exhaustive-deps` | R17 |
| 26 | `react/no-unescaped-entities` | opportunistic |
| 15 | `no-misleading-character-class` | opportunistic |
| 11 | `jsx-a11y/no-autofocus` | R5 |
| 8 | `no-control-regex` | opportunistic |
| 8 | `react-hooks/refs` | R17 |
| 7 | `react-hooks/preserve-manual-memoization` | R17 |
| 5 | `jsx-a11y/no-noninteractive-tabindex` | R5 |
| 4 each | `no-useless-escape`, `no-case-declarations`, `no-regex-spaces`, `jsx-a11y/no-noninteractive-element-interactions` | opportunistic / R5 |
| 4 | `react-hooks/rules-of-hooks` | **R19** |
| 2 | `no-dupe-class-members` | **R18** |
| 2 | unused `eslint-disable` directive | opportunistic |
| 2 | `jsx-a11y/interactive-supports-focus` | R5 |
| 1 each | `no-async-promise-executor`, `no-prototype-builtins`, `react-hooks/purity` | opportunistic |

`no-console` is `error` for `backend/**` and passes cleanly, confirming the audit's finding
that backend production code has zero console leakage. Exempted: `backend/scripts/**`,
`scripts/**`, `backend/config/logger.js`, `frontend/src/utils/logger.js`, and test files.

`npm ci --ignore-scripts` succeeds at the root, satisfying the CI **Lockfile Integrity**
job (`.github/workflows/ci.yml#L95`).

### Follow-up (separate PR, after R5/R7/R15)

Ratchet these rules from `warn` to `error`: `react-hooks/exhaustive-deps`,
`jsx-a11y/no-noninteractive-element-interactions`, `react/jsx-key`, `no-console`.

---

## R2: Ignore generated test artifacts — ✅ ALREADY SATISFIED (no change required)

**User Story:** As a maintainer, I want test output files kept out of version control, so
that `git status` reflects real work in progress.

### Acceptance Criteria

1. `.gitignore` SHALL exclude: `test-backend-raw.txt`, `test-frontend-raw.txt`,
   `test-failure-summary.txt`, `test-budget.json` (verify first — see note),
   `backend/test-results-backend.txt`, `frontend/test-results*.txt`,
   `frontend/vitest-output.txt`.
2. Files already tracked SHALL be removed from the index with `git rm --cached` (not
   deleted from disk).
3. `scripts/check-test-budget.js` and `scripts/report-test-health.js` SHALL continue to
   function.

### Verification Result — no change needed

The original finding was **wrong**. These files appear in the workspace root listing but
are already ignored and were never tracked. `git check-ignore -v` confirms every one:

| File | Ignored by |
|---|---|
| `test-backend-raw.txt` | `.gitignore:110` |
| `test-frontend-raw.txt` | `.gitignore:111` |
| `test-failure-summary.txt` | `.gitignore:109` |
| `backend/test-results-backend.txt` | `.gitignore:106` (`**/test-results*.txt`) |
| `frontend/test-results.txt` | `.gitignore:108` |
| `frontend/test-results-frontend.txt` | `.gitignore:108` |
| `frontend/test-results-expenseform.txt` | `.gitignore:108` |
| `frontend/vitest-output.txt` | `.gitignore:144` |

`git ls-files` returns none of them, so AC2 is moot — nothing to untrack.
`git status --branch --short` was already clean.

**`test-budget.json` is correctly tracked and must stay tracked.** It is a committed
*input* consumed by `scripts/check-test-budget.js#L23-29` (`loadBudget` reads
`test-budget.json` and warns if missing), not generated output. Ignoring it would have
silently disabled the CI runtime-budget check.

---

## R3: Sync root package version — ✅ DONE

**User Story:** As a maintainer, I want a single source of truth for the app version, so
release tooling and the in-app version display cannot disagree.

### Acceptance Criteria

1. Root `package.json` `version` SHALL either match `1.10.0` or be removed entirely.
2. THE change SHALL be consistent with the repo's documented 7-location versioning rule
   (see `docs/steering/`) — if the root `package.json` is one of the seven, it must be
   added to the release checklist rather than deleted.

### Verification Result

Root `package.json` is **not** one of the seven tracked version locations. Per
`docs/steering/versioning.md#L9-17` the seven are: `frontend/package.json`,
`backend/package.json`, `frontend/src/App.jsx`,
`frontend/src/components/system/BackupSettings.jsx`,
`frontend/src/components/system/SystemModal.jsx`, `CHANGELOG.md`, and
`frontend/src/utils/changelog.js`.

Confirmed nothing reads the root version:

- All runtime consumers read `backend/package.json` — `healthRoutes.js#L4`,
  `backupService.js#L166`, `updateCheckService.js#L104`, `versionCheckService.js#L12`.
- CI reads only `backend/package.json` and `frontend/package.json` —
  `ci.yml#L462`, `#L835`; `release.yml#L76`, `#L79`; `version-check.yml#L35`.
- No `npm_package_version` usage anywhere.

### Outcome (as landed)

Removed the stale `"version": "1.6.0"` field rather than syncing it, which eliminates the
drift class permanently instead of adding an eighth location to maintain. Added
`"private": true` (the root package is a workspace shell and is never published) and a
`"//version"` comment pointing at `docs/steering/versioning.md`.

No change to `docs/steering/versioning.md` is required — the seven-location rule is
unaffected, and `scripts/__tests__/ci-consistency.test.js` compares `versioning.md` against
`pre-deployment.md` only, never the root manifest.

---

## R20: Fix the frontend `test:fast*` scripts

**User Story:** As a developer, I want the documented fast-test scripts to run *and* to
actually be faster, so the command matches its name.

### Current Behavior

`frontend/package.json#L15-L16`:

```json
"test:fast": "FAST_CHECK_NUM_RUNS=10 vitest --run",
"test:fast:parallel": "FAST_CHECK_NUM_RUNS=10 vitest --run --pool=forks --poolOptions.forks.maxForks=75%",
```

**Two independent defects:**

1. **Broken on Windows.** The bare `VAR=value command` prefix is POSIX shell syntax and
   fails immediately in PowerShell/cmd with
   `'FAST_CHECK_NUM_RUNS' is not recognized as an internal or external command`.
   `backend/package.json` already solves this — all 14 of its env-var scripts use
   `cross-env`. The frontend never adopted it and has no `cross-env` dependency.

2. **The variable is dead code on *every* platform.** `FAST_CHECK_NUM_RUNS` appears
   **only** in those two script lines — nothing in `frontend/` ever reads it. Frontend PBT
   run counts are driven by `isCI` in
   [pbtOptions](frontend/src/test/pbtArbitraries.js#L166), and the majority of PBT tests
   bypass that helper entirely by passing `{ numRuns: 100 }` inline to `fc.assert`.
   So even on Linux, `test:fast` is **identical to `test`** — it is not fast.

Adding `cross-env` alone would produce a script that runs but silently does nothing,
which is arguably worse than the current loud failure.

### Acceptance Criteria

1. `frontend/package.json` SHALL use `cross-env` for every script that sets an environment
   variable inline, and `cross-env` SHALL be added to `frontend/devDependencies`.
2. `pbtOptions` in `frontend/src/test/pbtArbitraries.js` SHALL honour
   `FAST_CHECK_NUM_RUNS` when set, taking precedence over the `isCI` default.
3. THE precedence order SHALL be: explicit per-call `numRuns` > `FAST_CHECK_NUM_RUNS` >
   `isCI` default.
4. WHEN `FAST_CHECK_NUM_RUNS` is unset, behavior SHALL be byte-identical to today.
5. BOTH scripts SHALL run successfully on Windows and Linux.
6. `frontend/package-lock.json` SHALL be regenerated and remain `npm ci`-installable.
7. THE spec SHALL record that most frontend PBT tests still hardcode `numRuns` inline, so
   the env var affects only the subset using `pbtOptions` (see follow-up below).

### Design / Implementation Notes

- Match the backend's exact form: `cross-env FAST_CHECK_NUM_RUNS=10 vitest --run`.
- `pbtOptions` currently reads `isCI` from a module-level constant; read the env var the
  same way (`process.env.FAST_CHECK_NUM_RUNS`) and parse with a guard so a non-numeric
  value falls back to the default rather than producing `NaN` runs.
- Do **not** mass-migrate the inline `{ numRuns: 100 }` call sites in this PR — that is a
  much larger change across ~19 test files and belongs in its own slice.

### Follow-up (separate PR)

Migrate frontend PBT tests from inline `fc.assert(..., { numRuns: 100 })` to
`pbtOptions({ numRuns: 100 })` so the CI-aware and env-var tuning actually applies. ~19
files. Note `scripts/validate-pbt-guardrails.js` may need updating alongside.

### Test Plan

- `cd frontend; npm run test:fast` completes on Windows.
- With `FAST_CHECK_NUM_RUNS=5`, a test using `pbtOptions` runs 5 cases (assert via a
  temporary counter or fast-check's `verbose` output).
- With the var unset, `pbtOptions()` returns the same object as before the change.
- Full frontend suite passes.

---

## R21: Dependabot PRs bypass all CI checks

**User Story:** As a maintainer, I want dependency bumps to be tested before they reach
`main`, so a bad upgrade cannot land unverified.

> Discovered 2026-09-04 while triaging PRs #342–#344 after the Phase 0 merge.

### Current Behavior

[.github/workflows/ci.yml](.github/workflows/ci.yml) guards **12 jobs** with
`github.actor != 'dependabot[bot]'`, including both required checks:

| Job | Line |
|---|---|
| Detect Changed Paths | [39](.github/workflows/ci.yml#L39) |
| Lockfile Integrity | [97](.github/workflows/ci.yml#L97) |
| Backend Unit Tests | [125](.github/workflows/ci.yml#L125) |
| Backend PBT Shard | [174](.github/workflows/ci.yml#L174) |
| Backend PBT Tests | [231](.github/workflows/ci.yml#L231) |
| **Backend Tests Status** (required) | [322](.github/workflows/ci.yml#L322) |
| Frontend Tests | [274](.github/workflows/ci.yml#L274) |
| **Frontend Tests Status** (required) | [414](.github/workflows/ci.yml#L414) |
| Security Audit, Test Health Report, Build/Push GHCR, Deployment Health Check | 249, 344, 436, 616 |

GitHub treats a **skipped** required check as satisfied, so every dependabot PR reports
`mergeStateStatus=CLEAN` with zero tests having run. PRs #342–#344 all showed 12 × `SKIPPED`
yet were reported mergeable.

This is not theoretical: #343 bumps `jest` 30.4.2 → 30.5.0 and #344 bumps
`@testing-library/react`, `@testing-library/user-event`, and `@vitejs/plugin-react` —
precisely the packages whose behavior changes break suites.

### Workaround (verified 2026-09-04)

Running `gh pr update-branch <n>` on a dependabot PR creates a merge commit authored by a
**human**, which flips `github.actor` and causes the full CI to run. Confirmed on #344:
checks went from 12 × `SKIPPED` to actually executing. Use this until the config is fixed.

### Acceptance Criteria

1. THE two required checks (`Backend Tests Status`, `Frontend Tests Status`) and the jobs
   they depend on SHALL run for `dependabot[bot]`-authored PRs.
2. `Lockfile Integrity` SHALL run for dependabot PRs (it exists specifically to catch
   lockfile drift, which is exactly what a dependency bump changes).
3. THE `github.actor != 'dependabot[bot]'` guard MAY be retained on jobs where the cost
   saving is real and the risk is nil: `Build and Push to GHCR` ([L436](.github/workflows/ci.yml#L436))
   and `Deployment Health Check` ([L616](.github/workflows/ci.yml#L616)).
4. A dependabot PR that breaks a test SHALL be reported as failing, not `CLEAN`.
5. THE change SHALL be verified against a real dependabot PR before closing.

### Design / Implementation Notes

- Check whether the guards were added deliberately for CI-minutes cost. If so, a middle
  path is to keep the PBT shards guarded (they are the expensive jobs) while enabling unit
  tests + lockfile integrity, which catch the overwhelming majority of bad bumps.
- Confirm `permissions:` and secret availability for `pull_request` events from dependabot —
  dependabot PRs run with a read-only token by default, which is why some repos disable
  these jobs. If a job needs secrets, use `pull_request_target` carefully or keep it guarded.
- Consider enabling dependabot auto-merge only once tests actually gate it.

### Test Plan

- Open (or update) a dependabot PR and confirm `Backend Tests Status` and
  `Frontend Tests Status` report `SUCCESS`/`FAILURE` rather than `SKIPPED`.
- Deliberately verify a known-bad bump fails (can be done on a scratch branch).

---

# Phase 1 — Frontend Resilience & Accessibility

Goal: make the UI fail visibly and safely, and make every modal usable by keyboard and
screen reader. This is the highest user-visible-value phase.

## R19: Fix conditional hooks in `InsuranceStatusIndicator`

**User Story:** As a user, I want the insurance status indicator to not corrupt React's
hook state, so the component cannot crash or render stale data when its inputs change.

> **Discovered by the R1 linter, not the manual audit.** This is the highest-severity item
> the lint pass produced and should be fixed before any other Phase 1 work.

### Current Behavior

`react-hooks/rules-of-hooks` reports four violations in
[frontend/src/components/expenses/InsuranceStatusIndicator.jsx](frontend/src/components/expenses/InsuranceStatusIndicator.jsx):

| Line | Message |
|---|---|
| 37 | React Hook `useCallback` is called conditionally |
| 82 | React Hook `useCallback` is called conditionally |
| 94 | React Hook `useCallback` is called conditionally |
| 104 | React Hook `useCallback` is called conditionally |

React requires hooks to be called in the same order on every render. A conditional
`useCallback` means that when the guarding condition flips between renders, every
subsequent hook in the component shifts position and receives another hook's state.

### Acceptance Criteria

1. ALL `useCallback` (and any other hook) calls in `InsuranceStatusIndicator` SHALL be
   invoked unconditionally at the top level of the component.
2. THE conditional logic SHALL move *inside* the callback bodies, or into the render
   return, rather than gating the hook call itself.
3. `npx eslint frontend/src/components/expenses/InsuranceStatusIndicator.jsx` SHALL report
   zero `react-hooks/rules-of-hooks` violations.
4. THE component's rendered output SHALL be unchanged for every existing input.
5. AFTER this lands, `react-hooks/rules-of-hooks` SHALL be ratcheted from `warn` to
   `error` in `eslint.config.js` (it will then have zero remaining violations —
   the only other reports are in test files, which already disable the rule).

### Design / Implementation Notes

- Read the full component before editing. The typical cause is an early `return null` for
  a non-insurance expense placed *above* the `useCallback` declarations — the fix is to
  move the early return below all hook calls.
- This is a **latent** bug: it only manifests when the guarding condition changes across
  renders of the same mounted component instance. It may never have been observed in
  practice, which is exactly why it survived a manual audit.
- Existing tests may pass both before and after; do not treat a green suite as proof the
  bug was absent.

### Test Plan

- Unit: render with the guard condition true, then re-render the *same instance* with it
  false, and assert no React warning and correct output.
- Unit: existing `InsuranceStatusIndicator` tests pass unchanged.
- Lint: rule reports zero violations, then flip it to `error`.

---

## R4: Shared accessible `<Modal>` shell

**User Story:** As a keyboard or screen-reader user, I want modals to announce themselves,
trap focus, close on Escape, and prevent the page behind from scrolling, so I can operate
the app without a mouse.

### Current Behavior

25 modal overlays across 18 files each re-implement their own overlay div and
click-outside handler. Only 4 declare `role="dialog"` + `aria-modal`. Six handle Escape.
**None** lock body scroll, trap focus, or restore focus on close.

### Acceptance Criteria

1. THE repo SHALL contain `frontend/src/components/shared/Modal.jsx` exporting a `Modal`
   component with props: `isOpen`, `onClose`, `title` (or `ariaLabel`), `children`,
   `className`, `closeOnOverlayClick` (default `true`), `size`.
2. WHEN open, THE Modal SHALL render an overlay carrying `role="dialog"`, `aria-modal="true"`,
   and either `aria-labelledby` (pointing at the rendered title) or `aria-label`.
3. WHEN open, THE Modal SHALL set `document.body.style.overflow = 'hidden'` and SHALL
   restore the previous value on close/unmount.
4. WHEN open, THE Modal SHALL move focus to the first focusable element inside the dialog
   (or the dialog container if none), and SHALL restore focus to the previously focused
   element on close.
5. WHILE open, THE Modal SHALL trap Tab/Shift+Tab within the dialog.
6. WHEN Escape is pressed, THE Modal SHALL invoke `onClose`.
7. WHEN `closeOnOverlayClick` is true AND the overlay (not its children) is clicked,
   THE Modal SHALL invoke `onClose`.
8. THE Modal SHALL render a close button with `aria-label="Close dialog"` unless
   `hideCloseButton` is set.
9. WHEN modals are nested (e.g. `CreditCardDetailView` → `BillingCycleHistoryForm`),
   ONLY the topmost Modal SHALL respond to Escape, and body scroll SHALL remain locked
   until the last one closes.
10. THE Modal SHALL satisfy the existing UxConsistency PBT guardrails
    (`UxConsistency.modalOverlay.pbt.test.jsx`, `UxConsistency.modalWidth.pbt.test.jsx`,
    `UxConsistency.zIndex.pbt.test.jsx`).
11. THE PR SHALL NOT migrate any existing modal — it adds the component and its tests only.

### Design / Implementation Notes

- Split behavior into a `useModalBehavior({ isOpen, onClose, containerRef })` hook so that
  modals which cannot adopt the full shell (e.g. `InvoicePDFViewer`, which has bespoke
  keyboard handling at `InvoicePDFViewer.jsx#L214`) can adopt the behavior alone.
- **Nesting/scroll-lock:** use a module-level open-modal counter (or a small context stack)
  rather than a bare `overflow = 'hidden'` set/reset, otherwise closing an inner modal
  unlocks scroll while the outer one is still open.
- **Escape stacking:** register the Escape listener only for the top of the stack, or check
  `event.defaultPrevented` and call `stopPropagation` in the innermost handler.
- Implement the focus trap by hand (query
  `a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])`);
  do **not** add `focus-trap-react` — the frontend has only 4 runtime dependencies and that
  minimalism is worth preserving.
- Reuse the existing `.modal-overlay` CSS class so the PBT width/z-index/overlay guardrails
  continue to pass unchanged.
- `ConfirmDialog.jsx` already implements Escape + `aria-modal` correctly; use it as the
  reference implementation and migrate it first in R5 as the smoke test.

### Test Plan

- Unit: renders with `role="dialog"` and `aria-modal="true"`.
- Unit: Escape calls `onClose`; overlay click calls `onClose`; content click does not.
- Unit: body `overflow` is `hidden` while open and restored to its prior value on close.
- Unit: focus lands inside on open and returns to the trigger on close.
- Unit: Tab from the last focusable element wraps to the first; Shift+Tab wraps backward.
- Unit: two stacked Modals — Escape closes only the inner one; scroll stays locked.
- PBT: the three existing UxConsistency modal guardrails pass.

---

## R5: Migrate all modals to the shared shell

**User Story:** As a user, I want every dialog in the app to behave the same way, so
Escape, click-outside, and keyboard focus are predictable everywhere.

### Acceptance Criteria

1. ALL 25 modal-overlay render sites SHALL use the shared `Modal` (or `useModalBehavior`
   where full adoption is impractical).
2. EACH migrated modal SHALL supply a meaningful `title`/`ariaLabel` — no generic
   `"Modal"` strings.
3. EVERY icon-only close button SHALL have an accessible name.
4. EXISTING behavior SHALL be preserved exactly: which modals close on overlay click and
   which do not must match current behavior (e.g. `ExpenseList.jsx#L1127` and
   `PersonAllocationModal.jsx#L186` currently have **no** overlay `onClick` — these must
   migrate with `closeOnOverlayClick={false}`).
5. `MerchantAnalyticsModal.jsx#L89` embedded mode (`embedded` prop disables overlay click)
   SHALL be preserved.
6. NO existing test SHALL be weakened to accommodate the migration.

### Migration Batches (one PR each)

| Batch | Files | Sites |
|---|---|---|
| 5a (smoke test) | `shared/ConfirmDialog.jsx`, `system/VersionUpgradeModal.jsx` | 2 |
| 5b | `App.jsx` (×3), `tax/PeopleManagementModal.jsx`, `tax/PersonAllocationModal.jsx` | 5 |
| 5c | `financial/BudgetsModal.jsx`, `financial/FixedExpensesModal.jsx`, `financial/IncomeManagementModal.jsx` | 3 |
| 5d | `financial/FinancialOverviewModal.jsx` (×2), `loans/TotalDebtView.jsx` | 3 |
| 5e | `credit-cards/CreditCardDetailView.jsx` (×3), `expenses/ExpenseList.jsx` (×2) | 5 |
| 5f | `analytics/AnalyticsHubModal.jsx`, `analytics/MerchantAnalyticsModal.jsx`, `tax/TaxDeductible.jsx` (×2) | 4 |
| 5g | `system/SettingsModal.jsx`, `system/SystemModal.jsx`, `tax/InvoiceIndicator.jsx` | 3 |

`tax/InvoicePDFViewer.jsx` is deliberately excluded from full migration — adopt
`useModalBehavior` only, preserving its existing arrow-key/zoom keyboard handling.

### Design / Implementation Notes

- Some overlays use bespoke class names (`fixed-expenses-modal-overlay`,
  `income-modal-overlay`, `settings-modal-overlay`, `total-debt-modal-overlay`,
  `invoice-list-modal-overlay`). Pass these through `className` — do **not** consolidate
  the CSS in the same PR.
- `FinancialOverviewModal` and `CreditCardDetailView` render multiple overlays for
  loading/error/content states. Each needs the same `ariaLabel`; consider hoisting one
  Modal and switching only the body.
- Watch for double-Escape handling in `ExpenseForm.jsx#L706` and
  `QuickStatusUpdate.jsx#L121` once the shell also handles Escape.

### Test Plan

- Per batch: existing component tests pass unchanged.
- Per batch: add one a11y assertion per migrated modal (`role="dialog"` present).
- Full: `cd frontend; npm run test` after each batch.
- Manual: verify no background scroll behind each modal; verify nested
  `CreditCardDetailView` → `BillingCycleHistoryForm` closes inner-first on Escape.

---

## R6: Add an ErrorBoundary

**User Story:** As a user, I want a failed screen to show a recoverable error instead of a
blank page, so one bad component doesn't take down the whole app.

### Current Behavior

Zero error boundaries in the codebase. Every heavy modal is `lazy()`-loaded behind
`Suspense`; a render-time throw inside one unmounts the entire React tree and leaves a
white screen with no recovery path.

### Acceptance Criteria

1. THE repo SHALL contain `frontend/src/components/shared/ErrorBoundary.jsx` implementing
   `getDerivedStateFromError` and `componentDidCatch`.
2. `componentDidCatch` SHALL report through `frontend/src/utils/logger.js`, not `console`.
3. THE fallback UI SHALL display a human-readable message and a "Try again" action that
   resets the boundary state.
4. THE fallback SHALL display the error message and component stack **only** when
   `import.meta.env.DEV` is true.
5. THE boundary SHALL accept an optional `fallback` render prop and an optional `onReset`
   callback.
6. `App.jsx` SHALL wrap (a) the whole app shell and (b) each `Suspense`-wrapped lazy modal
   container, so a modal crash does not unmount the expense list behind it.
7. WHEN a boundary's `resetKey` prop changes, THE boundary SHALL clear its error state
   (so closing and reopening a modal retries cleanly).

### Design / Implementation Notes

- Must be a class component — React 19 still has no hook equivalent.
- Place the per-modal boundary **inside** `Suspense` so chunk-load failures are also caught.
- Keep the fallback dependency-free; do not pull in a reporting SDK.

### Test Plan

- Unit: a child that throws renders the fallback, not a blank tree.
- Unit: "Try again" re-renders children.
- Unit: `resetKey` change clears the error.
- Unit: stack details are hidden when `DEV` is false.
- Unit: `logger.error` is called once per caught error.

---

## R7: Structured logging and user-visible error states

**User Story:** As a user, I want to be told when data fails to load and be offered a
retry, instead of silently seeing an empty panel.

### Current Behavior

36 `console.*` calls in production components and contexts. Most sit in `catch` blocks
that set no error state, so the user sees an empty or stale panel with no indication that
anything failed.

Highest-impact silent-failure sites (verified):

| File | Lines |
|---|---|
| `frontend/src/components/financial/SummaryPanel.jsx` | 184, 228, 249, 258, 273, 300, 389, 486, 510, 554 |
| `frontend/src/components/tax/TaxDeductible.jsx` | 107, 116, 134, 183, 221, 312, 405 |
| `frontend/src/contexts/SharedDataContext.jsx` | 40, 62, 84 |
| `frontend/src/App.jsx` | 61, 272, 316 |
| `frontend/src/components/tax/PeopleManagementModal.jsx` | 39, 140, 178 |
| `frontend/src/components/analytics/*View.jsx` | one per file (5 files) |
| `frontend/src/contexts/ExpenseContext.jsx` | 82, 120 |
| `frontend/src/components/expenses/ExpenseList.jsx` | 587 |
| `frontend/src/contexts/FilterContext.jsx` | 53, 63 (`console.warn`) |

### Acceptance Criteria

1. ALL production `console.*` calls under `frontend/src/` (excluding tests) SHALL be
   replaced with `frontend/src/utils/logger.js` calls.
2. THE repo SHALL contain a shared `frontend/src/components/shared/ErrorState.jsx`
   presenting a message and an optional retry button.
3. EVERY data-fetch `catch` block in the files listed above SHALL set an error state that
   renders `ErrorState` in place of (or above) the affected panel.
4. WHERE a retry is safe and idempotent, `ErrorState` SHALL expose a retry action that
   re-invokes the fetch.
5. `ErrorState` SHALL NOT display raw exception text to the user; it shows a friendly
   message while `logger.error` records the detail.
6. Errors from *dismiss*/*mutate* actions (e.g. `SummaryPanel.jsx#L486`, `#L510`,
   `#L554`) SHALL surface as a transient inline message rather than replacing the panel.
7. `FilterContext.jsx#L53`/`#L63` warnings are **validation recovery, not failures** —
   convert to `logger.warn` and do NOT surface them to the user.
8. AFTER this requirement lands, `no-console` SHALL be ratcheted to `error` for
   `frontend/src/**` (excluding tests) in `eslint.config.js`.

### Design / Implementation Notes

- Slice by file, not all at once. Suggested order: `SharedDataContext` → `App.jsx` →
  `SummaryPanel` → analytics views → `TaxDeductible` → the rest.
- `SummaryPanel` is the highest-value target: 10 silent failures on the app's primary
  landing surface.
- Several fetches are independent (reminders, auto-log suggestions, anomalies, summary).
  Use **per-section** error state, not one panel-wide error, so one failed fetch does not
  blank the other three sections.
- Do not add a toast library; a scoped inline `ErrorState` matches existing UI patterns.

### Test Plan

- Unit per file: a rejected fetch renders `ErrorState`.
- Unit: retry re-invokes the API function.
- Unit: raw error text is not present in the DOM.
- Unit: independent sections fail independently in `SummaryPanel`.
- Lint: `npm run lint` reports zero `no-console` violations under `frontend/src/`.

---

# Phase 2 — Backend Correctness & Performance

## R8: Bound analytics queries

**User Story:** As a user with years of history, I want anomaly detection and predictions
to respond quickly, so analytics screens don't stall as my data grows.

### Current Behavior

`anomalyDetectionService.calculateCategoryBaseline()`
(`backend/services/anomalyDetectionService.js#L132`) calls `expenseRepository.findAll()`
with **no filters**, loading the entire `expenses` table (21k+ rows) into memory, then
filters in JavaScript by `e.type === category`. It is invoked from a loop at
`#L583` (and `#L355`) — memoized in a `categoryBaselines` / `baselineCache` object, but
still **one full table load per distinct category**.

`predictionService.compareToHistorical()` (`backend/services/predictionService.js#L308`)
does the same to build same-month year-over-year totals.

### Acceptance Criteria

1. `calculateCategoryBaseline` SHALL NOT call `expenseRepository.findAll()` without bounds.
2. THE baseline SHALL be computed from a query filtered by category AND a bounded lookback
   window, or from a SQL aggregation returning per-month sums and counts.
3. `compareToHistorical` SHALL query only the target month across prior years rather than
   loading all expenses.
4. NEW repository methods SHALL use date-range predicates (`date >= ? AND date < ?`),
   NOT `strftime()` in the `WHERE` clause.
5. THE numeric outputs of both services SHALL be **unchanged** for existing data — this is
   a pure performance change.
6. THE lookback window SHALL be a named constant, not a magic number, and SHALL be large
   enough to preserve current statistical behavior (verify against the existing
   `monthsWithData` / `hasValidBaseline` logic before choosing a value).

### Design / Implementation Notes

- **Preserve semantics carefully.** `calculateCategoryBaseline` returns `mean`, `stdDev`,
  `count`, `monthsWithData`, `hasValidBaseline`, `monthlyAverages`, and
  `transactionCounts`. Read `_groupExpensesByMonth` and the std-dev computation before
  moving anything into SQL — an aggregation that changes `monthsWithData` will change
  anomaly output.
- Prefer adding `expenseRepository.findByCategoryAndDateRange(category, start, end)` first
  (smallest change, keeps JS math identical), and only push aggregation into SQL as a
  second step if profiling still shows a problem.
- The repo has prior art for this exact migration: `predictionService._getHistoricalMonthlyAverage`,
  `trendsService._fetchMonthlyHistory`, and `spendingPatternsService.checkDataSufficiency`
  were all converted from `findAll()` to bounded/aggregated queries. Follow the same shape.
- Consider whether an index on `expenses(type, date)` already exists; the audit notes
  compound indexes on `(date, type)` were added previously — verify column order suits the
  new predicate.

### Test Plan

- **Characterization first:** capture current output of both functions against the dev
  database, then assert byte-identical results after the change.
- PBT: existing `anomalyDetectionService.*.pbt.test.js` and `predictionService.*.pbt.test.js`
  suites pass unchanged.
- Perf: `EXPLAIN QUERY PLAN` on the new queries confirms index usage (no `SCAN expenses`).
- Timing: record before/after wall time for the anomalies endpoint in the PR description.

---

## R9: Adopt `asyncHandler` in controllers

**User Story:** As a maintainer, I want one error path through the API, so status codes are
correct and error handling isn't copy-pasted 141 times.

### Current Behavior

`asyncHandler` exists (`backend/middleware/errorHandler.js#L31`) and `errorHandler` is
registered (`backend/server.js#L239`), but **no controller uses either**. Instead there
are 141 hand-rolled `res.status(500).json(...)` blocks across 25 controllers, with
inconsistent payload shapes (`{ error: 'Internal server error' }` vs
`{ error: error.message }` vs multi-field objects).

### Acceptance Criteria

1. THE repo SHALL contain typed error classes (e.g. `ValidationError`, `NotFoundError`,
   `ConflictError`) in `backend/utils/` that set `statusCode`.
2. MIGRATED controller actions SHALL be wrapped in `asyncHandler` and SHALL NOT contain a
   `try/catch` whose only purpose is to emit a 500.
3. MIGRATED services SHALL throw typed errors instead of bare `Error` where the controller
   currently maps a message substring to a status code.
4. THE JSON response shape for each migrated endpoint SHALL be **unchanged** as observed
   by the frontend (`{ error: string }`).
5. WHEN a controller catch block maps `error.message.includes(...)` to a status, THAT
   mapping SHALL be replaced by the typed error's `statusCode` — and any branch whose
   message no longer corresponds to a real service `throw` SHALL be deleted as dead code.
6. `asyncHandler` adoption SHALL be incremental: **one controller per PR**.
7. NO frontend change SHALL be required by any single migration PR.

### Migration Order (smallest/lowest-risk first)

`categoryController` (1 site) → `peopleController` → `settingsController` →
`placeNameController` → `investmentController` → `reminderController` →
`incomeController` → `fixedExpenseController` → `activityLogController` →
`merchantAnalyticsController` → `loanBalanceController` → `investmentValueController` →
`budgetController` → `analyticsController` → `creditCardPaymentController` →
`creditCardStatementController` → `authController` → `paymentMethodController` →
`loanPaymentController` → `loanController` → `expenseController` →
`invoiceController` → `backupController` → `billingCycleController`.

### Design / Implementation Notes

- **Audit catch blocks for dead branches while migrating.** This repo has a confirmed
  history of `if (error.message === '...')` branches left unreachable after a service
  `throw` was removed. Verify each mapped message against the service's actual `throw`
  strings before porting it.
- `backupController` and `invoiceController` stream files and set custom headers — check
  that `asyncHandler` does not interfere with response streams already in flight (a
  post-`res.write` rejection cannot be converted into a JSON error).
- Do **not** change `errorHandler` in the same PRs; R10 handles its payload.
- `billingCycleController` (1018 lines) is last deliberately — migrate it only after the
  pattern is proven on 20+ smaller controllers.

### Test Plan

- Per controller: existing controller tests pass with **no assertion changes**.
- Per controller: add one test asserting a thrown `NotFoundError` yields HTTP 404 and a
  thrown `ValidationError` yields 400.
- Per controller: assert that an unexpected throw yields 500 (previously often mislabeled).
- Full backend suite after every 5 controllers.

---

## R10: Stop leaking internal error messages to clients

**User Story:** As a security-conscious operator, I want server errors to not echo internal
exception text to the browser, so implementation details are not disclosed.

### Current Behavior

Many controllers return `res.status(500).json({ error: error.message })` — e.g.
`loanController.js#L18`, `expenseController.js#L136`, `loanPaymentController.js#L52`,
`peopleController.js#L14`. Others correctly return a generic string. Additionally,
`errorHandler.js#L21` returns `err.message` for **all** status codes, including 500.

### Acceptance Criteria

1. WHEN the resolved status code is >= 500 AND `NODE_ENV` is not `development`,
   THE error response body SHALL be a generic message (`'Internal server error'`).
2. WHEN the resolved status code is 4xx, THE response SHALL still return the specific
   message (these are user-actionable validation messages the frontend displays).
3. THE full error (message + stack) SHALL always be recorded via `backend/config/logger.js`.
4. NO frontend behavior SHALL regress — verify that no component displays a 500-path
   message to the user today.

### Design / Implementation Notes

- Implement centrally in `errorHandler.js`; do not sprinkle per-controller conditionals.
- Land **after** R9 begins so the centralized handler is actually on the hot path.
- Grep the frontend for any UI that surfaces a 500 body before changing it.

### Test Plan

- Unit (`errorHandler.test.js`): 500 in production mode returns the generic string;
  400 returns the specific message; stack is present only in development.
- Unit: `logger.error` receives the original message in all cases.

---

## R11: Consolidate transaction helpers

**User Story:** As a maintainer, I want one documented way to run a multi-step write
atomically, so contributors don't have to choose between two near-identical helpers.

### Current Behavior

Three competing mechanisms:

| Mechanism | Location | Adopters |
|---|---|---|
| `withTransaction(db, fn)` | `backend/database/db.js#L408` | `expenseService.js#L394`, `#L620` |
| `runInTransaction(fn)` | `backend/utils/dbHelper.js#L165` | `creditCardPaymentService.js` |
| Raw `BEGIN TRANSACTION` | `backend/repositories/expensePeopleRepository.js#L17` | 1 |

`expenseService.createExpense` correctly uses `withTransaction` for the multi-month path,
but the single-expense path (`_createSingleExpense` → expense insert + payment-method
balance update + people allocations) is **not** wrapped.

### Acceptance Criteria

1. ONE transaction helper SHALL be designated canonical and documented in
   `docs/steering/` (or the relevant developer guide).
2. THE non-canonical helper SHALL be removed, and its single adopter migrated.
3. `expensePeopleRepository.js#L17` SHALL use the canonical helper instead of raw
   `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`.
4. `expenseService._createSingleExpense` SHALL run its expense-insert + balance-update
   sequence inside the canonical helper when invoked without an existing `dbConnection`.
5. WHEN a transaction-scoped connection is already supplied (`dbConnection`/`txDb`),
   THE helper SHALL NOT open a nested transaction (SQLite does not support nesting without
   savepoints).
6. Rollback behavior SHALL be covered by a test that forces a mid-sequence failure and
   asserts no partial rows remain.

### Design / Implementation Notes

- **Recommend keeping `withTransaction`** (`database/db.js`): it passes a real db handle,
  matching the `dbConnection` threading already used throughout `expenseService`.
  `runInTransaction`'s `{run, get, all}` wrapper shape would require rewriting every
  repository call site.
- The nesting guard in AC5 is the riskiest part — `_createSingleExpense` is called both
  standalone and from inside `withTransaction`. Add an explicit "already in transaction"
  flag rather than inferring it.
- `db.transaction.test.js` already covers commit and rollback for `withTransaction`;
  extend rather than duplicate.

### Test Plan

- Existing `backend/database/db.transaction.test.js` passes.
- New: forcing `paymentMethodRepository.updateBalance` to throw during a single-expense
  create leaves zero rows in `expenses` and an unchanged payment-method balance.
- New: `expensePeopleRepository` allocation failure leaves no orphan allocation rows.
- Full backend suite (transaction changes are high blast radius).

---

## R12: Fix error masking in `createExpense`

**User Story:** As an operator debugging a failed expense save, I want the real error in
the logs, so I'm not left with an opaque message.

### Current Behavior

`backend/services/expenseService.js#L446`:

```js
} catch (error) {
  throw Object.assign(new Error('Failed to create future expenses. Please try again.'), { statusCode: 500 });
}
```

The original error is discarded and never logged. A validation failure raised inside the
transaction is reported to the user as a generic 500.

### Acceptance Criteria

1. THE catch block SHALL log the original error via `backend/config/logger.js` including
   the original message and stack.
2. WHEN the caught error already carries a 4xx `statusCode`, THAT status and message
   SHALL be preserved rather than replaced with a generic 500.
3. THE replacement error SHALL retain a `cause` reference to the original.
4. THE user-facing message for genuinely unexpected failures SHALL remain unchanged.

### Design / Implementation Notes

- Use the native `Error` `cause` option (`new Error(msg, { cause: error })`) — Node 18+.
- Coordinate with R9: once typed errors exist, this becomes a straightforward rethrow.

### Test Plan

- Unit: a validation error thrown inside the transaction surfaces as 400 with its own
  message, not a generic 500.
- Unit: an unexpected error still surfaces the generic message and is logged.

---

## R13: Standardize activity-log fire-and-forget

**User Story:** As a maintainer, I want one convention for activity logging, so a logging
failure can never produce an unhandled rejection or silently drop an audit record.

### Current Behavior

Inconsistent. Some calls are `await`ed (`expenseService.js#L429`); ~15 are not and carry
no `.catch()`. Verified non-awaited, uncaught sites:

| File | Lines |
|---|---|
| `backend/controllers/authController.js` | 95 |
| `backend/services/incomeService.js` | 131, 191, 228, 285 |
| `backend/services/investmentValueService.js` | 132, 185, 216 |
| `backend/services/invoiceService.js` | 149, 274, 392, 445 |
| `backend/services/loanBalanceService.js` | 48, 90, 126, 371, 411 |
| `backend/services/mortgagePaymentService.js` | 108, 198, 234 |
| `backend/services/peopleService.js` | 74, 127, 173 |

A correct wrapper already exists: `anomalyDetectionService._logActivity()`
(`backend/services/anomalyDetectionService.js#L87`).

### Acceptance Criteria

1. THE repo SHALL expose a single `logEventSafe(...)` helper (promote
   `_logActivity` out of `anomalyDetectionService` into `activityLogService` or a shared util).
2. `logEventSafe` SHALL swallow logging errors and record them via `backend/config/logger.js`,
   never rejecting to the caller.
3. ALL non-awaited `activityLogService.logEvent(...)` call sites listed above SHALL be
   converted to `logEventSafe`.
4. CALL sites that intentionally `await` (because ordering matters, e.g. within a
   transaction's side-effect loop) SHALL keep `await` and SHALL be annotated with a one-line
   comment stating why.
5. `anomalyDetectionService._logActivity` SHALL be replaced by the shared helper.
6. NO duplicate log events SHALL be introduced — verify that a helper which already logs
   (e.g. `autoPaymentLoggerService.createPaymentFromFixedExpense`) is not double-logged by
   its caller.
7. THE convention SHALL be documented in `docs/steering/`.

### Design / Implementation Notes

- Do this **after** R9 for the controller sites, so `authController.js#L95` is touched once.
- AC6 matters: this repo has a confirmed history of duplicate `auto_payment_logged` and
  `expense_created` events from helper-plus-caller logging.

### Test Plan

- Unit: a rejecting `logEvent` does not reject `logEventSafe` and does call `logger.error`.
- Integration: `process.on('unhandledRejection')` records nothing during a full backend run.
- Existing `activityLogService.*.pbt.test.js` suites pass.

---

## R14: Parameterize `${months}` SQL interpolation

**User Story:** As a security reviewer, I want zero string interpolation in the repository
layer, so no future caller can introduce an injection.

### Current Behavior

`backend/repositories/expenseRepository.js#L885`:
```sql
AND date >= date('now', '-${months} months')
```
and `#L902`:
```sql
AND (year * 12 + month) >= (strftime('%Y','now') * 12 + strftime('%m','now') - ${months})
```

**Not currently exploitable** — the only caller path validates `1 ≤ months ≤ 60` at
`backend/controllers/merchantAnalyticsController.js#L91`. This is defense-in-depth plus a
minor index-usage improvement.

### Acceptance Criteria

1. NEITHER query SHALL interpolate a JavaScript value into the SQL string.
2. THE cutoff date SHALL be computed in JavaScript and bound as a `?` parameter.
3. THE fixed-expenses branch SHALL bind the computed `year * 12 + month` threshold as a
   parameter.
4. `getMerchantTrend` results SHALL be unchanged for all inputs `1..60`.
5. THE repository method SHALL defend its own contract: a non-integer or out-of-range
   `months` SHALL throw rather than silently produce a malformed query.

### Design / Implementation Notes

- Note that `strftime()` in the `GROUP BY` at `#L886` is **correct and should stay** —
  aggregation grouping does not bypass an index the way a `WHERE` predicate does. Only the
  `WHERE` clause needs changing.
- Watch the month-arithmetic boundary: the current `date('now', '-N months')` semantics and
  a JS-computed cutoff must produce identical results, including on month-end days.

### Test Plan

- Existing `merchantAnalyticsService.trends.pbt.test.js` passes unchanged.
- New: `months` values 1, 2, 12, 60 return identical rows before/after.
- New: `months = 'abc'` and `months = 0` throw.
- `EXPLAIN QUERY PLAN` shows index usage on `expenses(date)`.

---

# Phase 3 — Frontend Performance & Cleanup

## R15: Replace index-based list keys

**User Story:** As a user editing a filtered or sorted list, I want rows to update
correctly, so edits don't appear on the wrong row after a delete or re-sort.

### Current Behavior

20 `key={index}` occurrences across 13 files. Risk is highest where the list is sortable,
filterable, or deletable.

**High risk (mutable, reorderable lists):**

| File | Line | Suggested key |
|---|---|---|
| `system/BackupSettings.jsx` | 740 | `backup.id ?? backup.filename` |
| `system/SystemModal.jsx` | 262 | `backup.id ?? backup.filename` |
| `financial/BudgetsModal.jsx` | 583 | budget/history record id |
| `expenses/ExpenseList.jsx` | 222 | `person.id` |
| `expenses/ExpenseForm.jsx` | 944, 1421 | person id / file name+size |
| `loans/LoanDetailView.jsx` | 1098 | payment id |
| `loans/InvestmentDetailView.jsx` | 619 | value-record id |

**Low risk (static/derived, fix opportunistically):** `analytics/MerchantDetailView.jsx#L280`,
`financial/AnnualSummary.jsx#L594/610/623`, `loans/MigrationUtility.jsx` (×5),
`loans/MortgageTabbedContent.jsx#L322`, `shared/PlaceNameStandardization.jsx#L272`,
`system/VersionUpgradeModal.jsx#L36`.

### Acceptance Criteria

1. ALL high-risk sites in the table above SHALL use a stable domain identifier as `key`.
2. WHERE no natural id exists, a stable composite key SHALL be derived (e.g.
   `${file.name}-${file.size}`) — an array index SHALL NOT be used.
3. `react/jsx-key` and a no-array-index-key rule SHALL be enabled in `eslint.config.js`
   once the high-risk sites are fixed.
4. Low-risk sites MAY remain until touched by other work.

### Test Plan

- Unit: deleting a middle item from a backup list re-renders remaining rows correctly.
- Unit: removing one attached invoice file in `ExpenseForm` does not clear a sibling row.
- Existing component tests pass.

---

## R16: Virtualize long lists

**User Story:** As a user with years of history, I want the expense table and activity log
to scroll smoothly, so large date ranges remain usable.

### Current Behavior

`ExpenseList`, `ActivityLogTable`, and `LoanPaymentHistory` render every row. The
production database holds 21k+ expenses; an unfiltered or annual view renders thousands of
DOM nodes.

### Acceptance Criteria

1. `ExpenseList` SHALL render only the visible window plus an overscan buffer when the
   filtered row count exceeds a threshold (suggest 200).
2. WHEN the row count is below the threshold, THE list SHALL render normally (no
   virtualization overhead, no behavior change for the common monthly view).
3. EXISTING pagination, sorting, filtering, inline-edit, and row-expansion behavior SHALL
   be preserved.
4. Keyboard navigation and screen-reader table semantics SHALL NOT regress.
5. `ActivityLogTable` and `LoanPaymentHistory` SHALL follow in separate PRs.

### Design / Implementation Notes

- **Investigate before implementing:** `ExpenseList` already has a page-size control
  (`ExpenseList.jsx#L587` persists it). If pagination already caps rendered rows at a
  reasonable maximum, virtualization may be unnecessary — measure first and close this
  requirement as "not needed" if so.
- `react-window` is the minimal option (~2 KB). Adding it takes frontend runtime deps from
  4 to 5; justify the addition with a measured before/after in the PR.
- Virtualizing a `<table>` requires either fixed row heights or a CSS-grid row layout.
  Confirm which the current markup uses before committing to an approach.

### Test Plan

- Perf: measure render time with 5,000 rows before/after; record in the PR.
- Unit: rows below the threshold render unvirtualized.
- Unit: filter/sort/edit interactions still work with virtualization active.
- Manual: keyboard scroll and screen-reader row announcement.

---

## R18: Remove duplicate `findById` methods

**User Story:** As a maintainer, I want each repository method defined once, so there is no
ambiguity about which implementation is live.

> **Discovered by the R1 linter, not the manual audit.** Notably, the audit skill's notes
> record a *false* duplicate-`findById` report against `loanBalanceRepository` — the real
> duplicates were in two different files that no manual pass had flagged.

### Current Behavior

`no-dupe-class-members` reports two genuine duplicates. In both cases the class declares
`findById` twice; JavaScript silently keeps the **second** definition and discards the
first.

| File | First def | Duplicate def | Bodies identical? |
|---|---|---|---|
| [backend/repositories/incomeRepository.js](backend/repositories/incomeRepository.js#L9) | L9 | L56 | Yes — byte-identical |
| [backend/repositories/investmentValueRepository.js](backend/repositories/investmentValueRepository.js#L9) | L9 | L67 | Yes — byte-identical |

Because the bodies are identical, there is **no behavioral defect today** — this is dead
code plus a latent hazard: any future edit to the first definition would be silently
discarded at runtime.

### Acceptance Criteria

1. EACH class SHALL declare `findById` exactly once.
2. THE surviving definition SHALL be the one at the top of the class (adjacent to the other
   lookup methods), and the later duplicate SHALL be removed along with its JSDoc block.
3. THE removal SHALL be verified as behavior-neutral by diffing both bodies before deleting.
4. `npm run lint` SHALL report zero `no-dupe-class-members` warnings afterwards.
5. `no-dupe-class-members` SHALL then be ratcheted from `warn` to `error` in
   `eslint.config.js`.

### Design / Implementation Notes

- Do **not** assume the bodies are identical in future occurrences of this pattern — diff
  them first. Here they were verified identical, but a divergent pair would mean the
  first implementation has been silently dead and callers depend on the second.
- While in these files, check for the same pattern in sibling repositories; the linter
  now covers this permanently once AC5 lands.

### Test Plan

- Existing `incomeRepository` / `investmentValueRepository` tests pass unchanged.
- Backend unit suite passes.

---

# Phase 4 — Decomposition

## R17: Decompose mega-components and the mega-service

**User Story:** As a maintainer, I want the largest files split along clear seams, so
changes are reviewable and re-renders are contained.

### Current Behavior

See the [Current-State Map](#frontend) tables. `FinancialOverviewModal.jsx` is the worst
offender: 1,149 lines with **40** `useState` hooks, meaning any single state change
re-renders credit cards, loans, investments, payment methods, and the debt trend together.
`anomalyDetectionService.js` at 3,248 lines is nearly 3× the next-largest backend file.

### Acceptance Criteria

1. `FinancialOverviewModal` SHALL be reduced to a shell that composes four independently
   stateful sections: `CreditCardSummary`, `PaymentMethodsSection`, `LoansSection`,
   `InvestmentsSection`.
2. EACH extracted section SHALL own its own fetch, loading, and error state (using
   `ErrorState` from R7) — no lifting of section-local state into the shell.
3. NO extracted component SHALL exceed ~400 lines or ~8 `useState` hooks; state above that
   threshold SHALL move to `useReducer` or a custom hook.
4. `anomalyDetectionService` SHALL be split into modules by concern: baseline computation,
   detection strategies, deduplication/grouping, and insight formatting.
5. THE public surface of each split module SHALL be unchanged as observed by its callers
   and tests.
6. EACH decomposition SHALL be a separate PR, with **no behavior change** in the same PR.
7. `BackupSettings.jsx` (28 `useState`), `FixedExpensesModal.jsx` (29), `LoanDetailView.jsx`
   (24), `ExpenseForm.jsx` (22), and `TaxDeductible.jsx` (19) SHALL follow the same pattern
   in subsequent PRs.

### Suggested PR Sequence

| PR | Target | Rationale |
|---|---|---|
| 17a | `FinancialOverviewModal` → 4 sections | Worst re-render profile (40 `useState`) |
| 17b | `anomalyDetectionService` split | Largest backend file; blocks R8 follow-up work |
| 17c | `BackupSettings` | 28 `useState`, mostly independent panels |
| 17d | `LoanDetailView` | 1,647 lines, tabbed — natural seams |
| 17e | `TaxDeductible` | 1,593 lines |
| 17f | `ExpenseForm` | Highest test coverage; do last, lowest risk of silent regression |

### Design / Implementation Notes

- **Do R4/R5 and R7 first.** Extracting sections that each need their own error state is
  much cleaner once `ErrorState` and the `Modal` shell exist.
- `ExpenseForm` is intentionally last: it has the most existing tests
  (`ExpenseForm.core`, `.sections`, `.people`, `.futureMonths`, `.dataPreservation`), which
  makes it the safest to refactor but also the most expensive to re-review. There is also
  a separate active spec (`specs/expense-form-ux-improvements/spec.md`) that touches this
  file — **coordinate to avoid conflicting refactors.**
- For `anomalyDetectionService`, split by reading the existing private-method groupings
  (`_groupExpensesByMonth`, `_dedupe*`, `_cluster*`) rather than imposing a new taxonomy.

### Test Plan

- Every existing test SHALL pass with **zero** assertion changes (this is the primary
  acceptance signal for a pure refactor).
- React Profiler: record the re-render count for a single credit-card balance update in
  `FinancialOverviewModal` before/after; expect a reduction.
- `scripts/run-test-summary.ps1` after each PR.

---

## Rejected Findings (do not re-log)

These were reported during the audit but **disproved** by reading the source:

- ❌ "`invoiceService.batchVerifyInvoices` calls unbounded `findAll()`" — `invoiceRepository.findAll()`
  is a different, appropriately-scoped repository. Only two unbounded `expenseRepository.findAll()`
  sites exist (R8).
- ❌ "`expenseRepository.findAll` uses `strftime` in `WHERE`, killing the index" — the
  year and year+month paths already use date-range predicates
  (`expenseRepository.js#L72-L85`). Only the rare **year-less month filter** still uses
  `strftime`, which is a legitimate cross-year query with no index-friendly equivalent.
  Not worth changing.
- ❌ "86 `console.*` calls in the frontend" — actual count is 39, of which 36 are in
  production code (R7). No `console.log` in production code at all.
- ❌ "Duplicate `findById()` in `loanBalanceRepository.js`" — not reproduced.
- ❌ "`autoPaymentLoggerService` builds dates without clamping" — it clamps correctly via
  `Math.min(dueDay, new Date(year, month, 0).getDate())`.
- ❌ "Raw `fetch()` bypassing the API layer" — zero occurrences; `scripts/validate-no-raw-fetch.js`
  is enforcing this correctly.
- ❌ "Missing CORS/rate-limit/helmet protections" — all present and correctly configured in
  `backend/server.js` (helmet L66, rate limiters L90-121, CORS L136 defaulting to `false`).

## Confirmed Healthy (do not "fix")

- Date handling: `+ 'T00:00:00'` local-time convention and day-of-month clamping are applied
  consistently.
- Money handling: `parseFloat` results are rounded via `.toFixed(2)` before storage.
- Backend logging: `backend/config/logger.js` used throughout; no `console.*` in production paths.
- Security baseline: helmet, per-route rate limiting (upload 30/15min, backup 5/hr),
  CORS closed by default in production, path-traversal hardening in `utils/fileStorage.js`.
- Dark mode (`data-theme` + `prefers-color-scheme`), `prefers-reduced-motion`, and
  responsive breakpoints (480/600/768/1024) are all implemented.
- Property-based test coverage with `fast-check` on both layers.

---

## Validation Commands

| Purpose | Command |
|---|---|
| Full suite (preferred) | `scripts/run-test-summary.ps1` |
| Backend unit only | `cd backend; npm run test:unit` |
| Backend PBT only | `cd backend; npm run test:pbt` |
| Frontend all | `cd frontend; npm run test` |
| Frontend changed only | `cd frontend; npm run test:changed` |
| Lint (after R1) | `npm run lint` |
| Raw-fetch guardrail | `node scripts/validate-no-raw-fetch.js` |
| PBT guardrails | `node scripts/validate-pbt-guardrails.js` |
| Branch state | `git status --branch --short` |

---

## Progress Tracking

| # | Requirement | Status | PR | Notes |
|---|---|---|---|---|
| R1 | ESLint + Prettier toolchain | ✅ Done | #346 | ESLint **9** (plugins lack v10 peers); baseline 0 errors / 609 warnings |
| R2 | Ignore generated test artifacts | ✅ No change needed | #346 | Already ignored & untracked; `test-budget.json` is a tracked *input* |
| R3 | Sync root package version | ✅ Done | #346 | `version` removed + `private: true`; root is not one of the 7 locations |
| R21 | Dependabot PRs bypass all CI checks | ☐ Not started | | 12 guarded jobs incl. both required checks; workaround = `gh pr update-branch` |
| R20 | Frontend `test:fast*` Windows compat | ☐ Not started | | Add `cross-env`; found while validating R1 |
| R19 | Conditional hooks in `InsuranceStatusIndicator` | ☐ Not started | | 4 × `rules-of-hooks`; do before other Phase 1 work |
| R6 | Add `ErrorBoundary` | ☐ Not started | | |
| R4 | Shared accessible `<Modal>` shell | ☐ Not started | | Must satisfy 3 UxConsistency PBT guardrails |
| R5 | Migrate 25 modals to the shell | ☐ Not started | | 7 batches (5a–5g); clears ~198 a11y warnings |
| R8 | Bound analytics queries | ☐ Not started | | Characterization tests required first |
| R9 | Adopt `asyncHandler` in controllers | ☐ Not started | | 24 PRs, smallest controller first |
| R10 | Stop leaking `error.message` | ☐ Not started | | Land after R9 starts |
| R11 | Consolidate transaction helpers | ☐ Not started | | Recommend keeping `withTransaction` |
| R12 | Fix error masking in `createExpense` | ☐ Not started | | |
| R13 | Standardize activity-log fire-and-forget | ☐ Not started | | Do after R9 for controller sites |
| R7 | Structured logging + error states | ☐ Not started | | Start with `SharedDataContext`, then `SummaryPanel`; clears 70 `no-console` |
| R14 | Parameterize `${months}` SQL | ☐ Not started | | Not currently exploitable |
| R15 | Replace index-based list keys | ☐ Not started | | 8 high-risk sites; 39 lint warnings total |
| R18 | Remove duplicate `findById` methods | ☐ Not started | | `incomeRepository`, `investmentValueRepository`; bodies verified identical |
| R16 | Virtualize long lists | ☐ Not started | | Measure first — may be unnecessary |
| R17 | Decompose mega-components | ☐ Not started | | 6 PRs (17a–17f); coordinate with expense-form spec |

### Lint Ratchet Ledger

Rules held at `warn` in `eslint.config.js` pending the requirement that clears them.
Flip each to `error` as part of that requirement's PR.

| Rule | Warnings | Clears with |
|---|---|---|
| `react-hooks/rules-of-hooks` | 4 | R19 |
| `no-dupe-class-members` | 2 | R18 |
| `no-console` (frontend) | 70 | R7 |
| `react/no-array-index-key` | 39 | R15 |
| `jsx-a11y/*` (7 rules) | 198 | R5 |
| `react-hooks/*` (5 rules) | 114 | R17 |
| `no-unused-vars`, `no-useless-escape`, `no-case-declarations`, `no-regex-spaces`, `no-control-regex`, `no-misleading-character-class`, `no-prototype-builtins`, `no-async-promise-executor`, `react/no-unescaped-entities` | 182 | opportunistic |
