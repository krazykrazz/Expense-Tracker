const express = require('express');
const request = require('supertest');

jest.mock('../config/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const crossSiteGuard = require('./crossSiteGuard');

const app = () => {
  const server = express();
  server.use('/api', crossSiteGuard);
  server.all('/api/thing', (req, res) => res.json({ ok: true }));
  return server;
};

describe('crossSiteGuard', () => {
  const saved = process.env.CORS_ORIGIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = saved;
  });

  test('refuses a change a page on another site sent, whatever the method', async () => {
    for (const method of ['post', 'put', 'delete', 'patch']) {
      const res = await request(app())[method]('/api/thing').set('Sec-Fetch-Site', 'cross-site').set('Origin', 'https://evil.example');
      expect(res.status).toBe(403);
    }
  });

  test('lets through the app\'s own requests, reads, and clients that send no Sec-Fetch-Site', async () => {
    await request(app()).post('/api/thing').set('Sec-Fetch-Site', 'same-origin').expect(200);
    await request(app()).post('/api/thing').set('Sec-Fetch-Site', 'same-site').expect(200);
    await request(app()).post('/api/thing').expect(200);
    await request(app()).get('/api/thing').set('Sec-Fetch-Site', 'cross-site').expect(200);
  });

  test('allows the origin configured in CORS_ORIGIN', async () => {
    process.env.CORS_ORIGIN = 'https://expenses.example';
    await request(app()).post('/api/thing').set('Sec-Fetch-Site', 'cross-site').set('Origin', 'https://expenses.example').expect(200);
    await request(app()).post('/api/thing').set('Sec-Fetch-Site', 'cross-site').set('Origin', 'https://evil.example').expect(403);
  });
});
