import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import usePaymentMethods from './usePaymentMethods';

// Mock the paymentMethodApi module
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn(),
}));

// Mock the logger to suppress output in tests
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getActivePaymentMethods, getPaymentMethod } from '../services/paymentMethodApi';

const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';
const LEGACY_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method';

const mockActiveMethods = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'Visa', type: 'credit_card', is_active: 1 },
];

describe('usePaymentMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getActivePaymentMethods.mockResolvedValue(mockActiveMethods);
    getPaymentMethod.mockResolvedValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('fetching payment methods', () => {
    it('should fetch active payment methods on mount', async () => {
      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(getActivePaymentMethods).toHaveBeenCalledTimes(1);
      expect(result.current.paymentMethods).toEqual(mockActiveMethods);
      expect(result.current.error).toBeNull();
    });

    it('should set loading to true initially', () => {
      const { result } = renderHook(() => usePaymentMethods());
      expect(result.current.loading).toBe(true);
    });

    it('should handle API error gracefully', async () => {
      getActivePaymentMethods.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to load payment methods');
      expect(result.current.paymentMethods).toEqual([]);
    });

    it('should handle null response from API', async () => {
      getActivePaymentMethods.mockResolvedValue(null);

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.paymentMethods).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('inactive payment method handling', () => {
    it('should fetch inactive method when expensePaymentMethodId is not in active list', async () => {
      const inactiveMethod = { id: 99, display_name: 'Old Card', type: 'credit_card', is_active: 0 };
      getPaymentMethod.mockResolvedValue(inactiveMethod);

      const { result } = renderHook(() =>
        usePaymentMethods({ expensePaymentMethodId: 99 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(getPaymentMethod).toHaveBeenCalledWith(99);
      expect(result.current.inactivePaymentMethod).toEqual(inactiveMethod);
    });

    it('should not fetch inactive method when expensePaymentMethodId is in active list', async () => {
      const { result } = renderHook(() =>
        usePaymentMethods({ expensePaymentMethodId: 1 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(getPaymentMethod).not.toHaveBeenCalled();
      expect(result.current.inactivePaymentMethod).toBeNull();
    });

    it('should not fetch inactive method when expensePaymentMethodId is null', async () => {
      const { result } = renderHook(() =>
        usePaymentMethods({ expensePaymentMethodId: null })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(getPaymentMethod).not.toHaveBeenCalled();
      expect(result.current.inactivePaymentMethod).toBeNull();
    });

    it('should handle error when fetching inactive method', async () => {
      getPaymentMethod.mockRejectedValue(new Error('Not found'));

      const { result } = renderHook(() =>
        usePaymentMethods({ expensePaymentMethodId: 99 })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not set error for inactive method fetch failure (matches ExpenseForm behavior)
      expect(result.current.inactivePaymentMethod).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('getLastUsedId (localStorage read with legacy migration)', () => {
    it('should return saved ID when it exists and is valid', async () => {
      localStorage.setItem(LAST_PAYMENT_METHOD_KEY, '2');

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBe(2);
    });

    it('should return null when saved ID does not match any active method', async () => {
      localStorage.setItem(LAST_PAYMENT_METHOD_KEY, '999');

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBeNull();
    });

    it('should return null when no saved value exists', async () => {
      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBeNull();
    });

    it('should migrate legacy string-based value to ID-based format', async () => {
      localStorage.setItem(LEGACY_PAYMENT_METHOD_KEY, 'Debit');

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBe(2);

      // Verify migration happened
      expect(localStorage.getItem(LAST_PAYMENT_METHOD_KEY)).toBe('2');
      expect(localStorage.getItem(LEGACY_PAYMENT_METHOD_KEY)).toBeNull();
    });

    it('should return null when legacy value does not match any method', async () => {
      localStorage.setItem(LEGACY_PAYMENT_METHOD_KEY, 'NonExistentMethod');

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBeNull();
    });

    it('should accept custom methods array for validation', async () => {
      localStorage.setItem(LAST_PAYMENT_METHOD_KEY, '10');
      const customMethods = [{ id: 10, display_name: 'Custom', type: 'cash', is_active: 1 }];

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const lastUsedId = result.current.getLastUsedId(customMethods);
      expect(lastUsedId).toBe(10);
    });
  });

  describe('saveLastUsed (localStorage write)', () => {
    it('should save payment method ID to localStorage', async () => {
      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.saveLastUsed(3);
      });

      expect(localStorage.getItem(LAST_PAYMENT_METHOD_KEY)).toBe('3');
    });

    it('should overwrite previously saved value', async () => {
      localStorage.setItem(LAST_PAYMENT_METHOD_KEY, '1');

      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.saveLastUsed(2);
      });

      expect(localStorage.getItem(LAST_PAYMENT_METHOD_KEY)).toBe('2');
    });
  });

  describe('defaultPaymentMethodId', () => {
    it('should expose DEFAULT_PAYMENT_METHOD_ID as 1', async () => {
      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.defaultPaymentMethodId).toBe(1);
    });
  });

  describe('round-trip: saveLastUsed then getLastUsedId', () => {
    it('should return the same ID after save and read', async () => {
      const { result } = renderHook(() => usePaymentMethods());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        result.current.saveLastUsed(3);
      });

      const lastUsedId = result.current.getLastUsedId();
      expect(lastUsedId).toBe(3);
    });
  });

  describe('cleanup on unmount', () => {
    it('should not update state after unmount', async () => {
      // Use a slow-resolving promise to test unmount during fetch
      let resolvePromise;
      getActivePaymentMethods.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      const { result, unmount } = renderHook(() => usePaymentMethods());

      expect(result.current.loading).toBe(true);

      // Unmount before the promise resolves
      unmount();

      // Resolve the promise after unmount — should not throw
      resolvePromise(mockActiveMethods);

      // Give time for any async operations
      await new Promise((r) => setTimeout(r, 50));

      // No error should have been thrown
    });
  });
});
