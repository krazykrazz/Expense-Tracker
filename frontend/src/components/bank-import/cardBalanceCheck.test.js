import { describe, it, expect } from 'vitest';
import { describeCause } from './cardBalanceCheck';

describe('cardBalanceCheck describeCause', () => {
  it('explains a transaction that is only in a bank file', () => {
    expect(describeCause({ type: 'from_file', name: 'Food Basics', amount: 44.57, date: '2026-11-03' }))
      .toBe("From a bank file, not in the bank's balance yet (Plaid hasn't sent it): Food Basics $44.57 (2026-11-03)");
  });

  it('explains a pending charge on a bank that leaves pending out', () => {
    expect(describeCause({ type: 'settling', name: 'Sobeys', amount: 12.41, date: '2026-11-05' }))
      .toBe('Still pending at the bank, which leaves pending charges out of its balance: Sobeys $12.41 (2026-11-05)');
  });
});
