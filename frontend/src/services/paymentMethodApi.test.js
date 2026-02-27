/**
 * Unit tests for paymentMethodApi after migration to apiClient.
 * Verifies that all operations correctly delegate to apiClient methods
 * and that error wrapping, 404 handling, and retry integration work as expected.
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
    apiPut: vi.fn(),
    apiDelete: vi.fn(),
    apiPatch: vi.fn(),
    ApiError
  };
});

// Mock fetchWithRetry
vi.mock('../utils/fetchWithRetry', () => ({
  apiGetWithRetry: vi.fn()
}));

import { apiPost, apiPut, apiDelete, apiPatch, ApiError } from '../utils/apiClient';
import { apiGetWithRetry } from '../utils/fetchWithRetry';
import {
  getPaymentMethods,
  getActivePaymentMethods,
  getPaymentMethod,
  getDisplayNames,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  setPaymentMethodActive
} from './paymentMethodApi';

describe('paymentMethodApi — GET operations (apiGetWithRetry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('getPaymentMethods calls apiGetWithRetry and returns paymentMethods array', async () => {
    const mockData = { paymentMethods: [{ id: 1, display_name: 'Cash' }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getPaymentMethods({ type: 'cash', activeOnly: true });

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [apiGetFn, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods?');
    expect(url).toContain('type=cash');
    expect(url).toContain('activeOnly=true');
    expect(operation).toBe('fetch payment methods');
    expect(result).toEqual([{ id: 1, display_name: 'Cash' }]);
  });

  test('getPaymentMethods returns empty array when paymentMethods is missing', async () => {
    apiGetWithRetry.mockResolvedValue({});

    const result = await getPaymentMethods();
    expect(result).toEqual([]);
  });

  test('getPaymentMethods wraps errors with Unable to load format', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('Server error'));

    await expect(getPaymentMethods()).rejects.toThrow('Unable to load payment methods: Server error');
  });

  test('getActivePaymentMethods calls apiGetWithRetry and returns paymentMethods', async () => {
    const mockData = { paymentMethods: [{ id: 2, display_name: 'Debit' }] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getActivePaymentMethods();

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/active');
    expect(operation).toBe('fetch active payment methods');
    expect(result).toEqual([{ id: 2, display_name: 'Debit' }]);
  });

  test('getActivePaymentMethods wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('timeout'));

    await expect(getActivePaymentMethods()).rejects.toThrow('Unable to load active payment methods: timeout');
  });

  test('getPaymentMethod returns payment method data on success', async () => {
    const mockData = { paymentMethod: { id: 5, display_name: 'Visa' } };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getPaymentMethod(5);

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/5');
    expect(operation).toBe('fetch payment method');
    expect(result).toEqual({ id: 5, display_name: 'Visa' });
  });

  test('getPaymentMethod returns null on 404 ApiError', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Not found', 404));

    const result = await getPaymentMethod(999);
    expect(result).toBeNull();
  });

  test('getPaymentMethod wraps non-404 errors', async () => {
    apiGetWithRetry.mockRejectedValue(new ApiError('Server error', 500));

    await expect(getPaymentMethod(1)).rejects.toThrow('Unable to load payment method: Server error');
  });

  test('getDisplayNames calls apiGetWithRetry and returns displayNames', async () => {
    const mockData = { displayNames: ['Cash', 'Debit', 'Visa'] };
    apiGetWithRetry.mockResolvedValue(mockData);

    const result = await getDisplayNames();

    expect(apiGetWithRetry).toHaveBeenCalledTimes(1);
    const [, url, operation] = apiGetWithRetry.mock.calls[0];
    expect(url).toContain('/api/payment-methods/display-names');
    expect(operation).toBe('fetch display names');
    expect(result).toEqual(['Cash', 'Debit', 'Visa']);
  });

  test('getDisplayNames returns empty array when displayNames is missing', async () => {
    apiGetWithRetry.mockResolvedValue({});

    const result = await getDisplayNames();
    expect(result).toEqual([]);
  });

  test('getDisplayNames wraps errors', async () => {
    apiGetWithRetry.mockRejectedValue(new Error('Network failure'));

    await expect(getDisplayNames()).rejects.toThrow('Unable to load display names: Network failure');
  });
});

describe('paymentMethodApi — mutation operations (apiClient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('createPaymentMethod calls apiPost with correct args', async () => {
    const newMethod = { display_name: 'New Card', type: 'credit_card' };
    apiPost.mockResolvedValue({ paymentMethod: { id: 10, ...newMethod } });

    const result = await createPaymentMethod(newMethod);

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods'),
      newMethod,
      'create payment method'
    );
    expect(result).toEqual({ id: 10, ...newMethod });
  });

  test('createPaymentMethod wraps errors', async () => {
    apiPost.mockRejectedValue(new ApiError('Duplicate name', 409));

    await expect(createPaymentMethod({})).rejects.toThrow('Unable to create payment method: Duplicate name');
  });

  test('updatePaymentMethod calls apiPut with correct args', async () => {
    const updateData = { display_name: 'Updated Card' };
    apiPut.mockResolvedValue({ paymentMethod: { id: 3, ...updateData } });

    const result = await updatePaymentMethod(3, updateData);

    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/3'),
      updateData,
      'update payment method'
    );
    expect(result).toEqual({ id: 3, ...updateData });
  });

  test('updatePaymentMethod wraps errors', async () => {
    apiPut.mockRejectedValue(new ApiError('Not found', 404));

    await expect(updatePaymentMethod(99, {})).rejects.toThrow('Unable to update payment method: Not found');
  });

  test('deletePaymentMethod calls apiDelete with correct args', async () => {
    apiDelete.mockResolvedValue({ message: 'Deleted' });

    const result = await deletePaymentMethod(7);

    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/7'),
      'delete payment method'
    );
    expect(result).toEqual({ message: 'Deleted' });
  });

  test('deletePaymentMethod wraps errors', async () => {
    apiDelete.mockRejectedValue(new ApiError('Has expenses', 400));

    await expect(deletePaymentMethod(1)).rejects.toThrow('Unable to delete payment method: Has expenses');
  });

  test('setPaymentMethodActive calls apiPatch with correct args', async () => {
    apiPatch.mockResolvedValue({ paymentMethod: { id: 4, is_active: false } });

    const result = await setPaymentMethodActive(4, false);

    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/payment-methods/4/active'),
      { isActive: false },
      'update payment method status'
    );
    expect(result).toEqual({ id: 4, is_active: false });
  });

  test('setPaymentMethodActive wraps errors', async () => {
    apiPatch.mockRejectedValue(new ApiError('Forbidden', 403));

    await expect(setPaymentMethodActive(1, true)).rejects.toThrow('Unable to update payment method status: Forbidden');
  });
});
