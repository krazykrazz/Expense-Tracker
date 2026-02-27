/**
 * Unit tests for invoiceApi after migration to apiClient.
 * Verifies that all operations correctly delegate to apiClient methods
 * and that error wrapping, 404 handling, retry integration, and custom
 * XHR upload path work as expected.
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
    apiDelete: vi.fn(),
    apiPatch: vi.fn(),
    ApiError
  };
});

// Mock fetchWithRetry
vi.mock('../utils/fetchWithRetry', () => ({
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

import { apiDelete, apiPatch, ApiError } from '../utils/apiClient';
import { apiGetWithRetry } from '../utils/fetchWithRetry';
import { getFetchFn } from '../utils/fetchProvider';
import {
  getInvoiceMetadata,
  getInvoicesForExpense,
  deleteInvoice,
  deleteInvoiceById,
  updateInvoicePersonLink,
  uploadInvoice
} from './invoiceApi';

describe('invoiceApi — GET operations (apiGetWithRetry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('getInvoiceMetadata calls apiGetWithRetry and returns invoice', async () => {
    const mockData = { invoice: { id: 1, filename: 'receipt.pdf' } };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getInvoiceMetadata(42);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/invoices/42/metadata');
    expect(operation).toBe('fetch invoice metadata');
    expect(result).toEqual({ id: 1, filename: 'receipt.pdf' });
  });

  test('getInvoiceMetadata returns null on 404 ApiError', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Not found', 404));

    const result = await getInvoiceMetadata(999);
    expect(result).toBeNull();
  });

  test('getInvoiceMetadata wraps non-404 errors', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Server error', 500));

    await expect(getInvoiceMetadata(1)).rejects.toThrow('Unable to load invoice information: Server error');
  });

  test('getInvoicesForExpense calls apiGetWithRetry and returns invoices array', async () => {
    const mockData = { invoices: [{ id: 1 }, { id: 2 }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getInvoicesForExpense(42);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/invoices/42');
    expect(operation).toBe('fetch invoices');
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test('getInvoicesForExpense returns empty array when invoices is missing', async () => {
    apiGetWithRetry.mockResolvedValue({});

    const result = await getInvoicesForExpense(42);
    expect(result).toEqual([]);
  });

  test('getInvoicesForExpense returns empty array on 404 ApiError', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Not found', 404));

    const result = await getInvoicesForExpense(999);
    expect(result).toEqual([]);
  });

  test('getInvoicesForExpense wraps non-404 errors', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Server error', 500));

    await expect(getInvoicesForExpense(1)).rejects.toThrow('Unable to load invoices: Server error');
  });
});

describe('invoiceApi — mutation operations (apiClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('deleteInvoice calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deleteInvoice(42);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/invoices/expense/42'),
      'delete invoice'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deleteInvoice wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Server error', 500));

    await expect(deleteInvoice(1)).rejects.toThrow('Unable to delete invoice: Server error');
  });

  test('deleteInvoiceById calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deleteInvoiceById(7);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/invoices/7'),
      'delete invoice'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deleteInvoiceById wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Not found', 404));

    await expect(deleteInvoiceById(99)).rejects.toThrow('Unable to delete invoice: Not found');
  });

  test('updateInvoicePersonLink calls apiPatch with correct args', async () => {
    apiPatch.mockResolvedValue({ invoice: { id: 5, person_id: 3 } });

    const result = await updateInvoicePersonLink(5, 3);

    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/invoices/5'),
      { personId: 3 },
      'update invoice person link'
    );
    expect(result).toEqual({ invoice: { id: 5, person_id: 3 } });
  });

  test('updateInvoicePersonLink passes null personId to unlink', async () => {
    apiPatch.mockResolvedValue({ invoice: { id: 5, person_id: null } });

    await updateInvoicePersonLink(5, null);

    expect(apiPatch).toHaveBeenCalledWith(
      expect.any(String),
      { personId: null },
      'update invoice person link'
    );
  });

  test('updateInvoicePersonLink wraps errors', async () => {
    apiPatch.mockRejectedValue(new ApiError('Forbidden', 403));

    await expect(updateInvoicePersonLink(1, 2)).rejects.toThrow('Unable to update invoice: Forbidden');
  });
});

describe('invoiceApi — custom operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('uploadInvoice fallback path uses getFetchFn with TAB_ID header', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ invoice: { id: 1 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['content'], 'receipt.pdf', { type: 'application/pdf' });
    const result = await uploadInvoice(42, file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/invoices/upload');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Tab-ID']).toBe('test-tab-id');
    expect(options.body).toBeInstanceOf(FormData);
    expect(result).toEqual({ invoice: { id: 1 } });
  });

  test('uploadInvoice fallback path includes personId in FormData when provided', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ invoice: { id: 1, person_id: 5 } })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['content'], 'receipt.pdf');
    await uploadInvoice(42, file, { personId: 5 });

    const [, options] = mockFetch.mock.calls[0];
    const formData = options.body;
    expect(formData.get('personId')).toBe('5');
    expect(formData.get('expenseId')).toBe('42');
  });

  test('uploadInvoice fallback path wraps errors on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Server error' })
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    getFetchFn.mockReturnValue(mockFetch);

    const file = new File(['content'], 'receipt.pdf');
    await expect(uploadInvoice(42, file)).rejects.toThrow('Unable to upload invoice: Server error');
  });

  test('uploadInvoice XHR path resolves on successful upload', async () => {
    const file = new File(['content'], 'receipt.pdf');
    const progressValues = [];

    // Mock XMLHttpRequest with a proper constructor
    const mockXhr = {
      upload: { addEventListener: vi.fn() },
      open: vi.fn(),
      send: vi.fn(),
      timeout: 0,
      onload: null,
      onerror: null,
      ontimeout: null
    };

    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function () { return mockXhr; };

    const promise = uploadInvoice(42, file, {
      onProgress: (p) => progressValues.push(p)
    });

    // Simulate successful response
    mockXhr.status = 200;
    mockXhr.responseText = JSON.stringify({ invoice: { id: 1 } });
    mockXhr.onload();

    const result = await promise;
    expect(result).toEqual({ invoice: { id: 1 } });
    expect(mockXhr.open).toHaveBeenCalledWith('POST', expect.stringContaining('/api/invoices/upload'));
    expect(mockXhr.timeout).toBe(60000);

    globalThis.XMLHttpRequest = OriginalXHR;
  });

  test('uploadInvoice XHR path rejects on error status', async () => {
    const file = new File(['content'], 'receipt.pdf');

    const mockXhr = {
      upload: { addEventListener: vi.fn() },
      open: vi.fn(),
      send: vi.fn(),
      timeout: 0,
      onload: null,
      onerror: null,
      ontimeout: null
    };

    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function () { return mockXhr; };

    const promise = uploadInvoice(42, file, { onProgress: vi.fn() });

    mockXhr.status = 400;
    mockXhr.responseText = JSON.stringify({ error: 'Invalid file' });
    mockXhr.onload();

    await expect(promise).rejects.toThrow('Invalid file');

    globalThis.XMLHttpRequest = OriginalXHR;
  });

  test('uploadInvoice XHR path rejects on network error', async () => {
    const file = new File(['content'], 'receipt.pdf');

    const mockXhr = {
      upload: { addEventListener: vi.fn() },
      open: vi.fn(),
      send: vi.fn(),
      timeout: 0,
      onload: null,
      onerror: null,
      ontimeout: null
    };

    const OriginalXHR = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = function () { return mockXhr; };

    const promise = uploadInvoice(42, file, { onProgress: vi.fn() });
    mockXhr.onerror();

    await expect(promise).rejects.toThrow('Network error during upload');

    globalThis.XMLHttpRequest = OriginalXHR;
  });
});
