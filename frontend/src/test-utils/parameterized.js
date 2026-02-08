/**
 * Parameterized test helper for Vitest.
 * Provides a clean API for running the same test logic with multiple inputs.
 */
import { it, test } from 'vitest';

/**
 * Create parameterized tests from an array of test cases.
 *
 * Usage:
 *   testEach([
 *     { input: '', expected: false, description: 'empty string' },
 *     { input: 'valid', expected: true, description: 'valid input' }
 *   ]).test('validates $description', ({ input, expected }) => {
 *     expect(validate(input)).toBe(expected);
 *   });
 */
export const testEach = (testCases) => {
  const run = (runner) => (nameTemplate, fn) => {
    for (const tc of testCases) {
      const name = nameTemplate.replace(/\$(\w+)/g, (_, key) => {
        return tc[key] !== undefined ? String(tc[key]) : `${key}`;
      });

      const desc = tc.description ? `${name} (${tc.description})` : name;

      if (tc.only) {
        runner.only(desc, () => fn(tc));
      } else if (tc.skip) {
        runner.skip(desc, () => fn(tc));
      } else {
        runner(desc, () => fn(tc));
      }
    }
  };

  return {
    test: run(test),
    it: run(it)
  };
};
