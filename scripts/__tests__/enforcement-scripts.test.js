/**
 * Unit tests for CI enforcement scripts:
 *   - validate-test-naming.js
 *   - validate-pbt-guardrails.js
 *   - report-test-health.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { classifyTestFile, validateTestNaming } = require('../validate-test-naming');
const { hasInvariantComment, hasDirectDbImport, isUnitTestFile, validatePbtGuardrails } = require('../validate-pbt-guardrails');
const { classifyFile, generateReport, formatMarkdown, formatPlainText } = require('../report-test-health');
const { checkBudget, loadBudget } = require('../check-test-budget');
const { scanFileForRawFetch, validateNoRawFetch, isTestFile, isAllowedFile } = require('../validate-no-raw-fetch');

// Helper: create a temp directory with test files
function createTempTestDir(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-enforcement-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '');
  }
  return tmpDir;
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── validate-test-naming.js ───

describe('validate-test-naming', () => {
  describe('classifyTestFile', () => {
    test('classifies *.unit.test.js as unit', () => {
      expect(classifyTestFile('services/foo.unit.test.js')).toBe('unit');
    });

    test('classifies *.integration.test.js as integration', () => {
      expect(classifyTestFile('services/foo.integration.test.js')).toBe('integration');
    });

    test('classifies *.pbt.test.js as pbt', () => {
      expect(classifyTestFile('services/foo.pbt.test.js')).toBe('pbt');
    });

    test('classifies *.pbt.test.jsx as pbt', () => {
      expect(classifyTestFile('components/Bar.pbt.test.jsx')).toBe('pbt');
    });

    test('classifies plain *.test.js as transition', () => {
      expect(classifyTestFile('services/foo.test.js')).toBe('transition');
    });

    test('classifies plain *.test.jsx as transition', () => {
      expect(classifyTestFile('components/Bar.test.jsx')).toBe('transition');
    });
  });

  describe('validateTestNaming (filesystem)', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('finds no violations with valid filenames', () => {
      tmpDir = createTempTestDir({
        'backend/services/foo.pbt.test.js': '',
        'backend/services/bar.test.js': '',
        'frontend/src/utils/baz.integration.test.js': '',
      });
      const result = validateTestNaming(tmpDir);
      expect(result.violations).toHaveLength(0);
      expect(result.allFiles).toHaveLength(3);
    });

    test('counts categories correctly', () => {
      tmpDir = createTempTestDir({
        'backend/a.pbt.test.js': '',
        'backend/b.pbt.test.js': '',
        'backend/c.integration.test.js': '',
        'frontend/src/d.test.jsx': '',
      });
      const result = validateTestNaming(tmpDir);
      expect(result.classified.pbt).toHaveLength(2);
      expect(result.classified.integration).toHaveLength(1);
      expect(result.classified.transition).toHaveLength(1);
    });
  });
});

// ─── validate-pbt-guardrails.js ───

describe('validate-pbt-guardrails', () => {
  describe('hasInvariantComment', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('detects @invariant in first 30 lines', () => {
      tmpDir = createTempTestDir({
        'test.pbt.test.js': '/**\n * @invariant Balance must be non-negative\n */\nconst fc = require("fast-check");',
      });
      expect(hasInvariantComment(path.join(tmpDir, 'test.pbt.test.js'), 30)).toBe(true);
    });

    test('detects "Invariant:" in first 30 lines', () => {
      tmpDir = createTempTestDir({
        'test.pbt.test.js': '// Invariant: round-trip property\nconst fc = require("fast-check");',
      });
      expect(hasInvariantComment(path.join(tmpDir, 'test.pbt.test.js'), 30)).toBe(true);
    });

    test('returns false when no invariant comment exists', () => {
      tmpDir = createTempTestDir({
        'test.pbt.test.js': 'const fc = require("fast-check");\ndescribe("test", () => {});',
      });
      expect(hasInvariantComment(path.join(tmpDir, 'test.pbt.test.js'), 30)).toBe(false);
    });

    test('returns false when @invariant is after line 30', () => {
      const lines = Array(35).fill('// filler line');
      lines[32] = '// @invariant too late';
      tmpDir = createTempTestDir({
        'test.pbt.test.js': lines.join('\n'),
      });
      expect(hasInvariantComment(path.join(tmpDir, 'test.pbt.test.js'), 30)).toBe(false);
    });
  });

  describe('validatePbtGuardrails (filesystem)', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('passes when all PBT files have invariant and percentage is under threshold', () => {
      tmpDir = createTempTestDir({
        'backend/a.pbt.test.js': '// @invariant test\n',
        'backend/b.test.js': '',
        'backend/c.test.js': '',
        'backend/d.test.js': '',
        'backend/e.test.js': '',
        'backend/f.test.js': '',
      });
      const result = validatePbtGuardrails(tmpDir);
      expect(result.missingInvariant).toHaveLength(0);
      expect(result.percentageExceeded).toBe(false);
    });

    test('fails when PBT file lacks invariant comment', () => {
      tmpDir = createTempTestDir({
        'backend/a.pbt.test.js': 'const fc = require("fast-check");',
        'backend/b.test.js': '',
        'backend/c.test.js': '',
        'backend/d.test.js': '',
        'backend/e.test.js': '',
        'backend/f.test.js': '',
      });
      const result = validatePbtGuardrails(tmpDir);
      expect(result.missingInvariant).toHaveLength(1);
    });

    test('fails when PBT percentage exceeds threshold', () => {
      // 3 PBT out of 4 total = 75%
      tmpDir = createTempTestDir({
        'backend/a.pbt.test.js': '// @invariant x\n',
        'backend/b.pbt.test.js': '// @invariant y\n',
        'backend/c.pbt.test.js': '// @invariant z\n',
        'backend/d.test.js': '',
      });
      const result = validatePbtGuardrails(tmpDir);
      expect(result.percentageExceeded).toBe(true);
      expect(result.pbtPercentage).toBeCloseTo(75, 0);
    });
  });

  describe('hasDirectDbImport', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('detects require of database/db', () => {
      tmpDir = createTempTestDir({
        'unit.test.js': "const { getDatabase } = require('../database/db');\n",
      });
      expect(hasDirectDbImport(path.join(tmpDir, 'unit.test.js'))).toBe(true);
    });

    test('detects require with double-dot path to database/db', () => {
      tmpDir = createTempTestDir({
        'unit.test.js': "const { getDatabase } = require('../../database/db');\n",
      });
      expect(hasDirectDbImport(path.join(tmpDir, 'unit.test.js'))).toBe(true);
    });

    test('returns false when no database import exists', () => {
      tmpDir = createTempTestDir({
        'unit.test.js': "const service = require('./myService');\ndescribe('test', () => {});\n",
      });
      expect(hasDirectDbImport(path.join(tmpDir, 'unit.test.js'))).toBe(false);
    });

    test('returns false when database/db is only referenced via jest.mock()', () => {
      tmpDir = createTempTestDir({
        'unit.test.js': [
          "jest.mock('../database/db', () => ({ getDatabase: jest.fn() }));",
          "const { getDatabase } = require('../database/db');",
          "describe('test', () => {});",
        ].join('\n'),
      });
      expect(hasDirectDbImport(path.join(tmpDir, 'unit.test.js'))).toBe(false);
    });
  });

  describe('isUnitTestFile', () => {
    test('returns true for plain .test.js files', () => {
      expect(isUnitTestFile('backend/services/foo.test.js')).toBe(true);
    });

    test('returns true for plain .test.jsx files', () => {
      expect(isUnitTestFile('frontend/src/components/Bar.test.jsx')).toBe(true);
    });

    test('returns false for integration test files', () => {
      expect(isUnitTestFile('backend/services/foo.integration.test.js')).toBe(false);
    });

    test('returns false for PBT test files', () => {
      expect(isUnitTestFile('backend/services/foo.pbt.test.js')).toBe(false);
    });

    test('returns false for non-test files', () => {
      expect(isUnitTestFile('backend/services/foo.js')).toBe(false);
    });
  });

  describe('database import violations (filesystem)', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('flags unit test files that import database/db', () => {
      tmpDir = createTempTestDir({
        'backend/services/foo.test.js': "const { getDatabase } = require('../database/db');\n",
        'backend/services/bar.test.js': "const service = require('./barService');\n",
        'backend/services/baz.integration.test.js': "const { getDatabase } = require('../database/db');\n",
        'backend/services/qux.pbt.test.js': "// @invariant x\nconst { getDatabase } = require('../database/db');\n",
      });
      const result = validatePbtGuardrails(tmpDir);
      expect(result.unitDbViolations).toHaveLength(1);
      expect(result.unitDbViolations[0]).toContain('foo.test.js');
    });

    test('returns empty violations when no unit tests import database/db', () => {
      tmpDir = createTempTestDir({
        'backend/services/foo.test.js': "const service = require('./fooService');\n",
        'backend/services/bar.integration.test.js': "const { getDatabase } = require('../database/db');\n",
      });
      const result = validatePbtGuardrails(tmpDir);
      expect(result.unitDbViolations).toHaveLength(0);
    });
  });
});

