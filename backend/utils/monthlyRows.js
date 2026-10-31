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

const formatYearMonth = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * Log a month-to-month copy (budgets, allocations, fixed expenses). Copies that changed
 * nothing are not logged.
 * @param {string} eventType
 * @param {string} entityType - activity log entity type (drives SSE sync)
 * @param {string} noun - singular row name for the message, e.g. 'budget'
 * @param {{copied: number, overwritten?: number}} result
 * @param {{year: number, month: number}} source
 * @param {{year: number, month: number}} target
 * @param {string|null} tabId
 */
async function logMonthCopy(eventType, entityType, noun, result, source, target, tabId = null) {
  const overwritten = result.overwritten || 0;
  if (result.copied + overwritten === 0) {
    return;
  }

  // Lazy require: repositories load this module, and activityLogService pulls in services
  const activityLogService = require('../services/activityLogService');
  const from = formatYearMonth(source);
  const to = formatYearMonth(target);
  const overwrittenNote = overwritten > 0 ? ` (${overwritten} overwritten)` : '';

  await activityLogService.logEvent(
    eventType,
    entityType,
    null,
    `Copied ${result.copied + overwritten} ${noun}(s) from ${from} to ${to}${overwrittenNote}`,
    { sourceMonth: from, targetMonth: to, copied: result.copied, overwritten, skipped: result.skipped || 0, tabId }
  );
}

module.exports = { previousMonth, loadWithCarryForward, copyRows, logMonthCopy };
