/**
 * Property-Based Tests for Auth Middleware
 *
 * @invariant Open_Mode passthrough: For any request path and any request
 * (with or without an Authorization header), while the Auth_Service is in
 * Open_Mode (no password set), the auth middleware allows the request through
 * without returning 401. Password_Gate enforcement: For any non-public API
 * endpoint, while the Password_Gate is active, a request without a valid
 * Bearer token receives a 401 response; a request with a valid token is
 * allowed through. Randomization covers diverse API paths, HTTP methods,
 * and header combinations to ensure auth invariants hold universally.
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const fc = require('fast-check');
const jwt = require('jsonwebtoken');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let authService;
let userRepository;
let authMiddleware;
let sseAuthMiddleware;

beforeAll(async () => {
  db = await createIsolatedTestDb();
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  userRepository = require('../repositories/userRepository');
  authService = require('../services/authService');
  const middleware = require('./authMiddleware');
  authMiddleware = middleware.authMiddleware;
  sseAuthMiddleware = middleware.sseAuthMiddleware;

  // Seed the default admin user
  await userRepository.createUser('admin', '');
  await authService.refreshAuthCache();
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

// ─── Helpers ───

async function resetToOpenMode() {
  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET password_hash = '' WHERE username = 'admin'",
      (err) => (err ? reject(err) : resolve())
    );
  });
  authService.invalidateAuthCache();
  await authService.refreshAuthCache();
}

async function setPasswordGateActive(password) {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(password, 10);
  await new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password_hash = ? WHERE username = ?',
      [hash, 'admin'],
      (err) => (err ? reject(err) : resolve())
    );
  });
  authService.invalidateAuthCache();
  await authService.refreshAuthCache();
}

function createMockReq(method, path, headers = {}, query = {}) {
  return { method, path, headers, query };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    }
  };
  return res;
}

async function generateValidToken() {
  const secret = await authService.getJwtSecret();
  return jwt.sign({ sub: 1, username: 'admin' }, secret, { expiresIn: '15m' });
}

async function generateExpiredToken() {
  const secret = await authService.getJwtSecret();
  const token = jwt.sign({ sub: 1, username: 'admin' }, secret, { expiresIn: '0s' });
  await new Promise(r => setTimeout(r, 50));
  return token;
}

// ─── Arbitraries ───

const protectedPath = fc.constantFrom(
  '/api/expenses', '/api/income', '/api/loans', '/api/budgets',
  '/api/backup/config', '/api/settings/timezone', '/api/people',
  '/api/investments', '/api/categories', '/api/reminders',
  '/api/payment-methods', '/api/analytics/spending-patterns'
);

const anyApiPath = fc.oneof(
  protectedPath,
  fc.constantFrom(
    '/api/health', '/api/auth/status', '/api/auth/login', '/api/auth/refresh'
  )
);

const httpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

const optionalAuthHeader = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('Bearer '),
  fc.constant('Bearer invalid-token'),
  fc.constant('Basic dXNlcjpwYXNz')
);

// ─── Tests ───

describe('Auth Middleware Property-Based Tests', () => {
  beforeEach(async () => {
    await resetToOpenMode();
  });

  /**
   * **Feature: auth-infrastructure, Property 4: Open_Mode passthrough**
   * **Validates: Requirements 3.1, 5.5, 7.2**
   *
   * For any request path and any request (with or without Authorization header),
   * while Open_Mode, middleware allows request through without 401.
   */
  test('Property 4: Open_Mode passthrough — authMiddleware', () => {
    return fc.assert(
      fc.asyncProperty(httpMethod, anyApiPath, optionalAuthHeader, async (method, path, authHeader) => {
        await resetToOpenMode();

        const headers = authHeader ? { authorization: authHeader } : {};
        const req = createMockReq(method, path, headers);
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await authMiddleware(req, res, next);

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
      }),
      dbPbtOptions()
    );
  });

  test('Property 4: Open_Mode passthrough — sseAuthMiddleware', () => {
    return fc.assert(
      fc.asyncProperty(optionalAuthHeader, async (tokenParam) => {
        await resetToOpenMode();

        const query = tokenParam ? { token: tokenParam } : {};
        const req = createMockReq('GET', '/api/events', {}, query);
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await sseAuthMiddleware(req, res, next);

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
      }),
      dbPbtOptions()
    );
  });

  /**
   * **Feature: auth-infrastructure, Property 5: Password_Gate enforcement**
   * **Validates: Requirements 3.2, 3.3, 5.1, 5.3, 7.1**
   *
   * For any non-public endpoint, while Password_Gate active, request without
   * valid token gets 401; with valid token gets through.
   */
  test('Property 5: Password_Gate enforcement — no token gets 401', () => {
    return fc.assert(
      fc.asyncProperty(httpMethod, protectedPath, optionalAuthHeader, async (method, path, authHeader) => {
        await setPasswordGateActive('testpass1234');

        const headers = authHeader ? { authorization: authHeader } : {};
        const req = createMockReq(method, path, headers);
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await authMiddleware(req, res, next);

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('code');
        expect(['AUTH_REQUIRED', 'TOKEN_EXPIRED']).toContain(res.body.code);
      }),
      dbPbtOptions()
    );
  });

  test('Property 5: Password_Gate enforcement — valid token passes through', () => {
    return fc.assert(
      fc.asyncProperty(httpMethod, protectedPath, async (method, path) => {
        await setPasswordGateActive('testpass1234');

        const token = await generateValidToken();
        const req = createMockReq(method, path, { authorization: `Bearer ${token}` });
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await authMiddleware(req, res, next);

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
        expect(req.user).toBeDefined();
        expect(req.user.username).toBe('admin');
      }),
      dbPbtOptions()
    );
  });

  test('Property 5: Password_Gate enforcement — expired token gets TOKEN_EXPIRED', async () => {
    await setPasswordGateActive('testpass1234');

    const token = await generateExpiredToken();
    const req = createMockReq('GET', '/api/expenses', { authorization: `Bearer ${token}` });
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await authMiddleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('Property 5: Password_Gate enforcement — public endpoints always accessible', () => {
    const publicEndpoint = fc.constantFrom(
      { method: 'GET', path: '/api/health' },
      { method: 'GET', path: '/api/auth/status' },
      { method: 'POST', path: '/api/auth/login' },
      { method: 'POST', path: '/api/auth/refresh' }
    );

    return fc.assert(
      fc.asyncProperty(publicEndpoint, optionalAuthHeader, async (endpoint, authHeader) => {
        await setPasswordGateActive('testpass1234');

        const headers = authHeader ? { authorization: authHeader } : {};
        const req = createMockReq(endpoint.method, endpoint.path, headers);
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await authMiddleware(req, res, next);

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
      }),
      dbPbtOptions()
    );
  });

  test('Property 5: SSE Password_Gate enforcement — no token gets 401', async () => {
    await setPasswordGateActive('testpass1234');

    const req = createMockReq('GET', '/api/events', {}, {});
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await sseAuthMiddleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  test('Property 5: SSE Password_Gate enforcement — valid token passes through', async () => {
    await setPasswordGateActive('testpass1234');

    const token = await generateValidToken();
    const req = createMockReq('GET', '/api/events', {}, { token });
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await sseAuthMiddleware(req, res, next);

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
    expect(req.user).toBeDefined();
    expect(req.user.username).toBe('admin');
  });
});
