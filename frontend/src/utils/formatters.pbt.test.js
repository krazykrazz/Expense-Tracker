/**
 * Property-Based Tests for Formatters
 * Tests universal properties of formatting functions
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { formatAmount, formatCurrency } from './formatters.js';

describe('Formatters Property-Based Tests', () => {
  /**
   * **Feature: investment-tracking, Property 13: Currency formatting**
   * **Validates: Requirements 3.6**
   * 
   * For any numeric value, formatting as currency should result in a string 
   * with exactly two decimal places
   */
  test('Property 13: Currency formatting always produces exactly two decimal places', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary numbers including edge cases
        fc.oneof(
          fc.double({ min: -1000000, max: 1000000, noNaN: true }),
          fc.integer({ min: -1000000, max: 1000000 }),
          fc.constant(0),
          fc.constant(0.1),
          fc.constant(0.01),
          fc.constant(0.001),
          fc.constant(999999.999)
        ),
        (value) => {
          // Test formatAmount (used in SummaryPanel)
          const formattedAmount = formatAmount(value);
          
          // Extract decimal part
          const parts = formattedAmount.split('.');
          
          // Should have exactly 2 parts (integer and decimal)
          expect(parts.length).toBe(2);
          
          // Decimal part should have exactly 2 digits
          expect(parts[1].length).toBe(2);
          
          // Should be a valid number format
          const numericValue = parseFloat(formattedAmount.replace(/,/g, ''));
          expect(isNaN(numericValue)).toBe(false);
          
          // Test formatCurrency as well
          const formattedCurrency = formatCurrency(value);
          const currencyParts = formattedCurrency.split('.');
          
          expect(currencyParts.length).toBe(2);
          expect(currencyParts[1].length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 13 (edge case): Currency formatting handles string inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000000, max: 1000000, noNaN: true }).map(String),
          fc.integer({ min: -1000000, max: 1000000 }).map(String),
          fc.constant('0'),
          fc.constant('123.456'),
          fc.constant('999.99')
        ),
        (stringValue) => {
          const formattedAmount = formatAmount(stringValue);
          const parts = formattedAmount.split('.');
          
          expect(parts.length).toBe(2);
          expect(parts[1].length).toBe(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 13 (edge case): Currency formatting handles null/undefined', () => {
    // Test null
    const formattedNull = formatAmount(null);
    const nullParts = formattedNull.split('.');
    expect(nullParts.length).toBe(2);
    expect(nullParts[1].length).toBe(2);
    expect(formattedNull).toBe('0.00');
    
    // Test undefined
    const formattedUndefined = formatAmount(undefined);
    const undefinedParts = formattedUndefined.split('.');
    expect(undefinedParts.length).toBe(2);
    expect(undefinedParts[1].length).toBe(2);
    expect(formattedUndefined).toBe('0.00');
    
    // Test empty string
    const formattedEmpty = formatAmount('');
    const emptyParts = formattedEmpty.split('.');
    expect(emptyParts.length).toBe(2);
    expect(emptyParts[1].length).toBe(2);
    expect(formattedEmpty).toBe('0.00');
  });

  test('Property 13 (rounding): Currency formatting rounds correctly', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (value) => {
          const formatted = formatAmount(value);
          const parsed = parseFloat(formatted.replace(/,/g, ''));
          
          // The formatted value should be within 0.005 of the original
          // (due to rounding to 2 decimal places)
          expect(Math.abs(parsed - value)).toBeLessThanOrEqual(0.005);
        }
      ),
      { numRuns: 100 }
    );
  });
});
