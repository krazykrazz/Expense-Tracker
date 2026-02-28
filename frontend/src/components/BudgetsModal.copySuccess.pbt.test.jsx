/**
 * @invariant Copy Success Condition: For any copy result { copied, overwritten, skipped }
 * with non-negative integers, the operation is classified as success when
 * copied > 0 || overwritten > 0, and as failure (showing "No budgets found") only
 * when copied === 0 && overwritten === 0.
 *
 * Validates: Requirements 2.2, 3.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import BudgetsModal from './BudgetsModal';

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockCopyBudgets = vi.fn();
const mockGetBudgets = vi.fn();
const mockGetBudgetSummary = vi.fn();

vi.mock('../services/budgetApi', () => ({
  getBudgets: (...args) => mockGetBudgets(...args),
  getBudgetSummary: (...args) => mockGetBudgetSummary(...args),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue({ success: true }),
  copyBudgets: (...args) => mockCopyBudgets(...args),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0, basedOnMonths: 0, averageSpending: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} }),
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue(['Groceries', 'Dining Out', 'Gas']),
}));

vi.mock('./BudgetCard', () => ({ default: () => null }));
vi.mock('./BudgetProgressBar', () => ({ default: () => null }));

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  year: 2024,
  month: 3,
  onBudgetUpdated: vi.fn(),
  focusedCategory: null,
};

/**
 * Arbitrary for copy result objects with non-negative integers.
 */
const copyResultArb = () =>
  fc.record({
    copied: fc.integer({ min: 0, max: 50 }),
    overwritten: fc.integer({ min: 0, max: 50 }),
    skipped: fc.integer({ min: 0, max: 50 }),
  });

/**
 * Arbitrary for copy results that should be classified as success.
 * At least one of copied or overwritten must be > 0.
 */
const successCopyResultArb = () =>
  copyResultArb().filter(r => r.copied > 0 || r.overwritten > 0);

/**
 * Arbitrary for copy results that should be classified as failure.
 * Both copied and overwritten must be 0.
 */
