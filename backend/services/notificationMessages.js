/**
 * Builds the text of each notification (title, colour, fields). Messages leave the app through a third party
 * (Notifiarr), so nothing here may carry card or account numbers, masks / last-4 digits, tokens or file paths:
 * names go through safeName(), error text through describeError(). Balance amounts are allowed.
 */
const COLORS = { red: 'E74C3C', amber: 'F39C12', green: '2ECC71', blue: '3498DB' };

const STATUS_LABELS = { needs_login: 'Needs login', gone: 'Connection removed', error: 'Sync problem', stale: 'Not updating', ok: 'Syncing' };
const PLAID_ACTIONS = {
  needs_login: 'The bank needs you to log in again. On the Connections tab use **Reconnect**: it keeps the same connection (no new Trial slot, nothing re-imported).',
  gone: 'The bank or Plaid no longer recognises this connection. Disconnect it, then connect the bank again.',
  error: 'The sync has been failing for over an hour. This is often temporary at the bank and automatic sync keeps retrying; if it persists, check the Connections tab.',
  stale: 'Some banks (CIBC) only send new data when you log in: use **Log in again** on the Connections tab, or import a file. Don\'t disconnect.'
};

const field = (title, text, inline = true) => ({ title, text: String(text ?? '') || '—', inline });

/** A bank or account name for a message: any run of 4+ digits (could be part of a card or account number) is hidden. */
function safeName(value) {
  const name = String(value ?? '').replace(/\d{4,}/g, '••••').replace(/\s+/g, ' ').trim().slice(0, 80);
  return name || 'Unknown';
}

