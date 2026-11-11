import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/apiClient.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  logApiError: vi.fn()
}));

import { apiGet } from '../utils/apiClient.js';
import { getPlaidStatus } from './plaidApi';

describe('getPlaidStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
  });
  // Each test ends its task, so the next one never joins a request from a previous test
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('shares one request between callers in the same task', async () => {
    apiGet.mockResolvedValue({ enabled: true, toReview: 2 });

    const results = await Promise.all([getPlaidStatus(), getPlaidStatus(), getPlaidStatus({ signal: new AbortController().signal })]);

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ enabled: true, toReview: 2 }, { enabled: true, toReview: 2 }, { enabled: true, toReview: 2 }]);
  });

  it('asks again in a later task: an earlier request may predate the change being reacted to', async () => {
    apiGet.mockResolvedValueOnce({ enabled: true, toReview: 1 }).mockResolvedValueOnce({ enabled: true, toReview: 4 });

    const first = getPlaidStatus();
    vi.runAllTimers();
    const second = getPlaidStatus();

    expect(await first).toEqual({ enabled: true, toReview: 1 });
    expect(await second).toEqual({ enabled: true, toReview: 4 });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("aborting one caller's signal rejects only that caller", async () => {
    let resolve;
    apiGet.mockReturnValue(new Promise(r => { resolve = r; }));
    const controller = new AbortController();

    const aborted = getPlaidStatus({ signal: controller.signal });
    const other = getPlaidStatus();
    controller.abort();
    resolve({ enabled: true });

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await expect(other).resolves.toEqual({ enabled: true });
  });

  it('rejects at once for a signal already aborted, without a request', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(getPlaidStatus({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('a failed request is not reused by the next task', async () => {
    apiGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ enabled: false });

    await expect(getPlaidStatus()).rejects.toThrow('offline');
    vi.runAllTimers();
    await expect(getPlaidStatus()).resolves.toEqual({ enabled: false });
  });
});
