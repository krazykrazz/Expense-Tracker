import { API_ENDPOINTS } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('useFormSubmission');

/**
 * Custom hook for expense form submission logic
 * Handles form data assembly, API calls, invoice uploads, and state reset
 * 
 * @param {Object} params - Hook parameters
 * @param {Object} params.formData - Current form data state
 * @param {Function} params.setFormData - Form data setter
 * @param {boolean} params.isEditing - Whether in edit mode
 * @param {Object} params.expense - Expense being edited (if any)
 * @param {boolean} params.isMedicalExpense - Whether expense is medical type
 * @param {boolean} params.isCreditCard - Whether payment method is credit card
 * @param {boolean} params.isTaxDeductible - Whether expense is tax deductible
 * @param {Array} params.selectedPeople - Selected people for medical expenses
 * @param {boolean} params.insuranceEligible - Insurance eligibility flag
 * @param {string} params.claimStatus - Insurance claim status
 * @param {string} params.originalCost - Original cost for insurance
 * @param {string} params.genericOriginalCost - Original cost for generic reimbursement
 * @param {boolean} params.showGenericReimbursementUI - Whether to show generic reimbursement UI
 * @param {string} params.postedDate - Posted date for credit card expenses
 * @param {number} params.futureMonths - Number of future months to replicate
 * @param {Array} params.invoiceFiles - Invoice files to upload
 * @param {Function} params.setInvoices - Invoices setter
 * @param {Function} params.setInvoiceFiles - Invoice files setter
 * @param {Function} params.setSelectedPeople - Selected people setter
 * @param {Function} params.setExpensePeople - Expense people setter
 * @param {Function} params.setInsuranceEligible - Insurance eligible setter
 * @param {Function} params.setClaimStatus - Claim status setter
 * @param {Function} params.setOriginalCost - Original cost setter
 * @param {Function} params.setInsuranceValidationError - Insurance validation error setter
 * @param {Function} params.setGenericOriginalCost - Generic original cost setter
 * @param {Function} params.setGenericReimbursementError - Generic reimbursement error setter
 * @param {Function} params.setPostedDate - Posted date setter
 * @param {Function} params.setPostedDateError - Posted date error setter
 * @param {Function} params.setFutureMonths - Future months setter
 * @param {Function} params.resetSectionStates - Reset section expansion states
 * @param {Function} params.createExpense - API function to create expense
 * @param {Function} params.updateExpense - API function to update expense
 * @param {Function} params.saveLastUsed - Save last used payment method
 * @param {Function} params.getTodayLocalDate - Get today's date in local format
 * @param {Function} params.calculateFutureDatePreview - Calculate future date preview text
 * @returns {Object} Submission handlers
 * @returns {Function} submitForm - Submit the form with all data
 */
