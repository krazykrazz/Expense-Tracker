#!/usr/bin/env node

/**
 * Raw fetch() Usage Validator
 *
 * Scans frontend/src/ source files (excluding test files, authApi.js, and
 * fetchProvider.js) for bare `fetch(` calls that bypass the auth-aware
 * fetchProvider. All fetch calls should go through:
 *   - apiClient.js (uses getFetchFn from fetchProvider)
 *   - authAwareFetch (from fetchProvider)
 *   - fetchWithRetry (uses getFetchFn from fetchProvider)
 *
 * Exits with code 1 if violations are found.
 *
 * Usage:
 *   node scripts/validate-no-raw-fetch.js
 */

const fs = require('fs');
const path = require('path');

const SCAN_DIR = 'frontend/src';
const IGNORE_DIRS = ['node_modules', 'dist', 'build', 'coverage'];

// Files that are allowed to use raw fetch()
const ALLOWED_FILES = [
  'services/authApi.js',      // Auth endpoints bypass middleware
  'utils/fetchProvider.js',   // The provider itself captures native fetch
];

// Patterns that indicate a raw fetch() call (not a variable/function named *fetch*)
const RAW_FETCH_PATTERN = /(?<!\w)fetch\s*\(/;

// Lines that are comments or part of mock/test setup (false positives)
const FALSE_POSITIVE_PATTERNS = [
  /^\s*\/\//,           // Single-line comment
  /^\s*\*/,             // Block comment continuation
  /^\s*\/\*/,           // Block comment start
  /vi\.mock/,           // Vitest mock
  /jest\.mock/,         // Jest mock
  /\.mockImplementation/,
  /\.mockResolvedValue/,
  /\.mockRejectedValue/,
];

/**
 * Check if a file path is a test file.
 */
function isTestFile(filePath) {
  return /\.(test|spec)\.(js|jsx|ts|tsx)$/.test(filePath);
}

/**
 * Check if a file is in the allowed list.
 */
function isAllowedFile(relPath) {
  return ALLOWED_FILES.some(allowed => relPath.endsWith(allowed));
}

/**
 * Recursively find all JS/JSX source files in a directory.
 */
function findSourceFiles(dir, rootDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath, rootDir));
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      results.push(path.relative(rootDir, fullPath));
    }
  }
  return results;
}

/**
 * Check if a line is a false positive (comment, mock setup, etc.)
 */
function isFalsePositive(line) {
  return FALSE_POSITIVE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Scan a file for raw fetch() calls.
 * Returns array of { line: number, text: string } for each violation.
 */
function scanFileForRawFetch(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (RAW_FETCH_PATTERN.test(line) && !isFalsePositive(line)) {
      violations.push({ line: i + 1, text: line.trim() });
    }
  }

  return violations;
}

/**
 * Validate all frontend source files for raw fetch() usage.
 */
function validateNoRawFetch(rootDir) {
  const scanDir = path.join(rootDir, SCAN_DIR);
  const allFiles = findSourceFiles(scanDir, rootDir);

  const sourceFiles = allFiles.filter(f => {
    const relToSrc = path.relative(SCAN_DIR, f).replace(/\\/g, '/');
    return !isTestFile(f) && !isAllowedFile(relToSrc);
  });

  const violations = [];

  for (const file of sourceFiles) {
    const fullPath = path.join(rootDir, file);
    const fileViolations = scanFileForRawFetch(fullPath);
    if (fileViolations.length > 0) {
      violations.push({ file, lines: fileViolations });
    }
  }

  return { scannedFiles: sourceFiles.length, violations };
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const { scannedFiles, violations } = validateNoRawFetch(rootDir);

  console.log('Raw fetch() Usage Validation');
  console.log('='.repeat(50));
  console.log(`Source files scanned: ${scannedFiles}`);
  console.log(`Excluded: authApi.js, fetchProvider.js, test files`);
  console.log();

  if (violations.length > 0) {
    const totalLines = violations.reduce((sum, v) => sum + v.lines.length, 0);
    console.error(`❌ Found ${totalLines} raw fetch() call(s) in ${violations.length} file(s):`);
    console.error();
    for (const v of violations) {
      console.error(`  ${v.file}:`);
      for (const line of v.lines) {
        console.error(`    Line ${line.line}: ${line.text}`);
      }
    }
    console.error();
    console.error('All fetch calls should use authAwareFetch, getFetchFn(), or apiClient methods.');
    console.error('See frontend/src/utils/fetchProvider.js for details.');
    process.exit(1);
  }

  console.log('✅ No raw fetch() calls found in frontend source files.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { findSourceFiles, scanFileForRawFetch, validateNoRawFetch, isTestFile, isAllowedFile };
