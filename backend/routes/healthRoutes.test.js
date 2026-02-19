'use strict';

const request = require('supertest');
const express = require('express');

// Mock dependencies before requiring the router
jest.mock('../database/db', () => ({
  getDatabase: jest.fn().mockResolvedValue({
    get: jest.fn((sql, cb) => cb(null, { test: 1 })),
    close: jest.fn((cb) => cb && cb(null))
  })
}));

jest.mock('../package.json', () => ({ version: '1.0.0-test' }), { virtual: true });

jest.mock('../services/sseService', () => ({
  getConnectionCount: jest.fn()
}));

jest.mock('../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const sseService = require('../services/sseService');
const healthRouter = require('./healthRoutes');

function buildApp() {
  const app = express();
  app.use('/api', healthRouter);
  return app;
}

describe('GET /api/health — sseConnections field', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes sseConnections as a non-negative integer when there are active connections', async () => {
    sseService.getConnectionCount.mockReturnValue(3);

    const res = await request(buildApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sseConnections', 3);
    expect(typeof res.body.sseConnections).toBe('number');
    expect(res.body.sseConnections).toBeGreaterThanOrEqual(0);
  });

  it('includes sseConnections as 0 when no clients are connected', async () => {
    sseService.getConnectionCount.mockReturnValue(0);

    const res = await request(buildApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sseConnections', 0);
    expect(typeof res.body.sseConnections).toBe('number');
    expect(res.body.sseConnections).toBeGreaterThanOrEqual(0);
  });

  it('includes sseConnections even when the database check fails', async () => {
    const { getDatabase } = require('../database/db');
    getDatabase.mockResolvedValueOnce({
      get: jest.fn((sql, cb) => cb(new Error('DB error'))),
      close: jest.fn((cb) => cb && cb(null))
    });
    sseService.getConnectionCount.mockReturnValue(2);

    const res = await request(buildApp()).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('sseConnections', 2);
    expect(typeof res.body.sseConnections).toBe('number');
    expect(res.body.sseConnections).toBeGreaterThanOrEqual(0);
  });
});
