/**
 * Property-Based Tests for YoY Comparison Utilities
 * Tests percentage change calculations and change indicators
 * 
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { calculatePercentageChange, getChangeIndicator } from './yoyComparison';

// Arbitrary for positive amounts (non-zero previous values)
const positiveAmount = fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n > 0);

// Arbitrary for non-negative amounts (including zero)
const nonNegativeAmount = fc.float({ min: Math.fround(0), max: Math.fround(1000000), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 0);

// Arbitrary for strictly positive amounts (for current when previous is zero)
const strictlyPositiveAmount = fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n > 0);

describe('YoY Comparison Property-Based Tests', () => {
  /**
   * **Feature: tax-deductible-analytics, Property 3: Percentage Change Calculation**
   * **Validates: Requirements 2.2**
   * 
   * For any pair of current year value C and previous year value P where P > 0,
   * the calculated percentage change should equal ((C - P) / P) × 100.
   */
  test('Property 3: Percentage change formula is correct for P > 0', () => {
    fc.assert(
      fc.property(
        nonNegativeAmount,
        positiveAmount,
        (current, previous) => {
          const result = calculatePercentageChange(current, previous);
          
          // Calculate expected percentage change
          const expectedChange = ((current - previous) / previous) * 100;
          
          // Verify the change value matches the formula
          expect(result.change).toBeCloseTo(expectedChange, 5);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 3: Formatted percentage includes sign for positive changes', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        positiveAmount.filter(p => true), // Will compare in test
        (current, previous) => {
          // Ensure current > previous for positive change
          const adjustedCurrent = previous + Math.abs(current);
          
          const result = calculatePercentageChange(adjustedCurrent, previous);
          
          // Positive change should have + prefix
          if (result.change > 0) {
            expect(result.formatted.startsWith('+')).toBe(true);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 3: Formatted percentage has one decimal place', () => {
    fc.assert(
      fc.property(
        nonNegativeAmount,
        positiveAmount,
        (current, previous) => {
          const result = calculatePercentageChange(current, previous);
          
          // Should end with % and have format like +X.X% or -X.X% or X.X%
          expect(result.formatted).toMatch(/^[+-]?\d+\.\d%$/);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 4: Change Indicator Correctness**
   * **Validates: Requirements 2.3, 2.4, 2.5, 2.6**
   * 
   * For any pair of current year value C and previous year value P:
   * - If C > P, the indicator should be "↑" (up)
   * - If C < P, the indicator should be "↓" (down)
   * - If C = P and both > 0, the indicator should be "—" (same)
   * - If P = 0 and C > 0, the indicator should be "New"
   * - If P = 0 and C = 0, the indicator should be "—" (same)
   */
  test('Property 4: Direction is "up" when current > previous (P > 0)', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        positiveAmount,
        (delta, previous) => {
          // Ensure current > previous
          const current = previous + delta;
          
          const result = calculatePercentageChange(current, previous);
          
          expect(result.direction).toBe('up');
          expect(getChangeIndicator(result.direction)).toBe('↑');
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 4: Direction is "down" when current < previous (P > 0)', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        positiveAmount,
        (current, delta) => {
          // Ensure previous > current
          const previous = current + delta;
          
          const result = calculatePercentageChange(current, previous);
          
          expect(result.direction).toBe('down');
          expect(getChangeIndicator(result.direction)).toBe('↓');
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 4: Direction is "same" when current = previous (both > 0)', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        (value) => {
          const result = calculatePercentageChange(value, value);
          
          expect(result.direction).toBe('same');
          expect(result.change).toBe(0);
          // 0% change doesn't need a + sign
          expect(result.formatted).toBe('0.0%');
          expect(getChangeIndicator(result.direction)).toBe('—');
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 4: Direction is "new" when P = 0 and C > 0', () => {
    fc.assert(
      fc.property(
        strictlyPositiveAmount,
        (current) => {
          const result = calculatePercentageChange(current, 0);
          
          expect(result.direction).toBe('new');
          expect(result.change).toBeNull();
          expect(result.formatted).toBe('New');
          expect(getChangeIndicator(result.direction)).toBe('✦');
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 4: Direction is "same" when P = 0 and C = 0', () => {
    const result = calculatePercentageChange(0, 0);
    
    expect(result.direction).toBe('same');
    expect(result.change).toBe(0);
    expect(result.formatted).toBe('—');
    expect(getChangeIndicator(result.direction)).toBe('—');
  });

  /**
   * **Additional property tests for edge cases**
   */
  test('Property: Change indicator returns correct symbol for all directions', () => {
    const directions = ['up', 'down', 'same', 'new'];
    const expectedIndicators = {
      'up': '↑',
      'down': '↓',
      'same': '—',
      'new': '✦'
    };
    
    fc.assert(
      fc.property(
        fc.constantFrom(...directions),
        (direction) => {
          const indicator = getChangeIndicator(direction);
          expect(indicator).toBe(expectedIndicators[direction]);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  test('Property: Unknown direction defaults to "—"', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !['up', 'down', 'same', 'new'].includes(s)),
        (unknownDirection) => {
          const indicator = getChangeIndicator(unknownDirection);
          expect(indicator).toBe('—');
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  test('Property: Percentage change is symmetric in sign', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        positiveAmount,
        (a, b) => {
          // If we swap current and previous, the sign should flip
          const result1 = calculatePercentageChange(a, b);
          const result2 = calculatePercentageChange(b, a);
          
          // If a > b, result1 is positive and result2 is negative (and vice versa)
          if (a > b) {
            expect(result1.direction).toBe('up');
            expect(result2.direction).toBe('down');
          } else if (a < b) {
            expect(result1.direction).toBe('down');
            expect(result2.direction).toBe('up');
          } else {
            expect(result1.direction).toBe('same');
            expect(result2.direction).toBe('same');
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property: Large percentage changes are calculated correctly', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }).filter(n => isFinite(n) && n > 0),
        fc.float({ min: Math.fround(10000), max: Math.fround(100000), noNaN: true }).filter(n => isFinite(n) && n > 0),
        (small, large) => {
          // Large increase
          const resultIncrease = calculatePercentageChange(large, small);
          expect(resultIncrease.direction).toBe('up');
          expect(resultIncrease.change).toBeGreaterThan(0);
          
          // Large decrease
          const resultDecrease = calculatePercentageChange(small, large);
          expect(resultDecrease.direction).toBe('down');
          expect(resultDecrease.change).toBeLessThan(0);
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });
});
