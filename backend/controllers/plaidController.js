const { asyncHandler } = require('../middleware/errorHandler');
const plaidService = require('../services/plaidService');
const plaidInboxService = require('../services/plaidInboxService');
const plaidCardPaymentService = require('../services/plaidCardPaymentService');
const plaidCardBalanceService = require('../services/plaidCardBalanceService');
const plaidCycleCheckService = require('../services/plaidCycleCheckService');
const plaidFileImportService = require('../services/plaidFileImportService');
const plaidSettingsService = require('../services/plaidSettingsService');
const plaidSyncSchedulerService = require('../services/plaidSyncSchedulerService');
const { runWithTabId } = require('../utils/requestContext');

const tabIdOf = (req) => req.headers['x-tab-id'] ?? null;
const idParam = (req) => parseInt(req.params.id, 10);

/** GET /api/plaid/status */
const getStatus = asyncHandler(async (req, res) => {
  res.json(await plaidService.getStatus());
});

/** GET /api/plaid/settings (secrets are only ever returned as masked hints) */
const getSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSettingsService.getSettings());
});

/**
 * PUT /api/plaid/settings
 * Body: { clientId?, secret?, environment? } (blank fields keep the saved value)
 */
const saveSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSettingsService.saveSettings(req.body || {}, tabIdOf(req)));
});

/**
 * POST /api/plaid/settings/test
 * Body: same as PUT; nothing is saved
 */
const testSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSettingsService.testSettings(req.body || {}));
});

/** DELETE /api/plaid/settings */
const clearSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSettingsService.clearSettings(tabIdOf(req)));
});

/**
 * POST /api/plaid/link-token
 * Body: { itemId? } — with itemId, a token to repair that connection (Plaid update mode)
 */
const createLinkToken = asyncHandler(async (req, res) => {
  const { itemId } = req.body || {};
  res.json(await plaidService.createLinkToken({ itemId: itemId === undefined || itemId === null ? undefined : itemId }));
});

/** POST /api/plaid/items/:id/reconnected — the user logged in again through update mode */
const reconnectedItem = asyncHandler(async (req, res) => {
  res.json(await plaidService.markReconnected(idParam(req)));
});

/**
 * POST /api/plaid/items/:id/refresh
 * Ask Plaid to fetch from the bank now. `{ status: 'needs_login' }` when the bank needs a login first.
 */
const refreshItem = asyncHandler(async (req, res) => {
  res.json(await plaidService.requestRefresh(idParam(req)));
});

/**
 * GET /api/plaid/card-balances
 * Bank vs tracker balance for every credit card mapped to a bank account, with likely causes of a difference.
 */
const getCardBalances = asyncHandler(async (req, res) => {
  res.json(await plaidCardBalanceService.getCardBalances());
});

/**
 * GET /api/plaid/card-cycles/:id
 * Bank vs tracker for the card's last closed statement cycles the bank history covers, with what explains each difference.
 */
const getCardCycleChecks = asyncHandler(async (req, res) => {
  res.json(await plaidCycleCheckService.getCycleChecks(idParam(req)));
});

/**
 * POST /api/plaid/card-balances/:id/use-bank-limit
 * Set the credit card's limit (payment method :id) to the one the bank reports.
 */
const useBankCreditLimit = asyncHandler(async (req, res) => {
  res.json(await plaidCardBalanceService.applyBankCreditLimit(idParam(req)));
});

/**
 * POST /api/plaid/accounts/:id/import-file
 * Body: { csv, fromDate?, dryRun? } — a CSV exported from the bank's website (fallback when Plaid can't fetch).
 */
const importBankFile = asyncHandler(async (req, res) => {
  const { csv, fromDate, dryRun } = req.body || {};
  res.json(await plaidFileImportService.importFile(idParam(req), { csv, fromDate, dryRun: dryRun === true }));
});

/**
 * POST /api/plaid/items
 * Body: { publicToken, institutionName? }
 */
const connectItem = asyncHandler(async (req, res) => {
  res.status(201).json(await plaidService.connectItem(req.body || {}));
});

/** GET /api/plaid/items */
const listItems = asyncHandler(async (req, res) => {
  res.json({ items: await plaidService.listItems() });
});

/** DELETE /api/plaid/items/:id */
const disconnectItem = asyncHandler(async (req, res) => {
  await plaidService.disconnectItem(idParam(req));
  res.status(204).send();
});

/**
 * PUT /api/plaid/accounts/:id
 * Body: { paymentMethodId: number|null }
 */
const updateAccount = asyncHandler(async (req, res) => {
  res.json(await plaidService.updateAccountMapping(idParam(req), (req.body || {}).paymentMethodId ?? null));
});

/**
 * POST /api/plaid/sync — Sync now.
 * POST /api/plaid/sync?ifStaleMinutes=N — automatic sync when the app is opened: syncs, in the background,
 * only banks not synced in the last N minutes (5-1440) and answers at once with `{ started, banks }`.
 */
