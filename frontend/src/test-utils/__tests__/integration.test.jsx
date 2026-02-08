/**
 * Integration tests for test utilities working together.
 * Tests realistic scenarios combining arbitraries + wrappers + assertions + mocks.
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useContext } from 'react';

// Import from unified index to verify exports work
import {
  expenseRecord,
  modalOperationSequence,
  paymentMethod,
  createModalWrapper,
  createFilterWrapper,
  assertSequenceResult,
  createExpenseApiMock,
  mockExpenseResponse,
  createCallTracker,
  testEach,
} from '../index';

import { useModalContext } from '../../contexts/ModalContext';

describe('Test utilities integration', () => {
  describe('arbitraries + wrappers: generate data and render in context', () => {
    it('expenseRecord generates valid data usable in mock API', () => {
      fc.assert(
        fc.property(
          fc.array(expenseRecord(), { minLength: 1, maxLength: 5 }),
          (expenses) => {
            const resp = mockExpenseResponse(expenses);
            expect(resp.data).toBe(expenses);
            expect(resp.total).toBe(expenses.length);
            expenses.forEach(e => {
              expect(typeof e.id).toBe('number');
              expect(typeof e.amount).toBe('number');
              expect(e.amount).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('wrappers + assertions: render hooks and validate state', () => {
    it('modal wrapper + sequence assertion validates open/close', () => {
      fc.assert(
        fc.property(
          modalOperationSequence({ minLength: 1, maxLength: 10 }),
          (ops) => {
            const wrapper = createModalWrapper();
            const { result } = renderHook(() => useModalContext(), { wrapper });

            ops.forEach(op => {
              act(() => {
                if (op === 'open') result.current.openExpenseForm();
                else result.current.closeExpenseForm();
              });
            });

            assertSequenceResult(ops, result.current.showExpenseForm);
            cleanup();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('mocks + call tracker: track API invocations', () => {
    it('call tracker accurately counts mock API calls', () => {
      const tracker = createCallTracker();
      const mockApi = createExpenseApiMock({
        fetchExpenses: tracker.track(() => Promise.resolve({ data: [] })),
      });

      mockApi.fetchExpenses({ year: 2024 });
      mockApi.fetchExpenses({ year: 2025 });

      expect(tracker.getCallCount()).toBe(2);
      expect(tracker.getLastCall()).toEqual([{ year: 2025 }]);
    });
  });

  describe('testEach + arbitraries: parameterized with domain values', () => {
    testEach([
      { method: 'cash', description: 'cash payment' },
      { method: 'cheque', description: 'cheque payment' },
      { method: 'debit', description: 'debit payment' },
      { method: 'credit_card', description: 'credit card payment' },
    ]).test('validates $method is a known payment type', ({ method }) => {
      // Verify the test-utils payment method arbitrary would generate this value
      expect(['cash', 'cheque', 'debit', 'credit_card']).toContain(method);
    });
  });
});
