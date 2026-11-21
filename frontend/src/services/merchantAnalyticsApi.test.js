import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, logApiError } from '../utils/apiClient';
import {
  getMerchantDetails,
  getMerchantExpenses,
  getMerchantTrend,
  getPeriodDisplayName,
  getSortByDisplayName,
  getTopMerchants,
  isValidPeriod,
  isValidSortBy
} from './merchantAnalyticsApi';

vi.mock('../utils/apiClient', () => ({
  apiGet: vi.fn(),
  logApiError: vi.fn()
}));

vi.mock('../config.js', () => ({
  API_ENDPOINTS: {
    MERCHANT_ANALYTICS: '/api/analytics/merchants',
    MERCHANT_DETAILS: (name) => `/api/analytics/merchants/${encodeURIComponent(name)}`,
    MERCHANT_TREND: (name) => `/api/analytics/merchants/${encodeURIComponent(name)}/trend`,
    MERCHANT_EXPENSES: (name) => `/api/analytics/merchants/${encodeURIComponent(name)}/expenses`
  }
}));

describe('merchantAnalyticsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue([]);
  });

  it('builds the top-merchants query with all filters', async () => {
    await getTopMerchants('3months', 'average', true, { year: 2026, month: 3 });

    expect(apiGet).toHaveBeenCalledWith(
      '/api/analytics/merchants?period=3months&sortBy=average&includeFixedExpenses=true&year=2026&month=3',
      'fetch top merchants'
    );
  });

  it('encodes merchant names for detail, trend, and expense requests', async () => {
    await getMerchantDetails('Café & Co', 'month', true, { year: 2026, month: 1 });
    await getMerchantTrend('Café & Co', 6, false);
    await getMerchantExpenses('Café & Co', 'all', true, { year: 2025 });

    expect(apiGet).toHaveBeenNthCalledWith(
      1,
      '/api/analytics/merchants/Caf%C3%A9%20%26%20Co?period=month&includeFixedExpenses=true&year=2026&month=1',
      'fetch merchant details'
    );
    expect(apiGet).toHaveBeenNthCalledWith(
      2,
      '/api/analytics/merchants/Caf%C3%A9%20%26%20Co/trend?months=6&includeFixedExpenses=false',
      'fetch merchant trend'
    );
    expect(apiGet).toHaveBeenNthCalledWith(
      3,
      '/api/analytics/merchants/Caf%C3%A9%20%26%20Co/expenses?period=all&includeFixedExpenses=true&year=2025',
      'fetch merchant expenses'
    );
  });

  it('logs and rethrows request errors', async () => {
    const error = new Error('request failed');
    apiGet.mockRejectedValue(error);

    await expect(getTopMerchants()).rejects.toBe(error);
    expect(logApiError).toHaveBeenCalledWith('fetching top merchants', error);
  });

  it.each(['all', 'year', 'previousYear', 'month', '3months'])(
    'accepts the %s period',
    (period) => expect(isValidPeriod(period)).toBe(true)
  );

  it('rejects unknown periods and sort criteria', () => {
    expect(isValidPeriod('week')).toBe(false);
    expect(isValidSortBy('category')).toBe(false);
    expect(getPeriodDisplayName('week')).toBe('week');
    expect(getSortByDisplayName('category')).toBe('category');
  });
});
