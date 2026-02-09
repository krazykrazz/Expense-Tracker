import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { getTodayLocalDate } from '../utils/formatters';
import { getCategories } from '../services/categoriesApi';
import { getPeople } from '../services/peopleApi';
import { createExpense, updateExpense, getExpenseWithPeople } from '../services/expenseApi';
import { updateInvoicePersonLink } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';
import useExpenseFormValidation from '../hooks/useExpenseFormValidation';
import usePaymentMethods from '../hooks/usePaymentMethods';
import useInvoiceManagement from '../hooks/useInvoiceManagement';
import { useFormSectionState } from '../hooks/useFormSectionState';
import usePlaceAutocomplete from '../hooks/usePlaceAutocomplete';
import useCategorySuggestion from '../hooks/useCategorySuggestion';
import useFormSubmission from '../hooks/useFormSubmission';
import {
  calculateFutureDatePreview,
  calculateAdvancedOptionsBadge,
  calculateReimbursementBadge,
  calculateInsuranceBadge,
  calculatePeopleBadge,
  calculateInvoiceBadge
} from '../hooks/useBadgeCalculations';
import PersonAllocationModal from './PersonAllocationModal';
import InvoiceUpload from './InvoiceUpload';
import CollapsibleSection from './CollapsibleSection';
import HelpTooltip from './HelpTooltip';
import './ExpenseForm.css';

const logger = createLogger('ExpenseForm');

// Help text for tooltips (Requirements 3.2, 3.3, 3.4)
const HELP_TEXT = {
  postedDate: "For credit card expenses, set when the transaction posts to your statement. Leave empty to use the transaction date for balance calculations.",
  futureMonths: "Automatically create this expense for multiple future months. Useful for recurring expenses like subscriptions or monthly bills.",
  originalCost: "If you were reimbursed for this expense, enter the full amount charged here. The Amount field above should be your out-of-pocket cost.",
  insuranceEligible: "Check this if you plan to submit or have submitted this expense to insurance for reimbursement.",
  insuranceOriginalCost: "The full cost before insurance coverage. Your out-of-pocket amount is set in the Amount field above.",
  claimStatus: "Track the status of your insurance claim: Not Claimed (not yet submitted), In Progress (submitted and pending), Paid (reimbursed), or Denied (rejected).",
  peopleAssignment: "Assign this medical expense to one or more family members. For multiple people, you can allocate specific amounts to each person.",
  invoiceAttachment: "Upload PDF invoices or receipts for tax-deductible expenses. For medical expenses, you can link invoices to specific family members."
};

// Future months dropdown options (Requirements 1.1, 1.2, 2.1, 2.2)
const FUTURE_MONTHS_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 11, label: "11" },
  { value: 12, label: "12" }
];

