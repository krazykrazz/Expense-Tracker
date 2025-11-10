// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_ENDPOINTS = {
  EXPENSES: `${API_BASE_URL}/api/expenses`,
  EXPENSE_BY_ID: (id) => `${API_BASE_URL}/api/expenses/${id}`,
  SUMMARY: `${API_BASE_URL}/api/expenses/summary`
};

export default API_BASE_URL;
