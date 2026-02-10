const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');

// GET /api/activity-logs - Get recent activity log events with pagination
router.get('/', activityLogController.getRecentEvents);

// GET /api/activity-logs/stats - Get cleanup statistics
router.get('/stats', activityLogController.getCleanupStats);

module.exports = router;
