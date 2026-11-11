/**
 * Bank file import (CSV exports downloaded from the bank's website): parse supported formats into rows shaped
 * like Plaid transactions, and merge them with what's already staged, in either order (file first or Plaid
 * first). A fallback for when Plaid can't fetch from a bank; after the merge, rows are handled the same
 * whichever source they came from. Pure functions; no database access. Parsing the supported file formats is in
 * bankFileFormats (re-exported here).
 *
 * Which source wins, field by field (the best information is kept):
 * - id: Plaid's (so Plaid's later updates find the row); file rows use a stable `file:<hash>` until then.
 * - pending → settled only, never back. A settled row in a file is evidence (CIBC exports only posted rows,
 *   Wealthsimple marks Pending/Completed); so is Plaid's settled flag for a bank that sends pending charges
 *   through Plaid. Plaid's "settled" for a bank that never sends pending (Wealthsimple) isn't, so a pending
 *   file row stays pending until a source shows it settled.
 * - amount: the settled version's (tips, gas holds).
 * - purchase date (authorized_date): Plaid's, else a file whose date is the purchase date (Wealthsimple).
 * - posted date: Plaid's, or the file's when the file is what showed it settled and its date is the posting date.
 * - description: Plaid's raw name; merchant name from Plaid, else from the file.
 * - review state (new / ignored / added / matched) and expense link: always kept.
 */
const { toCents, dayDiff, nameTokens, PENDING_AMOUNT_TOLERANCE } = require('./plaidMatching');
const { parseCsv, parseBankFile, FORMATS, FILE_ID_PREFIX } = require('./bankFileFormats');

/** Rows for the same money within this many days are the same transaction. */
const SAME_TXN_DAYS = 3;

const isFileRow = (transactionId) => typeof transactionId === 'string' && transactionId.startsWith(FILE_ID_PREFIX);

const GENERIC_WORDS = new Set(['purchase', 'payment', 'pos', 'pre', 'authorized', 'debit', 'credit', 'interac', 'the', 'and', 'inc', 'ltd', 'www', 'com']);

/** The first meaningful word of a description ("SQ *DELIGHTS BY MAMA" → "delights"). */
const keyWord = (text) => nameTokens(text).find(word => word.length >= 3 && !/^\d+$/.test(word) && !GENERIC_WORDS.has(word)) || null;

/** Two descriptions of the same merchant: their first meaningful words match (raw name or merchant name). */
function similarNames(a, b) {
  const wordsA = [keyWord(a.name), keyWord(a.merchantName)].filter(Boolean);
  const wordsB = [keyWord(b.name), keyWord(b.merchantName)].filter(Boolean);
  return wordsA.some(word => wordsB.includes(word));
}

/**
 * The same transaction in two sources: same amount to the cent within SAME_TXN_DAYS (`exact`), or, when either
 * is still pending, an amount within PENDING_AMOUNT_TOLERANCE and a similar description (`settledDifferently`).
 * @returns {null|{gap: number, exact: boolean}}
 */
function sameTransaction(a, b) {
  const gap = dayDiff(a.date, b.date);
  if (gap > SAME_TXN_DAYS) return null;
  if (toCents(a.amount) === toCents(b.amount)) return { gap, exact: true };
  const eitherPending = Boolean(a.pending) || Boolean(b.pending);
  const close = Math.abs(a.amount - b.amount) <= Math.abs(a.amount) * PENDING_AMOUNT_TOLERANCE;
  return eitherPending && Math.sign(a.amount) === Math.sign(b.amount) && close && similarNames(a, b)
    ? { gap, exact: false }
    : null;
}

/**
 * Pair each incoming row with at most one existing row: exact amounts before close ones, then the closest
 * dates, across all rows (so two identical charges a day apart pair with the right ones).
 * @returns {Map<object, object>} incoming row → existing row
 */
function pairRows(incoming, existing, initialPairs = new Map()) {
  const pairs = new Map(initialPairs);
  const used = new Set([...pairs.values()].map(row => row.id));
  const candidates = [];
  incoming.forEach((row, rowIndex) => {
    if (pairs.has(row)) return;
    for (const candidate of existing) {
      if (used.has(candidate.id)) continue;
      const match = sameTransaction(row, candidate);
      if (match) candidates.push({ row, rowIndex, candidate, ...match });
    }
  });
  candidates.sort((a, b) => (a.exact === b.exact ? 0 : a.exact ? -1 : 1)
    || a.gap - b.gap
    || Math.abs(a.row.amount - a.candidate.amount) - Math.abs(b.row.amount - b.candidate.amount)
    || a.rowIndex - b.rowIndex || a.candidate.id - b.candidate.id);
  for (const { row, candidate } of candidates) {
    if (pairs.has(row) || used.has(candidate.id)) continue;
    used.add(candidate.id);
    pairs.set(row, candidate);
  }
  return pairs;
}

