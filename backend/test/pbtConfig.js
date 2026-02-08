/**
 * Property-Based Testing Configuration
 * 
 * Adjusts test iteration counts based on environment:
 * - CI: 25 runs (fast feedback, catches most issues)
 * - Local: 100 runs (thorough coverage)
 * - Nightly: 500 runs (exhaustive testing)
 */

const CI_RUNS = 25;
const LOCAL_RUNS = 100;
const NIGHTLY_RUNS = 500;

const getNumRuns = () => {
  if (process.env.PBT_LEVEL === 'nightly') return NIGHTLY_RUNS;
  if (process.env.CI) return CI_RUNS;
  return LOCAL_RUNS;
};

module.exports = {
  numRuns: getNumRuns(),
  CI_RUNS,
  LOCAL_RUNS,
  NIGHTLY_RUNS
};
