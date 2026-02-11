const activityLogService = require('../services/activityLogService');
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

/**
 * Get recent activity log events with pagination
 * Query parameters:
 *   - limit: number of events to return (default: 50, max: 200)
 *   - offset: number of events to skip (default: 0)
 */
async function getRecentEvents(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Validate limit
    if (limit < 1 || limit > 200) {
      return res.status(400).json({ 
        error: 'Invalid limit parameter. Must be between 1 and 200.' 
      });
    }

    // Validate offset
    if (offset < 0) {
      return res.status(400).json({ 
        error: 'Invalid offset parameter. Must be non-negative.' 
      });
    }

    const events = await activityLogService.getRecentEvents(limit, offset);
    res.json(events);
  } catch (error) {
    logger.error('Error fetching recent activity log events:', error);
    res.status(500).json({ error: 'Failed to fetch activity log events' });
  }
}

/**
 * Get cleanup statistics
 * Returns information about retention policy and current event count
 */
async function getCleanupStats(req, res) {
  try {
    const stats = await activityLogService.getCleanupStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching activity log cleanup stats:', error);
    res.status(500).json({ error: 'Failed to fetch cleanup statistics' });
  }
}

/**
 * Get current retention policy settings
 * GET /api/activity-logs/settings
 */
async function getSettings(req, res) {
  try {
    const settings = await settingsService.getRetentionSettings();
    res.json(settings);
  } catch (error) {
    logger.error('Error fetching retention settings:', error);
    res.status(500).json({ error: 'Failed to fetch retention settings' });
  }
}

/**
 * Update retention policy settings
 * PUT /api/activity-logs/settings
 * Body: { maxAgeDays: number, maxCount: number }
 */
async function updateSettings(req, res) {
  try {
    const { maxAgeDays, maxCount } = req.body;

    // Validate request body
    if (maxAgeDays === undefined || maxAgeDays === null) {
      return res.status(400).json({ 
        error: 'Missing required field: maxAgeDays' 
      });
    }
    if (maxCount === undefined || maxCount === null) {
      return res.status(400).json({ 
        error: 'Missing required field: maxCount' 
      });
    }

    // Update settings (validation happens in service layer)
    const updatedSettings = await settingsService.updateRetentionSettings(
      maxAgeDays,
      maxCount
    );

    // Log the change for audit
    logger.info('Retention settings updated via API:', updatedSettings);

    res.json({
      ...updatedSettings,
      message: 'Retention settings updated successfully'
    });
  } catch (error) {
    logger.error('Error updating retention settings:', error);
    
    // Return 400 for validation errors, 500 for server errors
    if (error.message.includes('must be') || 
        error.message.includes('required') ||
        error.message.includes('integer')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update retention settings' });
  }
}

module.exports = {
  getRecentEvents,
  getCleanupStats,
  getSettings,
  updateSettings
};