/** An error's code and message without file paths. */
function describeError(error) {
  const code = /^[A-Z][A-Z0-9_]{2,}$/.test(error?.code || '') ? error.code : null;
  const message = String(error?.message ?? error ?? '')
    // Quoted paths first: they can contain spaces ('/config/My Drive/backups')
    .replace(/(['"])(?:[A-Za-z]:)?[\\/][^'"]*\1/g, '$1<path>$1')
    .replace(/(^|[\s'"(])(?:[A-Za-z]:)?[\\/][^\s'")]+/g, (match, lead) => (match.slice(lead.length) === '<path>' ? match : `${lead}<path>`))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const text = code && !message.startsWith(code) ? `${code}: ${message}` : message;
  return text || 'Unknown error';
}

/** Plaid error codes are upper-case words; anything else is not shown. */
const safeCode = (value) => (/^[A-Z][A-Z0-9_]{2,63}$/.test(value || '') ? value : null);

function toDate(value) {
  if (!value) return null;
  // SQLite CURRENT_TIMESTAMP values are UTC without a zone marker
  const text = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWhen(value, timezone) {
  const date = toDate(value);
  if (!date) return 'Unknown';
  // Newer ICU versions put a narrow no-break space before AM/PM
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(date).replace(/[\u202f\u00a0]/g, ' ');
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `${Math.floor(hours / 24)} d${hours % 24 ? ` ${hours % 24} h` : ''}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${unit === 0 ? value : value.toFixed(2)} ${units[unit]}`;
}

/** "-$12.50", not "$-12.50"; the sign is decided on the rounded value so -0.001 is "$0.00". */
const money = (n) => {
  const cents = Math.round(Number(n) * 100);
  const text = (Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? '-' : ''}$${text}`;
};
const triggerLabel = (trigger) => (trigger === 'manual' ? 'Manual' : 'Scheduled');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'YYYY-MM' (or a 'YYYY-MM-DD' date) → 'December 2026'; null when it isn't one. */
function monthLabel(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? ''));
  const month = match ? Number(match[2]) : 0;
  return month >= 1 && month <= 12 ? `${MONTH_NAMES[month - 1]} ${match[1]}` : null;
}
/** 'YYYY-MM-DD' → 'Dec 1, 2026' (calendar date, no timezone shift). */
function dayLabel(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  return match ? `${MONTH_NAMES[Number(match[2]) - 1].slice(0, 3)} ${Number(match[3])}, ${match[1]}` : String(value ?? '');
}
/** The month in a loan notification state ('unconfirmed:YYYY-MM'). */
const stateMonth = (state) => (typeof state === 'string' && state.startsWith('unconfirmed:') ? state.slice('unconfirmed:'.length) : null);

/**
 * Every message type decides its own layout: `name` is the header line next to the app icon ("Expense Tracker:
 * Backup Created"), `title` the subject in bold under it (the bank), `description` a sentence of context, and
 * `fields` only what matters for that type. No emoji: the colour bar carries the severity.
 */
const BUILDERS = {
  plaid_needs_attention: (d, ctx) => ({
    name: d.status === 'error' ? 'Expense Tracker: Bank Sync Problem'
      : d.status === 'gone' ? 'Expense Tracker: Bank Connection Removed' : 'Expense Tracker: Bank Needs Login',
    title: safeName(d.institutionName),
    description: PLAID_ACTIONS[d.status] || PLAID_ACTIONS.error,
    color: COLORS.red,
    ping: true,
    fields: [
      ...(safeCode(d.errorCode) ? [field('Error code', safeCode(d.errorCode))] : []),
      field('Last good sync', formatWhen(d.lastSyncedAt, ctx.timezone)),
      field('Auto sync', d.status === 'error' ? 'Retrying' : 'Paused')
    ]
  }),

  plaid_stale: (d, ctx) => {
    const updated = toDate(d.bankUpdatedAt);
    const age = updated ? formatDuration(ctx.now - updated.getTime()) : null;
    return {
      name: 'Expense Tracker: Bank Not Updating',
      title: safeName(d.institutionName),
      description: `${age ? `Plaid has had no new data from this bank for ${age}.` : 'Plaid has had no new data from this bank.'} The app's own sync is working. ${PLAID_ACTIONS.stale}`,
      color: COLORS.amber,
      ping: false,
      fields: [
        field('Last data from bank', formatWhen(d.bankUpdatedAt, ctx.timezone)),
        field('Plaid status', d.institutionStatus || 'Unknown')
      ]
    };
  },

  plaid_recovered: (d, ctx) => ({
    name: 'Expense Tracker: Bank Recovered',
    title: safeName(d.institutionName),
    description: 'Syncing normally again.',
    color: COLORS.green,
    ping: false,
    fields: [
      field('Was', STATUS_LABELS[d.previousState] || 'Problem'),
      ...(toDate(d.since) ? [field('Down for', formatDuration(ctx.now - toDate(d.since).getTime()))] : [])
    ]
  }),

  plaid_sync_changes: (d) => {
    // Only counts above zero: Notifiarr shows a field whose text is just "0" as "Missing Value"
    const counts = [[d.added, 'new'], [d.updated, 'updated'], [d.removed, 'removed']]
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${label}`);
    // One field per account, like the attributes of a Sonarr message: "RRSP balance  $183,793.51 → $184,222.87"
    const balances = (d.balances || []).slice(0, 12).map(change =>
      field(`${safeName(change.name)} ${change.field === 'available' ? 'available credit' : 'balance'}`, `${money(change.from)} → ${money(change.to)}`));
    return {
      name: counts.length > 0 ? 'Expense Tracker: New Bank Activity' : 'Expense Tracker: Balances Changed',
      title: safeName(d.institutionName),
      // Notifiarr needs a description or fields
      description: counts.length === 0 && balances.length === 0 ? 'Sync completed.' : '',
      color: COLORS.blue,
      ping: false,
      fields: [
        ...(counts.length > 0 ? [field('Transactions', counts.join(' · '))] : []),
        ...balances
      ]
    };
  },

  loan_payment_unconfirmed: (d) => ({
    name: 'Expense Tracker: Loan Payment Not Recorded',
    title: safeName(d.loanName),
    description: `The ${monthLabel(d.dueDate) || 'monthly'} payment is still not recorded 5 days after its due date. `
      + 'If the bank paid it, confirm it in Bank Import → Inbox (confirming the fixed expense records the loan payment). '
      + 'If it hasn\'t left your account, check with the lender.',
    color: COLORS.amber,
    ping: true,
    fields: [
      field('Amount', money(d.amount)),
      field('Due', dayLabel(d.dueDate)),
      ...(d.paymentMethodName ? [field('Paid from', safeName(d.paymentMethodName))] : [])
    ]
  }),

  loan_payment_recorded: (d) => {
    const missed = stateMonth(d.previousState);
    const month = monthLabel(d.dueDate);
    return {
      name: 'Expense Tracker: Loan Payment Recorded',
      title: safeName(d.loanName),
      description: `The ${month || 'monthly'} payment is recorded.`,
      color: COLORS.green,
      ping: false,
      fields: [
        field('Amount', money(d.amount)),
        ...(missed && monthLabel(missed) !== month ? [field('Still not recorded', monthLabel(missed))] : [])
      ]
    };
  },

  backup_failed: (d, ctx) => ({
    name: 'Expense Tracker: Backup Failed',
    title: '',
    description: '',
    color: COLORS.red,
    ping: true,
    fields: [
      field('Type', triggerLabel(d.trigger)),
      field('Last good backup', d.lastBackup ? formatWhen(d.lastBackup, ctx.timezone) : 'None'),
      field('Error', describeError(d.error), false)
    ]
  }),

  backup_recovered: (d, ctx) => ({
    name: 'Expense Tracker: Backup Recovered',
    title: '',
    description: '',
    color: COLORS.green,
    ping: false,
    fields: [
      field('Type', triggerLabel(d.trigger)),
      field('Size', formatBytes(d.size)),
      ...(toDate(d.since) ? [field('Failing for', formatDuration(ctx.now - toDate(d.since).getTime()))] : []),
      ...(d.filename ? [field('Filename', d.filename, false)] : [])
    ]
  }),

  backup_succeeded: (d) => ({
    name: 'Expense Tracker: Backup Created',
    title: '',
    description: '',
    color: COLORS.green,
    ping: false,
    fields: [
      field('Type', triggerLabel(d.trigger)),
      field('Size', formatBytes(d.size)),
      ...(Number.isInteger(d.backupsKept) && d.backupsKept > 0 ? [field('Backups Kept', d.backupsKept)] : []),
      ...(d.filename ? [field('Filename', d.filename, false)] : [])
    ]
  }),

  backup_restored: (d) => ({
    name: 'Expense Tracker: Backup Restored',
    title: '',
    description: 'The database was restored from this backup.',
    color: COLORS.amber,
    ping: false,
    fields: d.filename ? [field('Filename', d.filename, false)] : []
  }),

  test: (d) => ({
    name: 'Expense Tracker: Test Message',
    title: '',
    description: 'Notifications are working.',
    color: COLORS.blue,
    ping: Boolean(d.ping),
    fields: []
  })
};

/**
 * @param {string} eventKey one of EVENT_KEYS, 'backup_recovered', 'loan_payment_recorded' or 'test'
 * @param {object} data event data (see BUILDERS)
 * @param {{timezone?: string, now?: number}} [context]
 * @returns {{name: string, title: string, description: string, color: string, ping: boolean,
 *   fields: Array<{title: string, text: string, inline: boolean}>}}
 */
function buildMessage(eventKey, data = {}, { timezone = 'America/Toronto', now = Date.now() } = {}) {
  const builder = BUILDERS[eventKey];
  if (!builder) throw new Error(`Unknown notification event: ${eventKey}`);
  return builder(data, { timezone, now });
}

module.exports = { buildMessage, safeName, describeError, formatBytes, formatDuration, formatWhen, monthLabel, COLORS };
