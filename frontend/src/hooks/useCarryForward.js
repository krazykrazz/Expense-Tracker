import { useCallback } from 'react';
import { shiftMonth } from '../utils/yearMonth';

/**
 * Carried-forward rows (budgets, allocations) are shown for an empty month but are not
 * stored, so they have no id and cannot be edited or deleted. Call `ensurePersisted`
 * before any write: it stores the carried rows (via the entity's copy endpoint, never
 * overwriting) and returns the stored rows.
 *
 * @param {Object} options
 * @param {number} options.year
 * @param {number} options.month - 1-12
 * @param {Array} options.rows - rows currently displayed
 * @param {(sy: number, sm: number, ty: number, tm: number, overwrite: boolean) => Promise<any>} options.copyFn
 * @param {() => Promise<Array>} options.reload - refetches and returns the stored rows
 */
export default function useCarryForward({ year, month, rows, copyFn, reload }) {
  const previous = shiftMonth(year, month, -1);

  const ensurePersisted = useCallback(async () => {
    if (!rows.some(row => row.carriedForward)) {
      return rows;
    }
    await copyFn(previous.year, previous.month, year, month, false);
    return reload();
  }, [rows, copyFn, reload, previous.year, previous.month, year, month]);

  return { previousMonth: previous, ensurePersisted };
}
