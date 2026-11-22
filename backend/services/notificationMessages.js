/**
 * Builds the text of each notification (title, colour, fields). Messages leave the app through a third party
 * (Notifiarr), so nothing here may carry card or account numbers, masks / last-4 digits, tokens or file paths:
 * names go through safeName(), error text through describeError(). Balance amounts are allowed.
 */
const COLORS = { red: 'E74C3C', amber: 'F39C12', green: '2ECC71', blue: '3498DB' };

const STATUS_LABELS = { needs_login: 'Needs login', gone: 'Connection removed', error: 'Sync problem', stale: 'Not updating', ok: 'Syncing' };
const PLAID_ACTIONS = {
  needs_login: 'Connections tab → **Reconnect**. Keeps the same connection: no new Trial slot, nothing re-imported.',
  gone: 'The bank or Plaid no longer recognises this connection. Disconnect it, then connect the bank again.',
  error: 'Has lasted over an hour. Often temporary at the bank: automatic sync keeps retrying. If it persists, check the Connections tab.',
  stale: 'Some banks (CIBC) only send new data when you log in. Use **Log in again** on the Connections tab, or import a file. Don\'t disconnect.'
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

const BUILDERS = {
  plaid_needs_attention: (d, ctx) => ({
    title: d.status === 'error' ? '🔴 Bank sync problem' : d.status === 'gone' ? '🔴 Bank connection removed' : '🔴 Bank needs login',
    color: COLORS.red,
    ping: true,
    fields: [
      field('Bank', safeName(d.institutionName)),
      field('Status', STATUS_LABELS[d.status] || 'Problem'),
      field('Error code', safeCode(d.errorCode) || '—'),
      field('Last good sync', formatWhen(d.lastSyncedAt, ctx.timezone)),
      field('Auto sync', d.status === 'error' ? 'Retrying' : 'Paused'),
      field('Action', PLAID_ACTIONS[d.status] || PLAID_ACTIONS.error, false)
    ]
  }),

  plaid_stale: (d, ctx) => {
    const updated = toDate(d.bankUpdatedAt);
    return {
      title: '🟡 Bank not updating',
      color: COLORS.amber,
      ping: false,
      fields: [
        field('Bank', safeName(d.institutionName)),
        field('Status', STATUS_LABELS.stale),
        field('Plaid data age', updated ? formatDuration(ctx.now - updated.getTime()) : 'Unknown'),
        field('Plaid last got data', formatWhen(d.bankUpdatedAt, ctx.timezone)),
        field('Plaid status', d.institutionStatus || 'Unknown'),
        field('Our sync', 'Working'),
        field('Action', PLAID_ACTIONS.stale, false)
      ]
    };
  },

  plaid_recovered: (d, ctx) => ({
    title: '🟢 Bank recovered',
    color: COLORS.green,
    ping: false,
    fields: [
      field('Bank', safeName(d.institutionName)),
      field('Status', STATUS_LABELS.ok),
      field('Was', STATUS_LABELS[d.previousState] || 'Problem'),
      ...(toDate(d.since) ? [field('Down for', formatDuration(ctx.now - toDate(d.since).getTime()))] : [])
    ]
  }),

  plaid_sync_changes: (d) => {
    const balances = (d.balances || []).slice(0, 10).map(change =>
      `${safeName(change.name)} ${change.field === 'available' ? 'available credit' : 'balance'}: ${money(change.from)} → ${money(change.to)}`);
    return {
      title: '🔵 Bank sync: new activity',
      color: COLORS.blue,
      ping: false,
      fields: [
        field('Bank', safeName(d.institutionName)),
        field('New', d.added || 0),
        field('Updated', d.updated || 0),
        field('Removed', d.removed || 0),
        ...(balances.length ? [field('Balances', balances.join('\n'), false)] : [])
      ]
    };
  },

  backup_failed: (d, ctx) => ({
    title: '🔴 Backup failed',
    color: COLORS.red,
    ping: true,
    fields: [
      field('Trigger', triggerLabel(d.trigger)),
      field('Last good backup', d.lastBackup ? formatWhen(d.lastBackup, ctx.timezone) : 'None'),
      field('Error', describeError(d.error), false)
    ]
  }),

  backup_recovered: (d, ctx) => ({
    title: '🟢 Backup recovered',
    color: COLORS.green,
    ping: false,
    fields: [
      field('Trigger', triggerLabel(d.trigger)),
      field('Size', formatBytes(d.size)),
      ...(toDate(d.since) ? [field('Failing for', formatDuration(ctx.now - toDate(d.since).getTime()))] : []),
      ...(d.filename ? [field('Filename', d.filename, false)] : [])
    ]
  }),

  backup_succeeded: (d) => ({
    title: '🔵 Backup completed',
    color: COLORS.blue,
    ping: false,
    fields: [
      field('Size', formatBytes(d.size)),
      field('Trigger', triggerLabel(d.trigger)),
      ...(d.filename ? [field('Filename', d.filename, false)] : [])
    ]
  }),

  backup_restored: (d, ctx) => ({
    title: '🟡 Backup restored',
    color: COLORS.amber,
    ping: false,
    fields: [
      field('When', formatWhen(ctx.now, ctx.timezone)),
      ...(d.filename ? [field('Filename', d.filename, false)] : [])
    ]
  }),

  test: (d, ctx) => ({
    title: '🔵 Test message',
    color: COLORS.blue,
    ping: Boolean(d.ping),
    fields: [
      field('Status', 'Notifications are working'),
      field('Sent', formatWhen(ctx.now, ctx.timezone))
    ]
  })
};

/**
 * @param {string} eventKey one of EVENT_KEYS, 'backup_recovered' or 'test'
 * @param {object} data event data (see BUILDERS)
 * @param {{timezone?: string, now?: number}} [context]
 * @returns {{title: string, color: string, ping: boolean, fields: Array<{title: string, text: string, inline: boolean}>}}
 */
function buildMessage(eventKey, data = {}, { timezone = 'America/Toronto', now = Date.now() } = {}) {
  const builder = BUILDERS[eventKey];
  if (!builder) throw new Error(`Unknown notification event: ${eventKey}`);
  return builder(data, { timezone, now });
}

module.exports = { buildMessage, safeName, describeError, formatBytes, formatDuration, formatWhen, COLORS };
