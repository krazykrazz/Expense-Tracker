/**
 * Helpers for month-scoped rows (budgets, budget allocations).
 */

/**
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {{year: number, month: number}} the calendar month before year/month
 */
function previousMonth(year, month) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/**
 * Load rows for a month. When the month has none, return the previous month's rows
 * as transient (unpersisted) objects flagged with `carriedForward: true`.
 * @param {(year: number, month: number) => Promise<Array>} findRows
 * @param {number} year
 * @param {number} month
 * @param {(row: Object) => Object} pickFields - copies only the fields that carry forward
 * @returns {Promise<Array>}
 */
async function loadWithCarryForward(findRows, year, month, pickFields) {
  const rows = await findRows(year, month);
  if (rows.length > 0) {
    return rows;
  }

  const prev = previousMonth(year, month);
  const prevRows = await findRows(prev.year, prev.month);
  return prevRows.map(row => ({ ...pickFields(row), year, month, carriedForward: true }));
}

/**
 * Copy source rows into a target month. A row whose create/update fails is counted
 * as skipped rather than aborting the whole copy.
 * @param {Object} options
 * @param {Array} options.sourceRows
 * @param {Array} options.existingRows - rows already in the target month
 * @param {(row: Object) => string} options.keyOf - identity of a row within a month
 * @param {(row: Object) => Promise<any>} options.create
 * @param {(existing: Object, source: Object) => Promise<any>} options.update
 * @param {boolean} options.overwrite
 * @returns {Promise<{copied: number, skipped: number, overwritten: number}>}
 */
async function copyRows({ sourceRows, existingRows, keyOf, create, update, overwrite }) {
  const existingByKey = new Map(existingRows.map(row => [keyOf(row), row]));
  const result = { copied: 0, skipped: 0, overwritten: 0 };

  for (const source of sourceRows) {
    const existing = existingByKey.get(keyOf(source));

    if (existing && !overwrite) {
      result.skipped++;
      continue;
    }

    try {
      if (existing) {
        await update(existing, source);
        result.overwritten++;
      } else {
        await create(source);
        result.copied++;
      }
    } catch (err) {
      result.skipped++;
    }
  }

  return result;
}

module.exports = { previousMonth, loadWithCarryForward, copyRows };
