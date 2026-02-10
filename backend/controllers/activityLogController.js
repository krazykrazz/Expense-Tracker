const activityLogService = require('../services/activityLogService');
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

module.exports = {
  getRecentEvents,
  getCleanupStats
};