const sync = asyncHandler(async (req, res) => {
  if (req.query.ifStaleMinutes === undefined) {
    return res.json(await plaidService.syncAll());
  }
  const minutes = parseInt(req.query.ifStaleMinutes, 10);
  if (Number.isNaN(minutes) || minutes < 5 || minutes > 1440) {
    return res.status(400).json({ error: 'ifStaleMinutes must be between 5 and 1440' });
  }
  const stale = await plaidService.findStaleItems(minutes);
  if (stale.length > 0) {
    // Outside the request's tab context: the opening tab must also receive the resulting sync event
    runWithTabId(null, () => plaidService.syncItems(stale, 'on_open'));
  }
  res.json({ started: stale.length > 0, banks: stale.length });
});

/** GET /api/plaid/sync-settings */
const getSyncSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSyncSchedulerService.getSettings());
});

/**
 * PUT /api/plaid/sync-settings
 * Body: { enabled?, intervalMinutes? (30|60|120), startHour? (0-23), endHour? (1-24) }
 */
const saveSyncSettings = asyncHandler(async (req, res) => {
  res.json(await plaidSyncSchedulerService.saveSettings(req.body || {}, tabIdOf(req)));
});

/** GET /api/plaid/inbox?status=new|ignored */
const getInbox = asyncHandler(async (req, res) => {
  res.json(await plaidInboxService.listInbox(req.query.status || 'new'));
});

/**
 * POST /api/plaid/inbox/:id/add
 * Body: { type, place?, date?, notes? }
 */
const addAsExpense = asyncHandler(async (req, res) => {
  res.status(201).json(await plaidInboxService.addAsExpense(idParam(req), req.body || {}, tabIdOf(req)));
});

/**
 * POST /api/plaid/inbox/:id/match
 * Body: { expenseId }
 */
const matchToExpense = asyncHandler(async (req, res) => {
  res.json(await plaidInboxService.matchToExpense(idParam(req), (req.body || {}).expenseId));
});

/**
 * POST /api/plaid/inbox/:id/match-fixed
 * Body: { fixedExpenseId }
 */
const matchToFixedExpense = asyncHandler(async (req, res) => {
  res.json(await plaidInboxService.matchToFixedExpense(idParam(req), (req.body || {}).fixedExpenseId, tabIdOf(req)));
});

/**
 * POST /api/plaid/inbox/:id/match-income
 * Body: { incomeSourceId, updateAmount? = true }
 */
const matchToIncome = asyncHandler(async (req, res) => {
  const { incomeSourceId, updateAmount } = req.body || {};
  res.json(await plaidInboxService.matchToIncome(idParam(req), incomeSourceId, { updateAmount: updateAmount !== false }, tabIdOf(req)));
});

/**
 * POST /api/plaid/inbox/:id/add-income
 * Body: { name?, category? }
 */
const addAsIncome = asyncHandler(async (req, res) => {
  res.status(201).json(await plaidInboxService.addAsIncome(idParam(req), req.body || {}, tabIdOf(req)));
});

/**
 * POST /api/plaid/inbox/:id/card-payment
 * Body (the row's side decides): { creditCardPaymentId } links to a recorded payment; { alsoLinkId? } on a card
 * credit records the payment (and links the paying debit); { paymentMethodId } on a debit records it to a card
 * with no bank connection. 201 when a payment was recorded, 200 when linked.
 */
const cardPayment = asyncHandler(async (req, res) => {
  const result = await plaidCardPaymentService.act(idParam(req), req.body || {});
  res.status(result.created ? 201 : 200).json(result);
});

/**
 * POST /api/plaid/inbox/:id/cancelled
 * Body: { action: 'keep'|'delete_expense'|'link', postedId? } — review a pending charge the bank dropped
 */
const resolveCancelled = asyncHandler(async (req, res) => {
  const { action, postedId } = req.body || {};
  res.json(await plaidInboxService.resolveCancelled(idParam(req), { action, postedId }, tabIdOf(req)));
});

/** POST /api/plaid/inbox/:id/ignore */
const ignore = asyncHandler(async (req, res) => {
  res.json(await plaidInboxService.ignore(idParam(req)));
});

/** POST /api/plaid/inbox/:id/unignore */
const unignore = asyncHandler(async (req, res) => {
  res.json(await plaidInboxService.unignore(idParam(req)));
});

module.exports = {
  getCardBalances,
  getCardCycleChecks,
  useBankCreditLimit,
  importBankFile,
  getStatus,
  getSettings,
  saveSettings,
  testSettings,
  clearSettings,
  createLinkToken,
  reconnectedItem,
  refreshItem,
  connectItem,
  listItems,
  disconnectItem,
  updateAccount,
  sync,
  getSyncSettings,
  saveSyncSettings,
  getInbox,
  addAsExpense,
  matchToExpense,
  matchToFixedExpense,
  matchToIncome,
  addAsIncome,
  cardPayment,
  resolveCancelled,
  ignore,
  unignore
};
