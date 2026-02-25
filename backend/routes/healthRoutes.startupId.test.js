'use strict';

const request = require('supertest');
const express = require('express');

// Mock dependencies
jest.mock('../database/db', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    get: jest.fn((sql, cb) => cb(null, { test: 1 })),
    close: jest.fn((cb) => cb && cb(null))
  })
}));

jest.mock('../package.json', () => ({ version: '1.0.0-test' }), { virtual: true });

jest.mock('../services/sseService', () => ({
  getConnectionCount: jest.fn().mockReturnValue(0)
}));

jest.mock('../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

jest.mock('../services/updateCheckService', () => ({
  checkForUpdate: jest.fn()
}));

const healthRouter = require('./healthRoutes');

function buildApp(startupId = 'test-startup-id-abc123') {
  const app = express();
  app.locals.startupId = startupId;
  app.use('/api', healthRouter);
  return app;
}

describe('GET /api/version — startupId field', () => {
  it('includes startupId as a non-empty string', async () => {
    const res = await request(buildApp()).get('/api/version');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('startupId');
    expect(typeof res.body.startupId).toBe('string');
    expect(res.body.startupId.length).toBeGreaterThan(0);
  });

  it('returns consistent startupId across multiple requests', async () => {
    const app = buildApp('consistent-id-xyz');

    const res1 = await request(app).get('/api/version');
    const res2 = await request(app).get('/api/version');
    const res3 = await request(app).get('/api/version');

    expect(res1.body.startupId).toBe('consistent-id-xyz');
    expect(res2.body.startupId).toBe('consistent-id-xyz');
    expect(res3.body.startupId).toBe('consistent-id-xyz');
  });

  it('returns a valid UUID format when given a UUID', async () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const res = await request(buildApp(uuid)).get('/api/version');

    expect(res.body.startupId).toBe(uuid);
    expect(res.body.startupId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('includes startupId alongside version and environment', async () => {
    const res = await request(buildApp()).get('/api/version');

    expect(res.body).toHaveProperty('version', '1.0.0-test');
    expect(res.body).toHaveProperty('startupId');
    expect(res.body).toHaveProperty('environment');
  });
});
