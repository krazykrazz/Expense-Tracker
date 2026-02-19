const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');

// GET /api/sync/events — SSE connection endpoint
router.get('/events', syncController.handleSSEConnection);

module.exports = router;
