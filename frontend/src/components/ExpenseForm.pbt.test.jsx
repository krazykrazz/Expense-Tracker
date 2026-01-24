import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';
import { PAYMENT_METHODS } from '../utils/constants';

// Mock fetch globally
global.fetch = vi.fn();

// Helper to create a comprehensive mock implementation
const createMockFetch = (additionalHandlers = {}) => {
  return (url) => {
    if (url.includes('/api/categories') || url.includes('/categories')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          categories: CATEGORIES,
          budgetableCategories: [],
          taxDeductibleCategories: []
        })
      });
    }
    if (url.includes('/places')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    if (url.includes('/people')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    if (url.includes('/suggest-category')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ category: null, confidence: 0 })
      });
    }
    for (const [pattern, handler] of Object.entries(additionalHandlers)) {
      if (url.includes(pattern)) {
        return handler(url);
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([])
    });
  };
};

describe('ExpenseForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  it('Property 1: should include all valid categories in the dropdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(CATEGORIES, { minLength: 1, maxLength: CATEGORIES.length }),
        async (categoriesToCheck) => {
          global.fetch.mockImplementation(createMockFetch());
          const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
            expect(typeSelect.options.length).toBeGreaterThan(1);
          });
          const typeSelect = container.querySelector('select[name="type"]');
          const optionValues = Array.from(typeSelect.options).map(opt => opt.value);
          for (const category of categoriesToCheck) {
            expect(optionValues).toContain(category);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: should persist payment method to localStorage and pre-select on next form open', async () => {
    const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);
    await fc.assert(
      fc.asyncProperty(
        validMethodArb,
        async (method) => {
          localStorage.clear();
          global.fetch.mockImplementation(createMockFetch({
            '/expenses': () => Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 1, method })
            })
          }));
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const methodSelect = container.querySelector('select[name="method"]');
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
            fireEvent.change(amountInput, { target: { value: '50.00' } });
            fireEvent.change(methodSelect, { target: { value: method } });
          });
          await act(async () => {
            const form = container.querySelector('form');
            fireEvent.submit(form);
          });
          await waitFor(() => {
            const savedMethod = localStorage.getItem('expense-tracker-last-payment-method');
            expect(savedMethod).toBe(method);
          });
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });
          unmount();
          const { container: newContainer, unmount: unmount2 } = render(<ExpenseForm onExpenseAdded={() => {}} />);
          await waitFor(() => {
            const newMethodSelect = newContainer.querySelector('select[name="method"]');
            expect(newMethodSelect).toBeTruthy();
          });
          const newMethodSelect = newContainer.querySelector('select[name="method"]');
          expect(newMethodSelect.value).toBe(method);
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });
          unmount2();
          localStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4: should enable submit button when all required fields have valid values', async () => {
    const validDateArb = fc.tuple(
      fc.integer({ min: 2020, max: 2030 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 })
    ).map(([year, month, day]) => {
      const monthStr = month.toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      return year + '-' + monthStr + '-' + dayStr;
    });
    const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n))
      .map(n => n.toFixed(2));
    const validCategoryArb = fc.constantFrom(...CATEGORIES);
    const validMethodArb = fc.constantFrom(...PAYMENT_METHODS);
    const validPlaceArb = fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.length <= 200)
    );
    await fc.assert(
      fc.asyncProperty(
        validDateArb,
        validAmountArb,
        validCategoryArb,
        validMethodArb,
        validPlaceArb,
        async (date, amount, category, method, place) => {
          global.fetch.mockImplementation(createMockFetch());
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const typeSelect = container.querySelector('select[name="type"]');
          const methodSelect = container.querySelector('select[name="method"]');
          const placeInput = container.querySelector('input[name="place"]');
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: date } });
            fireEvent.change(amountInput, { target: { value: amount } });
            fireEvent.change(typeSelect, { target: { value: category } });
            fireEvent.change(methodSelect, { target: { value: method } });
            if (place) {
              fireEvent.change(placeInput, { target: { value: place } });
            }
          });
          const submitButton = container.querySelector('button[type="submit"]');
          expect(submitButton.disabled).toBe(false);
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
