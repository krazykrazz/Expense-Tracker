import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import InsuranceClaimReminderBanner from './InsuranceClaimReminderBanner';

describe('InsuranceClaimReminderBanner Property-Based Tests', () => {
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

  // Helper: String-based date generator to avoid invalid date issues with fc.date()
  const dateArb = fc.tuple(
    fc.integer({ min: 2020, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([year, month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

  /**
   * **Feature: insurance-claim-reminders, Property 5: Banner Rendering with Required Content**
   * 
   * For any non-empty array of pending claims, the InsuranceClaimReminderBanner SHALL render 
   * and the rendered output SHALL contain the place, amount, and daysPending for each claim.
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  it('Property 5: Banner Rendering with Required Content', async () => {
    // Generator for a single insurance claim
    const claimArb = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100), // Currency amount
      originalCost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      date: dateArb,
      daysPending: fc.integer({ min: 31, max: 365 }),
      personNames: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }), { nil: null })
    });
    
    // Generator for a single claim (to test single claim view)
    const singleClaimArb = fc.array(claimArb, { minLength: 1, maxLength: 1 });

    await fc.assert(
      fc.asyncProperty(
        singleClaimArb,
        async (claims) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <InsuranceClaimReminderBanner 
              claims={claims}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify the claim amount is displayed
          const amountElement = container.querySelector('[data-testid="claim-amount"]');
          expect(amountElement).toBeTruthy();

          // Verify days pending badge is displayed
          const daysBadge = container.querySelector('[data-testid="days-pending-badge"]');
          expect(daysBadge).toBeTruthy();
          expect(daysBadge.textContent).toContain(claims[0].daysPending.toString());

          // Verify the message contains the place name
          const message = container.querySelector('.reminder-message');
          expect(message).toBeTruthy();
          expect(message.textContent).toContain(claims[0].place);

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
   * **Feature: insurance-claim-reminders, Property 6: Multi-Claim Summary Display**
   * 
   * For any array of pending claims with length > 1, the InsuranceClaimReminderBanner 
   * SHALL display a summary count equal to the array length.
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 6: Multi-Claim Summary Display', async () => {
    // Generator for a single insurance claim
    const claimArb = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      originalCost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      date: dateArb,
      daysPending: fc.integer({ min: 31, max: 365 }),
      personNames: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }), { nil: null })
    });
    
    // Generator for multiple claims with unique IDs
    const multipleClaimsArb = fc.array(claimArb, { minLength: 2, maxLength: 10 })
      .map(claims => {
        // Ensure unique expenseIds
        const seen = new Set();
        return claims.filter(claim => {
          if (seen.has(claim.expenseId)) return false;
          seen.add(claim.expenseId);
          return true;
        });
      })
      .filter(claims => claims.length >= 2);

    await fc.assert(
      fc.asyncProperty(
        multipleClaimsArb,
        async (claims) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <InsuranceClaimReminderBanner 
              claims={claims}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );

          // Verify the banner renders
          const banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Verify the message contains the count
          const message = container.querySelector('.reminder-message');
          expect(message).toBeTruthy();
          expect(message.textContent).toContain(claims.length.toString());

          // Verify the breakdown shows all claims
          const breakdownItems = container.querySelectorAll('.reminder-claim-item');
          expect(breakdownItems.length).toBe(claims.length);

          // Verify total amount is displayed
          const amountElement = container.querySelector('[data-testid="claim-amount"]');
          expect(amountElement).toBeTruthy();

          // Calculate expected total
          const expectedTotal = claims.reduce((sum, c) => sum + (c.originalCost || c.amount), 0);
          
          // Parse the displayed amount
          const displayedText = amountElement.textContent;
          const displayedAmount = parseFloat(displayedText.replace(/[^0-9.-]/g, ''));
          
          // Verify the total matches (with floating point tolerance)
          expect(Math.abs(displayedAmount - expectedTotal)).toBeLessThan(0.01);

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
   * Additional property test: Empty claims array should render null
   * 
   * **Validates: Requirements 2.1**
   */
  it('should render null when claims array is empty', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant([]),
        async (claims) => {
          const { container, unmount } = render(
            <InsuranceClaimReminderBanner 
              claims={claims}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );

          // Verify the banner does not render
          const banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeNull();

          unmount();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Additional property test: Null claims should render null
   * 
   * **Validates: Requirements 2.1**
   */
  it('should render null when claims is null', async () => {
    const { container, unmount } = render(
      <InsuranceClaimReminderBanner 
        claims={null}
        onDismiss={() => {}}
        onClick={() => {}}
      />
    );

    // Verify the banner does not render
    const banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
    expect(banner).toBeNull();

    unmount();
  });

  /**
   * Property test: Click handler should be called when banner is clicked
   * 
   * **Validates: Requirements 3.1**
   */
  it('should call onClick handler when banner is clicked', async () => {
    const claimArb = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      originalCost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      date: dateArb,
      daysPending: fc.integer({ min: 31, max: 365 }),
      personNames: fc.constant(null)
    });
    
    const claimsArb = fc.array(claimArb, { minLength: 1, maxLength: 5 })
      .map(claims => {
        const seen = new Set();
        return claims.filter(claim => {
          if (seen.has(claim.expenseId)) return false;
          seen.add(claim.expenseId);
          return true;
        });
      })
      .filter(claims => claims.length > 0);

    await fc.assert(
      fc.asyncProperty(
        claimsArb,
        async (claims) => {
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <InsuranceClaimReminderBanner 
              claims={claims}
              onDismiss={() => {}}
              onClick={mockOnClick}
            />
          );

          const banner = container.querySelector('[data-testid="insurance-claim-reminder-banner"]');
          expect(banner).toBeTruthy();

          // Click the banner
          banner.click();

          // Verify onClick was called
          expect(mockOnClick).toHaveBeenCalledTimes(1);

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
   * Property test: Dismiss handler should be called when dismiss button is clicked
   * 
   * **Validates: Requirements 2.5**
   */
  it('should call onDismiss handler when dismiss button is clicked', async () => {
    const claimArb = fc.record({
      expenseId: fc.integer({ min: 1, max: 1000 }),
      place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      originalCost: fc.integer({ min: 1, max: 1000000 }).map(n => n / 100),
      date: dateArb,
      daysPending: fc.integer({ min: 31, max: 365 }),
      personNames: fc.constant(null)
    });
    
    const claimsArb = fc.array(claimArb, { minLength: 1, maxLength: 5 })
      .map(claims => {
        const seen = new Set();
        return claims.filter(claim => {
          if (seen.has(claim.expenseId)) return false;
          seen.add(claim.expenseId);
          return true;
        });
      })
      .filter(claims => claims.length > 0);

    await fc.assert(
      fc.asyncProperty(
        claimsArb,
        async (claims) => {
          const mockOnDismiss = vi.fn();
          const mockOnClick = vi.fn();

          const { container, unmount } = render(
            <InsuranceClaimReminderBanner 
              claims={claims}
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
});
