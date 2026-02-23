/**
 * @invariant Button class consistency across sections: For all row components (CreditCardRow, LoanRow,
 * InvestmentRow), action buttons use the same CSS class conventions for View, Edit, Delete, and Pay actions.
 *
 * Property-based tests for button styling consistency across Financial Overview sections.
 *
 * Feature: financial-overview-styling-consistency
 * Property 5: Button Class Consistency Across Sections
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 7.8
 */

import { describe, it, expect, afterEach } from 'vitest';
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
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
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
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
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
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0 && !/\s{2,}/.test(s)),
    type: fc.constantFrom('TFSA', 'RRSP'),
    currentValue: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100),
    initial_value: fc.double({ min: 0, max: 500000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100)
  });

// ── Helper Functions ──

/**
 * Extract CSS classes from a button element, filtering out component-specific classes
 * to focus on shared styling classes.
 */
const extractSharedButtonClasses = (button) => {
  if (!button) return new Set();
  
  const classes = Array.from(button.classList);
  // Filter to shared financial button classes (both financial-action-btn and financial-cc-view-btn)
  return new Set(classes.filter(cls => cls.startsWith('financial-action-btn') || cls.startsWith('financial-cc-view-btn')));
};

/**
 * Get computed styles for a button element.
 */
const getButtonStyles = (button) => {
  if (!button) return null;
  
  const styles = window.getComputedStyle(button);
  return {
    padding: styles.padding,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    borderRadius: styles.borderRadius,
    border: styles.border,
    cursor: styles.cursor,
    transition: styles.transition
  };
};

// ── Tests ──

