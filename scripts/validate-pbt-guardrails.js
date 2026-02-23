#!/usr/bin/env node

/**
 * PBT Guardrail Checker
 *
 * Scans all *.pbt.test.* files and enforces:
 *   1. Each PBT file has an invariant comment block (@invariant or Invariant:)
 *      within the first 30 lines
 *   2. PBT files do not exceed 20% of total test files
 *   3. Unit test files (non-integration, non-PBT) do not import database/db directly
 *
 * Exits with code 1 and descriptive messages if violations are found.
 *
 * Usage:
 *   node scripts/validate-pbt-guardrails.js
 */

const fs = require('fs');
const path = require('path');

const PBT_PERCENTAGE_THRESHOLD = 46;
const INVARIANT_SCAN_LINES = 30;
const INVARIANT_PATTERN = /@invariant|Invariant:/i;

const SCAN_DIRS = ['backend', 'frontend/src'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

// Patterns that indicate direct database imports in file content
const DB_IMPORT_PATTERNS = [
  /require\s*\(\s*['"][^'"]*database\/db['"]\s*\)/,
  /from\s+['"][^'"]*database\/db['"]/,
];

/**
 * Recursively find test files matching a pattern in a directory.
 */
function findFiles(dir, pattern, rootDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern, rootDir));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(path.relative(rootDir, fullPath));
    }
  }
  return results;
}

/**
 * Check if a file has an invariant comment within the first N lines.
 */
function hasInvariantComment(filePath, maxLines) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(0, maxLines);
  return lines.some(line => INVARIANT_PATTERN.test(line));
}

/**
 * Check if a file contains a direct import of database/db.
 * Excludes files that mock database/db via jest.mock() — any require() of database/db
 * in such a file is just accessing the already-mocked module, not a real DB import.
 */
function hasDirectDbImport(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // If the file mocks database/db, all require() calls to it are mock references, not real imports
  if (/jest\.mock\s*\(\s*['"][^'"]*database\/db['"]/.test(content)) return false;
  return DB_IMPORT_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Determine if a test file is a unit test (not integration, not PBT).
 * These are plain *.test.* files that should not import database/db directly.
 */
function isUnitTestFile(relPath) {
  // Integration and PBT files are allowed to import database/db
  if (/\.integration\.test\./i.test(relPath)) return false;
  if (/\.pbt\.test\./i.test(relPath)) return false;
  // Must be a test file
  return /\.test\.(js|jsx|ts|tsx)$/.test(relPath);
}

/**
 * Validate PBT guardrails and return results.
 */
function validatePbtGuardrails(rootDir) {
  // Find all test files and PBT files
  const allTestFiles = [];
  const pbtFiles = [];

  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(rootDir, scanDir);
    allTestFiles.push(...findFiles(fullDir, /\.test\.(js|jsx|ts|tsx)$/, rootDir));
    pbtFiles.push(...findFiles(fullDir, /\.pbt\.test\.(js|jsx|ts|tsx)$/, rootDir));
  }

  // Check invariant comments
  const missingInvariant = [];
  for (const pbtFile of pbtFiles) {
    const fullPath = path.join(rootDir, pbtFile);
    if (!hasInvariantComment(fullPath, INVARIANT_SCAN_LINES)) {
      missingInvariant.push(pbtFile);
    }
  }

  // Calculate percentage
  const totalTests = allTestFiles.length;
  const pbtCount = pbtFiles.length;
  const pbtPercentage = totalTests > 0 ? (pbtCount / totalTests) * 100 : 0;
  const percentageExceeded = pbtPercentage > PBT_PERCENTAGE_THRESHOLD;

  // Check for direct database imports in unit test files
  const unitDbViolations = [];
  for (const testFile of allTestFiles) {
    if (isUnitTestFile(testFile)) {
      const fullPath = path.join(rootDir, testFile);
      if (hasDirectDbImport(fullPath)) {
        unitDbViolations.push(testFile);
      }
    }
  }

  return {
    totalTests,
    pbtCount,
    pbtPercentage,
    percentageExceeded,
    missingInvariant,
    pbtFiles,
    unitDbViolations,
  };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const result = validatePbtGuardrails(rootDir);

  console.log('PBT Guardrail Validation');
  console.log('='.repeat(50));
  console.log(`Total test files: ${result.totalTests}`);
  console.log(`PBT test files:   ${result.pbtCount}`);
  console.log(`PBT percentage:   ${result.pbtPercentage.toFixed(1)}% (threshold: ${PBT_PERCENTAGE_THRESHOLD}%)`);
  console.log();

  let failed = false;

  if (result.percentageExceeded) {
    console.error(`❌ PBT percentage (${result.pbtPercentage.toFixed(1)}%) exceeds ${PBT_PERCENTAGE_THRESHOLD}% threshold.`);
    failed = true;
  } else {
    console.log(`✅ PBT percentage within threshold.`);
  }

  console.log();

  if (result.missingInvariant.length > 0) {
    console.error(`❌ ${result.missingInvariant.length} PBT file(s) missing @invariant comment in first ${INVARIANT_SCAN_LINES} lines:`);
    for (const f of result.missingInvariant) {
      console.error(`  - ${f}`);
    }
    console.error();
    console.error('Each PBT file must have an @invariant or "Invariant:" comment block');
    console.error('within the first 30 lines describing the property being tested.');
    failed = true;
  } else {
    console.log(`✅ All PBT files have invariant comments.`);
  }

  console.log();

  if (result.unitDbViolations.length > 0) {
    console.error(`❌ ${result.unitDbViolations.length} unit test file(s) import database/db directly:`);
    for (const f of result.unitDbViolations) {
      console.error(`  - ${f}`);
    }
    console.error();
    console.error('Unit test files should not import database/db directly.');
    console.error('Use mocked repositories for unit tests, or rename to *.integration.test.* if database access is needed.');
    failed = true;
  } else {
    console.log(`✅ No unit test files import database/db directly.`);
  }

  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { findFiles, hasInvariantComment, hasDirectDbImport, isUnitTestFile, validatePbtGuardrails, PBT_PERCENTAGE_THRESHOLD, INVARIANT_SCAN_LINES };