// ─── report-test-health.js ───

describe('report-test-health', () => {
  describe('classifyFile', () => {
    test('classifies PBT files', () => {
      expect(classifyFile('backend/services/foo.pbt.test.js')).toBe('PBT');
    });

    test('classifies integration files', () => {
      expect(classifyFile('backend/services/foo.integration.test.js')).toBe('Integration');
    });

    test('classifies plain test files as Unit (transition)', () => {
      expect(classifyFile('backend/services/foo.test.js')).toBe('Unit (transition)');
    });
  });

  describe('formatMarkdown', () => {
    test('produces valid markdown table', () => {
      const report = {
        total: 10,
        counts: { PBT: 3, Integration: 2, 'Unit (transition)': 5 },
        areaCounts: {
          Backend: { PBT: 2, Integration: 2, 'Unit (transition)': 3 },
          Frontend: { PBT: 1, 'Unit (transition)': 2 },
        },
      };
      const md = formatMarkdown(report);
      expect(md).toContain('## 🧪 Test Health Report');
      expect(md).toContain('| PBT | 2 | 1 | 3 |');
      expect(md).toContain('**PBT percentage:** 30.0%');
    });
  });

  describe('formatPlainText', () => {
    test('produces readable plain text output', () => {
      const report = {
        total: 5,
        counts: { PBT: 1, 'Unit (transition)': 4 },
        areaCounts: {
          Backend: { PBT: 1, 'Unit (transition)': 2 },
          Frontend: { 'Unit (transition)': 2 },
        },
      };
      const text = formatPlainText(report);
      expect(text).toContain('Test Health Report');
      expect(text).toContain('Total test files: 5');
      expect(text).toContain('PBT percentage: 20.0%');
    });
  });
});


