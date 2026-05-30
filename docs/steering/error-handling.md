---
inclusion: fileMatch
fileMatchPattern: 'backend/controllers/**,backend/services/**,backend/middleware/**'
---

# Error Handling Patterns

## asyncHandler

All async route handlers must be wrapped with `asyncHandler` from `backend/middleware/errorHandler.js`. This catches rejected promises and forwards them to the centralized error handler.

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/items', asyncHandler(async (req, res) => {
  const items = await itemService.getAll();
  res.json(items);
}));
```

## Centralized Error Handler

`errorHandler` is the last middleware in the Express app. It reads `err.statusCode` (or `err.status`) and sends a JSON error response. In development mode it includes the stack trace.

## Throwing Errors with Status Codes

Set `statusCode` on the error object before throwing:

```javascript
const error = new Error('Item not found');
error.statusCode = 404;
throw error;
```

Common status codes used:
- `400` — validation failures, bad input
- `401` — authentication required / token expired
- `404` — resource not found
- `409` — conflict (duplicate, constraint violation)
- `500` — unexpected server errors (default)

## Service Layer Errors

Services throw errors with `statusCode`. Controllers don't need try/catch when using `asyncHandler` — errors propagate automatically.

## Rules

- Never send raw error stacks to clients in production
- Always set `statusCode` on intentional errors
- Use `asyncHandler` on every async route — missing it causes unhandled promise rejections
- Log errors via the logger module, not `console.error`