const ExpenseForm = ({ onExpenseAdded, people: propPeople, expense = null }) => {
  const isEditing = !!expense;
  
  // Use extracted validation hook (Requirements 4.9, 7.1)
  const { validate } = useExpenseFormValidation();
  
  const [formData, setFormData] = useState({
    date: expense?.date || getTodayLocalDate(),
    place: expense?.place || '',
    notes: expense?.notes || '',
    amount: expense?.amount?.toString() || '',
    type: expense?.type || 'Other',
    // Store payment_method_id instead of method string
    payment_method_id: expense?.payment_method_id || null
  });

  // Posted date state for credit card expenses (Requirements 1.5, 6.3)
  // Initialize from expense prop when editing
  const [postedDate, setPostedDate] = useState(expense?.posted_date || '');

  // Use extracted payment methods hook (Requirements 1.7, 7.1)
  const {
    paymentMethods,
    loading: paymentMethodsLoading,
    error: paymentMethodsError,
    inactivePaymentMethod: editingInactivePaymentMethod,
    getLastUsedId,
    saveLastUsed,
    defaultPaymentMethodId,
  } = usePaymentMethods({ expensePaymentMethodId: expense?.payment_method_id || null });

  // Invoice management hook for fetching invoices (Requirements 3.6, 7.1)
  const { fetchInvoices: hookFetchInvoices } = useInvoiceManagement();

  // Place autocomplete hook (Requirements 3.4, 3.5)
  const {
    places,
    filteredPlaces,
    showSuggestions,
    setShowSuggestions,
    filterPlaces,
    fetchPlaces
  } = usePlaceAutocomplete();

  // Section expansion state management (Requirements 1.3, 11.2, 11.5)
  // Calculate initial expansion states based on mode and existing data
  const calculateInitialSectionStates = () => {
    if (isEditing) {
      // Edit mode: expand sections with data
      return {
        advancedOptions: (expense?.future_months > 0) || !!expense?.posted_date,
        reimbursement: !!expense?.original_cost && expense?.type !== 'Tax - Medical',
        insurance: expense?.insurance_eligible === 1,
        people: expense?.people?.length > 0,
        invoices: expense?.invoices?.length > 0
      };
    } else {
      // Create mode: all sections collapsed
      return {
        advancedOptions: false,
        reimbursement: false,
        insurance: false,
        people: false,
        invoices: false
      };
    }
  };

  const {
    sectionStates,
    toggleSection,
    resetStates: resetSectionStates
  } = useFormSectionState(
    isEditing ? 'edit' : 'create',
    calculateInitialSectionStates()
  );

  // Insurance tracking state for medical expenses (Requirements 1.1, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.6)
  const [insuranceEligible, setInsuranceEligible] = useState(expense?.insurance_eligible === 1 || false);
  const [claimStatus, setClaimStatus] = useState(expense?.claim_status || 'not_claimed');
  const [originalCost, setOriginalCost] = useState(expense?.original_cost?.toString() || '');
  const [insuranceValidationError, setInsuranceValidationError] = useState('');

  // Generic reimbursement state for non-medical expenses (Requirements 1.1, 6.1)
  // Now uses same pattern as medical expenses: Amount = net, Original Cost = charged amount
  // Initialize original cost from expense when editing (if not medical)
  const calculateInitialGenericOriginalCost = () => {
    if (!expense?.original_cost || expense?.type === 'Tax - Medical') return '';
    return expense.original_cost.toString();
  };
  const [genericOriginalCost, setGenericOriginalCost] = useState(calculateInitialGenericOriginalCost());
  const [genericReimbursementError, setGenericReimbursementError] = useState('');
  
  // Posted date validation error state (Requirements 4.5)
  const [postedDateError, setPostedDateError] = useState('');

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typeOptions, setTypeOptions] = useState(['Other']); // Default fallback
  
  // People selection state for medical expenses
  // Use prop people if provided, otherwise fetch locally
  const [localPeople, setLocalPeople] = useState([]);
  const people = propPeople || localPeople;
  const [selectedPeople, setSelectedPeople] = useState(expense?.people || []);
  const [showPersonAllocation, setShowPersonAllocation] = useState(false);

  // Invoice state for medical expenses (Requirements 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5)
  // Changed to support multiple invoices per expense with person assignments
  const [invoices, setInvoices] = useState(expense?.invoices || []);
  const [invoiceFiles, setInvoiceFiles] = useState([]); // Array of {file, personId} objects
  
  // People assigned to this expense (for invoice person linking)
  const [expensePeople, setExpensePeople] = useState([]);

  // Future months state for recurring expense creation (Requirements 1.1, 1.2, 1.7, 2.1, 2.2)
  const [futureMonths, setFutureMonths] = useState(0);

  // Refs for focus management and form state
  const placeInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const isSubmittingRef = useRef(false); // Track if form is being submitted to prevent blur handler interference
  const justSelectedFromDropdownRef = useRef(false); // Track if we just selected from dropdown to prevent blur handler
  const timeoutIdsRef = useRef([]); // Track all timeouts for cleanup on unmount

  // Helper to create tracked timeouts that get cleaned up on unmount
  const setTrackedTimeout = (callback, delay) => {
    const timeoutId = setTimeout(callback, delay);
    timeoutIdsRef.current.push(timeoutId);
    return timeoutId;
  };

  // Category suggestion hook (Requirements 3.3, 3.5)
  // Must be called after refs are initialized
  const {
    isCategorySuggested,
    setIsCategorySuggested,
    fetchAndApply: fetchAndApplyCategorySuggestion,
    handlePlaceSelect: hookHandlePlaceSelect,
    handlePlaceBlur: hookHandlePlaceBlur
  } = useCategorySuggestion({
    setFormData,
    amountInputRef,
    isSubmittingRef,
    justSelectedFromDropdownRef,
    setTrackedTimeout
  });

  // Form submission hook (Requirements 3.2, 3.6)
  const { submitForm } = useFormSubmission({
    formData,
    setFormData,
    isEditing,
    expense,
    isMedicalExpense: formData.type === 'Tax - Medical',
    isCreditCard: (() => {
      const selectedMethod = paymentMethods.find(pm => pm.id === formData.payment_method_id);
      return selectedMethod?.type === 'credit_card';
    })(),
    isTaxDeductible: formData.type === 'Tax - Medical' || formData.type === 'Tax - Donation',
    selectedPeople,
    insuranceEligible,
    claimStatus,
    originalCost,
    genericOriginalCost,
    showGenericReimbursementUI: formData.type !== 'Tax - Medical' && formData.type !== 'Tax - Donation',
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
  });

  // Fetch categories, people, and invoice data on component mount
  useEffect(() => {
    let isMounted = true;

    const fetchCategoriesData = async () => {
      try {
        const categories = await getCategories();
        if (isMounted && categories) {
          setTypeOptions(categories);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to fetch categories:', error);
        }
        // Keep default fallback value
      }
    };

    const fetchPeopleData = async () => {
      // Only fetch if people not provided via props
      if (!propPeople) {
        try {
          const peopleData = await getPeople();
          if (isMounted) {
            setLocalPeople(peopleData);
          }
        } catch (error) {
          if (isMounted) {
            logger.error('Failed to fetch people:', error);
          }
        }
      }
    };

    const fetchInvoiceData = async () => {
      // Fetch all invoices if editing a tax-deductible expense (medical or donation)
      if (isEditing && expense?.id && (expense?.type === 'Tax - Medical' || expense?.type === 'Tax - Donation')) {
        try {
          const invoicesData = await hookFetchInvoices(expense.id);
          if (isMounted && invoicesData) {
            setInvoices(invoicesData);
          }
        } catch (error) {
          if (isMounted) {
            logger.error('Failed to fetch invoice data:', error);
          }
        }
      }
    };

    // Fetch people assigned to this expense (for invoice person linking) - medical only
    const fetchExpensePeople = async () => {
      if (isEditing && expense?.id && expense?.type === 'Tax - Medical') {
        try {
          const expenseData = await getExpenseWithPeople(expense.id);
          if (isMounted && expenseData?.people) {
            setExpensePeople(expenseData.people);
            // Also update selectedPeople if not already set
            if (selectedPeople.length === 0 && expenseData.people.length > 0) {
              setSelectedPeople(expenseData.people);
            }
          }
        } catch (error) {
          if (isMounted) {
            logger.error('Failed to fetch expense people:', error);
          }
        }
      }
    };

    fetchCategoriesData();
    fetchPeopleData();
    fetchInvoiceData();
    fetchExpensePeople();

    // Set initial focus to Place field (Requirements 1.1)
    if (placeInputRef.current && !isEditing) {
      placeInputRef.current.focus();
    }

    return () => {
      isMounted = false;
      // Clear all tracked timeouts to prevent state updates after unmount
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, [isEditing, expense?.id, expense?.type, expense?.payment_method_id]);

  // Set initial payment method when hook data loads (not editing mode)
  useEffect(() => {
    if (paymentMethodsLoading || isEditing || formData.payment_method_id) return;
    
    if (paymentMethods.length > 0) {
      const lastUsedId = getLastUsedId(paymentMethods);
      if (lastUsedId) {
        setFormData(prev => ({ ...prev, payment_method_id: lastUsedId }));
      } else {
        // Default to first available method (usually Cash with ID 1)
        const defaultMethod = paymentMethods.find(m => m.id === defaultPaymentMethodId) || paymentMethods[0];
        setFormData(prev => ({ ...prev, payment_method_id: defaultMethod.id }));
      }
    }
  }, [paymentMethods, paymentMethodsLoading, isEditing, getLastUsedId, defaultPaymentMethodId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Handle payment_method_id as a number
    if (name === 'payment_method_id') {
      const newPaymentMethodId = value ? parseInt(value, 10) : null;
      setFormData(prev => ({
        ...prev,
        [name]: newPaymentMethodId
      }));
      
      // Clear posted_date when switching away from credit card (Requirements 6.4)
      const newPaymentMethod = paymentMethods.find(pm => pm.id === newPaymentMethodId);
      if (!newPaymentMethod || newPaymentMethod.type !== 'credit_card') {
        setPostedDate('');
        setPostedDateError('');
      }
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Handle place autocomplete
    if (name === 'place') {
      // Reset suggestion indicator when place is cleared
      if (value.trim() === '') {
        setIsCategorySuggested(false);
      }
      // Use hook's filterPlaces method
      filterPlaces(value);
    }

    // Validate insurance amounts when amount changes (Requirement 3.5)
    if (name === 'amount' && insuranceEligible) {
      validateInsuranceAmounts(value, originalCost);
    }
    
    // Re-validate generic original cost when amount changes (Requirements 1.3)
    // Amount (net) cannot exceed original cost (charged amount)
    if (name === 'amount' && genericOriginalCost) {
      const origCostNum = parseFloat(genericOriginalCost);
      const amountNum = parseFloat(value);
      
      if (!isNaN(origCostNum) && !isNaN(amountNum)) {
        if (amountNum > origCostNum) {
          setGenericReimbursementError('Net amount cannot exceed original cost');
        } else {
          setGenericReimbursementError('');
        }
      }
    }
    
    // Re-validate posted_date when transaction date changes (Requirements 4.5)
    if (name === 'date' && postedDate && value && postedDate < value) {
      setPostedDateError('Posted date cannot be before transaction date');
    } else if (name === 'date') {
      setPostedDateError('');
    }

    // Clear suggestion indicator when user manually changes category (Requirements 2.4)
    if (name === 'type') {
      setIsCategorySuggested(false);
      // Clear people selection when changing away from medical expenses
      if (value !== 'Tax - Medical') {
        setSelectedPeople([]);
        setExpensePeople([]);
        // Reset insurance fields when changing away from medical expenses
        setInsuranceEligible(false);
        setClaimStatus('not_claimed');
        setOriginalCost('');
        setInsuranceValidationError('');
      }
      // Clear generic original cost when changing to medical expenses (Requirements 1.2)
      // Medical expenses use their own insurance tracking UI
      if (value === 'Tax - Medical') {
        setGenericOriginalCost('');
        setGenericReimbursementError('');
      }
      // Clear invoices when changing away from tax-deductible expenses
      if (value !== 'Tax - Medical' && value !== 'Tax - Donation') {
        setInvoices([]);
        setInvoiceFiles([]);
      }
    }
  };

  // Handle people selection for medical expenses
  const handlePeopleChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => ({
      id: parseInt(option.value),
      name: option.text
    }));
    setSelectedPeople(selectedOptions);
  };

  // Handle insurance eligibility toggle (Requirements 1.1, 1.2, 1.3, 2.4, 2.5)
  const handleInsuranceEligibleChange = (e) => {
    const eligible = e.target.checked;
    setInsuranceEligible(eligible);
    
    if (eligible) {
      // Set defaults when enabling insurance (Requirements 1.2, 2.4, 2.5)
      setClaimStatus('not_claimed');
      // Set original_cost to current amount if not already set
      if (!originalCost && formData.amount) {
        setOriginalCost(formData.amount);
      }
    } else {
      // Clear insurance fields when disabling
      setClaimStatus('not_claimed');
      setOriginalCost('');
      setInsuranceValidationError('');
    }
  };

  // Handle original cost change (Requirements 3.1, 3.5)
  const handleOriginalCostChange = (e) => {
    const value = e.target.value;
    setOriginalCost(value);
    
    // Validate amount <= original_cost (Requirement 3.5)
    validateInsuranceAmounts(formData.amount, value);
  };

  // Handle generic original cost change for non-medical expenses (Requirements 1.1, 1.3, 6.1)
  // Matches medical expense pattern: Amount = net, Original Cost = charged amount
  const handleGenericOriginalCostChange = (e) => {
    const value = e.target.value;
    setGenericOriginalCost(value);
    
    // Clear error when value changes
    setGenericReimbursementError('');
    
    // Validate amount (net) does not exceed original cost (Requirement 1.3)
    if (value && formData.amount) {
      const origCostNum = parseFloat(value);
      const amountNum = parseFloat(formData.amount);
      
      if (!isNaN(origCostNum) && !isNaN(amountNum)) {
        if (origCostNum < 0) {
          setGenericReimbursementError('Original cost must be a non-negative number');
        } else if (amountNum > origCostNum) {
          setGenericReimbursementError('Net amount cannot exceed original cost');
        }
      }
    }
  };

  // Calculate generic reimbursement (original_cost - amount)
  const calculateGenericReimbursement = () => {
    if (!genericOriginalCost || !formData.amount) return 0;
    const origCostNum = parseFloat(genericOriginalCost) || 0;
    const amountNum = parseFloat(formData.amount) || 0;
    return Math.max(0, origCostNum - amountNum);
  };

  // Handle claim status change (Requirements 2.1, 2.2, 2.3)
  const handleClaimStatusChange = (e) => {
    const status = e.target.value;
    setClaimStatus(status);
    // Clear validation error when status changes
    setInsuranceValidationError('');
  };

  // Handle posted date change for credit card expenses (Requirements 1.5, 6.3)
  const handlePostedDateChange = (e) => {
    const value = e.target.value;
    setPostedDate(value);
    
    // Clear validation error when value changes
    setPostedDateError('');
    
    // Validate posted_date >= date if both are set (Requirements 4.5)
    if (value && formData.date && value < formData.date) {
      setPostedDateError('Posted date cannot be before transaction date');
    }
  };

  // Validate insurance amounts (Requirement 3.5)
  const validateInsuranceAmounts = (amount, origCost) => {
    if (!insuranceEligible) {
      setInsuranceValidationError('');
      return true;
    }
    
    const amountNum = parseFloat(amount) || 0;
    const origCostNum = parseFloat(origCost) || 0;
    
    if (origCostNum > 0 && amountNum > origCostNum) {
      setInsuranceValidationError('Out-of-pocket amount cannot exceed original cost');
      return false;
    }
    
    setInsuranceValidationError('');
    return true;
  };

  // Calculate reimbursement (Requirement 3.6)
  const calculateReimbursement = () => {
    if (!insuranceEligible || !originalCost || !formData.amount) return 0;
    const origCostNum = parseFloat(originalCost) || 0;
    const amountNum = parseFloat(formData.amount) || 0;
    return Math.max(0, origCostNum - amountNum);
  };

  // Handle person allocation modal save
  const handlePersonAllocation = (allocations) => {
    setShowPersonAllocation(false);
    // Store allocations for form submission
    setSelectedPeople(allocations);
  };

  // Check if current expense type is medical or donation (tax-deductible)
  const isMedicalExpense = formData.type === 'Tax - Medical';
  const isDonationExpense = formData.type === 'Tax - Donation';
  const isTaxDeductible = isMedicalExpense || isDonationExpense;
  
  // Check if selected payment method is a credit card (Requirements 1.1, 6.1, 6.4, 6.5)
  const selectedPaymentMethod = paymentMethods.find(pm => pm.id === formData.payment_method_id) 
    || editingInactivePaymentMethod;
  const isCreditCard = selectedPaymentMethod?.type === 'credit_card';

  // Determine when to show generic reimbursement UI (Requirements 1.1, 1.2)
  // Show for non-medical expenses, OR medical expenses without insurance tracking enabled
  const showMedicalInsuranceUI = isMedicalExpense && insuranceEligible;
  const showGenericReimbursementUI = !showMedicalInsuranceUI && !isMedicalExpense;

  // Handle invoice upload success (Requirements 1.1, 1.2, 2.1)
  // Updated to support multiple invoices
  const handleInvoiceUploaded = (invoice) => {
    setInvoices(prev => [...prev, invoice]);
    setMessage({ text: 'Invoice uploaded successfully!', type: 'success' });
    
    // Clear success message after 3 seconds
    setTrackedTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000);
  };

  // Handle invoice deletion (Requirements 2.3, 2.4)
  // Updated to support deleting specific invoice by ID
  const handleInvoiceDeleted = (invoiceId) => {
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setMessage({ text: 'Invoice deleted successfully!', type: 'success' });
    
    // Clear success message after 3 seconds
    setTrackedTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000);
  };

  // Handle person link updated for an invoice
  const handlePersonLinkUpdated = async (invoiceId, personId) => {
    try {
      const result = await updateInvoicePersonLink(invoiceId, personId);
      if (result.success) {
        // Update the invoice in local state
        setInvoices(prev => prev.map(inv => 
          inv.id === invoiceId 
            ? { ...inv, personId, personName: result.invoice?.personName || null }
            : inv
        ));
        setMessage({ text: 'Invoice person link updated!', type: 'success' });
        
        // Clear success message after 3 seconds
        setTrackedTimeout(() => {
          setMessage({ text: '', type: '' });
        }, 3000);
      }
    } catch (error) {
      logger.error('Failed to update invoice person link:', error);
      setMessage({ text: `Failed to update person link: ${error.message}`, type: 'error' });
    }
  };

  // Fetch category suggestion for a place and auto-select if available (Requirements 1.3, 1.4, 2.1, 2.3)
  // Now handled by useCategorySuggestion hook

  // Handle place selection from dropdown (Requirements 1.3, 2.1, 3.1)
  // Wrapper to pass additional dependencies to hook function
  const handlePlaceSelect = async (place) => {
    await hookHandlePlaceSelect(place, setShowSuggestions, (places) => {
      // The hook expects setFilteredPlaces but we don't expose it from usePlaceAutocomplete
      // Instead, we can just hide suggestions which is the main goal
    });
  };

  // Handle place field blur - fetch suggestion if place was typed manually (Requirements 1.3)
  // Wrapper to pass additional dependencies to hook function
  const handlePlaceBlur = async () => {
    await hookHandlePlaceBlur(formData.place, setShowSuggestions);
  };

  const validateForm = () => {
    const result = validate(formData, {
      isMedicalExpense,
      insuranceEligible,
      originalCost,
      isCreditCard,
      postedDate,
      showGenericReimbursementUI,
      genericOriginalCost,
    });

    if (!result.valid && result.errors.length > 0) {
      const firstError = result.errors[0];
      setMessage({ text: firstError.message, type: 'error' });

      // Preserve side-effect error state for specific fields
      if (firstError.field === 'postedDate') {
        setPostedDateError(firstError.message);
      }
      if (firstError.field === 'genericOriginalCost') {
        setGenericReimbursementError(firstError.message);
      }

      // Auto-expand sections containing errors (Requirements 2.4, 12.3)
      autoExpandSectionsWithErrors(result.errors);

      return false;
    }

    return true;
  };

  /**
   * Auto-expand sections containing validation errors and focus first error field
   * Requirements 2.4, 12.3
   * @param {Array} errors - Array of error objects with field property
   */
  const autoExpandSectionsWithErrors = (errors) => {
    if (!errors || errors.length === 0) return;

    // Map error fields to their containing sections
    const fieldToSection = {
      'postedDate': 'advancedOptions',
      'genericOriginalCost': 'reimbursement',
      'originalCost': 'insurance',
      'claimStatus': 'insurance',
      'people': 'people',
      'invoice': 'invoices'
    };

    // Collect sections that need to be expanded
    const sectionsToExpand = new Set();
    errors.forEach(error => {
      const section = fieldToSection[error.field];
      if (section && !sectionStates[section]) {
        sectionsToExpand.add(section);
      }
    });

    // Expand sections containing errors
    if (sectionsToExpand.size > 0) {
      sectionsToExpand.forEach(section => {
        toggleSection(section);
      });

      // Focus first field with error after a short delay to allow section expansion
      setTrackedTimeout(() => {
        const firstError = errors[0];
        const fieldId = getFieldIdFromErrorField(firstError.field);
        if (fieldId) {
          const element = document.getElementById(fieldId);
          if (element) {
            element.focus();
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
    }
  };

  /**
   * Map error field names to DOM element IDs
   * @param {string} field - Error field name
   * @returns {string|null} - DOM element ID or null
   */
  const getFieldIdFromErrorField = (field) => {
    const fieldIdMap = {
      'date': 'date',
      'amount': 'amount',
      'type': 'type',
      'payment_method_id': 'payment_method_id',
      'place': 'place',
      'notes': 'notes',
      'postedDate': 'posted_date',
      'genericOriginalCost': 'genericOriginalCost',
      'originalCost': 'originalCost',
      'claimStatus': 'claimStatus',
      'people': 'people',
      'invoice': 'invoice-file'
    };
    return fieldIdMap[field] || null;
  };

  /**
   * Check if a section has validation errors
   * Requirements 2.4, 12.3
   * @param {string} sectionName - Name of the section
   * @returns {boolean} - True if section has errors
   */
  const sectionHasError = (sectionName) => {
    const sectionErrorFields = {
      'advancedOptions': ['postedDate'],
      'reimbursement': ['genericOriginalCost'],
      'insurance': ['originalCost', 'claimStatus'],
      'people': ['people'],
      'invoices': ['invoice']
    };

    const errorFields = sectionErrorFields[sectionName] || [];
    
    // Check for posted date error
    if (errorFields.includes('postedDate') && postedDateError) {
      return true;
    }
    
    // Check for generic reimbursement error
    if (errorFields.includes('genericOriginalCost') && genericReimbursementError) {
      return true;
    }
    
    // Check for insurance validation error
    if (errorFields.includes('originalCost') && insuranceValidationError) {
      return true;
    }
    
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!validateForm()) {
      return;
    }

    // For medical expenses with multiple people, show allocation modal
    if (isMedicalExpense && selectedPeople.length > 1 && !selectedPeople[0].amount) {
      setShowPersonAllocation(true);
      return;
    }

    setIsSubmitting(true);
    isSubmittingRef.current = true; // Mark that we're submitting to prevent blur handler

    try {
      // Use the form submission hook to handle all submission logic
      const result = await submitForm(onExpenseAdded, invoices, setIsCategorySuggested);
      
      setMessage({ 
        text: result.message, 
        type: result.type 
      });
      
      // Clear success message after 3 seconds
      if (result.success) {
        setTrackedTimeout(() => {
          setMessage({ text: '', type: '' });
        }, 3000);
      }

    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
      // Reset submitting ref after a delay to ensure blur handler has completed
      setTrackedTimeout(() => {
        isSubmittingRef.current = false;
      }, 300);
    }
  };

  return (
    <div className="expense-form-container">
      <h2>{isEditing ? 'Edit Expense' : 'Add New Expense'}</h2>
      <form onSubmit={handleSubmit} className="expense-form">
        {/* Row 1: Date and Place - Place has initial focus (Requirements 1.1, 3.2) */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="date">Date *</label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group autocomplete-wrapper">
            <label htmlFor="place">Place</label>
            <input
              type="text"
              id="place"
              name="place"
              ref={placeInputRef}
              value={formData.place}
              onChange={handleChange}
              onFocus={() => {
                if (formData.place && filteredPlaces.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={handlePlaceBlur}
              maxLength="200"
              placeholder="Where was this expense?"
              autoComplete="off"
            />
            {showSuggestions && filteredPlaces.length > 0 && (
              <ul className="autocomplete-suggestions">
                {filteredPlaces.slice(0, 10).map((place, index) => (
                  <li
                    key={index}
                    onClick={() => handlePlaceSelect(place)}
                    className="autocomplete-item"
                  >
                    {place}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Row 2: Type and Amount - Amount receives focus after place entry (Requirements 3.1, 3.2) */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="type">
              Type *
              {isCategorySuggested && (
                <span className="suggestion-indicator" title="Auto-suggested based on place history">
                  ✨ suggested
                </span>
              )}
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className={isCategorySuggested ? 'suggested-category' : ''}
              required
            >
              {typeOptions.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount *</label>
            <input
              type="number"
              id="amount"
              name="amount"
              ref={amountInputRef}
              value={formData.amount}
              onChange={handleChange}
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        {/* Row 3: Payment Method (Requirements 3.2, 4.1, 4.2, 4.5) */}
        <div className="form-group">
          <label htmlFor="payment_method_id">
            Payment Method *
            {editingInactivePaymentMethod && (
              <span className="inactive-warning" title="This payment method is inactive">
                ⚠️ inactive
              </span>
            )}
          </label>
          {paymentMethodsLoading ? (
            <div className="payment-methods-loading">Loading payment methods...</div>
          ) : paymentMethodsError ? (
            <div className="payment-methods-error">{paymentMethodsError}</div>
          ) : paymentMethods.length === 0 && !editingInactivePaymentMethod ? (
            <div className="payment-methods-empty">
              <span>No payment methods configured.</span>
              <button 
                type="button" 
                className="create-payment-method-link"
                onClick={() => {
                  // Dispatch event to open payment methods modal
                  window.dispatchEvent(new CustomEvent('openPaymentMethods'));
                }}
              >
                Create one
              </button>
            </div>
          ) : (
            <select
              id="payment_method_id"
              name="payment_method_id"
              value={formData.payment_method_id || ''}
              onChange={handleChange}
              required
              disabled={paymentMethodsLoading}
            >
              <option value="">Select payment method...</option>
              {/* Group payment methods by type */}
              {['cash', 'debit', 'cheque', 'credit_card'].map(type => {
                const methodsOfType = paymentMethods.filter(m => m.type === type);
                if (methodsOfType.length === 0) return null;
                
                const typeLabel = {
                  'cash': 'Cash',
                  'debit': 'Debit',
                  'cheque': 'Cheque',
                  'credit_card': 'Credit Card'
                }[type];
                
                return (
                  <optgroup key={type} label={typeLabel}>
                    {methodsOfType.map(method => (
                      <option key={method.id} value={method.id}>
                        {method.display_name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              {/* Show inactive payment method when editing (disabled for new selection) */}
              {editingInactivePaymentMethod && (
                <optgroup label="Inactive">
                  <option 
                    value={editingInactivePaymentMethod.id}
                    disabled={formData.payment_method_id !== editingInactivePaymentMethod.id}
                  >
                    {editingInactivePaymentMethod.display_name} (inactive)
                  </option>
                </optgroup>
              )}
            </select>
          )}
        </div>

        {/* People Assignment Section for Medical Expenses (Requirements 7.1, 7.2, 7.4) */}
        {isMedicalExpense && (
          <CollapsibleSection
            title="People Assignment"
            isExpanded={sectionStates.people}
            onToggle={() => toggleSection('people')}
            badge={calculatePeopleBadge(selectedPeople)}
            hasError={sectionHasError('people')}
          >
            <div className="form-group">
              <label htmlFor="people">
                Assign to People
                <HelpTooltip content={HELP_TEXT.peopleAssignment} position="right" />
              </label>
              <select
                id="people"
                name="people"
                multiple
                value={selectedPeople.map(p => p.id.toString())}
                onChange={handlePeopleChange}
                className="people-select"
                size={Math.min(people.length + 1, 4)}
              >
                <option value="" disabled>Select family members...</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              {selectedPeople.length > 0 && (
                <div className="selected-people-info">
                  {selectedPeople.length === 1 ? (
                    <span>Selected: {selectedPeople[0].name}</span>
                  ) : (
                    <>
                      <div className="allocation-header-row">
                        <span>Allocations ({selectedPeople.length} people)</span>
                        <button
                          type="button"
                          className="edit-allocation-button"
                          onClick={() => setShowPersonAllocation(true)}
                        >
                          ✏️ Edit
                        </button>
                      </div>
                      {selectedPeople.some(p => p.amount) ? (
                        <div className="current-allocations">
                          {selectedPeople.map(p => (
                            <div key={p.id} className="allocation-item">
                              <span className="person-name">{p.name}</span>
                              <span className="person-amount">
                                ${(p.amount || 0).toFixed(2)}
                                {insuranceEligible && p.originalAmount && (
                                  <span className="original-amount"> (orig: ${p.originalAmount.toFixed(2)})</span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="allocation-note">Click Edit to set amounts</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Insurance Tracking Section for Medical Expenses (Requirements 6.1, 6.2, 6.5, 4.3) */}
        {isMedicalExpense && (
          <CollapsibleSection
            title="Insurance Tracking"
            isExpanded={sectionStates.insurance}
            onToggle={() => toggleSection('insurance')}
            badge={calculateInsuranceBadge(insuranceEligible, claimStatus)}
            hasError={sectionHasError('insurance')}
          >
            {/* Insurance Eligibility Checkbox (Requirement 1.1) */}
            <div className="insurance-eligibility-row">
              <label className="insurance-checkbox">
                <input
                  type="checkbox"
                  checked={insuranceEligible}
                  onChange={handleInsuranceEligibleChange}
                  disabled={isSubmitting}
                />
                <span>Eligible for Insurance Reimbursement</span>
                <HelpTooltip content={HELP_TEXT.insuranceEligible} position="right" />
              </label>
            </div>
            
            {/* Insurance Details (shown when eligible) (Requirements 6.3, 6.4) */}
            {insuranceEligible && (
              <div className="insurance-details">
                {/* Original Cost Field (Requirement 3.1) */}
                <div className="insurance-field-row">
                  <div className="insurance-field">
                    <label htmlFor="originalCost">
                      Original Cost
                      <HelpTooltip content={HELP_TEXT.insuranceOriginalCost} position="right" />
                    </label>
                    <div className="amount-input-wrapper">
                      <span className="currency-symbol">$</span>
                      <input
                        type="number"
                        id="originalCost"
                        value={originalCost}
                        onChange={handleOriginalCostChange}
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  
                  {/* Out-of-Pocket Display (read-only, shows Amount value) */}
                  <div className="insurance-field">
                    <label>Out-of-Pocket</label>
                    <div className="out-of-pocket-display">
                      ${formData.amount ? parseFloat(formData.amount).toFixed(2) : '0.00'}
                    </div>
                    <small className="field-hint">Set via Amount field above</small>
                  </div>
                </div>
                
                {/* Claim Status Dropdown (Requirement 2.1, 2.2) */}
                <div className="insurance-field-row">
                  <div className="insurance-field">
                    <label htmlFor="claimStatus">
                      Claim Status
                      <HelpTooltip content={HELP_TEXT.claimStatus} position="right" />
                    </label>
                    <select
                      id="claimStatus"
                      value={claimStatus}
                      onChange={handleClaimStatusChange}
                      disabled={isSubmitting}
                      className="claim-status-select"
                    >
                      <option value="not_claimed">Not Claimed</option>
                      <option value="in_progress">In Progress</option>
                      <option value="paid">Paid</option>
                      <option value="denied">Denied</option>
                    </select>
                  </div>
                  
                  {/* Reimbursement Display (Requirement 3.6) */}
                  <div className="insurance-field">
                    <label>Reimbursement</label>
                    <div className={`reimbursement-display ${calculateReimbursement() > 0 ? 'has-reimbursement' : ''}`}>
                      ${calculateReimbursement().toFixed(2)}
                    </div>
                    <small className="field-hint">Original cost - Out-of-pocket</small>
                  </div>
                </div>
                
                {/* Insurance Validation Error (Requirement 3.5) */}
                {insuranceValidationError && (
                  <div className="insurance-validation-error">
                    {insuranceValidationError}
                  </div>
                )}
                
                {/* Status Info Notes (Requirement 6.5) */}
                {claimStatus === 'paid' && (
                  <div className="insurance-status-note insurance-status-paid">
                    <small>✅ Claim paid. Enter your actual out-of-pocket cost after reimbursement.</small>
                  </div>
                )}
                {claimStatus === 'denied' && (
                  <div className="insurance-status-note insurance-status-denied">
                    <small>❌ Claim denied. Out-of-pocket typically equals original cost.</small>
                  </div>
                )}
                {claimStatus === 'in_progress' && (
                  <div className="insurance-status-note">
                    <small>⏳ Claim in progress. Update out-of-pocket when resolved.</small>
                  </div>
                )}
                {claimStatus === 'not_claimed' && (
                  <div className="insurance-status-note">
                    <small>💡 Not yet claimed. Submit to insurance to track reimbursement.</small>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Invoice Attachments Section for Tax-Deductible Expenses (Requirements 8.1, 8.2, 8.3, 8.4) */}
        {isTaxDeductible && (
          <CollapsibleSection
            title="Invoice Attachments"
            isExpanded={sectionStates.invoices}
            onToggle={() => toggleSection('invoices')}
            badge={calculateInvoiceBadge(invoices, invoiceFiles)}
            hasError={sectionHasError('invoices')}
          >
            <div className="form-group invoice-section">
              <label htmlFor="invoice">
                Invoice Attachment
                <HelpTooltip content={HELP_TEXT.invoiceAttachment} position="right" />
              </label>
              <div className="invoice-upload-wrapper">
                {isEditing ? (
                  // For editing existing expenses, use full InvoiceUpload component with multi-invoice support
                  <InvoiceUpload
                    expenseId={expense?.id}
                    existingInvoices={invoices}
                    people={isMedicalExpense ? (expensePeople.length > 0 ? expensePeople : selectedPeople) : []}
                    onInvoiceUploaded={handleInvoiceUploaded}
                    onInvoiceDeleted={handleInvoiceDeleted}
                    onPersonLinkUpdated={handlePersonLinkUpdated}
                    disabled={isSubmitting}
                  />
                ) : (
                  // For new expenses, show file selection only (supports multiple files)
                  <div className="invoice-new-expense">
                    <div className="invoice-file-input">
                      <input
                        type="file"
                        id="invoice-file"
                        accept=".pdf,application/pdf"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length === 0) return;
                          
                          const MAX_SIZE = 10 * 1024 * 1024; // 10MB
                          const validFiles = [];
                          const errors = [];
                          
                          for (const file of files) {
                            if (file.size > MAX_SIZE) {
                              errors.push(`${file.name}: exceeds 10MB limit`);
                              continue;
                            }
                            if (file.type !== 'application/pdf') {
                              errors.push(`${file.name}: not a PDF file`);
                              continue;
                            }
                            validFiles.push(file);
                          }
                          
                          if (errors.length > 0) {
                            setMessage({ 
                              text: errors.join('; '), 
                              type: 'error' 
                            });
                          } else {
                            setMessage({ text: '', type: '' });
                          }
                          
                          // Add to existing files with default personId null
                          setInvoiceFiles(prev => [...prev, ...validFiles.map(f => ({ file: f, personId: null }))]);
                          e.target.value = ''; // Reset input to allow selecting same files again
                        }}
                        disabled={isSubmitting}
                      />
                      <label htmlFor="invoice-file" className="file-input-label">
                        {invoiceFiles.length > 0 ? (
                          <span className="file-selected">
                            📄 {invoiceFiles.length} file{invoiceFiles.length > 1 ? 's' : ''} selected - Click to add more
                          </span>
                        ) : (
                          <span className="file-placeholder">
                            📄 Select PDF invoice(s) (optional)
                          </span>
                        )}
                      </label>
                    </div>
                    {invoiceFiles.length > 0 && (
                      <div className="invoice-files-list">
                        {invoiceFiles.map((item, index) => (
                          <div key={index} className="invoice-file-item">
                            <span className="file-name">📄 {item.file.name} ({(item.file.size / 1024 / 1024).toFixed(1)}MB)</span>
                            {isMedicalExpense && selectedPeople.length > 0 && (
                              <select
                                className="invoice-person-select-inline"
                                value={item.personId || ''}
                                onChange={(e) => {
                                  const personId = e.target.value === '' ? null : parseInt(e.target.value);
                                  setInvoiceFiles(prev => prev.map((f, i) => 
                                    i === index ? { ...f, personId } : f
                                  ));
                                }}
                                disabled={isSubmitting}
                              >
                                <option value="">No person</option>
                                {selectedPeople.map((person) => (
                                  <option key={person.id} value={person.id}>
                                    {person.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              className="remove-file-btn"
                              onClick={() => {
                                setInvoiceFiles(prev => prev.filter((_, i) => i !== index));
                              }}
                              disabled={isSubmitting}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="invoice-note">
                      <small>PDF files only • Max 10MB each • Select multiple files or add more after creating</small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Reimbursement Section for Non-Medical Expenses - 2nd last (Requirements 5.1, 5.2, 5.3, 3.4) */}
        {/* Now matches medical expense pattern: Amount = net (out-of-pocket), Original Cost = charged amount */}
        {showGenericReimbursementUI && (
          <CollapsibleSection
            title="Reimbursement"
            isExpanded={sectionStates.reimbursement}
            onToggle={() => toggleSection('reimbursement')}
            badge={calculateReimbursementBadge(genericOriginalCost, formData.amount)}
            hasError={sectionHasError('reimbursement')}
          >
            <div className="form-group reimbursement-section">
              <label htmlFor="genericOriginalCost">
                Original Cost $ (optional)
                <HelpTooltip content={HELP_TEXT.originalCost} position="right" />
              </label>
              <div className="reimbursement-input-wrapper">
                <input
                  type="number"
                  id="genericOriginalCost"
                  name="genericOriginalCost"
                  value={genericOriginalCost}
                  onChange={handleGenericOriginalCostChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  className={genericReimbursementError ? 'input-error' : ''}
                />
                {genericOriginalCost && (
                  <button
                    type="button"
                    className="clear-reimbursement-btn"
                    onClick={() => {
                      setGenericOriginalCost('');
                      setGenericReimbursementError('');
                    }}
                    disabled={isSubmitting}
                    title="Clear original cost"
                    aria-label="Clear original cost"
                  >
                    ✕
                  </button>
                )}
              </div>
              <small className="form-hint">
                If you were reimbursed, enter the full amount charged here. Amount above is what you paid out-of-pocket.
              </small>
              {genericReimbursementError && (
                <div className="reimbursement-error">
                  {genericReimbursementError}
                </div>
              )}
              {/* Preview showing Charged/Reimbursed/Net breakdown (Requirements 5.3, 5.4) */}
              {genericOriginalCost && parseFloat(genericOriginalCost) > 0 && formData.amount && !genericReimbursementError && (
                <div className="reimbursement-preview">
                  <div className="reimbursement-preview-item">
                    <span className="preview-label">Charged:</span>
                    <span className="preview-value">${parseFloat(genericOriginalCost).toFixed(2)}</span>
                  </div>
                  <div className="reimbursement-preview-item">
                    <span className="preview-label">Reimbursed:</span>
                    <span className="preview-value reimbursed">${calculateGenericReimbursement().toFixed(2)}</span>
                  </div>
                  <div className="reimbursement-preview-item">
                    <span className="preview-label">Net (out-of-pocket):</span>
                    <span className="preview-value net">${parseFloat(formData.amount).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Advanced Options Section - always at bottom (Requirements 2.1, 2.2, 3.2, 3.3) */}
        <CollapsibleSection
          title="Advanced Options"
          isExpanded={sectionStates.advancedOptions}
          onToggle={() => toggleSection('advancedOptions')}
          badge={calculateAdvancedOptionsBadge(futureMonths, isCreditCard ? postedDate : '')}
          hasError={sectionHasError('advancedOptions')}
        >
          {/* Posted Date Field for Credit Card Expenses (Requirements 4.1, 4.2) */}
          {isCreditCard && (
            <div className="form-group posted-date-section">
              <label htmlFor="posted_date">
                Posted Date (optional)
                <HelpTooltip content={HELP_TEXT.postedDate} position="right" />
              </label>
              <div className="posted-date-input-wrapper">
                <input
                  type="date"
                  id="posted_date"
                  name="posted_date"
                  value={postedDate}
                  onChange={handlePostedDateChange}
                  disabled={isSubmitting}
                  className={postedDateError ? 'input-error' : ''}
                />
                {postedDate && (
                  <button
                    type="button"
                    className="clear-posted-date-btn"
                    onClick={() => {
                      setPostedDate('');
                      setPostedDateError('');
                    }}
                    disabled={isSubmitting}
                    title="Clear posted date"
                    aria-label="Clear posted date"
                  >
                    ✕
                  </button>
                )}
              </div>
              <small className="form-hint">
                Leave empty to use transaction date, or set when this posts to your statement
              </small>
              {postedDateError && (
                <div className="posted-date-error">
                  {postedDateError}
                </div>
              )}
            </div>
          )}

          {/* Future Months checkbox + dropdown (Requirements 1.1, 1.2, 1.7, 2.1, 2.2) */}
          <div className="form-group future-months-section">
            <div className="future-months-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={futureMonths > 0}
                  onChange={(e) => setFutureMonths(e.target.checked ? 1 : 0)}
                />
                <span>Add to Future Months</span>
                <HelpTooltip content={HELP_TEXT.futureMonths} position="right" />
              </label>
              {futureMonths > 0 && (
                <div className="future-months-count">
                  <select
                    id="futureMonths"
                    name="futureMonths"
                    value={futureMonths}
                    onChange={(e) => setFutureMonths(parseInt(e.target.value, 10))}
                    className="future-months-select"
                  >
                    {FUTURE_MONTHS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="months-label">month{futureMonths > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            {futureMonths > 0 && formData.date && (
              <div className="future-months-preview">
                <span className="preview-icon">📅</span>
                <span className="preview-text">
                  Will create {futureMonths} additional expense{futureMonths > 1 ? 's' : ''} {calculateFutureDatePreview(formData.date, futureMonths)}
                </span>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Row 4: Notes (Requirements 3.2) */}
        <div className="form-group">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            maxLength="200"
            rows="3"
            placeholder="Additional notes..."
          />
        </div>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="submit-button">
          {isSubmitting ? (isEditing ? 'Updating...' : 'Adding...') : (isEditing ? 'Update Expense' : 'Add Expense')}
        </button>
      </form>

      {/* Person Allocation Modal */}
      <PersonAllocationModal
        isOpen={showPersonAllocation}
        expense={{ amount: parseFloat(formData.amount) || 0 }}
        selectedPeople={selectedPeople}
        onSave={handlePersonAllocation}
        onCancel={() => setShowPersonAllocation(false)}
        insuranceEligible={insuranceEligible}
        originalCost={insuranceEligible && originalCost ? parseFloat(originalCost) : null}
      />
    </div>
  );
};

export default ExpenseForm;
