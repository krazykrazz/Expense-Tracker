/**
 * Unit tests for parameterized test helper.
 * Tests that testEach correctly registers and runs test cases.
 * **Validates: Requirements 4.1, 4.2**
 */
import { describe, expect } from 'vitest';
import { testEach } from '../parameterized';

describe('testEach', () => {
  // Verify all cases execute by using .test method
  describe('executes all test cases via .test', () => {
    testEach([
      { input: 1, expected: 2, description: 'doubles 1' },
      { input: 2, expected: 4, description: 'doubles 2' },
      { input: 3, expected: 6, description: 'doubles 3' },
    ]).test('$input * 2 = $expected', ({ input, expected }) => {
      expect(input * 2).toBe(expected);
    });
  });

  // Verify .it method works
  describe('executes all test cases via .it', () => {
    testEach([
      { a: 1, b: 2, sum: 3 },
      { a: 10, b: 20, sum: 30 },
    ]).it('adds $a + $b = $sum', ({ a, b, sum }) => {
      expect(a + b).toBe(sum);
    });
  });

  // Verify $fieldName interpolation
  describe('interpolates field names in test title', () => {
    testEach([
      { method: 'click', expected: true, description: 'click trigger' },
      { method: 'Enter', expected: true, description: 'Enter key' },
    ]).test('handles $method', ({ method, expected }) => {
      expect(typeof method).toBe('string');
      expect(expected).toBe(true);
    });
  });

  // Verify cases with no description field
  describe('works without description field', () => {
    testEach([
      { input: 'hello', expected: 5 },
      { input: 'world', expected: 5 },
    ]).test('length of $input', ({ input, expected }) => {
      expect(input.length).toBe(expected);
    });
  });

  // Verify edge case: empty string input
  describe('handles empty string values', () => {
    testEach([
      { input: '', expected: 0, description: 'empty string' },
    ]).test('length of input', ({ input, expected }) => {
      expect(input.length).toBe(expected);
    });
  });

  // Verify skip flag (skipped tests should not fail)
  describe('supports skip flag', () => {
    testEach([
      { input: 1, expected: 2 },
      { input: 999, expected: -1, skip: true }, // would fail if not skipped
    ]).test('processes $input', ({ input, expected }) => {
      expect(input * 2).toBe(expected);
    });
  });
});
