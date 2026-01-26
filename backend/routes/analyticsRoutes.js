/**
 * Analytics Routes
 * 
 * RESTful API endpoints for the Spending Patterns & Predictions feature.
 * Provides access to patterns, predictions, seasonal analysis, and anomaly detection.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// GET /api/analytics/data-sufficiency - Check data availability for analytics
router.get('/data-sufficiency', analyticsController.getDataSufficiency);

// GET /api/analytics/patterns - Get recurring spending patterns
router.get('/patterns', analyticsController.getRecurringPatterns);

// GET /api/analytics/patterns/day-of-week - Get day-of-week spending analysis
router.get('/patterns/day-of-week', analyticsController.getDayOfWeekPatterns);

// GET /api/analytics/seasonal - Get seasonal spending analysis
router.get('/seasonal', analyticsController.getSeasonalAnalysis);

// GET /api/analytics/predictions/:year/:month - Get month-end prediction
router.get('/predictions/:year/:month', analyticsController.getMonthPrediction);

// GET /api/analytics/predictions/:year/:month/comparison - Get historical comparison
router.get('/predictions/:year/:month/comparison', analyticsController.getHistoricalComparison);

// GET /api/analytics/anomalies - Get detected anomalies
router.get('/anomalies', analyticsController.getAnomalies);

// POST /api/analytics/anomalies/:expenseId/dismiss - Dismiss an anomaly
router.post('/anomalies/:expenseId/dismiss', analyticsController.dismissAnomaly);

module.exports = router;
