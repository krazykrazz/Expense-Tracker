/**
 * Centralized application constants
 */

/**
 * @deprecated PAYMENT_METHODS is deprecated and will be removed in a future version.
 * Payment methods are now stored in the database and should be fetched via the API.
 * Use paymentMethodRepository.findAll() or the /api/payment-methods endpoint instead.
 * 
 * This constant is retained only for backward compatibility during the transition period
 * and for legacy test files that haven't been updated yet.
 * 
 * @see backend/repositories/paymentMethodRepository.js
 * @see frontend/src/services/paymentMethodApi.js
 */
const PAYMENT_METHODS = [
  'Cash',
  'Debit',
  'Cheque',
  'CIBC MC',
  'PCF MC',
  'WS VISA',
  'RBC VISA'  // Note: 'VISA' was renamed to 'RBC VISA' during migration
];

const INCOME_CATEGORIES = [
  'Salary',
  'Government',
  'Gifts',
  'Other'
];

module.exports = {
  PAYMENT_METHODS,
  INCOME_CATEGORIES
};
