# Expense Tracker — Agent Instructions

Self-hosted household finance app. React 19 + Vite frontend (`frontend/`), Node/Express 5 + SQLite backend (`backend/`, CommonJS), shipped as one Docker image (`ghcr.io/krazykrazz/expense-tracker`). Data lives under `/config` in the container.

## Architecture

- Backend layering: route → controller → service → repository → SQLite. Routes are mounted in `backend/server.js`; `authMiddleware` is applied globally to `/api`.
- Frontend is a single page with modals (no router). Global state lives in contexts: `AuthContext`, `FilterContext`, `ExpenseContext`, `ModalContext`, `SharedDataContext`.
- Schema: `backend/database/schema.js` (single source for prod + test DBs) plus append-only `MIGRATIONS` in `backend/database/migrations.js`.
- Ports: backend `PORT` defaults to 2626 locally (Vite dev server on 5173 proxies `/api` there); the Docker image uses 2424.

## Conventions

- Backend logging: `backend/config/logger.js` only. `console.*` is an ESLint error in `backend/**` (except `backend/scripts/**` and tests). Frontend: `createLogger` from `frontend/src/utils/logger.js`.
- Frontend HTTP: never call bare `fetch()` (CI runs `scripts/validate-no-raw-fetch.js`). Use `apiClient`, `authAwareFetch` (`utils/fetchProvider.js`) or `fetchWithRetry`, with URLs from `API_ENDPOINTS` in `frontend/src/config.js`.
- New API endpoint = route + controller + service/repository as needed + `API_ENDPOINTS` entry + a row in the Endpoint Reference of `docs/API_DOCUMENTATION.md`.
- Never call `db.close()` on the connection from `getDatabase()` — it is a process-wide singleton.
- Lint: `npm run lint` at the repo root (ESLint 9 flat config, pinned to v9).

## Git and Releases

- Check branch state with `git status --branch --short`.
- Work on `feature/<name>` branches; `main` is protected (PRs only, signed commits, merge commits only — no squash/rebase). Keep branches current by merging `main`, not rebasing.
- Do not commit unless the user asks. Never bump versions outside the Release workflow (`release/vX.Y.Z` branches).

## Specs and Docs

- Specs: one `specs/<feature-name>/spec.md` per feature (requirements + design + tasks in one file); move finished specs to `specs/archive/`.
- Docs index: `docs/README.md`. Feature behaviour: `docs/features/`. Deployment: `docs/deployment/DEPLOYMENT_WORKFLOW.md`. CI: `docs/development/GITHUB_ACTIONS_CICD.md`.
- When a change alters behaviour described in `docs/`, update the doc in the same change.
