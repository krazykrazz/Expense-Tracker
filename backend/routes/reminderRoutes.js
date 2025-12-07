const express = require('express');
const router = express.Router();
const reminderController = require('../controllers/reminderController');

// GET /api/reminders/status/:year/:month - Get reminder status for a specific month
router.get('/status/:year/:month', reminderController.getReminderStatus);

module.exports = router;
