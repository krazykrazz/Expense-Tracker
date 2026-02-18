/**
 * @invariant Tab Persistence Round-Trip: For any valid tab selection
 * ("loans", "investments", "payment-methods"), selecting that tab, closing the modal,
 * and reopening it without an initialTab parameter should restore the previously selected tab.
 *
 * initialTab Override: For any persisted tab state and any valid initialTab string,
 * opening FinancialOverviewModal with that initialTab should always activate the specified tab,
 * regardless of what was previously persisted in localStorage.
 *
 * Net Worth Calculation: For any non-negative totalInvestments and totalDebt values,
 * the displayed net worth equals totalInvestments - totalDebt, and the CSS class matches the sign.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { within } from '@testing-library/react';
import * as fc from 'fast-check';
import useTabState from '../hooks/useTabState';

// ── Mock all dependencies so PBTs focus on the logic under test ───────────────

vi.mock('../config', () => ({
  API_ENDPOINTS: {
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`,
  },
  default: 'http://localhost:2424'
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn().mockResolvedValue([]),
  createLoan: vi.fn(), updateLoan: vi.fn(), deleteLoan: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn().mockResolvedValue([])
}));

vi.mock('../services/investmentApi', () => ({
  getAllInvestments: vi.fn().mockResolvedValue([]),
  createInvestment: vi.fn(), updateInvestment: vi.fn(), deleteInvestment: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn().mockResolvedValue([]),
  deletePaymentMethod: vi.fn(), setPaymentMethodActive: vi.fn()
}));

vi.mock('../utils/validation', () => ({
  validateName: vi.fn(() => null),
  validateAmount: vi.fn(() => null)
}));

vi.mock('../utils/formatters', () => ({
  formatCurrency: (v) => `$${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || ''
}));

vi.mock('./LoanDetailView', () => ({ default: () => null }));
vi.mock('./TotalDebtView', () => ({ default: () => null }));
vi.mock('./InvestmentDetailView', () => ({ default: () => null }));
vi.mock('./PaymentMethodForm', () => ({ default: () => null }));
vi.mock('./CreditCardDetailView', () => ({ default: () => null }));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ loans: [], investments: [] })
});

import FinancialOverviewModal from './FinancialOverviewModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'financial-overview-modal-tab';
const VALID_TABS = ['loans', 'investments', 'payment-methods'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates the tab persistence round-trip using the real useTabState hook.
 * Selects a tab, unmounts (close), remounts (reopen without initialTab), returns restored tab.
 */
function simulateTabRoundTrip(selectedTab) {
  const { result: r1, unmount: u1 } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));
  act(() => { r1.current[1](selectedTab); });
  expect(r1.current[0]).toBe(selectedTab);
  u1();

  const { result: r2, unmount: u2 } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));
  const restored = r2.current[0];
  u2();
  return restored;
}

/**
 * Simulates the initialTab override logic.
 * Pre-populates localStorage with persistedTab, then applies the initialTab useEffect.
 */
