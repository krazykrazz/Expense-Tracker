import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBankAccountLinks } from './useBankAccountLinks';
import { getPlaidStatus, getBankConnections } from '../services/plaidApi';

vi.mock('../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  getBankConnections: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

const items = [
  {
    id: 1, institutionName: 'Wealthsimple', accounts: [
      { id: 10, name: 'Chequing', mask: '5070', paymentMethodId: 2 },
      { id: 11, name: 'Savings', mask: '9999', paymentMethodId: null }
    ]
  },
  { id: 2, institutionName: 'RBC', accounts: [{ id: 20, name: 'Visa', mask: '1111', paymentMethodId: 2 }] }
];

describe('useBankAccountLinks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never calls the bank endpoints while Plaid is not configured', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: false });

    const { result } = renderHook(() => useBankAccountLinks());

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(getBankConnections).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('groups mapped accounts by payment method and skips unmapped ones', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true });
    getBankConnections.mockResolvedValue({ items });

    const { result } = renderHook(() => useBankAccountLinks());

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(2)).toEqual([
      { institutionName: 'Wealthsimple', accountName: 'Chequing', mask: '5070' },
      { institutionName: 'RBC', accountName: 'Visa', mask: '1111' }
    ]);
  });

  it('yields no links when loading fails, and reloads when Plaid settings change', async () => {
    getPlaidStatus.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useBankAccountLinks());
    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);

    getPlaidStatus.mockResolvedValue({ enabled: true });
    getBankConnections.mockResolvedValue({ items });
    act(() => { window.dispatchEvent(new CustomEvent('plaid-settings-changed')); });

    await waitFor(() => expect(result.current.size).toBe(1));
  });
});
