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
 */

const { getTestDatabase, closeTestDatabase } = require('./database/db');

// Global test timeout for property-based tests
jest.setTimeout(30000);

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
  if (process.env.CI || process.env.NODE_ENV === 'test') {
    console.log = jest.fn();
    console.warn = jest.fn();
    // Keep console.error for debugging test failures
    // console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console
  if (process.env.CI || process.env.NODE_ENV === 'test') {
    Object.assign(console, originalConsole);
  }
});
