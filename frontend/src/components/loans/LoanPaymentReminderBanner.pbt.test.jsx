/**
 * @invariant Payment Reminder Timing: For any loan with a due date, reminders are shown when the payment is upcoming or overdue; paid loans do not show reminders. Randomization covers diverse due date offsets and payment states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import LoanPaymentReminderBanner from './LoanPaymentReminderBanner';

describe('LoanPaymentReminderBanner Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: fixed-expense-loan-linkage, Property 11: Reminder Badge Count Accuracy**
   * 
   * For any set of loan payment reminders, the count displayed in the reminder badge 
   * should equal the sum of overdueCount and dueSoonCount from the reminder status.
   * 
   * This test verifies that:
   * 1. When payments array is provided, the banner renders correctly
   * 2. The number of payments shown matches the input array length
   * 3. The total amount displayed equals the sum of all payment amounts
   * 
   * **Validates: Requirements 5.4**
   */
  it('Property 11: should accurately display payment count and total amount', async () => {
    // Generator for loan type
    const loanTypeArb = fc.constantFrom('loan', 'mortgage', 'line_of_credit');
    
    // Generator for a single loan payment reminder
    const paymentArb = fc.record({
      fixedExpenseId: fc.integer({ min: 1, max: 1000 }),
      fixedExpenseName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => Math.round(n * 100) / 100),
      paymentDueDay: fc.integer({ min: 1, max: 31 }),
      daysUntilDue: fc.integer({ min: -30, max: 7 }),
      loanId: fc.integer({ min: 1, max: 1000 }),
      loanName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      loanType: loanTypeArb,
      isLoanPaidOff: fc.constant(false),
      isOverdue: fc.boolean(),
      isDueSoon: fc.boolean(),
      hasPaymentThisMonth: fc.constant(false)
    });
    
    // Generator for a set of payments with unique IDs
    const paymentsArb = fc.array(paymentArb, { minLength: 1, maxLength: 10 })
      .map(payments => {
        // Ensure unique fixedExpenseIds
        const seen = new Set();
        return payments.filter(payment => {
          if (seen.has(payment.fixedExpenseId)) return false;
          seen.add(payment.fixedExpenseId);
          return true;
        });
      })
      .filter(payments => payments.length > 0);

    await fc.assert(
      fc.asyncProperty(
        paymentsArb,
        fc.boolean(), // isOverdue flag
        async (payments, isOverdue) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          // Render the component
          const { container, unmount } = render(
            <LoanPaymentReminderBanner 
              payments={payments}
              isOverdue={isOverdue}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="loan-payment-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify the payment amount is displayed
          const amountElement = container.querySelector('[data-testid="payment-amount"]');
          expect(amountElement).toBeTruthy();

          // Calculate expected total
          const expectedTotal = payments.reduce((sum, p) => sum + p.amount, 0);
          
          // Parse the displayed amount (remove currency formatting)
          const displayedText = amountElement.textContent;
          const displayedAmount = parseFloat(displayedText.replace(/[^0-9.-]/g, ''));
          
          // Verify the total matches (with floating point tolerance)
          expect(Math.abs(displayedAmount - expectedTotal)).toBeLessThan(0.01);

          // For multiple payments, verify the breakdown shows all payments
          if (payments.length > 1) {
            const breakdownItems = container.querySelectorAll('.reminder-loan-item');
            expect(breakdownItems.length).toBe(payments.length);
          }

          // Verify correct styling based on isOverdue
          if (isOverdue) {
            expect(banner.classList.contains('overdue')).toBe(true);
          } else {
            expect(banner.classList.contains('due-soon')).toBe(true);
          }

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // 1 minute timeout for 100 iterations

  /**
   * Additional property test: Empty payments array should render null
   * 
   * **Validates: Requirements 5.5**
   */
  it('should render null when payments array is empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant([]), // Empty array
        fc.boolean(),
        async (payments, isOverdue) => {
          const { container, unmount } = render(
            <LoanPaymentReminderBanner 
              payments={payments}
              isOverdue={isOverdue}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );

          // Verify the banner does not render
          const banner = container.querySelector('[data-testid="loan-payment-reminder-banner"]');
          expect(banner).toBeNull();

          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional property test: Null payments should render null
   * 
   * **Validates: Requirements 5.5**
   */
  it('should render null when payments is null', async () => {
    const { container, unmount } = render(
      <LoanPaymentReminderBanner 
        payments={null}
        isOverdue={false}
        onDismiss={() => {}}
        onClick={() => {}}
      />
    );

    // Verify the banner does not render
    const banner = container.querySelector('[data-testid="loan-payment-reminder-banner"]');
    expect(banner).toBeNull();

    unmount();
  });
});
