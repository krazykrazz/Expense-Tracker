/**
 * Integration tests: plaidInvestmentValueService -> repositories -> real SQLite (spec 4.1b, monthly investment
 * values from the bank). The accounts mirror production: Wealthsimple RRSP accounts linked to RRSP investments.
 */

const { createIsolatedTestDb, cleanupIsolatedTestDb } = require('../test/dbIsolation');
const { sqlHelpers, insertItem } = require('../test/plaidFixtures');

jest.mock('../database/db', () => ({
  ...jest.requireActual('../database/db'),
  getDatabase: jest.fn()
}));
jest.mock('./activityLogService');
jest.mock('../config/plaid', () => ({
  ...jest.requireActual('../config/plaid'),
  getPlaidConfig: jest.fn(() => ({ environment: 'sandbox', enabled: true }))
}));

const { getDatabase } = require('../database/db');
const activityLogService = require('./activityLogService');
const plaidInvestmentValueService = require('./plaidInvestmentValueService');
const investmentValueService = require('./investmentValueService');

// Mid-month in Toronto, well away from a month boundary
const NOW = new Date('2026-11-15T17:00:00Z');

let db;
let itemId;
let accountSeq = 0;

const { run, get, all } = sqlHelpers(() => db);

const investment = (name) => run(`INSERT INTO investments (name, type, initial_value) VALUES (?, 'RRSP', 0)`, [name]);

const account = (investmentId, balance, { item = itemId, type = 'investment', currency = 'CAD' } = {}) => {
  accountSeq += 1;
  return run(
    `INSERT INTO plaid_accounts (plaid_item_id, account_id, name, mask, type, subtype, investment_id, current_balance, balance_currency)
     VALUES (?, ?, 'RRSP', ?, ?, 'rrsp', ?, ?, ?)`,
    [item, `acc-${accountSeq}`, String(accountSeq), type, investmentId, balance, currency]
  );
};

const valueOf = (investmentId, year = 2026, month = 11) =>
  get('SELECT value, source FROM investment_values WHERE investment_id = ? AND year = ? AND month = ?', [investmentId, year, month]);

const events = () => activityLogService.logEvent.mock.calls.filter(call => call[0] === 'plaid_balances_updated');

beforeAll(async () => {
  db = await createIsolatedTestDb();
  getDatabase.mockResolvedValue(db);
});

afterAll(() => cleanupIsolatedTestDb(db));

beforeEach(async () => {
  activityLogService.logEvent.mockClear();
  await run('DELETE FROM investment_values');
  await run('DELETE FROM plaid_accounts');
  await run('DELETE FROM investments');
  await run('DELETE FROM plaid_items');
  itemId = await insertItem(run);
});

describe('plaidInvestmentValueService.applyLinkedBalances', () => {
  it('writes this month from the bank, rounded to cents, and logs one summary', async () => {
    const rrsp = await investment('Kevin Managed RRSP');
    await account(rrsp, 188130.4872110587);

    const written = await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);

    expect(written).toEqual([{ investmentId: rrsp, name: 'Kevin Managed RRSP', value: 188130.49 }]);
    expect(await valueOf(rrsp)).toEqual({ value: 188130.49, source: 'bank' });
    expect(events()).toHaveLength(1);
    expect(events()[0][1]).toBe('investment_value');
    expect(events()[0][3]).toContain('Kevin Managed RRSP $188,130.49');
  });

  it('keeps the bank row up to date during the month and logs nothing when the balance is unchanged', async () => {
    const rrsp = await investment('RRSP');
    const acc = await account(rrsp, 100);
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);

    await run('UPDATE plaid_accounts SET current_balance = 150.5 WHERE id = ?', [acc]);
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);
    expect(await valueOf(rrsp)).toEqual({ value: 150.5, source: 'bank' });

    activityLogService.logEvent.mockClear();
    expect(await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW)).toEqual([]);
    expect(events()).toHaveLength(0);
  });

  it('starts a new month and leaves the previous month at its last value', async () => {
    const rrsp = await investment('RRSP');
    const acc = await account(rrsp, 100);
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);

    await run('UPDATE plaid_accounts SET current_balance = 120 WHERE id = ?', [acc]);
    await plaidInvestmentValueService.applyLinkedBalances(itemId, new Date('2026-12-01T12:00:00Z'));

    expect(await valueOf(rrsp, 2026, 11)).toEqual({ value: 100, source: 'bank' });
    expect(await valueOf(rrsp, 2026, 12)).toEqual({ value: 120, source: 'bank' });
  });

  it('uses the business timezone for the month (Nov 30 evening in Toronto is still November)', async () => {
    const rrsp = await investment('RRSP');
    await account(rrsp, 100);

    await plaidInvestmentValueService.applyLinkedBalances(itemId, new Date('2026-12-01T02:00:00Z'));

    expect(await valueOf(rrsp, 2026, 11)).toEqual({ value: 100, source: 'bank' });
    expect(await valueOf(rrsp, 2026, 12)).toBeUndefined();
  });

  it('never overwrites a value entered or edited by hand, and refills a deleted one', async () => {
    const entered = await investment('Entered');
    const edited = await investment('Edited');
    await account(entered, 500);
    await account(edited, 700);
    await investmentValueService.createOrUpdateValue({ investment_id: entered, year: 2026, month: 11, value: 480 });
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);
    const editedRow = await get('SELECT id FROM investment_values WHERE investment_id = ?', [edited]);
    await investmentValueService.updateValue(editedRow.id, { value: 690 });

    await run('UPDATE plaid_accounts SET current_balance = current_balance + 1');
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);
    expect(await valueOf(entered)).toEqual({ value: 480, source: 'manual' });
    expect(await valueOf(edited)).toEqual({ value: 690, source: 'manual' });

    await investmentValueService.deleteValue(editedRow.id);
    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);
    expect(await valueOf(edited)).toEqual({ value: 701, source: 'bank' });
  });

  it('sums several accounts, including one at another bank', async () => {
    const rrsp = await investment('RRSP');
    const otherItem = await insertItem(run, { itemId: 'item-2' });
    await account(rrsp, 100.25);
    await account(rrsp, 50.5, { item: otherItem });

    await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW);

    expect(await valueOf(rrsp)).toEqual({ value: 150.75, source: 'bank' });
  });

  it.each([
    ['an account has no balance yet', { balance: null }],
    ['the other bank failed its last sync', { lastError: 'ITEM_LOGIN_REQUIRED' }],
    ['the other bank is of another Plaid environment', { environment: 'production' }],
    ['the currencies differ', { currency: 'USD' }]
  ])('skips the investment when %s', async (_label, { balance = 50, lastError = null, environment = 'sandbox', currency = 'CAD' }) => {
    const rrsp = await investment('RRSP');
    const otherItem = await insertItem(run, { itemId: 'item-2', environment });
    if (lastError) await run('UPDATE plaid_items SET last_error = ? WHERE id = ?', [lastError, otherItem]);
    await account(rrsp, 100);
    await account(rrsp, balance, { item: otherItem, currency });

    expect(await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW)).toEqual([]);
    expect(await valueOf(rrsp)).toBeUndefined();
  });

  it('does nothing for a bank with no linked investment accounts', async () => {
    await account(null, 100);
    expect(await plaidInvestmentValueService.applyLinkedBalances(itemId, NOW)).toEqual([]);
    expect(await all('SELECT id FROM investment_values')).toEqual([]);
  });
});
