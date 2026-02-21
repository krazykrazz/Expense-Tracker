/**
 * Unit Tests for discrepancyUtils
 *
 * **Validates: Requirements 3.2**
 */

import { describe, test, expect } from 'vitest';
import { calculateDiscrepancy } from './discrepancyUtils';

describe('calculateDiscrepancy', () => {
  test('exact match returns amount=0, type=match, accurate description', () => {
    const result = calculateDiscrepancy(500, 500);
    expect(result.amount).toBe(0);
    expect(result.type).toBe('match');
    expect(result.description).toBe('Tracking is accurate');
  });

  test('higher actual returns positive amount and higher type', () => {
    const result = calculateDiscrepancy(600, 500);
    expect(result.amount).toBe(100);
    expect(result.type).toBe('higher');
    expect(result.description).toContain('higher than tracked');
    expect(result.description).toContain('$100.00');
  });

  test('lower actual returns negative amount and lower type', () => {
    const result = calculateDiscrepancy(400, 500);
    expect(result.amount).toBe(-100);
    expect(result.type).toBe('lower');
    expect(result.description).toContain('lower than tracked');
    expect(result.description).toContain('$100.00');
  });

  test('large values (45000 vs 44000)', () => {
    const result = calculateDiscrepancy(45000, 44000);
    expect(result.amount).toBe(1000);
    expect(result.type).toBe('higher');
    expect(result.description).toContain('$1000.00');
  });

  test('both zero returns match', () => {
    const result = calculateDiscrepancy(0, 0);
    expect(result.amount).toBe(0);
    expect(result.type).toBe('match');
    expect(result.description).toBe('Tracking is accurate');
  });

  test('zero actual, non-zero calculated returns lower', () => {
    const result = calculateDiscrepancy(0, 250);
    expect(result.amount).toBe(-250);
    expect(result.type).toBe('lower');
    expect(result.description).toContain('$250.00');
  });

  test('non-zero actual, zero calculated returns higher', () => {
    const result = calculateDiscrepancy(250, 0);
    expect(result.amount).toBe(250);
    expect(result.type).toBe('higher');
    expect(result.description).toContain('$250.00');
  });

  test('floating point precision (100.10 - 100.07 rounds correctly)', () => {
    const result = calculateDiscrepancy(100.10, 100.07);
    expect(result.amount).toBe(0.03);
    expect(result.type).toBe('higher');
    expect(result.description).toContain('$0.03');
  });
});
