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

/** @returns {Promise<{enabled: boolean, source: string, environment?: string, trial?: {limit: number, used: number}|null}>} */
export const getPlaidStatus = (options = {}) =>
  call('fetching Plaid status', () => apiGet(API_ENDPOINTS.PLAID_STATUS, 'fetch bank import status', options));

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

/** @returns {Promise<{linkToken: string, expiration: string}>} */
export const createLinkToken = () =>
  call('creating Plaid link token', () => apiPost(API_ENDPOINTS.PLAID_LINK_TOKEN, {}, 'start bank connection'));

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

/** @returns {Promise<{results: Array, totals: {added: number, updated: number, removed: number}}>} */
export const syncBanks = () =>
  call('syncing banks', () => apiPost(API_ENDPOINTS.PLAID_SYNC, {}, 'sync banks'));

/** @returns {Promise<{transactions: Array, hiddenUnmapped: number}>} */
export const getInbox = (status = 'new', options = {}) =>
  call('fetching import inbox', () => apiGet(API_ENDPOINTS.PLAID_INBOX(status), 'fetch import inbox', options));

/** @param {{type: string, place?: string, date?: string, notes?: string}} fields */
export const addInboxTransaction = (id, fields) =>
  call('adding bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'add'), fields, 'add expense'));

export const matchInboxTransaction = (id, expenseId) =>
  call('matching bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'match'), { expenseId }, 'match expense'));

export const ignoreInboxTransaction = (id) =>
  call('ignoring bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'ignore'), {}, 'ignore transaction'));

export const unignoreInboxTransaction = (id) =>
  call('restoring bank transaction', () => apiPost(API_ENDPOINTS.PLAID_INBOX_ACTION(id, 'unignore'), {}, 'restore transaction'));
