/**
 * Property tests for mocks module.
 * **Property 4: Mock factories produce valid API responses**
 * **Property 7: Call tracking utilities count invocations accurately**
 * **Validates: Requirements 3.4, 5.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createExpenseApiMock,
  createPaymentMethodApiMock,
  createPeopleApiMock,
  createBudgetApiMock,
  mockExpenseResponse,
  mockErrorResponse,
  mockSuccessResponse,
  createCallTracker,
} from '../mocks';

describe('Property 4: Mock factories produce valid API responses', () => {
  it('createExpenseApiMock has all CRUD methods', () => {
    const mock = createExpenseApiMock();
    expect(typeof mock.fetchExpenses).toBe('function');
    expect(typeof mock.createExpense).toBe('function');
    expect(typeof mock.updateExpense).toBe('function');
    expect(typeof mock.deleteExpense).toBe('function');
  });

  it('createPaymentMethodApiMock has all CRUD methods', () => {
    const mock = createPaymentMethodApiMock();
    expect(typeof mock.fetchPaymentMethods).toBe('function');
    expect(typeof mock.createPaymentMethod).toBe('function');
    expect(typeof mock.updatePaymentMethod).toBe('function');
    expect(typeof mock.deletePaymentMethod).toBe('function');
  });

  it('createPeopleApiMock has all CRUD methods', () => {
    const mock = createPeopleApiMock();
    expect(typeof mock.fetchPeople).toBe('function');
    expect(typeof mock.createPerson).toBe('function');
    expect(typeof mock.updatePerson).toBe('function');
    expect(typeof mock.deletePerson).toBe('function');
  });

  it('createBudgetApiMock has all CRUD methods', () => {
    const mock = createBudgetApiMock();
    expect(typeof mock.fetchBudgets).toBe('function');
    expect(typeof mock.createBudget).toBe('function');
    expect(typeof mock.updateBudget).toBe('function');
    expect(typeof mock.deleteBudget).toBe('function');
  });

  it('mockExpenseResponse wraps data with correct structure', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.integer(), amount: fc.double() }), { maxLength: 10 }),
        (data) => {
          const resp = mockExpenseResponse(data);
          expect(resp.data).toBe(data);
          expect(resp.total).toBe(data.length);
          expect(resp.page).toBe(1);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('mockErrorResponse has status and message', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 400, max: 599 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (status, message) => {
          const err = mockErrorResponse(status, message);
          expect(err).toBeInstanceOf(Error);
          expect(err.response.status).toBe(status);
          expect(err.response.data.error).toBe(message);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('mockSuccessResponse wraps data', () => {
    const resp = mockSuccessResponse({ id: 1 });
    expect(resp.data).toEqual({ id: 1 });
    expect(resp.success).toBe(true);
  });
});

describe('Property 7: Call tracking utilities count invocations accurately', () => {
  it('tracks call count for any number of invocations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        (n) => {
          const tracker = createCallTracker();
          const fn = tracker.track(() => 'result');
          for (let i = 0; i < n; i++) fn(i);
          expect(tracker.getCallCount()).toBe(n);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('getLastCall returns the most recent arguments', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (args) => {
          const tracker = createCallTracker();
          const fn = tracker.track();
          args.forEach((a) => fn(a));
          expect(tracker.getLastCall()).toEqual([args[args.length - 1]]);
        }
      ),
      { numRuns: 20 }
    );
  });

  it('getLastCall returns undefined when never called', () => {
    const tracker = createCallTracker();
    tracker.track();
    expect(tracker.getLastCall()).toBeUndefined();
  });

  it('reset clears all tracked calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (n) => {
          const tracker = createCallTracker();
          const fn = tracker.track();
          for (let i = 0; i < n; i++) fn(i);
          expect(tracker.getCallCount()).toBe(n);
          tracker.reset();
          expect(tracker.getCallCount()).toBe(0);
          expect(tracker.getLastCall()).toBeUndefined();
        }
      ),
      { numRuns: 20 }
    );
  });

  it('getCalls returns a copy of all call arguments', () => {
    const tracker = createCallTracker();
    const fn = tracker.track();
    fn('a', 1);
    fn('b', 2);
    const calls = tracker.getCalls();
    expect(calls).toEqual([['a', 1], ['b', 2]]);
    // Verify it's a copy
    calls.push(['c', 3]);
    expect(tracker.getCallCount()).toBe(2);
  });
});
