const reminderService = require('../services/reminderService');
const autoPaymentLoggerService = require('../services/autoPaymentLoggerService');
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

/**
 * Get pending auto-log suggestions for a specific month
 * GET /api/reminders/auto-log-suggestions/:year/:month
 * 
 * Returns linked fixed expenses that are eligible for auto-logging:
 * - Have a linked_loan_id
 * - Have a payment_due_day
 * - Due day has passed (or is today)
 * - No loan payment exists for the current month
 * 
 * _Requirements: 4.1_
 */
async function getAutoLogSuggestions(req, res) {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }

    const suggestions = await autoPaymentLoggerService.getPendingAutoLogSuggestions(year, month);
    res.status(200).json(suggestions);
  } catch (error) {
    logger.error('Error in getAutoLogSuggestions controller:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getReminderStatus,
  getAutoLogSuggestions
};
