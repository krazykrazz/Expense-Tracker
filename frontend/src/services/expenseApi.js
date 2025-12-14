import { API_ENDPOINTS } from '../config.js';

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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch expenses');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching expenses:', error);
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
    const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(id));
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense:', error);
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
    const response = await fetch(`${API_ENDPOINTS.EXPENSE_BY_ID(id)}?includePeople=true`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch expense with people');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense with people:', error);
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
    
    const response = await fetch(API_ENDPOINTS.EXPENSES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to create expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating expense:', error);
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
    
    const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(id), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating expense:', error);
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
    const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(id), {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to delete expense');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error deleting expense:', error);
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch expense summary');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching expense summary:', error);
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
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch tax deductible expenses');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching tax deductible expenses:', error);
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
    const response = await fetch(API_ENDPOINTS.SUGGEST_CATEGORY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ place })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get category suggestion');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting category suggestion:', error);
    throw error;
  }
};

/**
 * Get available places for autocomplete
 * @returns {Promise<Array>} Array of place names
 */
export const getPlaces = async () => {
  try {
    const response = await fetch(`${API_ENDPOINTS.EXPENSES}/places`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to fetch places');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching places:', error);
    throw error;
  }
};