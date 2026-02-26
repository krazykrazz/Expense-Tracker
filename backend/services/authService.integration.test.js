/**
 * Auth Service Integration Tests
 *
 * Tests the authService against a real SQLite database with real bcrypt hashing
 * and real JWT token generation. No mocks — full integration through the
 * repository layer.
 *
 * Covers: user creation, password hashing, login flow, token generation,
 * password change, Open_Mode ↔ Password_Gate transitions, token refresh,
 * and error handling.
 *
 * Requirements: 13.1
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let authService;
let userRepository;

beforeAll(async () => {
  db = await createIsolatedTestDb();

  // Override the database module to use our isolated db
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  userRepository = require('../repositories/userRepository');
  authService = require('./authService');
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

beforeEach(async () => {
  // Reset to clean state: admin user with empty password (Open_Mode)
  await new Promise((resolve, reject) => {
    db.run("DELETE FROM users", (err) => err ? reject(err) : resolve());
  });
  await new Promise((resolve, reject) => {
    db.run("DELETE FROM settings WHERE key = 'jwt_secret'", (err) => err ? reject(err) : resolve());
  });
  await userRepository.createUser('admin', '');
  authService._resetAuthStateCache();
  await authService.refreshAuthCache();
});

// ─── User Initialization ───

describe('Auth Service Integration Tests', () => {
  describe('initializeDefaultUser', () => {
    test('creates admin user when no user exists', async () => {
      // Clear all users
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM users", (err) => err ? reject(err) : resolve());
      });

      await authService.initializeDefaultUser();

      const user = await userRepository.findByUsername('admin');
      expect(user).not.toBeNull();
      expect(user.username).toBe('admin');
      expect(user.password_hash).toBe('');
    });

    test('preserves existing user record when called again', async () => {
      // Set a password on the existing admin user
      await authService.setPassword(null, 'mypassword');
      const userBefore = await userRepository.findByUsername('admin');

      // Call initializeDefaultUser again
      await authService.initializeDefaultUser();

      const userAfter = await userRepository.findByUsername('admin');
      expect(userAfter.id).toBe(userBefore.id);
      expect(userAfter.password_hash).toBe(userBefore.password_hash);
    });

    test('initializes auth cache after creating user', async () => {
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM users", (err) => err ? reject(err) : resolve());
      });
      authService._resetAuthStateCache();

      await authService.initializeDefaultUser();

      // Cache should be initialized and in Open_Mode
      expect(authService.isPasswordGateActive()).toBe(false);
    });
  });

  // ─── JWT Secret Management ───

  describe('getJwtSecret', () => {
    test('generates and stores a JWT secret on first call', async () => {
      const secret = await authService.getJwtSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(128); // 64 bytes → 128 hex chars
    });

    test('returns the same secret on subsequent calls', async () => {
      const secret1 = await authService.getJwtSecret();
      const secret2 = await authService.getJwtSecret();

      expect(secret1).toBe(secret2);
    });
  });

  // ─── Auth Status ───

  describe('getAuthStatus', () => {
    test('returns Open_Mode when no password is set', async () => {
      const status = await authService.getAuthStatus();

      expect(status.passwordRequired).toBe(false);
      expect(status.username).toBe('admin');
    });

    test('returns Password_Gate active after password is set', async () => {
      await authService.setPassword(null, 'testpass');

      const status = await authService.getAuthStatus();
      expect(status.passwordRequired).toBe(true);
      expect(status.username).toBe('admin');
    });
  });

  // ─── Password Management ───

  describe('setPassword', () => {
    test('hashes password with bcrypt and stores it', async () => {
      await authService.setPassword(null, 'mypassword');

      const user = await userRepository.findByUsername('admin');
      expect(user.password_hash).not.toBe('');
      expect(user.password_hash).not.toBe('mypassword');

      // Verify bcrypt hash is valid
      const isValid = await bcrypt.compare('mypassword', user.password_hash);
      expect(isValid).toBe(true);
    });

    test('rejects password shorter than 4 characters', async () => {
      await expect(authService.setPassword(null, 'abc')).rejects.toThrow(
        'Password must be at least 4 characters'
      );

      // Verify no password was set
      const user = await userRepository.findByUsername('admin');
      expect(user.password_hash).toBe('');
    });

    test('rejects empty password', async () => {
      await expect(authService.setPassword(null, '')).rejects.toThrow(
        'Password must be at least 4 characters'
      );
    });

    test('rejects null password', async () => {
      await expect(authService.setPassword(null, null)).rejects.toThrow(
        'Password must be at least 4 characters'
      );
    });

    test('accepts password of exactly 4 characters', async () => {
      await authService.setPassword(null, 'abcd');

      const user = await userRepository.findByUsername('admin');
      const isValid = await bcrypt.compare('abcd', user.password_hash);
      expect(isValid).toBe(true);
    });

    test('requires current password when Password_Gate is active', async () => {
      await authService.setPassword(null, 'original');

      await expect(authService.setPassword(null, 'newpass')).rejects.toThrow(
        'Current password is required'
      );
    });

    test('rejects incorrect current password', async () => {
      await authService.setPassword(null, 'original');

      await expect(authService.setPassword('wrongpass', 'newpass')).rejects.toThrow(
        'Current password is incorrect'
      );
    });

    test('allows password change with correct current password', async () => {
      await authService.setPassword(null, 'original');
      await authService.setPassword('original', 'newpass1');

      const user = await userRepository.findByUsername('admin');
      const isValid = await bcrypt.compare('newpass1', user.password_hash);
      expect(isValid).toBe(true);
    });

    test('activates Password_Gate after setting password', async () => {
      expect(authService.isPasswordGateActive()).toBe(false);

      await authService.setPassword(null, 'testpass');

      expect(authService.isPasswordGateActive()).toBe(true);
    });
  });

  // ─── Remove Password ───

  describe('removePassword', () => {
    test('clears password hash and returns to Open_Mode', async () => {
      await authService.setPassword(null, 'testpass');
      expect(authService.isPasswordGateActive()).toBe(true);

      await authService.removePassword('testpass');

      expect(authService.isPasswordGateActive()).toBe(false);
      const user = await userRepository.findByUsername('admin');
      expect(user.password_hash).toBe('');
    });

    test('rejects when no password is currently set', async () => {
      await expect(authService.removePassword('anything')).rejects.toThrow(
        'No password is currently set'
      );
    });

    test('rejects when current password is incorrect', async () => {
      await authService.setPassword(null, 'testpass');

      await expect(authService.removePassword('wrongpass')).rejects.toThrow(
        'Current password is incorrect'
      );

      // Password should still be active
      expect(authService.isPasswordGateActive()).toBe(true);
    });

    test('rejects when current password is not provided', async () => {
      await authService.setPassword(null, 'testpass');

      await expect(authService.removePassword(null)).rejects.toThrow(
        'Current password is required'
      );
    });
  });

  // ─── Login ───

  describe('login', () => {
    test('returns access and refresh tokens on valid login', async () => {
      await authService.setPassword(null, 'testpass');

      const result = await authService.login('testpass');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    test('access token contains correct claims', async () => {
      await authService.setPassword(null, 'testpass');
      const { accessToken } = await authService.login('testpass');
      const secret = await authService.getJwtSecret();
      const user = await userRepository.findByUsername('admin');

      const decoded = jwt.verify(accessToken, secret);

      expect(decoded.sub).toBe(user.id);
      expect(decoded.username).toBe('admin');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      // Access token should NOT have type: 'refresh'
      expect(decoded.type).toBeUndefined();
    });

    test('refresh token contains correct claims including type', async () => {
      await authService.setPassword(null, 'testpass');
      const { refreshToken } = await authService.login('testpass');
      const secret = await authService.getJwtSecret();
      const user = await userRepository.findByUsername('admin');

      const decoded = jwt.verify(refreshToken, secret);

      expect(decoded.sub).toBe(user.id);
      expect(decoded.username).toBe('admin');
      expect(decoded.type).toBe('refresh');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    test('access token expires in ~15 minutes', async () => {
      await authService.setPassword(null, 'testpass');
      const { accessToken } = await authService.login('testpass');
      const secret = await authService.getJwtSecret();

      const decoded = jwt.verify(accessToken, secret);
      const expiresInSeconds = decoded.exp - decoded.iat;

      // 15 minutes = 900 seconds
      expect(expiresInSeconds).toBe(900);
    });

    test('refresh token expires in ~7 days', async () => {
      await authService.setPassword(null, 'testpass');
      const { refreshToken } = await authService.login('testpass');
      const secret = await authService.getJwtSecret();

      const decoded = jwt.verify(refreshToken, secret);
      const expiresInSeconds = decoded.exp - decoded.iat;

      // 7 days = 604800 seconds
      expect(expiresInSeconds).toBe(604800);
    });

    test('rejects login with wrong password', async () => {
      await authService.setPassword(null, 'testpass');

      await expect(authService.login('wrongpass')).rejects.toThrow('Invalid credentials');
    });

    test('rejects login with empty password', async () => {
      await authService.setPassword(null, 'testpass');

      await expect(authService.login('')).rejects.toThrow('Invalid credentials');
    });

    test('rejects login when no password is set (Open_Mode)', async () => {
      // In Open_Mode, password_hash is empty — login should fail
      await expect(authService.login('anything')).rejects.toThrow('Invalid credentials');
    });

    test('login error has 401 status code', async () => {
      await authService.setPassword(null, 'testpass');

      try {
        await authService.login('wrongpass');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }
    });
  });

  // ─── Token Refresh ───

  describe('refreshAccessToken', () => {
    test('issues new token pair from valid refresh token', async () => {
      await authService.setPassword(null, 'testpass');
      const { refreshToken } = await authService.login('testpass');

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    test('new access token is valid and has correct claims', async () => {
      await authService.setPassword(null, 'testpass');
      const { refreshToken } = await authService.login('testpass');
      const secret = await authService.getJwtSecret();
      const user = await userRepository.findByUsername('admin');

      const result = await authService.refreshAccessToken(refreshToken);
      const decoded = jwt.verify(result.accessToken, secret);

      expect(decoded.sub).toBe(user.id);
      expect(decoded.username).toBe('admin');
      expect(decoded.type).toBeUndefined();
    });

    test('rejects null refresh token', async () => {
      await expect(authService.refreshAccessToken(null)).rejects.toThrow('Invalid refresh token');
    });

    test('rejects empty refresh token', async () => {
      await expect(authService.refreshAccessToken('')).rejects.toThrow('Invalid refresh token');
    });

    test('rejects tampered refresh token', async () => {
      await expect(authService.refreshAccessToken('not-a-valid-jwt')).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    test('rejects access token used as refresh token', async () => {
      await authService.setPassword(null, 'testpass');
      const { accessToken } = await authService.login('testpass');

      // Access token doesn't have type: 'refresh', so it should be rejected
      await expect(authService.refreshAccessToken(accessToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    test('rejects token signed with wrong secret', async () => {
      const fakeRefresh = jwt.sign(
        { sub: 1, username: 'admin', type: 'refresh' },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      await expect(authService.refreshAccessToken(fakeRefresh)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    test('rejects expired refresh token', async () => {
      const secret = await authService.getJwtSecret();
      const expiredRefresh = jwt.sign(
        { sub: 1, username: 'admin', type: 'refresh' },
        secret,
        { expiresIn: '0s' }
      );
      // Wait for expiry
      await new Promise((r) => setTimeout(r, 50));

      await expect(authService.refreshAccessToken(expiredRefresh)).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });

  // ─── Auth State Cache ───

  describe('auth state cache', () => {
    test('isPasswordGateActive returns false in Open_Mode', () => {
      expect(authService.isPasswordGateActive()).toBe(false);
    });

    test('isPasswordGateActive returns true after password set', async () => {
      await authService.setPassword(null, 'testpass');
      expect(authService.isPasswordGateActive()).toBe(true);
    });

    test('invalidateAuthCache forces re-read on next check', async () => {
      await authService.setPassword(null, 'testpass');
      expect(authService.isPasswordGateActive()).toBe(true);

      // Manually clear the password in DB (simulating external change)
      await new Promise((resolve, reject) => {
        db.run("UPDATE users SET password_hash = '' WHERE username = 'admin'", (err) =>
          err ? reject(err) : resolve()
        );
      });

      // Cache still says active
      expect(authService.isPasswordGateActive()).toBe(true);

      // Invalidate and refresh
      authService.invalidateAuthCache();
      await authService.refreshAuthCache();

      expect(authService.isPasswordGateActive()).toBe(false);
    });
  });

  // ─── Open_Mode ↔ Password_Gate Transitions ───

  describe('Open_Mode ↔ Password_Gate transitions', () => {
    test('full lifecycle: Open_Mode → set password → login → change password → remove password → Open_Mode', async () => {
      // Start in Open_Mode
      expect(authService.isPasswordGateActive()).toBe(false);
      let status = await authService.getAuthStatus();
      expect(status.passwordRequired).toBe(false);

      // Set password → transitions to Password_Gate
      await authService.setPassword(null, 'pass1234');
      expect(authService.isPasswordGateActive()).toBe(true);
      status = await authService.getAuthStatus();
      expect(status.passwordRequired).toBe(true);

      // Login with the password
      const { accessToken, refreshToken } = await authService.login('pass1234');
      const secret = await authService.getJwtSecret();
      const decoded = jwt.verify(accessToken, secret);
      expect(decoded.username).toBe('admin');

      // Refresh the token
      const refreshed = await authService.refreshAccessToken(refreshToken);
      expect(refreshed.accessToken).toBeDefined();

      // Change password
      await authService.setPassword('pass1234', 'newpass99');
      expect(authService.isPasswordGateActive()).toBe(true);

      // Old password no longer works
      await expect(authService.login('pass1234')).rejects.toThrow('Invalid credentials');

      // New password works
      const result2 = await authService.login('newpass99');
      expect(result2.accessToken).toBeDefined();

      // Remove password → back to Open_Mode
      await authService.removePassword('newpass99');
      expect(authService.isPasswordGateActive()).toBe(false);
      status = await authService.getAuthStatus();
      expect(status.passwordRequired).toBe(false);

      // Login should fail in Open_Mode (no password set)
      await expect(authService.login('newpass99')).rejects.toThrow('Invalid credentials');
    });

    test('multiple transitions: set → remove → set again', async () => {
      // First cycle
      await authService.setPassword(null, 'first');
      expect(authService.isPasswordGateActive()).toBe(true);
      await authService.removePassword('first');
      expect(authService.isPasswordGateActive()).toBe(false);

      // Second cycle
      await authService.setPassword(null, 'second');
      expect(authService.isPasswordGateActive()).toBe(true);
      const { accessToken } = await authService.login('second');
      expect(accessToken).toBeDefined();

      await authService.removePassword('second');
      expect(authService.isPasswordGateActive()).toBe(false);
    });

    test('password change while in Password_Gate keeps gate active', async () => {
      await authService.setPassword(null, 'original');
      expect(authService.isPasswordGateActive()).toBe(true);

      await authService.setPassword('original', 'changed');
      expect(authService.isPasswordGateActive()).toBe(true);

      await authService.setPassword('changed', 'changed2');
      expect(authService.isPasswordGateActive()).toBe(true);
    });
  });

  // ─── Error Status Codes ───

  describe('error status codes', () => {
    test('password too short returns 400', async () => {
      try {
        await authService.setPassword(null, 'ab');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(400);
      }
    });

    test('incorrect current password returns 401', async () => {
      await authService.setPassword(null, 'testpass');
      try {
        await authService.setPassword('wrong', 'newpass1');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }
    });

    test('missing current password returns 401', async () => {
      await authService.setPassword(null, 'testpass');
      try {
        await authService.setPassword(null, 'newpass1');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }
    });

    test('invalid login returns 401', async () => {
      await authService.setPassword(null, 'testpass');
      try {
        await authService.login('wrong');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }
    });

    test('invalid refresh token returns 401', async () => {
      try {
        await authService.refreshAccessToken('garbage');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }
    });

    test('removePassword with no password set returns 400', async () => {
      try {
        await authService.removePassword('anything');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(400);
      }
    });
  });
});
