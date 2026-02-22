/**
 * SSE Service — client registry and broadcast
 * Manages in-memory registry of active SSE connections and broadcasts sync events.
 */

const logger = require('../config/logger');

// In-memory registry: clientId (string) → res (Express Response)
const clients = new Map();

/**
 * Register a new SSE client
 * @param {string} clientId - Unique client identifier
 * @param {object} res - Express response object
 */
function addClient(clientId, res) {
  clients.set(clientId, res);
  logger.debug('SSE: Client connected', { clientId, total: clients.size });
}

/**
 * Remove a client from the registry
 * @param {string} clientId - Unique client identifier
 */
function removeClient(clientId) {
  clients.delete(clientId);
  logger.debug('SSE: Client disconnected', { clientId, total: clients.size });
}

/**
 * Broadcast a sync event to all connected clients
 * @param {string} entityType - The entity type that changed
 * @param {string|null} tabId - Originating tab ID (may be null)
 */
async function broadcast(entityType, tabId) {
  if (clients.size === 0) {
    return;
  }

  const payload = JSON.stringify({
    entityType,
    tabId,
    timestamp: new Date().toISOString()
  });
  const frame = `data: ${payload}\n\n`;

  const deadClients = [];

  for (const [clientId, res] of clients) {
    try {
      res.write(frame);
    } catch (err) {
      logger.warn('SSE: Failed to write to client, removing', { clientId, err: err.message });
      deadClients.push(clientId);
    }
  }

  // Capture count before removing dead clients (reflects who received the broadcast)
  const connectedCount = clients.size;

  // Remove dead clients
  for (const clientId of deadClients) {
    clients.delete(clientId);
  }

  // Write activity log entry after broadcasting (only when clients were connected)
  if (connectedCount > 0) {
    try {
      const activityLogRepository = require('../repositories/activityLogRepository');
      await activityLogRepository.insert({
        event_type: 'sync_broadcast',
        entity_type: entityType,
        entity_id: null,
        user_action: `Synced ${entityType} changes to ${connectedCount} active session(s)`,
        metadata: JSON.stringify({ tabId }),
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      logger.error('SSE: Failed to write sync_broadcast activity log', { err });
    }
  }
}

/**
 * Get the number of currently active client connections.
 * Prunes any entries whose underlying socket is already destroyed,
 * so the reported count is accurate at query time.
 * @returns {number}
 */
function getConnectionCount() {
  // Prune stale entries whose socket closed without triggering cleanup
  for (const [clientId, res] of clients) {
    if (res.writableEnded || res.destroyed) {
      clients.delete(clientId);
      logger.debug('SSE: Pruned stale client during count', { clientId, total: clients.size });
    }
  }
  return clients.size;
}

module.exports = { addClient, removeClient, broadcast, getConnectionCount };
