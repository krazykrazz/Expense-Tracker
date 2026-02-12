/**
 * Property-Based Tests: Health Check Workflow Completeness
 *
 * **Property 2: Health Check Workflow Completeness**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
 *
 * For any deployment, when the container is running, health checks should be
 * performed on all configured endpoints (backend and frontend), and deployment
 * should only be marked successful when all endpoints return 200 status codes.
 */

const fc = require('fast-check');
const { executeMultiEndpointHealthCheck } = require('./healthCheck');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 67890;

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

const baseConfig = { maxRetries: 3, retryDelay: 1, timeout: 5 };

// Create an endpoint that always returns a given status
const makeEndpoint = (name, statusCode) => ({
  name,
  httpCall: () => Promise.resolve({ statusCode }),
});

// Arbitrary for endpoint names (unique, non-empty)
const endpointName = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

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
