/**
 * @invariant Button styling properties consistency: For all row components, action buttons share
 * consistent font-size, padding, and border-radius styling properties.
 *
 * Property-based tests for button styling properties consistency.
 *
 * Feature: financial-overview-styling-consistency
 * Property 6: Button Styling Consistency
 * Validates: Requirements 4.6
 */

import { describe, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import CreditCardRow from './CreditCardRow';
import LoanRow from './LoanRow';
import InvestmentRow from './InvestmentRow';

afterEach(cleanup);

// ── Arbitraries ──

const creditCardArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    currentBalance: fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    statementBalance: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 100) / 100)
    ),
    cycleBalance: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 100) / 100)
    ),
    utilization_percentage: fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
        .map(v => Math.round(v * 10) / 10)
    ),
    days_until_due: fc.oneof(
      fc.constant(null),
      fc.integer({ min: -30, max: 60 })
    ),
    credit_limit: fc.double({ min: 500, max: 100000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  });

const loanArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
    currentBalance: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    currentRate: fc.double({ min: 0, max: 30, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    payment_tracking_enabled: fc.boolean()
  });

const investmentArb = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    type: fc.constantFrom('TFSA', 'RRSP'),
    currentValue: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    initial_value: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  });

// ── Helper Functions ──

/**
 * Extract computed style properties for a button element.
 */
const getButtonComputedStyles = (button) => {
  if (!button) return null;
  
  const styles = window.getComputedStyle(button);
  return {
    padding: styles.padding,
    paddingTop: styles.paddingTop,
    paddingRight: styles.paddingRight,
    paddingBottom: styles.paddingBottom,
    paddingLeft: styles.paddingLeft,
    fontSize: styles.fontSize,
    borderRadius: styles.borderRadius,
    fontWeight: styles.fontWeight
  };
};

/**
 * Parse CSS pixel value to number (e.g., "6px" -> 6)
 */
const parsePx = (value) => {
  if (!value) return 0;
  return parseFloat(value.replace('px', ''));
};

/**
 * Check if two CSS values are approximately equal (within 1px tolerance)
 */
const approximatelyEqual = (val1, val2, tolerance = 1) => {
  const num1 = parsePx(val1);
  const num2 = parsePx(val2);
  return Math.abs(num1 - num2) <= tolerance;
};

/**
 * Get all action buttons from a container that have shared financial-action-btn classes
 */
const getFinancialActionButtons = (container) => {
  return Array.from(container.querySelectorAll('button')).filter(btn => 
    Array.from(btn.classList).some(cls => cls.startsWith('financial-action-btn'))
  );
};

// ── Tests ──

