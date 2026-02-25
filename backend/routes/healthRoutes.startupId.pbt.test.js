'use strict';

/**
 * @invariant startupId Stability and Presence: For any valid startupId assigned to the Express app
 * and any number of sequential requests, every /api/version response contains the same non-empty
 * startupId string. Randomization adds value because startupId is a UUID that could contain
 * edge-case hex patterns, and varying request counts test stability under different load scenarios.
 *
 * Feature: container-update-refresh, Property 8
 * Validates: Requirements 4.1, 4.2
 */

const fc = require('fast-check');
const request = require('supertest');
const express = require('express');
const { pbtOptions } = require('../test/pbtArbitraries');

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

function buildApp(startupId) {
  const app = express();
  app.locals.startupId = startupId;
  app.use('/api', require('./healthRoutes'));
  return app;
}

// Feature: container-update-refresh, Property 8: startupId Stability and Presence
describe('Property 8: startupId Stability and Presence', () => {
  it('for any sequence of requests within the same process, all responses contain the same non-empty startupId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 2, max: 10 }),
        async (startupId, requestCount) => {
          const app = buildApp(startupId);

          const responses = [];
          for (let i = 0; i < requestCount; i++) {
            const res = await request(app).get('/api/version');
            responses.push(res.body);
          }

          // All responses must contain startupId as a non-empty string
          for (const body of responses) {
            expect(body).toHaveProperty('startupId');
            expect(typeof body.startupId).toBe('string');
            expect(body.startupId.length).toBeGreaterThan(0);
          }

          // All startupId values must be identical
          const ids = responses.map(r => r.startupId);
          const allSame = ids.every(id => id === ids[0]);
          expect(allSame).toBe(true);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });
});
