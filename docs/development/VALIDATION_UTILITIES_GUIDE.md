# Validation Utilities Guide

This guide documents the backend validation helpers and middleware used across the application.

## Utilities

Location: `backend/utils/validators.js`

### `validateNumber(value, fieldName, options = {})`

Use for numeric validation with optional constraints.

Common options:

- `min`
- `max`
- `required`
- `allowNull`

### `validateString(value, fieldName, options = {})`

Use for string validation with optional constraints such as:

- `minLength`
- `maxLength`
- `required`
- `pattern`

### `validateYearMonth(year, month)`

Use for paired year/month validation in services and controllers.

## Middleware

Location: `backend/middleware/validateYearMonth.js`

### `validateYearMonth(source = 'query')`

Validates `year` (1900–2100) and `month` (1–12) from `req.query`, `req.params` or `req.body`, responding `400` on failure. On success it sets `req.validatedYear` and `req.validatedMonth`.

No route currently mounts this middleware; services call the `validators.js` `validateYearMonth(year, month)` utility instead.

## Error Handling

Location: `backend/middleware/errorHandler.js` — `errorHandler` (registered last in `server.js`) and `asyncHandler`. See [backend.instructions.md](../../.github/instructions/backend.instructions.md) for current usage and the migration target.

## Current Recommendation

Use these shared validators and middleware instead of re-implementing inline validation in new controllers and services.

## Related Docs

- [Backend instructions](../../.github/instructions/backend.instructions.md)
- [Tech Debt](../TECH-DEBT.md)