/** Changed columns only; null when nothing changed. */
function diff(existing, next) {
  const changes = {};
  for (const [column, value] of Object.entries(next)) {
    const current = existing[column] ?? null;
    const same = typeof value === 'number' && typeof current === 'number' ? toCents(value) === toCents(current) : current === value;
    if (!same) changes[column] = value;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/** A linked expense follows a pending charge that settles or changes amount (plaidSettlementService.applySettlements). */
function settlementFor(existing, next) {
  if (!existing.expenseId || !existing.pending) return null;
  const settled = !next.pending;
  if (!settled && toCents(existing.amount) === toCents(next.amount)) return null;
  return {
    plaidTransactionId: existing.id, expenseId: existing.expenseId, settled,
    previousAmount: existing.amount, amount: next.amount, postedDate: settled ? next.date : null
  };
}

/**
 * Merge a file row into a staged row it was paired with (see the rules at the top).
 * @param {object} existing staged row (camelCase columns)
 * @param {object} file row from parseBankFile
 * @param {string} dateKind the file's date: 'purchase' or 'posted'
 * @returns {{changes: object|null, settlement: object|null}} changes use camelCase column names
 */
function mergeFileIntoRow(existing, file, dateKind) {
  const fromFile = isFileRow(existing.transactionId);
  const settlesNow = Boolean(existing.pending) && !file.pending;
  const pending = Boolean(existing.pending) && file.pending;
  const next = {
    transactionId: fromFile ? file.key : existing.transactionId,
    pending: pending ? 1 : 0,
    // A newer export of the same file, or the settled amount; otherwise Plaid's stays
    amount: fromFile || settlesNow ? file.amount : existing.amount,
    date: fromFile || (settlesNow && dateKind === 'posted') ? file.date : existing.date,
    authorizedDate: existing.authorizedDate ?? (dateKind === 'purchase' && file.date < existing.date ? file.date : null),
    name: fromFile ? file.name : existing.name,
    merchantName: existing.merchantName ?? file.merchantName,
    removedAt: settlesNow ? null : (existing.removedAt ?? null)
  };
  if (fromFile) {
    next.authorizedDate = file.authorizedDate ?? existing.authorizedDate ?? null;
    next.merchantName = file.merchantName ?? existing.merchantName ?? null;
  }
  const changes = diff(existing, next);
  return { changes, settlement: changes ? settlementFor(existing, next) : null };
}

/**
 * A settled file row linked to an expense that Plaid takes over with a different date: Plaid's date is the posting
 * date (a Wealthsimple file has the purchase date), so it reaches the expense's posted date like a settlement.
 */
function postedDateUpdate(fileRow, fields) {
  if (!fileRow.expenseId || fileRow.pending || fields.pending || fields.date === fileRow.date) return null;
  return {
    plaidTransactionId: fileRow.id, expenseId: fileRow.expenseId, settled: true, postedDateOnly: true,
    previousAmount: fileRow.amount, amount: fileRow.amount, postedDate: fields.date
  };
}

/**
 * Merge an incoming Plaid transaction into a file row it takes over (see the rules at the top).
 * @param {object} fileRow staged row from a file (camelCase columns)
 * @param {object} txn Plaid transaction (snake_case, as from /transactions/sync)
 * @param {boolean} reportsPending whether this bank sends pending charges through Plaid at all
 * @returns {{fields: object, settlement: object|null}} fields use camelCase column names
 */
function mergePlaidIntoFileRow(fileRow, txn, reportsPending) {
  const plaidPending = Boolean(txn.pending);
  // A settled file row stays settled; a pending one settles only when Plaid's flag means something for this bank
  const pending = Boolean(fileRow.pending) && (plaidPending || !reportsPending);
  const keepFileVersion = !pending && plaidPending;
  const fields = {
    transactionId: txn.transaction_id,
    pending: pending ? 1 : 0,
    amount: keepFileVersion ? fileRow.amount : txn.amount,
    date: keepFileVersion ? fileRow.date : txn.date,
    authorizedDate: txn.authorized_date ?? fileRow.authorizedDate ?? null,
    name: txn.name ?? fileRow.name,
    merchantName: txn.merchant_name ?? fileRow.merchantName ?? null,
    isoCurrencyCode: txn.iso_currency_code ?? null,
    pendingTransactionId: txn.pending_transaction_id ?? null,
    removedAt: null
  };
  return { fields, settlement: settlementFor(fileRow, fields) ?? postedDateUpdate(fileRow, fields) };
}

/**
 * Plan how file rows merge with the rows already staged for the account:
 * 1. the same file row imported before (same key);
 * 2. otherwise the same transaction already there, from Plaid or an earlier file (sameTransaction);
 * 3. otherwise new.
 * Paired rows are merged with mergeFileIntoRow; review state and expense links are never touched.
 * @param {Array<object>} fileRows rows from parseBankFile
 * @param {Array<object>} existing staged rows (camelCase columns)
 * @param {string} dateKind
 * @returns {{inserts: Array, updates: Array<{existing: object, changes: object, settlement: object|null}>,
 *   unchanged: number, alreadyFromBank: number}}
 */
function planFileImport(fileRows, existing, dateKind = 'purchase') {
  const byKey = new Map(existing.filter(e => isFileRow(e.transactionId)).map(e => [e.transactionId, e]));
  const keyed = new Map();
  for (const row of fileRows) {
    const same = byKey.get(row.key);
    if (same) keyed.set(row, same);
  }
  const pairs = pairRows(fileRows, existing, keyed);

  const plan = { inserts: [], updates: [], unchanged: 0, alreadyFromBank: 0 };
  for (const row of fileRows) {
    const match = pairs.get(row);
    if (!match) {
      plan.inserts.push(row);
      continue;
    }
    const { changes, settlement } = mergeFileIntoRow(match, row, dateKind);
    if (changes) {
      plan.updates.push({ existing: match, changes, settlement });
    } else if (isFileRow(match.transactionId)) {
      plan.unchanged++;
    } else {
      plan.alreadyFromBank++;
    }
  }
  return plan;
}

module.exports = {
  parseCsv, parseBankFile, planFileImport, mergeFileIntoRow, mergePlaidIntoFileRow, sameTransaction, similarNames,
  isFileRow, FILE_ID_PREFIX, SAME_TXN_DAYS, PENDING_AMOUNT_TOLERANCE, FORMATS
};
