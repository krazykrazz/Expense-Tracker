/**
 * Bank file formats: a minimal CSV reader and the supported bank exports (Wealthsimple, CIBC), parsed into rows
 * shaped like Plaid transactions with a stable `file:<hash>` key. Merging them is in bankFileImport. No database access.
 */
const crypto = require('crypto');
const { toCents } = require('./plaidMatching');
const { fail: httpFail } = require('./httpError');

/** transaction_id prefix of rows that came from a file (Plaid's own ids never contain ':'). */
const FILE_ID_PREFIX = 'file:';

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
/** A money column as a number; empty is NaN (not 0), so a row without an amount is rejected. */
const amountOf = (value) => (clean(value) === '' ? NaN : Number(clean(value)));
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
        amount: -amountOf(r.amount),
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
        amount: -amountOf(r.amount),
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
        // Neither column filled is not a transaction (NaN is rejected by parseBankFile)
        amount: debit !== '' ? amountOf(debit) : -amountOf(credit),
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

/** The file can't be imported: bad input (400). */
const fail = (message) => httpFail(message, 400);

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

module.exports = { parseCsv, parseBankFile, FORMATS, FILE_ID_PREFIX };
