// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_ENDPOINTS = {
  // Expenses
  EXPENSES: `${API_BASE_URL}/api/expenses`,
  EXPENSE_BY_ID: (id) => `${API_BASE_URL}/api/expenses/${id}`,
  SUMMARY: `${API_BASE_URL}/api/expenses/summary`,
  SUGGEST_CATEGORY: `${API_BASE_URL}/api/expenses/suggest-category`,
  PLACE_NAMES_ANALYZE: `${API_BASE_URL}/api/expenses/place-names/analyze`,
  PLACE_NAMES_STANDARDIZE: `${API_BASE_URL}/api/expenses/place-names/standardize`,
  
  // Recurring (deprecated but kept for compatibility)
  RECURRING: `${API_BASE_URL}/api/recurring`,
  RECURRING_BY_ID: (id) => `${API_BASE_URL}/api/recurring/${id}`,
  
  // Fixed Expenses
  FIXED_EXPENSES: `${API_BASE_URL}/api/fixed-expenses`,
  FIXED_EXPENSES_BY_MONTH: (year, month) => `${API_BASE_URL}/api/fixed-expenses/${year}/${month}`,
  FIXED_EXPENSES_BY_ID: (id) => `${API_BASE_URL}/api/fixed-expenses/${id}`,
  FIXED_EXPENSES_CARRY_FORWARD: `${API_BASE_URL}/api/fixed-expenses/carry-forward`,
  
  // Income
  INCOME: `${API_BASE_URL}/api/income`,
  INCOME_BY_MONTH: (year, month) => `${API_BASE_URL}/api/income/${year}/${month}`,
  INCOME_BY_ID: (id) => `${API_BASE_URL}/api/income/${id}`,
  INCOME_COPY_PREVIOUS: (year, month) => `${API_BASE_URL}/api/income/${year}/${month}/copy-previous`,
  
  // Loans
  LOANS: `${API_BASE_URL}/api/loans`,
  LOAN_BALANCES: `${API_BASE_URL}/api/loan-balances`,
  
  // Budgets
  BUDGETS: `${API_BASE_URL}/api/budgets`,
  BUDGET_SUMMARY: `${API_BASE_URL}/api/budgets/summary`,
  BUDGET_HISTORY: `${API_BASE_URL}/api/budgets/history`,
  BUDGET_COPY: `${API_BASE_URL}/api/budgets/copy`,
  BUDGET_SUGGEST: `${API_BASE_URL}/api/budgets/suggest`,
  
  // Categories
  CATEGORIES: `${API_BASE_URL}/api/categories`,
  
  // Backup
  BACKUP_CONFIG: `${API_BASE_URL}/api/backup/config`,
  BACKUP_LIST: `${API_BASE_URL}/api/backup/list`,
  BACKUP_MANUAL: `${API_BASE_URL}/api/backup/manual`,
  BACKUP_RESTORE: `${API_BASE_URL}/api/backup/restore`,
  
  // Import
  IMPORT: `${API_BASE_URL}/api/import`,
  
  // Version
  VERSION: `${API_BASE_URL}/api/version`
};

export default API_BASE_URL;
