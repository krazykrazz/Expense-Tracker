/**
 * Loan API Service
 * Handles all API calls related to loan management
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Get all loans with current balances
 * @returns {Promise<Array>} Array of loan objects with current balances
 */
export const getAllLoans = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.LOANS);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch loans');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching loans:', error);
    throw error;
  }
};

/**
 * Create a new loan
 * @param {Object} loanData - { name, initial_balance, start_date, notes }
 * @returns {Promise<Object>} Created loan object
 */
export const createLoan = async (loanData) => {
  try {
    const response = await fetch(API_ENDPOINTS.LOANS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loanData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create loan');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating loan:', error);
    throw error;
  }
};

/**
 * Update an existing loan
 * @param {number} id - Loan ID
 * @param {Object} loanData - { name, notes }
 * @returns {Promise<Object>} Updated loan object
 */
export const updateLoan = async (id, loanData) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOANS}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loanData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update loan');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating loan:', error);
    throw error;
  }
};

/**
 * Delete a loan
 * @param {number} id - Loan ID
 * @returns {Promise<Object>} Success response
 */
export const deleteLoan = async (id) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOANS}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete loan');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting loan:', error);
    throw error;
  }
};

/**
 * Mark a loan as paid off or reactivate it
 * @param {number} id - Loan ID
 * @param {boolean} isPaidOff - True to mark as paid off, false to reactivate
 * @returns {Promise<Object>} Updated loan object
 */
export const markPaidOff = async (id, isPaidOff) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOANS}/${id}/paid-off`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isPaidOff })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update loan paid-off status');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating loan paid-off status:', error);
    throw error;
  }
};
