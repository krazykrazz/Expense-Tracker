/**
 * Property-Based Tests for SecuritySettings — Frontend Password Validation
 *
 * @invariant
 * Property 9: Frontend password validation
 * Feature: auth-infrastructure, Property 9
 * For any (password, confirmation) pair, the validation function reports an error
 * if the password is non-empty and shorter than 4 characters, or if the password
 * and confirmation do not match. It reports no errors when both conditions are satisfied.
 * Validates: Requirements 9.9
 *
 * Randomization adds value because it tests validation across arbitrary string
 * combinations — including edge cases like unicode, empty strings, and boundary
 * lengths — ensuring the validator handles any user input correctly.
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { validatePasswordFields } from './SecuritySettings';

// ── Generators ──

const shortPassword = () => fc.string({ minLength: 1, maxLength: 3 });
const validPassword = () => fc.string({ minLength: 4, maxLength: 72 });
const anyString = () => fc.string({ minLength: 0, maxLength: 72 });

describe('SecuritySettings PBT — Property 9: Frontend password validation', () => {
  test('passwords shorter than 4 chars produce a password error', async () => {
    await fc.assert(
      fc.asyncProperty(shortPassword(), anyString(), async (password, confirmation) => {
        const errors = validatePasswordFields(password, confirmation);
        expect(errors.password).toBe('Password must be at least 4 characters');
      }),
      pbtOptions()
    );
  });

  test('passwords of 4+ chars do not produce a length error', async () => {
    await fc.assert(
      fc.asyncProperty(validPassword(), anyString(), async (password, confirmation) => {
        const errors = validatePasswordFields(password, confirmation);
        expect(errors.password).toBeUndefined();
      }),
      pbtOptions()
    );
  });

  test('mismatched password and confirmation produce a confirmation error', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPassword(),
        validPassword(),
        async (password, confirmation) => {
          fc.pre(password !== confirmation);
          fc.pre(confirmation.length > 0);
          const errors = validatePasswordFields(password, confirmation);
          expect(errors.confirmation).toBe('Passwords do not match');
        }
      ),
      pbtOptions()
    );
  });

  test('matching password and confirmation produce no confirmation error', async () => {
    await fc.assert(
      fc.asyncProperty(validPassword(), async (password) => {
        const errors = validatePasswordFields(password, password);
        expect(errors.confirmation).toBeUndefined();
      }),
      pbtOptions()
    );
  });

  test('valid password with matching confirmation produces no errors', async () => {
    await fc.assert(
      fc.asyncProperty(validPassword(), async (password) => {
        const errors = validatePasswordFields(password, password);
        expect(Object.keys(errors)).toHaveLength(0);
      }),
      pbtOptions()
    );
  });

  test('empty password produces no errors (validation only applies to non-empty)', async () => {
    await fc.assert(
      fc.asyncProperty(anyString(), async (confirmation) => {
        const errors = validatePasswordFields('', confirmation);
        expect(errors.password).toBeUndefined();
        expect(errors.confirmation).toBeUndefined();
      }),
      pbtOptions()
    );
  });
});
