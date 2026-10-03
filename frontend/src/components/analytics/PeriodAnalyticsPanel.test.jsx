import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../services/analyticsApi', () => ({
  getPeriodSummary: vi.fn(),
}));

import { getPeriodSummary } from '../../services/analyticsApi';
import PeriodAnalyticsPanel from './PeriodAnalyticsPanel';

const summary = {
  range: { startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 9, monthCount: 9 },
  totals: {
    income: 10000,
    expenses: 7500,
    variableExpenses: 4500,
    fixedExpenses: 3000,
    net: 2500,
    savingsRate: 25,
    averageMonthlyExpenses: 833.33,
    transactionCount: 120,
  },
  incomeByCategory: [
    { category: 'Salary', total: 9500, percentOfIncome: 95 },
    { category: 'Other', total: 500, percentOfIncome: 5 },
  ],
  expensesByCategory: [
    { category: 'Housing', total: 3000, variable: 0, fixed: 3000, transactionCount: 0, percentOfExpenses: 40, percentOfIncome: 30 },
    { category: 'Groceries', total: 2500, variable: 2500, fixed: 0, transactionCount: 80, percentOfExpenses: 33.3, percentOfIncome: 25 },
    { category: 'Gas', total: 2000, variable: 2000, fixed: 0, transactionCount: 40, percentOfExpenses: 26.7, percentOfIncome: 20 },
  ],
};

const Harness = ({ view, initial = { preset: 'ytd', year: 2026, month: 9 } }) => {
  const [period, setPeriod] = useState(initial);
  return <PeriodAnalyticsPanel view={view} period={period} onPeriodChange={setPeriod} />;
};

describe('PeriodAnalyticsPanel', () => {
  beforeEach(() => {
    getPeriodSummary.mockReset();
    getPeriodSummary.mockResolvedValue(summary);
  });

  it('fetches the YTD range and renders spending stat cards and ranked categories', async () => {
    render(<Harness view="spending" />);

    expect(getPeriodSummary).toHaveBeenCalledWith('2026-01', '2026-09', expect.any(Object));
    await screen.findByTestId('spending-view');

    expect(screen.getByTestId('period-range-label')).toHaveTextContent('Jan 2026 – Sep 2026');
    expect(screen.getByText('$7,500.00')).toBeInTheDocument();
    expect(screen.getByText('$833.33')).toBeInTheDocument();
    expect(screen.getByText('40.0% of spending')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Spending by category' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual([
      expect.stringContaining('Housing'),
      expect.stringContaining('Groceries'),
      expect.stringContaining('Gas'),
    ]);
  });

  it('refetches when the preset or anchor changes', async () => {
    render(<Harness view="spending" />);
    await screen.findByTestId('spending-view');

    fireEvent.click(screen.getByRole('button', { name: 'Last 12 months' }));
    await waitFor(() => expect(getPeriodSummary).toHaveBeenLastCalledWith('2025-10', '2026-09', expect.any(Object)));

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    await waitFor(() => expect(getPeriodSummary).toHaveBeenLastCalledWith('2026-09', '2026-09', expect.any(Object)));

    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() => expect(getPeriodSummary).toHaveBeenLastCalledWith('2026-08', '2026-08', expect.any(Object)));
  });

  it('renders the cash flow P&L with collapsible sections', async () => {
    render(<Harness view="cash-flow" />);
    await screen.findByTestId('cash-flow-view');

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getAllByText('25.0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('rowheader', { name: 'Salary' })).toBeInTheDocument();
    expect(screen.getByText('-$3,000.00')).toBeInTheDocument();

    const expensesToggle = screen.getByRole('button', { name: /Expenses/ });
    expect(expensesToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(expensesToggle);
    expect(expensesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('rowheader', { name: 'Housing' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Salary' })).toBeInTheDocument();
  });

  it('shows an overspent state when net is negative', async () => {
    getPeriodSummary.mockResolvedValue({
      ...summary,
      totals: { ...summary.totals, income: 1000, net: -6500, savingsRate: -650 },
    });
    render(<Harness view="cash-flow" />);
    await screen.findByTestId('cash-flow-view');
    expect(screen.getByText('Overspent')).toBeInTheDocument();
    expect(screen.getByText('Net shortfall')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    getPeriodSummary.mockRejectedValueOnce(new Error('boom'));
    render(<Harness view="spending" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load data for this period.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('spending-view');
    expect(getPeriodSummary).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state when there is no spending', async () => {
    getPeriodSummary.mockResolvedValue({ ...summary, expensesByCategory: [] });
    render(<Harness view="spending" />);
    expect(await screen.findByText('No spending recorded for this period.')).toBeInTheDocument();
  });
});
