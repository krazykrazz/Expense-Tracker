const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/db');
const packageJson = require('../package.json');
const logger = require('../config/logger');

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Comprehensive health check endpoint
 * Tests database connectivity and returns service status
 * 
 * @route GET /api/health
 * @returns {Object} Health status with database connectivity, uptime, version, and timestamp
 * @returns {number} 200 - Service is healthy
 * @returns {number} 503 - Service is unhealthy (database connection failed)
 */
router.get('/health', async (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime) / 1000), // uptime in seconds
    version: packageJson.version,
    database: 'unknown'
  };

  // Add Docker info if available
  const imageTag = process.env.IMAGE_TAG;
  if (imageTag) {
    healthStatus.docker = {
      tag: imageTag,
      buildDate: process.env.BUILD_DATE,
      commit: process.env.GIT_COMMIT
    };
  }

  try {
    // Test database connectivity with a simple query
    const db = await getDatabase();
    
    await new Promise((resolve, reject) => {
      db.get('SELECT 1 as test', (err, row) => {
        if (err) {
          reject(err);
        } else if (row && row.test === 1) {
          healthStatus.database = 'connected';
          resolve();
        } else {
          reject(new Error('Database query returned unexpected result'));
        }
      });
      
      // Close the connection after the query
      db.close((err) => {
        if (err) {
          logger.error('Error closing database connection:', err.message);
        }
      });
    });

    // Return HTTP 200 for healthy state
    res.status(200).json(healthStatus);
  } catch (error) {
    // Database connection failed - service is unhealthy
    healthStatus.status = 'unhealthy';
    healthStatus.database = 'disconnected';
    healthStatus.error = error.message;

    logger.error('Health check failed:', error.message);

    // Return HTTP 503 for unhealthy state
    res.status(503).json(healthStatus);
  }
});

/**
 * Version info endpoint
 * Returns application version and Docker image information
 * 
 * @route GET /api/version
 * @returns {Object} Version information including Docker tag if running in container
 */
router.get('/version', (req, res) => {
  const versionInfo = {
    version: packageJson.version,
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'development'
  };

  // Add Docker info if available
  const imageTag = process.env.IMAGE_TAG;
  if (imageTag) {
    versionInfo.docker = {
      tag: imageTag,
      buildDate: process.env.BUILD_DATE,
      commit: process.env.GIT_COMMIT
    };
  }

  res.json(versionInfo);
});

module.exports = router;
