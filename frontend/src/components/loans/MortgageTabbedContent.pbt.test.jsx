/**
 * @invariant Tab Selection ARIA Correctness: For any sequence of tab selections, exactly one tab
 * button has aria-selected="true" (the most recently selected), the visible panel has
 * role="tabpanel" with aria-labelledby matching the active tab's id, and only the active
 * tab's panel content is rendered.
 * @invariant Keyboard Navigation Wrapping: For any starting tab index (0-3) and any sequence of
 * ArrowRight/ArrowLeft key presses, the focused tab index equals (startIndex + netRight) mod 4,
 * where netRight = count(ArrowRight) - count(ArrowLeft).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as fc from 'fast-check';
import React from 'react';

vi.mock('./MortgageDetailSection', () => ({ default: () => <div data-testid="mortgage-detail-section" /> }));
vi.mock('./EquityChart', () => ({ default: () => <div data-testid="equity-chart" /> }));
vi.mock('./AmortizationChart', () => ({ default: () => <div data-testid="amortization-chart" /> }));
vi.mock('./PaymentBalanceChart', () => ({ default: () => <div data-testid="payment-balance-chart" /> }));
vi.mock('./LoanPaymentForm', () => ({ default: () => <div data-testid="loan-payment-form" /> }));
vi.mock('./LoanPaymentHistory', () => ({ default: () => <div data-testid="loan-payment-history" /> }));
vi.mock('./MigrationUtility', () => ({ default: () => <div data-testid="migration-utility" /> }));
vi.mock('./PayoffProjectionInsights', () => ({ default: () => <div data-testid="payoff-projection-insights" /> }));
vi.mock('./ScenarioAnalysisInsights', () => ({ default: () => <div data-testid="scenario-analysis-insights" /> }));
vi.mock('../../hooks/useTabState', () => ({
  default: (key, defaultTab) => {
    const [tab, setTab] = require('react').useState(defaultTab);
    return [tab, setTab];
  }
}));

import MortgageTabbedContent from './MortgageTabbedContent';

const baseLoanData = {
  id: 1,
  name: 'Test Mortgage',
  loan_type: 'mortgage',
  currentRate: 5.25,
  rate_type: 'fixed',
  estimated_property_value: 500000,
  initial_balance: 400000
};

const baseProps = {
  loanData: baseLoanData,
  calculatedBalanceData: null,
  insights: null,
  insightsLoading: false,
  payments: [],
  balanceHistory: [],
  linkedFixedExpenses: [],
  totalPayments: 0,
  currentBalance: 400000,
  currentRate: 5.25,
  paymentDueDay: null,
  loading: false,
  loadingPayments: false,
  showPaymentForm: false,
  editingPayment: null,
  showMigrationUtility: false,
  onEditPayment: () => {},
  onEditRate: () => {},
  onCalculateScenario: () => {},
  onShowPaymentForm: () => {},
  onCancelPaymentForm: () => {},
  onPaymentRecorded: () => {},
  onEditPaymentEntry: () => {},
  onDeletePayment: () => {},
  onEditLoanDetails: () => {},
  onMarkPaidOff: () => {},
  onShowMigrationUtility: () => {},
  onMigrationComplete: () => {},
  onCloseMigrationUtility: () => {},
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'projections', label: 'Projections' },
  { id: 'payments', label: 'Payments' },
];

// testids rendered exclusively in each tab panel
const TAB_EXCLUSIVE_TESTIDS = {
  overview: 'mortgage-detail-section',
  charts: 'amortization-chart',
  projections: 'payoff-projection-insights',
  payments: 'loan-payment-history',
};

describe('MortgageTabbedContent - Property-Based Tests', () => {
  /**
   * **Feature: mortgage-detail-view-redesign, Property 2: Tab Selection and ARIA Correctness**
   *
   * For any sequence of tab selections from ['overview', 'charts', 'projections', 'payments']:
   * - After each selection, exactly one tab button has aria-selected="true"
   * - The selected tab is the most recently clicked one
   * - The visible panel has role="tabpanel" with aria-labelledby matching the active tab's id
   * - Only the active tab's panel content is rendered
   *
   * Validates: Requirements 3.3, 9.1, 9.2, 15.1, 15.2, 15.3, 15.4
   */
  it('Property 2: Tab Selection and ARIA Correctness', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('overview', 'charts', 'projections', 'payments'),
          { minLength: 1, maxLength: 10 }
        ),
        (tabSequence) => {
          const { unmount } = render(<MortgageTabbedContent {...baseProps} />);

          for (const tabId of tabSequence) {
            const tabLabel = TABS.find((t) => t.id === tabId).label;
            const tabButton = screen.getByRole('tab', { name: tabLabel });
            fireEvent.click(tabButton);

            // Exactly one tab has aria-selected="true" — the clicked one
            const allTabs = screen.getAllByRole('tab');
            const selectedTabs = allTabs.filter(
              (btn) => btn.getAttribute('aria-selected') === 'true'
            );
            expect(selectedTabs).toHaveLength(1);
            expect(selectedTabs[0]).toBe(tabButton);

            // All other tabs have aria-selected="false"
            const otherTabs = allTabs.filter((btn) => btn !== tabButton);
            for (const other of otherTabs) {
              expect(other.getAttribute('aria-selected')).not.toBe('true');
            }

            // The panel has role="tabpanel" with aria-labelledby="tab-{tabId}"
            const panel = screen.getByRole('tabpanel');
            expect(panel.getAttribute('aria-labelledby')).toBe(`tab-${tabId}`);

            // Only the active tab's exclusive content is rendered
            const activeTestId = TAB_EXCLUSIVE_TESTIDS[tabId];
            expect(screen.getByTestId(activeTestId)).toBeInTheDocument();

            // Exclusive content from other tabs is NOT rendered
            for (const [otherTabId, otherTestId] of Object.entries(TAB_EXCLUSIVE_TESTIDS)) {
              if (otherTabId !== tabId) {
                expect(screen.queryByTestId(otherTestId)).not.toBeInTheDocument();
              }
            }
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: mortgage-detail-view-redesign, Property 3: Keyboard Tab Navigation Wrapping**
   *
   * For any starting tab index (0-3) and any sequence of ArrowRight/ArrowLeft key presses,
   * the focused tab index equals (startIndex + netRight) mod 4, where
   * netRight = count(ArrowRight) - count(ArrowLeft).
   *
   * Validates: Requirements 9.2, 15.1, 15.2, 15.3, 15.4
   */
  it('Property 3: Keyboard Tab Navigation Wrapping', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.array(
          fc.constantFrom('ArrowRight', 'ArrowLeft'),
          { minLength: 1, maxLength: 20 }
        ),
        (startIndex, keySequence) => {
          const { unmount } = render(<MortgageTabbedContent {...baseProps} />);

          // Click the starting tab to set initial focus
          const startLabel = TABS[startIndex].label;
          const startButton = screen.getByRole('tab', { name: startLabel });
          fireEvent.click(startButton);

          // Fire all key events on the tablist
          const tablist = screen.getByRole('tablist');
          for (const key of keySequence) {
            fireEvent.keyDown(tablist, { key });
          }

          // Calculate expected focused index
          const netRight = keySequence.filter((k) => k === 'ArrowRight').length
            - keySequence.filter((k) => k === 'ArrowLeft').length;
          const expectedIndex = ((startIndex + netRight) % 4 + 4) % 4;
          const expectedLabel = TABS[expectedIndex].label;
          const expectedButton = screen.getByRole('tab', { name: expectedLabel });

          // The focused element should be the expected tab button
          expect(document.activeElement).toBe(expectedButton);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