const failureCopyResultArb = () =>
  fc.record({
    copied: fc.constant(0),
    overwritten: fc.constant(0),
    skipped: fc.integer({ min: 0, max: 50 }),
  });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BudgetsModal Copy Success Condition PBT', () => {
  let alertSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Start with no budgets so the confirm dialog is not triggered
    mockGetBudgets.mockResolvedValue({ budgets: [] });
    mockGetBudgetSummary.mockResolvedValue({
      totalBudgeted: 0, totalSpent: 0, remaining: 0,
      budgetsOnTrack: 0, totalBudgets: 0,
    });
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  /**
   * **Property 3: Copy Success Condition**
   * **Validates: Requirements 2.2, 3.3**
   *
   * For any copy result where copied > 0 || overwritten > 0, the success condition
   * holds and "No budgets found" alert is NOT shown.
   * For any copy result where copied === 0 && overwritten === 0, the failure
   * condition holds and "No budgets found" alert IS shown.
   */
  describe('Property 3: Copy Success Condition', () => {
    it('classifies success correctly: copied > 0 || overwritten > 0 means no alert', async () => {
      await fc.assert(
        fc.asyncProperty(
          successCopyResultArb(),
          async (result) => {
            vi.clearAllMocks();
            mockGetBudgets.mockResolvedValue({ budgets: [] });
            mockGetBudgetSummary.mockResolvedValue({
              totalBudgeted: 0, totalSpent: 0, remaining: 0,
              budgetsOnTrack: 0, totalBudgets: 0,
            });
            alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            mockCopyBudgets.mockResolvedValue(result);

            const onBudgetUpdated = vi.fn();
            const { unmount } = render(
              <BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />
            );

            await waitFor(() => {
              expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText(/Copy from Previous Month/));

            await waitFor(() => {
              expect(mockCopyBudgets).toHaveBeenCalled();
            });

            // Success path: no alert shown
            expect(alertSpy).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('classifies failure correctly: copied === 0 && overwritten === 0 shows alert', async () => {
      await fc.assert(
        fc.asyncProperty(
          failureCopyResultArb(),
          async (result) => {
            vi.clearAllMocks();
            mockGetBudgets.mockResolvedValue({ budgets: [] });
            mockGetBudgetSummary.mockResolvedValue({
              totalBudgeted: 0, totalSpent: 0, remaining: 0,
              budgetsOnTrack: 0, totalBudgets: 0,
            });
            alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
            mockCopyBudgets.mockResolvedValue(result);

            const onBudgetUpdated = vi.fn();
            const { unmount } = render(
              <BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />
            );

            await waitFor(() => {
              expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText(/Copy from Previous Month/));

            await waitFor(() => {
              expect(mockCopyBudgets).toHaveBeenCalled();
            });

            // Failure path: alert shown with "No budgets found"
            await waitFor(() => {
              expect(alertSpy).toHaveBeenCalledWith(
                expect.stringContaining('No budgets found')
              );
            });

            // onBudgetUpdated should NOT be called on failure
            expect(onBudgetUpdated).not.toHaveBeenCalled();

            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Specific copy result examples', () => {
    it('treats { copied: 0, overwritten: 3 } as success (no alert)', async () => {
      mockCopyBudgets.mockResolvedValue({ copied: 0, overwritten: 3, skipped: 0 });
      const onBudgetUpdated = vi.fn();

      render(<BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />);

      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Copy from Previous Month/));

      await waitFor(() => {
        expect(mockCopyBudgets).toHaveBeenCalled();
      });

      expect(alertSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(onBudgetUpdated).toHaveBeenCalled();
      });
    });

    it('treats { copied: 3, overwritten: 0 } as success', async () => {
      mockCopyBudgets.mockResolvedValue({ copied: 3, overwritten: 0, skipped: 0 });
      const onBudgetUpdated = vi.fn();

      render(<BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />);

      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Copy from Previous Month/));

      await waitFor(() => {
        expect(mockCopyBudgets).toHaveBeenCalled();
      });

      expect(alertSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(onBudgetUpdated).toHaveBeenCalled();
      });
    });

    it('treats { copied: 2, overwritten: 1 } as success', async () => {
      mockCopyBudgets.mockResolvedValue({ copied: 2, overwritten: 1, skipped: 0 });
      const onBudgetUpdated = vi.fn();

      render(<BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />);

      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Copy from Previous Month/));

      await waitFor(() => {
        expect(mockCopyBudgets).toHaveBeenCalled();
      });

      expect(alertSpy).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(onBudgetUpdated).toHaveBeenCalled();
      });
    });

    it('shows "No budgets found" only when { copied: 0, overwritten: 0 }', async () => {
      mockCopyBudgets.mockResolvedValue({ copied: 0, overwritten: 0, skipped: 0 });
      const onBudgetUpdated = vi.fn();

      render(<BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />);

      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Copy from Previous Month/));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining('No budgets found')
        );
      });

      expect(onBudgetUpdated).not.toHaveBeenCalled();
    });

    it('successful copy triggers fetchBudgets refresh and onBudgetUpdated callback', async () => {
      mockCopyBudgets.mockResolvedValue({ copied: 2, overwritten: 1, skipped: 0 });
      const onBudgetUpdated = vi.fn();

      render(<BudgetsModal {...defaultProps} onBudgetUpdated={onBudgetUpdated} />);

      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });

      // getBudgets is called once on mount
      const initialCallCount = mockGetBudgets.mock.calls.length;

      fireEvent.click(screen.getByText(/Copy from Previous Month/));

      await waitFor(() => {
        expect(mockCopyBudgets).toHaveBeenCalled();
      });

      // After success, fetchBudgets should be called again (refresh)
      await waitFor(() => {
        expect(mockGetBudgets.mock.calls.length).toBeGreaterThan(initialCallCount);
      });

      // onBudgetUpdated callback should be invoked
      await waitFor(() => {
        expect(onBudgetUpdated).toHaveBeenCalledTimes(1);
      });
    });
  });
});
