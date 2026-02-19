/**
 * Property-Based Tests for useDataSync — Exponential Backoff
 *
 * @invariant
 * Property 1: Exponential backoff stays within bounds
 * Feature: real-time-data-sync, Property 1
 * For any reconnect attempt number N (N >= 1), the computed backoff delay SHALL be
 * min(3000 * 2^(N-1), 30000) ms — starts at 3s, doubles each attempt, never exceeds 30s.
 * Validates: Requirements 1.2
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import { computeBackoff } from './useDataSync';

describe('useDataSync — computeBackoff (Property 1)', () => {
  test('backoff delay is always >= 3000ms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attempt) => {
          const delay = computeBackoff(attempt);
          expect(delay).toBeGreaterThanOrEqual(3000);
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('backoff delay is always <= 30000ms', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attempt) => {
          const delay = computeBackoff(attempt);
          expect(delay).toBeLessThanOrEqual(30000);
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('backoff delay matches the formula min(3000 * 2^(attempt-1), 30000)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (attempt) => {
          const delay = computeBackoff(attempt);
          const expected = Math.min(3000 * Math.pow(2, attempt - 1), 30000);
          expect(delay).toBe(expected);
        }
      ),
      { ...pbtOptions(), numRuns: 100 }
    );
  });

  test('attempt 1 starts at exactly 3000ms', () => {
    expect(computeBackoff(1)).toBe(3000);
  });

  test('attempt 2 doubles to 6000ms', () => {
    expect(computeBackoff(2)).toBe(6000);
  });

  test('large attempt numbers are capped at 30000ms', () => {
    expect(computeBackoff(10)).toBe(30000);
    expect(computeBackoff(20)).toBe(30000);
  });
});
