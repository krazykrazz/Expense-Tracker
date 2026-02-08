/**
 * Mock factory functions for API responses and call tracking.
 */
import { vi } from 'vitest';

// ── API Mock Factories ──

export const createExpenseApiMock = (overrides = {}) => ({
  fetchExpenses: vi.fn().mockResolvedValue({ data: [] }),
  fetchExpensesByYear: vi.fn().mockResolvedValue({ data: [] }),
  createExpense: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  updateExpense: vi.fn().mockResolvedValue({ data: { id: 1 } }),
  deleteExpense: vi.fn().mockResolvedValue({ success: true }),
  searchExpenses: vi.fn().mockResolvedValue({ data: [] }),
  ...overrides
});

export const createPaymentMethodApiMock = (overrides = {}) => ({
  fetchPaymentMethods: vi.fn().mockResolvedValue([]),
  createPaymentMethod: vi.fn().mockResolvedValue({ id: 1 }),
  updatePaymentMethod: vi.fn().mockResolvedValue({ id: 1 }),
  deletePaymentMethod: vi.fn().mockResolvedValue({ success: true }),
  ...overrides
});

export const createPeopleApiMock = (overrides = {}) => ({
  fetchPeople: vi.fn().mockResolvedValue([]),
  createPerson: vi.fn().mockResolvedValue({ id: 1 }),
  updatePerson: vi.fn().mockResolvedValue({ id: 1 }),
  deletePerson: vi.fn().mockResolvedValue({ success: true }),
  ...overrides
});

export const createBudgetApiMock = (overrides = {}) => ({
  fetchBudgets: vi.fn().mockResolvedValue([]),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue({ success: true }),
  ...overrides
});

// ── Response Builders ──

export const mockExpenseResponse = (data = []) => ({
  data,
  total: data.length,
  page: 1,
  pageSize: data.length
});

export const mockErrorResponse = (status = 500, message = 'Internal Server Error') => {
  const error = new Error(message);
  error.response = { status, data: { error: message } };
  return error;
};

export const mockSuccessResponse = (data) => ({
  data,
  success: true
});

// ── Call Tracking ──

export const createCallTracker = () => {
  let calls = [];

  return {
    track(fn) {
      const tracked = (...args) => {
        calls.push(args);
        return fn?.(...args);
      };
      tracked.mock = { get calls() { return calls; } };
      return tracked;
    },
    getCallCount() {
      return calls.length;
    },
    getLastCall() {
      return calls.length > 0 ? calls[calls.length - 1] : undefined;
    },
    getCalls() {
      return [...calls];
    },
    reset() {
      calls = [];
    }
  };
};
