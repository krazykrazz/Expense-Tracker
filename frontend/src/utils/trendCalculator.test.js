import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateTrend } from './trendCalculator.js';

describe('trendCalculator', () => {
  describe('Property-Based Tests', () => {
    // Feature: expense-trend-indicators, Property 1 & 2: Trend direction correctness
    // Validates: Requirements 1.2, 1.3, 2.2, 2.3, 3.2, 3.3
    it('should return "up" direction when current > previous (above threshold)', () => {
      fc.assert(
        fc.property(
          // Generate positive numbers for previous value (avoid zero)
          fc.double({ min: 0.01, max: 10000, noNaN: true }),
          // Generate a multiplier > 1.01 to ensure we're above the 1% threshold
          fc.double({ min: 1.02, max: 10, noNaN: true }),
          (previous, multiplier) => {
            const current = previous * multiplier;
            const result = calculateTrend(current, previous);
            
            // Should return a trend object (not null)
            expect(result).not.toBeNull();
            
            // Direction should be 'up'
            expect(result.direction).toBe('up');
            
            // Percent change should be positive
            expect(result.percentChange).toBeGreaterThan(0);
            
            // Display text should start with '+'
            expect(result.displayText).toMatch(/^\+/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "down" direction when current < previous (above threshold)', () => {
      fc.assert(
        fc.property(
          // Generate positive numbers for previous value (avoid zero)
          fc.double({ min: 0.01, max: 10000, noNaN: true }),
          // Generate a multiplier < 0.99 to ensure we're above the 1% threshold
          fc.double({ min: 0.1, max: 0.98, noNaN: true }),
          (previous, multiplier) => {
            const current = previous * multiplier;
            const result = calculateTrend(current, previous);
            
            // Should return a trend object (not null)
            expect(result).not.toBeNull();
            
            // Direction should be 'down'
            expect(result.direction).toBe('down');
            
            // Percent change should be negative
            expect(result.percentChange).toBeLessThan(0);
            
            // Display text should start with '-'
            expect(result.displayText).toMatch(/^-/);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Feature: expense-trend-indicators, Property 3: Threshold filtering
    // Validates: Requirements 4.5
    it('should return null when percentage change is less than 1% threshold', () => {
      fc.assert(
        fc.property(
          // Generate positive numbers for previous value (avoid zero)
          fc.double({ min: 1, max: 10000, noNaN: true }),
          // Generate a multiplier between 0.99 and 1.01 (within 1% threshold)
          fc.double({ min: 0.991, max: 1.009, noNaN: true }),
          (previous, multiplier) => {
            const current = previous * multiplier;
            const result = calculateTrend(current, previous);
            
            // Should return null when change is below threshold
            expect(result).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return null when previous value is null', () => {
      const result = calculateTrend(100, null);
      expect(result).toBeNull();
    });

    it('should return null when previous value is undefined', () => {
      const result = calculateTrend(100, undefined);
      expect(result).toBeNull();
    });

    it('should return null when previous value is zero', () => {
      const result = calculateTrend(100, 0);
      expect(result).toBeNull();
    });

    it('should return null when current value is null', () => {
      const result = calculateTrend(null, 100);
      expect(result).toBeNull();
    });

    it('should return null when current value is undefined', () => {
      const result = calculateTrend(undefined, 100);
      expect(result).toBeNull();
    });

    it('should format positive percentage correctly', () => {
      const result = calculateTrend(150, 100);
      expect(result.displayText).toBe('+50.0%');
    });

    it('should format negative percentage correctly', () => {
      const result = calculateTrend(75, 100);
      expect(result.displayText).toBe('-25.0%');
    });

    it('should return null when values are equal', () => {
      const result = calculateTrend(100, 100);
      expect(result).toBeNull();
    });
  });
});
