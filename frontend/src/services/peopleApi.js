import API_BASE_URL from '../config.js';

// People API endpoints
const PEOPLE_ENDPOINTS = {
  BASE: `${API_BASE_URL}/api/people`,
  BY_ID: (id) => `${API_BASE_URL}/api/people/${id}`
};

/**
 * Get all people (family members)
 * @returns {Promise<Array>} Array of people objects
 */
export const getPeople = async () => {
  try {
    const response = await fetch(PEOPLE_ENDPOINTS.BASE);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch people');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching people:', error);
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
    const response = await fetch(PEOPLE_ENDPOINTS.BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        dateOfBirth: dateOfBirth || null
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create person');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating person:', error);
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
    const response = await fetch(PEOPLE_ENDPOINTS.BY_ID(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        dateOfBirth: dateOfBirth || null
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update person');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating person:', error);
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
    const response = await fetch(PEOPLE_ENDPOINTS.BY_ID(id), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete person');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting person:', error);
    throw error;
  }
};