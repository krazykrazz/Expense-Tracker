const { asyncHandler } = require('../middleware/errorHandler');
const notificationSettingsService = require('../services/notificationSettingsService');

const tabIdOf = (req) => req.headers['x-tab-id'] ?? null;

/** GET /api/settings/notifications (the API key is only ever returned as a masked hint) */
const getSettings = asyncHandler(async (req, res) => {
  res.json(await notificationSettingsService.getSettings());
});

/**
 * PUT /api/settings/notifications
 * Body: { apiKey?, channelId?, pingUserId?, enabled?, events? } (a blank apiKey keeps the saved key)
 */
const saveSettings = asyncHandler(async (req, res) => {
  res.json(await notificationSettingsService.saveSettings(req.body || {}, tabIdOf(req)));
});

/**
 * POST /api/settings/notifications/test
 * Body: { apiKey?, channelId?, pingUserId? } (blank fields use the saved values); nothing is saved
 */
const sendTest = asyncHandler(async (req, res) => {
  res.json(await notificationSettingsService.sendTest(req.body || {}));
});

module.exports = { getSettings, saveSettings, sendTest };
