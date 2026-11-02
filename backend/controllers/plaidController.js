const { asyncHandler } = require('../middleware/errorHandler');
const plaidService = require('../services/plaidService');
const plaidInboxService = require('../services/plaidInboxService');
const plaidSettingsService = require('../services/plaidSettingsService');

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

/** POST /api/plaid/sync */
const sync = asyncHandler(async (req, res) => {
  res.json(await plaidService.syncAll());
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
  getInbox,
  addAsExpense,
  matchToExpense,
  matchToFixedExpense,
  ignore,
  unignore
};
