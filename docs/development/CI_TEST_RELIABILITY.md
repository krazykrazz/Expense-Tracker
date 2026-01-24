# CI Test Reliability Guide

This document describes the improvements made to ensure tests run reliably in CI environments (GitHub Actions).

## Overview

CI environments differ from local development in several ways:
- Slower CPU/memory resources
- Different timing characteristics
- No persistent state between runs
- Parallel execution constraints

These differences can cause tests that pass locally to fail in CI ("flaky tests").

## Implemented Improvements

### 1. Shared PBT Arbitraries

Location: 
- Backend: `backend/test/pbtArbitraries.js`
- Frontend: `frontend/src/test/pbtArbitraries.js`

These modules provide pre-configured fast-check arbitraries that filter out edge cases:

```javascript
// Backend
const { safeDate, safeAmount, pbtOptions } = require('../test/pbtArbitraries');

await fc.assert(
  fc.asyncProperty(safeDate(), safeAmount(), async (date, amount) => {
    // test logic
  }),
  pbtOptions()
);

// Frontend
import { safeDate, safeAmount, pbtOptions } from '../test/pbtArbitraries';
```

**Safe arbitraries include:**
- `safeDate()` - Dates that won't throw on `toISOString()`
- `safeAmount()` - Floats that are never NaN, Infinity, or negative
- `safeString()` - Non-empty, trimmed strings
- `safePlaceName()` - Valid place names without special characters
- `expenseType` - Valid expense categories
- `paymentMethod` - Valid payment methods

### 2. CI-Specific Timeouts

Tests automatically use longer timeouts in CI:

| Context | Local | CI |
|---------|-------|-----|
| Default test | 15s | 30s |
| Async operations | 25s | 45s |
| Database operations | 30s | 60s |
| Integration tests | 45s | 90s |

Configuration is in:
- Backend: `backend/jest.setup.js`, `backend/package.json`
- Frontend: `frontend/vitest.config.js`

### 3. Fixed Seeds for PBT in CI

Property-based tests use a fixed seed (12345) in CI for reproducibility:

```javascript
const { pbtOptions } = require('../test/pbtArbitraries');

await fc.assert(
  fc.asyncProperty(...),
  pbtOptions()  // Automatically uses fixed seed in CI
);
```

This means:
- Failed tests can be reproduced exactly
- Same inputs are generated every CI run
- Easier debugging of CI-only failures

### 4. Retry Logic for Flaky Tests

Both Jest and Vitest are configured to retry failed tests in CI:

- **Backend (Jest)**: `jest.retryTimes(2)` in `jest.setup.js`
- **Frontend (Vitest)**: `retry: 2` in `vitest.config.js`

Tests are retried up to 2 times before being marked as failed.

### 5. Timer Cleanup

Frontend tests automatically clean up timers after each test to prevent "window is not defined" errors:

```javascript
// In vitest.setup.js
afterEach(() => {
  vi.clearAllTimers();
  vi.clearAllMocks();
});
```

Components should also clean up their own timers on unmount (see ExpenseForm.jsx for example).

## Best Practices

### Writing Reliable PBT Tests

1. **Use safe arbitraries:**
   ```javascript
   // Bad - can generate invalid dates
   fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
   
   // Good - handles edge cases
   safeDate({ min: new Date('2020-01-01'), max: new Date('2025-12-31') })
   ```

2. **Use pbtOptions() for configuration:**
   ```javascript
   // Bad - hardcoded values
   { numRuns: 20, timeout: 15000 }
   
   // Good - CI-aware configuration
   pbtOptions({ numRuns: 20 })
   ```

3. **Filter problematic values:**
   ```javascript
   // If you need custom arbitraries, always filter edge cases
   fc.float({ min: 0.01, max: 100, noNaN: true })
     .filter(n => !isNaN(n) && isFinite(n) && n > 0)
   ```

### Writing Reliable React Tests

1. **Clean up timers in components:**
   ```javascript
   useEffect(() => {
     const timeoutId = setTimeout(() => { ... }, 1000);
     return () => clearTimeout(timeoutId);
   }, []);
   ```

2. **Use fake timers for timing-sensitive tests:**
   ```javascript
   beforeEach(() => {
     vi.useFakeTimers();
   });
   
   afterEach(() => {
     vi.useRealTimers();
   });
   ```

3. **Wait for async operations:**
   ```javascript
   await waitFor(() => {
     expect(screen.getByText('Success')).toBeInTheDocument();
   });
   ```

### Debugging CI Failures

1. **Check the seed:** CI uses seed 12345, so you can reproduce locally:
   ```javascript
   await fc.assert(..., { seed: 12345 });
   ```

2. **Check the counterexample:** fast-check provides the failing input
   
3. **Run with verbose output:**
   ```bash
   CI=true npm test -- --verbose
   ```

## Configuration Files

| File | Purpose |
|------|---------|
| `backend/jest.setup.js` | Jest setup with CI detection, retries, timeouts |
| `backend/test/pbtArbitraries.js` | Safe arbitraries for backend PBT |
| `backend/test/testConstants.js` | Centralized test constants |
| `frontend/vitest.config.js` | Vitest config with CI settings |
| `frontend/vitest.setup.js` | Vitest setup with cleanup |
| `frontend/src/test/pbtArbitraries.js` | Safe arbitraries for frontend PBT |

## Environment Variables

| Variable | Effect |
|----------|--------|
| `CI=true` | Enables CI mode (longer timeouts, retries, fixed seeds) |
| `GITHUB_ACTIONS=true` | Same as CI=true |
| `NODE_ENV=test` | Enables test mode |

---

Last Updated: January 2026
