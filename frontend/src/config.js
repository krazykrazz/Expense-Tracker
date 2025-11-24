// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_ENDPOINTS = {
  EXPENSES: `${API_BASE_URL}/api/expenses`,
  EXPENSE_BY_ID: (id) => `${API_BASE_URL}/api/expenses/${id}`,
  SUMMARY: `${API_BASE_URL}/api/expenses/summary`,
  RECURRING: `${API_BASE_URL}/api/recurring`,
  RECURRING_BY_ID: (id) => `${API_BASE_URL}/api/recurring/${id}`,
  FIXED_EXPENSES: `${API_BASE_URL}/api/fixed-expenses`,
  FIXED_EXPENSES_BY_MONTH: (year, month) => `${API_BASE_URL}/api/fixed-expenses/${year}/${month}`,
  FIXED_EXPENSES_BY_ID: (id) => `${API_BASE_URL}/api/fixed-expenses/${id}`,
  FIXED_EXPENSES_CARRY_FORWARD: `${API_BASE_URL}/api/fixed-expenses/carry-forward`,
  LOANS: `${API_BASE_URL}/api/loans`,
  LOAN_BALANCES: `${API_BASE_URL}/api/loan-balances`,
  BUDGETS: `${API_BASE_URL}/api/budgets`,
  BUDGET_SUMMARY: `${API_BASE_URL}/api/budgets/summary`,
  BUDGET_HISTORY: `${API_BASE_URL}/api/budgets/history`,
  BUDGET_COPY: `${API_BASE_URL}/api/budgets/copy`,
  BUDGET_SUGGEST: `${API_BASE_URL}/api/budgets/suggest`,
  CATEGORIES: `${API_BASE_URL}/api/categories`,
  PLACE_NAMES_ANALYZE: `${API_BASE_URL}/api/expenses/place-names/analyze`,
  PLACE_NAMES_STANDARDIZE: `${API_BASE_URL}/api/expenses/place-names/standardize`
};

export default API_BASE_URL;
