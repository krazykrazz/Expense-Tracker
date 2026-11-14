import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BankBalance from './BankBalance';
import { bankBalanceOf, bankBalanceText, bankBalanceTitle, formatBankTime } from './bankBalanceUtils';

const NOW = new Date('2026-11-08T18:00:00Z').getTime();
const account = (extra = {}) => ({
  accountType: 'depository', currentBalance: 700.52, availableBalance: null, balanceCurrency: 'CAD',
  balanceAsOf: '2026-11-08T17:10:00Z', bankStatus: 'ok', bankUpdatedAt: '2026-11-08T17:00:00Z', ...extra
});

describe('bankBalanceOf', () => {
  it('is the account balance, fresh within 12 hours, as new as Plaid\'s last fetch from the bank', () => {
    expect(bankBalanceOf([account()], NOW)).toEqual({
      total: 700.52, available: null, asOf: '2026-11-08T17:00:00Z', receivedAt: '2026-11-08T17:10:00Z', stale: false, staleReason: null,
      bankUpdatedAt: '2026-11-08T17:00:00Z', currency: 'CAD'
    });
    // Received before Plaid's last fetch was recorded: the time received
    expect(bankBalanceOf([account({ bankUpdatedAt: '2026-11-08T17:20:00Z' })], NOW).asOf).toBe('2026-11-08T17:10:00Z');
  });

  it('adds several accounts that import into one method, rounding to the cent, and uses the oldest time', () => {
    const balance = bankBalanceOf([
      account({ currentBalance: 0.1, availableBalance: 0.1 }),
      account({ currentBalance: 0.2, availableBalance: 0.1, balanceAsOf: '2026-11-07T20:00:00Z' })
    ], NOW);
    expect(balance).toMatchObject({ total: 0.3, available: 0.2, asOf: '2026-11-07T20:00:00Z', stale: true, staleReason: 'old' });
  });

  it('is old after 12 hours', () => {
    expect(bankBalanceOf([account({ balanceAsOf: '2026-11-08T05:59:00Z' })], NOW).staleReason).toBe('old');
    expect(bankBalanceOf([account({ balanceAsOf: '2026-11-08T06:01:00Z' })], NOW).staleReason).toBeNull();
  });

  it("may be out of date because of the connection's state, even when our last sync was a minute ago", () => {
    expect(bankBalanceOf([account({ bankStatus: 'needs_login' })], NOW).staleReason).toBe('login');
    expect(bankBalanceOf([account({ bankStatus: 'gone' })], NOW).staleReason).toBe('login');
    expect(bankBalanceOf([account({ bankStatus: 'error' })], NOW).staleReason).toBe('error');
    // Plaid itself has had no new data (Wealthsimple's outage): our sync still succeeds and stores the old balance
    expect(bankBalanceOf([account({ bankStatus: 'stale' })], NOW)).toMatchObject({ stale: true, staleReason: 'plaid' });
    // The worst reason wins when accounts differ
    expect(bankBalanceOf([account({ bankStatus: 'stale' }), account({ bankStatus: 'needs_login' })], NOW).staleReason).toBe('login');
  });

  it('has no answer without accounts, before a balance arrived, or when a partial or mixed-currency sum would mislead', () => {
    expect(bankBalanceOf(undefined, NOW)).toBeNull();
    expect(bankBalanceOf([], NOW)).toBeNull();
    expect(bankBalanceOf([account({ currentBalance: null })], NOW)).toBeNull();
    expect(bankBalanceOf([account(), account({ currentBalance: undefined })], NOW)).toBeNull();
    expect(bankBalanceOf([account(), account({ balanceCurrency: 'USD' })], NOW)).toBeNull();
  });

  it('is only for deposit accounts: a card or loan balance is an amount owed, not money in the bank', () => {
    expect(bankBalanceOf([account({ accountType: 'credit' })], NOW)).toBeNull();
    expect(bankBalanceOf([account({ accountType: 'loan' })], NOW)).toBeNull();
    expect(bankBalanceOf([account(), account({ accountType: 'credit' })], NOW)).toBeNull();
    expect(bankBalanceOf([account({ accountType: null })], NOW)).toBeNull();
  });

  it('keeps a negative balance and zero', () => {
    expect(bankBalanceOf([account({ currentBalance: -25.5 })], NOW).total).toBe(-25.5);
    expect(bankBalanceOf([account({ currentBalance: 0 })], NOW).total).toBe(0);
  });
});

