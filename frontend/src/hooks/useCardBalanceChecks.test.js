import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCardBalanceChecks } from './useCardBalanceChecks';
import { getPlaidStatus, getCardBalanceChecks } from '../services/plaidApi';

vi.mock('../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  getCardBalanceChecks: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

describe('useCardBalanceChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlaidStatus.mockResolvedValue({ enabled: true });
  });

  it('maps checks by payment method, and reloads on card and bank sync events and a new refresh key', async () => {
    getCardBalanceChecks.mockResolvedValue({ cards: [{ paymentMethodId: 4, status: 'match' }] });
    const { result, rerender } = renderHook(({ key }) => useCardBalanceChecks(key), { initialProps: { key: 1 } });

    await waitFor(() => expect(result.current.get(4)).toEqual({ paymentMethodId: 4, status: 'match' }));

    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'credit_card' } })); });
    await waitFor(() => expect(getCardBalanceChecks).toHaveBeenCalledTimes(2));

    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });
    await waitFor(() => expect(getCardBalanceChecks).toHaveBeenCalledTimes(3));

    rerender({ key: 2 });
    await waitFor(() => expect(getCardBalanceChecks).toHaveBeenCalledTimes(4));
  });

  it('makes no requests while disabled, and loads once enabled', async () => {
    getCardBalanceChecks.mockResolvedValue({ cards: [{ paymentMethodId: 4, status: 'match' }] });
    const { result, rerender } = renderHook(({ enabled }) => useCardBalanceChecks(null, enabled), { initialProps: { enabled: false } });

    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });
    expect(getPlaidStatus).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.get(4)).toEqual({ paymentMethodId: 4, status: 'match' }));
  });

  it('is empty without Plaid, and when the request fails', async () => {
    getPlaidStatus.mockResolvedValueOnce({ enabled: false });
    const { result } = renderHook(() => useCardBalanceChecks());
    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(getCardBalanceChecks).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);

    getCardBalanceChecks.mockRejectedValueOnce(new Error('offline'));
    act(() => { window.dispatchEvent(new CustomEvent('plaid-settings-changed')); });
    await waitFor(() => expect(getCardBalanceChecks).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });
});