// ─── check-test-budget.js ───

describe('check-test-budget', () => {
  describe('checkBudget', () => {
    test('passes when elapsed time is within budget', () => {
      const result = checkBudget('backend-unit-tests', 120, '');
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.elapsedSeconds).toBe(120);
    });

    test('fails when elapsed time exceeds budget', () => {
      const result = checkBudget('backend-unit-tests', 500, '');
      expect(result.passed).toBe(false);
      expect(result.elapsedSeconds).toBe(500);
      expect(result.maxSeconds).toBe(300);
    });

    test('skips when commit message contains [skip-budget]', () => {
      const result = checkBudget('backend-unit-tests', 9999, 'fix: stuff [skip-budget]');
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    test('skips when job name has no budget defined', () => {
      const result = checkBudget('nonexistent-job', 100, '');
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
    });

    test('checks PBT shard budget correctly', () => {
      const result = checkBudget('backend-pbt-shard', 500, '');
      expect(result.passed).toBe(true);
      expect(result.maxSeconds).toBe(600);
    });

    test('fails PBT shard when over budget', () => {
      const result = checkBudget('backend-pbt-shard', 700, '');
      expect(result.passed).toBe(false);
    });
  });

  describe('loadBudget', () => {
    test('loads budget config from project root', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const config = loadBudget(rootDir);
      expect(config).not.toBeNull();
      expect(config.budgets).toBeDefined();
      expect(config.budgets['backend-unit-tests']).toBeDefined();
      expect(config.budgets['backend-pbt-shard']).toBeDefined();
      expect(config.budgets['frontend-tests']).toBeDefined();
    });

    test('returns null for nonexistent directory', () => {
      const config = loadBudget('/nonexistent/path');
      expect(config).toBeNull();
    });
  });
});

// ─── validate-no-raw-fetch.js ───

