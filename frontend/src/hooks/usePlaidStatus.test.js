import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePlaidStatus, banksNeedingAttention, banksWithStaleData } from './usePlaidStatus';
import { getPlaidStatus } from '../services/plaidApi';

vi.mock('../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

describe('usePlaidStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the status, and is null when the request fails', async () => {
    getPlaidStatus.mockResolvedValueOnce({ enabled: true });
    const { result } = renderHook(() => usePlaidStatus());
    await waitFor(() => expect(result.current[0]).toEqual({ enabled: true }));

    getPlaidStatus.mockRejectedValueOnce(new Error('offline'));
    act(() => { window.dispatchEvent(new CustomEvent('plaid-settings-changed')); });
    await waitFor(() => expect(result.current[0]).toBeNull());
  });

  it('reloads on plaid sync events', async () => {
    getPlaidStatus.mockResolvedValueOnce({ enabled: true, needsAttention: [] });
    const { result } = renderHook(() => usePlaidStatus());
    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalledTimes(1));

    const flagged = { enabled: true, needsAttention: [{ id: 1, institutionName: 'CIBC', status: 'needs_login' }] };
    getPlaidStatus.mockResolvedValueOnce(flagged);
    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });

    await waitFor(() => expect(result.current[0]).toEqual(flagged));
  });
});

describe('banksNeedingAttention', () => {
  it('is empty without Plaid or without a status', () => {
    expect(banksNeedingAttention(null)).toEqual([]);
    expect(banksNeedingAttention({ enabled: false, needsAttention: [{ id: 1 }] })).toEqual([]);
    expect(banksNeedingAttention({ enabled: true })).toEqual([]);
  });

  it('returns the flagged banks', () => {
    const banks = [{ id: 1, institutionName: 'CIBC', status: 'gone' }];
    expect(banksNeedingAttention({ enabled: true, needsAttention: banks })).toBe(banks);
  });
});

describe('banksWithStaleData', () => {
  it('is empty without Plaid or without the list (an older server)', () => {
    expect(banksWithStaleData(null)).toEqual([]);
    expect(banksWithStaleData({ enabled: false, staleData: [{ id: 1 }] })).toEqual([]);
    expect(banksWithStaleData({ enabled: true, needsAttention: [] })).toEqual([]);
  });

  it('returns the banks Plaid has had no new data from', () => {
    const banks = [{ id: 1, institutionName: 'Wealthsimple', bankUpdatedAt: '2026-11-03T21:11:14Z' }];
    expect(banksWithStaleData({ enabled: true, staleData: banks })).toBe(banks);
  });
});