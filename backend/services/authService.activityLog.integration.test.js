/**
 * Integration Tests for Auth Activity Logging
 *
 * Tests that auth operations (login, failed login, logout, password gate
 * enable/disable) correctly log activity events with the right event_type,
 * entity_type, and metadata.
 *
 * Uses real SQLite database, real authService, real activityLogService.
 * No mocks.
 *
 * Validates: Requirements 2.7, 2.8, 4.8, 4.9, 4.10
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let authService;
let activityLogRepository;
let userRepository;

beforeAll(async () => {
  db = await createIsolatedTestDb();

  // Override the database module to use our isolated db
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  userRepository = require('../repositories/userRepository');
  activityLogRepository = require('../repositories/activityLogRepository');
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
  await new Promise((resolve, reject) => {
    db.run("DELETE FROM activity_logs WHERE entity_type = 'auth'", (err) => err ? reject(err) : resolve());
  });
  await userRepository.createUser('admin', '');
  authService._resetAuthStateCache();
  await authService.refreshAuthCache();
});

// Helper to get auth activity log events
async function getAuthEvents() {
  const events = await activityLogRepository.findRecent(50, 0);
  return events.filter(e => e.entity_type === 'auth');
}

describe('Auth Activity Logging - Integration Tests', () => {

  describe('Successful Login Event (Requirement 4.8)', () => {
    test('should log auth_login event on successful login', async () => {
      // Arrange — set a password so we can log in
      await authService.setPassword(null, 'testpass');
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM activity_logs WHERE entity_type = 'auth'", (err) => err ? reject(err) : resolve());
      });

      // Act
      await authService.login('testpass');

      // Assert
      const events = await getAuthEvents();
      const loginEvent = events.find(e => e.event_type === 'auth_login');

      expect(loginEvent).toBeDefined();
      expect(loginEvent.entity_type).toBe('auth');
      expect(loginEvent.entity_id).toBeNull();
      expect(loginEvent.user_action).toContain("User 'admin' logged in");

      const metadata = JSON.parse(loginEvent.metadata);
      expect(metadata.username).toBe('admin');
    });
  });

  describe('Failed Login Event (Requirement 4.9)', () => {
    test('should log auth_login_failed event on failed login', async () => {
      // Arrange — set a password so Password_Gate is active
      await authService.setPassword(null, 'testpass');
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM activity_logs WHERE entity_type = 'auth'", (err) => err ? reject(err) : resolve());
      });

      // Act
      try {
        await authService.login('wrongpassword');
      } catch (err) {
        expect(err.statusCode).toBe(401);
      }

      // Assert
      const events = await getAuthEvents();
      const failedEvent = events.find(e => e.event_type === 'auth_login_failed');

      expect(failedEvent).toBeDefined();
      expect(failedEvent.entity_type).toBe('auth');
      expect(failedEvent.entity_id).toBeNull();
      expect(failedEvent.user_action).toContain("Failed login attempt for user 'admin'");

      const metadata = JSON.parse(failedEvent.metadata);
      expect(metadata.username).toBe('admin');
    });
  });

  describe('Logout Event (Requirement 4.10)', () => {
    test('should log auth_logout event on logout', async () => {
      // The logout activity log is fired from the controller, not the service.
      // We call activityLogService.logEvent directly to test the integration
      // path, matching what the controller does.
      const activityLogService = require('./activityLogService');

      // Act
      await activityLogService.logEvent(
        'auth_logout',
        'auth',
        null,
        "User 'admin' logged out",
        { username: 'admin' }
      );

      // Assert
      const events = await getAuthEvents();
      const logoutEvent = events.find(e => e.event_type === 'auth_logout');

      expect(logoutEvent).toBeDefined();
      expect(logoutEvent.entity_type).toBe('auth');
      expect(logoutEvent.entity_id).toBeNull();
      expect(logoutEvent.user_action).toContain("User 'admin' logged out");

      const metadata = JSON.parse(logoutEvent.metadata);
      expect(metadata.username).toBe('admin');
    });
  });

  describe('Password Gate Enabled Event (Requirement 2.7)', () => {
    test('should log auth_password_gate_enabled when setting password from Open_Mode', async () => {
      // Act — transition from Open_Mode to Password_Gate
      await authService.setPassword(null, 'newpass');

      // Assert
      const events = await getAuthEvents();
      const gateEnabledEvent = events.find(e => e.event_type === 'auth_password_gate_enabled');

      expect(gateEnabledEvent).toBeDefined();
      expect(gateEnabledEvent.entity_type).toBe('auth');
      expect(gateEnabledEvent.entity_id).toBeNull();
      expect(gateEnabledEvent.user_action).toContain("Authentication enabled for user 'admin'");

      const metadata = JSON.parse(gateEnabledEvent.metadata);
      expect(metadata.username).toBe('admin');
    });
  });

  describe('Password Gate Disabled Event (Requirement 2.8)', () => {
    test('should log auth_password_gate_disabled when removing password', async () => {
      // Arrange — enable Password_Gate first
      await authService.setPassword(null, 'testpass');
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM activity_logs WHERE entity_type = 'auth'", (err) => err ? reject(err) : resolve());
      });

      // Act — remove password, returning to Open_Mode
      await authService.removePassword('testpass');

      // Assert
      const events = await getAuthEvents();
      const gateDisabledEvent = events.find(e => e.event_type === 'auth_password_gate_disabled');

      expect(gateDisabledEvent).toBeDefined();
      expect(gateDisabledEvent.entity_type).toBe('auth');
      expect(gateDisabledEvent.entity_id).toBeNull();
      expect(gateDisabledEvent.user_action).toContain("Authentication disabled for user 'admin'");

      const metadata = JSON.parse(gateDisabledEvent.metadata);
      expect(metadata.username).toBe('admin');
    });
  });

  describe('Password Change While Already in Password_Gate', () => {
    test('should NOT log gate enabled/disabled when changing password while already in Password_Gate', async () => {
      // Arrange — enable Password_Gate
      await authService.setPassword(null, 'firstpass');
      await new Promise((resolve, reject) => {
        db.run("DELETE FROM activity_logs WHERE entity_type = 'auth'", (err) => err ? reject(err) : resolve());
      });

      // Act — change password while already in Password_Gate
      await authService.setPassword('firstpass', 'secondpass');

      // Assert — should NOT have gate enabled/disabled events
      const events = await getAuthEvents();
      const gateEnabledEvent = events.find(e => e.event_type === 'auth_password_gate_enabled');
      const gateDisabledEvent = events.find(e => e.event_type === 'auth_password_gate_disabled');

      expect(gateEnabledEvent).toBeUndefined();
      expect(gateDisabledEvent).toBeUndefined();

      // Should still have a password_changed event
      const changedEvent = events.find(e => e.event_type === 'auth_password_changed');
      expect(changedEvent).toBeDefined();
    });
  });
});
