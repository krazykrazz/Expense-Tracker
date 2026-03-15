import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/analyticsApi', () => ({
  getTrends: vi.fn(),
}));

vi.mock('../../utils/formatters', () => ({
  formatCurrency: (val) => parseFloat(val || 0).toFixed(2),
  getMonthNameShort: (m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] || '',
}));

import { getTrends } from '../../services/analyticsApi';
import TrendsView from './TrendsView';

describe('TrendsView', () => {
  const fullData = {
    prediction: {
      predictedTotal: 2500.00,
      confidenceLevel: 'medium',
      currentSpent: 1800.00,
      daysRemaining: 8,
    },
    monthlyHistory: [
      { year: 2025, month: 1, total: 2345.67 },
      { year: 2024, month: 12, total: 2100.00 },
      { year: 2024, month: 11, total: 1950.00 },
    ],
    recurringPatterns: [
      { merchant: 'Netflix', frequency: 'monthly', averageAmount: 15.99, occurrences: 6 },
      { merchant: 'Spotify', frequency: 'monthly', averageAmount: 9.99, occurrences: 5 },
    ],
    dataSufficiency: {
      prediction: true,
      monthlyHistory: true,
      recurringPatterns: true,
    },
    dataQuality: {
      score: 85,
      monthsOfData: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show loading state initially', () => {
    getTrends.mockImplementation(() => new Promise(() => {}));
    render(<TrendsView year={2025} month={1} />);
    expect(screen.getByText('Loading trends...')).toBeInTheDocument();
  });

  it('should render with full data', async () => {
    getTrends.mockResolvedValue(fullData);
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading trends...')).not.toBeInTheDocument();
    });

    // Prediction
    expect(screen.getByText('End-of-Month Prediction')).toBeInTheDocument();
    expect(screen.getByText(/2500\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Medium confidence/)).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();

    // Monthly history
    expect(screen.getByText('Spending History')).toBeInTheDocument();
    expect(screen.getByText(/Jan 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Dec 2024/)).toBeInTheDocument();

    // Recurring patterns
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('6x')).toBeInTheDocument();
    expect(screen.getByText('5x')).toBeInTheDocument();

    // Data quality
    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('10 months of data')).toBeInTheDocument();
  });

  it('should hide prediction when dataSufficiency.prediction is false', async () => {
    getTrends.mockResolvedValue({
      ...fullData,
      prediction: null,
      dataSufficiency: { ...fullData.dataSufficiency, prediction: false },
    });
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Spending History')).toBeInTheDocument();
    });
    expect(screen.queryByText('End-of-Month Prediction')).not.toBeInTheDocument();
  });

  it('should hide monthly history when dataSufficiency.monthlyHistory is false', async () => {
    getTrends.mockResolvedValue({
      ...fullData,
      monthlyHistory: null,
      dataSufficiency: { ...fullData.dataSufficiency, monthlyHistory: false },
    });
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('End-of-Month Prediction')).toBeInTheDocument();
    });
    expect(screen.queryByText('Spending History')).not.toBeInTheDocument();
  });

  it('should hide recurring patterns when dataSufficiency.recurringPatterns is false', async () => {
    getTrends.mockResolvedValue({
      ...fullData,
      recurringPatterns: null,
      dataSufficiency: { ...fullData.dataSufficiency, recurringPatterns: false },
    });
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('End-of-Month Prediction')).toBeInTheDocument();
    });
    expect(screen.queryByText('Recurring Patterns')).not.toBeInTheDocument();
  });

  it('should show full empty state when all dataSufficiency flags are false', async () => {
    getTrends.mockResolvedValue({
      prediction: null,
      monthlyHistory: null,
      recurringPatterns: null,
      dataSufficiency: {
        prediction: false,
        monthlyHistory: false,
        recurringPatterns: false,
      },
      dataQuality: { score: 10, monthsOfData: 1 },
    });
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Not enough data to display trends yet.')).toBeInTheDocument();
    });
    expect(screen.getByText(/Continue tracking expenses/)).toBeInTheDocument();
    // Data quality should still show
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('should display data quality indicator', async () => {
    getTrends.mockResolvedValue(fullData);
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Data Quality')).toBeInTheDocument();
    });
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('10 months of data')).toBeInTheDocument();
  });

  it('should show error state with retry', async () => {
    getTrends.mockRejectedValueOnce(new Error('API error'));
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load trends data. Please try again.')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    getTrends.mockResolvedValue(fullData);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('End-of-Month Prediction')).toBeInTheDocument();
    });
  });

  it('should show empty state when data is null', async () => {
    getTrends.mockResolvedValue(null);
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('No trends data available.')).toBeInTheDocument();
    });
  });

  it('should handle singular month text', async () => {
    getTrends.mockResolvedValue({
      ...fullData,
      dataQuality: { score: 50, monthsOfData: 1 },
    });
    render(<TrendsView year={2025} month={1} />);

    await waitFor(() => {
      expect(screen.getByText('1 month of data')).toBeInTheDocument();
    });
  });
});
