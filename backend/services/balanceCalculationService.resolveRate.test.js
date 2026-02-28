/**
 * Unit tests for BalanceCalculationService.resolveRateAtDate()
 * 
 * Tests the interest rate resolution logic that finds the most recent
 * loan_balances entry on or before a target year/month with a non-null rate.
 * 
 * Requirements: 1.3
 */

const balanceCalculationService = require('./balanceCalculationService');

describe('BalanceCalculationService.resolveRateAtDate', () => {
  test('returns null for empty snapshots', () => {
    expect(balanceCalculationService.resolveRateAtDate([], 2025, 6)).toBeNull();
  });

  test('returns null when all snapshots have null rate', () => {
    const snapshots = [
      { year: 2025, month: 1, rate: null },
      { year: 2025, month: 3, rate: null },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBeNull();
  });

  test('returns null when all snapshots have undefined rate', () => {
    const snapshots = [
      { year: 2025, month: 1 },
      { year: 2025, month: 3 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBeNull();
  });

  test('returns rate from exact month match', () => {
    const snapshots = [
      { year: 2025, month: 3, rate: 5.25 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 3)).toBe(5.25);
  });

  test('returns rate from earlier month in same year', () => {
    const snapshots = [
      { year: 2025, month: 1, rate: 4.5 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBe(4.5);
  });

  test('returns rate from earlier year', () => {
    const snapshots = [
      { year: 2024, month: 10, rate: 3.75 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBe(3.75);
  });

  test('returns null when all snapshots are after target date', () => {
    const snapshots = [
      { year: 2025, month: 8, rate: 5.0 },
      { year: 2026, month: 1, rate: 5.5 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBeNull();
  });

  test('returns most recent rate when multiple snapshots exist before target', () => {
    const snapshots = [
      { year: 2024, month: 6, rate: 3.0 },
      { year: 2024, month: 12, rate: 4.0 },
      { year: 2025, month: 3, rate: 5.0 },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBe(5.0);
  });

  test('skips null-rate snapshots and returns most recent non-null', () => {
    const snapshots = [
      { year: 2024, month: 6, rate: 3.0 },
      { year: 2025, month: 1, rate: null },
      { year: 2025, month: 3, rate: null },
    ];
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBe(3.0);
  });

  test('handles rate change: returns latest rate on or before target', () => {
    const snapshots = [
      { year: 2024, month: 1, rate: 3.5 },
      { year: 2024, month: 7, rate: 4.25 },
      { year: 2025, month: 1, rate: 5.0 },
      { year: 2025, month: 7, rate: 5.5 },
    ];
    // Target is 2025-04, so 2025-01 (rate 5.0) is the most recent on or before
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 4)).toBe(5.0);
  });

  test('handles boundary: same month in later year is not included', () => {
    const snapshots = [
      { year: 2024, month: 6, rate: 3.0 },
      { year: 2025, month: 6, rate: 4.0 },
    ];
    // Target 2025-5: only 2024-06 qualifies (2025-06 is after)
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 5)).toBe(3.0);
  });

  test('handles zero rate as valid non-null value', () => {
    const snapshots = [
      { year: 2025, month: 1, rate: 0 },
    ];
    // rate of 0 is falsy but not null/undefined — should be skipped by == null check
    // Actually 0 == null is false in JS, so 0 is a valid rate
    expect(balanceCalculationService.resolveRateAtDate(snapshots, 2025, 6)).toBe(0);
  });
});
