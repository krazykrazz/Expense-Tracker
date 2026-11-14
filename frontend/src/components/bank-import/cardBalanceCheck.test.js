import { describe, it, expect } from 'vitest';
import { bankLagNote, describeCause, inboxViewFor } from './cardBalanceCheck';

describe('cardBalanceCheck describeCause', () => {
  it('explains a transaction that is only in a bank file', () => {
    expect(describeCause({ type: 'from_file', name: 'Food Basics', amount: 44.57, date: '2026-11-03' }))
      .toBe("From a bank file, not in the bank's balance yet (Plaid hasn't sent it): Food Basics $44.57 (2026-11-03)");
  });

  it('explains a pending charge the bank counts but the tracker counts from a later posted date', () => {
    expect(describeCause({ type: 'posts_later', name: 'Rocket Scone', amount: 25, date: '2026-11-07', trackerPostedDate: '2026-11-09' }))
      .toBe("Pending at the bank, which counts pending charges; in the tracker's balance from its posted date 2026-11-09: Rocket Scone $25.00 (2026-11-07)");
  });

  it('explains a recent charge that is probably still pending at a bank that does not report pending', () => {
    expect(describeCause({ type: 'likely_pending', name: 'Canadian Tire', amount: 30.5, date: '2026-11-10' }))
      .toBe("Probably still pending at the bank, which leaves pending charges out of its balance (it doesn't tell Plaid which are pending): Canadian Tire $30.50 (2026-11-10)");
  });

  it('explains a pending charge on a bank that leaves pending out', () => {
    expect(describeCause({ type: 'settling', name: 'Sobeys', amount: 12.41, date: '2026-11-05' }))
      .toBe('Still pending at the bank, which leaves pending charges out of its balance: Sobeys $12.41 (2026-11-05)');
  });

  it('says the bank\'s balance is older than when it was received (WS VISA, Nov 11: fetched 3:51 PM, received 8:45 PM)', () => {
    const tire = { type: 'likely_pending', name: 'Canadian Tire', amount: 30.5, date: '2026-11-10' };
    const stale = { bank: { asOf: '2026-11-11T20:51:15Z', receivedAt: '2026-11-12T01:45:00Z' } };
    const fresh = { bank: { asOf: '2026-11-12T01:30:00Z', receivedAt: '2026-11-12T01:45:00Z' } };

    expect(describeCause(tire, stale)).toMatch(/\(the bank's balance is from .+; it may have settled since\)$/);
    expect(describeCause(tire, fresh)).not.toMatch(/may have settled since/);
    expect(describeCause({ type: 'bank_only', name: 'X', amount: 5, date: '2026-11-10' }, stale)).not.toMatch(/may have settled since/);
    expect(bankLagNote({ bank: { asOf: null, receivedAt: null } })).toBeNull();
  });
});

describe('cardBalanceCheck inboxViewFor', () => {
  it('opens To review when a cause is there, else Not expenses, else Ignored', () => {
    const notExpense = { type: 'bank_only', inboxStatus: 'new', inboxBucket: 'not_expense' };
    const ignored = { type: 'bank_only', inboxStatus: 'ignored', inboxBucket: 'spending' };
    expect(inboxViewFor([ignored, notExpense, { type: 'bank_only', inboxStatus: 'new', inboxBucket: 'spending' }])).toBe('spending');
    expect(inboxViewFor([ignored, { type: 'cancelled' }])).toBe('spending');
    expect(inboxViewFor([ignored, notExpense, { type: 'tracker_only' }])).toBe('not_expense');
    expect(inboxViewFor([ignored])).toBe('ignored');
    expect(inboxViewFor([{ type: 'bank_only', status: 'new', bucket: 'not_expense' }])).toBe('not_expense');
  });
});
