/**
 * Property-Based Test: CreditCardDetailView z-index Token Compliance
 * Feature: ux-consistency, Property 7: CreditCardDetailView z-index token compliance
 *
 * Verify CreditCardDetailView.css contains zero hardcoded z-index numeric values.
 * This is a CSS static analysis test — read the CSS file and verify no hardcoded
 * z-index values exist.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';

describe('UX Consistency - CreditCardDetailView z-index Token Compliance', () => {
  const cssFilePath = path.resolve(__dirname, 'CreditCardDetailView.css');
  const cssContent = fs.readFileSync(cssFilePath, 'utf-8');

  // Extract all z-index declarations from the CSS
  const zIndexDeclarations = cssContent
    .split('\n')
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => {
      // Match z-index declarations, skip comments
      return line.includes('z-index') && !line.startsWith('/*') && !line.startsWith('*');
    });

  /**
   * **Feature: ux-consistency, Property 7: CreditCardDetailView z-index token compliance**
   *
   * Verify CreditCardDetailView.css contains zero hardcoded z-index numeric values.
   * All z-index values should use CSS custom property tokens (var(--z-*)).
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 7: CreditCardDetailView z-index token compliance', () => {
    // Use fast-check to randomly sample z-index declarations and verify each one
    const declarationIndexArb = fc.integer({
      min: 0,
      max: Math.max(0, zIndexDeclarations.length - 1)
    });

    // First, verify we found z-index declarations to test
    expect(
      zIndexDeclarations.length,
      'CreditCardDetailView.css should contain z-index declarations'
    ).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        declarationIndexArb,
        (index) => {
          const { line, lineNumber } = zIndexDeclarations[index];

          // Extract the z-index value portion
          const zIndexMatch = line.match(/z-index\s*:\s*(.+?)(?:;|$)/);
          if (!zIndexMatch) return true; // Not a z-index value line

          const value = zIndexMatch[1].trim();

          // Check that the value uses a var() token, not a hardcoded number
          const isHardcodedNumber = /^\d+$/.test(value);
          expect(
            isHardcodedNumber,
            `Line ${lineNumber}: z-index should use a design token (var(--z-*)), found hardcoded value "${value}" in: ${line}`
          ).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional static check: verify ALL z-index declarations use tokens
   */
  it('should have zero hardcoded z-index numeric values in CreditCardDetailView.css', () => {
    const hardcodedZIndexes = zIndexDeclarations.filter(({ line }) => {
      const match = line.match(/z-index\s*:\s*(.+?)(?:;|$)/);
      if (!match) return false;
      const value = match[1].trim();
      return /^\d+$/.test(value);
    });

    expect(
      hardcodedZIndexes,
      `Found hardcoded z-index values: ${hardcodedZIndexes.map(d => `line ${d.lineNumber}: ${d.line}`).join(', ')}`
    ).toHaveLength(0);
  });
});
