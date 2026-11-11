import {
  addInboxTransaction, matchInboxTransaction, matchInboxTransactionToFixed, matchInboxTransactionToIncome,
  addInboxTransactionAsIncome, cardPaymentInboxTransaction, ignoreInboxTransaction, unignoreInboxTransaction
} from '../../../services/plaidApi';

/**
 * Inbox decisions on one bank transaction: the API call for each, and whether it can change other screens.
 * `changesData`: it created or changed an expense, fixed expense, income or card payment, so expenses and the
 * summary reload and the Inbox is fetched again (what was matched is no longer a candidate for other rows).
 * Ignore and Undo ignore only move the row between the Inbox filters.
 * Adding an Inbox action is one entry here plus its form or picker in InboxRow.
 */
export const INBOX_ACTIONS = {
  add: { run: (id, fields) => addInboxTransaction(id, fields), changesData: true },
  match: { run: (id, expenseId) => matchInboxTransaction(id, expenseId), changesData: true },
  'match-fixed': { run: (id, fixedExpenseId) => matchInboxTransactionToFixed(id, fixedExpenseId), changesData: true },
  'match-income': { run: (id, payload) => matchInboxTransactionToIncome(id, payload), changesData: true },
  'add-income': { run: (id, fields) => addInboxTransactionAsIncome(id, fields), changesData: true },
  'card-payment': { run: (id, body) => cardPaymentInboxTransaction(id, body), changesData: true },
  ignore: { run: (id) => ignoreInboxTransaction(id), changesData: false },
  unignore: { run: (id) => unignoreInboxTransaction(id), changesData: false }
};
