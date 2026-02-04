const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

// GET /api/reminders/status/:year/:month - Get reminder status for a specific month
router.get('/status/:year/:month', reminderController.getReminderStatus);

// GET /api/reminders/auto-log-suggestions/:year/:month - Get pending auto-log suggestions
// _Requirements: 4.1_
router.get('/auto-log-suggestions/:year/:month', reminderController.getAutoLogSuggestions);

module.exports = router;
