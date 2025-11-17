/**
 * Loan Balance API Service
 * Handles all API calls related to loan balance tracking
 */

import { API_ENDPOINTS } from '../config.js';

/**
 * Get balance history for a specific loan
 * @param {number} loanId - Loan ID
 * @returns {Promise<Array>} Array of balance entries with calculated changes
 */
export const getBalanceHistory = async (loanId) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOAN_BALANCES}/${loanId}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch balance history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching balance history:', error);
    throw error;
  }
};

/**
 * Get balance entry for a specific loan and month
 * @param {number} loanId - Loan ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Balance entry object
 */
export const getBalanceForMonth = async (loanId, year, month) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOAN_BALANCES}/${loanId}/${year}/${month}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch balance for month');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching balance for month:', error);
    throw error;
  }
};

/**
 * Create or update a balance entry
 * @param {Object} balanceData - { loan_id, year, month, remaining_balance, rate }
 * @returns {Promise<Object>} Created or updated balance entry
 */
export const createOrUpdateBalance = async (balanceData) => {
  try {
    const response = await fetch(API_ENDPOINTS.LOAN_BALANCES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(balanceData)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create or update balance');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating or updating balance:', error);
    throw error;
  }
};

/**
 * Delete a balance entry
 * @param {number} id - Balance entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteBalance = async (id) => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOAN_BALANCES}/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete balance entry');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting balance entry:', error);
    throw error;
  }
};

/**
 * Get total debt over time across all active loans
 * @returns {Promise<Array>} Array of {year, month, total_debt, loan_count} objects
 */
export const getTotalDebtOverTime = async () => {
  try {
    const response = await fetch(`${API_ENDPOINTS.LOAN_BALANCES}/total/history`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch total debt history');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching total debt history:', error);
    throw error;
  }
};


