import {
  addInboxTransaction, matchInboxTransaction, matchInboxTransactionToFixed, matchInboxTransactionToIncome,
  addInboxTransactionAsIncome, cardPaymentInboxTransaction, ignoreInboxTransaction, unignoreInboxTransaction,
  applyInsuranceToInboxTransaction, applyReimbursementToInboxTransaction, setInboxTransactionBucket
} from '../../../services/plaidApi';

/**
 * Inbox decisions on one bank transaction: the API call for each, and whether it can change other screens.
 * `changesData`: it created or changed an expense, fixed expense, income or card payment, so expenses and the
 * summary reload and the Inbox is fetched again (what was matched is no longer a candidate for other rows).
 * Ignore, Undo ignore and moving between To review and Not expenses (`bucket`) only move the row between the
 * Inbox filters.
 * Adding an Inbox action is one entry here plus its form or picker in InboxRow.
 */
export const INBOX_ACTIONS = {
  add: { run: (id, fields) => addInboxTransaction(id, fields), changesData: true },
  // The payload is an expense id, or { expenseId, updateAmount: true } to also use the bank's amount
  match: {
    run: (id, payload) => (typeof payload === 'object'
      ? matchInboxTransaction(id, payload.expenseId, { updateAmount: payload.updateAmount })
      : matchInboxTransaction(id, payload)),
    changesData: true
  },
  'match-fixed': { run: (id, fixedExpenseId) => matchInboxTransactionToFixed(id, fixedExpenseId), changesData: true },
  'match-income': { run: (id, payload) => matchInboxTransactionToIncome(id, payload), changesData: true },
  'add-income': { run: (id, fields) => addInboxTransactionAsIncome(id, fields), changesData: true },
  'card-payment': { run: (id, body) => cardPaymentInboxTransaction(id, body), changesData: true },
  insurance: { run: (id, claims) => applyInsuranceToInboxTransaction(id, claims), changesData: true },
  reimbursement: { run: (id, expenses) => applyReimbursementToInboxTransaction(id, expenses), changesData: true },
  ignore: { run: (id) => ignoreInboxTransaction(id), changesData: false },
  unignore: { run: (id) => unignoreInboxTransaction(id), changesData: false },
  bucket: { run: (id, bucket) => setInboxTransactionBucket(id, bucket), changesData: false }
};
