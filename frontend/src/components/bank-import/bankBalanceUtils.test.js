import { describe, it, expect } from 'vitest';
import { bankBalanceOf } from './bankBalanceUtils';

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const account = (extra = {}) => ({
  accountType: 'investment', currentBalance: 186331.54567054, availableBalance: null, balanceCurrency: 'CAD',
  balanceAsOf: '2026-11-20T11:14:43.695Z', bankStatus: 'ok', bankUpdatedAt: '2026-11-20T10:31:09Z', ...extra
});

describe('bankBalanceOf for investment accounts (spec 4.1a)', () => {
  it('rounds an investment balance to cents and sums several accounts', () => {
    expect(bankBalanceOf([account()], NOW)).toMatchObject({ total: 186331.55, currency: 'CAD', stale: false });
    expect(bankBalanceOf([account({ currentBalance: 1000.105 }), account({ currentBalance: 0 })], NOW).total).toBe(1000.11);
  });

  it('shows nothing for cards and loans (an amount owed), or when an account has no balance or another currency', () => {
    expect(bankBalanceOf([account({ accountType: 'credit' })], NOW)).toBeNull();
    expect(bankBalanceOf([account({ accountType: 'loan' })], NOW)).toBeNull();
    expect(bankBalanceOf([account(), account({ currentBalance: null })], NOW)).toBeNull();
    expect(bankBalanceOf([account(), account({ balanceCurrency: 'USD' })], NOW)).toBeNull();
    expect(bankBalanceOf([], NOW)).toBeNull();
  });

  it('is stale when the bank needs a login, Plaid has no new data, or the balance is over 12 hours old', () => {
    expect(bankBalanceOf([account({ bankStatus: 'needs_login' })], NOW)).toMatchObject({ stale: true, staleReason: 'login' });
    expect(bankBalanceOf([account({ bankStatus: 'stale' })], NOW)).toMatchObject({ stale: true, staleReason: 'plaid' });
    expect(bankBalanceOf([account({ balanceAsOf: '2026-11-19T10:00:00Z', bankUpdatedAt: null })], NOW)).toMatchObject({ stale: true, staleReason: 'old' });
  });

  it('still counts a deposit account', () => {
    expect(bankBalanceOf([account({ accountType: 'depository', currentBalance: 700.52 })], NOW).total).toBe(700.52);
  });
});
