const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Mounted at /api/settings/notifications
router.get('/', notificationController.getSettings);
router.put('/', notificationController.saveSettings);
router.post('/test', notificationController.sendTest);

module.exports = router;
