import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/apiClient.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  logApiError: vi.fn()
}));

import { apiGet, apiPost, apiDelete, logApiError } from '../utils/apiClient.js';
import { getSplitCandidates, splitBankTransaction, removeSplitExpense } from './plaidApi';

beforeEach(() => vi.clearAllMocks());

describe('split charge endpoints (spec 3.9)', () => {
  it('asks for the expenses a charge could be split across, passing the abort signal', async () => {
    apiGet.mockResolvedValue({ candidates: [] });
    const { signal } = new AbortController();

    const result = await getSplitCandidates(7, { signal });

    expect(result).toEqual({ candidates: [] });
    expect(apiGet).toHaveBeenCalledWith(expect.stringMatching(/\/api\/plaid\/transactions\/7\/split-candidates$/), expect.any(String), { signal });
  });

  it('links a charge to expenses with their ids', async () => {
    apiPost.mockResolvedValue({ complete: true });

    await splitBankTransaction(7, [1, 2]);

    expect(apiPost).toHaveBeenCalledWith(expect.stringMatching(/\/api\/plaid\/transactions\/7\/split$/), { expenseIds: [1, 2] }, expect.any(String));
  });

  it('takes an expense out of a split charge', async () => {
    apiDelete.mockResolvedValue({});

    await removeSplitExpense(7, 2);

    expect(apiDelete).toHaveBeenCalledWith(expect.stringMatching(/\/api\/plaid\/transactions\/7\/split\/2$/), expect.any(String));
  });

  it('logs and rethrows a failure, except an abort', async () => {
    apiPost.mockRejectedValue(new Error('The expenses add up to $284.02 but the charge is $326.49'));
    await expect(splitBankTransaction(7, [1, 2])).rejects.toThrow('add up to');
    expect(logApiError).toHaveBeenCalledTimes(1);

    apiGet.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(getSplitCandidates(7)).rejects.toMatchObject({ name: 'AbortError' });
    expect(logApiError).toHaveBeenCalledTimes(1);
  });
});
