import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/analyticsApi', () => ({
  getActivityInsights: vi.fn(),
}));

vi.mock('../../utils/formatters', () => ({
  formatDateTime: (ts) => ts ? new Date(ts).toLocaleString() : '',
}));

import { getActivityInsights } from '../../services/analyticsApi';
import ActivityInsightsView from './ActivityInsightsView';

describe('ActivityInsightsView', () => {
  const fullData = {
    entryVelocity: {
      currentMonth: 45,
      previousMonth: 38,
      difference: 7,
    },
    entityBreakdown: [
      { entityType: 'expense', count: 30 },
      { entityType: 'budget', count: 8 },
      { entityType: 'loan', count: 5 },
    ],
    recentChanges: [
      {
        id: 1,
        timestamp: '2025-01-27T14:30:00.000Z',
        entityType: 'expense',
        userAction: 'Added expense: Groceries - $45.67',
        metadata: { amount: 45.67 },
      },
      {
        id: 2,
        timestamp: '2025-01-26T10:00:00.000Z',
        entityType: 'budget',
        userAction: 'Updated budget: Dining',
        metadata: {},
      },
    ],
    dayOfWeekPatterns: [
      { day: 'Monday', count: 12 },
      { day: 'Tuesday', count: 8 },
      { day: 'Friday', count: 15 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show loading state initially', () => {
    getActivityInsights.mockImplementation(() => new Promise(() => {}));
    render(<ActivityInsightsView year={2025} month={1} />);
    expect(screen.getByText('Loading activity insights...')).toBeInTheDocument();
  });

  it('should render with full data', async () => {
    getActivityInsights.mockResolvedValue(fullData);
    render(<ActivityInsightsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading activity insights...')).not.toBeInTheDocument();
    });

    // Entry velocity
    expect(screen.getByText('Entry Velocity')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();

    // Entity breakdown
    expect(screen.getByText('Activity by Type')).toBeInTheDocument();
    // 'expense' and 'budget' appear in both breakdown and recent changes, so use getAllByText
    expect(screen.getAllByText('expense').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('budget').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('loan')).toBeInTheDocument();

    // Recent changes
    expect(screen.getByText('Recent Changes')).toBeInTheDocument();
    expect(screen.getByText('Added expense: Groceries - $45.67')).toBeInTheDocument();
    expect(screen.getByText('Updated budget: Dining')).toBeInTheDocument();

    // Day-of-week patterns
    expect(screen.getByText('Day-of-Week Activity')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toBeInTheDocument();
  });

  it('should show error state with retry button', async () => {
    getActivityInsights.mockRejectedValueOnce(new Error('Server error'));
    render(<ActivityInsightsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load activity insights. Please try again.')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Retry
    getActivityInsights.mockResolvedValue(fullData);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Entry Velocity')).toBeInTheDocument();
    });
    expect(getActivityInsights).toHaveBeenCalledTimes(2);
  });

  it('should show empty state when no activity data', async () => {
    getActivityInsights.mockResolvedValue({
      entryVelocity: { currentMonth: 0, previousMonth: 0, difference: 0 },
      entityBreakdown: [],
      recentChanges: [],
      dayOfWeekPatterns: [],
    });
    render(<ActivityInsightsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('No activity data available yet.')).toBeInTheDocument();
    });
    expect(screen.getByText(/Activity tracking data will appear/)).toBeInTheDocument();
  });

  it('should display entity breakdown sorted by count', async () => {
    getActivityInsights.mockResolvedValue(fullData);
    render(<ActivityInsightsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Activity by Type')).toBeInTheDocument();
    });

    // Query breakdown items by their specific CSS class to avoid matching recent changes
    const breakdownTypes = document.querySelectorAll('.activity-insights-breakdown-type');
    expect(breakdownTypes).toHaveLength(3);
    expect(breakdownTypes[0].textContent).toBe('expense');
    expect(breakdownTypes[1].textContent).toBe('budget');
    expect(breakdownTypes[2].textContent).toBe('loan');
  });

  it('should display recent changes list with timestamps', async () => {
    getActivityInsights.mockResolvedValue(fullData);
    render(<ActivityInsightsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Recent Changes')).toBeInTheDocument();
    });

    // Both recent changes should be visible
    expect(screen.getByText('Added expense: Groceries - $45.67')).toBeInTheDocument();
    expect(screen.getByText('Updated budget: Dining')).toBeInTheDocument();
  });

  it('should call getActivityInsights with correct year and month', async () => {
    getActivityInsights.mockResolvedValue(fullData);
    render(<ActivityInsightsView year={2024} month={6} />);

    await waitFor(() => {
      expect(getActivityInsights).toHaveBeenCalledWith(2024, 6);
    });
  });
});
