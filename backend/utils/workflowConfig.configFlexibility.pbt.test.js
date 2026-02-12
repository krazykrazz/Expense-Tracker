/**
 * Property-Based Tests: Configuration Flexibility
 *
 * **Property 8: Configuration Flexibility**
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 *
 * For any workflow execution, configurable parameters (health check timeout,
 * retry count) should be respected, and the system should use sensible
 * defaults when parameters are not provided.
 */

const fc = require('fast-check');
const {
  DEFAULTS,
  resolveNumeric,
  resolveBoolean,
  resolveWorkflowConfig,
} = require('./workflowConfig');

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const CI_SEED = 88888;

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

describe('Property 8: Configuration Flexibility', () => {
  /**
   * Validates: Requirement 10.4
   * Sensible defaults are used when no inputs are provided.
   */
  test('defaults are applied when inputs are empty or missing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, null, {}, { health_check_timeout: '', health_check_retries: '', enable_security_scan: '' }),
        (inputs) => {
          const config = resolveWorkflowConfig(inputs || undefined);
          expect(config.health_check_timeout).toBe(DEFAULTS.health_check_timeout);
          expect(config.health_check_retries).toBe(DEFAULTS.health_check_retries);
          expect(config.enable_security_scan).toBe(DEFAULTS.enable_security_scan);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 10.1, 10.2
   * Valid numeric inputs are respected for timeout and retries.
   */
  test('valid numeric inputs are respected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 100 }),
        (timeout, retries) => {
          const config = resolveWorkflowConfig({
            health_check_timeout: timeout,
            health_check_retries: retries,
          });
          expect(config.health_check_timeout).toBe(timeout);
          expect(config.health_check_retries).toBe(retries);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 10.1, 10.2
   * String numeric inputs (as GitHub Actions passes them) are parsed correctly.
   */
  test('string numeric inputs are parsed correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1, max: 100 }),
        (timeout, retries) => {
          const config = resolveWorkflowConfig({
            health_check_timeout: String(timeout),
            health_check_retries: String(retries),
          });
          expect(config.health_check_timeout).toBe(timeout);
          expect(config.health_check_retries).toBe(retries);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 10.3
   * Boolean enable_security_scan input is respected.
   */
  test('enable_security_scan boolean is respected', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (enabled) => {
          const config = resolveWorkflowConfig({ enable_security_scan: enabled });
          expect(config.enable_security_scan).toBe(enabled);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 10.3
   * String boolean inputs ("true"/"false") are parsed correctly.
   */
  test('string boolean inputs are parsed correctly', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (enabled) => {
          const config = resolveWorkflowConfig({
            enable_security_scan: String(enabled),
          });
          expect(config.enable_security_scan).toBe(enabled);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirement 10.4
   * Invalid inputs fall back to defaults rather than crashing.
   */
  test('invalid inputs fall back to defaults', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('abc', '-5', '0', 'NaN', 'null', '[]'),
        fc.constantFrom('abc', '-5', '0', 'NaN', 'null', '[]'),
        (badTimeout, badRetries) => {
          const config = resolveWorkflowConfig({
            health_check_timeout: badTimeout,
            health_check_retries: badRetries,
          });
          expect(config.health_check_timeout).toBe(DEFAULTS.health_check_timeout);
          expect(config.health_check_retries).toBe(DEFAULTS.health_check_retries);
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Validates: Requirements 10.1, 10.2, 10.4
   * Resolved config always produces valid positive integers for numeric fields.
   */
  test('resolved config always has valid positive integers for numeric fields', () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.anything(),
        (timeout, retries) => {
          const config = resolveWorkflowConfig({
            health_check_timeout: timeout,
            health_check_retries: retries,
          });
          expect(Number.isInteger(config.health_check_timeout)).toBe(true);
          expect(config.health_check_timeout).toBeGreaterThanOrEqual(1);
          expect(Number.isInteger(config.health_check_retries)).toBe(true);
          expect(config.health_check_retries).toBeGreaterThanOrEqual(1);
        }
      ),
      pbtOptions()
    );
  });
});
