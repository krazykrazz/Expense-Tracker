import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/apiClient.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  logApiError: vi.fn()
}));

import { apiPost } from '../utils/apiClient.js';
import { matchInboxTransactionToFixed } from './plaidApi';

beforeEach(() => vi.clearAllMocks());

describe('confirming a fixed expense (spec 3.5)', () => {
  const url = expect.stringMatching(/\/api\/plaid\/inbox\/7\/match-fixed$/);

  it('sends only the fixed expense unless a loan payment is asked for', async () => {
    apiPost.mockResolvedValue({});

    await matchInboxTransactionToFixed(7, 9);
    await matchInboxTransactionToFixed(7, 9, { loanPayment: 'none' });

    expect(apiPost).toHaveBeenNthCalledWith(1, url, { fixedExpenseId: 9 }, expect.any(String));
    expect(apiPost).toHaveBeenNthCalledWith(2, url, { fixedExpenseId: 9 }, expect.any(String));
  });

  it('adds the loan payment to record or link', async () => {
    apiPost.mockResolvedValue({});

    await matchInboxTransactionToFixed(7, 9, { loanPayment: 'log' });
    await matchInboxTransactionToFixed(7, 9, { loanPayment: 'link', loanPaymentId: 41 });

    expect(apiPost).toHaveBeenNthCalledWith(1, url, { fixedExpenseId: 9, loanPayment: 'log' }, expect.any(String));
    expect(apiPost).toHaveBeenNthCalledWith(2, url, { fixedExpenseId: 9, loanPayment: 'link', loanPaymentId: 41 }, expect.any(String));
  });
});
