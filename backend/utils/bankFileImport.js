/**
 * Bank file import (CSV exports downloaded from the bank's website): parse supported formats into rows shaped
 * like Plaid transactions, and merge them with what's already staged, in either order (file first or Plaid
 * first). A fallback for when Plaid can't fetch from a bank; after the merge, rows are handled the same
 * whichever source they came from. Pure functions; no database access.
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
const crypto = require('crypto');
const { toCents, dayDiff, nameTokens } = require('./plaidMatching');

/** Rows for the same money within this many days are the same transaction. */
const SAME_TXN_DAYS = 3;
/** A pending charge can settle for a different amount (tip, gas hold): within this share of the pending amount. */
const PENDING_AMOUNT_TOLERANCE = 0.25;
/** transaction_id prefix of rows that came from a file (Plaid's own ids never contain ':'). */
const FILE_ID_PREFIX = 'file:';

const isFileRow = (transactionId) => typeof transactionId === 'string' && transactionId.startsWith(FILE_ID_PREFIX);

/**
 * Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF/LF,
 * and a UTF-8 BOM. Returns rows of strings; blank lines are dropped.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MASKED_CARD_RE = /^\d{4}\*+\d{4}$/;

/**
 * Supported exports. `accountType` is the Plaid account type the file must be imported into; `dateKind` says
 * whether the file's date is the purchase date or the posting date. Amounts are converted to Plaid's sign:
 * positive = money out of the account (a purchase), negative = money in.
 * Formats with `columns` have a header row; `headerless` ones are recognised by their first row.
 */
const FORMATS = [
  {
    id: 'wealthsimple_credit_card',
    label: 'Wealthsimple credit card',
    accountType: 'credit',
    dateKind: 'purchase',
    columns: ['transaction_date', 'transaction_type', 'status', 'merchant', 'amount'],
    toRow: (r) => {
      const merchant = clean(r.merchant);
      return {
        date: r.transaction_date,
        amount: -Number(r.amount),
        currency: r.currency || null,
        name: merchant || clean(r.transaction_type),
        merchantName: merchant || null,
        pending: /^pending$/i.test(clean(r.status)),
        identity: [r.transaction_type, merchant]
      };
    }
  },
  {
    id: 'wealthsimple_chequing',
    label: 'Wealthsimple chequing',
    accountType: 'depository',
    dateKind: 'purchase',
    columns: ['transaction_date', 'transaction_time', 'account_number', 'transaction_type', 'status', 'payee', 'amount'],
    toRow: (r) => {
      const payee = clean(r.payee);
      const kind = clean(r.transaction_sub_type) || clean(r.transaction_type);
      return {
        date: r.transaction_date,
        amount: -Number(r.amount),
        currency: r.currency || null,
        name: payee ? `${payee} - ${kind}` : [clean(r.transaction_type), clean(r.transaction_sub_type)].filter(Boolean).join(' - '),
        merchantName: payee || null,
        pending: /^pending$/i.test(clean(r.status)),
        accountNumber: clean(r.account_number),
        identity: [r.transaction_time, r.transaction_type, r.transaction_sub_type, payee]
      };
    }
  },
  {
    // date, description, debit, credit, masked card number; posted transactions only, no header
    id: 'cibc_credit_card',
    label: 'CIBC credit card',
    accountType: 'credit',
    dateKind: 'posted',
    headerless: true,
    detect: (values) => values.length >= 5 && DATE_RE.test(clean(values[0])) && MASKED_CARD_RE.test(clean(values[4])),
    toRow: (values) => {
      const debit = clean(values[2]);
      const credit = clean(values[3]);
      const card = clean(values[4]);
      return {
        date: clean(values[0]),
        amount: debit !== '' ? Number(debit) : -Number(credit),
        currency: 'CAD',
        name: clean(values[1]),
        merchantName: null,
        pending: false,
        accountNumber: card,
        identity: [clean(values[1]), card]
      };
    }
  }
];

const SUPPORTED_TEXT = FORMATS.map(f => f.label).join(', ');

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Parse a bank CSV export.
 * Each row gets a stable `key` (hash of format, account, date, amount, identity and its occurrence among
 * identical rows), so importing the same file again finds the same rows. The status is not part of the key:
 * a pending row that completes in a later export updates in place.
 * @param {string} text file contents
 * @param {number|string} accountId the bank account it's imported into (part of the key)
 * @returns {{format: string, label: string, accountType: string, dateKind: string, accountNumbers: string[], rows: Array<object>}}
 */
function parseBankFile(text, accountId) {
  if (typeof text !== 'string' || text.trim() === '') throw fail('The file is empty.');
  const lines = parseCsv(text);
  const header = (lines[0] || []).map(name => clean(name).toLowerCase());
  let format = FORMATS.find(f => f.columns && f.columns.every(name => header.includes(name)));
  let records;
  if (format) {
    records = lines.slice(1).map(values => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
  } else {
    format = FORMATS.find(f => f.headerless && lines.length > 0 && f.detect(lines[0]));
    records = lines;
  }
  if (!format) {
    throw fail(`Unrecognised file. Supported: ${SUPPORTED_TEXT} CSV exports.`);
  }

  const seen = new Map();
  const rows = [];
  const accountNumbers = new Set();
  records.forEach((record, index) => {
    const row = format.toRow(record);
    if (!DATE_RE.test(row.date) || !Number.isFinite(row.amount)) {
      throw fail(`Line ${index + (format.headerless ? 1 : 2)} isn't a transaction (date "${row.date}").`);
    }
    if (row.accountNumber) accountNumbers.add(row.accountNumber);
    row.amount = Math.round(row.amount * 100) / 100;
    const base = [format.id, accountId, row.date, toCents(row.amount), ...row.identity.map(clean)].join('|');
    const occurrence = seen.get(base) || 0;
    seen.set(base, occurrence + 1);
    const { identity, accountNumber, ...rest } = row;
    rows.push({
      ...rest,
      authorizedDate: format.dateKind === 'purchase' ? row.date : null,
      key: `${FILE_ID_PREFIX}${crypto.createHash('sha256').update(`${base}|${occurrence}`).digest('hex').slice(0, 32)}`
    });
  });
  if (rows.length === 0) throw fail('The file has no transactions.');
  return {
    format: format.id, label: format.label, accountType: format.accountType, dateKind: format.dateKind,
    accountNumbers: [...accountNumbers], rows
  };
}

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

/** A linked expense follows a pending charge that settles or changes amount (plaidInboxService.applySettlements). */
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
  return { fields, settlement: settlementFor(fileRow, fields) };
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
