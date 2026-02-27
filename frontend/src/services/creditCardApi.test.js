/**
 * Unit tests for creditCardApi after migration to apiClient.
 * Verifies that all operations correctly delegate to apiClient methods
 * and that error wrapping, retry integration, and custom operations work as expected.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}));

// Mock apiClient — ApiError must be defined inline since vi.mock is hoisted
vi.mock('../utils/apiClient', () => {
  class ApiError extends Error {
    constructor(message, status, data = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  }
  return {
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiDelete: vi.fn(),
    ApiError
  };
});

// Mock fetchWithRetry
vi.mock('../utils/fetchWithRetry', () => ({
  fetchWithRetry: vi.fn(),
  apiGetWithRetry: vi.fn()
}));

// Mock fetchProvider
vi.mock('../utils/fetchProvider', () => ({
  getFetchFn: vi.fn()
}));

// Mock tabId
vi.mock('../utils/tabId', () => ({
  TAB_ID: 'test-tab-id'
}));

import { apiPost, apiDelete, ApiError } from '../utils/apiClient';
import { fetchWithRetry, apiGetWithRetry } from '../utils/fetchWithRetry';
import { getFetchFn } from '../utils/fetchProvider';
import {
  recordPayment,
  getPayments,
  deletePayment,
  getTotalPayments,
  uploadStatement,
  getStatements,
  downloadStatement,
  deleteStatement,
  getBillingCycles,
  createBillingCycle,
  getBillingCycleHistory,
  updateBillingCycle,
  deleteBillingCycle,
  getCurrentCycleStatus,
  recalculateCycleBalance,
  getStatementBalance,
  getCreditCardDetail,
  getUnifiedBillingCycles
} from './creditCardApi';

describe('creditCardApi — GET operations (apiGetWithRetry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('getPayments calls apiGetWithRetry and returns payments array', async () => {
    const mockData = { payments: [{ id: 1, amount: 100 }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getPayments(5, { startDate: '2025-01-01', endDate: '2025-01-31' });

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/payments');
    expect(url).toContain('startDate=2025-01-01');
    expect(url).toContain('endDate=2025-01-31');
    expect(operation).toBe('fetch payments');
    expect(result).toEqual([{ id: 1, amount: 100 }]);
  });

  test('getPayments returns empty array when payments is missing', async () => {
    apiGetWithRetry.mockResolvedValue({});
    const result = await getPayments(5);
    expect(result).toEqual([]);
  });

  test('getPayments wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('Server error'));
    await expect(getPayments(5)).rejects.toThrow('Unable to load payments: Server error');
  });

  test('getTotalPayments calls apiGetWithRetry with correct URL', async () => {
    const mockData = { totalAmount: 500 };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getTotalPayments(5, '2025-01-01', '2025-01-31');

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/payments/total');
    expect(url).toContain('startDate=2025-01-01');
    expect(operation).toBe('fetch total payments');
    expect(result).toEqual({ totalAmount: 500 });
  });

  test('getTotalPayments wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('timeout'));
    await expect(getTotalPayments(5, '2025-01-01', '2025-01-31')).rejects.toThrow('Unable to load total payments: timeout');
  });

  test('getStatements calls apiGetWithRetry and returns statements array', async () => {
    const mockData = { statements: [{ id: 1, statement_date: '2025-01-15' }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getStatements(5);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/statements');
    expect(operation).toBe('fetch statements');
    expect(result).toEqual([{ id: 1, statement_date: '2025-01-15' }]);
  });

  test('getStatements returns empty array when statements is missing', async () => {
    apiGetWithRetry.mockResolvedValue({});
    const result = await getStatements(5);
    expect(result).toEqual([]);
  });

  test('getStatements wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('Network failure'));
    await expect(getStatements(5)).rejects.toThrow('Unable to load statements: Network failure');
  });

  test('getBillingCycles calls apiGetWithRetry and returns cycles array', async () => {
    const mockData = { cycles: [{ id: 1 }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getBillingCycles(5, 12);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles');
    expect(url).toContain('count=12');
    expect(operation).toBe('fetch billing cycles');
    expect(result).toEqual([{ id: 1 }]);
  });

  test('getBillingCycles omits count param when default (6)', async () => {
    apiGetWithRetry.mockResolvedValue({ cycles: [] });
    await getBillingCycles(5);
    const [, url] = apiGetWithRetry.mock.calls[0];
    expect(url).not.toContain('count=');
  });

  test('getBillingCycles wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getBillingCycles(5)).rejects.toThrow('Unable to load billing cycles: fail');
  });

  test('getBillingCycleHistory calls apiGetWithRetry and returns data', async () => {
    const mockData = { records: [{ id: 1 }], total: 1 };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getBillingCycleHistory(5, { limit: 10, startDate: '2025-01-01' });

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles/history');
    expect(url).toContain('limit=10');
    expect(url).toContain('startDate=2025-01-01');
    expect(operation).toBe('fetch billing cycle history');
    expect(result).toEqual(mockData);
  });

  test('getBillingCycleHistory wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getBillingCycleHistory(5)).rejects.toThrow('Unable to load billing cycle history: fail');
  });

  test('getCurrentCycleStatus calls apiGetWithRetry and returns data', async () => {
    const mockData = { hasActualBalance: false, needsEntry: true };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getCurrentCycleStatus(5);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles/current');
    expect(operation).toBe('fetch current cycle status');
    expect(result).toEqual(mockData);
  });

  test('getCurrentCycleStatus wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getCurrentCycleStatus(5)).rejects.toThrow('Unable to load current cycle status: fail');
  });

  test('recalculateCycleBalance calls apiGetWithRetry and returns calculatedBalance', async () => {
    apiGetWithRetry.mockResolvedValue({ calculatedBalance: 123.45 });

    const result = await recalculateCycleBalance(5, '2025-01-01', '2025-01-31');

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles/recalculate');
    expect(url).toContain('startDate=2025-01-01');
    expect(url).toContain('endDate=2025-01-31');
    expect(operation).toBe('recalculate balance');
    expect(result).toBe(123.45);
  });

  test('recalculateCycleBalance re-throws error directly (no wrapping)', async () => {
    const err = new ApiError('Server error', 500);
    apiGetWithRetry.mockRejectedValue(err);
    await expect(recalculateCycleBalance(5, '2025-01-01', '2025-01-31')).rejects.toBe(err);
  });

  test('getStatementBalance returns nested statementBalance value', async () => {
    apiGetWithRetry.mockResolvedValue({
      statementBalance: { statementBalance: 250.00, cycleStartDate: '2025-01-01' }
    });

    const result = await getStatementBalance(5);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/statement-balance');
    expect(operation).toBe('fetch statement balance');
    expect(result).toBe(250.00);
  });

  test('getStatementBalance returns null when statementBalance is null', async () => {
    apiGetWithRetry.mockResolvedValue({ statementBalance: null });
    const result = await getStatementBalance(5);
    expect(result).toBeNull();
  });

  test('getStatementBalance wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getStatementBalance(5)).rejects.toThrow('Unable to load statement balance: fail');
  });

  test('getCreditCardDetail calls apiGetWithRetry and returns data', async () => {
    const mockData = { cardDetails: {}, payments: [], billingCycles: [] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getCreditCardDetail(5, { billingCycleLimit: 24 });

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/credit-card-detail');
    expect(url).toContain('billingCycleLimit=24');
    expect(operation).toBe('fetch credit card detail');
    expect(result).toEqual(mockData);
  });

  test('getCreditCardDetail wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getCreditCardDetail(5)).rejects.toThrow('Unable to load credit card detail: fail');
  });

  test('getUnifiedBillingCycles calls apiGetWithRetry with correct params', async () => {
    const mockData = { billingCycles: [], autoGeneratedCount: 0, totalCount: 0 };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getUnifiedBillingCycles(5, { limit: 6, includeAutoGenerate: false });

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles/unified');
    expect(url).toContain('limit=6');
    expect(url).toContain('include_auto_generate=false');
    expect(operation).toBe('fetch unified billing cycles');
    expect(result).toEqual(mockData);
  });

  test('getUnifiedBillingCycles wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('fail'));
    await expect(getUnifiedBillingCycles(5)).rejects.toThrow('Unable to load unified billing cycles: fail');
  });
});

describe('creditCardApi — mutation operations (apiClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('recordPayment calls apiPost with correct args', async () => {
    const paymentData = { amount: 100, payment_date: '2025-01-15' };
    apiPost.mockResolvedValue({ payment: { id: 1, ...paymentData } });

    const result = await recordPayment(5, paymentData);

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/5/payments'),
      paymentData,
      'record payment'
    );
    expect(result).toEqual({ payment: { id: 1, ...paymentData } });
  });

  test('recordPayment wraps errors', async () => {
    apiPost.mockRejectedValue(new ApiError('Invalid amount', 400));
    await expect(recordPayment(5, {})).rejects.toThrow('Unable to record payment: Invalid amount');
  });

  test('deletePayment calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deletePayment(5, 10);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/5/payments/10'),
      'delete payment'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deletePayment wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Not found', 404));
    await expect(deletePayment(5, 99)).rejects.toThrow('Unable to delete payment: Not found');
  });

  test('deleteStatement calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deleteStatement(5, 20);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/5/statements/20'),
      'delete statement'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deleteStatement wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Forbidden', 403));
    await expect(deleteStatement(5, 20)).rejects.toThrow('Unable to delete statement: Forbidden');
  });

  test('deleteBillingCycle calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deleteBillingCycle(5, 30);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/5/billing-cycles/30'),
      'delete billing cycle'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deleteBillingCycle wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Server error', 500));
    await expect(deleteBillingCycle(5, 30)).rejects.toThrow('Unable to delete billing cycle: Server error');
  });
});

describe('creditCardApi — custom operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('downloadStatement uses fetchWithRetry and returns blob', async () => {
    const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' });
    const mockResponse = { ok: true, blob: vi.fn().mockResolvedValue(mockBlob) };
    fetchWithRetry.mockResolvedValue(mockResponse);

    const result = await downloadStatement(5, 20);

    expect(fetchWithRetry).toHaveBeenCalledTimes(1);
    expect(fetchWithRetry).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/5/statements/20')
    );
    expect(mockResponse.blob).toHaveBeenCalled();
    expect(result).toBe(mockBlob);
  });

  test('downloadStatement wraps errors on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ error: 'Not found' })
    };
    fetchWithRetry.mockResolvedValue(mockResponse);

    await expect(downloadStatement(5, 20)).rejects.toThrow('Unable to download statement: Not found');
  });

  test('uploadStatement fallback path uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ statement: { id: 1 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['content'], 'statement.pdf', { type: 'application/pdf' });
    const metadata = {
      statement_date: '2025-01-15',
      statement_period_start: '2025-01-01',
      statement_period_end: '2025-01-31'
    };

    const result = await uploadStatement(5, file, metadata);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/statements');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(options.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ statement: { id: 1 } });
  });

  test('uploadStatement wraps errors', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Server error' })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['content'], 'statement.pdf');
    const metadata = {
      statement_date: '2025-01-15',
      statement_period_start: '2025-01-01',
      statement_period_end: '2025-01-31'
    };

    await expect(uploadStatement(5, file, metadata)).rejects.toThrow('Unable to upload statement: Server error');
  });

  test('createBillingCycle with JSON body uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ cycle: { id: 1 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const data = { actual_statement_balance: 500 };
    const result = await createBillingCycle(5, data);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(JSON.parse(options.body)).toEqual(data);
    expect(result).toEqual({ cycle: { id: 1 } });
  });

  test('createBillingCycle with FormData uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ cycle: { id: 2 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['pdf'], 'stmt.pdf');
    const data = { actual_statement_balance: 500, statement: file };
    const result = await createBillingCycle(5, data);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(options.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ cycle: { id: 2 } });
  });

  test('createBillingCycle wraps errors', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: 'Missing balance' })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    await expect(createBillingCycle(5, { actual_statement_balance: 0 }))
      .rejects.toThrow('Unable to create billing cycle: Missing balance');
  });

  test('updateBillingCycle with JSON body uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ cycle: { id: 1 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const data = { actual_statement_balance: 600 };
    const result = await updateBillingCycle(5, 10, data);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5/billing-cycles/10');
    expect(options.method).toBe('PUT');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(result).toEqual({ cycle: { id: 1 } });
  });

  test('updateBillingCycle with FormData uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ cycle: { id: 1 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['pdf'], 'stmt.pdf');
    const data = { actual_statement_balance: 600, statement: file };
    const result = await updateBillingCycle(5, 10, data);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(options.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ cycle: { id: 1 } });
  });

  test('updateBillingCycle wraps errors', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ error: 'Cycle not found' })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    await expect(updateBillingCycle(5, 99, { actual_statement_balance: 100 }))
      .rejects.toThrow('Unable to update billing cycle: Cycle not found');
  });
});
