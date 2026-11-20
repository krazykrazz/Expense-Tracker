import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBankAccountLinks } from './useBankAccountLinks';
import { useInvestmentBankLinks } from './useInvestmentBankLinks';
import { getPlaidStatus, getBankConnections } from '../services/plaidApi';

vi.mock('../services/plaidApi', () => ({
  getPlaidStatus: vi.fn(),
  getBankConnections: vi.fn(),
  PLAID_SETTINGS_CHANGED_EVENT: 'plaid-settings-changed',
}));

const items = [
  {
    id: 1, institutionName: 'Wealthsimple', status: 'stale', bankUpdatedAt: '2026-11-03T21:11:14Z', accounts: [
      { id: 10, name: 'Chequing', mask: '5070', type: 'depository', paymentMethodId: 2, currentBalance: 700.52, availableBalance: null, balanceCurrency: 'CAD', balanceAsOf: '2026-11-08T17:10:00.993Z' },
      { id: 11, name: 'Savings', mask: '9999', paymentMethodId: null, currentBalance: 5 }
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

  it('groups mapped accounts by payment method and skips unmapped ones, carrying the stored balance', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true });
    getBankConnections.mockResolvedValue({ items });

    const { result } = renderHook(() => useBankAccountLinks());

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get(2)).toEqual([
      {
        institutionName: 'Wealthsimple', accountName: 'Chequing', mask: '5070', accountType: 'depository',
        currentBalance: 700.52, availableBalance: null, balanceCurrency: 'CAD', balanceAsOf: '2026-11-08T17:10:00.993Z',
        bankStatus: 'stale', bankUpdatedAt: '2026-11-03T21:11:14Z'
      },
      {
        institutionName: 'RBC', accountName: 'Visa', mask: '1111', accountType: null,
        currentBalance: null, availableBalance: null, balanceCurrency: null, balanceAsOf: null,
        bankStatus: 'ok', bankUpdatedAt: null
      }
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

describe('useInvestmentBankLinks (spec 4.1a)', () => {
  beforeEach(() => vi.clearAllMocks());

  const investmentItems = [
    {
      id: 1, institutionName: 'Wealthsimple', status: 'ok', bankUpdatedAt: '2026-11-20T10:31:09Z', accounts: [
        { id: 1, name: 'RRSP', mask: '3B49', type: 'investment', subtype: 'rrsp', investmentId: 5, paymentMethodId: null, currentBalance: 186331.54567054, balanceCurrency: 'CAD', balanceAsOf: '2026-11-20T11:14:43.695Z' },
        { id: 2, name: 'RRSP', mask: 'C649', type: 'investment', subtype: 'rrsp', investmentId: 5, paymentMethodId: null, currentBalance: 0, balanceCurrency: 'CAD', balanceAsOf: '2026-11-20T11:14:43.714Z' },
        { id: 3, name: 'Spousal RRSP', mask: 'X140', type: 'investment', investmentId: 6, currentBalance: 92280.32 },
        { id: 4, name: 'RESP', mask: 'FCQ3', type: 'investment', investmentId: null, paymentMethodId: null, currentBalance: 8117.07 },
        { id: 5, name: 'Shared', mask: '5070', type: 'depository', paymentMethodId: 8, investmentId: null, currentBalance: 725.87 }
      ]
    }
  ];

  it('groups the accounts by the investment they are linked to, leaving out unlinked and payment-method accounts', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true });
    getBankConnections.mockResolvedValue({ items: investmentItems });

    const { result } = renderHook(() => useInvestmentBankLinks());

    await waitFor(() => expect(result.current.size).toBe(2));
    expect([...result.current.keys()]).toEqual([5, 6]);
    expect(result.current.get(5).map(link => link.mask)).toEqual(['3B49', 'C649']);
    expect(result.current.get(5)[0]).toEqual({
      institutionName: 'Wealthsimple', accountName: 'RRSP', mask: '3B49', accountType: 'investment',
      currentBalance: 186331.54567054, availableBalance: null, balanceCurrency: 'CAD', balanceAsOf: '2026-11-20T11:14:43.695Z',
      bankStatus: 'ok', bankUpdatedAt: '2026-11-20T10:31:09Z'
    });
  });

  it('never calls the bank endpoints while Plaid is not configured', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: false });

    const { result } = renderHook(() => useInvestmentBankLinks());

    await waitFor(() => expect(getPlaidStatus).toHaveBeenCalled());
    expect(getBankConnections).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('reloads on a sync event so a linked balance stays current', async () => {
    getPlaidStatus.mockResolvedValue({ enabled: true });
    getBankConnections.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useInvestmentBankLinks());
    await waitFor(() => expect(getBankConnections).toHaveBeenCalledTimes(1));
    expect(result.current.size).toBe(0);

    getBankConnections.mockResolvedValue({ items: investmentItems });
    act(() => { window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType: 'plaid' } })); });

    await waitFor(() => expect(result.current.size).toBe(2));
  });
});
