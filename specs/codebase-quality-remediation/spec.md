# Codebase Quality Remediation

> **Spec format:** Single-document spec (requirements + design + tasks combined). One file per feature.
> **Source:** Full-codebase audit performed 2026-09-04 using the `expense-tracker-audit` skill.
> **Status (2026-09-14):** Phase 0, **Phase 0.5**, and the first two Phase 1 items are
> complete. Production runs **v1.10.3** (`d2cb442`), up from a 2026-07-02 build.
>
> Verified in the field on production:
>
> | Check | Before | Now |
> | --- | --- | --- |
> | FDs on `expenses.db*` (R26) | 287 | **4** |
> | Deleted-file handles | — | **0** |
> | `integrity_check` | — | **ok** |
> | V8 heap cap (R29) | 2096 MB | **387 MB** |
> | `CapDrop` / `no-new-privileges` (R29) | none | **`[ALL]`** / **on** |
> | `StopTimeout` (R28) | 1s | **15s** |
>
> R28's graceful shutdown was validated on staging against a restored production database:
> SIGTERM → scheduler stopped → HTTP closed → **WAL checkpointed (107,152 bytes → 0)** →
> exit 0 in 625 ms, with `integrity_check` still `ok` after restart. Production carries
> `StopTimeout=15` as of the v1.10.3 recreate, so the handler is armed from its next stop.
>
> The Phase 0 release took two attempts. v1.10.1 was built and **caught by CI's Deployment
> Health Check before promotion** — R26 had a regression in `healthRoutes.js` that closed the
> shared connection (logged as **R31**, fixed in PR #375). v1.10.2 carried the fix; v1.10.3
> adds the first user-visible work (R6 error boundaries, R4 shared modal shell).
>
> **Next: R5 — migrate all 25 modals onto the R4 shell, in 7 batches.**

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

### Deployment & runtime ground truth (measured 2026-09-13)

The original audit reasoned about the codebase in isolation. **Production and staging both
run as Docker containers**, which changes the severity of several items. All figures below
were read from the live production container, not inferred.

| Fact | Value | Consequence |
|---|---|---|
| Running image | `bb59542`, built **2026-07-02** | Prod predates **all** of Phase 0 |
| PID 1 | `node server.js` (no init shim) | Node owns signal handling |
| Open FDs held by PID 1 | **306**, of which **287** are `expenses.db*` | R26 leak confirmed live (~95 connections in 36 h) |
| `nofile` limit | **1,048,576** | FD exhaustion is ~15 years away — **not** a real risk |
| `/config/database/pre-restore-backup-2025-11-19_*.db` | present | **Restore has been run in production** |
| Active WAL at rest | `expenses.db-wal` 107 KB, `-shm` 32 KB | Un-checkpointed data is normally in flight |
| `SIGTERM`/`SIGINT` handlers | **none anywhere in `backend/`** | No WAL checkpoint or connection close on stop → **R28** |
| `StopTimeout` | **1 second** | Docker SIGKILLs almost immediately → **R28** |
| Applied memory limit | `HostConfig.Memory: 0` — **none** | The repo compose's `512M` is not in effect → **R29** |
| V8 heap ceiling in container | **2096 MB** | Would be OOM-killed if a 512 MB limit were applied → **R29** |
| Compose file actually used | `G:\My Drive\Media Related\docker\media-applications.yml` | The repo's `docker-compose.yml` does **not** describe prod |
| Base image | `node:22-alpine` (Linux) | Windows-specific hardening never executes in prod |
| Backup destination | `/config/backups`, same bind mount as the database | A full host disk truncates backups → raises R27's value |
| Memory in steady state | 85.6 MiB | R8 is not causing memory pressure **today** |

**Implication for Windows-specific work.** R24/R25 invested heavily in Windows file-locking
semantics, and `archiveUtils` carries EBUSY/EPERM and ZlibError retry loops that **never
execute in production**. That code is harmless and should stay, but Windows-only failures
are a developer-ergonomics concern, not a product one. Do not spend further effort there,
and do not let a Windows-only symptom drive a severity rating again.

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
| R19 | Fix conditional hooks in `InsuranceStatusIndicator` | 1 | Frontend | ~~High~~ Low | Low | Low | R1 |
| R20 | Fix the frontend `test:fast*` scripts | 0 | Tooling | Low | Low | Low | — |
| R21 | Dependabot PRs bypass all CI checks | 0 | CI | Medium | Low | Low | — |
| R22 | Backend PBT shards flake on shared test DB | 0 | CI/Tests | Medium | Medium | Medium | — |
| R23 | Trivy outages reported as CRITICAL vulns | 0 | CI | Medium | Low | Low | — |
| R24 | Backup suites run against the real dev database | 0 | Tests/Safety | **High** | Medium | Medium | — |
| R25 | `backupService.pbt.test.js` fails locally, passes in CI | 0 | Tests | **High** | Medium | Medium | R26 |
| R26 | `getDatabase()` leaks a connection on every call | 0 | Backend/Safety | **Critical** | Medium | High | — |
| R27 | Archive creation is verified by a 2-byte header check | 0 | Backend/Safety | ~~Critical~~ Medium | Low | Medium | — |
| **R28** | **No graceful shutdown — WAL never checkpointed on stop** | **0.5** | **Backend** | ~~High~~ **Low** | Low | Medium | R26 |
| **R29** | **Container resource limits are declared but not applied** | **0.5** | **Deployment** | **Medium** | Low | Low | — |
| **R30** | **Release the Phase 0 backlog to production** | **0.5** | **Deployment** | **High** | Low | Medium | R26, R27 |
| **R31** | **Health route closed the shared connection** | **0.5** | **Backend/Safety** | **Critical** | Low | Low | R26 |

> R18–R20 were **discovered by the linter added in R1**, not by the manual audit.
> R21 was discovered while triaging the dependabot queue after the Phase 0 PR.
> R22 and R23 were discovered while investigating CI failures that R21's workaround exposed.
> R24 and R25 were discovered while validating R22; R26 while investigating R25;
> R27 while validating R26.
> **R28, R29 and R30 were discovered on 2026-09-13 by inspecting the live production
> container** — none of them are visible from the source tree alone.
> **R31 was discovered on 2026-09-14 by CI's Deployment Health Check**, which boots the real
> built image — the only check that exercises the artifact rather than the test harness.

**Recommended execution order** (updated 2026-09-14 — ✅ = landed):
✅ R1 → ✅ R2/R3 → ✅ R20 → ✅ R19 → ✅ R22 → ✅ R26 → ✅ R24/R25 → ✅ R21 → ✅ R23 → ✅ R27 →
✅ R30 (+ ✅ R31) → ✅ R29 → ✅ R28 → ✅ R6 → ✅ R4 → **R5** → R8 → R9 → R10 → R11/R12/R13 →
R7 → R14/R15/R18 → R16 → R17.

R26 moved ahead of R21: it is a live production data-corruption path, and it blocked R25.
R11 must follow R26, since a shared connection changes what a transaction means.
R27 dropped down the order once it was shown **not** to be the cause of the R25 failures.

**R30 is now first.** Nine days of Phase 0 produced exactly one production-behaviour change
(R26, PR #363) and it is still unreleased — prod runs a 2026-07-02 build. Shipping it is the
only action in this backlog that converts completed work into delivered value, and it is
cheap. R29 follows because it gates whether R8 is a performance item or a stability one.

**R28 was moved after R29 and downgraded High → Low on 2026-09-14.** It was originally
ordered second on the belief that an ungraceful stop endangered the database; measuring the
live settings (`journal_mode=wal`, `synchronous=FULL`) disproved that. It is hygiene, and it
does **not** gate R30.

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
| R20 | ✅ Done — `cross-env` added; `FAST_CHECK_NUM_RUNS` wired into `pbtOptions` (was dead code) |
| R21 | ✅ Fixed — guard removed from test jobs, kept on deploy jobs |

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

### Phase 0 retrospective — what actually reached production (audited 2026-09-13)

Phase 0 was scoped as four tooling items and grew to eleven, because each fix uncovered the
next: R22 → R24 → R25 → R26 → R27. Worth recording honestly, since the phase consumed nine
days and the spec's own "highest user-visible-value phase" (Phase 1) has not started.

Of the seven merged PRs, **exactly one changed production runtime behaviour**:

| PR | Items | Production runtime impact |
|---|---|---|
| #346 | R1/R2/R3 | None — zero source changes by design (R1 AC10) |
| #348 | R19/R20 | None — R19 was proven behaviour-neutral by its own negative control |
| #350 | R22 | None — `closeTestDatabase()` is a test-only function |
| **#363** | **R26** | **Yes — `getDatabase()` / `closeDatabase()` on the production path** |
| #364 | R24/R25 | None — the `CONFIG_DIR` override is env-gated and inert unless set |
| #365 | R21 | None — CI only |
| #366 | R23 | None — CI only |

And R26 has **not shipped**: the latest tag is `v1.10.0` (2026-07-02), predating Phase 0, and
no release has been cut since.

Two caveats on R26's value that should not be overstated:

- **The file-descriptor leak was never measured.** R26's own design notes called for checking
  `lsof`/handle counts on a long-running instance; that was not done. The leak is real and
  platform-independent, but its production magnitude is unquantified.
- **The observed corruption was Windows-only.** Production runs `node:22-alpine`, where
  `copyFileSync` writes through the same inode and SQLite usually survives the overwrite. The
  restore path is genuinely unsafe, but real-world exposure is lower than the dev evidence
  implies.

The rest of Phase 0 delivered **engineering** value, not user value: the backup suite went
from 3 failed / 637s to 50/50 / 56s, dependabot bumps are now actually tested (which caught
4 of 6 open PRs as unmergeable), dev databases stopped being corrupted by the test suite, and
CI stopped raising false CRITICAL security alerts. All worth having; none of it visible to a
user.

**Recommendation:** cut a release containing R26 + R27 so the one real fix reaches production
(**R30**), then close the two defects that only the running container revealed (**R28**,
**R29**), then start R6 — the first item in this spec a user would actually notice.

> Follow-up: inspecting the live container on 2026-09-13 both **confirmed** R26's leak in the
> field (287 of 306 FDs) and **downgraded** the FD-exhaustion concern to a non-issue. It also
> proved a restore has genuinely been run in production. Lesson: the container is a source of
> ground truth the source tree cannot provide, and it should have been checked in the
> original audit rather than nine days in.

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

## R20: Fix the frontend `test:fast*` scripts — ✅ DONE

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

### Outcome (as landed)

**Files changed:** `frontend/package.json` (2 scripts + `cross-env` devDependency),
`frontend/package-lock.json`, `frontend/src/test/pbtArbitraries.js`.

`pbtOptions` now resolves `numRuns` as `options.numRuns ?? envNumRuns ?? (isCI ? 10 : 20)`,
with `envNumRuns` parsed defensively so a non-numeric or non-positive value is ignored.

**Verified:**

| Condition | `pbtOptions().numRuns` | `pbtOptions({numRuns:100}).numRuns` |
|---|---|---|
| unset | 20 (unchanged) | 100 |
| `FAST_CHECK_NUM_RUNS=3` | **3** | 100 |
| `FAST_CHECK_NUM_RUNS=abc` | 20 (fallback) | 100 |
| `FAST_CHECK_NUM_RUNS=0` | 20 (fallback) | 100 |

`npm run test:fast -- yoyComparison` now runs on Windows (2 files, 13 tests passed) where
it previously failed before invoking vitest at all. `npm ci` in `frontend/` is clean.

Note the `{ ...pbtOptions(), numRuns: 100 }` spread pattern used across the `useDataSync`
PBT suites correctly keeps its explicit override — consistent with AC3.

---

## R21: Dependabot PRs bypass all CI checks — ✅ DONE

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

### This gap hid a real test failure within an hour

Applying the workaround to **#343** (`jest` 30.4.2 → 30.5.0) turned a `CLEAN` PR into a
failing one: **all three Backend PBT shards failed**, 15 tests down, with
`SQLITE_READONLY`, `SQLITE_CANTOPEN`, and `SQLITE_ERROR: no such table: activity_logs`.
Backend *unit* tests passed, so the breakage was specific to the PBT setup/teardown path.

> ⚠️ **Correction:** the failure is **flaky, not caused by the jest bump.** Re-running the
> identical commit made shard 3/3 pass, and the failing suite
> (`expenseService.insurance.pbt.test.js`) passes locally under jest 30.5.0 with
> `--runInBand`. The underlying defect is pre-existing test-DB contention under parallel
> sharding — logged separately as **R22**.

The point stands regardless of root cause: **CI reported `CLEAN` for a PR whose test suite
was red.** Whether the redness came from the dependency or from a latent flake, the
required checks did not surface it.

### Evidence log

Every entry below reported `mergeStateStatus=CLEAN` with all test jobs at `skipping 0`.
Forcing a real run with `gh pr update-branch` is the only reason any of it was caught.

| Date | PR | Bump | What real CI revealed |
|---|---|---|---|
| 2026-09-04 | #343 | `jest` 30.4.2 → 30.5.0 | 3 PBT shards red (later traced to the R22 flake, not the bump) |
| 2026-09-11 | #352 / #353 | `eslint` 9 → 10 | **Unbuildable.** `ERESOLVE` — plugins cap at ESLint 9. Closed. |
| 2026-09-11 | #355 / #356 | `vitest` 4 → 5 | **Mutually blocking.** `@vitest/ui` pins an exact peer, so neither installs alone. Failed in 9s / 15s. Closed, superseded by #360. |
| 2026-09-11 | #360 | `vitest` 4 → 5 (combined) | A genuine vitest 5 breaking change in 3 test files (see below) |

Of six dependabot PRs open on 2026-09-11, **four were not mergeable as-is** — two
structurally impossible, two requiring a code fix. All six showed `CLEAN`.

This also reframes the cost argument for R21: the guards were presumably added to save CI
minutes, but the manual `update-branch` dance costs a full CI run *anyway*, plus human
triage time, and only happens when someone remembers.

### Known dependency constraints (discovered via this workaround)

These are recorded here because they are the practical output of R21's absence.

- **ESLint is pinned to 9.** `eslint-plugin-react` (peer `^9.7`) and
  `eslint-plugin-jsx-a11y` (peer `^9`) have no v10 support; `npm i eslint@10` fails with
  `ERESOLVE`. `.github/dependabot.yml` now ignores **major** bumps for `eslint` and
  `@eslint/js` (PR #359). `eslint-plugin-react-hooks@7` already supports v10 — remove the
  ignore rule once the other two publish.
- **`vitest` and `@vitest/*` must move together.** `@vitest/ui` declares an *exact* peer on
  `vitest` (e.g. `vitest@"4.1.11"`), so a split bump can never install. `.github/dependabot.yml`
  now groups them with no `update-types` filter, so majors arrive as one PR (PR #359).
- **vitest 5 breaking change:** jsdom exposes `sessionStorage`/`localStorage` as
  getter-only, so `global.sessionStorage = mock` throws
  `TypeError: Cannot set property ... which has only a getter`. Use
  `vi.stubGlobal('sessionStorage', mock)` + `vi.unstubAllGlobals()`. Fixed in three
  `BudgetAlert*.integration.test.jsx` files (PR #360).

> **Validation note:** frontend suites must be run locally with `CI=true`
> (`npx cross-env CI=true npx vitest --run`). `vitest.setup.js` and `pbtOptions` branch on
> `isCI`, so a run without it takes different code paths. The vitest 5 breakage passed
> locally without `CI=true` and only failed in CI.

### Acceptance Criteria

1. THE two required checks (`Backend Tests Status`, `Frontend Tests Status`) and the jobs
   they depend on SHALL run for `dependabot[bot]`-authored PRs.
2. `Lockfile Integrity` SHALL run for dependabot PRs (it exists specifically to catch
   lockfile drift, which is exactly what a dependency bump changes).
3. THE `github.actor != 'dependabot[bot]'` guard MAY be retained on jobs where the cost
   saving is real and the risk is nil: `Build and Push to GHCR` and `Deployment Health Check`.
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

### Resolution (2026-09-11, PR #365)

Removed `github.actor != 'dependabot[bot]'` from all ten test and quality jobs in
[.github/workflows/ci.yml](.github/workflows/ci.yml): `path-filter`, `lockfile-integrity`,
`backend-unit-tests`, `backend-pbt-shards`, `backend-pbt-tests`, `backend-tests-status`,
`frontend-tests`, `frontend-tests-status`, `security-audit`, `test-health-report`.

None of them use secrets or need write scope, so dependabot's read-only `GITHUB_TOKEN` is
sufficient — the middle path floated in the design notes (keeping the expensive PBT shards
guarded) proved unnecessary.

Removing the guard from `path-filter` is the load-bearing part: while that job was skipped,
every downstream `needs.path-filter.outputs.*` was empty, so path filtering could not have
worked for dependabot even if the test jobs had run.

Per AC3, `build-and-push-ghcr` and `deployment-health-check` **keep** the guard — they
request `contents: write` / `packages: write`, which dependabot events are not granted, so a
run there could only fail. Reason recorded inline in the workflow.

The `gh pr update-branch` workaround is now obsolete.

> ⚠️ **AC5 is still outstanding.** This cannot be verified until the next real dependabot
> PR opens; that PR should show executed checks rather than `skipping 0`. Do not consider
> R21 fully closed until that is observed.

---

## R22: Backend PBT shards flake on shared test database

**User Story:** As a maintainer, I want sharded PBT runs to be deterministic, so a red
build means a real defect and not a race.

> Discovered 2026-09-04 while investigating the #343 failure.

### Current Behavior

CI runs backend PBT as three parallel shards
(`jest --testPathPatterns=pbt --shard=N/3`, no `--runInBand`). On PR #343 all three shards
failed with a mix of SQLite errors indicating the test database was missing, unwritable, or
uninitialised:

- `SQLITE_READONLY: attempt to write a readonly database`
- `SQLITE_CANTOPEN: unable to open database file`
- `SQLITE_ERROR: no such table: activity_logs`

Re-running the **same commit** with no changes made shard 3/3 pass, confirming a race
rather than a code defect. The same suite passes locally under `--runInBand`.

Note `backend/package.json` runs `test` and `test:pbt` with `--runInBand`, while CI uses
sharding *without* it — so the parallel path is materially less exercised than the local one.

### Acceptance Criteria

1. THE root cause SHALL be identified — most likely multiple jest workers sharing one
   SQLite file path via `backend/jest.globalSetup.js` / `jest.setup.js`.
2. EACH jest worker SHALL use an isolated database file (e.g. keyed on
   `process.env.JEST_WORKER_ID`), or PBT execution SHALL be serialised.
3. THE backend PBT suite SHALL pass 5 consecutive sharded CI runs without a re-run.
4. THE fix SHALL NOT materially increase total PBT wall time.
5. THE `backend-pbt-shard` runtime budget SHALL be re-derived from observed timings once
   the flakiness is fixed (see below) — a budget below the noise floor produces false reds.

### Observed variance (same commit, three runs)

`#343` shard 2/3, identical code each time:

| Run | Result | Elapsed |
|---|---|---|
| 1 | ❌ 15 tests failed (`SQLITE_READONLY` / `CANTOPEN` / `no such table`) | 55s |
| 2 | ❌ all 269 tests **passed**, failed the runtime budget | **113s** |
| 3 | ✅ pass | 41s |

Baseline on `main` (#346, jest 30.4.2) was 38s for the same shard. So shard 2 ranges
**41s–113s**, while `test-budget.json` sets `backend-pbt-shard.maxSeconds = 90`. The budget
sits *inside* the observed variance band, so it will keep producing false failures
regardless of the SQLite race. Both need fixing.

Note run 2 is a distinct failure mode worth calling out: **every test passed but the job
went red**, and the log line was `Budget exceeded! 113s > 90s`. A reader skimming for test
failures finds none.

### Root Cause (confirmed 2026-09-05)

> Two earlier hypotheses were **wrong** and are recorded here so nobody re-treads them:
>
> 1. ❌ *"A fixed DB path not keyed on `JEST_WORKER_ID`."* Per-worker isolation already
>    exists — `db.js#L163` produces `test-expenses-worker-<id>.db`, and
>    `test/dbIsolation.js#L38` does the same.
> 2. ❌ *"`SKIP_TEST_DB` suites racing a worker suite."* All three suites that set
>    `SKIP_TEST_DB = 'true'` (`backupService.integration`, `backupService.pbt`,
>    `backupController.integration`) contain "backup" in their filename, and CI's shard
>    command excludes them via `--testPathIgnorePatterns="backup"`. Backup tests run only
>    on shard 1, serially, via `npm run test:backup:ci` (`--runInBand`).
>
> Also note **shards cannot race each other** — each is a separate job on a separate
> runner with its own filesystem. Any race is between jest **workers inside one shard**.

The actual defect is in `closeTestDatabase()` (`backend/database/db.js#L328`):

```js
function closeTestDatabase() {          // declared sync...
  testDbInstance.close();               // ...but sqlite3 close() is ASYNC, no callback
  testDbInstance = null;
  fs.unlinkSync(testDbPath);            // deletes the file while close() is still flushing
}
```

and in its caller (`backend/jest.setup.js#L89`), which did not await it:

```js
afterAll(async () => {
  closeTestDatabase();                  // returns before the close completes
});
```

Jest resets the module registry per test **file**, so `testDbInstance` is fresh each file —
but `getTestDbPath()` is constant per **worker**. So within a single worker:

1. File A finishes → `afterAll` fires `close()` (async, still flushing) and immediately
   `unlinkSync`s the database file.
2. File B starts → `beforeAll` → `getTestDatabase()` → `createTestDatabase()` recreates a
   database at **the same path**.
3. File A's in-flight writes and WAL flush land on File B's brand-new database.

That produces exactly the three observed signatures:

| Symptom | Cause |
|---|---|
| `SQLITE_CANTOPEN: unable to open database file` | file unlinked between open and use |
| `SQLITE_READONLY: attempt to write a readonly database` | handle whose file was unlinked/replaced |
| `SQLITE_ERROR: no such table: activity_logs` | writes hitting a database recreated mid-flight |

The un-awaited fire-and-forget `activityLogService.logEvent()` calls tracked in **R13**
make this materially worse: those writes routinely outlive the test that triggered them,
so they are the most likely writers to land after teardown. R13 and R22 are related — fixing
R13 reduces the exposure window, but R22 is the actual defect.

### Reproduction

The CI shard command alone does **not** reproduce it (passed locally, 42 suites / 380
tests). What matters is maximising per-worker *file churn*, since the race is per
file-transition. Constraining workers does that:

```
npx cross-env NODE_ENV=test CI=true FAST_CHECK_NUM_RUNS=5 \
  jest --testPathPatterns=pbt --testPathIgnorePatterns="backup" --maxWorkers=2
```

Pre-fix this failed 1 run in 2 (`Test Suites: 1 failed, 125 passed`;
`Tests: 1 failed, 1002 passed`). It is intermittent, so a single green run proves nothing —
always run it several times.

Note `jest.setup.js#L33` sets `jest.retryTimes(2)` in CI, which masks a proportion of these
failures. Consider whether that retry is hiding other real flakes.

### Fix

- `closeTestDatabase()` is now `async` and awaits `db.close(cb)` **before** unlinking the
  file and its `-wal`/`-shm` sidecars.
- `jest.setup.js` `afterAll` now `await`s it, so the next file in the worker cannot start
  until teardown is complete.
- `recreateTestDatabase()` now awaits it too.
- The two existing callers (`schemaConsistency.test.js#L22`,
  `billingCycleRepository.consolidated.pbt.test.js#L485`) already used `await`, so their
  intent is now actually honoured rather than silently ignored.

### Remaining work (not covered by the fix) — ✅ done in #350

The runtime budget was a **separate** defect: `backend-pbt-shard.maxSeconds = 90` sat inside
the observed 41s–113s band, so it produced false reds even with the race fixed. Raised to
**150s** in PR #350, with the rationale recorded in `test-budget.json`. Re-tighten once
post-fix CI timings have settled.

### Test Plan

- Run the `--maxWorkers=2` reproduction above at least 3 times; expect zero failures.
- Run the exact CI shard command (`--shard=N/3`) for all three shards.
- Confirm `npm run test:backup:ci` still passes (it uses `SKIP_TEST_DB` and the real DB).
- Watch the first few CI runs post-merge for shard timing and stability.

---

## R23: Trivy infrastructure failures are reported as CRITICAL vulnerabilities — ✅ DONE

**User Story:** As a maintainer, I want a scanner outage to be distinguishable from a real
vulnerability finding, so I don't chase a security alert that isn't one.

> Discovered 2026-09-04 while investigating a red `main` after the Phase 0 merge.

### Current Behavior

[.github/workflows/ci.yml#L509](.github/workflows/ci.yml#L509):

```bash
docker run --rm ... aquasec/trivy:0.57.1 image --exit-code 1 --severity CRITICAL ... \
  || { echo "::error::Trivy found CRITICAL vulnerabilities"; exit 1; }
```

The `||` branch treats **any** non-zero exit as a vulnerability finding. On the `main` run
for `bdf7a38` (the #346 merge) Trivy actually failed to start:

```
FATAL Fatal error init error: DB error: failed to download vulnerability DB:
  ... BLOB_UNKNOWN: Unknown blob sha256:7cff1295... (mirror.gcr.io/aquasec/trivy-db:2)
```

The image built and pushed successfully; only the scanner's DB fetch failed. CI nonetheless
reported **"Trivy found CRITICAL vulnerabilities"** and turned `main` red. That is a false
security alert caused by a transient upstream registry problem.

A second, quieter defect: the informational scan at
[L500](.github/workflows/ci.yml#L500) ends in `| tee trivy-results.txt`, and the step does
not set `pipefail`. A fatal error there is masked by `tee`'s exit code, so the first scan
silently produced an empty/garbage report.

### Acceptance Criteria

1. A Trivy **execution** failure (DB download, image pull, daemon error) SHALL be reported
   distinctly from a Trivy **finding**, with an accurate message.
2. THE vulnerability-DB download SHALL be retried before the step is failed.
3. THE step SHALL set `pipefail` (or capture the exit code explicitly) so the piped
   informational scan cannot mask a fatal error.
4. THE workflow SHALL still fail on genuine CRITICAL OS/library findings — the gate is not
   being weakened.
5. THE behavior SHALL be verified by simulating both cases: a real CRITICAL finding, and an
   unreachable DB repository.

### Design / Implementation Notes

- Prefer the maintained `aquasecurity/trivy-action`, which supports DB caching and retries,
  over a hand-rolled `docker run`.
- If keeping `docker run`, set `TRIVY_DB_REPOSITORY` to a fallback mirror (e.g.
  `ghcr.io/aquasecurity/trivy-db`) and wrap the call in a small retry loop.
- Trivy exits 1 for both findings and fatal errors, so exit code alone cannot disambiguate —
  grep the output for `FATAL`/`init error`, or use `--format json` and check for a result set.
- Consider caching the DB between runs to reduce exposure to upstream outages entirely.
- `aquasec/trivy:0.57.1` is pinned and somewhat old; check whether a newer patch handles the
  `BLOB_UNKNOWN` mirror case more gracefully.

### Test Plan

- Point `TRIVY_DB_REPOSITORY` at a nonexistent repo and confirm the step reports an
  infrastructure error, not a vulnerability finding.
- Confirm a genuine CRITICAL finding still fails the build with the correct message.

### Resolution (2026-09-12)

Restructured the step so the scan and the gate are separate concerns. Trivy now runs **once**
with `--format json --exit-code 0`, and the pass/fail decision is made afterwards by querying
the JSON with `jq`. Because the scan no longer uses `--exit-code 1`, a non-zero exit can only
mean "Trivy failed to run" — which is reported with an explicitly different message stating
the image was **not assessed** (AC1).

The DB download is retried 3 times across two mirrors, `ghcr.io/aquasecurity/trivy-db:2` and
`mirror.gcr.io/aquasec/trivy-db:2` — the latter being the one that returned `BLOB_UNKNOWN`
and turned `main` red (AC2). `set -euo pipefail` is now set, and the informational report is
produced by `trivy convert` from the JSON rather than by a `tee` pipeline, so there is no
pipe left to mask a fatal error (AC3). The CRITICAL gate still fails the build (AC4).

Collapsing two full scans into one also halves the exposure to a DB outage and removes a
duplicate image pull.

**Additional defect found and fixed while restructuring:** the summary counted severities
with `grep -c "CRITICAL" trivy-results.txt`, which counts *lines containing the word* —
including the table header, the severity legend and any package whose name contains the
string. Every severity count in every previous build summary was inflated. Counts are now
derived per-vulnerability from the JSON.

### Verification (AC5)

AC5 asks for both cases to be simulated. Since neither can be triggered on demand in CI, the
real step script is extracted from `ci.yml` by a YAML parser and executed against a stubbed
`docker`, so the assertions run against the shipped code rather than a copy:

| Scenario | Expected | Result |
|---|---|---|
| Vulnerability DB unreachable | exit 1, infrastructure message, **no** vulnerability claim | ✅ |
| Genuine CRITICAL finding | exit 1, `found 1 CRITICAL vulnerabilities` | ✅ |
| Clean image (HIGH/MEDIUM only) | exit 0, accurate per-severity counts | ✅ |
| First DB mirror fails, fallback works | exit 0, scan completes | ✅ |

> The harness is a throwaway — it is not committed, since it depends on stubbing `docker`
> and adds a maintenance surface disproportionate to a single CI step.

---

## R24: Backup test suites run against the developer's real database — ✅ DONE

**User Story:** As a developer, I want running the documented test suite to be safe, so it
cannot corrupt or destroy my local data.

> Discovered 2026-09-05 while validating R22.

### Current Behavior

Three suites deliberately set `SKIP_TEST_DB = 'true'` so they can exercise real file I/O:
`backupService.integration.test.js#L9`, `backupService.pbt.test.js#L12`,
`backupController.integration.test.js#L9`. That flag makes `getDatabase()`
(`db.js#L131`) bypass the per-worker test database and return the **real**
`backend/config/database/expenses.db`.

So `npm run test:backup:ci` — a documented script — reads and writes the developer's
actual database. Two consequences:

1. **The dev database can be corrupted.** After a local run, `PRAGMA integrity_check` on
   `backend/config/database/expenses.db` reports widespread
   `btreeInitPage() returns error code 11` across ~100 pages. A file named
   `expenses.db.corrupted` dated 2026-01-21 already sits in that directory, so this has
   happened at least once before.
2. **The safety backup is destroyed by the safety mechanism.**
   `jest.globalSetup.js#L39` copies the current database over a **fixed** filename,
   `config/backups/pre-test-backup.db` ("Use a fixed name for the pre-test backup
   (overwrites previous)"). It performs no integrity check first, so once the database is
   corrupt the next test run overwrites the last good backup with a copy of the corrupt
   file. Both files now carry the identical corruption signature.

CI is unaffected because runners start with no `expenses.db` at all — which is precisely
why this has stayed invisible.

### Why this went unnoticed for months

All real testing in this project happens through **staging/preview Docker containers**; the
local Node environment is never actually run as an application. So
`backend/config/database/expenses.db` is a stale artifact that nobody reads — it exists
only because the backup suites keep recreating and writing to it. Corruption there produces
no visible symptom until someone runs `npm run test:backup:ci` locally, which is rare.

That also means the file has no value: **the correct local state is CI's state — no
database at all.** Restoring a copy of production into it would be actively worse, putting
real financial data on a developer machine for no benefit and handing the backup suites a
populated database to write to.

Local remedy (applied 2026-09-05): quarantine the corrupt files rather than deleting them —

```powershell
# from backend/
Rename-Item config/database/expenses.db      expenses.db.corrupt-<stamp>
Rename-Item config/backups/pre-test-backup.db pre-test-backup.db.corrupt-<stamp>
# ...plus the -wal / -shm sidecars
```

The suites then recreate a clean database exactly as they do on a CI runner.

> ⚠️ **Quarantining the corrupt database did NOT make the backup suites pass.**
> `backupService.pbt.test.js` still failed from a clean state. The corruption is therefore
> a *symptom*, not the cause — see **R25**, which is a separate, pre-existing failure.
> The most likely relationship is that R25's failing restore paths are what corrupted the
> database in the first place.

### Acceptance Criteria

1. Backup suites SHALL operate on a disposable fixture database, not
   `backend/config/database/expenses.db`.
2. IF operating on the real path is genuinely required, THE suite SHALL copy it to a temp
   location, run there, and never write to the original.
3. `jest.globalSetup.js` SHALL run `PRAGMA integrity_check` before overwriting
   `pre-test-backup.db`, and SHALL refuse to overwrite a good backup with a corrupt source.
4. THE pre-test backup SHALL be timestamped or rotated (keep N) rather than a single fixed
   filename, so one bad run cannot destroy the only copy.
5. Running the full backend suite locally SHALL leave `expenses.db` byte-identical.

### Design / Implementation Notes

- AC5 is the real acceptance test: hash the database before and after a full run.
- Check `backupService`'s restore path — restore overwrites the DB file wholesale, which is
  the most likely corruption vector when another connection holds it open.
- Relates to R22: the same "unlink/replace a database file other connections still hold"
  pattern is the root cause in both. Fixing R22's `closeTestDatabase` does **not** fix this,
  because these suites bypass that code path entirely.
- Consider making `SKIP_TEST_DB` point at a dedicated fixture path rather than at
  production, which would fix the class of problem rather than one instance.

### Test Plan

- Record `Get-FileHash` of `expenses.db`, run `npm run test:backup:ci`, confirm unchanged.
- Corrupt a scratch database deliberately and confirm `globalSetup` refuses to overwrite a
  known-good `pre-test-backup.db` with it.

### Resolution (2026-09-11)

Fixed by isolation rather than by hardening the pre-test backup. `CONFIG_DIR` in
`backend/config/paths.js` was a module-level constant with no override, so tests had no
supported way to redirect file I/O — which is why they wrote to the real tree in the first
place. It now honours `process.env.CONFIG_DIR`, and `jest.globalSetup.js` points that at a
throwaway `backend/.test-config/` tree which it wipes at the start of every run.

`getTestDbPath()` (`db.js`) and `ensureTestDirectories()` (`jest.setup.js`) were also
routed through `getConfigDir()` so no test path resolves against `backend/config` any more.

ACs 3 and 4 (integrity-check and rotate `pre-test-backup.db`) were **dropped as obsolete**:
the pre-test backup existed only to protect the real database from the test suite, and the
suite no longer touches it. `process.env.PRE_TEST_BACKUP_PATH` had no readers anywhere in
the repo, so nothing consumed it. That whole block was removed.

Verified: dev `expenses.db` mtime identical before and after a full PBT run, and the real
`config/invoices` + `config/statements` file count unchanged (1029 → 1029) across a backup
run — AC5 satisfied.

---

## R25: `backupService.pbt.test.js` fails locally but passes in CI — ✅ DONE

**User Story:** As a developer, I want the documented backup test script to pass on my
machine, so I can validate backup changes before pushing.

> Discovered 2026-09-05 while validating R22.

### Current Behavior

`npm run test:backup:ci` fails locally (Windows) and has evidently done so for some time:

| Code under test | `FAST_CHECK_NUM_RUNS` | Result |
|---|---|---|
| `main` (unmodified) | 3 | **8 failed**, 6 passed, 14 total |
| R22 branch | 15 | **3 failed**, 11 passed, 14 total |

The same suite **passes in CI** — #343's `Backend PBT Shard 1/3` job is green at 1m22s, and
that job includes the `Run backup tests (serial, shard 1 only)` step.

Failure signatures are assertion-level, not crashes:

```
expect(received).toBe(expected)   Expected: 2   Received: 0
expect(received).not.toBeNull()   Received: null
```

i.e. backups that the test created were not found afterwards.

**This is explicitly NOT caused by R22.** Reverting `db.js` and `jest.setup.js` to their
`main` versions reproduces the failure (worse), and these suites set `SKIP_TEST_DB = 'true'`
so `jest.setup.js#L83` returns early and never calls the function R22 changed.

The suite is also extremely slow locally — a single run took **1019s–1562s**, versus
seconds in CI. `jest.retryTimes(2)` (`jest.setup.js#L33`, CI-only) multiplies each failure
by three, which accounts for some but not all of that.

### Leading hypothesis: platform

CI is `ubuntu-24.04`; local is Windows. The backup service produces `.tar.gz` archives and
performs file moves/deletes on an open SQLite database — all areas where Windows semantics
differ sharply from Linux:

- Windows refuses to delete or rename a file with an open handle; POSIX permits it.
- `tar`/gzip handling and path separators differ.
- `Expected: 2, Received: 0` is consistent with archive creation silently failing, or
  listing not seeing files written under a different path convention.

### Root cause (confirmed 2026-09-05) — see R26

Investigation traced this to **leaked database connections**, not to archive handling.
See **R26**, which is the underlying defect; R25 is its most visible symptom.

Hypotheses eliminated along the way (do not re-tread):

- ❌ **Illegal filenames on Windows.** The generator is constrained by
  `isSafeFilename = /^[a-zA-Z0-9]+$/` (`backupService.pbt.test.js#L34`), so no
  Windows-reserved characters can be produced.
- ❌ **Missing Windows retry logic.** `_restoreDirectory` (`backupService.js#L793`) already
  retries `EBUSY`/`EPERM` three times, and `archiveUtils.extractArchive#L139` already
  retries `ZlibError`. Windows was considered by the original author.
- ❌ **`closeDatabase()` is async-unsafe like R22's `closeTestDatabase()`.** It is actually
  correct — it opens a connection, runs `PRAGMA wal_checkpoint(TRUNCATE)`, and closes with a
  callback. The problem is *which* connection it closes (see R26).

### Clean-state measurements

Baseline matters here: starting from an already-corrupt database, **all 14** tests fail.
Starting from a genuinely clean state (no `expenses.db`), only **3** fail:

| Starting state | Result |
|---|---|
| Corrupt `expenses.db` present | 14 failed, 0 passed |
| Clean (no `expenses.db`) | **3 failed, 11 passed** |

The three genuine failures are all restore/listing properties:

- Property 3 — Backup/Restore Round-Trip (`backupService.pbt.test.js#L446`)
- Property 4 — Backup Listing Accuracy
- Property 6 — Restore File Count Accuracy (`#L621`), `Expected: 2, Received: 0`

Always clear `config/database/expenses.db` before measuring, or the cascade will hide the
real signal.

### Acceptance Criteria

1. THE root cause SHALL be identified and recorded (platform-specific behaviour vs. genuine
   product bug in `backupService`).
2. IF it is a genuine bug in backup/restore, it SHALL be fixed — backup integrity is a
   data-safety feature and a Linux-only guarantee is not sufficient assurance.
3. IF it is purely a test-harness platform assumption, the suite SHALL either be made
   platform-agnostic or be explicitly skipped on Windows with a clear message, so it does
   not silently rot.
4. THE suite's local runtime SHALL be brought into a sane range (target: under 2 minutes).
5. `npm run test:backup:ci` SHALL pass on both Windows and Linux, or skip loudly on Windows.

### Design / Implementation Notes

- Start by running a *single* property with `FAST_CHECK_NUM_RUNS=1` and reading the full
  assertion context; the aggregate output is dominated by retry noise.
- Check whether `backupService` unlinks/renames the database while a connection is open —
  that is the R22 defect class again, and it would fail on Windows while succeeding on Linux.
- Investigate the 1000s+ runtime separately; it may be a timeout-and-retry loop rather than
  real work, which would also point at a blocked file operation on Windows.
- Relates to **R24**: these failing restore paths are the most likely cause of the observed
  dev-database corruption.

### Test Plan

- Run on Windows and on Linux (or a container) and compare.
- Once fixed, confirm `Get-FileHash` of `expenses.db` is unchanged by a full run (R24 AC5).

### Resolution (2026-09-11) — second root cause: file accumulation

R26 fixed the SQLite corruption and one of the three failures. The remaining two had a
separate cause, and it was **not** platform semantics and **not** archive corruption.

The backup PBT suites write invoice and statement files into the real
`backend/config/invoices` tree and delete them in a `finally`. A run that times out or
crashes skips that cleanup. Every leaked file is then copied by *every* subsequent
`performBackup()` — once to stage, once to archive — so the cost compounds:

| | With ~1000 leaked files | Clean tree |
|---|---|---|
| `performBackup()` | 1,143 ms | **15 ms** |
| Backup suite | 2 failed / 12 passed | **50/50 passed** |

That is a ~75× slowdown, which pushed the suite past its timeout, which skipped more
cleanup, which leaked more files. A self-reinforcing spiral, and it explains the 1000s+
local runtimes. **CI never sees it because runners start with an empty tree**, and a clean
run leaks zero files — so the divergence was never about Windows at all.

Fixed by the same isolation change as R24: tests now run against a `.test-config` tree that
is wiped before every run, so accumulation is impossible by construction.

A prefix-matching purge (`invoice_`, `roundtrip_`, …) was tried first and **rejected**: it
cleared 693 of 1022 strays, but the remaining 329 were written through the real upload path
as `{expenseId}_{timestamp}_{name}.pdf` and are indistinguishable from genuine user data.
The suite still failed. Pattern-matching cannot solve this safely; isolation can.

Outcome: `npm run test:backup:ci` **50/50 passed in 56s** (was 3 failed / 637s), full unit
suite 2229 passed, full PBT suite 1022 passed. AC4's "under 2 minutes" target met.

---

## R26: `getDatabase()` leaks a new SQLite connection on every call

**User Story:** As a user restoring a backup, I want the restore to replace my database
safely, so it cannot corrupt the file it is restoring into.

> Discovered 2026-09-05 while investigating R25. **This is a production data-safety issue,
> not just a test problem.**

### Current Behavior

For the production path, `getDatabase()` (`backend/database/db.js#L125`) constructs a
**brand-new** connection on every call and never closes it:

```js
return new Promise((resolve, reject) => {
  const db = new sqlite3.Database(DB_PATH, (err) => { ... resolve(db); });
});
```

Contrast the test path, which correctly memoises a singleton in `testDbInstance`.

Measured across `backend/repositories/**` and `backend/services/**` (excluding tests):

| Metric | Count |
|---|---|
| `await getDatabase()` call sites | **212** |
| Call sites that ever call `db.close()` | **0** |

So every repository operation opens an OS file handle to `expenses.db` that is never
released.

### Field measurement (2026-09-13) — confirms the leak, corrects the risk

The original write-up speculated about "a slow file-descriptor climb in the production
container" and never checked. Measured on the live container (uptime 36 h, running the
pre-fix build `bb59542`):

| Metric | Value |
|---|---|
| Total FDs held by PID 1 | 306 |
| FDs pointing at `expenses.db*` | **287** (~95 connections × db + `-wal` + `-shm`) |
| `nofile` limit | **1,048,576** |

**The leak is real and confirmed.** But at ~2.6 connections per hour, FD exhaustion is
roughly *fifteen years* away, so **file-descriptor exhaustion is not a credible risk** and
this spec should stop implying it is.

The risk that matters is the restore path — and that is not hypothetical either:

```
/config/database/pre-restore-backup-2025-11-19_14-33-23-764Z.db
```

**A restore has actually been performed in production.** So the overwrite-while-open path
below is a used feature that executes with ~95 stale handles on the file being replaced, not
a theoretical concern. That, not the FD count, is why R26 is Critical.

### Why this corrupts the database during restore

`restoreBackup()` (`backupService.js#L552-571`) does the right-looking thing:

```js
const { closeDatabase } = require('../database/db');
await closeDatabase();              // checkpoint WAL + close
if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
fs.copyFileSync(extractedDbPath, DB_PATH);   // overwrite
```

But `closeDatabase()` (`db.js#L444`) opens **its own new connection**, checkpoints, and
closes **that one**. It has no reference to — and cannot close — the connections leaked by
the other 212 call sites. So `copyFileSync` overwrites `expenses.db` while an arbitrary
number of live connections still hold it open, each with its own page cache and WAL state.

This is the same defect class as R22 (replacing a file other connections still hold), one
layer up.

### Why it fails on Windows but passes in CI

- **Linux:** `copyFileSync` writes through to the same inode. Existing handles see the new
  bytes; SQLite often survives because the WAL was truncated first. CI is also short-lived
  and low-concurrency, so few connections are outstanding.
- **Windows:** file handles are far less forgiving, and cached pages from the pre-overwrite
  database get flushed back over the new file, producing precisely the observed
  `SQLITE_CORRUPT: database disk image is malformed`.

This also explains **R24**: the corruption of the dev database is caused by the restore
path itself, and `jest.globalSetup.js` then copies the corrupt file over the only backup.

### Acceptance Criteria

1. `getDatabase()` SHALL NOT open an unbounded number of connections. It SHALL return a
   memoised connection (or a bounded pool) for the production path, mirroring the existing
   `testDbInstance` pattern.
2. `closeDatabase()` SHALL close **the connection(s) actually in use**, not a throwaway one.
3. `restoreBackup()` SHALL NOT overwrite `DB_PATH` while any connection to it is open.
4. AFTER a restore, subsequent queries SHALL transparently obtain a fresh connection.
5. `PRAGMA integrity_check` on `expenses.db` SHALL return `ok` after a full local run of
   `npm run test:backup:ci` on Windows.
6. THE change SHALL NOT alter observable API behaviour.

### Design / Implementation Notes

- The minimal fix is contained to `db.js`: memoise the production connection exactly as
  `getTestDatabase()` already does, and have `closeDatabase()` close and null that
  singleton. The 212 call sites need no changes — they just receive the shared connection.
- **Verify SQLite concurrency assumptions before landing.** A single shared connection
  serialises writes, which is usually desirable for SQLite, but confirm no code depends on
  independent connections (e.g. concurrent transactions — see `withTransaction` in R11).
- Enable WAL mode on the shared connection; the repo already does this for production.
- Restore must invalidate the singleton so post-restore queries reopen against the new file.
- This interacts with **R11** (transaction helper consolidation) — do R26 first, since a
  shared connection changes what a "transaction" means.
- Consider whether the leak has been causing a slow file-descriptor climb in the production
  container; worth checking `lsof`/handle counts on a long-running instance.

### Test Plan

- Unit: two `getDatabase()` calls return the same instance in production mode.
- Integration: full backup → restore → `PRAGMA integrity_check` returns `ok` on Windows.
- Integration: queries succeed immediately after a restore.
- Regression: `npm run test:backup:ci` passes on Windows **and** in CI.
- Soak: issue N API calls and confirm the open-handle count stays flat.

---

## R27: Archive creation is verified only by a 2-byte header check — ✅ DONE

**User Story:** As a user, I want a backup that reports success to be guaranteed restorable,
so my recovery plan is not silently broken.

> Discovered 2026-09-11 while validating R26. **Severity corrected Critical → Medium on
> 2026-09-11** — see "Correction" below.

### Correction: the original root-cause hypothesis was wrong

R27 was originally filed as *"a backup can be reported successful yet be unrestorable"*,
based on `ZlibError` failures in Properties 3 and 6. That framing inferred a defect in
`createArchive` from a symptom, and it did not survive investigation.

The real cause of those failures was **test-file accumulation** (see R25's resolution):
~1000 leaked invoice files made every `performBackup()` ~75× slower, and the ZlibErrors were
downstream of archives being written and read under heavy timeout pressure. With an isolated
config tree the suite passes 50/50 with no archive verification changes at all.

Hypotheses eliminated — do not re-tread:

- ❌ **`tar.create` resolves before the file handle is flushed.** No evidence; archives are
  read back successfully once the tree is clean.
- ❌ **`tar` library bug on Windows.** The retry loop in `extractArchive#L139` was a
  reasonable defensive measure by the original author, but it is not covering a real
  library defect here.
- ❌ **Archive verification would have fixed the backup suite.** It would not have. Shipping
  it as "the fix" would have looked conclusive while leaving the actual cause in place.

### What remains genuinely worth fixing

The original observation about weak verification is still **correct on its own merits**,
just not causal:

- `createArchive()` (`archiveUtils.js#L77-97`) calls `tar.create(...)`, then only
  `fs.promises.stat()`s the result for a size. A non-zero size proves nothing.
- `_isValidGzipFile()` (`archiveUtils.js#L241`) reads **two bytes** and checks for the gzip
  magic `0x1f 0x8b`. A truncated archive passes trivially — the magic bytes are the first
  thing written.

So if an archive ever *is* written badly (disk full, interrupted write, failing storage),
nothing detects it until a restore is attempted, which is the worst possible moment. This is
defence in depth for a data-safety feature, not a known live bug.

**Container context raises this above a purely theoretical concern.** Backups are written to
`/config/backups`, the *same* bind-mounted volume as `expenses.db`. A full host disk
therefore truncates a backup at exactly the moment the user most needs one, and the
pre-R27 code would have reported that backup as successful. Disk-full is the most plausible
real-world trigger, and it is now caught.

### Acceptance Criteria

1. `performBackup()` SHALL NOT report success unless the archive has been verified readable
   end-to-end (e.g. a full `tar.list` / inflate pass over the finished file).
2. Verification SHALL detect truncation, not just a valid gzip header — the 2-byte check
   SHALL be replaced or supplemented.
3. A failed verification SHALL surface as a failed backup with an actionable message.
4. THE verification cost SHALL be measured and recorded; it SHALL NOT regress the backup
   suite runtime materially.

### Design / Implementation Notes

- Cheapest correct verification is `tar.list({ file: outputPath })` (or inflate to a null
  sink) after creation, failing the backup if it throws. One extra read per backup.
- AC4 matters more than it looks: R25 showed this suite is sensitive to per-backup cost.
  Verify against the clean-tree 15ms baseline, not the old degraded numbers.
- Consider recording a checksum alongside each archive so restore can detect a bad file
  before it starts mutating anything.
- Relates to **R24**: if a restore aborts midway on a read error, confirm the rollback path
  leaves the original database intact.

### Test Plan

- Deliberately truncate an archive and confirm verification rejects it.
- Confirm a verified-good archive still restores successfully.
- Re-measure `performBackup()` against the clean-tree baseline to satisfy AC4.

### Resolution (2026-09-13) — PR #367

`archiveUtils.verifyArchive(archivePath)` now inflates the entire stream via the existing
`listArchiveContents()` (which brings the ZlibError retry loop with it), and `createArchive()`
calls it before reporting success. A failed verification **deletes** the archive and throws —
leaving it on disk would list an unrestorable file as a valid backup.

The 2-byte `_isValidGzipFile()` check was **supplemented, not replaced**: its two callers
(`extractArchive`, `listArchiveContents`) immediately read the whole file anyway, so
upgrading it there would have doubled the work for no gain. It is now documented as a cheap
pre-flight, and it remains the only check that catches a zero-byte file (see below).

### Verification behaviour (measured, not assumed)

A throwaway probe established what `tar.list` actually detects before any code was written:

| Archive state | `tar.list` | 2-byte magic check |
|---|---|---|
| Well-formed | no throw, 20 entries | passes |
| Truncated to 50% | `ZlibError/Z_BUF_ERROR` after 10 entries | **passes (bad)** |
| Truncated to 99% | `ZlibError/Z_BUF_ERROR` after **all 20** entries | **passes (bad)** |
| Byte flipped mid-stream | `ZlibError/Z_DATA_ERROR` after 0 entries | **passes (bad)** |
| Zero-byte file | **no throw, 0 entries** | fails |

Two findings the original write-up did not anticipate:

1. **An empty file inflates cleanly.** "Did `tar.list` throw?" is therefore *not* a
   sufficient verification — `verifyArchive` also asserts `entryCount > 0`.
2. **Entry count is not a truncation signal.** A 99%-truncated archive still yields every
   entry before throwing, so the throw is the only reliable truncation signal. Verification
   needs *both* conditions; neither alone is enough.

### Cost (AC4)

Measured against a semi-compressible payload shaped like a SQLite file:

| Payload | Archive | `createArchive` total | Verification | Overhead |
|---|---|---|---|---|
| 1 MB | 0.04 MB | 28.3 ms | 5.8 ms | 20.4% |
| 5 MB | 0.20 MB | 41.3 ms | 7.0 ms | 17.0% |
| 20 MB | 0.79 MB | 123.3 ms | 19.1 ms | 15.5% |
| 50 MB | 1.97 MB | 277.1 ms | 44.6 ms | 16.1% |

One extra read per backup, ~16% of creation cost and sub-linear in payload size.
`npm run test:backup:ci`: **50/50 passed in 60.7s** vs. R25's 56s clean-tree baseline — a
~5s increase across 50 backup-creating tests, consistent with the per-archive measurement.
AC4 satisfied.

### Validation

| Check | Result |
|---|---|
| `backend/utils/archiveUtils.test.js` | 22 passed (10 new) |
| `npm run test:backup:ci` | 50/50 passed, 60.7s |
| `npm run test:unit:parallel` | 138 suites, 2236 passed |
| `npm run lint` | 0 errors, 604 warnings |

The truncation test carries its own negative control: it asserts
`_isValidGzipFile(truncatedArchive) === true` before asserting `verifyArchive` rejects it,
so the test demonstrates the gap it closes rather than merely exercising new code.

---

# Phase 0.5 — Runtime & Deployment Safety

Goal: get the work already completed into production, and close the two defects that are
only visible from the running container rather than the source tree.

> Added 2026-09-13 after inspecting the live production container. See
> [Deployment & runtime ground truth](#deployment--runtime-ground-truth-measured-2026-09-13).

## R30: Release the Phase 0 backlog to production — ✅ DONE

**User Story:** As the operator, I want completed fixes to actually be running, so the work
produces value instead of sitting on `main`.

### Current Behavior

Production runs image `bb59542`, built **2026-07-02**. The latest tag is `v1.10.0`, dated
the same day. Every Phase 0 item merged between 2026-09-04 and 2026-09-13 is unreleased,
including **R26** — the only one of them that changes production behaviour.

Concretely, the running container is still leaking database connections: 287 of its 306 open
file descriptors point at `expenses.db*`.

### Acceptance Criteria

1. A release SHALL be cut that includes at minimum R26 (PR #363) and R27 (PR #367).
2. THE release SHALL follow the documented 7-location versioning rule
   (`docs/steering/versioning.md`) and add a `CHANGELOG.md` entry.
3. AFTER deployment, `ls -l /proc/1/fd | grep -c expenses.db` inside the container SHALL
   remain in single digits after at least an hour of normal use, confirming R26 in the field.
4. AFTER deployment, `PRAGMA integrity_check` on the production database SHALL return `ok`.
5. A backup SHALL be taken **before** the upgrade, and its restorability verified with the
   new `verifyArchive()` path.
6. THE staging container (`expense-tracker-test`, port 2627) SHALL be exercised with a copy
   of production data before promoting to `latest`.

### Design / Implementation Notes

- Promotion is manual and user-specific: `scripts/build-and-push.ps1 -Environment latest
  -SkipDeploy` pushes the tag, then deployment happens from
  `G:\My Drive\Media Related\docker\media-applications.yml`. Do **not** let the script
  deploy using the repo's `docker-compose.yml`.
- AC3 is the field verification R26's own design notes asked for and never got. Capture the
  before figure (287) and the after figure in the release notes.
- Consider whether R28 should ship in the same release — the restart required to deploy is
  itself an ungraceful kill. **Resolved 2026-09-14: it should not block.** The live database
  runs `journal_mode=wal` + `synchronous=FULL`, so an ungraceful stop cannot corrupt it or
  lose a committed transaction. R28 was downgraded to Low and is **not** a prerequisite.

### Test Plan

- Staging smoke test against a production data copy.
- Post-deploy: FD count, `integrity_check`, health endpoint, and one backup+restore cycle.

### Resolution (2026-09-14) — shipped as v1.10.2

Production moved from `bb59542` (2026-07-02) to **`d1dc76d`** / **v1.10.2**.

**The release took two attempts.** v1.10.1 was cut, built, and **caught by CI's Deployment
Health Check before promotion** — see [R31](#r31-health-route-closed-the-shared-connection--done).
v1.10.2 contains the fix. The broken `b619c99` image is published but was never deployed.

#### Measured outcome

| Check | Before (`bb59542`) | After (`d1dc76d`) |
|---|---|---|
| Version | 1.10.0 | **1.10.2** |
| FDs on `expenses.db*` | **287** (~95 connections, 36 h uptime) | **4** — one connection, flat across probes |
| Handles on deleted files | — | **0** |
| `PRAGMA integrity_check` | — | **`ok`** |
| `journal_mode` | `wal` | `wal` |
| `/api/health` | — | `status: ok`, `database: connected` |

**287 → 4 is AC3 satisfied** — the field verification R26's design notes asked for and never
got. AC4 satisfied. ACs 1, 2 and 6 satisfied.

#### Staging validation (AC5, AC6)

Staging ran `d1dc76d` against a copy of production data, and a **real restore** of the
2026-09-14 production backup was performed through the UI:

| Check | Result |
|---|---|
| Restore | DB + **72 invoices** + **20 statements** + config; 13 payment methods verified |
| `SQLITE_MISUSE` during restore | none |
| `integrity_check` after restore | **`ok`** |
| FDs after restore | 5, stable across 90 requests |
| Handles on deleted files | **0** — the exact signature that caused the original corruption |
| Queries after restore (R26 AC4) | `database: connected` |

The restore is the load-bearing result: it is the path R26 exists to fix, it ran against real
production data, and it came out clean.

#### Incidental findings

- **`secrets.RELEASE_PAT` had expired** (last rotated ~3 months prior). `release.yml`'s
  auto-merge step failed with `401 Bad credentials`. Everything before it succeeded, so the
  release PR was valid — only auto-merge was lost. Rotated 2026-09-14. Both releases were
  run with `auto_merge=false` and merged manually.
  > Worth noting: auto-merge would have shipped the **broken v1.10.1** unattended while the
  > health check was still running. The expired credential is the only reason a human was in
  > the loop. Consider deleting the auto-merge step rather than maintaining a token that
  > silently expires every 90 days.
- **`release.yml` categorises every entry under `changed:`** in `changelog.js`. Both releases
  here were fixes; corrected by hand each time. The category is user-visible in
  `VersionUpgradeModal`.
- **The 7-location versioning rule is really 6.** `docs/steering/versioning.md` lists
  `frontend/src/App.jsx` as location 3, but it reads the version from `API_ENDPOINTS.VERSION`
  at runtime (`App.jsx#L713`) and hardcodes nothing. `release.yml` correctly updates only 6.
  The steering doc should be corrected.
- **The PBT shard budget is drifting into false-failure territory again.** Shard 1 failed at
  **200s > 150s** with all 404 tests passing, then passed at **122s** on re-run of identical
  code. `test-budget.json`'s own rationale says "observed 38-82s healthy"; observed today was
  97–122s routinely. Same pattern R22 documented — a budget inside the variance band.
  > **Fixed 2026-09-14.** It caused three false failures in one day (shard 1 twice, then
  > backend-unit at 166s > 90s with all 2215 tests passing). Budgets were re-derived from job
  > durations across 15 successful runs rather than estimated:
  >
  > | Job | min | median | max | old | new |
  > |---|---|---|---|---|---|
  > | backend-unit-tests | 72s | 81s | **99s** | 90s | **180s** |
  > | backend-pbt-shard (shard 1) | 64s | 75s | 122s | 150s | **210s** |
  > | frontend-tests | 288s | 327s | **335s** | 360s | **480s** |
  >
  > The unit budget sat **below** the observed successful range, and frontend had 7% headroom
  > over its observed max. Each is now ~2× the median, so a genuine regression still trips it
  > while the ~2× runner variance does not. Observed maxima are recorded in each description
  > so the next re-derivation starts from data.
- **A `chmod` EPERM on `/config/invoices` appears in staging but not production.** Staging's
  bind mount rejects `chmod`; the hardening in `fileStorage.js` logs it as non-critical and
  continues. Production logs `Invoice storage initialization completed successfully`, so the
  hardening is **not** inert in production. Staging-only artifact; no action.

---

## R31: Health route closed the shared connection — ✅ DONE

**User Story:** As a user, I want the app to keep working after its health endpoint is
polled, so a routine liveness probe cannot take the service down.

> Discovered 2026-09-14 by CI's Deployment Health Check on the v1.10.1 build. **A regression
> introduced by R26.**

### Current Behavior (before fix)

`backend/routes/healthRoutes.js` closed the connection returned by `getDatabase()` after its
`SELECT 1` probe. Under the pre-R26 design that was **correct** — `getDatabase()` returned a
brand-new connection per call, and this was in fact the *only* call site that cleaned up
after itself. R26 made it a process-wide singleton, so the first health check closed the
app's only connection:

```json
{ "status": "unhealthy", "version": "1.10.1", "database": "disconnected",
  "error": "SQLITE_MISUSE: Database is closed" }
```

The container passed Docker's healthcheck once, then went **permanently unhealthy**. Docker's
`restart: unless-stopped` plus a 30 s healthcheck interval would have produced a restart loop
in production.

### Why R26's audit missed it

R26 reported **"212 `getDatabase()` call sites, 0 that call `db.close()`"**, and that count
was the entire basis for its claim that "the 212 call sites need no changes". The measurement
covered `backend/repositories/**` and `backend/services/**` only. **`backend/routes/**` was
never scanned** — and held the single closer.

> **Lesson:** when a refactor's safety argument rests on a count, verify the count's *scope*
> before trusting it. A repo-wide grep now confirms `healthRoutes.js` was the only closer in
> production code.

### Why the tests missed it

`healthRoutes.test.js` mocked the connection with `close: jest.fn((cb) => cb && cb(null))`.
A no-op close cannot invalidate a later query, so the mock made the bug unobservable.

> **Lesson:** mocks of resource lifecycle must model invalidation — closed means later
> operations fail. A lifecycle mock that no-ops hides exactly the class of bug it should catch.

### Resolution (PR #375)

Removed the `db.close()` call with a comment stating why it must not return. Added two
regression tests using a mock that behaves like real `sqlite3` (once closed, later queries
fail): repeated health checks stay `200 / connected`, and `getDatabase()`'s connection is
never closed. **Negative control performed** — reverting only `healthRoutes.js` fails exactly
those two tests.

### What caught it

The CI **Deployment Health Check** job, which boots the freshly built image against an empty
`/config` and polls `/api/health`. It is the only check in the pipeline that exercises the
real artifact rather than the test harness, and it was the only thing standing between this
regression and production. **Do not treat a failure there as flaky.**

---

## R28: No graceful shutdown — the WAL is never checkpointed on stop — ✅ DONE

**User Story:** As a user, I want stopping or upgrading the container to shut down cleanly,
so in-flight requests are not dropped and the database is left tidy.

> Discovered 2026-09-13 by inspecting the live production container. **Not visible from the
> source tree** — the defect is the *absence* of code plus a container setting.
>
> ⚠️ **Severity corrected High → Low on 2026-09-14.** The original write-up implied an
> ungraceful stop endangers the database. **It does not** — see
> [Verification](#verification-severity-downgrade-2026-09-14) below. This is hygiene, not
> data safety, and it is **not** a prerequisite for deploying (R30).

### Verification (severity downgrade, 2026-09-14)

Measured on the live production database:

```
journal_mode: wal
synchronous:  2   (FULL)
```

With WAL journalling and `synchronous=FULL`, SQLite guarantees a committed transaction
survives **power loss** — a SIGKILL is strictly less severe, because the OS page cache is
still flushed. A WAL left on disk at shutdown is **recovered on the next open**; that is
normal WAL operation, not damage.

The `closeDatabase()` docstring warning about "stale WAL data replaying and undoing a
restore" is real, but it applies to the **restore** path, where the database file is
*replaced* underneath an existing WAL. It does not apply to an ordinary stop, where the file
and its WAL stay consistent with each other. Conflating the two is what produced the wrong
severity.

**What genuinely remains wrong**, and why this is still worth fixing:

- In-flight HTTP requests are dropped mid-response on stop.
- The WAL is never truncated, so it grows unbounded between backups (107 KB today — not a
  problem, but unbounded by design).
- Shutdown intent is undocumented in code, so a future contributor adding work that *does*
  need ordered teardown has no hook to attach it to.

None of that justifies blocking a release.

### Current Behavior

There is **no `SIGTERM` or `SIGINT` handler anywhere in `backend/`** — a repo-wide grep for
`SIGTERM|SIGINT|gracefulShutdown` returns zero matches. `backend/server.js` starts the
listener and never registers a shutdown path.

Meanwhile, in production:

| Fact | Value |
|---|---|
| `HostConfig.StopTimeout` | **1 second** |
| `RestartPolicy` | `unless-stopped` |
| Healthcheck | every 30 s, 3 retries |
| WAL at rest | `expenses.db-wal` 107 KB, `-shm` 32 KB |
| Open DB connections | ~95 (287 FDs) |

So every `docker stop`, restart, and redeploy tears down ~95 open connections and an active
WAL with **no `PRAGMA wal_checkpoint`**, and Docker escalates to `SIGKILL` after one second.

The codebase already knows this is dangerous. `closeDatabase()` in
[db.js](backend/database/db.js) documents exactly this hazard:

> *"This flushes all WAL contents into the main DB file and releases file locks, which is
> critical before overwriting the DB file during backup restore. Without this, stale WAL
> data can replay on the next connection and undo the restore."*

That function exists, is correct, and is **never called on shutdown**.

### Why this is now tractable

Before R26, `closeDatabase()` could not close the connections the app was actually using —
it opened its own throwaway handle. R26 made the production connection a singleton, so a
shutdown hook can now close the real thing. R28 is the payoff R26 enabled.

### Acceptance Criteria

1. `backend/server.js` SHALL register handlers for `SIGTERM` and `SIGINT`.
2. ON signal, THE server SHALL stop accepting new connections (`server.close()`), then
   `await closeDatabase()`, then exit with code 0.
3. THE shutdown SHALL be idempotent — a second signal during shutdown SHALL NOT start a
   second teardown.
4. THE shutdown SHALL be bounded by a timeout shorter than the container's stop grace
   period, after which it exits anyway rather than hanging.
5. `Config.StopTimeout` / compose `stop_grace_period` SHALL be raised from **1 s** to a
   value that allows a checkpoint to complete (suggest 15 s), in the repo compose **and** in
   the user's production compose file.
6. AFTER a clean stop, `expenses.db-wal` SHALL be 0 bytes or absent.
7. THE handler SHALL log shutdown start and completion via `backend/config/logger.js`.
8. NO in-flight HTTP request SHALL be dropped mid-response during a graceful stop.

### Design / Implementation Notes

- AC5 is load-bearing and is **not** a code change. A perfect handler is useless if Docker
  kills the process after one second. Verify where `StopTimeout: 1` originates — it is
  likely `stop_grace_period: 1s` in `media-applications.yml`.
- Node installs its own default `SIGTERM` handler, so PID 1 does terminate today; the
  problem is that it terminates *immediately*, not that it hangs. Do not describe this as a
  "container won't stop" bug — that would be wrong.
- Keep the handler small and dependency-free. Do not add a process manager or `tini`; the
  signal reaches Node correctly already.
- `closeDatabase()` already checkpoints with `TRUNCATE` and tolerates a missing connection,
  so the handler is mostly wiring.
- `backupService` holds a `setTimeout` in `this.scheduledJob` and already exposes
  `stopScheduler()` (`backupService.js#L452`). Call it during shutdown so a scheduled backup
  cannot start while the database is closing.

### Test Plan

- Unit: a simulated `SIGTERM` calls `server.close()` then `closeDatabase()`, in that order.
- Unit: two rapid signals produce exactly one teardown.
- Unit: a `closeDatabase()` that hangs still exits within the timeout.
- Integration (container): `docker stop` the staging container, then confirm the WAL is
  0 bytes / absent and `PRAGMA integrity_check` returns `ok`.
- Integration: issue a slow request, `docker stop` mid-flight, confirm the response completes.

### Resolution (2026-09-14)

The handler lives in [gracefulShutdown.js](backend/utils/gracefulShutdown.js) rather than
inline in `server.js`, so the ordering, idempotency and timeout behaviour can be unit tested
without booting a server. `server.js` captures `httpServer`, the `cron` task handles and the
initial billing-cycle timer, then registers `SIGTERM` / `SIGINT`.

**Teardown order, and why:**

1. `backupService.stopScheduler()` and `task.stop()` on each cron job — no new work can start
2. `sseService.closeAll()` — **see below**
3. `httpServer.close()` — in-flight requests finish (AC8)
4. `await closeDatabase()` — WAL checkpoint + close, last so no request can hit
   `SQLITE_MISUSE` on the shared connection

#### Two things the original notes missed

**SSE streams would have hung the shutdown forever.** `server.close()` waits for open
connections, and an SSE response never ends on its own. `sseService` had no way to close its
clients, so a single connected browser tab would have stalled every shutdown until the
force-exit timeout. Added `sseService.closeAll()`, called before `server.close()`.

**Idle keep-alive connections do *not* stall shutdown on Node 22.** This was checked rather
than assumed — historically `server.close()` hangs on idle keep-alive sockets, which would
have argued for `server.closeIdleConnections()`. A probe holding an idle keep-alive socket
open across `docker stop` completed in **621 ms with exit 0**, so Node 22 already closes them
and no extra call was added.

#### Verified against a real container

Built the image locally and stopped it with a 20 s grace period:

| Check | Result |
|---|---|
| `docker stop` duration | **652 ms** — not the grace period, so it exited on SIGTERM |
| Exit code | **0** (a SIGKILL would be 137) |
| Log sequence | `Received SIGTERM` → `HTTP server closed` → `Database connection closed, WAL checkpointed` → `Shutdown complete` |
| WAL before stop | `expenses.db-wal` 8,272 B, `-shm` 32,768 B |
| **WAL after stop (AC6)** | **both files absent** — fully checkpointed into `expenses.db` |
| With idle keep-alive held | 621 ms, exit 0 |

#### Outcome by AC

| AC | Outcome |
|---|---|
| 1 | `SIGTERM` + `SIGINT` registered in `server.js` |
| 2 | Order verified by unit test and by container log sequence |
| 3 | Idempotent — concurrent signals produce exactly one teardown (unit test) |
| 4 | 10 s force-exit, `unref`'d; below the 15 s grace period |
| 5 | `stop_grace_period: 15s` in the repo compose **and** the production compose |
| 6 | **WAL and SHM absent after a clean stop** |
| 7 | Start and completion logged via `config/logger.js` |
| 8 | `httpServer.close()` awaited before `closeDatabase()`; ordering unit tested |

**Tests:** 8 new unit tests in `gracefulShutdown.test.js` covering ordering, idempotency,
force-exit timeout, SSE-before-HTTP, error paths, signal-during-startup, and one bad cron
task not aborting the rest. Full backend suite: **139 suites, 2,246 tests passing**.

> Note AC5 is a deployment change, not code. The production container must be recreated for
> `stop_grace_period` to take effect; until then Docker still SIGKILLs after 1 s and the
> handler gets no chance to run.

---

## R29: Container resource limits are declared but not applied — ✅ DONE

**User Story:** As the operator, I want the declared resource limits to be real, so capacity
planning reflects what actually happens.

> Discovered 2026-09-13 alongside R28.
>
> ⚠️ **Two claims in the original write-up were wrong.** Both were asserted from plausible
> mechanisms without measuring. See [Corrections](#corrections-measured-2026-09-14).

### Current Behavior

The repo's [docker-compose.yml](docker-compose.yml) declares:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
```

The running container has **no limit at all**:

```
docker inspect  ->  Memory: 0   NanoCpus: 0
docker stats    ->  85.6MiB / 15.39GiB (0.54%)
```

The reason is singular: **production does not use the repo compose file.** It is deployed
from `G:\My Drive\Media Related\docker\media-applications.yml`, which sets no limits.

### Corrections (measured 2026-09-14)

**❌ "`deploy:` is Swarm-scoped; its support under plain `docker compose up` is version
dependent and should not be relied upon."** Disproved. A throwaway two-service compose was
started on Compose **v5.1.4** / Engine **29.5.3**, one service using `deploy.resources.limits`
and one using `mem_limit`:

| Service | `HostConfig.Memory` | `HostConfig.NanoCpus` |
|---|---|---|
| `deploy.resources.limits` | 536870912 | 1000000000 |
| `mem_limit` / `cpus` | 536870912 | 1000000000 |

Identical. The declaration was never broken and needed no rewrite — reason 2 did not exist.

**❌ "If the 512 MB limit were applied, the container would be OOM-killed" (and R8 becomes a
stability risk).** Overstated. Measured directly against the real 21,507-row dataset:

| Measurement | Value |
|---|---|
| Steady state, full production data | ~88 MiB |
| One unbounded `expenseRepository.findAll()` | **+18.5 MB RSS**, 8.8 MB heap, 291 ms |
| 10 consecutive unbounded loads | peak **100.5 MB** |

At ~18 MB per load against a 512 MiB limit, R8 is a **latency** problem, not a memory one.
The spec's claim that enforcing the limit would "trade a non-issue for OOM-kills" was wrong
and is withdrawn — R8's severity is *not* conditional on R29.

**✅ The heap-ceiling concern was real and is the part worth keeping.** V8 sized its heap from
host RAM: `heap_size_limit` was **2096 MB** against a 512 MiB cgroup. That remains the reason
`--max-old-space-size` is mandatory alongside any limit.

### Acceptance Criteria

1. THE repo compose SHALL express memory and CPU limits using keys that take effect for the
   deployment method actually in use, or the declaration SHALL be removed as misleading.
2. IF a memory limit is enforced, `--max-old-space-size` SHALL be set to roughly 75% of it
   so V8 collects before the cgroup OOM-killer fires.
3. THE chosen limit SHALL be justified against observed usage (85.6 MiB steady state) plus
   headroom for the analytics paths described in R8.
4. THE staging service SHALL carry the same `security_opt` / `cap_drop` hardening as
   production, which it currently lacks.
5. THE decision and its rationale SHALL be recorded in `docs/deployment/`.

### Resolution (2026-09-14)

| AC | Outcome |
|---|---|
| 1 | No rewrite needed — `deploy.resources.limits` proven to apply. Kept as-is |
| 2 | `NODE_OPTIONS=--max-old-space-size=384` added to **both** services (~75% of 512) |
| 3 | Sized against measured 88 MiB steady / 100.5 MB peak → 512 MiB is ~5× headroom |
| 4 | Staging now carries `security_opt: no-new-privileges` and `cap_drop: ALL` |
| 5 | Recorded in [DEPLOYMENT_WORKFLOW.md](docs/deployment/DEPLOYMENT_WORKFLOW.md) |

**Verified on the running staging container** after recreation:

```
HostConfig.Memory   = 536870912      (was 0)
HostConfig.NanoCpus = 1000000000     (was 0)
SecurityOpt         = [no-new-privileges:true]
CapDrop             = [ALL]
PID 1 env           = NODE_OPTIONS=--max-old-space-size=384
v8 heap_size_limit  = 387 MB         (was 2096 MB)
cgroup memory.max   = 536870912
docker stats        = 24.16MiB / 512MiB (4.72%)
```

Ten consecutive unbounded `findAll()` calls under the enforced limit peaked at 100.5 MB and
the container stayed healthy.

> ✅ **Production covered as of v1.10.3 (2026-09-14).** The repo compose governs staging only,
> so the same settings were mirrored by hand into
> `G:\My Drive\Media Related\docker\media-applications.yml` (backup kept alongside it).
> Measured on the live production container after the recreate:
> `Mem=536870912`, `CapDrop=[ALL]`, `SecurityOpt=[no-new-privileges:true]`,
> `StopTimeout=15`, v8 `heap_size_limit` **387 MB**.
> `docker inspect` is authoritative; `0` for `.HostConfig.Memory` means no limit regardless
> of what any file declares.

### Lesson

Both wrong claims came from reasoning about a plausible mechanism ("`deploy:` is a Swarm key",
"loading a whole table in a loop must be memory-heavy") instead of running a two-minute
experiment. Both experiments were cheap and available the whole time. This is the same
pattern as R19, R27 and R28.

### Design / Implementation Notes

- The honest options are (a) make the limit real and cap the heap, or (b) delete the
  declaration. Leaving a limit that looks enforced and isn't is the worst of the three.
- This gates **R8**: with no memory limit, unbounded `findAll()` over 21k rows is a latency
  and GC-pressure problem. With a 512 MB limit and a 2 GB heap ceiling, it becomes an
  OOM-kill (exit 137) that presents as a mysterious restart. Decide R29 before sizing R8.
- The repo compose is still the reference for staging, so it should be correct regardless of
  what production uses.

### Test Plan

- `docker inspect` confirms the intended `Memory` / `NanoCpus` are non-zero when intended.
- With the limit applied, load the heaviest analytics endpoint and confirm no exit 137.
- `v8.getHeapStatistics().heap_size_limit` reflects the configured cap.

---

# Phase 1 — Frontend Resilience & Accessibility

Goal: make the UI fail visibly and safely, and make every modal usable by keyboard and
screen reader. This is the highest user-visible-value phase.

## R19: Fix conditional hooks in `InsuranceStatusIndicator` — ✅ DONE

**User Story:** As a maintainer, I want hooks called unconditionally, so that adding or
moving a hook in this component cannot silently corrupt React's hook state.

> **Discovered by the R1 linter, not the manual audit.**
>
> ⚠️ **Severity corrected from High to Low after verification.** The original write-up
> claimed "latent hook-order corruption". A negative-control experiment disproved that —
> see [Verification](#verification-severity-downgrade) below. The fix is still correct and
> was landed, but it removes *fragility*, not a live defect.

### Current Behavior (before fix)

`react-hooks/rules-of-hooks` reported four violations in
[frontend/src/components/expenses/InsuranceStatusIndicator.jsx](frontend/src/components/expenses/InsuranceStatusIndicator.jsx):
an early `if (!insuranceEligible) return null;` sat **above** all four `useCallback` calls
(`getStatusConfig`, `handleClick`, `handleKeyDown`, `getTooltipText`).

### Verification (severity downgrade)

A regression test was written to assert that toggling `insuranceEligible` on a mounted
instance produces no React error. It was then run against the **unfixed** component as a
negative control. **It passed against the buggy version**, proving the test could not
detect the defect — because there was no runtime defect to detect.

Mechanism: React selects the hooks dispatcher with
`current === null || current.memoizedState === null ? MountDispatcher : UpdateDispatcher`.

- **0 → 4 hooks:** the previous render called no hooks, so `memoizedState` is `null` and
  React takes the **mount** path. The four hooks mount fresh; no error.
- **4 → 0 hooks:** no hooks are called during the update, so `currentHook` stays `null` and
  the `Rendered fewer hooks than expected` check never fires.

An early return placed above **every** hook is an all-or-nothing transition that React
tolerates. The component also has no `useState`, so the mount-path reset has no observable
consequence.

**The violation is still worth fixing**, because it is genuinely fragile: adding any hook
*above* the early return, or any hook *below* it that the return skips only sometimes,
creates a real partial mismatch that **does** throw. The lint rule is the guard against
that, not a test.

### Acceptance Criteria

1. ✅ ALL hook calls SHALL be invoked unconditionally at the top level of the component.
2. ✅ THE conditional logic SHALL move below the hook calls rather than gating them.
3. ✅ `npx eslint` on the file SHALL report zero `react-hooks/rules-of-hooks` violations.
4. ✅ THE component's rendered output SHALL be unchanged for every existing input.
5. ✅ `react-hooks/rules-of-hooks` SHALL be ratcheted from `warn` to `error`.

### Outcome (as landed)

The `if (!insuranceEligible) return null;` guard moved from above `getStatusConfig` to
immediately before the JSX return, with a comment stating why it must stay there.
Repo-wide `react-hooks/rules-of-hooks` count went 4 → **0**, and the rule is now `error`
in `eslint.config.js`.

Added `InsuranceStatusIndicator.test.jsx` (11 tests). These are **characterization tests**,
not a regression guard — the component previously had no test file at all, which is a large
part of why the violation survived. They cover status-to-label mapping, the tooltip
reimbursement breakdown, the not-eligible empty render, and prop-toggle stability.

### Lesson

A lint rule firing is evidence of a *rule violation*, not proof of a *runtime bug*. When
promoting a lint finding to High severity, build the negative control first: revert the fix
and confirm the test fails. If it passes, the severity claim is wrong.

---

## R4: Shared accessible `<Modal>` shell — ✅ DONE

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

### Resolution (2026-09-14)

`frontend/src/components/shared/Modal.jsx` + `.css`, with behaviour split into
`frontend/src/hooks/useModalBehavior.js` as the design notes asked, so modals that cannot
adopt the full shell (e.g. `InvoicePDFViewer`) can take the behaviour alone. **No existing
modal was migrated** (AC11) — that is R5.

#### ⚠️ Mount order is NOT stacking order — read this before doing R5

The design note says to "register the Escape listener only for the top of the stack". The
obvious implementation — a push/pop stack where the last entry is topmost — **is wrong for
nested modals**, and the nesting test caught it:

> **React runs child effects before parent effects.** A nested inner modal therefore
> registers on the stack *before* the modal containing it, so "last pushed" identifies the
> **outer** modal as topmost — exactly backwards. Escape then closed the wrong dialog.

Topmost is now decided by **DOM containment**: a modal that contains another open modal is
not on top. Among modals that contain nothing (true siblings), the most recently opened
wins, which keeps push order as the tie-breaker where it is actually meaningful.

This matters for R5's `CreditCardDetailView` → `BillingCycleHistoryForm` nesting, which the
migration plan explicitly calls out for manual verification.

#### Other implementation notes

- **Overlay dismissal compares `event.target` to `event.currentTarget`** rather than putting
  a `stopPropagation` handler on the dialog. Same behaviour, one less handler, and it
  removed two `jsx-a11y` warnings the stopPropagation version triggered — a non-interactive
  element with a click listener is exactly what those rules exist to flag.
- **Scroll lock is reference-counted** via the shared stack, and restores the value captured
  when the *first* modal opened — not a hardcoded `''`. A test sets `overflow: scroll`
  beforehand to prove it.
- The dialog carries `tabIndex={-1}` so focus has somewhere to land when a modal contains
  nothing focusable.

#### On AC10 (UxConsistency guardrails)

All three guardrails scan **explicit, named lists** of existing components and CSS files, not
globs — so a new `Modal.css` is not scanned and cannot fail them. Satisfying AC10 in substance
meant complying with the conventions they enforce: the shell reuses `.modal-overlay` and
`.modal-content`, sizes map to `var(--modal-width-sm|md|lg|xl)`, and there are no hardcoded
`z-index` values. All 9 UxConsistency suites still pass.

#### Validation

| Check | Result |
|---|---|
| `Modal.test.jsx` | **27 passed** |
| UxConsistency PBT (9 suites) | 10 passed |
| `npx eslint` on new files | 0 errors, **0 warnings** |

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

## R6: Add an ErrorBoundary — ✅ DONE

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

### Resolution (2026-09-14)

`frontend/src/components/shared/ErrorBoundary.jsx` + `.css`, wired into **10 places** in
`App.jsx`: the app shell plus all 9 lazy-loaded modals.

#### One deliberate deviation from the design notes

The notes say to place the boundary inside `Suspense`. Done — but for the two modals where
**`App.jsx` owns the modal chrome** (`AnnualSummary`, `TaxDeductible`), the boundary wraps
only the lazy *content*, not the overlay.

That matters: wrapping the whole overlay would destroy the close button along with the
crashed content, leaving the user staring at an error card with no way to dismiss it. Wrapping
just the content keeps the modal chrome alive, so the user can still close the modal. The
remaining 7 modals render their own overlay, so the component itself is wrapped.

#### Outcome by AC

| AC | Outcome |
|---|---|
| 1 | Class component with `getDerivedStateFromError` + `componentDidCatch` |
| 2 | Reports via `createLogger('ErrorBoundary')`, never `console` |
| 3 | Fallback shows a plain-language message and a working "Try again" |
| 4 | Error message and component stack render **only** under `import.meta.env.DEV` |
| 5 | `fallback` accepts a node **or** a `({ error, reset }) => node` render prop; `onReset` supported |
| 6 | App shell + all 9 `Suspense`-wrapped lazy modals |
| 7 | `resetKey` change clears a tripped boundary via `getDerivedStateFromProps` |

#### Tests

12 unit tests in `ErrorBoundary.test.jsx`, including the four the test plan named plus:
fallback node vs render prop, `onReset` ordering, `resetKey` **not** clearing when unchanged,
and sibling isolation (one boundary trips, its sibling keeps rendering).

`DEV` is controlled with `vi.stubEnv('DEV', ...)`, so the production-hiding behaviour in AC4
is genuinely asserted rather than assumed from the build config.

| Check | Result |
|---|---|
| `ErrorBoundary.test.jsx` | 12 passed |
| `src/App*` integration tests | 9 files, 53 passed |
| `npm run build` | succeeds |
| `npx eslint` | 0 errors |

> Note the modals are conditionally rendered (`{showX && ...}`), so closing one already
> unmounts its boundary and reopening gets a fresh one. `resetKey` is therefore not needed at
> these call sites — it exists for consumers whose boundary outlives the error.

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

### Severity is conditional on R29

> **Superseded 2026-09-14.** Measured under R29: one unbounded `findAll()` of 21,507 rows
> costs **+18.5 MB RSS / 8.8 MB heap in 291 ms**, and ten consecutive loads peak at 100.5 MB
> against a 512 MiB limit. **This is a latency problem, not a memory one.** The claim below
> that enforcing a limit turns R8 into an OOM risk is withdrawn.

Measured 2026-09-13: production sits at **85.6 MiB** steady state with **no memory limit
applied**, so today this is a latency and GC-pressure problem, not a stability one.

But the repo compose declares a **512 MB** limit, and V8's heap ceiling in the container is
**2096 MB** with no `--max-old-space-size`. If that limit is ever made real without capping
the heap, loading the full `expenses` table in a loop becomes an OOM-kill (exit 137) that
presents as an unexplained container restart. **Settle R29 before sizing this work** — it
determines whether R8 is a performance item or a stability item.

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

### Container diagnostics (Phase 0.5)

These read ground truth that the source tree cannot provide. Replace `expense-tracker` with
`expense-tracker-test` for staging.

| Purpose | Command |
|---|---|
| Which build is running | `docker exec expense-tracker sh -c 'echo $GIT_COMMIT $BUILD_DATE'` |
| Leaked DB connections (R26/R30 AC3) | `docker exec expense-tracker sh -c 'ls -l /proc/1/fd \| grep -c expenses.db'` |
| FD limit | `docker exec expense-tracker sh -c 'grep "open files" /proc/1/limits'` |
| WAL state (R28 AC6) | `docker exec expense-tracker ls -la /config/database/` |
| Applied limits (R29) | `docker inspect expense-tracker --format 'Mem:{{.HostConfig.Memory}} Cpu:{{.HostConfig.NanoCpus}} Stop:{{.Config.StopTimeout}}'` |
| V8 heap ceiling (R29 AC2) | `docker exec expense-tracker node -e "console.log(require('v8').getHeapStatistics().heap_size_limit/1048576)"` |
| Live memory vs limit | `docker stats expense-tracker --no-stream` |
| Integrity (R30 AC4) | `docker exec expense-tracker node -e "...PRAGMA integrity_check..."` |

> Note `docker inspect` is authoritative for limits; the repo's `docker-compose.yml` is
> **not** what production runs.

---

## Progress Tracking

| # | Requirement | Status | PR | Notes |
|---|---|---|---|---|
| R1 | ESLint + Prettier toolchain | ✅ Done | #346 | ESLint **9** (plugins lack v10 peers); baseline 0 errors / 609 warnings |
| R2 | Ignore generated test artifacts | ✅ No change needed | #346 | Already ignored & untracked; `test-budget.json` is a tracked *input* |
| R3 | Sync root package version | ✅ Done | #346 | `version` removed + `private: true`; root is not one of the 7 locations |
| R21 | Dependabot PRs bypass all CI checks | ✅ Done | #365 | Guard removed from 10 test/quality jobs; kept on the 2 deploy jobs that need write scope. **AC5 verified 2026-09-14** on PRs #368–#371 — they ran full backend + frontend CI instead of reporting `CLEAN` with everything skipped |
| R22 | Backend PBT shards flake on shared test DB | ✅ Done | #350 | Root cause: `closeTestDatabase()` unlinked the file before the async `close()` finished. Budget also raised 90s → 150s |
| R23 | Trivy outages reported as CRITICAL vulns | ✅ Done | #366 | Single JSON scan + `jq` gate, retries across 2 DB mirrors. Also fixed inflated severity counts in the build summary (`grep -c` counted matching lines) |
| R24 | Backup suites run against the real dev database | ✅ Done | | `CONFIG_DIR` now env-overridable; tests run against a wiped `.test-config` tree. Dev DB mtime and real invoice count unchanged by a full run |
| R25 | `backupService.pbt.test.js` fails locally, passes in CI | ✅ Done | | Second root cause: ~1000 leaked invoice files made every backup ~75× slower. **50/50 passing in 56s** (was 3 failed / 637s) |
| R26 | `getDatabase()` leaks a connection on every call | ✅ Done | #363 | 212 call sites → 1 memoised connection. `integrity_check` now returns **`ok`** after the backup suite (was ~100 corrupt pages) |
| R27 | Archive creation verified only by a 2-byte header check | ✅ Done | #367 | **Original root-cause hypothesis disproved** — was not the cause of R25. Landed as defence in depth: `verifyArchive()` inflates the full stream **and** asserts `entryCount > 0`, since an empty file inflates cleanly. ~16% added cost per archive |
| **R30** | **Release the Phase 0 backlog to production** | ✅ Done | #374, #376 | Shipped **v1.10.2** (`d1dc76d`). Prod FDs on `expenses.db*`: **287 → 4**; `integrity_check` **ok**. Staging restore of a real prod backup succeeded with 0 deleted-file handles |
| **R31** | **Health route closed the shared connection** | ✅ Done | #375 | R26 regression; v1.10.1 was unhealthy on first health probe. Caught by CI's Deployment Health Check **before** promotion. R26's "0 call sites close" count never scanned `backend/routes/**` |
| **R28** | **No graceful shutdown — WAL never checkpointed on stop** | ✅ Done | #379 | Severity was corrected High → Low first. Handler extracted to `utils/gracefulShutdown.js` for testability. **SSE streams would have hung shutdown forever** — `sseService.closeAll()` added. **Validated on staging against a restored production DB: 625 ms, exit 0, WAL 107,152 B → checkpointed and removed, `integrity_check` `ok` after restart.** Production carries `StopTimeout=15` as of the v1.10.3 recreate |
| **R29** | **Container resource limits declared but not applied** | ✅ Done | #378 | Two original claims **disproved by measurement**: `deploy.resources.limits` does apply under `docker compose up` (v5.1.4), and one unbounded `findAll()` costs only **+18.5 MB** — so R8 is *not* an OOM risk. Real fix was the heap cap: `--max-old-space-size=384` takes V8's ceiling 2096 MB → 387 MB. **Live on production:** `Mem=536870912`, `CapDrop=[ALL]`, `no-new-privileges`, heap **387 MB** |
| R20 | Frontend `test:fast*` scripts | ✅ Done | #348 | `cross-env` + wired `FAST_CHECK_NUM_RUNS` into `pbtOptions`; var was previously dead |
| R19 | Conditional hooks in `InsuranceStatusIndicator` | ✅ Done | #348 | Severity corrected High → Low; React tolerates all-or-nothing early returns. Rule now `error` |
| R6 | Add `ErrorBoundary` | ✅ Done | #381 | Shell + all 9 lazy modals (10 boundaries). For the 2 modals whose chrome lives in `App.jsx`, only the lazy content is wrapped so the **close button survives a crash**. 12 tests; `DEV` gating asserted via `vi.stubEnv`. **Live on production in v1.10.3** |
| R4 | Shared accessible `<Modal>` shell | ✅ Done | #382 | Behaviour split into `useModalBehavior` per the design notes. **Found that React runs child effects before parent effects, so push order made the OUTER nested modal look topmost** — topmost is now decided by DOM containment. 27 tests; all 9 UxConsistency guardrails still pass |
| R5 | Migrate 25 modals to the shell | ☐ Not started | | 7 batches (5a–5g); clears ~198 a11y warnings |
| R8 | Bound analytics queries | ☐ Not started | | Characterization tests required first. **Severity no longer conditional on R29** — measured at only +18.5 MB per unbounded load, so this is a latency problem (291 ms each), not a memory one |
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
| ~~`react-hooks/rules-of-hooks`~~ | ~~4~~ → **0, now `error`** | ✅ R19 |
| `no-dupe-class-members` | 2 | R18 |
| `no-console` (frontend) | 70 | R7 |
| `react/no-array-index-key` | 39 | R15 |
| `jsx-a11y/*` (7 rules) | 198 | R5 |
| `react-hooks/*` (5 rules) | 114 | R17 |
| `no-unused-vars`, `no-useless-escape`, `no-case-declarations`, `no-regex-spaces`, `no-control-regex`, `no-misleading-character-class`, `no-prototype-builtins`, `no-async-promise-executor`, `react/no-unescaped-entities` | 182 | opportunistic |