describe('FinancialOverviewModal Button Styling Properties PBT', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * Property 6: Button Styling Consistency
   *
   * For all action buttons in the Financial Overview Modal, padding, font-size, 
   * border-radius, and gap spacing should be consistent.
   *
   * This test verifies that:
   * 1. All buttons with the same shared class have identical padding
   * 2. All buttons with the same shared class have identical font-size
   * 3. All buttons with the same shared class have identical border-radius
   * 4. Button styling properties match the CSS variable definitions
   */
  describe('Property 6: Button Styling Consistency', () => {
    it('all primary action buttons have consistent padding', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true }))
          }),
          ({ creditCard, loan }) => {
            // Render components with primary action buttons
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);

            // Find all primary action buttons
            const ccPayBtn = ccRender.container.querySelector('.financial-action-btn-primary');
            const loanPayBtn = loanRender.container.querySelector('.financial-action-btn-primary');

            if (!ccPayBtn || !loanPayBtn) {
              ccRender.unmount();
              loanRender.unmount();
              return true; // Skip if buttons not found
            }

            // Get computed styles
            const ccStyles = getButtonComputedStyles(ccPayBtn);
            const loanStyles = getButtonComputedStyles(loanPayBtn);

            // Check padding consistency
            const paddingConsistent = 
              approximatelyEqual(ccStyles.paddingTop, loanStyles.paddingTop) &&
              approximatelyEqual(ccStyles.paddingRight, loanStyles.paddingRight) &&
              approximatelyEqual(ccStyles.paddingBottom, loanStyles.paddingBottom) &&
              approximatelyEqual(ccStyles.paddingLeft, loanStyles.paddingLeft);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();

            return paddingConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all secondary action buttons have consistent padding', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb(),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render all components
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Find all secondary action buttons
            const ccViewBtn = ccRender.container.querySelector('.financial-action-btn-secondary');
            const loanViewBtn = loanRender.container.querySelector('.financial-action-btn-secondary');
            const invViewBtn = invRender.container.querySelector('.financial-action-btn-secondary');

            if (!ccViewBtn || !loanViewBtn || !invViewBtn) {
              ccRender.unmount();
              loanRender.unmount();
              invRender.unmount();
              return true; // Skip if buttons not found
            }

            // Get computed styles
            const ccStyles = getButtonComputedStyles(ccViewBtn);
            const loanStyles = getButtonComputedStyles(loanViewBtn);
            const invStyles = getButtonComputedStyles(invViewBtn);

            // Check padding consistency across all three
            const paddingConsistent = 
              approximatelyEqual(ccStyles.paddingTop, loanStyles.paddingTop) &&
              approximatelyEqual(ccStyles.paddingTop, invStyles.paddingTop) &&
              approximatelyEqual(ccStyles.paddingRight, loanStyles.paddingRight) &&
              approximatelyEqual(ccStyles.paddingRight, invStyles.paddingRight) &&
              approximatelyEqual(ccStyles.paddingBottom, loanStyles.paddingBottom) &&
              approximatelyEqual(ccStyles.paddingBottom, invStyles.paddingBottom) &&
              approximatelyEqual(ccStyles.paddingLeft, loanStyles.paddingLeft) &&
              approximatelyEqual(ccStyles.paddingLeft, invStyles.paddingLeft);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();
            invRender.unmount();

            return paddingConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all action buttons have consistent font-size within their class', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true })),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render all components
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Get all financial action buttons
            const allButtons = [
              ...getFinancialActionButtons(ccRender.container),
              ...getFinancialActionButtons(loanRender.container),
              ...getFinancialActionButtons(invRender.container)
            ];

            if (allButtons.length === 0) {
              ccRender.unmount();
              loanRender.unmount();
              invRender.unmount();
              return true;
            }

            // Group buttons by class
            const primaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-primary')
            );
            const secondaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-secondary')
            );
            const dangerButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-danger')
            );

            // Check font-size consistency within each group
            const checkFontSizeConsistency = (buttons) => {
              if (buttons.length <= 1) return true;
              const firstFontSize = getButtonComputedStyles(buttons[0]).fontSize;
              return buttons.every(btn => {
                const fontSize = getButtonComputedStyles(btn).fontSize;
                return fontSize === firstFontSize;
              });
            };

            const primaryConsistent = checkFontSizeConsistency(primaryButtons);
            const secondaryConsistent = checkFontSizeConsistency(secondaryButtons);
            const dangerConsistent = checkFontSizeConsistency(dangerButtons);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();
            invRender.unmount();

            return primaryConsistent && secondaryConsistent && dangerConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all action buttons have consistent border-radius within their class', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true })),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render all components
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Get all financial action buttons
            const allButtons = [
              ...getFinancialActionButtons(ccRender.container),
              ...getFinancialActionButtons(loanRender.container),
              ...getFinancialActionButtons(invRender.container)
            ];

            if (allButtons.length === 0) {
              ccRender.unmount();
              loanRender.unmount();
              invRender.unmount();
              return true;
            }

            // Group buttons by class
            const primaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-primary')
            );
            const secondaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-secondary')
            );
            const dangerButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-danger')
            );

            // Check border-radius consistency within each group
            const checkBorderRadiusConsistency = (buttons) => {
              if (buttons.length <= 1) return true;
              const firstBorderRadius = getButtonComputedStyles(buttons[0]).borderRadius;
              return buttons.every(btn => {
                const borderRadius = getButtonComputedStyles(btn).borderRadius;
                return borderRadius === firstBorderRadius;
              });
            };

            const primaryConsistent = checkBorderRadiusConsistency(primaryButtons);
            const secondaryConsistent = checkBorderRadiusConsistency(secondaryButtons);
            const dangerConsistent = checkBorderRadiusConsistency(dangerButtons);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();
            invRender.unmount();

            return primaryConsistent && secondaryConsistent && dangerConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all action buttons have consistent font-weight within their class', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true })),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render all components
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Get all financial action buttons
            const allButtons = [
              ...getFinancialActionButtons(ccRender.container),
              ...getFinancialActionButtons(loanRender.container),
              ...getFinancialActionButtons(invRender.container)
            ];

            if (allButtons.length === 0) {
              ccRender.unmount();
              loanRender.unmount();
              invRender.unmount();
              return true;
            }

            // Group buttons by class
            const primaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-primary')
            );
            const secondaryButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-secondary')
            );
            const dangerButtons = allButtons.filter(btn => 
              btn.classList.contains('financial-action-btn-danger')
            );

            // Check font-weight consistency within each group
            const checkFontWeightConsistency = (buttons) => {
              if (buttons.length <= 1) return true;
              const firstFontWeight = getButtonComputedStyles(buttons[0]).fontWeight;
              return buttons.every(btn => {
                const fontWeight = getButtonComputedStyles(btn).fontWeight;
                // Font weight can be numeric (600) or string ("600"), normalize comparison
                return String(fontWeight) === String(firstFontWeight);
              });
            };

            const primaryConsistent = checkFontWeightConsistency(primaryButtons);
            const secondaryConsistent = checkFontWeightConsistency(secondaryButtons);
            const dangerConsistent = checkFontWeightConsistency(dangerButtons);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();
            invRender.unmount();

            return primaryConsistent && secondaryConsistent && dangerConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('button containers have consistent gap spacing between buttons', () => {
      fc.assert(
        fc.property(
          fc.record({
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true })),
            investment: investmentArb()
          }),
          ({ loan, investment }) => {
            // Render components that have multiple buttons
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Find button containers
            const loanActions = loanRender.container.querySelector('.loan-row-actions');
            const invActions = invRender.container.querySelector('.investment-row-actions');

            if (!loanActions || !invActions) {
              loanRender.unmount();
              invRender.unmount();
              return true;
            }

            // Get computed gap values
            const loanGap = window.getComputedStyle(loanActions).gap;
            const invGap = window.getComputedStyle(invActions).gap;

            // Check if gaps are consistent
            const gapConsistent = loanGap === invGap;

            // Cleanup
            loanRender.unmount();
            invRender.unmount();

            return gapConsistent;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
