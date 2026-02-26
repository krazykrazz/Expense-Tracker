/**
 * Auth Routes
 * 
 * Defines API routes for authentication operations.
 * All routes are nested under /api/auth
 * 
 * Routes:
 * - POST   /api/auth/login     - Login with password
 * - POST   /api/auth/refresh   - Refresh access token
 * - POST   /api/auth/logout    - Logout (clear refresh cookie)
 * - GET    /api/auth/status    - Get auth status
 * - PUT    /api/auth/password  - Set or change password
 * - DELETE /api/auth/password  - Remove password
 * 
 * Requirements: 11.3, 11.5
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/login - Login with password
router.post('/login', authController.login);

// POST /api/auth/refresh - Refresh access token via cookie
router.post('/refresh', authController.refresh);

// POST /api/auth/logout - Logout and clear refresh token cookie
router.post('/logout', authController.logout);

// GET /api/auth/status - Get current auth status
router.get('/status', authController.getStatus);

// PUT /api/auth/password - Set or change password
router.put('/password', authController.setPassword);

// DELETE /api/auth/password - Remove password (return to Open_Mode)
router.delete('/password', authController.removePassword);

module.exports = router;
