/**
 * @invariant Budget checker rejects over-budget runs
 * Feature: ci-pipeline-hardening, Property 1: Budget checker rejects over-budget runs
 *
 * For any job name with a defined budget and any elapsed time > maxSeconds,
 * checkBudget must return { passed: false } with correct values.
 * For elapsed ≤ maxSeconds, must return { passed: true }.
 *
 * **Validates: Requirement 3.7**
 */

const fc = require('fast-check');
const path = require('path');
const { checkBudget, loadBudget } = require('../check-test-budget');

// Load the actual budget config to drive the property test
const rootDir = path.resolve(__dirname, '../..');
const budgetConfig = loadBudget(rootDir);
const definedJobs = Object.keys(budgetConfig.budgets);

describe('Property 1: Budget checker rejects over-budget runs', () => {
  // Arbitrary: pick a defined job name
  const jobNameArb = fc.constantFrom(...definedJobs);

  it('returns passed=false when elapsed > maxSeconds', () => {
    fc.assert(
      fc.property(
        jobNameArb,
        fc.integer({ min: 1, max: 100000 }),
        (jobName, extraSeconds) => {
          const maxSeconds = budgetConfig.budgets[jobName].maxSeconds;
          const elapsed = maxSeconds + extraSeconds; // always > maxSeconds
          const result = checkBudget(jobName, elapsed, '');

          expect(result.passed).toBe(false);
          expect(result.skipped).toBe(false);
          expect(result.elapsedSeconds).toBe(elapsed);
          expect(result.maxSeconds).toBe(maxSeconds);
          expect(result.jobName).toBe(jobName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns passed=true when elapsed ≤ maxSeconds', () => {
    fc.assert(
      fc.property(
        jobNameArb,
        fc.integer({ min: 0, max: 100000 }),
        (jobName, elapsed) => {
          const maxSeconds = budgetConfig.budgets[jobName].maxSeconds;
          // Constrain elapsed to be ≤ maxSeconds
          const clampedElapsed = elapsed % (maxSeconds + 1);
          const result = checkBudget(jobName, clampedElapsed, '');

          expect(result.passed).toBe(true);
          expect(result.skipped).toBe(false);
          expect(result.elapsedSeconds).toBe(clampedElapsed);
          expect(result.maxSeconds).toBe(maxSeconds);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns passed=true with skipped=true for undefined job names', () => {
    // Avoid Object prototype property names like "constructor", "toString", etc.
    const prototypeKeys = Object.getOwnPropertyNames(Object.prototype);
    const excludedNames = [...definedJobs, ...prototypeKeys];
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !excludedNames.includes(s)),
        fc.integer({ min: 0, max: 100000 }),
        (jobName, elapsed) => {
          const result = checkBudget(jobName, elapsed, '');

          expect(result.passed).toBe(true);
          expect(result.skipped).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
