/**
 * Expense API Service
 * Handles all API calls related to expense management
 */

import { API_ENDPOINTS } from '../config.js';
import { apiGet, apiPost, apiPut, apiDelete, apiPatch, logApiError } from '../utils/apiClient.js';

/**
 * Build insurance fields for medical expense request body
 * Extracts and formats insurance-related fields from expense data
 * @param {Object} expenseData - Expense data object
 * @returns {Object} Insurance fields to merge into request body
 */
const buildInsuranceFields = (expenseData) => {
  if (expenseData.type !== 'Tax - Medical') {
    return {};
  }
  
  const fields = {};
  
  if (expenseData.insurance_eligible !== undefined) {
    fields.insurance_eligible = expenseData.insurance_eligible ? 1 : 0;
  }
  if (expenseData.claim_status !== undefined) {
    fields.claim_status = expenseData.claim_status;
  }
  if (expenseData.original_cost !== undefined && expenseData.original_cost !== null) {
    fields.original_cost = parseFloat(expenseData.original_cost);
  }
  
  return fields;
};

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
 * @param {Object} expenseData - Expense data including optional insurance fields
 * @param {Array} peopleAllocations - Optional array of { personId, amount, originalAmount } for medical expenses
 * @param {number} futureMonths - Optional number of future months to create copies (0-12)
 * @returns {Promise<Object>} Response with expense, futureExpenses array, and message
 * 
 * Insurance fields (for Tax - Medical expenses):
 * - insurance_eligible: boolean - Whether expense is eligible for insurance
 * - claim_status: string - 'not_claimed', 'in_progress', 'paid', 'denied'
 * - original_cost: number - Original cost before reimbursement
 * 
 * Credit card fields:
 * - posted_date: string|null - Date when expense posts to credit card statement (YYYY-MM-DD)
 * 
 * _Requirements: 1.3, 2.3, 4.1, 5.4_
 */
export const createExpense = async (expenseData, peopleAllocations = null, futureMonths = 0) => {
  try {
    const requestBody = {
      date: expenseData.date,
      place: expenseData.place,
      notes: expenseData.notes,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      // Support both payment_method_id (preferred) and method string (backward compatibility)
      ...(expenseData.payment_method_id 
        ? { payment_method_id: expenseData.payment_method_id }
        : { method: expenseData.method }),
      // Include posted_date for credit card expenses (optional field)
      ...(expenseData.posted_date !== undefined && { posted_date: expenseData.posted_date || null }),
      ...buildInsuranceFields(expenseData)
    };
    
    // Add people allocations for medical expenses
    if (peopleAllocations && peopleAllocations.length > 0) {
      requestBody.peopleAllocations = peopleAllocations;
    }
    
    // Add futureMonths parameter if specified
    if (futureMonths > 0) {
      requestBody.futureMonths = futureMonths;
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
 * @param {Object} expenseData - Updated expense data including optional insurance fields
 * @param {Array} peopleAllocations - Optional array of { personId, amount, originalAmount } for medical expenses
 * @param {number} futureMonths - Optional number of future months to create copies (0-12)
 * @returns {Promise<Object>} Response with updated expense, futureExpenses array, and message
 * 
 * Insurance fields (for Tax - Medical expenses):
 * - insurance_eligible: boolean - Whether expense is eligible for insurance
 * - claim_status: string - 'not_claimed', 'in_progress', 'paid', 'denied'
 * - original_cost: number - Original cost before reimbursement
 * 
 * Credit card fields:
 * - posted_date: string|null - Date when expense posts to credit card statement (YYYY-MM-DD)
 * 
 * _Requirements: 1.3, 2.3, 4.2, 5.4_
 */
export const updateExpense = async (id, expenseData, peopleAllocations = null, futureMonths = 0) => {
  try {
    const requestBody = {
      date: expenseData.date,
      place: expenseData.place,
      notes: expenseData.notes,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      // Support both payment_method_id (preferred) and method string (backward compatibility)
      ...(expenseData.payment_method_id 
        ? { payment_method_id: expenseData.payment_method_id }
        : { method: expenseData.method }),
      // Include posted_date for credit card expenses (optional field)
      ...(expenseData.posted_date !== undefined && { posted_date: expenseData.posted_date || null }),
      ...buildInsuranceFields(expenseData)
    };
    
    // Add people allocations for medical expenses
    if (peopleAllocations !== null) {
      requestBody.peopleAllocations = peopleAllocations;
    }
    
    // Add futureMonths parameter if specified
    if (futureMonths > 0) {
      requestBody.futureMonths = futureMonths;
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


/**
 * Update insurance status for a medical expense (quick status update)
 * Allows quick status updates without opening the full edit form.
 * 
 * @param {number} expenseId - Expense ID
 * @param {string} status - New claim status ('not_claimed', 'in_progress', 'paid', 'denied')
 * @returns {Promise<Object>} Updated expense object
 * 
 * Status transitions:
 * - not_claimed → in_progress
 * - in_progress → paid | denied
 * - paid/denied → in_progress (via edit form)
 * 
 * _Requirements: 5.1, 5.2, 5.3, 5.4_
 */
export const updateInsuranceStatus = async (expenseId, status) => {
  try {
    return await apiPatch(
      API_ENDPOINTS.INSURANCE_STATUS(expenseId),
      { status },
      'update insurance status'
    );
  } catch (error) {
    logApiError('updating insurance status', error);
    throw error;
  }
};

/**
 * Get lightweight tax deductible summary for YoY comparison
 * Returns only totals and counts, not full expense lists
 * 
 * @param {number} year - Year to get summary for
 * @returns {Promise<Object>} Summary with medicalTotal, donationTotal, totalDeductible, counts
 */
export const getTaxDeductibleSummary = async (year) => {
  try {
    return await apiGet(API_ENDPOINTS.TAX_DEDUCTIBLE_SUMMARY(year), 'fetch tax deductible summary');
  } catch (error) {
    logApiError('fetching tax deductible summary', error);
    throw error;
  }
};
