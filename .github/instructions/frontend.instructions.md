---
description: "Use when editing React frontend code: components, contexts, hooks, API services, auth/fetch wiring, styling."
applyTo: "frontend/src/**"
---
# Frontend Conventions

## Structure

- Single page, modal-based (no router). `App.jsx` renders the header, `MonthSelector`, the expense list (left) and filters + `SummaryPanel` (right). Feature views (Annual Summary, Income Tax, Budgets, Analytics Hub, Financial Overview) are modals, mostly `React.lazy` + `ErrorBoundary`.
- Components are grouped by domain under `components/<domain>/` with an `index.js` barrel: `expenses`, `financial`, `credit-cards`, `loans`, `tax`, `analytics`, `notifications`, `system`, `shared`.
- Provider order: `ErrorBoundary` → `AuthProvider` → `AuthGate` → `FilterProvider` → `ExpenseProvider` → `ModalProvider` → `SharedDataProvider`.
- Styling: global styles in `styles/`, per-component CSS, CSS Modules adopted incrementally. Dark mode via `:root[data-theme='dark']`.

## API Calls

- Never call bare `fetch()` — CI fails (`scripts/validate-no-raw-fetch.js`; exempt only `services/authApi.js`, `utils/fetchProvider.js`, tests).
- Use `apiClient`, `authAwareFetch` from `utils/fetchProvider.js`, or `fetchWithRetry`. These attach the Bearer token when a password is set and retry once after a silent refresh on `TOKEN_EXPIRED`.
- URLs come from `API_ENDPOINTS` in `config.js` (prefixed by `VITE_API_BASE_URL`, empty = same origin). No hard-coded hosts or ports.
- Per-domain API helpers live in `services/*Api.js`. Prefer `apiClient` for mutations: it adds the `X-Tab-ID` header that lets the originating tab ignore its own sync broadcast.

## Logging

Use `createLogger('Name')` from `utils/logger.js` instead of `console.*`.
