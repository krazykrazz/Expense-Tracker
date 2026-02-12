/**
 * Property-Based Tests: Deployment History Query
 *
 * **Property 6: Deployment History Query**
 * **Validates: Requirements 7.3**
 *
 * For any query for deployment history with parameter N, the system should return
 * exactly the last N successful deployments ordered by timestamp descending,
 * with complete metadata for each deployment.
 */

const fc = require('fast-check');
const {
  queryDeploymentHistory,
  generateDeploymentMetadata,
} = require('./deploymentState');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 66666;

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
const sha = fc.stringMatching(/^[0-9a-f]{7}$/);
const version = fc.tuple(
  fc.integer({ min: 1, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([maj, min, pat]) => `${maj}.${min}.${pat}`);
const environment = fc.constantFrom('production', 'staging');
const status = fc.constantFrom('success', 'failed', 'rolled_back');
const healthResult = fc.constantFrom('passed', 'failed');

// Generate a deployment record with a unique sequential timestamp
const deploymentRecord = (index) =>
  fc.record({
    sha,
    environment,
    version,
    status,
    healthChecks: fc.record({ backend: healthResult, frontend: healthResult }),
  }).map((rec) => ({
    ...rec,
    // Use sequential timestamps so ordering is deterministic
    timestamp: new Date(Date.UTC(2026, 0, 1) + index * 3600000).toISOString(),
  }));

// Generate a list of deployment records with unique timestamps
const deploymentRecordList = fc.integer({ min: 0, max: 30 }).chain((count) =>
  fc.tuple(...Array.from({ length: count }, (_, i) => deploymentRecord(i)))
);

describe('Property 6: Deployment History Query', () => {
  /**
   * Validates: Requirement 7.3
   * Returns only successful deployments.
   */
  test('query returns only successful deployments', () => {
    fc.assert(
      fc.property(
        deploymentRecordList,
        fc.integer({ min: 1, max: 50 }),
        (records, n) => {
          const result = queryDeploymentHistory(records, n);

          for (const record of result) {
            expect(record.status).toBe('success');
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.3
   * Returns at most N records.
   */
  test('query returns at most N records', () => {
    fc.assert(
      fc.property(
        deploymentRecordList,
        fc.integer({ min: 0, max: 50 }),
        (records, n) => {
          const result = queryDeploymentHistory(records, n);
          expect(result.length).toBeLessThanOrEqual(n);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.3
   * Returns exactly min(N, successCount) records.
   */
  test('query returns exactly min(N, successCount) records', () => {
    fc.assert(
      fc.property(
        deploymentRecordList,
        fc.integer({ min: 0, max: 50 }),
        (records, n) => {
          const successCount = records.filter((r) => r.status === 'success').length;
          const result = queryDeploymentHistory(records, n);
          expect(result.length).toBe(Math.min(n, successCount));
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.3
   * Results are ordered by timestamp descending (newest first).
   */
  test('query results are ordered by timestamp descending', () => {
    fc.assert(
      fc.property(
        deploymentRecordList,
        fc.integer({ min: 1, max: 50 }),
        (records, n) => {
          const result = queryDeploymentHistory(records, n);

          for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].timestamp >= result[i].timestamp).toBe(true);
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.3
   * Each returned record has complete metadata fields.
   */
  test('each returned record has complete metadata', () => {
    fc.assert(
      fc.property(
        deploymentRecordList,
        fc.integer({ min: 1, max: 50 }),
        (records, n) => {
          const result = queryDeploymentHistory(records, n);

          for (const record of result) {
            expect(record.sha).toBeDefined();
            expect(record.timestamp).toBeDefined();
            expect(record.environment).toBeDefined();
            expect(record.version).toBeDefined();
            expect(record.status).toBe('success');
            expect(record.healthChecks).toBeDefined();
          }
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.3
   * Empty input returns empty array.
   */
  test('empty records returns empty result', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (n) => {
          const result = queryDeploymentHistory([], n);
          expect(result).toEqual([]);
        }
      ),
      pbtOptions()
    );
  });
});