describe('validate-no-raw-fetch', () => {
  describe('isTestFile', () => {
    test('identifies .test.js files', () => {
      expect(isTestFile('components/Foo.test.js')).toBe(true);
    });

    test('identifies .test.jsx files', () => {
      expect(isTestFile('components/Foo.test.jsx')).toBe(true);
    });

    test('identifies .pbt.test.js files', () => {
      expect(isTestFile('utils/bar.pbt.test.js')).toBe(true);
    });

    test('returns false for source files', () => {
      expect(isTestFile('utils/apiClient.js')).toBe(false);
    });
  });

  describe('isAllowedFile', () => {
    test('allows authApi.js', () => {
      expect(isAllowedFile('services/authApi.js')).toBe(true);
    });

    test('allows fetchProvider.js', () => {
      expect(isAllowedFile('utils/fetchProvider.js')).toBe(true);
    });

    test('rejects other files', () => {
      expect(isAllowedFile('utils/apiClient.js')).toBe(false);
    });
  });

  describe('scanFileForRawFetch', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('detects raw fetch() calls', () => {
      tmpDir = createTempTestDir({
        'source.js': 'const response = await fetch("/api/data");\n',
      });
      const violations = scanFileForRawFetch(path.join(tmpDir, 'source.js'));
      expect(violations).toHaveLength(1);
      expect(violations[0].line).toBe(1);
    });

    test('ignores fetch in comments', () => {
      tmpDir = createTempTestDir({
        'source.js': '// const response = await fetch("/api/data");\n',
      });
      const violations = scanFileForRawFetch(path.join(tmpDir, 'source.js'));
      expect(violations).toHaveLength(0);
    });

    test('ignores fetch in block comments', () => {
      tmpDir = createTempTestDir({
        'source.js': '* fetch("/api/data")\n',
      });
      const violations = scanFileForRawFetch(path.join(tmpDir, 'source.js'));
      expect(violations).toHaveLength(0);
    });

    test('ignores authAwareFetch calls', () => {
      tmpDir = createTempTestDir({
        'source.js': 'const response = await authAwareFetch("/api/data");\n',
      });
      const violations = scanFileForRawFetch(path.join(tmpDir, 'source.js'));
      expect(violations).toHaveLength(0);
    });

    test('detects multiple violations in one file', () => {
      tmpDir = createTempTestDir({
        'source.js': [
          'const a = await fetch("/api/a");',
          'const b = "safe";',
          'const c = await fetch("/api/c");',
        ].join('\n'),
      });
      const violations = scanFileForRawFetch(path.join(tmpDir, 'source.js'));
      expect(violations).toHaveLength(2);
      expect(violations[0].line).toBe(1);
      expect(violations[1].line).toBe(3);
    });
  });

  describe('validateNoRawFetch (filesystem)', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) cleanupTempDir(tmpDir);
    });

    test('passes when no raw fetch calls exist', () => {
      tmpDir = createTempTestDir({
        'frontend/src/utils/apiClient.js': 'const response = await authAwareFetch("/api");\n',
        'frontend/src/components/App.jsx': 'import { authAwareFetch } from "../utils/fetchProvider";\n',
      });
      const result = validateNoRawFetch(tmpDir);
      expect(result.violations).toHaveLength(0);
    });

    test('detects raw fetch in source files', () => {
      tmpDir = createTempTestDir({
        'frontend/src/components/Bad.jsx': 'const r = await fetch("/api/bad");\n',
      });
      const result = validateNoRawFetch(tmpDir);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].file).toContain('Bad.jsx');
    });

    test('excludes test files from scanning', () => {
      tmpDir = createTempTestDir({
        'frontend/src/components/Foo.test.jsx': 'const r = await fetch("/api/test");\n',
      });
      const result = validateNoRawFetch(tmpDir);
      expect(result.violations).toHaveLength(0);
    });

    test('excludes authApi.js from scanning', () => {
      tmpDir = createTempTestDir({
        'frontend/src/services/authApi.js': 'const r = await fetch("/api/auth/status");\n',
      });
      const result = validateNoRawFetch(tmpDir);
      expect(result.violations).toHaveLength(0);
    });

    test('excludes fetchProvider.js from scanning', () => {
      tmpDir = createTempTestDir({
        'frontend/src/utils/fetchProvider.js': 'const _nativeFetch = window.fetch.bind(window);\n',
      });
      const result = validateNoRawFetch(tmpDir);
      expect(result.violations).toHaveLength(0);
    });
  });
});
