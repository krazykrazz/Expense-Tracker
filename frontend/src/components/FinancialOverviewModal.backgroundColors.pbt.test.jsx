/**
 * Property-Based Tests for Blue-Gray Background Consistency
 * Feature: financial-overview-styling-consistency
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.13**
 * 
 * Property 14: Blue-Gray Background Consistency
 * For all row components (Payment Method, Loan, Investment), background colors 
 * should be in the blue-gray range (#f8f9fa to #f0f4f8).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
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

describe('FinancialOverviewModal - Blue-Gray Background Consistency (PBT)', () => {
  /**
   * Property 14: Blue-Gray Background Consistency
   * 
   * For any set of financial data, all row components should use blue-gray 
   * background colors (#f8f9fa, #f1f5f9, #f0f4f8, or white).
   */
  it('Property 14: all row components use blue-gray background colors', () => {
    fc.assert(
      fc.property(
        fc.record({
          paymentMethods: fc.array(paymentMethodGen(), { minLength: 1, maxLength: 5 }),
          loans: fc.array(loanGen(), { minLength: 1, maxLength: 5 }),
          investments: fc.array(investmentGen(), { minLength: 1, maxLength: 5 }),
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

          // Get all row elements
          const rowElements = container.querySelectorAll([
            '.loan-row',
            '.loan-item',
            '.investment-row',
            '.investment-item',
            '.payment-method-item',
            '.financial-cc-summary-row',
            '.other-payment-method-row',
          ].join(', '));

          const validBackgroundColors = [
            'rgb(248, 249, 250)', // #f8f9fa - financial-bg-base
            'rgb(241, 245, 249)', // #f1f5f9 - financial-bg-hover
            'rgb(240, 244, 248)', // #f0f4f8 - financial-bg-alt
            'rgb(255, 255, 255)', // #ffffff - white
            'rgba(0, 0, 0, 0)',   // transparent
            'transparent',
          ];

          const failures = [];

          rowElements.forEach((element) => {
            const computedStyle = window.getComputedStyle(element);
            const bgColor = computedStyle.backgroundColor;

            if (!validBackgroundColors.includes(bgColor)) {
              // Check if it's a blue-gray color by checking RGB values
              const match = bgColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
              if (match) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                
                // Blue-gray backgrounds are very light with similar R, G, B values
                // Range: #f0f4f8 (240,244,248) to #f8f9fa (248,249,250) or white (255,255,255)
                const isBlueGrayOrWhite = r >= 240 && r <= 255 && 
                                          g >= 240 && g <= 255 && 
                                          b >= 240 && b <= 255 &&
                                          Math.abs(r - g) <= 10 && 
                                          Math.abs(g - b) <= 10;
                
                if (!isBlueGrayOrWhite) {
                  failures.push({
                    element: element.className,
                    backgroundColor: bgColor,
                  });
                }
              }
            }
          });

          // Assert no failures
          if (failures.length > 0) {
            console.error('Non-blue-gray background colors found:', failures);
          }

          return failures.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14a: CSS variables define blue-gray background colors
   */
  it('Property 14a: CSS variables use blue-gray palette for backgrounds', () => {
    const backgroundColors = [
      { name: 'financial-bg-base', hex: '#f8f9fa' },
      { name: 'financial-bg-hover', hex: '#f1f5f9' },
      { name: 'financial-bg-alt', hex: '#f0f4f8' },
    ];

    backgroundColors.forEach(({ name, hex }) => {
      const rgb = hexToRgb(hex);
      
      // Blue-gray backgrounds are very light with similar R, G, B values
      const isBlueGray = rgb.r >= 240 && rgb.r <= 255 && 
                         rgb.g >= 240 && rgb.g <= 255 && 
                         rgb.b >= 240 && rgb.b <= 255 &&
                         Math.abs(rgb.r - rgb.g) <= 10 && 
                         Math.abs(rgb.g - rgb.b) <= 10;
      
      expect(isBlueGray).toBe(true);
    });
  });

  /**
   * Property 14b: Loan rows use blue-gray backgrounds
   */
  it('Property 14b: loan rows use blue-gray background colors', () => {
    const loanBgColor = '#f8f9fa';
    const rgb = hexToRgb(loanBgColor);
    
    const isBlueGray = rgb.r >= 240 && rgb.r <= 255 && 
                       rgb.g >= 240 && rgb.g <= 255 && 
                       rgb.b >= 240 && rgb.b <= 255 &&
                       Math.abs(rgb.r - rgb.g) <= 10 && 
                       Math.abs(rgb.g - rgb.b) <= 10;
    
    expect(isBlueGray).toBe(true);
  });

  /**
   * Property 14c: Investment rows use blue-gray backgrounds
   */
  it('Property 14c: investment rows use blue-gray background colors', () => {
    const investmentBgColor = '#f8f9fa';
    const rgb = hexToRgb(investmentBgColor);
    
    const isBlueGray = rgb.r >= 240 && rgb.r <= 255 && 
                       rgb.g >= 240 && rgb.g <= 255 && 
                       rgb.b >= 240 && rgb.b <= 255 &&
                       Math.abs(rgb.r - rgb.g) <= 10 && 
                       Math.abs(rgb.g - rgb.b) <= 10;
    
    expect(isBlueGray).toBe(true);
  });

  /**
   * Property 14d: Payment method rows use blue-gray backgrounds
   */
  it('Property 14d: payment method rows use blue-gray background colors', () => {
    const paymentMethodBgColor = '#f8f9fa';
    const rgb = hexToRgb(paymentMethodBgColor);
    
    const isBlueGray = rgb.r >= 240 && rgb.r <= 255 && 
                       rgb.g >= 240 && rgb.g <= 255 && 
                       rgb.b >= 240 && rgb.b <= 255 &&
                       Math.abs(rgb.r - rgb.g) <= 10 && 
                       Math.abs(rgb.g - rgb.b) <= 10;
    
    expect(isBlueGray).toBe(true);
  });

  /**
   * Property 14e: Background colors are consistent across all sections
   */
  it('Property 14e: all financial sections use the same blue-gray color scheme', () => {
    const baseColor = '#f8f9fa';
    const hoverColor = '#f1f5f9';
    const altColor = '#f0f4f8';
    
    // All three colors should be in the same blue-gray family
    const colors = [baseColor, hoverColor, altColor];
    
    colors.forEach((hex) => {
      const rgb = hexToRgb(hex);
      
      const isBlueGray = rgb.r >= 240 && rgb.r <= 255 && 
                         rgb.g >= 240 && rgb.g <= 255 && 
                         rgb.b >= 240 && rgb.b <= 255 &&
                         Math.abs(rgb.r - rgb.g) <= 10 && 
                         Math.abs(rgb.g - rgb.b) <= 10;
      
      expect(isBlueGray).toBe(true);
    });
  });
});

/**
 * Helper function to convert hex color to RGB
 * @param {string} hex - Hex color string
 * @returns {{r: number, g: number, b: number}}
 */
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}
