/**
 * Property-Based Tests for WCAG AA Contrast Compliance
 * Feature: financial-overview-styling-consistency
 * 
 * **Validates: Requirements 8.11**
 * 
 * Property 12: WCAG AA Contrast Compliance
 * For all text elements in the Financial Overview Modal, the contrast ratio 
 * between text color and background color should be at least 4.5:1.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { calculateContrastRatio, meetsWCAGAA } from '../utils/contrastUtils.js';
import FinancialOverviewModal from './FinancialOverviewModal.jsx';

// Simple generators for financial data
const paymentMethodGen = () => fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  display_name: fc.constantFrom('Visa', 'Mastercard', 'Cash', 'Debit'),
  full_name: fc.option(fc.constant('Full Name'), { nil: null }),
  type: fc.constantFrom('cash', 'debit', 'credit_card'),
  is_active: fc.boolean(),
  current_balance: fc.option(fc.double({ min: 0, max: 10000 }), { nil: null }),
  credit_limit: fc.option(fc.double({ min: 1000, max: 50000 }), { nil: null }),
});

const loanGen = () => fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  name: fc.constantFrom('Car Loan', 'Student Loan', 'Mortgage', 'Line of Credit'),
  loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
  balance: fc.double({ min: 0, max: 500000 }),
  interest_rate: fc.double({ min: 0, max: 10 }),
  is_paid_off: fc.boolean(),
});

const investmentGen = () => fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  name: fc.constantFrom('TFSA', 'RRSP', 'Investment Account'),
  type: fc.constantFrom('tfsa', 'rrsp', 'other'),
  current_value: fc.double({ min: 0, max: 100000 }),
});

describe('FinancialOverviewModal - WCAG AA Contrast Compliance (PBT)', () => {
  /**
   * Property 12: WCAG AA Contrast Compliance
   * 
   * For any set of financial data (payment methods, loans, investments),
   * all text elements should have a contrast ratio of at least 4.5:1 with their backgrounds.
   */
  it('Property 12: all text elements meet WCAG AA contrast ratio (4.5:1)', () => {
    fc.assert(
      fc.property(
        fc.record({
          paymentMethods: fc.array(paymentMethodGen(), { maxLength: 5 }),
          loans: fc.array(loanGen(), { maxLength: 5 }),
          investments: fc.array(investmentGen(), { maxLength: 5 }),
        }),
        ({ paymentMethods, loans, investments }) => {
          const { container } = render(
            <FinancialOverviewModal
              isOpen={true}
              onClose={() => {}}
              paymentMethods={paymentMethods}
              loans={loans}
              investments={investments}
              loading={false}
            />
          );

          // Get all text elements with specific class patterns
          const textElements = container.querySelectorAll([
            '[class*="-name"]',
            '[class*="-details"]',
            '[class*="-label"]',
            '[class*="-value"]',
            '[class*="-text"]',
            '[class*="-amount"]',
            '.financial-section-title',
            '.financial-net-worth-label',
            '.financial-net-worth-value',
          ].join(', '));

          const failures = [];

          textElements.forEach((element) => {
            const computedStyle = window.getComputedStyle(element);
            const textColor = computedStyle.color;
            const bgColor = computedStyle.backgroundColor;

            // Skip if background is transparent (will inherit from parent)
            if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
              return;
            }

            // Convert RGB to hex for contrast calculation
            const textHex = rgbToHex(textColor);
            const bgHex = rgbToHex(bgColor);

            if (textHex && bgHex) {
              const ratio = calculateContrastRatio(textHex, bgHex);
              const passes = meetsWCAGAA(textHex, bgHex);

              if (!passes) {
                failures.push({
                  element: element.className,
                  textColor: textHex,
                  bgColor: bgHex,
                  ratio: ratio.toFixed(2),
                });
              }
            }
          });

          // Assert no failures
          if (failures.length > 0) {
            console.error('WCAG AA Contrast Failures:', failures);
          }

          return failures.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12a: Primary text color meets WCAG AA on all backgrounds
   */
  it('Property 12a: primary text color (#334155) meets WCAG AA on all blue-gray backgrounds', () => {
    const primaryTextColor = '#334155';
    const backgrounds = ['#f8f9fa', '#f1f5f9', '#f0f4f8', '#ffffff'];

    backgrounds.forEach((bgColor) => {
      const ratio = calculateContrastRatio(primaryTextColor, bgColor);
      const passes = meetsWCAGAA(primaryTextColor, bgColor);

      expect(passes).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 12b: Secondary text color meets WCAG AA on all backgrounds
   */
  it('Property 12b: secondary text color (#475569) meets WCAG AA on all blue-gray backgrounds', () => {
    const secondaryTextColor = '#475569';
    const backgrounds = ['#f8f9fa', '#f1f5f9', '#f0f4f8', '#ffffff'];

    backgrounds.forEach((bgColor) => {
      const ratio = calculateContrastRatio(secondaryTextColor, bgColor);
      const passes = meetsWCAGAA(secondaryTextColor, bgColor);

      expect(passes).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 12c: Button text meets WCAG AA standards
   */
  it('Property 12c: button text colors meet WCAG AA on button backgrounds', () => {
    const buttonCombinations = [
      { text: '#ffffff', bg: '#047857', label: 'Primary button (white on green)' },
      { text: '#334155', bg: '#f8fafc', label: 'Secondary button (dark on light)' },
      { text: '#dc2626', bg: '#f8fafc', label: 'Danger button (red on light)' },
    ];

    buttonCombinations.forEach(({ text, bg, label }) => {
      const ratio = calculateContrastRatio(text, bg);
      const passes = meetsWCAGAA(text, bg);

      expect(passes).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  /**
   * Property 12d: All CSS variable color combinations meet WCAG AA
   */
  it('Property 12d: all defined CSS variable text/background combinations meet WCAG AA', () => {
    const combinations = [
      { text: '#334155', bg: '#f8f9fa', context: 'Primary text on base background' },
      { text: '#334155', bg: '#f1f5f9', context: 'Primary text on hover background' },
      { text: '#334155', bg: '#f0f4f8', context: 'Primary text on alt background' },
      { text: '#475569', bg: '#f8f9fa', context: 'Secondary text on base background' },
      { text: '#475569', bg: '#f1f5f9', context: 'Secondary text on hover background' },
      { text: '#475569', bg: '#f0f4f8', context: 'Secondary text on alt background' },
      { text: '#0f172a', bg: '#f8f9fa', context: 'Darker primary text on base background' },
      { text: '#64748b', bg: '#f8f9fa', context: 'Tertiary text on base background' },
    ];

    combinations.forEach(({ text, bg, context }) => {
      const ratio = calculateContrastRatio(text, bg);
      const passes = meetsWCAGAA(text, bg);

      expect(passes).toBe(true);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});

/**
 * Helper function to convert RGB color string to hex
 * @param {string} rgb - RGB color string (e.g., "rgb(51, 65, 85)")
 * @returns {string|null} Hex color string or null if invalid
 */
function rgbToHex(rgb) {
  // Handle hex colors that are already in hex format
  if (rgb.startsWith('#')) {
    return rgb;
  }

  // Parse RGB string
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
  if (!match) {
    return null;
  }

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);

  // Convert to hex
  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
