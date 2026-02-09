#!/usr/bin/env node

/**
 * Test Performance Measurement Script
 * 
 * Measures frontend test suite execution time and identifies slow tests.
 * Validates against performance thresholds defined in the frontend-test-refactoring spec.
 * 
 * Thresholds:
 * - Full test suite: < 5 minutes (300,000ms)
 * - Individual test file: < 10 seconds (10,000ms)
 * - Individual unit test: < 1 second (1,000ms)
 * 
 * Usage:
 *   node scripts/measure-test-performance.js
 *   npm run test:perf (from frontend directory)
 */

const { execSync } = require('child_process');
const path = require('path');

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  FULL_SUITE: 300000,  // 5 minutes
  TEST_FILE: 10000,    // 10 seconds
  UNIT_TEST: 1000      // 1 second
};

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

function printHeader(title) {
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

function printResult(label, value, threshold, isTime = true) {
  const displayValue = isTime ? formatDuration(value) : value;
  const thresholdDisplay = isTime ? formatDuration(threshold) : threshold;
  
  let status, color;
  if (threshold && value > threshold) {
    status = '❌ EXCEEDED';
    color = colors.red;
  } else {
    status = '✅ PASSED';
    color = colors.green;
  }
  
  console.log(`${label}: ${color}${displayValue}${colors.reset} ${threshold ? `(threshold: ${thresholdDisplay})` : ''} ${status}`);
}

function measureFullSuite() {
  printHeader('Full Test Suite Performance');
  
  console.log('Running full frontend test suite...\n');
  
  const start = Date.now();
  
  try {
    // Run tests with --run flag (no watch mode) and capture output
    execSync('npm test -- --run --reporter=verbose', {
      cwd: path.join(__dirname, '..', 'frontend'),
      stdio: 'inherit'
    });
    
    const duration = Date.now() - start;
    
    console.log('\n');
    printResult('Full Suite Duration', duration, THRESHOLDS.FULL_SUITE);
    
    return { success: duration <= THRESHOLDS.FULL_SUITE, duration };
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`\n${colors.red}Test suite failed or was interrupted${colors.reset}`);
    printResult('Duration before failure', duration, null);
    return { success: false, duration, error: true };
  }
}

function measureTestFiles() {
  printHeader('Individual Test File Performance');
  
  // Key test files to measure
  const testFiles = [
    'ExpenseForm.core.test.jsx',
    'ExpenseForm.sections.test.jsx',
    'ExpenseForm.pbt.test.jsx',
    'ExpenseForm.dataPreservation.test.jsx',
    'ExpenseList.test.jsx',
    'FilterContext.test.jsx'
  ];
  
  const results = [];
  
  for (const file of testFiles) {
    console.log(`\nMeasuring ${file}...`);
    
    const start = Date.now();
    
    try {
      execSync(`npx vitest --run ${file}`, {
        cwd: path.join(__dirname, '..', 'frontend'),
        stdio: 'pipe' // Suppress output for cleaner display
      });
      
      const duration = Date.now() - start;
      results.push({ file, duration, success: true });
      
      const exceeded = duration > THRESHOLDS.TEST_FILE;
      const color = exceeded ? colors.red : colors.green;
      const status = exceeded ? '❌ SLOW' : '✅ FAST';
      
      console.log(`  ${color}${formatDuration(duration)}${colors.reset} ${status}`);
    } catch (error) {
      const duration = Date.now() - start;
      results.push({ file, duration, success: false });
      console.log(`  ${colors.yellow}${formatDuration(duration)}${colors.reset} ⚠️  FAILED`);
    }
  }
  
  // Summary
  console.log(`\n${colors.bold}Test File Summary:${colors.reset}`);
  const slowFiles = results.filter(r => r.duration > THRESHOLDS.TEST_FILE);
  
  if (slowFiles.length > 0) {
    console.log(`\n${colors.yellow}Slow test files (> ${formatDuration(THRESHOLDS.TEST_FILE)}):${colors.reset}`);
    slowFiles.forEach(({ file, duration }) => {
      console.log(`  - ${file}: ${colors.yellow}${formatDuration(duration)}${colors.reset}`);
    });
  } else {
    console.log(`\n${colors.green}All test files completed within threshold!${colors.reset}`);
  }
  
  return { results, slowFiles };
}

function generateReport(fullSuiteResult, fileResults) {
  printHeader('Performance Report Summary');
  
  console.log(`${colors.bold}Full Suite:${colors.reset}`);
  printResult('  Duration', fullSuiteResult.duration, THRESHOLDS.FULL_SUITE);
  
  console.log(`\n${colors.bold}Test Files:${colors.reset}`);
  console.log(`  Total files measured: ${fileResults.results.length}`);
  console.log(`  Slow files (> ${formatDuration(THRESHOLDS.TEST_FILE)}): ${fileResults.slowFiles.length}`);
  
  if (fileResults.slowFiles.length > 0) {
    console.log(`\n${colors.yellow}Recommendations:${colors.reset}`);
    console.log('  - Consider refactoring slow test files');
    console.log('  - Review PBT iteration counts (reduce if > 100)');
    console.log('  - Check for unnecessary async waits or timeouts');
    console.log('  - Consider splitting large test files');
  }
  
  // Overall status
  const allPassed = fullSuiteResult.success && fileResults.slowFiles.length === 0;
  
  console.log(`\n${colors.bold}Overall Status:${colors.reset}`);
  if (allPassed) {
    console.log(`${colors.green}✅ All performance thresholds met!${colors.reset}`);
    return 0;
  } else {
    console.log(`${colors.red}❌ Some performance thresholds exceeded${colors.reset}`);
    return 1;
  }
}

// Main execution
async function main() {
  console.log(`${colors.bold}Frontend Test Performance Measurement${colors.reset}`);
  console.log(`Started at: ${new Date().toLocaleString()}\n`);
  
  // Measure full suite
  const fullSuiteResult = measureFullSuite();
  
  // If full suite failed with error, skip file measurements
  if (fullSuiteResult.error) {
    console.log(`\n${colors.yellow}Skipping individual file measurements due to test failures${colors.reset}`);
    process.exit(1);
  }
  
  // Measure individual files
  const fileResults = measureTestFiles();
  
  // Generate report
  const exitCode = generateReport(fullSuiteResult, fileResults);
  
  console.log(`\nCompleted at: ${new Date().toLocaleString()}`);
  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  });
}

module.exports = { measureFullSuite, measureTestFiles, THRESHOLDS };
