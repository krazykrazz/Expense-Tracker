/**
 * @invariant PBT threshold resolution with fallback
 * Feature: ci-pipeline-hardening, Property 2: PBT threshold resolution with fallback
 *
 * For any valid test-budget.json with a numeric pbtPercentageThreshold,
 * the validator uses that value. For absent/null/non-number, it uses default 48.
 *
 * **Validates: Requirements 13.1, 13.2**
 */

const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadThreshold } = require('../validate-pbt-guardrails');

function createTempDir(budgetContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbt-threshold-'));
  if (budgetContent !== undefined) {
    fs.writeFileSync(path.join(tmpDir, 'test-budget.json'), budgetContent);
  }
  return tmpDir;
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('Property 2: PBT threshold resolution with fallback', () => {
  it('uses numeric pbtPercentageThreshold from config when present', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (threshold) => {
          const config = JSON.stringify({ pbtPercentageThreshold: threshold });
          const tmpDir = createTempDir(config);
          try {
            const result = loadThreshold(tmpDir);
            expect(result.value).toBe(threshold);
            expect(result.source).toBe('test-budget.json');
          } finally {
            cleanupTempDir(tmpDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('falls back to 48 when pbtPercentageThreshold is absent', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: fc.string(),
          budgets: fc.constant({})
        }),
        (configObj) => {
          // Ensure no pbtPercentageThreshold key
          delete configObj.pbtPercentageThreshold;
          const tmpDir = createTempDir(JSON.stringify(configObj));
          try {
            const result = loadThreshold(tmpDir);
            expect(result.value).toBe(48);
            expect(result.source).toBe('default');
          } finally {
            cleanupTempDir(tmpDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('falls back to 48 when pbtPercentageThreshold is not a number', () => {
    const nonNumberArb = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.integer()),
      fc.record({ nested: fc.string() })
    );

    fc.assert(
      fc.property(
        nonNumberArb,
        (nonNumericValue) => {
          const config = JSON.stringify({ pbtPercentageThreshold: nonNumericValue });
          const tmpDir = createTempDir(config);
          try {
            const result = loadThreshold(tmpDir);
            expect(result.value).toBe(48);
            expect(result.source).toBe('default');
          } finally {
            cleanupTempDir(tmpDir);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('falls back to 48 when test-budget.json does not exist', () => {
    const tmpDir = createTempDir(undefined); // no file created
    try {
      const result = loadThreshold(tmpDir);
      expect(result.value).toBe(48);
      expect(result.source).toBe('default');
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});
