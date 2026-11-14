/**
 * Plaid API Service
 * Bank connections (Plaid Link), account mapping, sync, and the Import Inbox.
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

const call = async (context, fn) => {
  try {
    return await fn();
  } catch (error) {
    if (error.name !== 'AbortError') logApiError(context, error);
    throw error;
  }
};

const abortError = () => (typeof DOMException === 'function'
  ? new DOMException('The operation was aborted.', 'AbortError')
  : Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));

/** The status request shared by every caller in the current task (see getPlaidStatus). */
let statusInTask = null;

/**
 * Plaid status. Callers in the same task share one request: the header button, the attention banner, bank badges
 * and card balance checks all reload on the same `plaid` sync event. A request started in an earlier task is never
 * reused, since it may predate the change the caller is reacting to. Aborting a caller's signal only rejects that
 * caller.
 * @returns {Promise<{enabled: boolean, source: string, environment?: string, trial?: {limit: number, used: number}|null,
 *   toReview?: number, needsAttention?: Array, staleData?: Array}>}
 */
export const getPlaidStatus = ({ signal } = {}) => {
  if (signal?.aborted) return Promise.reject(abortError());
  if (!statusInTask) {
    const request = call('fetching Plaid status', () => apiGet(API_ENDPOINTS.PLAID_STATUS, 'fetch bank import status'));
    statusInTask = request;
    setTimeout(() => { if (statusInTask === request) statusInTask = null; }, 0);
  }
  const shared = statusInTask;
  if (!signal) return shared;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
};

/** Window event fired after Plaid settings change, so the header entry point can re-check status. */
export const PLAID_SETTINGS_CHANGED_EVENT = 'plaid-settings-changed';
const announceSettingsChange = (result) => {
  window.dispatchEvent(new CustomEvent(PLAID_SETTINGS_CHANGED_EVENT));
  return result;
};

/** Saved Plaid keys as masked hints, plus where they come from (`env` locks editing). */
export const getPlaidSettings = (options = {}) =>
  call('fetching Plaid settings', () => apiGet(API_ENDPOINTS.PLAID_SETTINGS, 'fetch bank import settings', options));

/** @param {{clientId?: string, secret?: string, environment?: string}} fields blank fields keep saved values */
export const savePlaidSettings = (fields) =>
  call('saving Plaid settings', () => apiPut(API_ENDPOINTS.PLAID_SETTINGS, fields, 'save bank import settings')).then(announceSettingsChange);

/** Checks keys with Plaid without saving: `{ ok, environment, message }`. */
export const testPlaidSettings = (fields) =>
  call('testing Plaid settings', () => apiPost(API_ENDPOINTS.PLAID_SETTINGS_TEST, fields, 'test bank import settings'));

export const clearPlaidSettings = () =>
  call('removing Plaid settings', () => apiDelete(API_ENDPOINTS.PLAID_SETTINGS, 'remove bank import settings')).then(announceSettingsChange);

/**
 * @param {number} [itemId] repair this connection (Plaid update mode: log in again, no new Trial slot)
 * @returns {Promise<{linkToken: string, expiration: string}>}
 */
export const createLinkToken = (itemId) =>
  call('creating Plaid link token', () => apiPost(API_ENDPOINTS.PLAID_LINK_TOKEN, itemId ? { itemId } : {}, 'start bank connection'));

/** After logging in again through update mode: clears the error and syncs. */
export const reconnectBank = (id) =>
  call('reconnecting bank', () => apiPost(API_ENDPOINTS.PLAID_ITEM_RECONNECTED(id), {}, 'reconnect bank'));

/**
 * Ask Plaid to fetch from the bank now.
 * @returns {Promise<{status: 'refreshing'|'needs_login', item: object}>} needs_login: open Link update mode
 */
export const refreshBank = (id) =>
  call('refreshing bank', () => apiPost(API_ENDPOINTS.PLAID_ITEM_REFRESH(id), {}, 'refresh bank'));

/** Window event asking the header Bank Import button to open its modal, e.g. `{ detail: { tab: 'connections' } }`. */
export const OPEN_BANK_IMPORT_EVENT = 'open-bank-import';
/** @param {{inboxView?: 'spending'|'not_expense'|'ignored'}} [options] the Inbox filter to open on */
export const openBankImport = (tab = 'inbox', { inboxView } = {}) =>
  window.dispatchEvent(new CustomEvent(OPEN_BANK_IMPORT_EVENT, { detail: { tab, inboxView } }));

