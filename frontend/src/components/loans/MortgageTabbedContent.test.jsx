import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// useTabState mock as a vi.fn() so we can spy on the key argument
vi.mock('../../hooks/useTabState', () => ({
  default: vi.fn((key, defaultTab) => {
    const [tab, setTab] = React.useState(defaultTab);
    return [tab, setTab];
  })
}));

import MortgageTabbedContent from './MortgageTabbedContent';
import useTabState from '../../hooks/useTabState';

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

describe('MortgageTabbedContent', () => {
  it('tab bar renders 4 tabs with labels "Overview", "Charts", "Projections", "Payments"', () => {
    render(<MortgageTabbedContent {...baseProps} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent('Overview');
    expect(tabs[1]).toHaveTextContent('Charts');
    expect(tabs[2]).toHaveTextContent('Projections');
    expect(tabs[3]).toHaveTextContent('Payments');
  });

  it('default active tab is "Overview"', () => {
    render(<MortgageTabbedContent {...baseProps} />);

    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-overview');

    expect(screen.getByTestId('mortgage-detail-section')).toBeInTheDocument();
  });

  it('clicking a tab updates active panel', () => {
    render(<MortgageTabbedContent {...baseProps} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Charts' }));

    expect(screen.getByRole('tab', { name: 'Charts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('amortization-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('mortgage-detail-section')).not.toBeInTheDocument();
  });

  it('Overview tab renders MortgageDetailSection', () => {
    render(<MortgageTabbedContent {...baseProps} />);

    expect(screen.getByTestId('mortgage-detail-section')).toBeInTheDocument();
  });

  it('Charts tab renders charts in correct order', () => {
    // estimated_property_value > 0 (500000) and payments.length > 0
    const props = {
      ...baseProps,
      payments: [{ id: 1 }],
    };

    render(<MortgageTabbedContent {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Charts' }));

    expect(screen.getByTestId('equity-chart')).toBeInTheDocument();
    expect(screen.getByTestId('amortization-chart')).toBeInTheDocument();
    expect(screen.getByTestId('payment-balance-chart')).toBeInTheDocument();

    // Verify DOM order: equity-chart before amortization-chart before payment-balance-chart
    const panel = screen.getByRole('tabpanel');
    const testIdElements = panel.querySelectorAll(
      '[data-testid="equity-chart"], [data-testid="amortization-chart"], [data-testid="payment-balance-chart"]'
    );
    const orderedIds = Array.from(testIdElements).map(el => el.getAttribute('data-testid'));

    expect(orderedIds[0]).toBe('equity-chart');
    expect(orderedIds[1]).toBe('amortization-chart');
    expect(orderedIds[2]).toBe('payment-balance-chart');
  });

  it('Projections tab shows insufficient data message when hasBalanceData is false', () => {
    const props = {
      ...baseProps,
      insights: { dataStatus: { hasBalanceData: false }, projections: null },
    };

    render(<MortgageTabbedContent {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Projections' }));

    expect(
      screen.getByText('Insufficient balance data to calculate projections.')
    ).toBeInTheDocument();
  });

  it('Payments tab shows migration prompt when balance history exists and no payments recorded', () => {
    const props = {
      ...baseProps,
      balanceHistory: [{ id: 1 }],
      payments: [],
    };

    render(<MortgageTabbedContent {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Payments' }));

    expect(
      screen.getByText(/You have balance history entries but no payment records/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Migration Utility' })).toBeInTheDocument();
  });

  it('tab state persists via useTabState (mock useTabState to verify key format)', () => {
    render(<MortgageTabbedContent {...baseProps} />);

    // useTabState should have been called with the per-mortgage key
    expect(useTabState).toHaveBeenCalledWith('mortgage-detail-tab-1', 'overview');
  });
});
