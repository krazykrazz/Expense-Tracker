/**
 * Analytics Routes
 * 
 * RESTful API endpoints for the Spending Patterns & Predictions feature.
 * Provides access to patterns, predictions, seasonal analysis, and anomaly detection.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { cacheMiddleware } = require('../middleware/analyticsCache');

// GET /api/analytics/data-sufficiency - Check data availability for analytics
router.get('/data-sufficiency', cacheMiddleware(), analyticsController.getDataSufficiency);

// GET /api/analytics/patterns - Get recurring spending patterns
router.get('/patterns', cacheMiddleware(), analyticsController.getRecurringPatterns);

// GET /api/analytics/patterns/day-of-week - Get day-of-week spending analysis
router.get('/patterns/day-of-week', cacheMiddleware(), analyticsController.getDayOfWeekPatterns);

// GET /api/analytics/seasonal - Get seasonal spending analysis
router.get('/seasonal', cacheMiddleware(), analyticsController.getSeasonalAnalysis);

// GET /api/analytics/predictions/:year/:month - Get month-end prediction
router.get('/predictions/:year/:month', cacheMiddleware(), analyticsController.getMonthPrediction);

// GET /api/analytics/predictions/:year/:month/comparison - Get historical comparison
router.get('/predictions/:year/:month/comparison', cacheMiddleware(), analyticsController.getHistoricalComparison);

// GET /api/analytics/anomalies - Get detected anomalies
router.get('/anomalies', cacheMiddleware(), analyticsController.getAnomalies);

// POST /api/analytics/anomalies/:expenseId/dismiss - Dismiss an anomaly
router.post('/anomalies/:expenseId/dismiss', analyticsController.dismissAnomaly);

// GET /api/analytics/monthly-summary/:year/:month - Get monthly summary
router.get('/monthly-summary/:year/:month', analyticsController.getMonthlySummary);

// GET /api/analytics/trends/:year/:month - Get consolidated trends data
router.get('/trends/:year/:month', analyticsController.getTrends);

// GET /api/analytics/activity-insights/:year/:month - Get activity insights
router.get('/activity-insights/:year/:month', analyticsController.getActivityInsights);

// POST /api/analytics/anomalies/:expenseId/mark-expected - Mark anomaly as expected
router.post('/anomalies/:expenseId/mark-expected', analyticsController.markAnomalyAsExpected);

// GET /api/analytics/anomaly-suppression-rules - Get all suppression rules
router.get('/anomaly-suppression-rules', analyticsController.getSuppressionRules);

// DELETE /api/analytics/anomaly-suppression-rules/:id - Delete a suppression rule
router.delete('/anomaly-suppression-rules/:id', analyticsController.deleteSuppressionRule);

module.exports = router;
