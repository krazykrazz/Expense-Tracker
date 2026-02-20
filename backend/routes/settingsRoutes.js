const express = require('express');
const router = express.Router();
const { getTimezone, updateTimezone } = require('../controllers/settingsController');

router.get('/', getTimezone);
router.put('/', updateTimezone);

module.exports = router;
