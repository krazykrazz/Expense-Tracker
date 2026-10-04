import { describe, it, expect } from 'vitest';
import {
  computePeriodRange,
  formatPeriodLabel,
  presetStep,
  rangeToDateBounds,
  toYearMonthString,
} from './periodUtils';
import { shiftMonth } from '../../utils/yearMonth';

describe('periodUtils', () => {
  it('resolves presets anchored at a month', () => {
    expect(computePeriodRange('month', 2026, 3)).toEqual({ start: { year: 2026, month: 3 }, end: { year: 2026, month: 3 } });
    expect(computePeriodRange('ytd', 2026, 9)).toEqual({ start: { year: 2026, month: 1 }, end: { year: 2026, month: 9 } });
    expect(computePeriodRange('year', 2026, 9)).toEqual({ start: { year: 2026, month: 1 }, end: { year: 2026, month: 12 } });
  });

  it('spans a year boundary for last 12 months', () => {
    expect(computePeriodRange('last12', 2026, 3)).toEqual({ start: { year: 2025, month: 4 }, end: { year: 2026, month: 3 } });
    expect(computePeriodRange('last12', 2026, 12)).toEqual({ start: { year: 2026, month: 1 }, end: { year: 2026, month: 12 } });
  });

  it('clamps ranges to the supported 2000-2100 window', () => {
    expect(computePeriodRange('last12', 2000, 5)).toEqual({ start: { year: 2000, month: 1 }, end: { year: 2000, month: 5 } });
    expect(computePeriodRange('month', 2101, 2)).toEqual({ start: { year: 2100, month: 12 }, end: { year: 2100, month: 12 } });
  });

  it('converts a month range to inclusive day bounds', () => {
    expect(rangeToDateBounds(computePeriodRange('ytd', 2024, 2))).toEqual({ startDate: '2024-01-01', endDate: '2024-02-29' });
    expect(rangeToDateBounds(computePeriodRange('last12', 2026, 1))).toEqual({ startDate: '2025-02-01', endDate: '2026-01-31' });
  });

  it('shifts months across years', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2025, 12, 1)).toEqual({ year: 2026, month: 1 });
    expect(shiftMonth(2026, 5, -12)).toEqual({ year: 2025, month: 5 });
  });

  it('steps one month for the month preset and a year otherwise', () => {
    expect(presetStep('month')).toBe(1);
    expect(presetStep('ytd')).toBe(12);
    expect(presetStep('last12')).toBe(12);
  });

  it('formats range strings and labels', () => {
    expect(toYearMonthString({ year: 2026, month: 3 })).toBe('2026-03');
    expect(formatPeriodLabel(computePeriodRange('month', 2026, 3))).toBe('Mar 2026');
    expect(formatPeriodLabel(computePeriodRange('ytd', 2026, 9))).toBe('Jan 2026 – Sep 2026');
  });
});
