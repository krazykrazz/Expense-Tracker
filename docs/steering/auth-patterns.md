---
inclusion: fileMatch
fileMatchPattern: '**/auth*,**/Auth*,**/fetchProvider*,**/apiClient*'
---

# Authentication Patterns

## Dual Mode: Password_Gate vs Open_Mode

The app operates in two modes:
- **Open_Mode**: No password set. All requests pass through auth middleware without token checks.
- **Password_Gate**: Password is set. JWT Bearer tokens required on all non-public endpoints.

Mode is determined by whether a password hash exists in the settings table.

## Backend Auth

### Public Endpoints (no token required)
Defined in `backend/middleware/authMiddleware.js`:
- `GET /api/health`
- `GET /api/auth/status`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

All other endpoints require a valid Bearer token when Password_Gate is active.

### SSE Authentication
EventSource API doesn't support custom headers. SSE endpoints accept the JWT via query parameter: `?token=<jwt>`. Validated at connection time by `sseAuthMiddleware`.

### Token Flow
- Login returns access token (short-lived) + refresh token (longer-lived)
- Access token sent as `Authorization: Bearer <token>`
- On `TOKEN_EXPIRED` (401), client uses refresh token to get a new access token

## Frontend Auth

### fetchProvider.js
Module-level fetch reference. Defaults to native `fetch`. When Password_Gate is active, `AuthContext` replaces it with `authFetch` which:
1. Attaches Bearer token to every request
2. On 401 TOKEN_EXPIRED, silently refreshes and retries once

### Usage in Components
- Use `authAwareFetch(url, opts)` from `fetchProvider.js` — convenience wrapper around `getFetchFn()()`
- Or use `apiClient` methods which internally use `getFetchFn()`
- **Never** use bare `fetch()` — enforced by `scripts/validate-no-raw-fetch.js` in CI

### AuthContext
- Manages JWT state (access token, refresh token)
- Detects Password_Gate vs Open_Mode on mount via `/api/auth/status`
- Provides `setFetchFn` on login to swap in `authFetch`
- Handles logout (clears tokens, reverts to native fetch)

## Rules

- New API endpoints: add to routes with `authMiddleware` (already applied globally via `server.js`)
- New public endpoints: add to `PUBLIC_ENDPOINTS` array in `authMiddleware.js`
- New frontend API calls: use `apiClient` or `authAwareFetch`, never bare `fetch()`
- SSE connections: use `sseAuthMiddleware` and pass token as query param
