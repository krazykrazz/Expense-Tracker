import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/analyticsApi', () => ({
  getMonthlySummary: vi.fn(),
}));

vi.mock('../../utils/formatters', () => ({
  formatCurrency: (val) => parseFloat(val || 0).toFixed(2),
  getMonthNameLong: (m) => [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ][m - 1] || '',
}));

import { getMonthlySummary } from '../../services/analyticsApi';
import MonthlySummaryView from './MonthlySummaryView';

describe('MonthlySummaryView', () => {
  const fullData = {
    totalSpending: 2345.67,
    topCategories: [
      { category: 'Groceries', total: 567.89 },
      { category: 'Dining', total: 345.00 },
      { category: 'Transport', total: 200.00 },
    ],
    topMerchants: [
      { merchant: 'Costco', total: 234.56 },
      { merchant: 'Amazon', total: 180.00 },
    ],
    monthOverMonth: {
      previousTotal: 2100.00,
      difference: 245.67,
      percentageChange: 11.7,
    },
    budgetSummary: {
      totalBudgeted: 3000.00,
      totalSpent: 2345.67,
      utilizationPercentage: 78.2,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show loading state initially', () => {
    getMonthlySummary.mockImplementation(() => new Promise(() => {}));
    render(<MonthlySummaryView year={2025} month={1} />);
    expect(screen.getByText('Loading monthly summary...')).toBeInTheDocument();
  });

  it('should render with full data', async () => {
    getMonthlySummary.mockResolvedValue(fullData);
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading monthly summary...')).not.toBeInTheDocument();
    });

    // Total spending (appears in total card and budget spent)
    expect(screen.getAllByText(/2345\.67/).length).toBeGreaterThanOrEqual(1);
    // Month label
    expect(screen.getByText(/January 2025/)).toBeInTheDocument();
    // Top categories
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    // Top merchants
    expect(screen.getByText('Costco')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    // Section titles
    expect(screen.getByText('Top Categories')).toBeInTheDocument();
    expect(screen.getByText('Top Merchants')).toBeInTheDocument();
  });

  it('should show error state with retry button', async () => {
    getMonthlySummary.mockRejectedValueOnce(new Error('Network error'));
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load monthly summary. Please try again.')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Retry should re-fetch
    getMonthlySummary.mockResolvedValue(fullData);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });
    expect(getMonthlySummary).toHaveBeenCalledTimes(2);
  });

  it('should show empty state when no data', async () => {
    getMonthlySummary.mockResolvedValue({
      totalSpending: 0,
      topCategories: [],
      topMerchants: [],
      monthOverMonth: null,
      budgetSummary: null,
    });
    render(<MonthlySummaryView year={2025} month={3} />);

    await waitFor(() => {
      expect(screen.getByText(/No spending data available for March 2025/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Start adding expenses/)).toBeInTheDocument();
  });

  it('should display month-over-month comparison', async () => {
    getMonthlySummary.mockResolvedValue(fullData);
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Month-over-Month')).toBeInTheDocument();
    });
    expect(screen.getByText('Previous Month')).toBeInTheDocument();
    expect(screen.getByText('Difference')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
    // Percentage change
    expect(screen.getByText(/11\.7%/)).toBeInTheDocument();
  });

  it('should hide month-over-month when null', async () => {
    getMonthlySummary.mockResolvedValue({
      ...fullData,
      monthOverMonth: null,
    });
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });
    expect(screen.queryByText('Month-over-Month')).not.toBeInTheDocument();
  });

  it('should display budget summary with utilization', async () => {
    getMonthlySummary.mockResolvedValue(fullData);
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Budget Summary')).toBeInTheDocument();
    });
    expect(screen.getByText('Budgeted')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Utilization')).toBeInTheDocument();
    expect(screen.getByText(/78\.2%/)).toBeInTheDocument();
  });

  it('should hide budget summary when null', async () => {
    getMonthlySummary.mockResolvedValue({
      ...fullData,
      budgetSummary: null,
    });
    render(<MonthlySummaryView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });
    expect(screen.queryByText('Budget Summary')).not.toBeInTheDocument();
  });

  it('should call getMonthlySummary with correct year and month', async () => {
    getMonthlySummary.mockResolvedValue(fullData);
    render(<MonthlySummaryView year={2024} month={12} />);

    await waitFor(() => {
      expect(getMonthlySummary).toHaveBeenCalledWith(2024, 12);
    });
  });
});
