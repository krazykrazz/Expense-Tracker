/**
 * Jest Setup File for Backend Tests
 * 
 * This file runs before each test file.
 * It configures the test environment to use an in-memory SQLite database
 * instead of the production database.
 * 
 * IMPORTANT: Tests that need to work with real files (like backup tests)
 * should set process.env.SKIP_TEST_DB = 'true' before importing the database module.
 * 
 * NOTE: Database cleanup is handled by individual tests in their afterEach hooks.
 * This setup only initializes the test database once.
 * 
 * CI RELIABILITY FEATURES:
 * - Increased timeouts for CI environments
 * - Retry logic for flaky tests (jest.retryTimes)
 * - Console suppression to reduce noise
 */

const { getTestDatabase, closeTestDatabase } = require('./database/db');

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Global test timeout - longer in CI due to slower runners
const baseTimeout = isCI ? 45000 : 30000;
jest.setTimeout(baseTimeout);

// Enable retry for flaky tests in CI (retry failed tests up to 2 times)
if (isCI) {
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}

// Track if we've initialized the test database
let testDbInitialized = false;

// Before all tests in a file, ensure test database is ready
beforeAll(async () => {
  // Skip test database setup for tests that need real files
  if (process.env.SKIP_TEST_DB === 'true') {
    return;
  }
  
  try {
    await getTestDatabase();
    testDbInitialized = true;
  } catch (err) {
    console.error('Failed to initialize test database:', err);
    throw err;
  }
});

// NOTE: We do NOT reset the database in beforeEach anymore.
// Each test is responsible for its own cleanup in afterEach.
// This prevents race conditions with tests that store db references.

// After all tests complete, close the database connection
afterAll(async () => {
  if (process.env.SKIP_TEST_DB === 'true') {
    return;
  }
  
  // Don't close the database here - it's shared across test files
  // and Jest runs files in parallel. The database will be cleaned up
  // when the process exits.
  testDbInitialized = false;
});

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };
beforeAll(() => {
  // Only suppress in CI or when NODE_ENV is test
  if (isCI || process.env.NODE_ENV === 'test') {
    console.log = jest.fn();
    console.warn = jest.fn();
    // Keep console.error for debugging test failures
    // console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  if (isCI || process.env.NODE_ENV === 'test') {
    Object.assign(console, originalConsole);
  }
});

// Export CI detection for use in tests
global.isCI = isCI;
