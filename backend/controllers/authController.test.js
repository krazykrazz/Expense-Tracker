const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const authService = require('../services/authService');
const activityLogService = require('../services/activityLogService');
const logger = require('../config/logger');
const authRoutes = require('../routes/authRoutes');

jest.mock('../services/authService');
jest.mock('../services/activityLogService');
jest.mock('../config/logger');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  return app;
}

describe('Auth HTTP contract', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  test('GET /status returns the service payload unchanged', async () => {
    const status = { passwordRequired: true, username: 'admin' };
    authService.getAuthStatus.mockResolvedValue(status);

    const response = await request(app).get('/api/auth/status').expect(200);

    expect(response.body).toEqual(status);
  });

  test('POST /login validates the password body before calling the service', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400);

    expect(response.body).toEqual({ error: 'Password is required' });
    expect(authService.login).not.toHaveBeenCalled();
  });

  test('POST /login returns an access token and an HTTP-only refresh cookie', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ password: 'secret' })
      .expect(200);

    expect(response.body).toEqual({ accessToken: 'access-token' });
    expect(authService.login).toHaveBeenCalledWith('secret');
    expect(response.headers['set-cookie']).toEqual([
      expect.stringMatching(/^refreshToken=refresh-token; Path=\/; HttpOnly; SameSite=Strict$/)
    ]);
  });

  test('POST /refresh requires and forwards the refresh cookie', async () => {
    await request(app).post('/api/auth/refresh').expect(401, {
      error: 'Invalid refresh token'
    });
    expect(authService.refreshAccessToken).not.toHaveBeenCalled();

    authService.refreshAccessToken.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh'
    });

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=old-refresh')
      .expect(200);

    expect(authService.refreshAccessToken).toHaveBeenCalledWith('old-refresh');
    expect(response.body).toEqual({ accessToken: 'new-access' });
    expect(response.headers['set-cookie'][0]).toMatch(/^refreshToken=new-refresh;/);
  });

  test('POST /logout clears the cookie and records the logout event', async () => {
    const response = await request(app).post('/api/auth/logout').expect(200);

    expect(response.body).toEqual({ message: 'Logged out' });
    expect(response.headers['set-cookie'][0]).toMatch(/^refreshToken=; Path=\/; Expires=/);
    expect(activityLogService.logEvent).toHaveBeenCalledWith(
      'auth_logout',
      'auth',
      null,
      "User 'admin' logged out",
      { username: 'admin' }
    );
  });

  test('PUT /password requires a new password', async () => {
    await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'current' })
      .expect(400, { error: 'New password is required' });

    expect(authService.setPassword).not.toHaveBeenCalled();
  });

  test('PUT /password treats an omitted current password as Open_Mode', async () => {
    authService.setPassword.mockResolvedValue();

    await request(app)
      .put('/api/auth/password')
      .send({ newPassword: 'replacement' })
      .expect(200, { message: 'Password updated' });

    expect(authService.setPassword).toHaveBeenCalledWith(null, 'replacement');
  });

  test('DELETE /password validates and forwards the current password', async () => {
    await request(app)
      .delete('/api/auth/password')
      .send({})
      .expect(400, { error: 'Current password is required' });

    authService.removePassword.mockResolvedValue();
    await request(app)
      .delete('/api/auth/password')
      .send({ currentPassword: 'current' })
      .expect(200, { message: 'Password removed' });

    expect(authService.removePassword).toHaveBeenCalledWith('current');
  });

  test.each([
    ['login', () => request(app).post('/api/auth/login').send({ password: 'wrong' }), 'login'],
    ['refresh', () => request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=invalid'), 'refreshAccessToken'],
    ['password update', () => request(app).put('/api/auth/password').send({ newPassword: 'short' }), 'setPassword'],
    ['password removal', () => request(app).delete('/api/auth/password').send({ currentPassword: 'wrong' }), 'removePassword']
  ])('returns the service status code for %s errors', async (_name, makeRequest, serviceMethod) => {
    authService[serviceMethod].mockRejectedValue(
      Object.assign(new Error('Invalid authentication input'), { statusCode: 401 })
    );

    const response = await makeRequest().expect(401);

    expect(response.body).toEqual({ error: 'Invalid authentication input' });
  });

  test('maps unexpected status failures to a safe 500 response', async () => {
    authService.getAuthStatus.mockRejectedValue(new Error('database secret'));

    const response = await request(app).get('/api/auth/status').expect(500);

    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(logger.error).toHaveBeenCalledWith(
      'Auth: Status error',
      expect.objectContaining({ error: 'database secret' })
    );
  });
});
