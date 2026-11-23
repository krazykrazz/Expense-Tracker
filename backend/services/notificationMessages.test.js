const { buildMessage, safeName, describeError, formatDuration, formatBytes } = require('./notificationMessages');

const NOW = Date.parse('2026-11-22T16:00:00Z');
const ctx = { timezone: 'America/Toronto', now: NOW };
const text = (message, title) => message.fields.find(f => f.title === title)?.text;

describe('buildMessage', () => {
  test('needs login: bank, status, code, action; pings; never shows a mask', () => {
    const message = buildMessage('plaid_needs_attention', {
      institutionName: 'CIBC', status: 'needs_login', errorCode: 'ITEM_LOGIN_REQUIRED', lastSyncedAt: '2026-11-22 11:24:04'
    }, ctx);

    expect(message).toMatchObject({ title: '🔴 Bank needs login', color: 'E74C3C', ping: true });
    expect(text(message, 'Bank')).toBe('CIBC');
    expect(text(message, 'Error code')).toBe('ITEM_LOGIN_REQUIRED');
    expect(text(message, 'Last good sync')).toBe('Nov 22, 6:24 AM');
    expect(message.fields.at(-1)).toMatchObject({ title: 'Action', inline: false });
    expect(text(message, 'Action')).toContain('Reconnect');
  });

  test('an error code that is not an upper-case code is not shown', () => {
    const message = buildMessage('plaid_needs_attention', { institutionName: 'CIBC', status: 'error', errorCode: 'token abc 1234567' }, ctx);
    expect(text(message, 'Error code')).toBe('—');
  });

  test('stale: shows how old Plaid\'s data is and does not ping', () => {
    const message = buildMessage('plaid_stale', { institutionName: 'CIBC', bankUpdatedAt: '2026-11-21T11:16:07.283Z', institutionStatus: 'DOWN' }, ctx);

    expect(message).toMatchObject({ title: '🟡 Bank not updating', color: 'F39C12', ping: false });
    expect(text(message, 'Plaid data age')).toBe('1 d 4 h');
    expect(text(message, 'Plaid status')).toBe('DOWN');
  });

  test('recovered: names the previous problem and how long it lasted', () => {
    const message = buildMessage('plaid_recovered', { institutionName: 'CIBC', previousState: 'needs_login', since: '2026-11-20T13:00:00Z' }, ctx);

    expect(message).toMatchObject({ title: '🟢 Bank recovered', color: '2ECC71' });
    expect(text(message, 'Was')).toBe('Needs login');
    expect(text(message, 'Down for')).toBe('2 d 3 h');
  });

  test('sync changes list balance moves with amounts but only the account name', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'CIBC', added: 3, updated: 1, removed: 0,
      balances: [{ name: 'Dividend Visa 123456', mask: '1234', field: 'available', from: 1204.5, to: 1180.1 }]
    }, ctx);

    expect(text(message, 'Transactions')).toBe('3 new · 1 updated');
    const balances = text(message, 'Balances');
    expect(balances).toBe('Dividend Visa •••• available credit: $1,204.50 → $1,180.10');
    expect(JSON.stringify(message)).not.toContain('1234');
  });

  test('a sync that only changed balances has no counts and says so in the title', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'Wealthsimple (Canada)', added: 0, updated: 0, removed: 0,
      balances: [{ name: 'RRSP', field: 'balance', from: 183793.51, to: 184222.87 }]
    }, ctx);

    expect(message.title).toBe('🔵 Bank sync: balances changed');
    expect(message.fields.map(f => f.title)).toEqual(['Bank', 'Balances']);
  });

  // Notifiarr shows a field whose text is just "0" as "Missing Value"
  test.each([
    ['all zero', { added: 0, updated: 0, removed: 0 }],
    ['missing counts', {}],
    ['some zero', { added: 2, updated: 0, removed: 0 }],
    ['only removed', { added: 0, updated: 0, removed: 4 }]
  ])('sync changes never send a bare 0 (%s)', (_name, counts) => {
    const message = buildMessage('plaid_sync_changes', { institutionName: 'CIBC', ...counts, balances: [] }, ctx);
    expect(message.fields.filter(f => f.text.trim() === '0')).toEqual([]);
  });

  test('a negative balance puts the sign before the $', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'CIBC', balances: [{ name: 'Visa', field: 'balance', from: 5, to: -12.5 }, { name: 'LOC', field: 'balance', from: -0.001, to: -1234.5 }]
    }, ctx);
    expect(text(message, 'Balances')).toBe('Visa balance: $5.00 → -$12.50\nLOC balance: $0.00 → -$1,234.50');
  });

  test('a quoted path with spaces is hidden whole', () => {
    expect(describeError(new Error("EACCES: permission denied, open '/config/My Drive/backups/x.tar.gz'")))
      .toBe("EACCES: permission denied, open '<path>'");
    expect(describeError(new Error('cannot write "G:\\My Drive\\backups"'))).toBe('cannot write "<path>"');
  });

  test('backup failed: the error has no file path', () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write '/config/backups/x.tar.gz'"), { code: 'ENOSPC' });
    const message = buildMessage('backup_failed', { trigger: 'scheduled', error, lastBackup: '2026-11-21T07:00:00Z' }, ctx);

    expect(message).toMatchObject({ title: '🔴 Backup failed', ping: true });
    expect(text(message, 'Error')).toBe("ENOSPC: no space left on device, write '<path>'");
    expect(text(message, 'Last good backup')).toBe('Nov 21, 2:00 AM');
  });

  test('backup completed keeps the file name (dates in it are not account numbers)', () => {
    const message = buildMessage('backup_succeeded', { trigger: 'manual', size: 82460000, filename: 'expense-tracker-backup-2026-11-22_02-00-00.tar.gz' }, ctx);
    expect(text(message, 'Filename')).toBe('expense-tracker-backup-2026-11-22_02-00-00.tar.gz');
    expect(text(message, 'Size')).toBe('78.64 MiB');
    expect(text(message, 'Trigger')).toBe('Manual');
  });

  test('an unknown event is a programming error', () => {
    expect(() => buildMessage('nope', {}, ctx)).toThrow('Unknown notification event');
  });
});

describe('helpers', () => {
  test.each([
    ['CIBC Visa 1234567', 'CIBC Visa ••••'],
    ['  Chequing   ', 'Chequing'],
    ['', 'Unknown'],
    [null, 'Unknown']
  ])('safeName(%p)', (input, expected) => expect(safeName(input)).toBe(expected));

  test.each([
    [30 * 1000, '1 min'],
    [45 * 60000, '45 min'],
    [3 * 3600000 + 10 * 60000, '3 h 10 min'],
    [51 * 3600000, '2 d 3 h']
  ])('formatDuration(%p)', (ms, expected) => expect(formatDuration(ms)).toBe(expected));

  test.each([[512, '512 B'], [2048, '2.00 KiB'], [-1, 'Unknown'], [undefined, 'Unknown']])('formatBytes(%p)', (n, expected) => expect(formatBytes(n)).toBe(expected));

  test('describeError prefixes the code only when the message lacks it', () => {
    expect(describeError(Object.assign(new Error('disk full'), { code: 'ENOSPC' }))).toBe('ENOSPC: disk full');
    expect(describeError(Object.assign(new Error('ENOSPC: disk full'), { code: 'ENOSPC' }))).toBe('ENOSPC: disk full');
  });
});
