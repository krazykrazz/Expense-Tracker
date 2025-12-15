/**
 * People API Service
 * Handles all API calls related to people (family members) management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get all people (family members)
 * @returns {Promise<Array>} Array of people objects
 */
export const getPeople = async () => {
  try {
    return await apiGet(API_ENDPOINTS.PEOPLE, 'fetch people');
  } catch (error) {
    logApiError('fetching people', error);
    throw error;
  }
};

/**
 * Create a new person
 * @param {string} name - Person's name (required)
 * @param {string} dateOfBirth - Person's date of birth (optional)
 * @returns {Promise<Object>} Created person object
 */
export const createPerson = async (name, dateOfBirth) => {
  try {
    return await apiPost(API_ENDPOINTS.PEOPLE, {
      name,
      dateOfBirth: dateOfBirth || null
    }, 'create person');
  } catch (error) {
    logApiError('creating person', error);
    throw error;
  }
};

/**
 * Update an existing person
 * @param {number} id - Person ID
 * @param {string} name - Person's name (required)
 * @param {string} dateOfBirth - Person's date of birth (optional)
 * @returns {Promise<Object>} Updated person object
 */
export const updatePerson = async (id, name, dateOfBirth) => {
  try {
    return await apiPut(API_ENDPOINTS.PEOPLE_BY_ID(id), {
      name,
      dateOfBirth: dateOfBirth || null
    }, 'update person');
  } catch (error) {
    logApiError('updating person', error);
    throw error;
  }
};

/**
 * Delete a person
 * @param {number} id - Person ID
 * @returns {Promise<Object>} Success response
 */
export const deletePerson = async (id) => {
  try {
    return await apiDelete(API_ENDPOINTS.PEOPLE_BY_ID(id), 'delete person');
  } catch (error) {
    logApiError('deleting person', error);
    throw error;
  }
};
