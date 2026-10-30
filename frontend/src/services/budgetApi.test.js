import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/apiClient.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  logApiError: vi.fn(),
}));

import { apiGet, apiPost } from '../utils/apiClient.js';
import { API_ENDPOINTS } from '../config.js';
import { savePlannedSavingsFromPreviousMonth } from './budgetApi';

describe('savePlannedSavingsFromPreviousMonth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPost.mockResolvedValue({ copied: 2, skipped: 0, overwritten: 0 });
  });

  it('stores carried-forward allocations from the previous month without overwriting', async () => {
    apiGet.mockResolvedValue({ allocations: [{ name: 'TFSA', amount: 100, carriedForward: true }] });

    const result = await savePlannedSavingsFromPreviousMonth(2025, 1);

    expect(apiPost).toHaveBeenCalledWith(
      API_ENDPOINTS.BUDGET_ALLOCATIONS_COPY,
      { sourceYear: 2024, sourceMonth: 12, targetYear: 2025, targetMonth: 1, overwrite: false },
      'copy allocations'
    );
    expect(result).toEqual({ copied: 2, skipped: 0, overwritten: 0 });
  });

  it.each([
    ['the month has its own allocations', [{ id: 1, name: 'TFSA', amount: 100 }]],
    ['nothing is planned', []],
  ])('does nothing when %s', async (_, allocations) => {
    apiGet.mockResolvedValue({ allocations });

    expect(await savePlannedSavingsFromPreviousMonth(2025, 3)).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
