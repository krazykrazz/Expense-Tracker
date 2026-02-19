/**
 * Sync Controller — SSE connection handler
 * Manages the SSE handshake, keepalive, and client lifecycle.
 */

const crypto = require('crypto');
const sseService = require('../services/sseService');

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
  sseService.addClient(clientId, res);

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Keepalive every 25s — prevents Cloudflare / proxy timeout (100s limit)
  const keepalive = setInterval(() => res.write(': keepalive\n\n'), 25000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseService.removeClient(clientId);
  });
}

module.exports = { handleSSEConnection };
