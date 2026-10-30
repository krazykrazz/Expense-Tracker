import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useCarryForward from './useCarryForward';

describe('useCarryForward', () => {
  it('returns the displayed rows untouched when nothing is carried forward', async () => {
    const copyFn = vi.fn();
    const reload = vi.fn();
    const rows = [{ id: 1, category: 'Food' }];

    const { result } = renderHook(() => useCarryForward({ year: 2025, month: 6, rows, copyFn, reload }));

    expect(await result.current.ensurePersisted()).toBe(rows);
    expect(copyFn).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('copies the previous month without overwriting, then returns the stored rows', async () => {
    const stored = [{ id: 7, category: 'Food' }];
    const copyFn = vi.fn().mockResolvedValue({ copied: 1 });
    const reload = vi.fn().mockResolvedValue(stored);
    const rows = [{ category: 'Food', carriedForward: true }];

    const { result } = renderHook(() => useCarryForward({ year: 2025, month: 6, rows, copyFn, reload }));

    expect(await result.current.ensurePersisted()).toBe(stored);
    expect(copyFn).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
  });

  it('reports the previous month across a year boundary', () => {
    const { result } = renderHook(() => useCarryForward({
      year: 2025, month: 1, rows: [], copyFn: vi.fn(), reload: vi.fn()
    }));

    expect(result.current.previousMonth).toEqual({ year: 2024, month: 12 });
  });
});
