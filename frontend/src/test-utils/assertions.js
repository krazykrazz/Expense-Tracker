/**
 * Async assertion helpers and sequence validators.
 * Reduces repetitive waitFor / act patterns in tests.
 */
import { waitFor } from '@testing-library/react';

// ── Async State Assertions ──

/**
 * Wait until getter() returns expectedValue.
 */
export const waitForState = async (getter, expectedValue, { timeout = 3000, interval = 50, errorMessage } = {}) => {
  await waitFor(
    () => {
      const actual = getter();
      if (actual !== expectedValue) {
        throw new Error(
          errorMessage ||
          `Expected state to be ${JSON.stringify(expectedValue)} but got ${JSON.stringify(actual)}`
        );
      }
    },
    { timeout, interval }
  );
};

/**
 * Wait until getter() changes from its initial value. Returns the new value.
 */
export const waitForStateChange = async (getter, { timeout = 3000, interval = 50 } = {}) => {
  const initial = getter();
  await waitFor(
    () => {
      const current = getter();
      if (current === initial) {
        throw new Error(
          `State did not change from ${JSON.stringify(initial)} within ${timeout}ms`
        );
      }
    },
    { timeout, interval }
  );
  return getter();
};

/**
 * Wait until a mock function has been called at least `times` times.
 */
export const waitForApiCall = async (mockFn, { times = 1, timeout = 3000, interval = 50 } = {}) => {
  await waitFor(
    () => {
      const count = mockFn.mock?.calls?.length ?? 0;
      if (count < times) {
        throw new Error(
          `Expected mock to be called at least ${times} time(s) but was called ${count} time(s)`
        );
      }
    },
    { timeout, interval }
  );
};

// ── Modal Assertions ──

export const assertModalOpen = (state, modalName) => {
  const value = state[modalName] ?? state[`show${modalName.charAt(0).toUpperCase() + modalName.slice(1)}`];
  if (value !== true) {
    throw new Error(`Expected modal "${modalName}" to be open but it was ${JSON.stringify(value)}`);
  }
};

export const assertModalClosed = (state, modalName) => {
  const value = state[modalName] ?? state[`show${modalName.charAt(0).toUpperCase() + modalName.slice(1)}`];
  if (value !== false) {
    throw new Error(`Expected modal "${modalName}" to be closed but it was ${JSON.stringify(value)}`);
  }
};

export const assertAllModalsClosed = (state) => {
  const modalKeys = Object.keys(state).filter(k => k.startsWith('show'));
  for (const key of modalKeys) {
    if (state[key] === true) {
      throw new Error(`Expected all modals closed but "${key}" is open`);
    }
  }
};

// ── Sequence Assertions ──

/**
 * Assert that the final state matches the last operation in a sequence.
 * For open/close sequences: last 'open' → true, last 'close' → false.
 */
export const assertSequenceResult = (operations, actualState) => {
  if (!operations || operations.length === 0) {
    throw new Error('assertSequenceResult: operations array must not be empty');
  }
  const lastOp = operations[operations.length - 1];
  const expected = lastOp === 'open';
  if (actualState !== expected) {
    throw new Error(
      `Sequence [${operations.join(', ')}]: expected final state ${expected} but got ${actualState}`
    );
  }
};

/**
 * Assert that repeating an operation produces the same result (idempotence).
 */
export const assertIdempotence = async (operation, getter) => {
  await operation();
  const first = getter();
  await operation();
  const second = getter();
  if (first !== second) {
    throw new Error(
      `Idempotence violated: first call produced ${JSON.stringify(first)}, second produced ${JSON.stringify(second)}`
    );
  }
};
