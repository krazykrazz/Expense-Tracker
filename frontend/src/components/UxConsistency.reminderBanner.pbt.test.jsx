/**
 * Property-Based Test: Reminder Banner Structural Consistency
 * Feature: ux-consistency, Property 8: Reminder banner structural consistency
 *
 * For any reminder banner in {BudgetReminderBanner, LoanPaymentReminderBanner},
 * verify root element has `reminder-banner` class.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';

import BudgetReminderBanner from './BudgetReminderBanner';
import LoanPaymentReminderBanner from './LoanPaymentReminderBanner';

/**
 * Component configs for reminder banners with their required props.
 */
const COMPONENT_CONFIGS = [
  {
    name: 'BudgetReminderBanner',
    Component: BudgetReminderBanner,
    propsArb: fc.record({
      severity: fc.constantFrom('warning', 'danger', 'critical'),
      category: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      progress: fc.integer({ min: 80, max: 200 }),
      limit: fc.integer({ min: 100, max: 10000 }).map(n => n / 100)
    }).map(({ severity, category, progress, limit }) => ({
      alerts: [{
        id: `budget-alert-1`,
        severity,
        category,
        progress,
        spent: (progress / 100) * limit,
        limit,
        message: `${category} budget alert`,
        icon: '⚡'
      }],
      onDismiss: vi.fn(),
      onClick: vi.fn()
    })),
    testId: 'budget-reminder-banner'
  },
  {
    name: 'LoanPaymentReminderBanner',
    Component: LoanPaymentReminderBanner,
    propsArb: fc.record({
      isOverdue: fc.boolean(),
      loanName: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      amount: fc.integer({ min: 100, max: 100000 }).map(n => n / 100),
      loanType: fc.constantFrom('loan', 'mortgage', 'line_of_credit')
    }).map(({ isOverdue, loanName, amount, loanType }) => ({
      payments: [{
        fixedExpenseId: 1,
        fixedExpenseName: loanName,
        amount,
        paymentDueDay: 15,
        daysUntilDue: isOverdue ? -5 : 3,
        loanId: 1,
        loanName,
        loanType,
        isLoanPaidOff: false,
        isOverdue,
        isDueSoon: !isOverdue,
        hasPaymentThisMonth: false
      }],
      isOverdue,
      onDismiss: vi.fn(),
      onClick: vi.fn()
    })),
    testId: 'loan-payment-reminder-banner'
  }
];

describe('UX Consistency - Reminder Banner Property Tests', () => {
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
   * **Feature: ux-consistency, Property 8: Reminder banner structural consistency**
   *
   * For any reminder banner in {BudgetReminderBanner, LoanPaymentReminderBanner},
   * verify root element has `reminder-banner` class.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   */
  it('Property 8: Reminder banner structural consistency', async () => {
    const componentIndexArb = fc.integer({ min: 0, max: COMPONENT_CONFIGS.length - 1 });

    await fc.assert(
      fc.asyncProperty(
        componentIndexArb,
        fc.integer({ min: 0, max: 999 }), // seed for props generation
        async (index, seed) => {
          const config = COMPONENT_CONFIGS[index];

          // Generate props using the component's arbitrary
          const props = fc.sample(config.propsArb, 1, seed)[0];

          const { container, unmount } = render(
            <config.Component {...props} />
          );

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          // Find the root banner element by test ID
          const banner = container.querySelector(`[data-testid="${config.testId}"]`);
          expect(
            banner,
            `${config.name} should render a banner element`
          ).toBeTruthy();

          // Verify the root element has the shared `reminder-banner` class
          expect(
            banner.classList.contains('reminder-banner'),
            `${config.name} root element should have 'reminder-banner' class`
          ).toBe(true);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000);
});
