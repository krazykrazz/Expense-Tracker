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
 * - Directory initialization for file-based tests
 */

const fs = require('fs');
const path = require('path');
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

// Ensure required directories exist for file-based tests
const ensureTestDirectories = () => {
  const configDir = path.join(__dirname, 'config');
  const directories = [
    path.join(configDir, 'database'),
    path.join(configDir, 'backups'),
    path.join(configDir, 'invoices'),
    path.join(configDir, 'invoices', 'temp'),
    path.join(configDir, 'config')
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

// Initialize directories before any tests run
ensureTestDirectories();

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
  
  // Close the per-worker database connection and clean up the file
  // Use the top-level import to avoid issues when jest.resetModules() replaces the module cache
  if (typeof closeTestDatabase === 'function') {
    closeTestDatabase();
  }
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
