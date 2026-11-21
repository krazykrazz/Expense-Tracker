import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../config';
import { authAwareFetch } from '../utils/fetchProvider';

describe('frontend test network isolation', () => {
  it('uses a reserved test-only API origin', () => {
    expect(API_ENDPOINTS.EXPENSES).toBe(
      'http://expense-tracker.test.invalid/api/expenses'
    );
  });

  it('rejects an unmocked request before it can reach a network service', async () => {
    await expect(fetch('/api/expenses')).rejects.toThrow(
      'Network access is disabled in frontend tests; mock this request: /api/expenses'
    );
  });

  it('blocks the fetch captured by the application fetch provider', async () => {
    const url = 'http://expense-tracker.test.invalid/api/expenses';

    await expect(authAwareFetch(url)).rejects.toThrow(
      `Network access is disabled in frontend tests; mock this request: ${url}`
    );
  });
});
