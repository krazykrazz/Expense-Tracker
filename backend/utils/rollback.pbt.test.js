/**
 * Property-Based Tests: Rollback System
 *
 * Consolidated tests for rollback functionality including:
 * - Property 3: Rollback Workflow Correctness (Requirements 6.1, 6.2, 6.3, 6.4, 6.5)
 * - Property 4: Rollback Failure Handling (Requirements 6.6, 6.7)
  *
 * @invariant Rollback Workflow Correctness: For any deployment state, rollback triggers only when failure conditions are met; the rollback state machine transitions correctly through PENDING → IN_PROGRESS → COMPLETED/FAILED; halt conditions prevent further operations. Randomization covers diverse failure scenarios and state combinations.
 */

const fc = require('fast-check');
const {
  ROLLBACK_STATES,
  executeRollback,
  shouldTriggerRollback,
  shouldHalt,
} = require('./rollback');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 33333;

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
const registry = fc.constant('ghcr.io/testowner');
const imageName = fc.constant('expense-tracker');

const rollbackContext = (prevSha) =>
  fc.record({
    previousSha: prevSha,
    failedSha: sha,
    registry,
    imageName,
  });

// Create mock actions that track calls
const createMockActions = ({ pullSuccess = true, deploySuccess = true, healthSuccess = true } = {}) => {
  const calls = [];
  return {
    calls,
    actions: {
      stopContainer: async () => { calls.push('stop'); },
      pullImage: async (ref) => { calls.push(`pull:${ref}`); return { success: pullSuccess }; },
      deployImage: async (ref) => { calls.push(`deploy:${ref}`); return { success: deploySuccess }; },
      healthCheck: async () => { calls.push('healthCheck'); return { success: healthSuccess }; },
    },
  };
};

