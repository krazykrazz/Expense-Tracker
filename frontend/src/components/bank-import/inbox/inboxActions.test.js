import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as plaidApi from '../../../services/plaidApi';
import { INBOX_ACTIONS } from './inboxActions';

vi.mock('../../../services/plaidApi', () => ({
  addInboxTransaction: vi.fn(),
  matchInboxTransaction: vi.fn(),
  matchInboxTransactionToFixed: vi.fn(),
  matchInboxTransactionToIncome: vi.fn(),
  addInboxTransactionAsIncome: vi.fn(),
  cardPaymentInboxTransaction: vi.fn(),
  applyInsuranceToInboxTransaction: vi.fn(),
  ignoreInboxTransaction: vi.fn(),
  unignoreInboxTransaction: vi.fn()
}));

describe('INBOX_ACTIONS', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['add', 'addInboxTransaction', { type: 'Groceries' }],
    ['match', 'matchInboxTransaction', 42],
    ['match-fixed', 'matchInboxTransactionToFixed', 9],
    ['match-income', 'matchInboxTransactionToIncome', { incomeSourceId: 3, updateAmount: true }],
    ['add-income', 'addInboxTransactionAsIncome', { name: 'Gift', category: 'Gifts' }],
    ['card-payment', 'cardPaymentInboxTransaction', { alsoLinkId: 11 }],
    ['insurance', 'applyInsuranceToInboxTransaction', [{ expenseId: 5, amount: 105.3 }]]
  ])('%s calls %s with the row and payload, and changes other screens', async (action, api, payload) => {
    await INBOX_ACTIONS[action].run(7, payload);

    expect(plaidApi[api]).toHaveBeenCalledWith(7, payload);
    expect(INBOX_ACTIONS[action].changesData).toBe(true);
  });

  it.each([['ignore', 'ignoreInboxTransaction'], ['unignore', 'unignoreInboxTransaction']])('%s only moves the row', async (action, api) => {
    await INBOX_ACTIONS[action].run(7);

    expect(plaidApi[api]).toHaveBeenCalledWith(7);
    expect(INBOX_ACTIONS[action].changesData).toBe(false);
  });

  it('has exactly the actions the Inbox row offers', () => {
    expect(Object.keys(INBOX_ACTIONS).sort()).toEqual(
      ['add', 'add-income', 'card-payment', 'ignore', 'insurance', 'match', 'match-fixed', 'match-income', 'unignore']
    );
  });
});
