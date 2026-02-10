const activityLogRepository = require('../repositories/activityLogRepository');
const logger = require('../config/logger');

// Retention policy configuration
const RETENTION_POLICY = {
  maxDays: 90,
  maxEntries: 1000
};

// Track last cleanup run
let lastCleanupRun = null;
let lastCleanupDeletedCount = 0;

/**
 * Log an activity event (fire-and-forget pattern)
 * @param {string} eventType - Machine-readable event type
 * @param {string} entityType - Type of entity (expense, loan, etc.)
 * @param {number|null} entityId - ID of the entity (null for system events)
 * @param {string} userAction - Human-readable description
 * @param {object} metadata - Additional context data
 * @returns {Promise<void>} - Resolves immediately, errors are logged
 */
async function logEvent(eventType, entityType, entityId, userAction, metadata) {
  try {
    // Validate required fields
    if (!eventType || !entityType || !userAction) {
      logger.warn('Activity log: Missing required fields', { eventType, entityType, userAction });
      return;
    }

    // Validate that required fields are non-empty strings
    if (typeof eventType !== 'string' || eventType.trim() === '') {
      logger.warn('Activity log: event_type must be a non-empty string', { eventType });
      return;
    }

    if (typeof entityType !== 'string' || entityType.trim() === '') {
      logger.warn('Activity log: entity_type must be a non-empty string', { entityType });
      return;
    }

    if (typeof userAction !== 'string' || userAction.trim() === '') {
      logger.warn('Activity log: user_action must be a non-empty string', { userAction });
      return;
    }

    // Prepare event data
    const event = {
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      user_action: userAction,
      metadata: metadata ? JSON.stringify(metadata) : null,
      timestamp: new Date().toISOString()
    };

    // Insert event
    await activityLogRepository.insert(event);
  } catch (error) {
    logger.error('Activity log: Failed to log event', { error, eventType, entityType });
    // Do not throw - fail silently
  }
}

/**
 * Retrieve recent activity events
 * @param {number} limit - Maximum number of events (default: 50)
 * @param {number} offset - Number of events to skip (default: 0)
 * @returns {Promise<{events: Array, total: number, limit: number, offset: number}>}
 */
async function getRecentEvents(limit = 50, offset = 0) {
  try {
    // Fetch events and total count
    const [events, total] = await Promise.all([
      activityLogRepository.findRecent(limit, offset),
      activityLogRepository.count()
    ]);

    // Parse metadata for each event
    const eventsWithParsedMetadata = events.map(event => ({
      ...event,
      metadata: event.metadata ? JSON.parse(event.metadata) : null
    }));

    return {
      events: eventsWithParsedMetadata,
      total,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Activity log: Failed to retrieve events', { error, limit, offset });
    throw error;
  }
}

/**
 * Clean up old events based on retention policy
 * @returns {Promise<{deletedCount: number, oldestRemaining: string|null}>}
 */
async function cleanupOldEvents() {
  try {
    let totalDeleted = 0;

    // Age-based cleanup: delete events older than maxDays
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_POLICY.maxDays);
    const deletedByAge = await activityLogRepository.deleteOlderThan(cutoffDate);
    totalDeleted += deletedByAge;

    logger.info('Activity log cleanup: Deleted events by age', { 
      deletedCount: deletedByAge, 
      cutoffDate: cutoffDate.toISOString() 
    });

    // Count-based cleanup: delete excess events beyond maxEntries
    const currentCount = await activityLogRepository.count();
    if (currentCount > RETENTION_POLICY.maxEntries) {
      const deletedByCount = await activityLogRepository.deleteExcessEvents(RETENTION_POLICY.maxEntries);
      totalDeleted += deletedByCount;

      logger.info('Activity log cleanup: Deleted excess events', { 
        deletedCount: deletedByCount, 
        maxEntries: RETENTION_POLICY.maxEntries 
      });
    }

    // Get oldest remaining event timestamp
    const oldestRemaining = await activityLogRepository.getOldestEventTimestamp();

    // Update cleanup tracking
    lastCleanupRun = new Date().toISOString();
    lastCleanupDeletedCount = totalDeleted;

    logger.info('Activity log cleanup: Completed', { 
      deletedCount: totalDeleted, 
      oldestRemaining 
    });

    return {
      deletedCount: totalDeleted,
      oldestRemaining
    };
  } catch (error) {
    logger.error('Activity log cleanup: Failed', { error });
    throw error;
  }
}

/**
 * Get cleanup statistics
 * @returns {Promise<object>} - Stats object
 */
async function getCleanupStats() {
  try {
    const [currentCount, oldestEventTimestamp] = await Promise.all([
      activityLogRepository.count(),
      activityLogRepository.getOldestEventTimestamp()
    ]);

    return {
      retentionDays: RETENTION_POLICY.maxDays,
      maxEntries: RETENTION_POLICY.maxEntries,
      currentCount,
      oldestEventTimestamp,
      lastCleanupRun,
      lastCleanupDeletedCount
    };
  } catch (error) {
    logger.error('Activity log: Failed to get cleanup stats', { error });
    throw error;
  }
}

module.exports = {
  logEvent,
  getRecentEvents,
  cleanupOldEvents,
  getCleanupStats,
  RETENTION_POLICY
};
