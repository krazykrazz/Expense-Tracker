/**
 * Property-Based Tests for authFetch — Silent Refresh on TOKEN_EXPIRED
 *
 * @invariant
 * Property 10: authFetch silent refresh on TOKEN_EXPIRED
 * Feature: auth-infrastructure, Property 10
 * For any API call that receives a 401 response with "code": "TOKEN_EXPIRED",
 * the authFetch wrapper attempts exactly one token refresh before retrying the
 * original request. If the refresh succeeds, the retried request uses the new token.
 * If the refresh fails, the onAuthFailure callback is invoked.
 * Validates: Requirements 8.4
 *
 * Randomization adds value because it tests the refresh behavior across arbitrary
 * URL paths, HTTP methods, and header combinations — ensuring the wrapper handles
 * any request shape correctly, not just a few hand-picked examples.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';

// Mock fetchProvider so getNativeFetch returns our mockFetch
const mockFetch = vi.fn();
vi.mock('./fetchProvider', () => ({
  getNativeFetch: () => mockFetch
}));

import { createAuthFetch } from './authFetch';

// ── Generators ──

const httpMethod = () => fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

const apiPath = () => fc.constantFrom(
  '/api/expenses', '/api/income', '/api/loans', '/api/budgets',
  '/api/backup/config', '/api/settings/timezone', '/api/people',
  '/api/investments', '/api/fixed-expenses', '/api/categories'
);

const tokenString = () => fc.string({ minLength: 10, maxLength: 80 })
  .filter(s => s.trim().length > 0);

// ── Helpers ──

function makeResponse(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    clone: function() { return { ...this, json: () => Promise.resolve(body) }; }
  };
}

describe('authFetch PBT — silent refresh on TOKEN_EXPIRED', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('Property 10a: on TOKEN_EXPIRED, attempts exactly one refresh then retries with new token', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiPath(),
        httpMethod(),
        tokenString(),
        tokenString(),
        async (url, method, oldToken, newToken) => {
          mockFetch.mockReset();

          let currentToken = oldToken;
          const getToken = () => currentToken;
          const refreshToken = vi.fn(async () => {
            currentToken = newToken;
            return true;
          });
          const onAuthFailure = vi.fn();

          const authFetch = createAuthFetch(getToken, refreshToken, onAuthFailure);

          mockFetch
            .mockResolvedValueOnce(makeResponse(401, { code: 'TOKEN_EXPIRED' }))
            .mockResolvedValueOnce(makeResponse(200, { data: 'ok' }));

          const response = await authFetch(url, { method });

          // Refresh was called exactly once
          expect(refreshToken).toHaveBeenCalledTimes(1);

          // fetch was called twice: original + retry
          expect(mockFetch).toHaveBeenCalledTimes(2);

          // Retry used the new token
          const retryCall = mockFetch.mock.calls[1];
          expect(retryCall[1].headers['Authorization']).toBe(`Bearer ${newToken}`);

          // onAuthFailure was NOT called
          expect(onAuthFailure).not.toHaveBeenCalled();

          // Got the successful response
          expect(response.status).toBe(200);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 10b: on TOKEN_EXPIRED with failed refresh, calls onAuthFailure', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiPath(),
        httpMethod(),
        tokenString(),
        async (url, method, token) => {
          mockFetch.mockReset();

          const getToken = () => token;
          const refreshToken = vi.fn(async () => false);
          const onAuthFailure = vi.fn();

          const authFetch = createAuthFetch(getToken, refreshToken, onAuthFailure);

          mockFetch.mockResolvedValueOnce(makeResponse(401, { code: 'TOKEN_EXPIRED' }));

          await authFetch(url, { method });

          // Refresh was attempted exactly once
          expect(refreshToken).toHaveBeenCalledTimes(1);

          // No retry — only the original call
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // Auth failure callback was invoked
          expect(onAuthFailure).toHaveBeenCalledTimes(1);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 10c: non-TOKEN_EXPIRED 401 does not trigger refresh', async () => {
    await fc.assert(
      fc.asyncProperty(
        apiPath(),
        httpMethod(),
        tokenString(),
        async (url, method, token) => {
          mockFetch.mockReset();

          const getToken = () => token;
          const refreshToken = vi.fn(async () => true);
          const onAuthFailure = vi.fn();

          const authFetch = createAuthFetch(getToken, refreshToken, onAuthFailure);

          // 401 with AUTH_REQUIRED (not TOKEN_EXPIRED)
          mockFetch.mockResolvedValueOnce(makeResponse(401, { code: 'AUTH_REQUIRED' }));

          const response = await authFetch(url, { method });

          // No refresh attempted
          expect(refreshToken).not.toHaveBeenCalled();

          // Only one fetch call
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // onAuthFailure not called
          expect(onAuthFailure).not.toHaveBeenCalled();

          expect(response.status).toBe(401);
        }
      ),
      pbtOptions()
    );
  });

  test('Property 10d: concurrent TOKEN_EXPIRED responses share a single refresh', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        tokenString(),
        tokenString(),
        async (concurrentCount, oldToken, newToken) => {
          mockFetch.mockReset();

          let currentToken = oldToken;
          const getToken = () => currentToken;
          const refreshToken = vi.fn(async () => {
            currentToken = newToken;
            return true;
          });
          const onAuthFailure = vi.fn();

          const authFetch = createAuthFetch(getToken, refreshToken, onAuthFailure);

          // All initial calls return TOKEN_EXPIRED, all retries succeed
          for (let i = 0; i < concurrentCount; i++) {
            mockFetch.mockResolvedValueOnce(makeResponse(401, { code: 'TOKEN_EXPIRED' }));
          }
          for (let i = 0; i < concurrentCount; i++) {
            mockFetch.mockResolvedValueOnce(makeResponse(200, { data: 'ok' }));
          }

          const promises = Array.from({ length: concurrentCount }, (_, i) =>
            authFetch(`/api/test-${i}`, { method: 'GET' })
          );

          await Promise.all(promises);

          // Shared refresh promise: refreshToken called exactly once
          expect(refreshToken).toHaveBeenCalledTimes(1);
          expect(onAuthFailure).not.toHaveBeenCalled();
        }
      ),
      pbtOptions()
    );
  });
});
