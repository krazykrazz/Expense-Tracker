#!/usr/bin/env node

/**
 * Test Naming Convention Validator
 *
 * Scans all test files in backend/ and frontend/ and verifies each matches
 * one of the allowed naming patterns:
 *   - *.unit.test.*       (unit tests)
 *   - *.integration.test.* (integration tests)
 *   - *.pbt.test.*        (property-based tests)
 *   - *.test.*            (allowed during transition period for existing tests)
 *
 * Exits with code 1 and descriptive messages if violations are found.
 *
 * Usage:
 *   node scripts/validate-test-naming.js
 */

const fs = require('fs');
const path = require('path');

// Allowed test file patterns (order matters for classification)
const ALLOWED_PATTERNS = [
  { regex: /\.unit\.test\.(js|jsx|ts|tsx)$/, label: 'unit' },
  { regex: /\.integration\.test\.(js|jsx|ts|tsx)$/, label: 'integration' },
  { regex: /\.pbt\.test\.(js|jsx|ts|tsx)$/, label: 'pbt' },
  { regex: /\.test\.(js|jsx|ts|tsx)$/, label: 'transition' },
];

const SCAN_DIRS = ['backend', 'frontend/src'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

/**
 * Recursively find all test files in a directory.
 */
function findTestFiles(dir, rootDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath, rootDir));
    } else if (entry.isFile() && /\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      results.push(path.relative(rootDir, fullPath));
    }
  }
  return results;
}

/**
 * Classify a test file by its naming pattern.
 * Returns the label if it matches an allowed pattern, or null if it's a violation.
 */
function classifyTestFile(filePath) {
  const basename = path.basename(filePath);
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.regex.test(basename)) {
      return pattern.label;
    }
  }
  return null;
}

/**
 * Validate all test files and return results.
 */
function validateTestNaming(rootDir) {
  const allFiles = [];
  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(rootDir, scanDir);
    allFiles.push(...findTestFiles(fullDir, rootDir));
  }

  const classified = { unit: [], integration: [], pbt: [], transition: [] };
  const violations = [];

  for (const file of allFiles) {
    const label = classifyTestFile(file);
    if (label) {
      classified[label].push(file);
    } else {
      violations.push(file);
    }
  }

  return { allFiles, classified, violations };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const { allFiles, classified, violations } = validateTestNaming(rootDir);

  console.log('Test Naming Convention Validation');
  console.log('='.repeat(50));
  console.log(`Total test files scanned: ${allFiles.length}`);
  console.log(`  Unit tests (*.unit.test.*):          ${classified.unit.length}`);
  console.log(`  Integration tests (*.integration.test.*): ${classified.integration.length}`);
  console.log(`  PBT tests (*.pbt.test.*):            ${classified.pbt.length}`);
  console.log(`  Transition (*.test.*):               ${classified.transition.length}`);
  console.log();

  if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} file(s) with invalid naming:`);
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    console.error();
    console.error('Allowed patterns: *.unit.test.*, *.integration.test.*, *.pbt.test.*, *.test.* (transition)');
    process.exit(1);
  }

  console.log('✅ All test files follow the naming convention.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { findTestFiles, classifyTestFile, validateTestNaming };
