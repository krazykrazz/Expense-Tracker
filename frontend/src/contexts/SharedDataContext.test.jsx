import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { SharedDataProvider, useSharedDataContext } from './SharedDataContext';

// Mock API services
vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
}));

const wrapper = ({ children }) => (
  <SharedDataProvider selectedYear={2026} selectedMonth={2}>
    {children}
  </SharedDataProvider>
);

describe('SharedDataContext Unit Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Requirement 5.2: useSharedDataContext throws outside provider
   */
  it('useSharedDataContext throws when used outside SharedDataProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSharedDataContext())).toThrow(
      'useSharedDataContext must be used within a SharedDataProvider'
    );
    spy.mockRestore();
  });

  /**
   * Requirements 1.1, 2.1, 3.1, 4.1: Initial state values
   */
  it('initializes paymentMethods as empty array', () => {
    const { result } = renderHook(() => useSharedDataContext(), { wrapper });
    expect(result.current.paymentMethods).toEqual([]);
  });

  it('initializes people as empty array', () => {
    const { result } = renderHook(() => useSharedDataContext(), { wrapper });
    expect(result.current.people).toEqual([]);
  });

  it('initializes budgets as empty array', () => {
    const { result } = renderHook(() => useSharedDataContext(), { wrapper });
    expect(result.current.budgets).toEqual([]);
  });

  /**
   * Requirement 5.1: Context value is accessible
   */
  it('provides all expected context values and handlers', () => {
    const { result } = renderHook(() => useSharedDataContext(), { wrapper });

    // Data arrays
    expect(Array.isArray(result.current.paymentMethods)).toBe(true);
    expect(Array.isArray(result.current.people)).toBe(true);
    expect(Array.isArray(result.current.budgets)).toBe(true);

    // Handlers
    expect(typeof result.current.refreshPaymentMethods).toBe('function');
    expect(typeof result.current.refreshPeople).toBe('function');
    expect(typeof result.current.refreshBudgets).toBe('function');

    // Old payment methods modal state must not exist
    expect('showPaymentMethods' in result.current).toBe(false);
    expect('openPaymentMethods' in result.current).toBe(false);
    expect('closePaymentMethods' in result.current).toBe(false);
  });
});
