/**
 * Property-Based Tests for User Repository
 *
 * @invariant Default user initialization idempotence: For any existing user
 * record (with any password hash value), calling createUser with the same
 * username should not modify the existing record. The password hash before
 * and after the call must be identical. Randomization covers diverse
 * password hash strings to ensure INSERT OR IGNORE never overwrites data.
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const fc = require('fast-check');
const { dbPbtOptions } = require('../test/pbtArbitraries');
const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');

// We need to override the database module so userRepository talks to our isolated DB
let db;
let userRepository;

beforeAll(async () => {
  db = await createIsolatedTestDb();
  // Override getDatabase to return our isolated instance
  const dbModule = require('../database/db');
  dbModule.getDatabase = () => Promise.resolve(db);
  userRepository = require('./userRepository');
});

afterAll(() => {
  cleanupIsolatedTestDb(db);
});

/**
 * Helper: direct SQL to set a user's password_hash for test setup.
 */
function setPasswordHash(username, hash) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password_hash = ? WHERE username = ?',
      [hash, username],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/**
 * Helper: direct SQL to read a user row.
 */
function getUser(username) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

/**
 * Helper: ensure the admin user exists with a given hash.
 */
async function ensureAdminUser(hash) {
  await new Promise((resolve, reject) => {
    db.run(
      "INSERT OR IGNORE INTO users (username, password_hash) VALUES ('admin', '')",
      (err) => (err ? reject(err) : resolve())
    );
  });
  await setPasswordHash('admin', hash);
}

describe('User Repository Property-Based Tests', () => {
  /**
   * **Feature: auth-infrastructure, Property 8: Default user initialization idempotence**
   * **Validates: Requirements 1.2**
   *
   * For any existing user record, calling createUser with the same username
   * should not modify the existing record.
   */
  test('Property 8: Default user initialization idempotence', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate arbitrary password hash strings (simulating bcrypt hashes or empty)
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 1, maxLength: 60 })
        ),
        async (existingHash) => {
          // Setup: ensure admin user exists with the given hash
          await ensureAdminUser(existingHash);

          const before = await getUser('admin');
          expect(before).not.toBeNull();
          expect(before.password_hash).toBe(existingHash);

          // Act: call createUser with the same username but empty hash
          await userRepository.createUser('admin', '');

          // Assert: the existing record is unchanged
          const after = await getUser('admin');
          expect(after).not.toBeNull();
          expect(after.id).toBe(before.id);
          expect(after.password_hash).toBe(existingHash);
          expect(after.created_at).toBe(before.created_at);
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * **Feature: auth-infrastructure, Property 8b: createUser round-trip**
   *
   * For any new unique username, createUser should return the created user
   * and findByUsername should retrieve it with matching data.
   */
  test('createUser round-trip for new users', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 30 })
          .filter(s => s.trim().length > 0 && s !== 'admin')
          .map(s => `test_${s.replace(/[^a-zA-Z0-9_]/g, '_')}`),
        async (username) => {
          // Act
          const result = await userRepository.createUser(username, '');

          // Assert
          expect(result).toHaveProperty('id');
          expect(result.username).toBe(username);

          const found = await userRepository.findByUsername(username);
          expect(found).not.toBeNull();
          expect(found.username).toBe(username);
          expect(found.password_hash).toBe('');

          // Cleanup
          await new Promise((resolve) => {
            db.run('DELETE FROM users WHERE username = ?', [username], () => resolve());
          });
        }
      ),
      dbPbtOptions()
    );
  });

  /**
   * getAuthState reflects password_hash state correctly.
   */
  test('getAuthState reflects password hash presence', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(''),
          fc.string({ minLength: 1, maxLength: 60 })
        ),
        async (hash) => {
          await ensureAdminUser(hash);

          const state = await userRepository.getAuthState();
          expect(state.hasPassword).toBe(hash.length > 0);
        }
      ),
      dbPbtOptions()
    );
  });
});
