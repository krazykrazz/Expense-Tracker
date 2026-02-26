/**
 * Property-Based Tests for Auth Service
 *
 * @invariant Password hash round-trip: For any valid password (≥4 chars),
 * hashing with bcrypt and verifying the original password against the stored
 * hash returns true. Auth gate consistency: For any sequence of set/clear
 * operations, isPasswordGateActive() matches whether hash is non-empty.
 * Password length validation: For any string <4 chars, setPassword rejects;
 * for ≥4 chars, it does not reject due to length. Token lifecycle: For any
 * valid password, issued token is verifiable with correct claims; expired
 * tokens are rejected. Randomization covers diverse password strings, operation
 * sequences, and token payloads to ensure security invariants hold universally.
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const fc = require('fast-check');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pbtOptions, dbPbtOptions } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

let db;
let authService;
let userRepository;
let settingsRepository;

beforeAll(async () => {
  db = await createIsolatedTestDb();
  // Override getDatabase to return our isolated instance
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);

  userRepository = require('../repositories/userRepository');
  settingsRepository = require('../repositories/settingsRepository');
  authService = require('./authService');

  // Seed the default admin user
  await userRepository.createUser('admin', '');
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

// ─── Helpers ───

/**
 * Reset admin user to a known state (empty password = Open_Mode).
 */
async function resetAdminToOpenMode() {
  await new Promise((resolve, reject) => {
    db.run(
      "UPDATE users SET password_hash = '' WHERE username = 'admin'",
      (err) => (err ? reject(err) : resolve())
    );
  });
  authService.invalidateAuthCache();
  await authService.refreshAuthCache();
}

/**
 * Set admin password hash directly via SQL.
 */