/**
 * Bank vs tracker balance for each credit card linked to a bank account, with likely causes of a difference.
 * @returns {Promise<{cards: Array<object>}>}
 */
export const getCardBalanceChecks = (options = {}) =>
  call('fetching card balance checks', () => apiGet(API_ENDPOINTS.PLAID_CARD_BALANCES, 'check card balances with the bank', options));

/**
 * Bank vs tracker for a card's last closed statement cycles that the bank's history fully covers.
 * @returns {Promise<{paymentMethodId: number, billingCycleDay: (number|null), cycles: Array<object>}>}
 */
export const getCardCycleChecks = (paymentMethodId, options = {}) =>
  call('fetching card cycle checks', () => apiGet(API_ENDPOINTS.PLAID_CARD_CYCLES(paymentMethodId), 'check statement cycles with the bank', options));

/** Set a credit card's limit to the one its bank reports. */
export const applyBankCreditLimit = (paymentMethodId) =>
  call('using bank credit limit', () => apiPost(API_ENDPOINTS.PLAID_CARD_USE_BANK_LIMIT(paymentMethodId), {}, 'use the bank credit limit'));

/** Exchange the Plaid Link public token; returns the stored item with its accounts. */
export const connectBank = (publicToken, institutionName) =>
  call('connecting bank', () => apiPost(API_ENDPOINTS.PLAID_ITEMS, { publicToken, institutionName }, 'connect bank'));

/** @returns {Promise<{items: Array}>} */
export const getBankConnections = (options = {}) =>
  call('fetching bank connections', () => apiGet(API_ENDPOINTS.PLAID_ITEMS, 'fetch bank connections', options));

export const disconnectBank = (id) =>
  call('disconnecting bank', () => apiDelete(API_ENDPOINTS.PLAID_ITEM_BY_ID(id), 'disconnect bank'));

/** @param {number|null} paymentMethodId null = don't import this account */
export const mapBankAccount = (accountId, paymentMethodId) =>
  call('mapping bank account', () => apiPut(API_ENDPOINTS.PLAID_ACCOUNT_BY_ID(accountId), { paymentMethodId }, 'update bank account'));

/**
 * Import (or with `dryRun`, preview) a CSV exported from the bank's website into a connected bank account.
 * @param {number} accountId
 * @param {{csv: string, fromDate?: string, dryRun?: boolean}} options
 * @returns {Promise<{formatLabel: string, fromDate: string, defaultFromDate: string, total: number, beforeFrom: number,
 *   alreadyFromBank: number, unchanged: number, updated: number, added: number, pendingAdded: number, settled: number}>}
 */
export const importBankFile = (accountId, { csv, fromDate, dryRun = false }) =>
  call('importing bank file', () => apiPost(
    API_ENDPOINTS.PLAID_ACCOUNT_IMPORT_FILE(accountId),
    { csv, fromDate: fromDate || undefined, dryRun },
    dryRun ? 'preview bank file' : 'import bank file'
  ));

/** @returns {Promise<{results: Array, totals: {added: number, updated: number, removed: number}}>} */
export const syncBanks = () =>
  call('syncing banks', () => apiPost(API_ENDPOINTS.PLAID_SYNC, {}, 'sync banks'));

/**
 * Automatic sync when the app is opened: the server syncs, in the background, banks not synced in the last
 * `minutes`, and answers at once. Results arrive as a cross-tab `plaid` sync event.
 * @returns {Promise<{started: boolean, banks: number}>}
 */
export const syncBanksIfStale = (minutes = 30) =>
  call('starting automatic bank sync', () => apiPost(API_ENDPOINTS.PLAID_SYNC_IF_STALE(minutes), {}, 'sync banks'));

/** @returns {Promise<{enabled: boolean, intervalMinutes: number, startHour: number, endHour: number}>} */
export const getAutoSyncSettings = (options = {}) =>
  call('fetching auto sync settings', () => apiGet(API_ENDPOINTS.PLAID_SYNC_SETTINGS, 'fetch auto sync settings', options));

/** @param {{enabled?: boolean, intervalMinutes?: number, startHour?: number, endHour?: number}} fields */
export const saveAutoSyncSettings = (fields) =>
  call('saving auto sync settings', () => apiPut(API_ENDPOINTS.PLAID_SYNC_SETTINGS, fields, 'save auto sync settings'));

