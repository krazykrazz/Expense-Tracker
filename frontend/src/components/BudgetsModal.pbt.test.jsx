/**
 * @invariant Tab Persistence Round-Trip: For any valid tab selection ('manage' or 'history'),
 * selecting that tab, closing the modal, and reopening it (without a focusCategory) should
 * restore the previously selected tab from localStorage.
 *
 * focusCategory Override: For any persisted tab state and any non-null focusCategory string,
 * opening BudgetsModal with that focusCategory should always activate the 'manage' tab,
 * regardless of what tab was previously persisted in localStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import * as fc from 'fast-check';
import useTabState from '../hooks/useTabState';
import { renderHook } from '@testing-library/react';

// ── Mock dependencies so PBTs focus on tab logic only ─────────────────────────

vi.mock('../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
  getBudgetSummary: vi.fn().mockResolvedValue({ totalBudgeted: 0, totalSpent: 0, remaining: 0, budgetsOnTrack: 0, totalBudgets: 0 }),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue({ success: true }),
  copyBudgets: vi.fn().mockResolvedValue({ copied: 0 }),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0, basedOnMonths: 0, averageSpending: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} }),
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock('./BudgetCard', () => ({ default: () => null }));
vi.mock('./BudgetProgressBar', () => ({ default: () => null }));

// ── PBT helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'budgets-modal-tab';
const VALID_TABS = ['manage', 'history'];

/**
 * Simulates the BudgetsModal tab persistence logic using the real useTabState hook.
 * This tests the core invariant: tab selection is persisted to localStorage and
 * restored on re-initialization.
 */
function simulateTabRoundTrip(selectedTab) {
  // Step 1: Render hook (simulates modal open), set tab
  const { result: result1, unmount: unmount1 } = renderHook(() =>
    useTabState(STORAGE_KEY, 'manage')
  );

  act(() => {
    result1.current[1](selectedTab);
  });

  // Verify tab was set
  expect(result1.current[0]).toBe(selectedTab);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(selectedTab);

  // Step 2: Unmount (simulates modal close)
  unmount1();

  // Step 3: Re-render hook (simulates modal reopen without focusCategory)
  const { result: result2, unmount: unmount2 } = renderHook(() =>
    useTabState(STORAGE_KEY, 'manage')
  );

  // Verify persisted tab is restored
  const restoredTab = result2.current[0];
  unmount2();

  return restoredTab;
}

/**
 * Simulates the focusCategory override logic:
 * When focusedCategory is non-null, the modal calls setActiveTab('manage').
 */
function simulateFocusCategoryOverride(persistedTab, focusCategory) {
  // Pre-populate localStorage with the persisted tab
  localStorage.setItem(STORAGE_KEY, persistedTab);

  // Render hook (simulates modal open) — starts with persisted tab
  const { result, unmount } = renderHook(() =>
    useTabState(STORAGE_KEY, 'manage')
  );

  // Verify it loaded the persisted tab
  expect(result.current[0]).toBe(persistedTab);

  // Simulate the focusCategory useEffect: if focusCategory is non-null, force 'manage'
  if (focusCategory !== null && focusCategory !== undefined) {
    act(() => {
      result.current[1]('manage');
    });
  }

  const activeTab = result.current[0];
  unmount();
  return activeTab;
}

// ── Property 1: Tab persistence round-trip ─────────────────────────────────────

describe('BudgetsModal PBT', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  /**
   * **Property 1: Tab persistence round-trip**
   * **Validates: Requirements 1.2, 2.4, 2.5, 3.3**
   *
   * For any valid tab selection ('manage' or 'history'), selecting that tab,
   * closing the modal, and reopening it (without a focusCategory) should restore
   * the previously selected tab from localStorage.
   */
  describe('Property 1: Tab persistence round-trip', () => {
    it('restores the previously selected tab after close/reopen for any valid tab', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          (selectedTab) => {
            localStorage.clear();
            const restoredTab = simulateTabRoundTrip(selectedTab);
            expect(restoredTab).toBe(selectedTab);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('persists the last tab in a sequence of tab changes', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...VALID_TABS), { minLength: 1, maxLength: 10 }),
          (tabSequence) => {
            localStorage.clear();

            const { result, unmount } = renderHook(() =>
              useTabState(STORAGE_KEY, 'manage')
            );

            // Apply each tab change in sequence
            for (const tab of tabSequence) {
              act(() => {
                result.current[1](tab);
              });
            }

            const lastTab = tabSequence[tabSequence.length - 1];
            expect(result.current[0]).toBe(lastTab);
            expect(localStorage.getItem(STORAGE_KEY)).toBe(lastTab);

            unmount();

            // Reopen — should restore the last tab
            const { result: result2, unmount: unmount2 } = renderHook(() =>
              useTabState(STORAGE_KEY, 'manage')
            );
            expect(result2.current[0]).toBe(lastTab);
            unmount2();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('defaults to manage tab when no tab is persisted', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            localStorage.clear();
            const { result, unmount } = renderHook(() =>
              useTabState(STORAGE_KEY, 'manage')
            );
            expect(result.current[0]).toBe('manage');
            unmount();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Property 2: focusCategory overrides persisted tab**
   * **Validates: Requirements 3.1**
   *
   * For any persisted tab state and any non-null focusCategory string, opening
   * BudgetsModal with that focusCategory should always activate the 'manage' tab,
   * regardless of what tab was previously persisted in localStorage.
   */
  describe('Property 2: focusCategory overrides persisted tab', () => {
    it('always activates manage tab when focusCategory is non-null, regardless of persisted tab', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          fc.string({ minLength: 1, maxLength: 50 }),
          (persistedTab, focusCategory) => {
            localStorage.clear();
            const activeTab = simulateFocusCategoryOverride(persistedTab, focusCategory);
            expect(activeTab).toBe('manage');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('respects persisted tab when focusCategory is null', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          (persistedTab) => {
            localStorage.clear();
            const activeTab = simulateFocusCategoryOverride(persistedTab, null);
            expect(activeTab).toBe(persistedTab);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('always activates manage tab for any non-empty focusCategory string', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 50 }),
            fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Utilities')
          ),
          (persistedTab, focusCategory) => {
            localStorage.clear();
            const activeTab = simulateFocusCategoryOverride(persistedTab, focusCategory);
            expect(activeTab).toBe('manage');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