async function setPasswordHashDirect(hash) {
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

// Valid password: ≥4 chars, max 72 (bcrypt limit)
const validPassword = fc.string({ minLength: 4, maxLength: 72 })
  .filter(s => s.length >= 4);

// Short password: 1-3 chars (invalid)
const shortPassword = fc.string({ minLength: 1, maxLength: 3 });

describe('Auth Service Property-Based Tests', () => {
  beforeEach(async () => {
    await resetAdminToOpenMode();
  });

  /**
   * **Feature: auth-infrastructure, Property 1: Password hash round-trip**
   * **Validates: Requirements 2.1**
   *
   * For any valid password (≥4 chars), bcrypt verify of stored hash returns true.
   */
  test('Property 1: Password hash round-trip', () => {
    return fc.assert(
      fc.asyncProperty(validPassword, async (password) => {
        const hash = await bcrypt.hash(password, 10);
        const result = await bcrypt.compare(password, hash);
        expect(result).toBe(true);

        // Also verify a different password does NOT match
        const wrongResult = await bcrypt.compare(password + 'x', hash);
        expect(wrongResult).toBe(false);
      }),
      pbtOptions()
    );
  });

  /**
   * **Feature: auth-infrastructure, Property 2: Auth gate consistency**
   * **Validates: Requirements 2.4, 3.5**
   *
   * For any sequence of set/clear operations, isPasswordGateActive()
   * matches whether hash is non-empty.
   */
  test('Property 2: Auth gate consistency', () => {
    // Operation: true = set password, false = remove password
    const operationSeq = fc.array(fc.boolean(), { minLength: 1, maxLength: 6 });

    return fc.assert(
      fc.asyncProperty(operationSeq, validPassword, async (ops, password) => {
        await resetAdminToOpenMode();

        for (const shouldSet of ops) {
          if (shouldSet) {
            // Set password — need current password if gate is active
            const currentlyActive = authService.isPasswordGateActive();
            try {
              await authService.setPassword(
                currentlyActive ? password : null,
                password
              );
            } catch (e) {
              // If current password was wrong (different from what we set), skip
              if (e.statusCode === 401) continue;
              throw e;
            }
          } else {
            // Remove password — only works if gate is active
            if (authService.isPasswordGateActive()) {
              try {
                await authService.removePassword(password);
              } catch (e) {
                if (e.statusCode === 401 || e.statusCode === 400) continue;
                throw e;
              }
            }
          }
        }

        // Verify consistency: cache matches DB state
        const dbState = await userRepository.getAuthState();
        expect(authService.isPasswordGateActive()).toBe(dbState.hasPassword);
      }),
      dbPbtOptions()
    );
  });

  /**
   * **Feature: auth-infrastructure, Property 3: Password length validation**
   * **Validates: Requirements 2.5**
   *
   * For any string <4 chars, setPassword rejects; for ≥4 chars, it does not
   * reject due to length.
   */
  test('Property 3: Password length validation — short passwords rejected', () => {
    return fc.assert(
      fc.asyncProperty(shortPassword, async (password) => {
        await resetAdminToOpenMode();
        await expect(authService.setPassword(null, password))
          .rejects.toThrow(/at least 4 characters/);
      }),
      dbPbtOptions()
    );
  });

  test('Property 3: Password length validation — valid passwords accepted', () => {
    return fc.assert(
      fc.asyncProperty(validPassword, async (password) => {
        await resetAdminToOpenMode();
        // Should not throw due to length
        await authService.setPassword(null, password);
        expect(authService.isPasswordGateActive()).toBe(true);
      }),
      dbPbtOptions()
    );
  });

  /**
   * **Feature: auth-infrastructure, Property 6: Token lifecycle**
   * **Validates: Requirements 4.1, 4.4, 4.5, 5.4**
   *
   * For any valid password, issued token is verifiable with correct claims;
   * expired tokens are rejected.
   */
  test('Property 6: Token lifecycle — issued tokens are verifiable', () => {
    return fc.assert(
      fc.asyncProperty(validPassword, async (password) => {
        await resetAdminToOpenMode();

        // Set password and login
        await authService.setPassword(null, password);
        const { accessToken, refreshToken } = await authService.login(password);

        // Verify access token
        const secret = await authService.getJwtSecret();
        const decoded = jwt.verify(accessToken, secret);
        expect(decoded).toHaveProperty('sub');
        expect(decoded).toHaveProperty('username', 'admin');
        expect(decoded).toHaveProperty('iat');
        expect(decoded).toHaveProperty('exp');
        expect(decoded.exp).toBeGreaterThan(decoded.iat);

        // Verify refresh token
        const refreshDecoded = jwt.verify(refreshToken, secret);
        expect(refreshDecoded).toHaveProperty('sub');
        expect(refreshDecoded).toHaveProperty('username', 'admin');
        expect(refreshDecoded).toHaveProperty('type', 'refresh');
        expect(refreshDecoded.exp).toBeGreaterThan(refreshDecoded.iat);

        // Refresh should issue new valid tokens
        const refreshed = await authService.refreshAccessToken(refreshToken);
        const newDecoded = jwt.verify(refreshed.accessToken, secret);
        expect(newDecoded).toHaveProperty('sub', decoded.sub);
        expect(newDecoded).toHaveProperty('username', 'admin');
      }),
      dbPbtOptions()
    );
  });

  test('Property 6: Token lifecycle — expired tokens are rejected', async () => {
    await resetAdminToOpenMode();
    const secret = await authService.getJwtSecret();

    // Create an already-expired token
    const expiredToken = jwt.sign(
      { sub: 1, username: 'admin' },
      secret,
      { expiresIn: '0s' }
    );

    // Wait a tick to ensure expiry
    await new Promise(r => setTimeout(r, 50));

    expect(() => jwt.verify(expiredToken, secret)).toThrow(/expired/i);

    // Expired refresh token should be rejected
    const expiredRefresh = jwt.sign(
      { sub: 1, username: 'admin', type: 'refresh' },
      secret,
      { expiresIn: '0s' }
    );

    await new Promise(r => setTimeout(r, 50));

    await expect(authService.refreshAccessToken(expiredRefresh))
      .rejects.toThrow(/Invalid refresh token/);
  });

  test('Property 6: Token lifecycle — invalid credentials rejected', () => {
    return fc.assert(
      fc.asyncProperty(validPassword, validPassword, async (correctPw, wrongPw) => {
        // Only test when passwords differ
        fc.pre(correctPw !== wrongPw);

        await resetAdminToOpenMode();
        await authService.setPassword(null, correctPw);

        await expect(authService.login(wrongPw))
          .rejects.toThrow(/Invalid credentials/);
      }),
      dbPbtOptions()
    );
  });
});
