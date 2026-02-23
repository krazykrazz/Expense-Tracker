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
  
  // Fixed Expenses
  FIXED_EXPENSES: `${API_BASE_URL}/api/fixed-expenses`,
  FIXED_EXPENSES_BY_MONTH: (year, month) => `${API_BASE_URL}/api/fixed-expenses/${year}/${month}`,
  FIXED_EXPENSES_BY_ID: (id) => `${API_BASE_URL}/api/fixed-expenses/${id}`,
  FIXED_EXPENSES_CARRY_FORWARD: `${API_BASE_URL}/api/fixed-expenses/carry-forward`,
  FIXED_EXPENSES_BY_LOAN: (loanId) => `${API_BASE_URL}/api/fixed-expenses/by-loan/${loanId}`,
  
  // Income
  INCOME: `${API_BASE_URL}/api/income`,
  INCOME_BY_MONTH: (year, month) => `${API_BASE_URL}/api/income/${year}/${month}`,
  INCOME_BY_ID: (id) => `${API_BASE_URL}/api/income/${id}`,
  INCOME_COPY_PREVIOUS: (year, month) => `${API_BASE_URL}/api/income/${year}/${month}/copy-previous`,
  
  // Loans
  LOANS: `${API_BASE_URL}/api/loans`,
  LOAN_BY_ID: (id) => `${API_BASE_URL}/api/loans/${id}`,
  LOAN_BALANCES: `${API_BASE_URL}/api/loan-balances`,
  LOAN_AMORTIZATION: (id) => `${API_BASE_URL}/api/loans/${id}/amortization`,
  LOAN_EQUITY_HISTORY: (id) => `${API_BASE_URL}/api/loans/${id}/equity-history`,
  LOAN_PROPERTY_VALUE: (id) => `${API_BASE_URL}/api/loans/${id}/property-value`,
  LOAN_INSIGHTS: (id) => `${API_BASE_URL}/api/loans/${id}/insights`,
  LOAN_PAYMENTS: (id) => `${API_BASE_URL}/api/loans/${id}/payments`,
  LOAN_PAYMENT: (id, paymentId) => `${API_BASE_URL}/api/loans/${id}/payments/${paymentId}`,
  LOAN_SCENARIO: (id) => `${API_BASE_URL}/api/loans/${id}/insights/scenario`,
  LOAN_RATE: (id) => `${API_BASE_URL}/api/loans/${id}/rate`,
  
  // Loan Payment Tracking (for loans and mortgages)
  LOAN_PAYMENT_ENTRIES: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/loan-payments`,
  LOAN_PAYMENT_ENTRY: (loanId, paymentId) => `${API_BASE_URL}/api/loans/${loanId}/loan-payments/${paymentId}`,
  LOAN_PAYMENT_AUTO_LOG: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/loan-payments/auto-log`,
  LOAN_CALCULATED_BALANCE: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/calculated-balance`,
  LOAN_PAYMENT_BALANCE_HISTORY: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/payment-balance-history`,
  LOAN_PAYMENT_SUGGESTION: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/payment-suggestion`,
  LOAN_MIGRATE_BALANCES: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/migrate-balances`,
  LOAN_MIGRATE_BALANCES_PREVIEW: (loanId) => `${API_BASE_URL}/api/loans/${loanId}/migrate-balances/preview`,
  
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
  AUTO_LOG_SUGGESTIONS: (year, month) => `${API_BASE_URL}/api/reminders/auto-log-suggestions/${year}/${month}`,
  
  // Backup
  BACKUP_CONFIG: `${API_BASE_URL}/api/backup/config`,
  BACKUP_LIST: `${API_BASE_URL}/api/backup/list`,
  BACKUP_MANUAL: `${API_BASE_URL}/api/backup/manual`,
  BACKUP_RESTORE: `${API_BASE_URL}/api/backup/restore`,
  BACKUP_STATS: `${API_BASE_URL}/api/backup/stats`,
  BACKUP_DOWNLOAD: `${API_BASE_URL}/api/backup`,
  
  // Version
  VERSION: `${API_BASE_URL}/api/version`,
  
  // Merchant Analytics
  MERCHANT_ANALYTICS: `${API_BASE_URL}/api/analytics/merchants`,
  MERCHANT_DETAILS: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}`,
  MERCHANT_TREND: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}/trend`,
  MERCHANT_EXPENSES: (name) => `${API_BASE_URL}/api/analytics/merchants/${encodeURIComponent(name)}/expenses`,
  
  // Spending Patterns & Predictions Analytics
  ANALYTICS_PATTERNS: `${API_BASE_URL}/api/analytics/patterns`,
  ANALYTICS_PATTERNS_DAY_OF_WEEK: `${API_BASE_URL}/api/analytics/patterns/day-of-week`,
  ANALYTICS_SEASONAL: `${API_BASE_URL}/api/analytics/seasonal`,
  ANALYTICS_PREDICTIONS: (year, month) => `${API_BASE_URL}/api/analytics/predictions/${year}/${month}`,
  ANALYTICS_ANOMALIES: `${API_BASE_URL}/api/analytics/anomalies`,
  ANALYTICS_ANOMALY_DISMISS: (expenseId) => `${API_BASE_URL}/api/analytics/anomalies/${expenseId}/dismiss`,
  ANALYTICS_DATA_SUFFICIENCY: `${API_BASE_URL}/api/analytics/data-sufficiency`,
  
  // Insurance Status
  INSURANCE_STATUS: (id) => `${API_BASE_URL}/api/expenses/${id}/insurance-status`,
  
  // Tax Deductible
  TAX_DEDUCTIBLE_SUMMARY: (year) => `${API_BASE_URL}/api/expenses/tax-deductible/summary?year=${year}`,
  
  // Payment Methods
  PAYMENT_METHODS: `${API_BASE_URL}/api/payment-methods`,
  PAYMENT_METHOD_BY_ID: (id) => `${API_BASE_URL}/api/payment-methods/${id}`,
  PAYMENT_METHOD_DISPLAY_NAMES: `${API_BASE_URL}/api/payment-methods/display-names`,
  PAYMENT_METHOD_ACTIVE: `${API_BASE_URL}/api/payment-methods/active`,
  PAYMENT_METHOD_SET_ACTIVE: (id) => `${API_BASE_URL}/api/payment-methods/${id}/active`,
  
  // Credit Card Payments
  PAYMENT_METHOD_PAYMENTS: (id) => `${API_BASE_URL}/api/payment-methods/${id}/payments`,
  PAYMENT_METHOD_PAYMENT: (id, paymentId) => `${API_BASE_URL}/api/payment-methods/${id}/payments/${paymentId}`,
  PAYMENT_METHOD_PAYMENTS_TOTAL: (id) => `${API_BASE_URL}/api/payment-methods/${id}/payments/total`,
  
  // Credit Card Statements
  PAYMENT_METHOD_STATEMENTS: (id) => `${API_BASE_URL}/api/payment-methods/${id}/statements`,
  PAYMENT_METHOD_STATEMENT: (id, statementId) => `${API_BASE_URL}/api/payment-methods/${id}/statements/${statementId}`,
  
  // Credit Card Billing Cycles
  PAYMENT_METHOD_BILLING_CYCLE_HISTORY: (id) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/history`,
  PAYMENT_METHOD_BILLING_CYCLE_UPDATE: (id, cycleId) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/${cycleId}`,
  PAYMENT_METHOD_BILLING_CYCLE_DELETE: (id, cycleId) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/${cycleId}`,
  PAYMENT_METHOD_BILLING_CYCLE_CURRENT: (id) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/current`,
  PAYMENT_METHOD_BILLING_CYCLE_PDF: (id, cycleId) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/${cycleId}/pdf`,
  PAYMENT_METHOD_BILLING_CYCLES: (id) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles`,
  PAYMENT_METHOD_BILLING_CYCLE_RECALCULATE: (id) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/recalculate`,
  
  // Unified Billing Cycles (with auto-generation, transaction counts, and trends)
  PAYMENT_METHOD_BILLING_CYCLES_UNIFIED: (id) => `${API_BASE_URL}/api/payment-methods/${id}/billing-cycles/unified`,

  // Unified Credit Card Detail (single endpoint for all card data)
  PAYMENT_METHOD_CREDIT_CARD_DETAIL: (id) => `${API_BASE_URL}/api/payment-methods/${id}/credit-card-detail`,
  
  // Credit Card Statement Balance
  PAYMENT_METHOD_STATEMENT_BALANCE: (id) => `${API_BASE_URL}/api/payment-methods/${id}/statement-balance`,
  
  // Invoices
  INVOICES: `${API_BASE_URL}/api/invoices`,
  INVOICE_UPLOAD: `${API_BASE_URL}/api/invoices/upload`,
  INVOICE_METADATA: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}/metadata`,
  // Multi-invoice support endpoints
  INVOICES_FOR_EXPENSE: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}`,
  INVOICE_FILE: (expenseId, invoiceId) => `${API_BASE_URL}/api/invoices/${expenseId}/${invoiceId}`,
  INVOICE_FILE_LEGACY: (expenseId) => `${API_BASE_URL}/api/invoices/${expenseId}/file`,
  INVOICE_BY_ID: (invoiceId) => `${API_BASE_URL}/api/invoices/${invoiceId}`,
  INVOICE_DELETE_ALL: (expenseId) => `${API_BASE_URL}/api/invoices/expense/${expenseId}`,
  
  // Real-time sync (SSE)
  SYNC_EVENTS: `${API_BASE_URL}/api/sync/events`,

  // Health
  HEALTH: `${API_BASE_URL}/api/health`,

  // Activity Logs
  ACTIVITY_LOGS: `${API_BASE_URL}/api/activity-logs`,
  ACTIVITY_LOGS_STATS: `${API_BASE_URL}/api/activity-logs/stats`,
  ACTIVITY_LOGS_SETTINGS: `${API_BASE_URL}/api/activity-logs/settings`,

  // Billing Cycle Dismiss
  DISMISS_AUTO_GENERATED_CYCLES: `${API_BASE_URL}/api/payment-methods/billing-cycles/dismiss-auto-generated`,

  // Settings
  SETTINGS_TIMEZONE: `${API_BASE_URL}/api/settings/timezone`
};

export default API_BASE_URL;
