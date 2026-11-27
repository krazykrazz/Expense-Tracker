const { buildMessage, safeName, describeError, formatDuration, formatBytes } = require('./notificationMessages');

const NOW = Date.parse('2026-11-22T16:00:00Z');
const ctx = { timezone: 'America/Toronto', now: NOW };
const text = (message, title) => message.fields.find(f => f.title === title)?.text;

describe('buildMessage', () => {
  test('needs login: the header names the problem, the bank is the subject, the action is the description; pings', () => {
    const message = buildMessage('plaid_needs_attention', {
      institutionName: 'CIBC', status: 'needs_login', errorCode: 'ITEM_LOGIN_REQUIRED', lastSyncedAt: '2026-11-22 11:24:04'
    }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Bank Needs Login', title: 'CIBC', color: 'E74C3C', ping: true });
    expect(message.description).toContain('Reconnect');
    expect(message.fields.map(f => f.title)).toEqual(['Error code', 'Last good sync', 'Auto sync']);
    expect(text(message, 'Error code')).toBe('ITEM_LOGIN_REQUIRED');
    expect(text(message, 'Last good sync')).toBe('Nov 22, 6:24 AM');
    expect(text(message, 'Auto sync')).toBe('Paused');
  });

  test.each([
    ['needs_login', 'Expense Tracker: Bank Needs Login'],
    ['gone', 'Expense Tracker: Bank Connection Removed'],
    ['error', 'Expense Tracker: Bank Sync Problem']
  ])('a bank in state %s has its own header', (status, name) => {
    expect(buildMessage('plaid_needs_attention', { institutionName: 'CIBC', status }, ctx).name).toBe(name);
  });

  test('an error code that is not an upper-case code is left out, not shown as a dash', () => {
    const message = buildMessage('plaid_needs_attention', { institutionName: 'CIBC', status: 'error', errorCode: 'token abc 1234567' }, ctx);
    expect(message.fields.map(f => f.title)).toEqual(['Last good sync', 'Auto sync']);
    expect(text(message, 'Auto sync')).toBe('Retrying');
  });

  test('stale: says how old Plaid\'s data is in the description and does not ping', () => {
    const message = buildMessage('plaid_stale', { institutionName: 'CIBC', bankUpdatedAt: '2026-11-21T11:16:07.283Z', institutionStatus: 'DOWN' }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Bank Not Updating', title: 'CIBC', color: 'F39C12', ping: false });
    expect(message.description).toContain('for 1 d 4 h');
    expect(message.description).toContain('Log in again');
    expect(text(message, 'Last data from bank')).toBe('Nov 21, 6:16 AM');
    expect(text(message, 'Plaid status')).toBe('DOWN');
  });

  test('recovered: names the previous problem and how long it lasted', () => {
    const message = buildMessage('plaid_recovered', { institutionName: 'CIBC', previousState: 'needs_login', since: '2026-11-20T13:00:00Z' }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Bank Recovered', title: 'CIBC', color: '2ECC71' });
    expect(text(message, 'Was')).toBe('Needs login');
    expect(text(message, 'Down for')).toBe('2 d 3 h');
  });

  test('sync changes: the counts, then one field per account with amounts but only the account name', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'CIBC', added: 3, updated: 1, removed: 0,
      balances: [{ name: 'Dividend Visa 123456', mask: '1234', field: 'available', from: 1204.5, to: 1180.1 }]
    }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: New Bank Activity', title: 'CIBC' });
    expect(text(message, 'Transactions')).toBe('3 new · 1 updated');
    expect(text(message, 'Dividend Visa •••• available credit')).toBe('$1,204.50 → $1,180.10');
    expect(JSON.stringify(message)).not.toContain('1234');
  });

  test('a sync that only changed balances has no counts and says so in the header', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'Wealthsimple (Canada)', added: 0, updated: 0, removed: 0,
      balances: [{ name: 'RRSP', field: 'balance', from: 183793.51, to: 184222.87 }]
    }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Balances Changed', title: 'Wealthsimple (Canada)' });
    expect(message.fields).toEqual([{ title: 'RRSP balance', text: '$183,793.51 → $184,222.87', inline: true }]);
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

  test('no message of any type is missing its colour or has an empty field text', () => {
    const error = new Error('disk full');
    const cases = [
      ['plaid_needs_attention', { institutionName: 'CIBC', status: 'needs_login' }],
      ['plaid_stale', { institutionName: 'CIBC' }],
      ['plaid_recovered', { institutionName: 'CIBC' }],
      ['plaid_sync_changes', { institutionName: 'CIBC' }],
      ['backup_succeeded', {}],
      ['backup_failed', { error }],
      ['backup_recovered', {}],
      ['backup_restored', {}],
      ['test', {}]
    ];
    for (const [eventKey, data] of cases) {
      const message = buildMessage(eventKey, data, ctx);
      expect(message.color).toMatch(/^[0-9A-F]{6}$/);
      expect(message.fields.filter(f => !f.text || f.text.trim() === '' || f.text.trim() === '0')).toEqual([]);
      // Notifiarr needs a description or fields
      expect(message.description || message.fields.length).toBeTruthy();
    }
  });

  test('a negative balance puts the sign before the $', () => {
    const message = buildMessage('plaid_sync_changes', {
      institutionName: 'CIBC', balances: [{ name: 'Visa', field: 'balance', from: 5, to: -12.5 }, { name: 'LOC', field: 'balance', from: -0.001, to: -1234.5 }]
    }, ctx);
    expect(text(message, 'Visa balance')).toBe('$5.00 → -$12.50');
    expect(text(message, 'LOC balance')).toBe('$0.00 → -$1,234.50');
  });

  test('a quoted path with spaces is hidden whole', () => {
    expect(describeError(new Error("EACCES: permission denied, open '/config/My Drive/backups/x.tar.gz'")))
      .toBe("EACCES: permission denied, open '<path>'");
    expect(describeError(new Error('cannot write "G:\\My Drive\\backups"'))).toBe('cannot write "<path>"');
  });

  test('backup failed: the error has no file path', () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write '/config/backups/x.tar.gz'"), { code: 'ENOSPC' });
    const message = buildMessage('backup_failed', { trigger: 'scheduled', error, lastBackup: '2026-11-21T07:00:00Z' }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Backup Failed', title: '', ping: true, color: 'E74C3C' });
    expect(message.fields.map(f => f.title)).toEqual(['Type', 'Last good backup', 'Error']);
    expect(text(message, 'Error')).toBe("ENOSPC: no space left on device, write '<path>'");
    expect(text(message, 'Last good backup')).toBe('Nov 21, 2:00 AM');
  });

  test('backup created: type, size and how many backups are kept, then the file name (dates in it are not account numbers)', () => {
    const message = buildMessage('backup_succeeded', {
      trigger: 'manual', size: 82460000, backupsKept: 7, filename: 'expense-tracker-backup-2026-11-22_02-00-00.tar.gz'
    }, ctx);

    expect(message).toMatchObject({ name: 'Expense Tracker: Backup Created', color: '2ECC71', ping: false });
    expect(message.fields.map(f => f.title)).toEqual(['Type', 'Size', 'Backups Kept', 'Filename']);
    expect(text(message, 'Type')).toBe('Manual');
    expect(text(message, 'Size')).toBe('78.64 MiB');
    expect(text(message, 'Backups Kept')).toBe('7');
    expect(text(message, 'Filename')).toBe('expense-tracker-backup-2026-11-22_02-00-00.tar.gz');
  });

  test('backup created leaves out the backup count when it is not known', () => {
    expect(buildMessage('backup_succeeded', { trigger: 'scheduled', size: 1024, backupsKept: null, filename: 'b.tar.gz' }, ctx)
      .fields.map(f => f.title)).toEqual(['Type', 'Size', 'Filename']);
  });

  test('backup restored and the test message are described, with nothing else to show', () => {
    expect(buildMessage('backup_restored', { filename: 'b.tar.gz' }, ctx)).toMatchObject({
      name: 'Expense Tracker: Backup Restored', description: expect.stringContaining('restored from this backup'), fields: [{ title: 'Filename', text: 'b.tar.gz' }]
    });
    expect(buildMessage('test', {}, ctx)).toMatchObject({ name: 'Expense Tracker: Test Message', description: 'Notifications are working.', fields: [] });
  });

  test('an unknown event is a programming error', () => {
    expect(() => buildMessage('nope', {}, ctx)).toThrow('Unknown notification event');
  });
});

describe('loan payment messages', () => {
  const data = { loanName: 'Pine Mortgage', fixedExpenseName: 'Pine Mortgage', amount: 2800, dueDate: '2026-12-01', paymentMethodName: 'Debit - WS' };

  test('not recorded: names the loan and month, says what to do, pings', () => {
    const message = buildMessage('loan_payment_unconfirmed', data, ctx);
    expect(message).toMatchObject({ name: 'Expense Tracker: Loan Payment Not Recorded', title: 'Pine Mortgage', color: 'F39C12', ping: true });
    expect(message.description).toContain('December 2026 payment');
    expect(message.description).toContain('Inbox');
    expect(message.fields.map(f => [f.title, f.text])).toEqual([['Amount', '$2,800.00'], ['Due', 'Dec 1, 2026'], ['Paid from', 'Debit - WS']]);
  });

  test('recorded: names the month; a different month still missing is listed, the same one is not', () => {
    const same = buildMessage('loan_payment_recorded', { ...data, previousState: 'unconfirmed:2026-12' }, ctx);
    expect(same).toMatchObject({ name: 'Expense Tracker: Loan Payment Recorded', color: '2ECC71', ping: false });
    expect(same.description).toBe('The December 2026 payment is recorded.');
    expect(same.fields.map(f => f.title)).toEqual(['Amount']);

    const later = buildMessage('loan_payment_recorded', { ...data, dueDate: '2027-01-01', previousState: 'unconfirmed:2026-12' }, ctx);
    expect(text(later, 'Still not recorded')).toBe('December 2026');
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
