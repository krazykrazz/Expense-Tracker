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

Validates year/month values from:

- `query`
- `params`
- `body`

Validated values are attached to the request object.

## Error Handling

Location: `backend/middleware/errorHandler.js`

### `errorHandler`

Centralized Express error-handling middleware. It should remain the last middleware registered in the app.

### `asyncHandler`

Wrapper for async route handlers so thrown errors flow into the centralized error handler.

## Current Recommendation

Use these shared validators and middleware instead of re-implementing inline validation in new controllers and services.

This is especially important while the backend continues migrating toward broader `asyncHandler` + centralized error handling usage.

## Related Docs

- [Tech Debt](../TECH-DEBT.md)
- [Architecture Analysis](./ARCHITECTURE_ANALYSIS.md)
- [Testing Steering](../steering/testing.md)