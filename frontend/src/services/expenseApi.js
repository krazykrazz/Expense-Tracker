/**
 * Expense API Service
 * Handles all API calls related to expense management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, logApiError } from '../utils/apiClient.js';

/**
 * Get expenses based on filters
 * @param {Object} filters - { year?, month?, isGlobalView? }
 * @returns {Promise<Array>} Array of expense objects
 */
export const getExpenses = async (filters = {}) => {
  try {
    let url;
    if (filters.isGlobalView) {
      // Global view - fetch all expenses when any filter is active
      url = API_ENDPOINTS.EXPENSES;
    } else if (filters.year && filters.month) {
      // Monthly view - fetch month-specific expenses
      url = `${API_ENDPOINTS.EXPENSES}?year=${filters.year}&month=${filters.month}`;
    } else {
      // Default to all expenses
      url = API_ENDPOINTS.EXPENSES;
    }
    
    return await apiGet(url, 'fetch expenses');
  } catch (error) {
    logApiError('fetching expenses', error);
    throw error;
  }
};

/**
 * Get a specific expense by ID
 * @param {number} id - Expense ID
 * @returns {Promise<Object>} Expense object
 */
export const getExpenseById = async (id) => {
  try {
    return await apiGet(API_ENDPOINTS.EXPENSE_BY_ID(id), 'fetch expense');
  } catch (error) {
    logApiError('fetching expense', error);
    throw error;
  }
};

/**
 * Get expense with associated people information
 * @param {number} id - Expense ID
 * @returns {Promise<Object>} Expense object with people data
 */
export const getExpenseWithPeople = async (id) => {
  try {
    return await apiGet(`${API_ENDPOINTS.EXPENSE_BY_ID(id)}?includePeople=true`, 'fetch expense with people');
  } catch (error) {
    logApiError('fetching expense with people', error);
    throw error;
  }
};


/**
 * Create a new expense
 * @param {Object} expenseData - Expense data
 * @param {Array} peopleAllocations - Optional array of { personId, amount } for medical expenses
 * @returns {Promise<Object>} Created expense object
 */
export const createExpense = async (expenseData, peopleAllocations = null) => {
  try {
    const requestBody = {
      date: expenseData.date,
      place: expenseData.place,
      notes: expenseData.notes,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      method: expenseData.method
    };
    
    // Add people allocations for medical expenses
    if (peopleAllocations && peopleAllocations.length > 0) {
      requestBody.peopleAllocations = peopleAllocations;
    }
    
    return await apiPost(API_ENDPOINTS.EXPENSES, requestBody, 'create expense');
  } catch (error) {
    logApiError('creating expense', error);
    throw error;
  }
};

/**
 * Update an existing expense
 * @param {number} id - Expense ID
 * @param {Object} expenseData - Updated expense data
 * @param {Array} peopleAllocations - Optional array of { personId, amount } for medical expenses
 * @returns {Promise<Object>} Updated expense object
 */
export const updateExpense = async (id, expenseData, peopleAllocations = null) => {
  try {
    const requestBody = {
      date: expenseData.date,
      place: expenseData.place,
      notes: expenseData.notes,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      method: expenseData.method
    };
    
    // Add people allocations for medical expenses
    if (peopleAllocations !== null) {
      requestBody.peopleAllocations = peopleAllocations;
    }
    
    return await apiPut(API_ENDPOINTS.EXPENSE_BY_ID(id), requestBody, 'update expense');
  } catch (error) {
    logApiError('updating expense', error);
    throw error;
  }
};

/**
 * Delete an expense
 * @param {number} id - Expense ID
 * @returns {Promise<Object>} Success response
 */
export const deleteExpense = async (id) => {
  try {
    return await apiDelete(API_ENDPOINTS.EXPENSE_BY_ID(id), 'delete expense');
  } catch (error) {
    logApiError('deleting expense', error);
    throw error;
  }
};

/**
 * Get expense summary for a specific period
 * @param {Object} filters - { year?, month? }
 * @returns {Promise<Object>} Summary data
 */
export const getExpenseSummary = async (filters = {}) => {
  try {
    let url = API_ENDPOINTS.SUMMARY;
    const params = new URLSearchParams();
    
    if (filters.year) params.append('year', filters.year);
    if (filters.month) params.append('month', filters.month);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    return await apiGet(url, 'fetch expense summary');
  } catch (error) {
    logApiError('fetching expense summary', error);
    throw error;
  }
};

/**
 * Get tax deductible expenses with optional people grouping
 * @param {number} year - Year for tax reporting
 * @param {boolean} groupByPerson - Whether to group medical expenses by person
 * @returns {Promise<Object>} Tax deductible expenses data
 */
export const getTaxDeductibleExpenses = async (year, groupByPerson = false) => {
  try {
    let url = `${API_ENDPOINTS.EXPENSES}/tax-deductible?year=${year}`;
    
    if (groupByPerson) {
      url += '&groupByPerson=true';
    }
    
    return await apiGet(url, 'fetch tax deductible expenses');
  } catch (error) {
    logApiError('fetching tax deductible expenses', error);
    throw error;
  }
};

/**
 * Get category suggestion for a place
 * @param {string} place - Place name
 * @returns {Promise<Object>} Suggested category data
 */
export const suggestCategory = async (place) => {
  try {
    return await apiPost(API_ENDPOINTS.SUGGEST_CATEGORY, { place }, 'get category suggestion');
  } catch (error) {
    logApiError('getting category suggestion', error);
    throw error;
  }
};

/**
 * Get available places for autocomplete
 * @returns {Promise<Array>} Array of place names
 */
export const getPlaces = async () => {
  try {
    return await apiGet(`${API_ENDPOINTS.EXPENSES}/places`, 'fetch places');
  } catch (error) {
    logApiError('fetching places', error);
    throw error;
  }
};
