// API Configuration
const API_BASE_URL = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || '';

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
  
  // Investments
  INVESTMENTS: `${API_BASE_URL}/api/investments`,
  INVESTMENT_VALUES: `${API_BASE_URL}/api/investment-values`,
  
  // People
  PEOPLE: `${API_BASE_URL}/api/people`,
  PEOPLE_BY_ID: (id) => `${API_BASE_URL}/api/people/${id}`,
  
  // Budgets
  BUDGETS: `${API_BASE_URL}/api/budgets`,
  BUDGET_SUMMARY: `${API_BASE_URL}/api/budgets/summary`,
  BUDGET_HISTORY: `${API_BASE_URL}/api/budgets/history`,
  BUDGET_COPY: `${API_BASE_URL}/api/budgets/copy`,
  BUDGET_SUGGEST: `${API_BASE_URL}/api/budgets/suggest`,
  
  // Categories
  CATEGORIES: `${API_BASE_URL}/api/categories`,
  
  // Reminders
  REMINDER_STATUS: (year, month) => `${API_BASE_URL}/api/reminders/status/${year}/${month}`,
  
  // Backup
  BACKUP_CONFIG: `${API_BASE_URL}/api/backup/config`,
  BACKUP_LIST: `${API_BASE_URL}/api/backup/list`,
  BACKUP_MANUAL: `${API_BASE_URL}/api/backup/manual`,
  BACKUP_RESTORE: `${API_BASE_URL}/api/backup/restore`,
  
  // Import
  IMPORT: `${API_BASE_URL}/api/import`,
  
  // Version
  VERSION: `${API_BASE_URL}/api/version`,
  
  // Merchant Analytics
  MERCHANT_ANALYTICS: `${API_BASE_URL}/api/analytics/merchants`,
  MERCHANT_DETAILS: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}`,
  MERCHANT_TREND: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}/trend`,
  MERCHANT_EXPENSES: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}/expenses`,
  
  // Invoices
  INVOICES: `${API_BASE_URL}/api/invoices`,
  INVOICE_UPLOAD: `${API_BASE_URL}/api/invoices/upload`,
  INVOICE_BY_EXPENSE: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}`,
  INVOICE_METADATA: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}/metadata`,
  // Multi-invoice support endpoints
  INVOICES_FOR_EXPENSE: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}`,
  INVOICE_FILE: (expenseId, invoiceId) => `${API_BASE_URL}/api/invoices/${expenseId}/${invoiceId}`,
  INVOICE_BY_ID: (invoiceId) => `${API_BASE_URL}/api/invoices/${invoiceId}`,
  INVOICE_DELETE_ALL: (expenseId) => `${API_BASE_URL}/api/invoices/expense/${expenseId}`
};

export default API_BASE_URL;
