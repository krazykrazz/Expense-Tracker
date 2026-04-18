import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MortgageKpiStrip from './MortgageKpiStrip';

const fullLoanData = {
  id: 1,
  initial_balance: 400000,
  currentRate: 5.25,
  rate_type: 'fixed',
  estimated_property_value: 500000
};

const fullCalcBalance = { currentBalance: 380000 };

const fullInsights = {
  currentStatus: {
    currentPayment: 2200,
    paymentSource: 'Calculated',
    interestBreakdown: { daily: 54.79 }
  },
  projections: {
    currentScenario: { payoffDate: '2049-03-01' }
  }
};

describe('MortgageKpiStrip', () => {
  it('renders all 7 metrics with full data present', () => {
    render(
      <MortgageKpiStrip
        loanData={fullLoanData}
        calculatedBalanceData={fullCalcBalance}
        insights={fullInsights}
        insightsLoading={false}
        paymentDueDay={15}
      />
    );

    // All 7 <dt> labels should be present
    expect(screen.getByText('Current Balance')).toBeInTheDocument();
    expect(screen.getByText('Interest Rate')).toBeInTheDocument();
    expect(screen.getByText('Daily Interest')).toBeInTheDocument();
    expect(screen.getByText('Monthly Payment')).toBeInTheDocument();
    expect(screen.getByText('Next Payment')).toBeInTheDocument();
    expect(screen.getByText('Equity')).toBeInTheDocument();
    expect(screen.getByText('Payoff Date')).toBeInTheDocument();

    // None of the <dd> values should be "—" with full data
    const dds = document.querySelectorAll('dd');
    dds.forEach(dd => {
      expect(dd.textContent).not.toBe('—');
    });
  });

  it('uses semantic dl/dt/dd HTML structure', () => {
    const { container } = render(
      <MortgageKpiStrip
        loanData={fullLoanData}
        calculatedBalanceData={fullCalcBalance}
        insights={fullInsights}
        insightsLoading={false}
        paymentDueDay={null}
      />
    );

    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelectorAll('dt')).toHaveLength(7);
    expect(container.querySelectorAll('dd')).toHaveLength(7);
  });

  it('payment source sub-label renders when paymentSource is present', () => {
    const { container } = render(
      <MortgageKpiStrip
        loanData={fullLoanData}
        calculatedBalanceData={fullCalcBalance}
        insights={fullInsights}
        insightsLoading={false}
        paymentDueDay={null}
      />
    );

    const small = container.querySelector('small');
    expect(small).toBeInTheDocument();
    expect(small.textContent).toBe('Calculated');
  });

  it('payment source sub-label absent when paymentSource is null', () => {
    const insightsNoSource = {
      ...fullInsights,
      currentStatus: { ...fullInsights.currentStatus, paymentSource: null }
    };

    const { container } = render(
      <MortgageKpiStrip
        loanData={fullLoanData}
        calculatedBalanceData={fullCalcBalance}
        insights={insightsNoSource}
        insightsLoading={false}
        paymentDueDay={null}
      />
    );

    expect(container.querySelector('small')).not.toBeInTheDocument();
  });

  it('equity shows "—" when estimated_property_value is 0', () => {
    const loanNoEquity = { ...fullLoanData, estimated_property_value: 0 };

    render(
      <MortgageKpiStrip
        loanData={loanNoEquity}
        calculatedBalanceData={fullCalcBalance}
        insights={fullInsights}
        insightsLoading={false}
        paymentDueDay={null}
      />
    );

    const equityDt = screen.getByText('Equity');
    expect(equityDt.nextElementSibling.textContent).toBe('—');
  });

  it('equity shows "—" when estimated_property_value is null', () => {
    const loanNullEquity = { ...fullLoanData, estimated_property_value: null };

    render(
      <MortgageKpiStrip
        loanData={loanNullEquity}
        calculatedBalanceData={fullCalcBalance}
        insights={fullInsights}
        insightsLoading={false}
        paymentDueDay={null}
      />
    );

    const equityDt = screen.getByText('Equity');
    expect(equityDt.nextElementSibling.textContent).toBe('—');
  });
});
