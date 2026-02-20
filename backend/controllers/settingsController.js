const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

async function getTimezone(req, res) {
  try {
    const timezone = await settingsService.getBusinessTimezone();
    res.json({ timezone });
  } catch (error) {
    logger.error('Error getting timezone setting:', error);
    res.status(500).json({ error: 'Failed to get timezone setting' });
  }
}

async function updateTimezone(req, res) {
  const { timezone } = req.body;
  if (!timezone) {
    return res.status(400).json({ error: 'timezone is required' });
  }
  try {
    const saved = await settingsService.updateBusinessTimezone(timezone);
    res.json({ timezone: saved });
  } catch (error) {
    if (error.message && error.message.includes('Invalid IANA timezone')) {
      return res.status(400).json({ error: error.message });
    }
    logger.error('Error updating timezone setting:', error);
    res.status(500).json({ error: 'Failed to update timezone setting' });
  }
}

module.exports = { getTimezone, updateTimezone };
