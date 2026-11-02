const { asyncHandler } = require('../middleware/errorHandler');
const plaidService = require('../services/plaidService');
const plaidInboxService = require('../services/plaidInboxService');
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

/** POST /api/plaid/link-token */
const createLinkToken = asyncHandler(async (req, res) => {
  res.json(await plaidService.createLinkToken());
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
  getStatus,
  getSettings,
  saveSettings,
  testSettings,
  clearSettings,
  createLinkToken,
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
  resolveCancelled,
  ignore,
  unignore
};
