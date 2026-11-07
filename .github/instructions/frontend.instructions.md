---
description: "Use when editing React frontend code: components, contexts, hooks, API services, auth/fetch wiring, styling."
applyTo: "frontend/src/**"
---
# Frontend Conventions

## Structure

- Single page, modal-based (no router). `App.jsx` renders the header, `MonthSelector`, the expense list (left) and filters + `SummaryPanel` (right). Feature views (Annual Summary, Income Tax, Budgets, Analytics Hub, Financial Overview) are modals, mostly `React.lazy` + `ErrorBoundary`.
- Components are grouped by domain under `components/<domain>/` with an `index.js` barrel: `expenses`, `financial`, `credit-cards`, `loans`, `tax`, `analytics`, `notifications`, `system`, `shared`.
- Provider order: `ErrorBoundary` → `AuthProvider` → `AuthGate` → `FilterProvider` → `ExpenseProvider` → `ModalProvider` → `SharedDataProvider`.
- Styling: global styles in `styles/`, per-component CSS, CSS Modules adopted incrementally. Dark mode via `:root[data-theme='dark']`: use the theme tokens in `styles/variables.css` (`--bg-*`, `--text-*`, `--border-*`, `--color-*-light` tints) instead of hard-coded colours. For a one-off colour, use `light-dark(<light>, <dark>)`. It relies on the `color-scheme` declarations in `styles/variables.css` (`:root` and `:root[data-theme='dark']`): the production build's CSS minifier (Lightning CSS) rewrites `light-dark()` into `--lightningcss-light/dark` variables that only exist where CSS declares `color-scheme`, so never remove those. The Vite dev server doesn't minify: check colour changes on a production build (`vite build` + `vite preview`). Never use a `--text-*` variable as a background (it inverts in dark mode), and don't add a `var(--x, #fallback)` for a variable that isn't defined.
- Contrast (WCAG AA, 4.5:1) in both themes: the bright `--color-primary/positive/negative/warning` values are for fills (bars, dots, borders). Text in a status colour uses `--color-*-text`; a coloured background under white text uses `--color-*-strong` / `--color-*-strong-hover`. One-off colours: pick a light-mode shade that reaches 4.5:1 on its background (the 700 shades usually do).

## API Calls

- Never call bare `fetch()` — CI fails (`scripts/validate-no-raw-fetch.js`; exempt only `services/authApi.js`, `utils/fetchProvider.js`, tests).
- Use `apiClient`, `authAwareFetch` from `utils/fetchProvider.js`, or `fetchWithRetry`. These attach the Bearer token when a password is set and retry once after a silent refresh on `TOKEN_EXPIRED`.
- URLs come from `API_ENDPOINTS` in `config.js` (prefixed by `VITE_API_BASE_URL`, empty = same origin). No hard-coded hosts or ports.
- Per-domain API helpers live in `services/*Api.js`. Prefer `apiClient` for mutations: it adds the `X-Tab-ID` header that lets the originating tab ignore its own sync broadcast.

## Logging

Use `createLogger('Name')` from `utils/logger.js` instead of `console.*`.