function useFormSubmission({
  formData,
  setFormData,
  isEditing,
  expense,
  isMedicalExpense,
  isCreditCard,
  isTaxDeductible,
  selectedPeople,
  insuranceEligible,
  claimStatus,
  originalCost,
  genericOriginalCost,
  showGenericReimbursementUI,
  postedDate,
  futureMonths,
  invoiceFiles,
  setInvoices,
  setInvoiceFiles,
  setSelectedPeople,
  setExpensePeople,
  setInsuranceEligible,
  setClaimStatus,
  setOriginalCost,
  setInsuranceValidationError,
  setGenericOriginalCost,
  setGenericReimbursementError,
  setPostedDate,
  setPostedDateError,
  setFutureMonths,
  resetSectionStates,
  createExpense,
  updateExpense,
  saveLastUsed,
  getTodayLocalDate,
  calculateFutureDatePreview
}) {
  /**
   * Assemble expense form data with conditional fields
   * @returns {Object} Complete expense data for API submission
   */
  const assembleExpenseData = () => {
    return {
      ...formData,
      // Add posted_date for credit card expenses (null or empty string becomes null)
      posted_date: isCreditCard && postedDate ? postedDate : null,
      // Add insurance fields for medical expenses
      ...(isMedicalExpense && {
        insurance_eligible: insuranceEligible,
        claim_status: insuranceEligible ? claimStatus : null,
        original_cost: insuranceEligible && originalCost ? parseFloat(originalCost) : null
      }),
      // Add original_cost for non-medical expenses (generic reimbursement)
      // Amount = net, original_cost = charged amount
      ...(showGenericReimbursementUI && genericOriginalCost && parseFloat(genericOriginalCost) > 0 && {
        original_cost: parseFloat(genericOriginalCost)
      }),
      // Explicitly clear original_cost when it's removed
      ...(showGenericReimbursementUI && !genericOriginalCost && isEditing && expense?.original_cost && {
        original_cost: null
      })
    };
  };

  /**
   * Prepare people allocations for medical expenses
   * @returns {Array|null} People allocations or null if not applicable
   */
  const preparePeopleAllocations = () => {
    if (!isMedicalExpense || selectedPeople.length === 0) {
      return null;
    }

    if (selectedPeople.length === 1) {
      // Single person - assign full amount (and original_amount for insurance)
      return [{
        personId: selectedPeople[0].id,
        amount: parseFloat(formData.amount),
        originalAmount: insuranceEligible && originalCost ? parseFloat(originalCost) : null
      }];
    } else {
      // Multiple people - use allocated amounts (with original_amount for insurance)
      return selectedPeople.map(person => ({
        personId: person.id,
        amount: person.amount,
        originalAmount: person.originalAmount || null
      }));
    }
  };

  /**
   * Upload invoice files for the expense
   * @param {number} expenseId - ID of the expense to attach invoices to
   * @returns {Promise<Array>} Array of successfully uploaded invoices
   */
  const uploadInvoices = async (expenseId) => {
    const uploadedInvoices = [];
    
    for (const item of invoiceFiles) {
      try {
        const formData = new FormData();
        formData.append('invoice', item.file);
        formData.append('expenseId', expenseId.toString());
        
        // Add personId if assigned
        if (item.personId) {
          formData.append('personId', item.personId.toString());
        }

        const response = await fetch(API_ENDPOINTS.INVOICE_UPLOAD, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Invoice upload failed');
        }

        const invoiceResult = await response.json();
        if (invoiceResult.success && invoiceResult.invoice) {
          uploadedInvoices.push(invoiceResult.invoice);
        }
      } catch (invoiceError) {
        logger.error('Invoice upload failed:', invoiceError);
        // Continue with other files even if one fails
      }
    }
    
    return uploadedInvoices;
  };

  /**
   * Reset form to initial state after successful submission
   * @param {string} lastPaymentMethodId - Last used payment method ID to preserve
   * @param {Function} setIsCategorySuggested - Function to reset category suggestion indicator
   */
  const resetForm = (lastPaymentMethodId, setIsCategorySuggested) => {
    // Reset suggestion indicator first to prevent any pending blur handlers from triggering
    setIsCategorySuggested(false);
    
    setFormData({
      date: getTodayLocalDate(),
      place: '',
      notes: '',
      amount: '',
      type: 'Other',
      payment_method_id: lastPaymentMethodId // Pre-select last used payment method for next entry
    });

    // Clear people selection and invoice state
    setSelectedPeople([]);
    setInvoices([]);
    setInvoiceFiles([]);
    setExpensePeople([]);
    
    // Reset insurance fields
    setInsuranceEligible(false);
    setClaimStatus('not_claimed');
    setOriginalCost('');
    setInsuranceValidationError('');
    
    // Reset generic original cost fields
    setGenericOriginalCost('');
    setGenericReimbursementError('');
    
    // Reset posted date fields
    setPostedDate('');
    setPostedDateError('');
    
    // Reset future months to 0
    setFutureMonths(0);
    
    // Reset section expansion states to defaults
    resetSectionStates();
  };

  /**
   * Submit the form with all data
   * @param {Function} onExpenseAdded - Callback when expense is added/updated
   * @param {Array} invoices - Current invoices state
   * @param {Function} setIsCategorySuggested - Function to reset category suggestion indicator
   * @returns {Promise<Object>} Result object with success status, message, and expense data
   */
  const submitForm = async (onExpenseAdded, invoices, setIsCategorySuggested) => {
    try {
      // Assemble expense data
      const expenseFormData = assembleExpenseData();
      
      // Prepare people allocations
      const peopleAllocations = preparePeopleAllocations();

      let newExpense;
      let futureExpensesResult = [];
      
      if (isEditing) {
        // Update existing expense with optional future months
        const result = await updateExpense(expense.id, expenseFormData, peopleAllocations, futureMonths);
        // Handle response format - may include futureExpenses array
        if (result.expense) {
          newExpense = result.expense;
          futureExpensesResult = result.futureExpenses || [];
        } else {
          newExpense = result;
        }
      } else {
        // Create new expense with optional future months
        const result = await createExpense(expenseFormData, peopleAllocations, futureMonths);
        // Handle response format - may include futureExpenses array
        if (result.expense) {
          newExpense = result.expense;
          futureExpensesResult = result.futureExpenses || [];
        } else {
          newExpense = result;
        }
      }

      // Handle invoice upload for new expenses or when invoice files are selected (medical or donation)
      if (isTaxDeductible && invoiceFiles.length > 0 && newExpense.id) {
        const uploadedInvoices = await uploadInvoices(newExpense.id);
        
        if (uploadedInvoices.length > 0) {
          setInvoices(uploadedInvoices);
          newExpense.invoices = uploadedInvoices;
          newExpense.hasInvoice = true;
          newExpense.invoiceCount = uploadedInvoices.length;
        }
        
        if (uploadedInvoices.length < invoiceFiles.length) {
          return {
            success: true,
            message: `Expense ${isEditing ? 'updated' : 'added'} successfully, but ${invoiceFiles.length - uploadedInvoices.length} invoice(s) failed to upload`,
            type: 'warning',
            expense: newExpense,
            futureExpenses: futureExpensesResult
          };
        }
      }
      
      // Save payment method for next expense entry
      if (!isEditing && formData.payment_method_id) {
        saveLastUsed(formData.payment_method_id);
      }
      
      // Build success message including future expenses info
      let successText = `Expense ${isEditing ? 'updated' : 'added'} successfully!`;
      if (futureExpensesResult.length > 0) {
        const datePreview = calculateFutureDatePreview(formData.date, futureExpensesResult.length);
        successText = `Expense ${isEditing ? 'updated' : 'added'} and added to ${futureExpensesResult.length} future month${futureExpensesResult.length > 1 ? 's' : ''} ${datePreview}`;
      }
      
      if (!isEditing) {
        // Clear form and reset suggestion indicator, but keep the last used payment method
        const lastPaymentMethodId = formData.payment_method_id;
        resetForm(lastPaymentMethodId, setIsCategorySuggested);
      }

      // Notify parent component
      // When editing, include the current invoice state so the expense list updates correctly
      if (onExpenseAdded) {
        const expenseToReturn = { ...newExpense };
        // Include invoice info from current state (for edits where invoices were uploaded via InvoiceUpload)
        if (isEditing && invoices.length > 0) {
          expenseToReturn.hasInvoice = true;
          expenseToReturn.invoiceCount = invoices.length;
        }
        onExpenseAdded(expenseToReturn);
      }

      return {
        success: true,
        message: successText,
        type: 'success',
        expense: newExpense,
        futureExpenses: futureExpensesResult
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        type: 'error'
      };
    }
  };

  return {
    submitForm,
    assembleExpenseData,
    preparePeopleAllocations,
    uploadInvoices,
    resetForm
  };
}

export default useFormSubmission;
