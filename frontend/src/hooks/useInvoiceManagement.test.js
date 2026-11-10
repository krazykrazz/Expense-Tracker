import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import useInvoiceManagement from './useInvoiceManagement';
import * as invoiceApi from '../services/invoiceApi';
import { notifyInvoicesChanged } from '../utils/invoiceEvents';

vi.mock('../services/invoiceApi');

const receipt = { id: 7, filename: 'receipt.pdf' };
const expenses = [
  { id: 1, type: 'Tax - Medical' },
  { id: 2, type: 'Tax - Medical' }
];

describe('useInvoiceManagement - receipts changed elsewhere', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoiceApi.getInvoicesForExpense).mockResolvedValue([]);
  });

  it('reloads one expense when its receipts change in the expense form', async () => {
    const { result } = renderHook(() => useInvoiceManagement({ expenses }));
    await waitFor(() => expect(result.current.invoiceCache.get(1)).toEqual([]));
    await waitFor(() => expect(result.current.invoiceCache.get(2)).toEqual([]));
    expect(invoiceApi.getInvoicesForExpense).toHaveBeenCalledTimes(2);

    vi.mocked(invoiceApi.getInvoicesForExpense).mockResolvedValue([receipt]);
    act(() => notifyInvoicesChanged(1));

    await waitFor(() => expect(result.current.invoiceCache.get(1)).toEqual([receipt]));
    expect(result.current.invoiceCache.get(2)).toEqual([]);
    expect(invoiceApi.getInvoicesForExpense).toHaveBeenCalledTimes(3);
    expect(invoiceApi.getInvoicesForExpense).toHaveBeenLastCalledWith(1);
  });

  it('reloads every expense when receipts change in another tab', async () => {
    const { result } = renderHook(() => useInvoiceManagement({ expenses }));
    await waitFor(() => expect(result.current.invoiceCache.size).toBe(2));

    vi.mocked(invoiceApi.getInvoicesForExpense).mockResolvedValue([receipt]);
    act(() => notifyInvoicesChanged());

    await waitFor(() => {
      expect(result.current.invoiceCache.get(1)).toEqual([receipt]);
      expect(result.current.invoiceCache.get(2)).toEqual([receipt]);
    });
  });
});
