#!/usr/bin/env node

/**
 * CI Test Runtime Budget Checker
 *
 * Compares actual test runtime against thresholds defined in test-budget.json.
 * Exits with code 1 if the runtime exceeds the budget (unless overridden).
 *
 * Usage:
 *   node scripts/check-test-budget.js <job-name> <elapsed-seconds>
 *
 * Environment:
 *   COMMIT_MESSAGE - If contains [skip-budget], the check is skipped
 *
 * Examples:
 *   node scripts/check-test-budget.js backend-unit-tests 142
 *   node scripts/check-test-budget.js backend-pbt-shard 480
 */

const fs = require('fs');
const path = require('path');

function loadBudget(rootDir) {
  const budgetPath = path.join(rootDir, 'test-budget.json');
  if (!fs.existsSync(budgetPath)) {
    console.warn('⚠️  test-budget.json not found, skipping budget check.');
    return null;
  }
  return JSON.parse(fs.readFileSync(budgetPath, 'utf-8'));
}

function checkBudget(jobName, elapsedSeconds, commitMessage) {
  const rootDir = path.resolve(__dirname, '..');
  const config = loadBudget(rootDir);
  if (!config) return { passed: true, skipped: true };

  // Check for override
  const overridePattern = new RegExp(config.overridePattern || '\\[skip-budget\\]');
  if (commitMessage && overridePattern.test(commitMessage)) {
    return { passed: true, skipped: true, reason: 'Override via commit message' };
  }

  const budget = config.budgets[jobName];
  if (!budget) {
    return { passed: true, skipped: true, reason: `No budget defined for "${jobName}"` };
  }

  const maxSeconds = budget.maxSeconds;
  const exceeded = elapsedSeconds > maxSeconds;

  return {
    passed: !exceeded,
    skipped: false,
    jobName,
    elapsedSeconds,
    maxSeconds,
    description: budget.description,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: check-test-budget.js <job-name> <elapsed-seconds>');
    process.exit(1);
  }

  const jobName = args[0];
  const elapsedSeconds = parseInt(args[1], 10);

  if (isNaN(elapsedSeconds)) {
    console.error(`Invalid elapsed seconds: "${args[1]}"`);
    process.exit(1);
  }

  const commitMessage = process.env.COMMIT_MESSAGE || '';
  const result = checkBudget(jobName, elapsedSeconds, commitMessage);

  console.log('CI Runtime Budget Check');
  console.log('='.repeat(40));

  if (result.skipped) {
    console.log(`⏭️  Skipped: ${result.reason || 'no config'}`);
    process.exit(0);
  }

  console.log(`Job:      ${result.jobName}`);
  console.log(`Budget:   ${result.description}`);
  console.log(`Elapsed:  ${result.elapsedSeconds}s`);
  console.log(`Max:      ${result.maxSeconds}s`);
  console.log();

  if (result.passed) {
    console.log(`✅ Within budget (${result.elapsedSeconds}s / ${result.maxSeconds}s)`);
    process.exit(0);
  } else {
    console.error(`❌ Budget exceeded! ${result.elapsedSeconds}s > ${result.maxSeconds}s`);
    console.error('Add [skip-budget] to commit message to override.');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkBudget, loadBudget };
