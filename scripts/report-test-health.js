#!/usr/bin/env node

/**
 * Test Health Reporter
 *
 * Counts test files by category (unit, integration, PBT, transition)
 * and outputs a summary to stdout. When run in GitHub Actions, the output
 * is formatted for $GITHUB_STEP_SUMMARY (Markdown table).
 *
 * Usage:
 *   node scripts/report-test-health.js
 *   node scripts/report-test-health.js >> $GITHUB_STEP_SUMMARY
 */

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['backend', 'frontend/src'];
const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage'];

const CATEGORIES = [
  { regex: /\.pbt\.test\.(js|jsx|ts|tsx)$/, label: 'PBT' },
  { regex: /\.integration\.test\.(js|jsx|ts|tsx)$/, label: 'Integration' },
  { regex: /\.unit\.test\.(js|jsx|ts|tsx)$/, label: 'Unit' },
  { regex: /\.test\.(js|jsx|ts|tsx)$/, label: 'Unit (transition)' },
];

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
 * Classify a test file into a category.
 */
function classifyFile(filePath) {
  const basename = path.basename(filePath);
  for (const cat of CATEGORIES) {
    if (cat.regex.test(basename)) {
      return cat.label;
    }
  }
  return 'Unknown';
}

/**
 * Determine if a file is backend or frontend.
 */
function getArea(filePath) {
  if (filePath.startsWith('backend')) return 'Backend';
  if (filePath.startsWith('frontend')) return 'Frontend';
  return 'Other';
}

/**
 * Generate the test health report data.
 */
function generateReport(rootDir) {
  const allFiles = [];
  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(rootDir, scanDir);
    allFiles.push(...findTestFiles(fullDir, rootDir));
  }

  const counts = {};
  const areaCounts = { Backend: {}, Frontend: {} };

  for (const file of allFiles) {
    const category = classifyFile(file);
    const area = getArea(file);

    counts[category] = (counts[category] || 0) + 1;
    if (areaCounts[area]) {
      areaCounts[area][category] = (areaCounts[area][category] || 0) + 1;
    }
  }

  return { total: allFiles.length, counts, areaCounts };
}

/**
 * Format the report as a Markdown table (for GitHub Actions summary).
 */
function formatMarkdown(report) {
  const lines = [];
  lines.push('## 🧪 Test Health Report');
  lines.push('');
  lines.push(`**Total test files:** ${report.total}`);
  lines.push('');
  lines.push('| Category | Backend | Frontend | Total |');
  lines.push('|----------|---------|----------|-------|');

  const allCategories = ['Unit', 'Unit (transition)', 'Integration', 'PBT'];
  for (const cat of allCategories) {
    const be = report.areaCounts.Backend[cat] || 0;
    const fe = report.areaCounts.Frontend[cat] || 0;
    const total = report.counts[cat] || 0;
    lines.push(`| ${cat} | ${be} | ${fe} | ${total} |`);
  }

  const pbtCount = report.counts['PBT'] || 0;
  const pbtPct = report.total > 0 ? ((pbtCount / report.total) * 100).toFixed(1) : '0.0';
  lines.push('');
  lines.push(`**PBT percentage:** ${pbtPct}%`);

  return lines.join('\n');
}

/**
 * Format the report as plain text for console output.
 */
function formatPlainText(report) {
  const lines = [];
  lines.push('Test Health Report');
  lines.push('='.repeat(50));
  lines.push(`Total test files: ${report.total}`);
  lines.push('');

  const allCategories = ['Unit', 'Unit (transition)', 'Integration', 'PBT'];
  const maxLabel = Math.max(...allCategories.map(c => c.length));

  for (const cat of allCategories) {
    const be = report.areaCounts.Backend[cat] || 0;
    const fe = report.areaCounts.Frontend[cat] || 0;
    const total = report.counts[cat] || 0;
    lines.push(`  ${cat.padEnd(maxLabel + 2)} Backend: ${String(be).padStart(3)}  Frontend: ${String(fe).padStart(3)}  Total: ${String(total).padStart(3)}`);
  }

  const pbtCount = report.counts['PBT'] || 0;
  const pbtPct = report.total > 0 ? ((pbtCount / report.total) * 100).toFixed(1) : '0.0';
  lines.push('');
  lines.push(`PBT percentage: ${pbtPct}%`);

  return lines.join('\n');
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const report = generateReport(rootDir);

  const isGitHubActions = !!process.env.GITHUB_ACTIONS;

  if (isGitHubActions) {
    console.log(formatMarkdown(report));
  } else {
    console.log(formatPlainText(report));
  }
}

if (require.main === module) {
  main();
}

module.exports = { findTestFiles, classifyFile, generateReport, formatMarkdown, formatPlainText };