describe('bankBalanceText', () => {
  const balance = (extra) => ({ total: 700.52, available: null, asOf: '2026-11-08T17:10:00Z', stale: false, staleReason: null, bankUpdatedAt: null, currency: 'CAD', ...extra });

  it('is the balance and when the bank said so', () => {
    expect(bankBalanceText(balance(), NOW)).toMatch(/^Bank \$700\.52 · as of \d{1,2}:\d{2}/);
  });

  it('adds the available amount only when it differs', () => {
    expect(bankBalanceText(balance({ available: 650 }), NOW)).toContain('· $650.00 available ·');
    expect(bankBalanceText(balance({ available: 700.52 }), NOW)).not.toContain('available');
  });

  it('says so when it may be out of date', () => {
    expect(bankBalanceText(balance({ stale: true, staleReason: 'plaid' }), NOW)).toMatch(/\(may be out of date\)$/);
    expect(bankBalanceText(balance({ asOf: null }), NOW)).toBe('Bank $700.52');
  });
});

describe('formatBankTime', () => {
  it('is the time for today and the date with the time otherwise', () => {
    expect(formatBankTime('2026-11-08T17:10:00Z', NOW)).toMatch(/^\d{1,2}:\d{2}/);
    expect(formatBankTime('2026-11-01T17:10:00Z', NOW)).toMatch(/^Nov 1, /);
    expect(formatBankTime('not a date', NOW)).toBeNull();
  });
});

describe('bankBalanceTitle', () => {
  it('lists the balance and how new the bank\'s figures are', () => {
    const title = bankBalanceTitle({ total: 700.52, available: null, asOf: '2026-11-08T17:10:00Z', stale: false, staleReason: null, bankUpdatedAt: null, currency: 'CAD' });
    expect(title.split('\n')).toEqual(['Bank balance: $700.52', expect.stringMatching(/^Bank's figures from /)]);
  });

  it('says when figures received later were older (WS Shared, Nov 11: received 8:45 PM, Plaid\'s fetch 3:51 PM)', () => {
    const lines = bankBalanceTitle({
      total: 660.52, available: null, asOf: '2026-11-11T20:51:15Z', receivedAt: '2026-11-12T01:45:00Z',
      stale: false, staleReason: null, bankUpdatedAt: '2026-11-11T20:51:15Z', currency: 'CAD'
    }).split('\n');
    expect(lines[1]).toMatch(/^Bank's figures from Nov 11/);
    expect(lines[2]).toMatch(/^Received .*\(Plaid hadn't fetched newer figures from the bank\)$/);
  });

  it('adds the available amount only when it differs, other currencies, and why it may be old', () => {
    const lines = bankBalanceTitle({
      total: 700.52, available: 650, asOf: '2026-11-07T10:00:00Z', stale: true, staleReason: 'plaid',
      bankUpdatedAt: '2026-11-03T21:11:00Z', currency: 'USD'
    }).split('\n');
    expect(lines[0]).toBe('Bank balance: $700.52 USD');
    expect(lines[1]).toBe('Available: $650.00');
    expect(lines[3]).toMatch(/^Plaid last had data from the bank Nov 3/);
    expect(lines[4]).toMatch(/Plaid hasn't had new data from the bank for over 12 hours/);
  });

  it('explains a login problem and a plain old balance, and leaves out a time it does not have', () => {
    const base = { total: 5, available: 5, asOf: null, bankUpdatedAt: null, currency: 'CAD', stale: true };
    expect(bankBalanceTitle({ ...base, staleReason: 'login' }).split('\n')).toEqual([
      'Bank balance: $5.00', expect.stringContaining('needs you to log in again')
    ]);
    expect(bankBalanceTitle({ ...base, staleReason: 'old' })).toContain('over 12 hours old');
  });
});

describe('BankBalance', () => {
  it('shows the balance with when it arrived, in the hover text too', () => {
    const now = new Date().toISOString();
    render(<BankBalance accounts={[account({ balanceAsOf: now, bankUpdatedAt: now })]} />);
    const el = screen.getByTestId('bank-balance');
    expect(el.textContent).toMatch(/^Bank \$700\.52 · as of \d{1,2}:\d{2}/);
    expect(el).not.toHaveClass('stale');
    expect(el.getAttribute('title')).toMatch(/^Bank balance: \$700\.52\nBank's figures from /);
  });

  it('is dimmed and says it may be out of date when the bank is not updating', () => {
    render(<BankBalance accounts={[account({ balanceAsOf: new Date().toISOString(), bankStatus: 'stale' })]} />);
    const el = screen.getByTestId('bank-balance');
    expect(el).toHaveClass('stale');
    expect(el.textContent).toMatch(/\(may be out of date\)$/);
  });

  it('renders nothing without a balance', () => {
    const { container } = render(<BankBalance accounts={[account({ currentBalance: null })]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
