/**
 * Property-Based Tests: Health Check System
 *
 * Consolidated tests for health check functionality including:
 * - Property 1: Health Check Retry Behavior (Requirements 5.4, 5.5)
 * - Property 2: Health Check Workflow Completeness (Requirements 5.1, 5.2, 5.3, 5.6)
  *
 * @invariant Health Check Retry Behavior: For any health check configuration, retry backoff delays increase monotonically; the total number of attempts does not exceed the configured maximum; successful checks short-circuit remaining retries. Randomization covers diverse timeout, retry count, and endpoint configurations.
 */

const fc = require('fast-check');
const {
  calculateBackoffDelay,
  executeHealthCheck,
  validateConfig,
  executeMultiEndpointHealthCheck,
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

const baseConfig = { maxRetries: 3, retryDelay: 1, timeout: 5 };

// Create an endpoint that always returns a given status
const makeEndpoint = (name, statusCode) => ({
  name,
  httpCall: () => Promise.resolve({ statusCode }),
});

// Arbitrary for endpoint names (unique, non-empty)
const endpointName = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

describe('Health Check System - Property-Based Tests', () => {
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

  describe('Property 2: Health Check Workflow Completeness', () => {
    /**
     * Validates: Requirements 5.2, 5.3
     * Deployment succeeds only when ALL endpoints return 200.
     */
    test('deployment succeeds when all endpoints return 200', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(endpointName, { minLength: 1, maxLength: 5 }),
          async (names) => {
            const endpoints = names.map((n) => makeEndpoint(n, 200));
            const result = await executeMultiEndpointHealthCheck(baseConfig, endpoints);

            expect(result.success).toBe(true);
            expect(result.failedEndpoints).toHaveLength(0);
            // Every endpoint should have a result
            for (const name of names) {
              expect(result.results[name]).toBeDefined();
              expect(result.results[name].success).toBe(true);
            }
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 5.2, 5.6
     * Deployment fails when ANY endpoint fails, even if others succeed.
     */
    test('deployment fails when any single endpoint fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(endpointName, { minLength: 2, maxLength: 5 }),
          fc.nat({ max: 4 }),
          fc.constantFrom(400, 500, 502, 503),
          async (names, failIndexRaw, failStatus) => {
            const failIndex = failIndexRaw % names.length;
            const endpoints = names.map((n, i) =>
              makeEndpoint(n, i === failIndex ? failStatus : 200)
            );

            const result = await executeMultiEndpointHealthCheck(baseConfig, endpoints);

            expect(result.success).toBe(false);
            expect(result.failedEndpoints).toContain(names[failIndex]);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 5.1, 5.6
     * Health checks are performed on ALL configured endpoints, not just the first.
     */
    test('all configured endpoints are checked', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(endpointName, { minLength: 1, maxLength: 5 }),
          async (names) => {
            const callCounts = {};
            const endpoints = names.map((n) => {
              callCounts[n] = 0;
              return {
                name: n,
                httpCall: () => {
                  callCounts[n]++;
                  return Promise.resolve({ statusCode: 200 });
                },
              };
            });

            await executeMultiEndpointHealthCheck(baseConfig, endpoints);

            // Every endpoint must have been called at least once
            for (const name of names) {
              expect(callCounts[name]).toBeGreaterThanOrEqual(1);
            }
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 5.2, 5.3
     * With no endpoints configured, deployment cannot succeed.
     */
    test('deployment fails with no endpoints configured', async () => {
      const result = await executeMultiEndpointHealthCheck(baseConfig, []);
      expect(result.success).toBe(false);
      expect(result.failedEndpoints.length).toBeGreaterThan(0);
    });

    /**
     * Validates: Requirements 5.2, 5.6
     * Both backend and frontend endpoints must pass for deployment success.
     * Models the real CI scenario with exactly two endpoints.
     */
    test('both backend and frontend must pass for deployment success', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (backendUp, frontendUp) => {
            const endpoints = [
              makeEndpoint('backend', backendUp ? 200 : 503),
              makeEndpoint('frontend', frontendUp ? 200 : 503),
            ];

            const result = await executeMultiEndpointHealthCheck(baseConfig, endpoints);

            if (backendUp && frontendUp) {
              expect(result.success).toBe(true);
            } else {
              expect(result.success).toBe(false);
              if (!backendUp) expect(result.failedEndpoints).toContain('backend');
              if (!frontendUp) expect(result.failedEndpoints).toContain('frontend');
            }
          }
        ),
        pbtOptions()
      );
    });
  });
});
