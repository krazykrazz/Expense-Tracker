/**
 * Auth API Service
 * Handles all API calls related to authentication and password management.
 * 
 * Requirements: 8.1, 8.3, 8.6
 */

import { API_ENDPOINTS } from '../config.js';
import { logApiError } from '../utils/apiClient.js';

/**
 * Get current auth status (is Password_Gate active?)
 * GET /api/auth/status
 * @returns {Promise<{passwordRequired: boolean, username: string}>}
 */
export const getAuthStatus = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_STATUS);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Failed to get auth status'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('fetching auth status', error);
    throw error;
  }
};

/**
 * Login with password
 * POST /api/auth/login
 * @param {string} password
 * @returns {Promise<{accessToken: string}>}
 */
export const login = async (password) => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Login failed'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('login', error);
    throw error;
  }
};

/**
 * Refresh access token using HTTP-only refresh cookie
 * POST /api/auth/refresh
 * @returns {Promise<{accessToken: string}>}
 */
export const refreshAccessToken = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_REFRESH, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Token refresh failed'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('refreshing token', error);
    throw error;
  }
};

/**
 * Logout — clears refresh token cookie on server
 * POST /api/auth/logout
 * @returns {Promise<{message: string}>}
 */
export const logout = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_LOGOUT, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Logout failed'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('logout', error);
    throw error;
  }
};

/**
 * Set or change password
 * PUT /api/auth/password
 * @param {string|null} currentPassword - Required when Password_Gate is active
 * @param {string} newPassword - Min 4 characters
 * @returns {Promise<{message: string}>}
 */
export const setPassword = async (currentPassword, newPassword) => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_PASSWORD, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Failed to set password'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('setting password', error);
    throw error;
  }
};

/**
 * Remove password (return to Open_Mode)
 * DELETE /api/auth/password
 * @param {string} currentPassword
 * @returns {Promise<{message: string}>}
 */
export const removePassword = async (currentPassword) => {
  try {
    const response = await fetch(API_ENDPOINTS.AUTH_PASSWORD, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw Object.assign(new Error(errorData.error || 'Failed to remove password'), { status: response.status });
    }
    return await response.json();
  } catch (error) {
    logApiError('removing password', error);
    throw error;
  }
};
