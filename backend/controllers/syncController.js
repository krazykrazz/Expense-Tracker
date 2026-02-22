/**
 * Sync Controller — SSE connection handler
 * Manages the SSE handshake, keepalive, and client lifecycle.
 */

const crypto = require('crypto');
const sseService = require('../services/sseService');
const logger = require('../config/logger');

/**
 * Handle a new SSE connection
 * GET /api/sync/events
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function handleSSEConnection(req, res) {
  // Set SSE + proxy-compatibility headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = crypto.randomUUID();
  let cleaned = false;

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    clearInterval(keepalive);
    sseService.removeClient(clientId);
  }

  sseService.addClient(clientId, res);

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Keepalive every 15s — detects dead connections faster after page refreshes
  // Also checks socket state proactively since res.write() may silently buffer
  const keepalive = setInterval(() => {
    if (req.destroyed || res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    try {
      const ok = res.write(': keepalive\n\n');
      // If write returns false, the buffer is full — likely a dead connection
      if (ok === false) {
        logger.warn('SSE: Keepalive write backpressure, removing likely stale client', { clientId });
        cleanup();
      }
    } catch (err) {
      logger.warn('SSE: Keepalive write failed, removing stale client', { clientId, err: err.message });
      cleanup();
    }
  }, 15000);

  // Safety net: catch connection errors that don't trigger req 'close'
  res.on('error', () => cleanup());

  req.on('close', () => cleanup());
}

module.exports = { handleSSEConnection };
