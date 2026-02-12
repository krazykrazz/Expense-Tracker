/**
 * Rollback Utility
 *
 * Encapsulates the rollback workflow logic in a testable JS module.
 * The bash script (scripts/rollback.sh) implements the same logic for CI runners.
 *
 * This module is the source of truth for rollback decision-making and state transitions.
 */

/**
 * Possible rollback states
 */
const ROLLBACK_STATES = {
  NOT_NEEDED: 'not_needed',
  INITIATED: 'initiated',
  DEPLOYED: 'deployed',
  HEALTH_CHECK_PASSED: 'health_check_passed',
  HEALTH_CHECK_FAILED: 'health_check_failed',
  NO_PREVIOUS: 'no_previous',
  PULL_FAILED: 'pull_failed',
  HALTED: 'halted',
};

/**
 * Execute the full rollback workflow.
 *
 * @param {Object} context - Rollback context
 * @param {string} context.previousSha - Previous deployment SHA (or "none")
 * @param {string} context.failedSha - The SHA that failed health checks
 * @param {string} context.registry - Container registry URL
 * @param {string} context.imageName - Image name
 * @param {Object} actions - Injectable actions for testability
 * @param {Function} actions.stopContainer - Async fn to stop current container
 * @param {Function} actions.pullImage - Async fn(imageRef) to pull an image, returns { success }
 * @param {Function} actions.deployImage - Async fn(imageRef) to deploy an image, returns { success }
 * @param {Function} actions.healthCheck - Async fn() to run health checks, returns { success, results }
 * @returns {Promise<Object>} Rollback result with { state, logs, requiresManualIntervention }
 */
async function executeRollback(context, actions) {
  const logs = [];
  const log = (message) => {
    logs.push({ timestamp: new Date().toISOString(), message });
  };

  // Validate previous SHA exists
  if (!context.previousSha || context.previousSha === 'none') {
    log(`No previous deployment SHA available for rollback`);
    return {
      state: ROLLBACK_STATES.NO_PREVIOUS,
      logs,
      requiresManualIntervention: true,
    };
  }

  log(`Rollback initiated: ${context.failedSha} -> ${context.previousSha}`);

  // Stop current container
  log('Stopping current container');
  await actions.stopContainer();

  // Pull previous image
  const rollbackImage = `${context.registry}/${context.imageName}:${context.previousSha}`;
  log(`Pulling previous image: ${rollbackImage}`);
  const pullResult = await actions.pullImage(rollbackImage);

  if (!pullResult.success) {
    log(`Failed to pull rollback image: ${rollbackImage}`);
    return {
      state: ROLLBACK_STATES.PULL_FAILED,
      logs,
      requiresManualIntervention: true,
    };
  }

  // Deploy previous image
  log('Deploying previous image');
  const deployResult = await actions.deployImage(rollbackImage);

  if (!deployResult.success) {
    log('Failed to deploy rollback image');
    return {
      state: ROLLBACK_STATES.HALTED,
      logs,
      requiresManualIntervention: true,
    };
  }

  log('Rollback deployed, running health checks');

  // Run health checks on rolled-back deployment
  const healthResult = await actions.healthCheck();

  if (healthResult.success) {
    log('Rollback health checks passed');
    return {
      state: ROLLBACK_STATES.HEALTH_CHECK_PASSED,
      logs,
      requiresManualIntervention: false,
    };
  }

  // Rollback health checks failed - halt
  log('Rollback health checks failed - manual intervention required');
  return {
    state: ROLLBACK_STATES.HEALTH_CHECK_FAILED,
    logs,
    requiresManualIntervention: true,
  };
}

/**
 * Determine if a rollback should be triggered based on health check results.
 *
 * @param {Object} healthCheckResult - Result from executeMultiEndpointHealthCheck
 * @returns {boolean} True if rollback should be triggered
 */
function shouldTriggerRollback(healthCheckResult) {
  return !healthCheckResult.success;
}

/**
 * Determine if the system should halt after a rollback result.
 * The system halts when rollback fails or no previous deployment exists.
 *
 * @param {Object} rollbackResult - Result from executeRollback
 * @returns {boolean} True if automated actions should stop
 */
function shouldHalt(rollbackResult) {
  return rollbackResult.requiresManualIntervention;
}

module.exports = {
  ROLLBACK_STATES,
  executeRollback,
  shouldTriggerRollback,
  shouldHalt,
};
