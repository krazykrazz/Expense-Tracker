const express = require('express');
const router = express.Router();
const merchantAnalyticsController = require('../controllers/merchantAnalyticsController');

// GET /api/analytics/merchants - Get top merchants by total spending
router.get('/analytics/merchants', merchantAnalyticsController.getTopMerchants);

// GET /api/analytics/merchants/:name - Get detailed statistics for a specific merchant
router.get('/analytics/merchants/:name', merchantAnalyticsController.getMerchantDetails);

// GET /api/analytics/merchants/:name/trend - Get monthly spending trend for a merchant
router.get('/analytics/merchants/:name/trend', merchantAnalyticsController.getMerchantTrend);

// GET /api/analytics/merchants/:name/expenses - Get all expenses for a specific merchant
router.get('/analytics/merchants/:name/expenses', merchantAnalyticsController.getMerchantExpenses);

module.exports = router;