const paymentMethodRepository = require('../repositories/paymentMethodRepository');

/**
 * Valid payment method types
 */
const PAYMENT_METHOD_TYPES = ['cash', 'cheque', 'debit', 'credit_card'];

/**
 * Service for payment method validation logic
 * Extracted from paymentMethodService.js for separation of concerns
 */
class PaymentMethodValidationService {
  /**
   * Validate payment method data based on type
   * @param {Object} data - Payment method data to validate
   * @param {Object} options - Validation options
   * @param {boolean} options.isUpdate - Whether this is an update operation
   * @param {Object} options.existing - Existing payment method data (for updates)
   * @returns {Object} Validation result { isValid, errors }
   */
  validatePaymentMethod(data, options = {}) {
    const errors = [];
    const { isUpdate = false, existing = null } = options;

    // Trim whitespace from string inputs
    const displayName = data.display_name ? data.display_name.trim() : '';
    const fullName = data.full_name ? data.full_name.trim() : '';
    const type = data.type ? data.type.trim().toLowerCase() : '';

    // Validate type
    if (!type) {
      errors.push('Payment method type is required');
    } else if (!PAYMENT_METHOD_TYPES.includes(type)) {
      errors.push(`Invalid payment method type. Must be one of: ${PAYMENT_METHOD_TYPES.join(', ')}`);
    }

    // Validate display_name (required for all types)
    if (!displayName) {
      errors.push('Display name is required');
    } else if (displayName.length > 50) {
      errors.push('Display name must not exceed 50 characters');
    }

    // Type-specific validation
    if (type === 'credit_card') {
      // Credit cards require full_name
      if (!fullName) {
        errors.push('Full name is required for credit cards');
      } else if (fullName.length > 100) {
        errors.push('Full name must not exceed 100 characters');
      }

      // Validate credit_limit if provided
      if (data.credit_limit !== undefined && data.credit_limit !== null) {
        if (typeof data.credit_limit !== 'number' || data.credit_limit <= 0) {
          errors.push('Credit limit must be a positive number');
        }
      }

      // Validate current_balance if provided
      if (data.current_balance !== undefined && data.current_balance !== null) {
        if (typeof data.current_balance !== 'number' || data.current_balance < 0) {
          errors.push('Balance cannot be negative');
        }
      }

      // Validate billing_cycle_day - REQUIRED for new credit cards
      if (data.billing_cycle_day === undefined || data.billing_cycle_day === null) {
        if (!isUpdate) {
          errors.push('Billing cycle day is required for credit cards');
        } else if (existing && existing.billing_cycle_day !== null) {
          errors.push('Billing cycle day cannot be removed once set');
        }
      } else {
        const billingCycleDay = Number(data.billing_cycle_day);
        if (!Number.isInteger(billingCycleDay) || billingCycleDay < 1 || billingCycleDay > 31) {
          errors.push('Billing cycle day must be between 1 and 31');
        }
      }

      // Validate payment_due_day - REQUIRED for new credit cards
      if (data.payment_due_day === undefined || data.payment_due_day === null) {
        if (!isUpdate) {
          errors.push('Payment due day is required for credit cards');
        } else if (existing && existing.payment_due_day !== null) {
          errors.push('Payment due day cannot be removed once set');
        }
      } else {
        const paymentDueDay = Number(data.payment_due_day);
        if (!Number.isInteger(paymentDueDay) || paymentDueDay < 1 || paymentDueDay > 31) {
          errors.push('Payment due day must be between 1 and 31');
        }
      }

      // Validate billing_cycle_start if provided (deprecated but still supported)
      if (data.billing_cycle_start !== undefined && data.billing_cycle_start !== null) {
        if (!Number.isInteger(data.billing_cycle_start) || data.billing_cycle_start < 1 || data.billing_cycle_start > 31) {
          errors.push('Billing cycle start day must be between 1 and 31');
        }
      }

      // Validate billing_cycle_end if provided (deprecated but still supported)
      if (data.billing_cycle_end !== undefined && data.billing_cycle_end !== null) {
        if (!Number.isInteger(data.billing_cycle_end) || data.billing_cycle_end < 1 || data.billing_cycle_end > 31) {
          errors.push('Billing cycle end day must be between 1 and 31');
        }
      }
    }

    // Validate account_details length if provided (for cheque and debit)
    if (data.account_details && data.account_details.length > 100) {
      errors.push('Account details must not exceed 100 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if display name is unique among active payment methods
   * @param {string} displayName - Display name to check
   * @param {number} excludeId - Optional ID to exclude (for updates)
   * @returns {Promise<boolean>} True if unique
   */
  async isDisplayNameUnique(displayName, excludeId = null) {
    const trimmedName = displayName.trim();
    const existing = await paymentMethodRepository.findByDisplayName(trimmedName);
    
    if (!existing) {
      return true;
    }

    // If we're updating, allow the same name for the same record
    if (excludeId && existing.id === excludeId) {
      return true;
    }

    return false;
  }
}

module.exports = new PaymentMethodValidationService();
