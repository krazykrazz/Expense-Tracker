const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');

// GET /api/activity-logs - Get recent activity log events with pagination
router.get('/', activityLogController.getRecentEvents);

// GET /api/activity-logs/stats - Get cleanup statistics
router.get('/stats', activityLogController.getCleanupStats);

// GET /api/activity-logs/settings - Get retention policy settings
router.get('/settings', activityLogController.getSettings);

// PUT /api/activity-logs/settings - Update retention policy settings
router.put('/settings', activityLogController.updateSettings);

module.exports = router;
