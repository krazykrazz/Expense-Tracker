/**
 * Property-Based Tests: Health Check Retry Behavior
 *
 * **Property 1: Health Check Retry Behavior**
 * **Validates: Requirements 5.4, 5.5**
 *
 * For any health check configuration, the retry logic should attempt exactly
 * the configured number of retries with exponential backoff delays, and should
 * only succeed when receiving a 200 status code.
 */

const fc = require('fast-check');
const {
  calculateBackoffDelay,
  executeHealthCheck,
  validateConfig,
} = require('./healthCheck');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 54321;

const pbtOptions = (overrides = {}) => {
  const envNumRuns = process.env.FAST_CHECK_NUM_RUNS
    ? parseInt(process.env.FAST_CHECK_NUM_RUNS, 10)
    : null;
  return {
    numRuns: envNumRuns || (isCI ? 25 : 50),
    seed: isCI ? CI_SEED : undefined,
    endOnFailure: true,
    ...overrides,
  };
};

// Arbitraries
const validMaxRetries = fc.integer({ min: 1, max: 20 });
const validRetryDelay = fc.integer({ min: 1, max: 10 });
const validTimeout = fc.integer({ min: 1, max: 60 });
const nonSuccessStatus = fc.constantFrom(400, 404, 500, 502, 503, 0);

const validConfig = fc.record({
  maxRetries: validMaxRetries,
  retryDelay: validRetryDelay,
  timeout: validTimeout,
});

describe('Property 1: Health Check Retry Behavior', () => {
  /**
   * Validates: Requirement 5.5
   * Exponential backoff: delay doubles on each retry attempt.
   */
  test('backoff delay doubles with each attempt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 15 }),
        validRetryDelay,
        (attempt, baseDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay);
          expect(delay).toBe(baseDelay * Math.pow(2, attempt - 1));

          if (attempt > 1) {
            const prevDelay = calculateBackoffDelay(attempt - 1, baseDelay);
            expect(delay).toBe(prevDelay * 2);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 5.4
   * Health check retries exactly maxRetries times when endpoint never returns 200.
   */
  test('attempts exactly maxRetries times on persistent failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        validConfig,
        nonSuccessStatus,
        async (config, failStatus) => {
          let callCount = 0;
          const httpCall = () => {
            callCount++;
            return Promise.resolve({ statusCode: failStatus });
          };

          const result = await executeHealthCheck(config, httpCall);

          expect(result.success).toBe(false);
          expect(result.attempts).toBe(config.maxRetries);
          expect(callCount).toBe(config.maxRetries);
          expect(result.lastStatus).toBe(failStatus);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   * Health check succeeds immediately on first 200 response, no unnecessary retries.
   */
  test('succeeds on first 200 without retrying', async () => {
    await fc.assert(
      fc.asyncProperty(
        validConfig,
        async (config) => {
          let callCount = 0;
          const httpCall = () => {
            callCount++;
            return Promise.resolve({ statusCode: 200 });
          };

          const result = await executeHealthCheck(config, httpCall);

          expect(result.success).toBe(true);
          expect(result.attempts).toBe(1);
          expect(callCount).toBe(1);
          expect(result.totalWaitTime).toBe(0);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   * When endpoint succeeds on attempt K, exactly K attempts are made
   * and total wait time equals sum of backoff delays for attempts 1..K-1.
   */
  test('stops retrying after first success and accumulates correct wait time', async () => {
    await fc.assert(
      fc.asyncProperty(
        validConfig,
        fc.integer({ min: 1, max: 20 }),
        async (config, successAttemptRaw) => {
          const successAttempt = Math.min(successAttemptRaw, config.maxRetries);
          let callCount = 0;

          const httpCall = () => {
            callCount++;
            const status = callCount === successAttempt ? 200 : 500;
            return Promise.resolve({ statusCode: status });
          };

          const result = await executeHealthCheck(config, httpCall);

          expect(result.success).toBe(true);
          expect(result.attempts).toBe(successAttempt);
          expect(callCount).toBe(successAttempt);

          // Total wait = sum of backoff delays for attempts before success
          let expectedWait = 0;
          for (let i = 1; i < successAttempt; i++) {
            expectedWait += calculateBackoffDelay(i, config.retryDelay);
          }
          expect(result.totalWaitTime).toBe(expectedWait);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 5.4
   * Only HTTP 200 is treated as success; all other codes cause retry.
   */
  test('only 200 status code is treated as success', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 599 }).filter((s) => s !== 200),
        async (failStatus) => {
          const config = { maxRetries: 1, retryDelay: 1, timeout: 5 };
          const httpCall = () => Promise.resolve({ statusCode: failStatus });

          const result = await executeHealthCheck(config, httpCall);

          expect(result.success).toBe(false);
          expect(result.lastStatus).toBe(failStatus);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   * Config validation rejects invalid configurations.
   */
  test('config validation rejects invalid values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 0 }),
        (badRetries) => {
          const result = validateConfig({
            maxRetries: badRetries,
            retryDelay: 5,
            timeout: 30,
          });
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }
      ),
      pbtOptions()
    );
  });
});
