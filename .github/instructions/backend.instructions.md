---
description: "Use when editing backend Express code: routes, controllers, services, repositories, middleware, auth, logging, error handling."
applyTo: "backend/**/*.js"
---
# Backend Conventions

## Error Handling

- Current state: every controller wraps its body in `try/catch` and sends `res.status(...).json({ error })` itself. No controller uses `asyncHandler` yet; migrating them is tracked as R9 in `specs/codebase-quality-remediation/spec.md` (one controller per PR).
- When editing an existing controller, follow its existing pattern unless the change is that controller's R9 migration. New controllers use `asyncHandler` from `backend/middleware/errorHandler.js` and let errors reach `errorHandler` (registered last in `server.js`).
- Services throw errors with `error.statusCode` set (400 validation, 404 not found, 409 conflict). Honour `error.statusCode` instead of hard-coding 500.
- Never send stack traces to clients outside `NODE_ENV=development`.

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/items', asyncHandler(async (req, res) => {
  res.json(await itemService.getAll());
}));
```

## Logging

- `const logger = require('../config/logger');` then `logger.debug|info|warn|error(message, context)`. Include IDs/values in the context object.
- `LOG_LEVEL` (`debug`, `info` default, `warn`, `error`) controls output.

## Auth

- `authMiddleware` is applied to all of `/api` in `server.js`. Public endpoints are listed in `PUBLIC_ENDPOINTS` in `backend/middleware/authMiddleware.js` (`GET /api/health`, `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/refresh`); add new public endpoints there.
- Open mode (no password) lets everything through; password gate requires `Authorization: Bearer <accessToken>`. SSE (`/api/sync`) uses `sseAuthMiddleware` with `?token=`.

## Data Access

- `getDatabase()` returns a memoised, process-wide connection. Never `db.close()` it in request code; only backup restore uses `closeDatabase()`.
- Use parameterized SQL (`?` placeholders) in repositories.
- Money: round to cents (`Math.round(x * 100) / 100`). Credit card calculations use `COALESCE(posted_date, date)` and `COALESCE(original_cost, amount)`.

## Activity Log

Log user-visible mutations with `activityLogService.logEvent(eventType, entityType, entityId, userAction, metadata)` (`<entity>_added|_updated|_deleted`). It never throws. Pass `tabId` (from the `X-Tab-ID` header) in `metadata` so the originating tab ignores the SSE broadcast.
