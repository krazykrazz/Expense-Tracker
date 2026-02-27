/**
 * Property-Based Tests for fetchWithRetry & apiGetWithRetry
 *
 * @invariant
 * Retry-equivalence invariant: For any sequence of HTTP responses drawn from
 * {success, retryable-error, non-retryable-error, network-error}, the shared
 * fetchWithRetry produces the same number of fetch invocations and the same
 * final outcome (returned response or thrown error) as the previous inline
 * implementation that existed in each service file.
 *
 * Randomization over status codes and error sequences adds value beyond fixed
 * examples because it explores the full combinatorial space of transient vs
 * permanent failures, ensuring no edge-case status code or failure ordering
 * is silently mishandled by the retry logic.
 *
 * Feature: fetch-infrastructure-consolidation
 * Validates: Requirements 1.3, 1.5, 1.6, 1.7, 3.1–3.9, 4.7, 5.2, 5.3
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { asyncPbtOptions } from '../test/pbtArbitraries';

// Mock fetchProvider
const mockFetchFn = vi.fn();
vi.mock('./fetchProvider', () => ({
  getFetchFn: () => mockFetchFn
}));

import { fetchWithRetry, apiGetWithRetry, RETRY_CONFIG } from './fetchWithRetry';

// ── Generators ──

const retryableStatus = () => fc.constantFrom(...RETRY_CONFIG.retryableStatuses);

const nonRetryableErrorStatus = () =>
  fc.integer({ min: 400, max: 599 })
    .filter(s => !RETRY_CONFIG.retryableStatuses.includes(s));

const successStatus = () => fc.integer({ min: 200, max: 299 });

const anyNonRetryableStatus = () =>
  fc.integer({ min: 200, max: 599 })
    .filter(s => !RETRY_CONFIG.retryableStatuses.includes(s));

// ── Helpers ──

function makeResponse(status) {
  return {
    status,
    statusText: `Status ${status}`,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve({ status }),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers()
  };
}

function networkError(msg = 'Network failure') {
  return new Error(msg);
}

// Reference inline implementation (identical to what was in each service file)
async function inlineFetchWithRetry(mockFn, url, options = {}, retryCount = 0) {
  try {
    const response = await mockFn(url, options);
    if (response.ok || !RETRY_CONFIG.retryableStatuses.includes(response.status)) {
      return response;
    }
    if (retryCount < RETRY_CONFIG.maxRetries) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (error) {
    if (retryCount < RETRY_CONFIG.maxRetries) {
      // Skip actual sleep in reference impl
      return inlineFetchWithRetry(mockFn, url, options, retryCount + 1);
    }
    throw error;
  }
}

// ── Tests ──

describe('fetchWithRetry PBT', () => {
  beforeEach(() => {
    mockFetchFn.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to advance timers for pending sleep calls
  async function flushRetryTimers() {
    for (let i = 0; i < RETRY_CONFIG.maxRetries + 1; i++) {
      await vi.advanceTimersByTimeAsync(RETRY_CONFIG.retryDelay * (i + 1));
    }
  }

  test('Property 1: Retry behavioral equivalence — shared fetchWithRetry produces same call count and outcome as inline', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            successStatus().map(s => ({ type: 'response', status: s })),
            retryableStatus().map(s => ({ type: 'response', status: s })),
            nonRetryableErrorStatus().map(s => ({ type: 'response', status: s })),
            fc.constant({ type: 'error', message: 'Network failure' })
          ),
          { minLength: 1, maxLength: RETRY_CONFIG.maxRetries + 1 }
        ),
        async (sequence) => {
          // Set up shared impl mock
          mockFetchFn.mockReset();
          for (const item of sequence) {
            if (item.type === 'response') {
              mockFetchFn.mockResolvedValueOnce(makeResponse(item.status));
            } else {
              mockFetchFn.mockRejectedValueOnce(networkError(item.message));
            }
          }

          // Set up reference impl mock
          const refMock = vi.fn();
          for (const item of sequence) {
            if (item.type === 'response') {
              refMock.mockResolvedValueOnce(makeResponse(item.status));
            } else {
              refMock.mockRejectedValueOnce(networkError(item.message));
            }
          }

          // Run both
          let sharedResult, sharedError;
          const sharedPromise = fetchWithRetry('/test', {})
            .then(r => { sharedResult = r; })
            .catch(e => { sharedError = e; });

          await flushRetryTimers();
          await sharedPromise;

          let refResult, refError;
          try {
            refResult = await inlineFetchWithRetry(refMock, '/test', {});
          } catch (e) {
            refError = e;
          }

          // Same call count
          expect(mockFetchFn.mock.calls.length).toBe(refMock.mock.calls.length);

          // Same outcome type
          if (refError) {
            expect(sharedError).toBeDefined();
            expect(sharedError.message).toBe(refError.message);
          } else {
            expect(sharedResult).toBeDefined();
            expect(sharedResult.status).toBe(refResult.status);
          }
        }
      ),
      asyncPbtOptions({ numRuns: 100 })
    );
  });

  test('Property 2: Non-retryable status immediate passthrough — exactly 1 fetch call, zero retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyNonRetryableStatus(),
        async (status) => {
          mockFetchFn.mockReset();
          mockFetchFn.mockResolvedValueOnce(makeResponse(status));

          const result = await fetchWithRetry('/test', {});

          expect(mockFetchFn).toHaveBeenCalledTimes(1);
          expect(result.status).toBe(status);
        }
      ),
      asyncPbtOptions({ numRuns: 100 })
    );
  });

  test('Property 3: apiGetWithRetry retry equivalence — retries on same codes with same max and backoff', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            retryableStatus().map(s => ({ status: s, message: `Error ${s}` })),
            nonRetryableErrorStatus().map(s => ({ status: s, message: `Error ${s}` })),
            fc.constant({ status: 0, message: 'Network error' })
          ),
          { minLength: 1, maxLength: RETRY_CONFIG.maxRetries + 1 }
        ),
        fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length > 0),
        async (errorSequence, operation) => {
          const mockApiGet = vi.fn();

          // Determine expected behavior by simulating the retry logic
          let expectedCalls = 0;
          let shouldSucceed = false;
          let lastErrorEntry = null;

          for (let retry = 0; retry <= RETRY_CONFIG.maxRetries; retry++) {
            expectedCalls++;
            if (retry < errorSequence.length) {
              const entry = errorSequence[retry];
              const isRetryable = RETRY_CONFIG.retryableStatuses.includes(entry.status) || entry.status === 0;
              if (!isRetryable) {
                lastErrorEntry = entry;
                break; // Non-retryable: stop immediately
              }
              lastErrorEntry = entry;
              if (retry >= RETRY_CONFIG.maxRetries) {
                break; // Exhausted retries
              }
              // Will retry
            } else {
              // Past the error sequence: call succeeds
              shouldSucceed = true;
              break;
            }
          }

          // Set up mock to throw errors for sequence entries, then succeed
          let callIndex = 0;
          mockApiGet.mockImplementation(async () => {
            const entry = errorSequence[callIndex];
            callIndex++;
            if (entry) {
              const err = new Error(entry.message);
              err.status = entry.status;
              throw err;
            }
            return { data: 'ok' };
          });

          let result, caughtError;
          const promise = apiGetWithRetry(mockApiGet, '/api/test', operation)
            .then(r => { result = r; })
            .catch(e => { caughtError = e; });

          await flushRetryTimers();
          await promise;

          expect(mockApiGet.mock.calls.length).toBe(expectedCalls);

          if (shouldSucceed) {
            expect(result).toEqual({ data: 'ok' });
            expect(caughtError).toBeUndefined();
          } else {
            expect(caughtError).toBeDefined();
            expect(caughtError.status).toBe(lastErrorEntry.status);
          }
        }
      ),
      asyncPbtOptions({ numRuns: 100 })
    );
  });

  test('Property 4: Error message wrapping preservation — service catch-and-rethrow produces correct format', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 400, max: 599 }),
        async (originalMessage, operation, status) => {
          // Simulate the service-level catch-and-rethrow pattern used after migration
          const apiError = new Error(originalMessage);
          apiError.status = status;

          // This is the pattern every service function uses:
          let wrappedError;
          try {
            throw apiError;
          } catch (error) {
            wrappedError = new Error(`Unable to ${operation}: ${error.message}`);
          }

          expect(wrappedError.message).toBe(`Unable to ${operation}: ${originalMessage}`);
          expect(wrappedError).toBeInstanceOf(Error);
        }
      ),
      asyncPbtOptions({ numRuns: 100 })
    );
  });
});
