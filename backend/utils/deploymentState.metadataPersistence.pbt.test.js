/**
 * Property-Based Tests: Deployment Metadata Persistence
 *
 * **Property 5: Deployment Metadata Persistence**
 * **Validates: Requirements 7.1, 7.2, 7.4, 7.5**
 *
 * For any successful deployment, the system should store deployment metadata
 * including SHA, timestamp, environment, version, and health check results,
 * and this metadata should be retrievable for at least 30 days.
 */

const fc = require('fast-check');
const {
  generateDeploymentMetadata,
  validateDeploymentMetadata,
  generateImageLabels,
} = require('./deploymentState');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 55555;

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
const sha = fc.stringMatching(/^[0-9a-f]{7,40}$/);
const isoTimestamp = fc.date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2027-12-31T23:59:59Z') })
  .filter((d) => !isNaN(d.getTime()))
  .map((d) => d.toISOString());
const environment = fc.constantFrom('production', 'staging', 'development');
const version = fc.tuple(
  fc.integer({ min: 1, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([maj, min, pat]) => `${maj}.${min}.${pat}`);
const status = fc.constantFrom('success', 'failed', 'rolled_back');
const healthResult = fc.constantFrom('passed', 'failed');
const healthChecks = fc.record({
  backend: healthResult,
  frontend: healthResult,
});

const deploymentParams = fc.record({
  sha,
  timestamp: isoTimestamp,
  environment,
  version,
  status,
  healthChecks,
});

describe('Property 5: Deployment Metadata Persistence', () => {
  /**
   * Validates: Requirement 7.1
   * Generated metadata always contains SHA, timestamp, environment, version.
   */
  test('generated metadata contains all required fields', () => {
    fc.assert(
      fc.property(
        deploymentParams,
        (params) => {
          const metadata = generateDeploymentMetadata(params);

          expect(metadata.sha).toBe(params.sha);
          expect(metadata.timestamp).toBe(params.timestamp);
          expect(metadata.environment).toBe(params.environment);
          expect(metadata.version).toBe(params.version);
          expect(metadata.status).toBe(params.status);
          expect(metadata.healthChecks.backend).toBe(params.healthChecks.backend);
          expect(metadata.healthChecks.frontend).toBe(params.healthChecks.frontend);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.1
   * All generated metadata passes validation.
   */
  test('generated metadata always passes validation', () => {
    fc.assert(
      fc.property(
        deploymentParams,
        (params) => {
          const metadata = generateDeploymentMetadata(params);
          const result = validateDeploymentMetadata(metadata);

          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.2
   * Metadata is serializable to JSON and deserializable back without data loss.
   */
  test('metadata survives JSON round-trip without data loss', () => {
    fc.assert(
      fc.property(
        deploymentParams,
        (params) => {
          const metadata = generateDeploymentMetadata(params);
          const serialized = JSON.stringify(metadata);
          const deserialized = JSON.parse(serialized);

          expect(deserialized).toEqual(metadata);
          const result = validateDeploymentMetadata(deserialized);
          expect(result.valid).toBe(true);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.4
   * OCI image labels include version, SHA, and build timestamp.
   */
  test('image labels include version, SHA, and build timestamp', () => {
    fc.assert(
      fc.property(
        sha,
        version,
        isoTimestamp,
        (testSha, testVersion, testDate) => {
          const labels = generateImageLabels({
            version: testVersion,
            sha: testSha,
            buildDate: testDate,
            source: 'https://github.com/test/repo',
          });

          expect(labels['org.opencontainers.image.version']).toBe(testVersion);
          expect(labels['org.opencontainers.image.revision']).toBe(testSha);
          expect(labels['org.opencontainers.image.created']).toBe(testDate);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 7.5
   * Metadata with rollback info preserves rollback details.
   */
  test('rollback info is preserved in metadata when provided', () => {
    fc.assert(
      fc.property(
        deploymentParams,
        sha,
        isoTimestamp,
        (params, prevSha, rollbackTs) => {
          const withRollback = {
            ...params,
            status: 'rolled_back',
            rollbackInfo: {
              previousSha: prevSha,
              reason: 'Health check failure',
              timestamp: rollbackTs,
            },
          };

          const metadata = generateDeploymentMetadata(withRollback);

          expect(metadata.rollbackInfo).toBeDefined();
          expect(metadata.rollbackInfo.previousSha).toBe(prevSha);
          expect(metadata.rollbackInfo.reason).toBe('Health check failure');
          expect(metadata.rollbackInfo.timestamp).toBe(rollbackTs);
        }
      ),
      pbtOptions()
    );
  });
});
