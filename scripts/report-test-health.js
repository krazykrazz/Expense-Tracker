#!/usr/bin/env node

/**
 * Test Health Reporter
 *
 * Reports the static test inventory and, when JSON result files are supplied,
 * the actual execution outcome: files, tests, retries, skips, unhandled errors,
 * duration, and the slowest files.
 *
 * Usage:
 *   node scripts/report-test-health.js
 *   node scripts/report-test-health.js --results test-results/*.json
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

function classifyFile(filePath) {
  const basename = path.basename(filePath);
  for (const cat of CATEGORIES) {
    if (cat.regex.test(basename)) return cat.label;
  }
  return 'Unknown';
}

function getArea(filePath) {
  if (filePath.startsWith('backend')) return 'Backend';
  if (filePath.startsWith('frontend')) return 'Frontend';
  return 'Other';
}

function normalizeStatus(status) {
  if (status === 'passed' || status === 'success') return 'passed';
  if (status === 'failed' || status === 'failure') return 'failed';
  if (['pending', 'skipped', 'todo', 'disabled'].includes(status)) return 'skipped';
  return 'unknown';
}

function resultDurationMs(result, assertions) {
  const start = Number(result.startTime);
  const end = Number(result.endTime);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return end - start;
  }

  if (result.perfStats) {
    const perfStart = Number(result.perfStats.start);
    const perfEnd = Number(result.perfStats.end);
    if (Number.isFinite(perfStart) && Number.isFinite(perfEnd) && perfEnd >= perfStart) {
      return perfEnd - perfStart;
    }
  }

  return assertions.reduce((sum, assertion) => {
    const duration = Number(assertion.duration);
    return sum + (Number.isFinite(duration) ? duration : 0);
  }, 0);
}

function parseTestResult(raw, rootDir) {
  const files = Array.isArray(raw.testResults) ? raw.testResults : [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let retries = 0;
  const slowFiles = [];

  for (const file of files) {
    const assertions = Array.isArray(file.assertionResults) ? file.assertionResults : [];
    let fileFailed = false;
    for (const assertion of assertions) {
      const status = normalizeStatus(assertion.status);
      if (status === 'passed') passed += 1;
      else if (status === 'failed') {
        failed += 1;
        fileFailed = true;
      } else if (status === 'skipped') skipped += 1;

      const retryReasons = Array.isArray(assertion.retryReasons)
        ? assertion.retryReasons.length
        : 0;
      const extraInvocations = Math.max(0, Number(assertion.invocations || 1) - 1);
      retries += Math.max(retryReasons, extraInvocations);
    }

    const durationMs = resultDurationMs(file, assertions);
    const absoluteName = String(file.name || '');
    const relativeName = rootDir && absoluteName
      ? path.relative(rootDir, absoluteName).replace(/\\/g, '/')
      : absoluteName;
    slowFiles.push({
      file: relativeName,
      durationMs,
      status: fileFailed ? 'failed' : normalizeStatus(file.status)
    });
  }

  const starts = files
    .map(file => Number(file.startTime))
    .filter(Number.isFinite);
  const ends = files
    .map(file => Number(file.endTime))
    .filter(Number.isFinite);
  const durationMs = starts.length && ends.length
    ? Math.max(...ends) - Math.min(...starts)
    : slowFiles.reduce((max, file) => Math.max(max, file.durationMs), 0);
  const unhandledErrors = Number(raw.numUnhandledErrors) ||
    (Array.isArray(raw.unhandledErrors) ? raw.unhandledErrors.length : 0) ||
    (Array.isArray(raw.errors) ? raw.errors.length : 0);

  return {
    files: files.length,
    tests: passed + failed + skipped,
    passed,
    failed,
    skipped,
    retries,
    unhandledErrors,
    durationMs,
    success: failed === 0 && unhandledErrors === 0 && raw.success !== false,
    runner: files.some(file => file.perfStats) ? 'jest' : 'vitest',
    slowFiles: slowFiles.sort((a, b) => b.durationMs - a.durationMs)
  };
}

function parseResultFile(filePath, rootDir) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    name: path.basename(filePath, path.extname(filePath)),
    ...parseTestResult(raw, rootDir)
  };
}

function generateExecutionReport(resultFiles, rootDir) {
  const runs = resultFiles.map(filePath => parseResultFile(filePath, rootDir));
  const totals = runs.reduce((sum, run) => ({
    runs: sum.runs + 1,
    files: sum.files + run.files,
    tests: sum.tests + run.tests,
    passed: sum.passed + run.passed,
    failed: sum.failed + run.failed,
    skipped: sum.skipped + run.skipped,
    retries: sum.retries + run.retries,
    unhandledErrors: sum.unhandledErrors + run.unhandledErrors,
    durationMs: sum.durationMs + run.durationMs
  }), {
    runs: 0,
    files: 0,
    tests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    retries: 0,
    unhandledErrors: 0,
    durationMs: 0
  });

  return {
    runs,
    totals: {
      ...totals,
      success: runs.every(run => run.success)
    },
    slowFiles: runs
      .flatMap(run => run.slowFiles.map(file => ({ ...file, run: run.name })))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10)
  };
}

function generateReport(rootDir, resultFiles = []) {
  const allFiles = [];
  for (const scanDir of SCAN_DIRS) {
    allFiles.push(...findTestFiles(path.join(rootDir, scanDir), rootDir));
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

  return {
    total: allFiles.length,
    counts,
    areaCounts,
    execution: resultFiles.length
      ? generateExecutionReport(resultFiles, rootDir)
      : null
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

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
    const backend = report.areaCounts.Backend[cat] || 0;
    const frontend = report.areaCounts.Frontend[cat] || 0;
    const total = report.counts[cat] || 0;
    lines.push(`| ${cat} | ${backend} | ${frontend} | ${total} |`);
  }

  const pbtCount = report.counts.PBT || 0;
  const pbtPct = report.total > 0 ? ((pbtCount / report.total) * 100).toFixed(1) : '0.0';
  lines.push('');
  lines.push(`**PBT percentage:** ${pbtPct}%`);

  if (report.execution) {
    const { totals, runs, slowFiles } = report.execution;
    lines.push('');
    lines.push('### Test Execution Health');
    lines.push('');
    lines.push(`**Overall result:** ${totals.success ? 'PASS' : 'FAIL'}`);
    lines.push('');
    lines.push('| Run | Runner | Files | Passed | Failed | Skipped | Retries | Unhandled | Duration |');
    lines.push('|-----|--------|------:|-------:|-------:|--------:|--------:|----------:|---------:|');
    for (const run of runs) {
      lines.push(
        `| ${run.name} | ${run.runner} | ${run.files} | ${run.passed} | ${run.failed} | ` +
        `${run.skipped} | ${run.retries} | ${run.unhandledErrors} | ${formatDuration(run.durationMs)} |`
      );
    }
    lines.push('');
    lines.push(
      `**Executed:** ${totals.tests} tests across ${totals.files} files in ` +
      `${totals.runs} runs (${formatDuration(totals.durationMs)} aggregate).`
    );
    if (slowFiles.length) {
      lines.push('');
      lines.push('### Slowest Test Files');
      lines.push('');
      lines.push('| Run | File | Duration | Result |');
      lines.push('|-----|------|---------:|--------|');
      for (const file of slowFiles) {
        lines.push(`| ${file.run} | \`${file.file}\` | ${formatDuration(file.durationMs)} | ${file.status} |`);
      }
    }
  }

  return lines.join('\n');
}

function formatPlainText(report) {
  const lines = [];
  lines.push('Test Health Report');
  lines.push('='.repeat(50));
  lines.push(`Total test files: ${report.total}`);
  lines.push('');

  const allCategories = ['Unit', 'Unit (transition)', 'Integration', 'PBT'];
  const maxLabel = Math.max(...allCategories.map(category => category.length));
  for (const cat of allCategories) {
    const backend = report.areaCounts.Backend[cat] || 0;
    const frontend = report.areaCounts.Frontend[cat] || 0;
    const total = report.counts[cat] || 0;
    lines.push(
      `  ${cat.padEnd(maxLabel + 2)} Backend: ${String(backend).padStart(3)}` +
      `  Frontend: ${String(frontend).padStart(3)}  Total: ${String(total).padStart(3)}`
    );
  }

  const pbtCount = report.counts.PBT || 0;
  const pbtPct = report.total > 0 ? ((pbtCount / report.total) * 100).toFixed(1) : '0.0';
  lines.push('');
  lines.push(`PBT percentage: ${pbtPct}%`);

  if (report.execution) {
    const { totals, runs, slowFiles } = report.execution;
    lines.push('');
    lines.push(`Execution result: ${totals.success ? 'PASS' : 'FAIL'}`);
    for (const run of runs) {
      lines.push(
        `  ${run.name}: ${run.passed} passed, ${run.failed} failed, ${run.skipped} skipped; ` +
        `${run.retries} retries, ${run.unhandledErrors} unhandled; ${formatDuration(run.durationMs)}`
      );
    }
    if (slowFiles.length) {
      lines.push('  Slowest files:');
      for (const file of slowFiles.slice(0, 5)) {
        lines.push(`    ${formatDuration(file.durationMs)}  ${file.file}`);
      }
    }
  }

  return lines.join('\n');
}

function parseArguments(args) {
  const resultFiles = [];
  let acceptingResults = false;
  for (const arg of args) {
    if (arg === '--results') {
      acceptingResults = true;
      continue;
    }
    if (acceptingResults || arg.endsWith('.json')) {
      resultFiles.push(path.resolve(arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return resultFiles;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const resultFiles = parseArguments(process.argv.slice(2));
  for (const resultFile of resultFiles) {
    if (!fs.existsSync(resultFile)) {
      throw new Error(`Test result file not found: ${resultFile}`);
    }
  }

  const report = generateReport(rootDir, resultFiles);
  console.log(process.env.GITHUB_ACTIONS
    ? formatMarkdown(report)
    : formatPlainText(report));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  findTestFiles,
  classifyFile,
  parseTestResult,
  parseResultFile,
  generateExecutionReport,
  generateReport,
  formatMarkdown,
  formatPlainText,
  parseArguments
};
