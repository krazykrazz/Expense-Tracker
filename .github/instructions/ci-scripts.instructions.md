---
description: "Use when editing CI workflows or the CI enforcement scripts in scripts/: test naming, raw fetch check, PBT guardrails, runtime budgets, path filtering."
applyTo: "scripts/**,.github/workflows/**,test-budget.json"
---
# CI Workflows and Enforcement Scripts

Full CI reference: `docs/development/GITHUB_ACTIONS_CICD.md`.

## Enforcement Scripts (`scripts/`, run by `.github/workflows/ci.yml`)

| Script | Job(s) | Fails when |
|---|---|---|
| `validate-no-raw-fetch.js` | Frontend Tests | bare `fetch(` in `frontend/src` source |
| `validate-pbt-guardrails.js` | Backend PBT Shard 1/3 | missing invariant comment, PBT share > 48%, unit test importing `database/db` |
| `check-test-budget.js <job> <seconds>` | every test job (last step) | elapsed > `budgets.<job>.maxSeconds` in `test-budget.json`, even if all tests passed |
| `report-test-health.js` | Test Health Report | (never; writes test-file counts to the run summary) |

Tests for these scripts live in `scripts/__tests__/` and run in Backend Unit Tests via `npx jest --config ../scripts/jest.config.js` (from `backend/`, which supplies jest and fast-check). Run the same command locally after changing a script.

New scripts: `process.exit(1)` on failure, export logic and guard with `if (require.main === module) main();`, add a step in `ci.yml`, add tests in `scripts/__tests__/`.

Other scripts: `health-check.sh` and `rollback.sh` (used by the Deployment Health Check job), `build-and-push.ps1`, `deploy-feature-preview.ps1`, `create-feature-branch.ps1`, `promote-feature.ps1`, `create-pr-from-main.ps1`, `run-test-summary.ps1`, `install-git-hooks.ps1` + `git-hooks/pre-commit`.

## Workflow Facts

- Required checks: `Backend Tests Status` and `Frontend Tests Status`. A path filter (`dorny/paths-filter`) skips irrelevant jobs; docs-only pushes don't trigger CI at all.
- The repo enforces an Actions allowlist (`actions/*`, `docker/*`, `aquasecurity/*`, `dorny/paths-filter`); other third-party actions cause `startup_failure`.
- GHCR build/push only runs on pushes to `main`, never on PRs. Release commits are created via `gh api graphql createCommitOnBranch` (signed) and auto-merged with `RELEASE_PAT`.
- `[skip-budget]` in the commit message bypasses the budget check only on `push` events.
