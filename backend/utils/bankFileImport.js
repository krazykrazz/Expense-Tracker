/**
 * Bank file import (CSV exports downloaded from the bank's website): parse supported formats into rows shaped
 * like Plaid transactions, and plan how they merge with what's already staged for the account.
 * A fallback for when Plaid can't fetch from a bank. Pure functions; no database access.
 */
const crypto = require('crypto');
const { toCents, dayDiff } = require('./plaidMatching');

/** File rows and staged rows for the same money within this many days are the same transaction. */
const SAME_TXN_DAYS = 3;
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

/**
 * Supported exports. `accountType` is the Plaid account type the file must be imported into. Amounts are
 * converted to Plaid's sign: positive = money out of the account (a purchase), negative = money in.
 */
const FORMATS = [
  {
    id: 'wealthsimple_credit_card',
    label: 'Wealthsimple credit card',
    accountType: 'credit',
    required: ['transaction_date', 'transaction_type', 'status', 'merchant', 'amount'],
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
    required: ['transaction_date', 'transaction_time', 'account_number', 'transaction_type', 'status', 'payee', 'amount'],
    accountNumber: (r) => clean(r.account_number),
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
        identity: [r.transaction_time, r.transaction_type, r.transaction_sub_type, payee]
      };
    }
  }
];

const SUPPORTED_TEXT = FORMATS.map(f => f.label).join(' and ');

const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Parse a bank CSV export.
 * Each row gets a stable `key` (hash of format, account, date, amount, identity and its occurrence among
 * identical rows), so importing the same file again finds the same rows. The status is not part of the key:
 * a pending row that completes in a later export updates in place.
 * @param {string} text file contents
 * @param {number|string} accountId the bank account it's imported into (part of the key)
 * @returns {{format: string, label: string, accountType: string, accountNumber: (string|null), rows: Array<object>}}
 */
function parseBankFile(text, accountId) {
  if (typeof text !== 'string' || text.trim() === '') throw fail('The file is empty.');
  const [header, ...lines] = parseCsv(text);
  const columns = (header || []).map(name => clean(name).toLowerCase());
  const format = FORMATS.find(f => f.required.every(name => columns.includes(name)));
  if (!format) {
    throw fail(`Unrecognised file. Supported: ${SUPPORTED_TEXT} CSV exports.`);
  }

  const seen = new Map();
  const rows = [];
  let accountNumber = null;
  lines.forEach((values, index) => {
    const record = Object.fromEntries(columns.map((name, i) => [name, values[i] ?? '']));
    if (format.accountNumber) accountNumber = accountNumber || format.accountNumber(record) || null;
    const row = format.toRow(record);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.amount)) {
      throw fail(`Line ${index + 2} isn't a transaction (date "${record.transaction_date}", amount "${record.amount}").`);
    }
    row.amount = Math.round(row.amount * 100) / 100;
    const base = [format.id, accountId, row.date, toCents(row.amount), ...row.identity.map(clean)].join('|');
    const occurrence = seen.get(base) || 0;
    seen.set(base, occurrence + 1);
    const { identity, ...rest } = row;
    rows.push({
      ...rest,
      key: `${FILE_ID_PREFIX}${crypto.createHash('sha256').update(`${base}|${occurrence}`).digest('hex').slice(0, 32)}`
    });
  });
  if (rows.length === 0) throw fail('The file has no transactions.');
  return { format: format.id, label: format.label, accountType: format.accountType, accountNumber, rows };
}

/**
 * Plan how file rows merge with rows already staged for the account:
 * 1. the same file row imported before (same key);
 * 2. otherwise the same money already there (same amount to the cent, dates within SAME_TXN_DAYS, closest
 *    first, each staged row used once): from Plaid (left alone: Plaid stays the source) or from an earlier
 *    file under another key (updated, e.g. a pending charge whose date changed when it completed);
 * 3. otherwise new.
 * @param {Array<{key: string, date: string, amount: number, pending: boolean, name: string}>} fileRows
 * @param {Array<{id: number, transactionId: string, date: string, amount: number, pending: number|boolean,
 *   name: string, merchantName: (string|null), expenseId: (number|null)}>} existing
 * @returns {{inserts: Array, updates: Array<{existing: object, row: object}>, unchanged: number, alreadyFromBank: number}}
 */
function planFileImport(fileRows, existing) {
  const byKey = new Map(existing.filter(e => isFileRow(e.transactionId)).map(e => [e.transactionId, e]));
  const used = new Set();
  const pairs = new Map();

  for (const row of fileRows) {
    const same = byKey.get(row.key);
    if (same && !used.has(same.id)) {
      used.add(same.id);
      pairs.set(row, same);
    }
  }
  // Closest dates first across all rows, so two identical charges a day apart pair with the right ones
  const candidates = [];
  fileRows.forEach((row, rowIndex) => {
    if (pairs.has(row)) return;
    for (const candidate of existing) {
      if (used.has(candidate.id) || toCents(candidate.amount) !== toCents(row.amount)) continue;
      const gap = dayDiff(candidate.date, row.date);
      if (gap <= SAME_TXN_DAYS) candidates.push({ row, rowIndex, candidate, gap });
    }
  });
  candidates.sort((a, b) => a.gap - b.gap || a.rowIndex - b.rowIndex || a.candidate.id - b.candidate.id);
  for (const { row, candidate } of candidates) {
    if (pairs.has(row) || used.has(candidate.id)) continue;
    used.add(candidate.id);
    pairs.set(row, candidate);
  }

  const plan = { inserts: [], updates: [], unchanged: 0, alreadyFromBank: 0 };
  for (const row of fileRows) {
    const match = pairs.get(row);
    if (!match) {
      plan.inserts.push(row);
    } else if (!isFileRow(match.transactionId)) {
      plan.alreadyFromBank++;
    } else if (
      match.transactionId !== row.key || Boolean(match.pending) !== row.pending || toCents(match.amount) !== toCents(row.amount)
      || match.date !== row.date || match.name !== row.name || (match.merchantName ?? null) !== row.merchantName
    ) {
      plan.updates.push({ existing: match, row });
    } else {
      plan.unchanged++;
    }
  }
  return plan;
}

module.exports = { parseCsv, parseBankFile, planFileImport, isFileRow, FILE_ID_PREFIX, SAME_TXN_DAYS, FORMATS };
