import { API_ENDPOINTS } from '../config.js';

/**
 * Get all fixed expense items for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { items: Array, total: number }
 */
export const getMonthlyFixedExpenses = async (year, month) => {
  try {
    const response = await fetch(API_ENDPOINTS.FIXED_EXPENSES_BY_MONTH(year, month));
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch fixed expenses');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching monthly fixed expenses:', error);
    throw error;
  }
};

/**
 * Create a new fixed expense item
 * @param {Object} data - { year, month, name, amount }
 * @returns {Promise<Object>} Created fixed expense
 */
export const createFixedExpense = async (data) => {
  try {
    const response = await fetch(API_ENDPOINTS.FIXED_EXPENSES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create fixed expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating fixed expense:', error);
    throw error;
  }
};

/**
 * Update a fixed expense item
 * @param {number} id - Fixed expense ID
 * @param {Object} data - { name, amount }
 * @returns {Promise<Object>} Updated fixed expense
 */
export const updateFixedExpense = async (id, data) => {
  try {
    const response = await fetch(API_ENDPOINTS.FIXED_EXPENSES_BY_ID(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update fixed expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating fixed expense:', error);
    throw error;
  }
};

/**
 * Delete a fixed expense item
 * @param {number} id - Fixed expense ID
 * @returns {Promise<Object>} Success response
 */
export const deleteFixedExpense = async (id) => {
  try {
    const response = await fetch(API_ENDPOINTS.FIXED_EXPENSES_BY_ID(id), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete fixed expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting fixed expense:', error);
    throw error;
  }
};

/**
 * Carry forward fixed expenses from previous month
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @returns {Promise<Object>} { items: Array, count: number }
 */
export const carryForwardFixedExpenses = async (year, month) => {
  try {
    const response = await fetch(API_ENDPOINTS.FIXED_EXPENSES_CARRY_FORWARD, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ year, month })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to carry forward fixed expenses');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error carrying forward fixed expenses:', error);
    throw error;
  }
};
