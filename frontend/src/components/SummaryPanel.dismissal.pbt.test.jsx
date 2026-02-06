import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';

/**
 * **Feature: insurance-claim-reminders, Property 7: Dismissal Hides Banner**
 * 
 * For any InsuranceClaimReminderBanner or BudgetReminderBanner that is dismissed,
 * subsequent renders with the same claims/alerts SHALL not display the banner 
 * until the session ends.
 * 
 * **Validates: Requirements 2.5, 6.2**
 */
describe('SummaryPanel Dismissal Behavior Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for API calls
    global.fetch = vi.fn();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  // Helper: String-based date generator
  const dateArb = fc.tuple(
    fc.integer({ min: 2020, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

  // Generator for insurance claim
  const claimArb = fc.record({
    expenseId: fc.integer({ min: 1, max: 1000 }),
    place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
    originalCost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
    date: dateArb,
    daysPending: fc.integer({ min: 31, max: 365 }),
    personNames: fc.constant(null)
  });

  // Generator for budget alert
  const budgetAlertArb = fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    category: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities'),
    spent: fc.integer({ min: 80, max: 150 }).map(n => n * 10), // 800-1500
    limit: fc.constant(1000),
    progress: fc.integer({ min: 80, max: 150 }),
    severity: fc.constantFrom('warning', 'danger', 'critical')
  });

  /**
   * **Property 7: Dismissal Hides Banner**
   * 
   * Tests that when the dismiss handler is called, the banner should be hidden
   * and remain hidden on subsequent renders within the same session.
   * 
   * This test validates the dismissal state management pattern used in SummaryPanel.
   */
  it('Property 7: Dismissal state should persist across re-renders within session', async () => {
    // Import the components we need to test
    const InsuranceClaimReminderBanner = (await import('./InsuranceClaimReminderBanner')).default;
    const BudgetReminderBanner = (await import('./BudgetReminderBanner')).default;
    const { useState } = await import('react');

    // Create a test wrapper that simulates SummaryPanel's dismissal behavior
    const TestWrapper = ({ claims, alerts }) => {
      const [dismissedInsurance, setDismissedInsurance] = useState(false);
      const [dismissedBudget, setDismissedBudget] = useState(false);

      return (
        <div>
          {/* Insurance Claim Banner with dismissal state */}
          {claims && claims.length > 0 && !dismissedInsurance && (
            <InsuranceClaimReminderBanner
              claims={claims}
              onDismiss={() => setDismissedInsurance(true)}
              onClick={() => {}}
            />
          )}
          
          {/* Budget Alert Banner with dismissal state */}
          {alerts && alerts.length > 0 && !dismissedBudget && (
            <BudgetReminderBanner
              alerts={alerts}
              onDismiss={() => setDismissedBudget(true)}
              onClick={() => {}}
            />
          )}
          
          {/* Indicators for test verification */}
          <div data-testid="insurance-dismissed">{dismissedInsurance.toString()}</div>
          <div data-testid="budget-dismissed">{dismissedBudget.toString()}</div>
        </div>
      );
    };

    // Test with insurance claims
    await fc.assert(
      fc.asyncProperty(
        fc.array(claimArb, { minLength: 1, maxLength: 3 })
          .map(claims => {
            const seen = new Set();
            return claims.filter(claim => {
              if (seen.has(claim.expenseId)) return false;
              seen.add(claim.expenseId);
              return true;
            });
          })
          .filter(claims => claims.length > 0),
        async (claims) => {
          const { container, rerender, unmount } = render(
            <TestWrapper claims={claims} alerts={[]} />
          );

          // Verify banner is initially visible
          let banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify dismissed state is false
          let dismissedIndicator = container.querySelector('[data-testid="insurance-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('false');

          // Click dismiss button
          const dismissBtn = container.querySelector('.reminder-dismiss-btn');
          expect(dismissBtn).toBeTruthy();
          
          await act(async () => {
            fireEvent.click(dismissBtn);
          });

          // Verify dismissed state is now true
          dismissedIndicator = container.querySelector('[data-testid="insurance-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('true');

          // Verify banner is no longer visible
          banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeNull();

          // Re-render with same claims - banner should still be hidden
          await act(async () => {
            rerender(<TestWrapper claims={claims} alerts={[]} />);
          });

          // Verify banner is still hidden after re-render
          banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeNull();

          // Verify dismissed state persists
          dismissedIndicator = container.querySelector('[data-testid="insurance-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('true');

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);

  /**
   * **Property 7 (Budget Alerts): Dismissal Hides Budget Banner**
   * 
   * Tests that when the budget alert dismiss handler is called, the banner should be hidden
   * and remain hidden on subsequent renders within the same session.
   * 
   * **Validates: Requirements 6.2**
   */
  it('Property 7: Budget alert dismissal state should persist across re-renders', async () => {
    const InsuranceClaimReminderBanner = (await import('./InsuranceClaimReminderBanner')).default;
    const BudgetReminderBanner = (await import('./BudgetReminderBanner')).default;
    const { useState } = await import('react');

    const TestWrapper = ({ claims, alerts }) => {
      const [dismissedInsurance, setDismissedInsurance] = useState(false);
      const [dismissedBudget, setDismissedBudget] = useState(false);

      return (
        <div>
          {claims && claims.length > 0 && !dismissedInsurance && (
            <InsuranceClaimReminderBanner
              claims={claims}
              onDismiss={() => setDismissedInsurance(true)}
              onClick={() => {}}
            />
          )}
          
          {alerts && alerts.length > 0 && !dismissedBudget && (
            <BudgetReminderBanner
              alerts={alerts}
              onDismiss={() => setDismissedBudget(true)}
              onClick={() => {}}
            />
          )}
          
          <div data-testid="insurance-dismissed">{dismissedInsurance.toString()}</div>
          <div data-testid="budget-dismissed">{dismissedBudget.toString()}</div>
        </div>
      );
    };

    // Test with budget alerts
    await fc.assert(
      fc.asyncProperty(
        fc.array(budgetAlertArb, { minLength: 1, maxLength: 3 })
          .map(alerts => {
            const seen = new Set();
            return alerts.filter(alert => {
              if (seen.has(alert.id)) return false;
              seen.add(alert.id);
              return true;
            });
          })
          .filter(alerts => alerts.length > 0),
        async (alerts) => {
          const { container, rerender, unmount } = render(
            <TestWrapper claims={[]} alerts={alerts} />
          );

          // Verify banner is initially visible
          let banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify dismissed state is false
          let dismissedIndicator = container.querySelector('[data-testid="budget-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('false');

          // Click dismiss button
          const dismissBtn = container.querySelector('.reminder-dismiss-btn');
          expect(dismissBtn).toBeTruthy();
          
          await act(async () => {
            fireEvent.click(dismissBtn);
          });

          // Verify dismissed state is now true
          dismissedIndicator = container.querySelector('[data-testid="budget-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('true');

          // Verify banner is no longer visible
          banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeNull();

          // Re-render with same alerts - banner should still be hidden
          await act(async () => {
            rerender(<TestWrapper claims={[]} alerts={alerts} />);
          });

          // Verify banner is still hidden after re-render
          banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeNull();

          // Verify dismissed state persists
          dismissedIndicator = container.querySelector('[data-testid="budget-dismissed"]');
          expect(dismissedIndicator.textContent).toBe('true');

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);

  /**
   * **Property: Independent Dismissal**
   * 
   * Tests that dismissing one banner type does not affect the other.
   * Insurance claim dismissal should not affect budget alert visibility and vice versa.
   * 
   * **Validates: Requirements 2.5, 6.2**
   */
  it('Property: Dismissing one banner type should not affect the other', async () => {
    const InsuranceClaimReminderBanner = (await import('./InsuranceClaimReminderBanner')).default;
    const BudgetReminderBanner = (await import('./BudgetReminderBanner')).default;
    const { useState } = await import('react');

    const TestWrapper = ({ claims, alerts }) => {
      const [dismissedInsurance, setDismissedInsurance] = useState(false);
      const [dismissedBudget, setDismissedBudget] = useState(false);

      return (
        <div>
          {claims && claims.length > 0 && !dismissedInsurance && (
            <InsuranceClaimReminderBanner
              claims={claims}
              onDismiss={() => setDismissedInsurance(true)}
              onClick={() => {}}
            />
          )}
          
          {alerts && alerts.length > 0 && !dismissedBudget && (
            <BudgetReminderBanner
              alerts={alerts}
              onDismiss={() => setDismissedBudget(true)}
              onClick={() => {}}
            />
          )}
          
          <div data-testid="insurance-dismissed">{dismissedInsurance.toString()}</div>
          <div data-testid="budget-dismissed">{dismissedBudget.toString()}</div>
        </div>
      );
    };

    // Test with both claims and alerts
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.array(claimArb, { minLength: 1, maxLength: 2 })
            .map(claims => {
              const seen = new Set();
              return claims.filter(claim => {
                if (seen.has(claim.expenseId)) return false;
                seen.add(claim.expenseId);
                return true;
              });
            })
            .filter(claims => claims.length > 0),
          fc.array(budgetAlertArb, { minLength: 1, maxLength: 2 })
            .map(alerts => {
              const seen = new Set();
              return alerts.filter(alert => {
                if (seen.has(alert.id)) return false;
                seen.add(alert.id);
                return true;
              });
            })
            .filter(alerts => alerts.length > 0)
        ),
        async ([claims, alerts]) => {
          const { container, unmount } = render(
            <TestWrapper claims={claims} alerts={alerts} />
          );

          // Verify both banners are initially visible
          let insuranceBanner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          let budgetBanner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(insuranceBanner).toBeTruthy();
          expect(budgetBanner).toBeTruthy();

          // Dismiss insurance banner (first dismiss button)
          const dismissBtns = container.querySelectorAll('.reminder-dismiss-btn');
          expect(dismissBtns.length).toBe(2);
          
          await act(async () => {
            fireEvent.click(dismissBtns[0]); // Dismiss insurance banner
          });

          // Verify insurance banner is hidden but budget banner is still visible
          insuranceBanner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          budgetBanner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(insuranceBanner).toBeNull();
          expect(budgetBanner).toBeTruthy();

          // Verify dismissal states
          const insuranceDismissed = container.querySelector('[data-testid="insurance-dismissed"]');
          const budgetDismissed = container.querySelector('[data-testid="budget-dismissed"]');
          expect(insuranceDismissed.textContent).toBe('true');
          expect(budgetDismissed.textContent).toBe('false');

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 60000);
});
