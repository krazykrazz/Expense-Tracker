/**
 * Centralized application constants
 */

export const CATEGORIES = [
  'Automotive',
  'Clothing',
  'Dining Out',
  'Entertainment',
  'Gas',
  'Gifts',
  'Groceries',
  'Housing',
  'Insurance',
  'Personal Care',
  'Pet Care',
  'Recreation Activities',
  'Subscriptions',
  'Utilities',
  'Other',
  'Tax - Donation',
  'Tax - Medical'
];

/**
 * @deprecated PAYMENT_METHODS is deprecated and will be removed in a future version.
 * Payment methods are now stored in the database and should be fetched via the API.
 * Use the paymentMethodApi service or the /api/payment-methods endpoint instead.
 * 
 * This constant is retained only for backward compatibility during the transition period
 * and for legacy test files that haven't been updated yet.
 * 
 * @see frontend/src/services/paymentMethodApi.js
 * @see frontend/src/components/PaymentMethodsModal.jsx
 */
export const PAYMENT_METHODS = [
  'Cash',
  'Debit',
  'Cheque',
  'CIBC MC',
  'PCF MC',
  'WS VISA',
  'RBC VISA'  // Note: 'VISA' was renamed to 'RBC VISA' during migration
];