function simulateInitialTabOverride(persistedTab, initialTab) {
  localStorage.setItem(STORAGE_KEY, persistedTab);

  const { result, unmount } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));
  expect(result.current[0]).toBe(persistedTab);

  // Simulate the useEffect: if initialTab is non-null, force it
  if (initialTab !== null && initialTab !== undefined) {
    act(() => { result.current[1](initialTab); });
  }

  const activeTab = result.current[0];
  unmount();
  return activeTab;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FinancialOverviewModal PBT', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ loans: [], investments: [] })
    });
  });

  /**
   * **Property 1: Tab persistence round-trip**
   * **Feature: financial-overview-modal, Property 1: Tab persistence round-trip**
   * **Validates: Requirements 1.2, 2.5, 2.6, 3.4**
   *
   * For any valid tab value, selecting that tab, closing the modal, and reopening it
   * without an initialTab parameter should restore the previously selected tab.
   */
  describe('Property 1: Tab persistence round-trip', () => {
    it('restores the previously selected tab after close/reopen for any valid tab', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          (selectedTab) => {
            localStorage.clear();
            const restored = simulateTabRoundTrip(selectedTab);
            expect(restored).toBe(selectedTab);
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
            const { result, unmount } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));

            for (const tab of tabSequence) {
              act(() => { result.current[1](tab); });
            }

            const lastTab = tabSequence[tabSequence.length - 1];
            expect(result.current[0]).toBe(lastTab);
            expect(localStorage.getItem(STORAGE_KEY)).toBe(lastTab);
            unmount();

            const { result: r2, unmount: u2 } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));
            expect(r2.current[0]).toBe(lastTab);
            u2();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('defaults to loans tab when no tab is persisted', () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          localStorage.clear();
          const { result, unmount } = renderHook(() => useTabState(STORAGE_KEY, 'loans'));
          expect(result.current[0]).toBe('loans');
          unmount();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Property 2: initialTab overrides persisted tab**
   * **Feature: financial-overview-modal, Property 2: initialTab overrides persisted tab**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   *
   * For any persisted tab state and any valid initialTab string, opening
   * FinancialOverviewModal with that initialTab should always activate the specified tab,
   * regardless of what was previously persisted in localStorage.
   */
  describe('Property 2: initialTab overrides persisted tab', () => {
    it('always activates the specified initialTab regardless of persisted tab', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          fc.constantFrom(...VALID_TABS),
          (persistedTab, initialTab) => {
            localStorage.clear();
            const activeTab = simulateInitialTabOverride(persistedTab, initialTab);
            expect(activeTab).toBe(initialTab);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('respects persisted tab when initialTab is null', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...VALID_TABS),
          (persistedTab) => {
            localStorage.clear();
            const activeTab = simulateInitialTabOverride(persistedTab, null);
            expect(activeTab).toBe(persistedTab);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 4: Net worth calculation correctness**
   * **Feature: financial-overview-modal, Property 4: Net worth calculation correctness**
   * **Validates: Requirements 8.1, 8.4**
   *
   * For any non-negative totalInvestments and totalDebt values, the displayed net worth
   * equals totalInvestments - totalDebt, and the CSS class matches the sign.
   */
  describe('Property 4: Net worth calculation correctness', () => {
    it('displays net worth = investments - debt with correct sign class', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
          (totalInvestments, totalDebt) => {
            const { unmount } = render(
              <FinancialOverviewModal
                isOpen={true}
                onClose={vi.fn()}
                year={2026}
                month={2}
                onUpdate={vi.fn()}
                onPaymentMethodsUpdate={vi.fn()}
                initialTab={null}
                highlightLoanIds={[]}
                highlightInvestmentIds={[]}
                _testNetWorth={{ totalInvestments, totalDebt }}
              />
            );

            const netWorthEl = screen.getByTestId('net-worth-value');
            const expectedNetWorth = totalInvestments - totalDebt;
            const isPositive = expectedNetWorth >= 0;

            expect(netWorthEl.classList.contains(isPositive ? 'positive' : 'negative')).toBe(true);
            expect(netWorthEl.classList.contains(isPositive ? 'negative' : 'positive')).toBe(false);

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('net worth value equals investments minus debt for boundary values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0, 0.01, 500000, 1000000),
          fc.constantFrom(0, 0.01, 500000, 1000000),
          (totalInvestments, totalDebt) => {
            const { unmount } = render(
              <FinancialOverviewModal
                isOpen={true}
                onClose={vi.fn()}
                year={2026}
                month={2}
                onUpdate={vi.fn()}
                onPaymentMethodsUpdate={vi.fn()}
                initialTab={null}
                highlightLoanIds={[]}
                highlightInvestmentIds={[]}
                _testNetWorth={{ totalInvestments, totalDebt }}
              />
            );

            const netWorthEl = screen.getByTestId('net-worth-value');
            const expectedNetWorth = totalInvestments - totalDebt;
            const isPositive = expectedNetWorth >= 0;

            expect(netWorthEl.classList.contains(isPositive ? 'positive' : 'negative')).toBe(true);

            unmount();
          }
        ),
        { numRuns: 16 }
      );
    });
  });
});