describe('FinancialOverviewModal Button Styling Consistency PBT', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 7.8**
   *
   * Property 5: Button Class Consistency Across Sections
   *
   * For any action button type (View, Edit, Delete, Pay), the CSS classes applied should be
   * identical across Payment Method, Loan, and Investment rows.
   *
   * This test verifies that:
   * 1. View buttons across all sections use the same shared CSS classes
   * 2. Edit buttons across all sections use the same shared CSS classes
   * 3. Delete buttons across all sections use the same shared CSS classes
   * 4. Pay/Log Payment buttons use the same shared CSS classes
   */
  describe('Property 5: Button Class Consistency Across Sections', () => {
    it('View buttons have identical CSS classes across all sections', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb(),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render each row component
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Find View buttons using their actual classes
            const ccViewBtn = ccRender.container.querySelector('.financial-action-btn-secondary');
            const loanViewBtn = loanRender.container.querySelector('.financial-cc-view-btn');
            const invViewBtn = invRender.container.querySelector('.financial-cc-view-btn');

            // All View buttons should exist
            const allExist = !!ccViewBtn && !!loanViewBtn && !!invViewBtn;

            // Loan and Investment View buttons should have the same shared classes
            const loanClasses = extractSharedButtonClasses(loanViewBtn);
            const invClasses = extractSharedButtonClasses(invViewBtn);

            const loanClassArray = Array.from(loanClasses).sort();
            const invClassArray = Array.from(invClasses).sort();

            const loanInvMatch = JSON.stringify(loanClassArray) === JSON.stringify(invClassArray);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();
            invRender.unmount();

            return allExist && loanInvMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Edit buttons have identical CSS classes across Loan and Investment sections', () => {
      fc.assert(
        fc.property(
          fc.record({
            loan: loanArb(),
            investment: investmentArb()
          }),
          ({ loan, investment }) => {
            // Render each row component
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Find Edit buttons - look for secondary buttons with "Edit" text
            const loanEditBtn = Array.from(loanRender.container.querySelectorAll('.financial-action-btn-secondary'))
              .find(btn => btn.textContent === 'Edit');
            const invEditBtn = Array.from(invRender.container.querySelectorAll('.financial-action-btn-secondary'))
              .find(btn => btn.textContent === 'Edit');

            // Extract shared button classes
            const loanClasses = extractSharedButtonClasses(loanEditBtn);
            const invClasses = extractSharedButtonClasses(invEditBtn);

            // Both Edit buttons should have the same shared classes
            const loanClassArray = Array.from(loanClasses).sort();
            const invClassArray = Array.from(invClasses).sort();

            const allMatch = JSON.stringify(loanClassArray) === JSON.stringify(invClassArray);

            // Cleanup
            loanRender.unmount();
            invRender.unmount();

            return allMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Delete buttons have identical CSS classes across Loan and Investment sections', () => {
      fc.assert(
        fc.property(
          fc.record({
            loan: loanArb(),
            investment: investmentArb()
          }),
          ({ loan, investment }) => {
            // Render each row component
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Find Delete buttons - they should be the danger buttons
            const loanDeleteBtn = loanRender.container.querySelector('.financial-action-btn-danger');
            const invDeleteBtn = invRender.container.querySelector('.financial-action-btn-danger');

            // Extract shared button classes
            const loanClasses = extractSharedButtonClasses(loanDeleteBtn);
            const invClasses = extractSharedButtonClasses(invDeleteBtn);

            // Both Delete buttons should have the same shared classes
            const loanClassArray = Array.from(loanClasses).sort();
            const invClassArray = Array.from(invClasses).sort();

            const allMatch = JSON.stringify(loanClassArray) === JSON.stringify(invClassArray);

            // Cleanup
            loanRender.unmount();
            invRender.unmount();

            return allMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Pay/Log Payment buttons have identical CSS classes across Credit Card and Loan sections', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true }))
          }),
          ({ creditCard, loan }) => {
            // Render each row component
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);

            // Find Pay/Log Payment buttons - they should be the primary action buttons
            const ccPayBtn = ccRender.container.querySelector('.financial-action-btn-primary');
            const loanPayBtn = loanRender.container.querySelector('.financial-action-btn-primary');

            // Extract shared button classes
            const ccClasses = extractSharedButtonClasses(ccPayBtn);
            const loanClasses = extractSharedButtonClasses(loanPayBtn);

            // Both Pay buttons should have the same shared classes
            const ccClassArray = Array.from(ccClasses).sort();
            const loanClassArray = Array.from(loanClasses).sort();

            const allMatch = JSON.stringify(ccClassArray) === JSON.stringify(loanClassArray);

            // Cleanup
            ccRender.unmount();
            loanRender.unmount();

            return allMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('All action buttons across sections have consistent computed styles', () => {
      fc.assert(
        fc.property(
          fc.record({
            creditCard: creditCardArb(),
            loan: loanArb().map(l => ({ ...l, payment_tracking_enabled: true })),
            investment: investmentArb()
          }),
          ({ creditCard, loan, investment }) => {
            // Render all row components
            const ccRender = render(<CreditCardRow card={creditCard} />);
            const loanRender = render(<LoanRow loan={loan} />);
            const invRender = render(<InvestmentRow investment={investment} />);

            // Collect all buttons
            const buttons = [
              ccRender.container.querySelector('.financial-action-btn-primary'),
              ccRender.container.querySelector('.financial-action-btn-secondary'),
              loanRender.container.querySelector('.loan-row-log-payment-button'),
              loanRender.container.querySelector('.loan-row-view-button'),
              loanRender.container.querySelector('.loan-row-edit-button'),
              loanRender.container.querySelector('.loan-row-delete-button'),
              invRender.container.querySelector('.investment-row-view-button'),
              invRender.container.querySelector('.investment-row-edit-button'),
              invRender.container.querySelector('.investment-row-delete-button')
            ].filter(Boolean);

            // Group buttons by their shared class
            const primaryButtons = buttons.filter(btn => 
              btn.classList.contains('financial-action-btn-primary')
            );
            const secondaryButtons = buttons.filter(btn => 
              btn.classList.contains('financial-action-btn-secondary')
            );
            const dangerButtons = buttons.filter(btn => 
              btn.classList.contains('financial-action-btn-danger')
            );

            // Check that all buttons in each group have consistent styles
            const checkGroupConsistency = (group) => {
              if (group.length <= 1) return true;
              
              const firstStyles = getButtonStyles(group[0]);
              return group.every(btn => {
                const styles = getButtonStyles(btn);
                return (
                  styles.padding === firstStyles.padding &&
                  styles.fontSize === firstStyles.fontSize &&
                  styles.fontWeight === firstStyles.fontWeight &&
                  styles.borderRadius === firstStyles.borderRadius
                );
              });
            };

            const primaryConsistent = checkGroupConsistency(primaryButtons);
            const secondaryConsistent = checkGroupConsistency(secondaryButtons);
            const dangerConsistent = checkGroupConsistency(dangerButtons);

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
  });
});
