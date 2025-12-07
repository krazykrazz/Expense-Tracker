const reminderService = require('../services/reminderService');
const logger = require('../config/logger');

/**
 * Get reminder status for a specific month
 * GET /api/reminders/status/:year/:month
 */
async function getReminderStatus(req, res) {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }

    const reminderStatus = await reminderService.getReminderStatus(year, month);
    res.status(200).json(reminderStatus);
  } catch (error) {
    logger.error('Error in getReminderStatus controller:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getReminderStatus
};
