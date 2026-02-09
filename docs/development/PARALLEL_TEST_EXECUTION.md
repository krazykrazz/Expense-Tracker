# Parallel Test Execution

This document explains the parallel test execution strategy implemented for both backend and frontend tests.

## Overview

Both backend (Jest) and frontend (Vitest) tests now support parallel execution, significantly reducing test run times during feature promotion and development.

## Performance Improvements

### Before (Sequential Execution)
- **Backend tests**: 45-60 minutes
- **Frontend tests**: ~5-10 minutes
- **Total**: ~50-70 minutes

### After (Parallel Execution)
- **Backend tests**: 10-15 minutes (3-5x faster)
- **Frontend tests**: ~2-3 minutes (2-4x faster)
- **Total**: ~12-18 minutes (4-5x faster)

## Backend (Jest)

### Infrastructure
- **Per-worker database isolation**: Each Jest worker gets its own SQLite database file
- **Database files**: `test-expenses-worker-1.db`, `test-expenses-worker-2.db`, etc.
- **Worker pool**: Uses `--maxWorkers=50%` to utilize half of CPU cores
- **Cleanup**: Automatic cleanup of worker databases after tests complete

### Commands

```bash
# Parallel execution (recommended for promote script)
npm run test:parallel

# Fast parallel (reduced PBT iterations + parallel)
npm run test:fast:parallel

# Unit tests only (parallel)
npm run test:unit:parallel

# PBT tests only (parallel)
npm run test:pbt:parallel

# Sequential (for debugging)
npm test
```

### Configuration
- **package.json**: Added `test:parallel`, `test:fast:parallel`, `test:unit:parallel`, `test:pbt:parallel` scripts
- **jest.setup.js**: Per-worker database initialization
- **jest.globalSetup.js**: Cleanup of stale worker databases
- **database/db.js**: Worker-specific database path generation

## Frontend (Vitest)

### Infrastructure
- **Worker pools**: Vitest uses forked processes for test isolation
- **jsdom isolation**: Each worker gets its own jsdom environment
- **Automatic parallelism**: Enabled by default in local dev, sequential in CI
- **No shared state**: Tests are isolated and don't interfere with each other

### Commands

```bash
# Parallel execution (explicit, recommended for promote script)
npm run test:parallel

# Fast parallel (reduced PBT iterations + parallel)
npm run test:fast:parallel

# Default (automatic parallelism in local dev)
npm test

# Watch mode
npm run test:watch
```

### Configuration
- **package.json**: Added `test:parallel` and `test:fast:parallel` scripts
- **vitest.config.js**: Configured fork pool with automatic parallelism
- **CI mode**: Sequential execution with retries for stability

## Promote Script Integration

The `scripts/promote-feature.ps1` script now uses parallel execution by default:

```powershell
# Backend tests (parallel)
npm run test:parallel

# Frontend tests (parallel)
npm run test:parallel
```

This reduces the total test time from 50-70 minutes to 12-18 minutes.

## When to Use Each Mode

### Parallel (Recommended)
- ✅ Feature promotion (`promote-feature.ps1`)
- ✅ Pre-commit checks
- ✅ Quick feedback during development
- ✅ CI/CD pipelines (with appropriate worker limits)

### Sequential (Debugging)
- ✅ Debugging specific test failures
- ✅ Investigating race conditions
- ✅ Analyzing test output in detail
- ✅ Running single test files

## CI/CD Considerations

### GitHub Actions
- Backend: Uses parallel execution with per-worker databases
- Frontend: Uses sequential execution for stability (configured in `vitest.config.js`)
- Retries: Both have retry logic for flaky tests

### Local Development
- Backend: Parallel by default with `test:parallel`
- Frontend: Parallel by default with `test:parallel`
- Fast mode: Use `test:fast:parallel` for quickest feedback

## Troubleshooting

### Backend Tests Fail in Parallel
- Check for shared state between tests
- Ensure tests clean up after themselves in `afterEach`
- Verify database isolation is working (check for worker-specific db files)

### Frontend Tests Fail in Parallel
- Check for global state mutations
- Ensure mocks are properly isolated
- Verify no DOM pollution between tests

### Performance Not Improving
- Check CPU core count: `--maxWorkers=50%` needs multiple cores
- Verify tests aren't I/O bound (database, file system)
- Check for test bottlenecks (long-running tests)

## Best Practices

1. **Write isolated tests**: Tests should not depend on execution order
2. **Clean up after tests**: Use `afterEach` to reset state
3. **Avoid shared state**: Each test should be independent
4. **Use parallel for speed**: Default to parallel execution
5. **Use sequential for debugging**: Switch to sequential when investigating failures

## Future Improvements

- **Dynamic worker allocation**: Adjust worker count based on available resources
- **Test sharding**: Split tests across multiple machines for even faster execution
- **Selective parallelism**: Run slow tests in parallel, fast tests sequentially
- **Better progress reporting**: Show per-worker progress during parallel execution