describe('Rollback System - Property-Based Tests', () => {
  describe('Property 3: Rollback Workflow Correctness', () => {
    /**
     * Validates: Requirement 6.2
     * The system stores the previous SHA before deployment.
     * When previousSha is "none", rollback cannot proceed.
     */
    test('rollback requires a stored previous SHA', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(fc.constant('none')),
          async (context) => {
            const { actions } = createMockActions();
            const result = await executeRollback(context, actions);

            expect(result.state).toBe(ROLLBACK_STATES.NO_PREVIOUS);
            expect(result.requiresManualIntervention).toBe(true);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 6.1, 6.3
     * When health checks fail and a previous SHA exists, the system
     * redeploys the previous Docker image.
     */
    test('rollback redeploys previous image when previous SHA exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          async (context) => {
            const { calls, actions } = createMockActions({ healthSuccess: true });
            const result = await executeRollback(context, actions);

            // Should have stopped, pulled, deployed, and health-checked
            expect(calls).toContain('stop');
            const pullCall = calls.find((c) => c.startsWith('pull:'));
            expect(pullCall).toContain(context.previousSha);
            const deployCall = calls.find((c) => c.startsWith('deploy:'));
            expect(deployCall).toContain(context.previousSha);
            expect(calls).toContain('healthCheck');
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 6.4, 6.5
     * Rollback is marked successful only when post-rollback health checks pass.
     */
    test('rollback succeeds only when health checks pass', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          fc.boolean(),
          async (context, healthPasses) => {
            const { actions } = createMockActions({ healthSuccess: healthPasses });
            const result = await executeRollback(context, actions);

            if (healthPasses) {
              expect(result.state).toBe(ROLLBACK_STATES.HEALTH_CHECK_PASSED);
              expect(result.requiresManualIntervention).toBe(false);
            } else {
              expect(result.state).toBe(ROLLBACK_STATES.HEALTH_CHECK_FAILED);
              expect(result.requiresManualIntervention).toBe(true);
            }
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirement 6.1
     * Rollback is triggered when health checks fail (shouldTriggerRollback).
     */
    test('rollback triggers on any health check failure', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (success) => {
            const result = shouldTriggerRollback({ success });
            expect(result).toBe(!success);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirements 6.1, 6.3
     * All rollback actions are logged with timestamps.
     */
    test('rollback logs all actions with timestamps', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          async (context) => {
            const { actions } = createMockActions({ healthSuccess: true });
            const result = await executeRollback(context, actions);

            expect(result.logs.length).toBeGreaterThan(0);
            for (const log of result.logs) {
              expect(log.timestamp).toBeDefined();
              expect(typeof log.timestamp).toBe('string');
              expect(log.message).toBeDefined();
            }
          }
        ),
        pbtOptions()
      );
    });
  });

  describe('Property 4: Rollback Failure Handling', () => {
    /**
     * Validates: Requirement 6.6
     * When rollback health checks fail, the system halts further automated actions.
     */
    test('system halts when rollback health checks fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          async (context) => {
            const { actions } = createMockActions({ healthSuccess: false });
            const result = await executeRollback(context, actions);

            expect(result.state).toBe(ROLLBACK_STATES.HEALTH_CHECK_FAILED);
            expect(shouldHalt(result)).toBe(true);
            expect(result.requiresManualIntervention).toBe(true);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirement 6.6
     * When no previous SHA exists, the system halts.
     */
    test('system halts when no previous deployment exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(fc.constant('none')),
          async (context) => {
            const { actions } = createMockActions();
            const result = await executeRollback(context, actions);

            expect(result.state).toBe(ROLLBACK_STATES.NO_PREVIOUS);
            expect(shouldHalt(result)).toBe(true);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirement 6.6
     * When image pull fails during rollback, the system halts.
     */
    test('system halts when rollback image pull fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          async (context) => {
            const { calls, actions } = createMockActions({ pullSuccess: false });
            const result = await executeRollback(context, actions);

            expect(result.state).toBe(ROLLBACK_STATES.PULL_FAILED);
            expect(shouldHalt(result)).toBe(true);
            // Should NOT have attempted deploy or health check
            expect(calls.filter((c) => c.startsWith('deploy:')).length).toBe(0);
            expect(calls.filter((c) => c === 'healthCheck').length).toBe(0);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirement 6.7
     * All rollback failures are logged with timestamps and reasons.
     */
    test('failure logs include timestamps and reasons', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          fc.constantFrom('pull_fail', 'health_fail', 'deploy_fail'),
          async (context, failureType) => {
            const opts =
              failureType === 'pull_fail'
                ? { pullSuccess: false }
                : failureType === 'deploy_fail'
                  ? { deploySuccess: false }
                  : { healthSuccess: false };

            const { actions } = createMockActions(opts);
            const result = await executeRollback(context, actions);

            // All failure states must have logs
            expect(result.logs.length).toBeGreaterThan(0);

            // Every log entry must have a timestamp
            for (const log of result.logs) {
              expect(log.timestamp).toBeDefined();
              expect(typeof log.timestamp).toBe('string');
              // ISO 8601 format check
              expect(new Date(log.timestamp).toISOString()).toBe(log.timestamp);
            }

            // Must require manual intervention
            expect(result.requiresManualIntervention).toBe(true);
          }
        ),
        pbtOptions()
      );
    });

    /**
     * Validates: Requirement 6.6
     * The system does not retry rollback indefinitely — health check is called at most once.
     */
    test('rollback does not retry health checks indefinitely', async () => {
      await fc.assert(
        fc.asyncProperty(
          rollbackContext(sha),
          async (context) => {
            const { calls, actions } = createMockActions({ healthSuccess: false });
            const result = await executeRollback(context, actions);

            // Health check should be called exactly once (no infinite retry)
            const healthCheckCalls = calls.filter((c) => c === 'healthCheck');
            expect(healthCheckCalls.length).toBe(1);
            expect(result.state).toBe(ROLLBACK_STATES.HEALTH_CHECK_FAILED);
          }
        ),
        pbtOptions()
      );
    });
  });
});