/**
 * @param {'new'|'ignored'} status
 * @param {'spending'|'not_expense'} bucket the tab of new rows: To review or Not expenses (ignored rows: any)
 * @returns {Promise<{transactions: Array, hiddenUnmapped: number, counts: {toReview: number, notExpenses: number},
 *   cancelled: Array, unconnectedCards: Array}>}
 */
export const getInbox = (status = 'new', bucket = 'spending', options = {}) =>
  call('fetching import inbox', () => apiGet(API_ENDPOINTS.PLAID_INBOX(status, bucket), 'fetch import inbox', options));

/** @param {{type: string, place?: string, date?: string, notes?: string}} fields */
export const addInboxTransaction = (id, fields) =>
  call('adding bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'add'), fields, 'add expense'));

export const matchInboxTransaction = (id, expenseId) =>
  call('matching bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'match'), { expenseId }, 'match expense'));

/** Confirm a fixed expense with this transaction (updates its amount to the bank amount when they differ). */
export const matchInboxTransactionToFixed = (id, fixedExpenseId) =>
  call('matching bank transaction to fixed expense', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'match-fixed'), { fixedExpenseId }, 'match fixed expense'));

/** Confirm expected income with this deposit; `updateAmount` sets the income amount to the deposit amount. */
export const matchInboxTransactionToIncome = (id, { incomeSourceId, updateAmount = true }) =>
  call('matching bank deposit to income', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'match-income'), { incomeSourceId, updateAmount }, 'match income'));

/** @param {{name?: string, category?: string}} fields */
export const addInboxTransactionAsIncome = (id, fields) =>
  call('adding bank deposit as income', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'add-income'), fields, 'add income'));

/**
 * Card payments in the Inbox. The row's side decides what the body means:
 * - `{ creditCardPaymentId }`: link the row to a payment that is already recorded;
 * - `{ alsoLinkId? }` on a credit on a card: record the payment (and link the debit that paid it);
 * - `{ paymentMethodId }` on a debit: record the payment to a card that has no bank connection.
 * @returns {Promise<{created: boolean, payment: object, linkedTransactionIds: number[]}>}
 */
export const cardPaymentInboxTransaction = (id, body = {}) =>
  call('recording card payment', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'card-payment'), body, 'record card payment'));

/**
 * Insurance claims a deposit could reimburse, ranked, with the suggested split (null when none fits exactly).
 * @param {{includePaid?: boolean, signal?: AbortSignal}} [options] includePaid: also Paid claims (a second plan)
 * @returns {Promise<{deposit: object, candidates: Array, suggestion: (Array<{expenseId: number, amount: number}>|null),
 *   paidAvailable: number}>}
 */
export const getInsuranceCandidates = (id, { includePaid = false, signal } = {}) =>
  call('fetching insurance claims', () => apiGet(API_ENDPOINTS.PLAID_INBOX_INSURANCE_CANDIDATES(id, includePaid), 'fetch insurance claims', { signal }));

/** Apply a deposit to insurance claims; the amounts must add up to the deposit. @param {Array<{expenseId: number, amount: number}>} claims */
export const applyInsuranceToInboxTransaction = (id, claims) =>
  call('applying deposit to insurance claims', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'insurance'), { claims }, 'apply to insurance claims'));

/** Undo: the claims go back to what they were and the deposit returns to the Inbox. */
export const undoInsuranceReimbursement = (id) =>
  call('undoing insurance reimbursement', () => apiDelete(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'insurance'), 'undo insurance reimbursement'));

/**
 * Review a pending charge (added as an expense) that the bank dropped.
 * @param {{action: 'keep'|'delete_expense'|'link', postedId?: number}} decision
 */
export const resolveCancelledPending = (id, decision) =>
  call('reviewing cancelled pending charge', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'cancelled'), decision, 'review cancelled charge'));

export const ignoreInboxTransaction = (id) =>
  call('ignoring bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'ignore'), {}, 'ignore transaction'));

/** Move a row between the Inbox's To review ('spending') and Not expenses ('not_expense') tabs. */
export const setInboxTransactionBucket = (id, bucket) =>
  call('moving bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'bucket'), { bucket }, 'move transaction'));

export const unignoreInboxTransaction = (id) =>
  call('restoring bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'unignore'), {}, 'restore transaction'));
