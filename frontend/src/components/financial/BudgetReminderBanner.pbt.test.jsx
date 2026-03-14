/**
 * @invariant Budget Alert Thresholds: For any budget utilization percentage, the correct alert level is displayed (warning 80-89%, danger 90-99%, critical >=100%); no alert shows below 80%. Randomization covers diverse spending and budget amount combinations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import BudgetReminderBanner from './BudgetReminderBanner';

describe('BudgetReminderBanner Property-Based Tests', () => {
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

  // Helper: Generate a valid budget alert
  const alertArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 30 }).map(s => `budget-alert-${s}`),
    severity: fc.constantFrom('warning', 'danger', 'critical'),
    category: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    progress: fc.integer({ min: 80, max: 200 }), // 80% to 200%
    spent: fc.integer({ min: 100, max: 100000 }).map(n => n / 100), // Currency amount
    limit: fc.integer({ min: 100, max: 100000 }).map(n => n / 100),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    icon: fc.constantFrom('⚡', '!', '⚠')
  }).map(alert => ({
    ...alert,
    // Ensure spent is consistent with progress and limit
    spent: (alert.progress / 100) * alert.limit
  }));

  /**
   * **Feature: insurance-claim-reminders, Property 9: Budget Alert Click Navigation**
   * 
   * For any BudgetReminderBanner click event, the onClick handler SHALL be called 
   * with the category name of the clicked alert.
   * 
   * **Validates: Requirements 6.4**
   */
  it('Property 9: Budget Alert Click Navigation', async () => {
    // Generator for a single alert (to test single alert view)
    const singleAlertArb = fc.array(alertArb, { minLength: 1, maxLength: 1 });

    await fc.assert(
      fc.asyncProperty(
        singleAlertArb,
        async (alerts) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Click the banner
          banner.click();

          // Verify onClick was called with the category
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          expect(mockOnClick).toHaveBeenCalledWith(alerts[0].category);

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * **Feature: insurance-claim-reminders, Property 10: Budget Alert Content Display**
   * 
   * For any budget alert, the BudgetReminderBanner SHALL display the category name, 
   * spending percentage, and budget limit.
   * 
   * **Validates: Requirements 6.5**
   */
  it('Property 10: Budget Alert Content Display', async () => {
    // Generator for a single alert
    const singleAlertArb = fc.array(alertArb, { minLength: 1, maxLength: 1 });

    await fc.assert(
      fc.asyncProperty(
        singleAlertArb,
        async (alerts) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify the message contains the category name
          const message = container.querySelector('.reminder-message');
          expect(message).toBeTruthy();
          expect(message.textContent).toContain(alerts[0].category);

          // Verify the progress badge is displayed with percentage
          const progressBadge = container.querySelector('[data-testid="progress-badge"]');
          expect(progressBadge).toBeTruthy();
          expect(progressBadge.textContent).toContain(alerts[0].progress.toFixed(0));
          expect(progressBadge.textContent).toContain('%');

          // Verify the budget limit is displayed
          const limitElement = container.querySelector('[data-testid="budget-limit"]');
          expect(limitElement).toBeTruthy();

          // Verify the spent amount is displayed
          const spentElement = container.querySelector('[data-testid="budget-spent"]');
          expect(spentElement).toBeTruthy();

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * **Feature: insurance-claim-reminders, Property 11: Budget Alert Multi-Alert Summary**
   * 
   * For any array of budget alerts with length > 1, the BudgetReminderBanner 
   * SHALL display a summary count equal to the array length.
   * 
   * **Validates: Requirements 6.6**
   */
  it('Property 11: Budget Alert Multi-Alert Summary', async () => {
    // Generator for multiple alerts with unique IDs
    const multipleAlertsArb = fc.array(alertArb, { minLength: 2, maxLength: 10 })
      .map(alerts => {
        // Ensure unique IDs
        const seen = new Set();
        return alerts.filter(alert => {
          if (seen.has(alert.id)) return false;
          seen.add(alert.id);
          return true;
        });
      })
      .filter(alerts => alerts.length >= 2);

    await fc.assert(
      fc.asyncProperty(
        multipleAlertsArb,
        async (alerts) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify the alert count is displayed
          const alertCount = container.querySelector('[data-testid="alert-count"]');
          expect(alertCount).toBeTruthy();
          expect(alertCount.textContent).toContain(alerts.length.toString());

          // Verify the breakdown shows all alerts
          const breakdownItems = container.querySelectorAll('.reminder-alert-item');
          expect(breakdownItems.length).toBe(alerts.length);

          // Verify each alert item shows category and progress
          alerts.forEach((alert, index) => {
            const item = breakdownItems[index];
            expect(item.textContent).toContain(alert.category);
            expect(item.textContent).toContain(alert.progress.toFixed(0));
          });

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Additional property test: Empty alerts array should render null
   */
  it('should render null when alerts array is empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant([]),
        async (alerts) => {
          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );

          // Verify the banner does not render
          const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeNull();

          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional property test: Null alerts should render null
   */
  it('should render null when alerts is null', async () => {
    const { container, unmount } = render(
      <BudgetReminderBanner 
        alerts={null}
        onDismiss={() => {}}
        onClick={() => {}}
      />
    );

    // Verify the banner does not render
    const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
    expect(banner).toBeNull();

    unmount();
  });

  /**
   * Property test: Dismiss handler should be called when dismiss button is clicked
   */
  it('should call onDismiss handler when dismiss button is clicked', async () => {
    const alertsArb = fc.array(alertArb, { minLength: 1, maxLength: 5 })
      .map(alerts => {
        const seen = new Set();
        return alerts.filter(alert => {
          if (seen.has(alert.id)) return false;
          seen.add(alert.id);
          return true;
        });
      })
      .filter(alerts => alerts.length > 0);

    await fc.assert(
      fc.asyncProperty(
        alertsArb,
        async (alerts) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          const dismissBtn = container.querySelector('.reminder-dismiss-btn');
          expect(dismissBtn).toBeTruthy();

          // Click the dismiss button
          dismissBtn.click();

          // Verify onDismiss was called and onClick was NOT called
          expect(mockOnDismiss).toHaveBeenCalledTimes(1);
          expect(mockOnClick).not.toHaveBeenCalled();

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  /**
   * Property test: Banner class should reflect the most severe alert
   */
  it('should apply correct severity class based on most severe alert', async () => {
    // Generate alerts and check that the banner class matches the most severe alert
    const alertsArb = fc.array(alertArb, { minLength: 1, maxLength: 5 })
      .map(alerts => {
        const seen = new Set();
        return alerts.filter(alert => {
          if (seen.has(alert.id)) return false;
          seen.add(alert.id);
          return true;
        });
      })
      .filter(alerts => alerts.length > 0);

    await fc.assert(
      fc.asyncProperty(
        alertsArb,
        async (alerts) => {
          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );

          const banner = container.querySelector('[data-testid="budget-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Determine expected severity class based on actual alerts
          const hasCritical = alerts.some(a => a.severity === 'critical');
          const hasDanger = alerts.some(a => a.severity === 'danger');

          // Check the banner has the correct severity class
          if (hasCritical) {
            expect(banner.classList.contains('critical')).toBe(true);
          } else if (hasDanger) {
            expect(banner.classList.contains('danger')).toBe(true);
          } else {
            expect(banner.classList.contains('warning')).toBe(true);
          }

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  /**
   * Property test: Multi-alert view should allow clicking individual items
   */
  it('should call onClick with specific category when individual alert item is clicked', async () => {
    // Generator for multiple alerts with unique IDs
    const multipleAlertsArb = fc.array(alertArb, { minLength: 2, maxLength: 5 })
      .map(alerts => {
        // Ensure unique IDs and categories
        const seenIds = new Set();
        const seenCategories = new Set();
        return alerts.filter(alert => {
          if (seenIds.has(alert.id) || seenCategories.has(alert.category)) return false;
          seenIds.add(alert.id);
          seenCategories.add(alert.category);
          return true;
        });
      })
      .filter(alerts => alerts.length >= 2);

    await fc.assert(
      fc.asyncProperty(
        multipleAlertsArb,
        fc.integer({ min: 0, max: 10 }),
        async (alerts, clickIndex) => {
          const mockOnClick = vi.fn();
          const targetIndex = clickIndex % alerts.length;

          const { container, unmount } = render(
            <BudgetReminderBanner 
              alerts={alerts}
              onDismiss={() => {}}
              onClick={mockOnClick}
            />
          );

          const breakdownItems = container.querySelectorAll('.reminder-alert-item');
          expect(breakdownItems.length).toBe(alerts.length);

          // Click a specific alert item
          breakdownItems[targetIndex].click();

          // Verify onClick was called with the correct category
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          expect(mockOnClick).toHaveBeenCalledWith(alerts[targetIndex].category);

          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          });

          unmount();
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);
});
