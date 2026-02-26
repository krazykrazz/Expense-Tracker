/**
 * Auth Middleware Integration Tests
 *
 * Tests the actual middleware behavior with real database, real auth service,
 * and real JWT tokens. Covers Open_Mode passthrough, Password_Gate enforcement,
 * public endpoint exemption, token validation, TOKEN_EXPIRED response, and
 * SSE query param auth.
 *
 * Requirements: 13.2
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let authService;
let userRepository;
let authMiddleware;
let sseAuthMiddleware;

// Build a minimal Express app that mirrors the real server's middleware chain
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Auth routes (public — registered before authMiddleware)
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/auth/status', (req, res) => res.json({ passwordRequired: false }));
  app.post('/api/auth/login', (req, res) => res.json({ accessToken: 'test' }));
  app.post('/api/auth/refresh', (req, res) => res.json({ accessToken: 'test' }));

  // SSE route — registered BEFORE authMiddleware (mirrors real server.js)
  app.get('/api/events', sseAuthMiddleware, (req, res) => {
    res.json({ data: 'sse', user: req.user || null });
  });

  // Auth middleware — protects everything below
  app.use('/api', authMiddleware);

  // Protected routes
  app.get('/api/expenses', (req, res) => res.json({ data: 'expenses', user: req.user || null }));
  app.get('/api/income', (req, res) => res.json({ data: 'income' }));
  app.post('/api/budgets', (req, res) => res.json({ data: 'budgets' }));
  app.put('/api/settings/timezone', (req, res) => res.json({ data: 'settings' }));
  app.delete('/api/people/1', (req, res) => res.json({ data: 'deleted' }));

  return app;
}

beforeAll(async () => {
  db = await createIsolatedTestDb();

  // Override the database module to use our isolated db
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
    db.run("UPDATE users SET password_hash = '' WHERE username = 'admin'", (err) =>
      err ? reject(err) : resolve()
    );
  });
  authService.invalidateAuthCache();
  await authService.refreshAuthCache();
}

async function enablePasswordGate(password = 'testpass1234') {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(password, 10);
  await new Promise((resolve, reject) => {
    db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, 'admin'], (err) =>
      err ? reject(err) : resolve()
    );
  });
  authService.invalidateAuthCache();
  await authService.refreshAuthCache();
}

async function generateValidToken() {
  const secret = await authService.getJwtSecret();
  return jwt.sign({ sub: 1, username: 'admin' }, secret, { expiresIn: '15m' });
}

async function generateExpiredToken() {
  const secret = await authService.getJwtSecret();
  const token = jwt.sign({ sub: 1, username: 'admin' }, secret, { expiresIn: '0s' });
  // Wait for token to expire
  await new Promise((r) => setTimeout(r, 50));
  return token;
}

// ─── Tests ───

describe('Auth Middleware Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    await resetToOpenMode();
  });

  describe('Open_Mode passthrough', () => {
    test('allows GET requests without any auth header', async () => {
      const res = await request(app).get('/api/expenses').expect(200);
      expect(res.body.data).toBe('expenses');
    });

    test('allows POST requests without any auth header', async () => {
      const res = await request(app).post('/api/budgets').send({}).expect(200);
      expect(res.body.data).toBe('budgets');
    });

    test('allows PUT requests without any auth header', async () => {
      const res = await request(app).put('/api/settings/timezone').send({}).expect(200);
      expect(res.body.data).toBe('settings');
    });

    test('allows DELETE requests without any auth header', async () => {
      const res = await request(app).delete('/api/people/1').expect(200);
      expect(res.body.data).toBe('deleted');
    });

    test('allows requests with an invalid auth header (ignored in Open_Mode)', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Bearer totally-invalid-token')
        .expect(200);
      expect(res.body.data).toBe('expenses');
    });

    test('allows SSE endpoint without token query param', async () => {
      const res = await request(app).get('/api/events').expect(200);
      expect(res.body.data).toBe('sse');
    });
  });

  describe('Password_Gate enforcement', () => {
    beforeEach(async () => {
      await enablePasswordGate();
    });

    test('rejects GET request without auth header with AUTH_REQUIRED', async () => {
      const res = await request(app).get('/api/expenses').expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
      expect(res.body.error).toBe('Authentication required');
    });

    test('rejects POST request without auth header', async () => {
      const res = await request(app).post('/api/budgets').send({}).expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    test('rejects request with empty Bearer token', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Bearer ')
        .expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    test('rejects request with invalid Bearer token', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Bearer not-a-real-jwt')
        .expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    test('rejects request with Basic auth instead of Bearer', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    test('rejects request with token signed by wrong secret', async () => {
      const wrongToken = jwt.sign({ sub: 1, username: 'admin' }, 'wrong-secret', {
        expiresIn: '15m'
      });
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${wrongToken}`)
        .expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Token validation — valid token passes through', () => {
    beforeEach(async () => {
      await enablePasswordGate();
    });

    test('allows request with valid Bearer token', async () => {
      const token = await generateValidToken();
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.data).toBe('expenses');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.sub).toBe(1);
    });

    test('sets req.user with decoded token claims', async () => {
      const token = await generateValidToken();
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.user).toMatchObject({ sub: 1, username: 'admin' });
      expect(res.body.user).toHaveProperty('iat');
      expect(res.body.user).toHaveProperty('exp');
    });
  });

  describe('TOKEN_EXPIRED response', () => {
    beforeEach(async () => {
      await enablePasswordGate();
    });

    test('returns TOKEN_EXPIRED for expired token', async () => {
      const token = await generateExpiredToken();
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
      expect(res.body.error).toBe('Token expired');
    });

    test('TOKEN_EXPIRED is distinct from AUTH_REQUIRED', async () => {
      const expiredToken = await generateExpiredToken();
      const expiredRes = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      const noTokenRes = await request(app).get('/api/expenses').expect(401);

      expect(expiredRes.body.code).toBe('TOKEN_EXPIRED');
      expect(noTokenRes.body.code).toBe('AUTH_REQUIRED');
      expect(expiredRes.body.code).not.toBe(noTokenRes.body.code);
    });
  });

  describe('Public endpoint exemption', () => {
    beforeEach(async () => {
      await enablePasswordGate();
    });

    test('GET /api/health is accessible without token', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    test('GET /api/auth/status is accessible without token', async () => {
      const res = await request(app).get('/api/auth/status').expect(200);
      expect(res.body).toHaveProperty('passwordRequired');
    });

    test('POST /api/auth/login is accessible without token', async () => {
      const res = await request(app).post('/api/auth/login').send({}).expect(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    test('POST /api/auth/refresh is accessible without token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({}).expect(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    test('public endpoints accessible even with invalid auth header', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Authorization', 'Bearer garbage')
        .expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('SSE query param auth', () => {
    test('Open_Mode: SSE endpoint accessible without token', async () => {
      await resetToOpenMode();
      const res = await request(app).get('/api/events').expect(200);
      expect(res.body.data).toBe('sse');
    });

    test('Password_Gate: SSE endpoint rejects without token query param', async () => {
      await enablePasswordGate();
      const res = await request(app).get('/api/events').expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    test('Password_Gate: SSE endpoint accepts valid token in query param', async () => {
      await enablePasswordGate();
      const token = await generateValidToken();
      const res = await request(app).get(`/api/events?token=${token}`).expect(200);
      expect(res.body.data).toBe('sse');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('admin');
    });

    test('Password_Gate: SSE endpoint rejects expired token in query param', async () => {
      await enablePasswordGate();
      const token = await generateExpiredToken();
      const res = await request(app).get(`/api/events?token=${token}`).expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    test('Password_Gate: SSE endpoint rejects invalid token in query param', async () => {
      await enablePasswordGate();
      const res = await request(app).get('/api/events?token=invalid-jwt').expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Mode transitions', () => {
    test('middleware respects transition from Open_Mode to Password_Gate', async () => {
      // Start in Open_Mode — request passes
      await request(app).get('/api/expenses').expect(200);

      // Enable Password_Gate
      await enablePasswordGate();

      // Now request without token should fail
      const res = await request(app).get('/api/expenses').expect(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');

      // Request with valid token should pass
      const token = await generateValidToken();
      await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    test('middleware respects transition from Password_Gate back to Open_Mode', async () => {
      // Start in Password_Gate
      await enablePasswordGate();
      await request(app).get('/api/expenses').expect(401);

      // Return to Open_Mode
      await resetToOpenMode();

      // Request without token should pass again
      const res = await request(app).get('/api/expenses').expect(200);
      expect(res.body.data).toBe('expenses');
    });
  });
});
