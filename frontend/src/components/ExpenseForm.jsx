import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { getTodayLocalDate } from '../utils/formatters';
import { fetchCategorySuggestion } from '../services/categorySuggestionApi';
import { getCategories } from '../services/categoriesApi';
import { getPeople } from '../services/peopleApi';
import { getActivePaymentMethods, getPaymentMethod } from '../services/paymentMethodApi';
import { createExpense, updateExpense, getExpenseWithPeople, getPlaces } from '../services/expenseApi';
import { getInvoicesForExpense, updateInvoicePersonLink } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';
import PersonAllocationModal from './PersonAllocationModal';
import InvoiceUpload from './InvoiceUpload';
import './ExpenseForm.css';

const logger = createLogger('ExpenseForm');

// localStorage key for payment method persistence (Requirements 5.1, 5.3)
// Now stores payment_method_id instead of method string
const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

// Legacy localStorage key for migration
const LEGACY_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method';

// Default payment method ID when no saved value exists (Requirements 5.2)
// ID 1 corresponds to "Cash" in the migrated payment_methods table
const DEFAULT_PAYMENT_METHOD_ID = 1;

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

/**
 * Calculate the future date range preview text
 * @param {string} sourceDate - The source date in YYYY-MM-DD format
 * @param {number} futureMonths - Number of future months
 * @returns {string} Preview text showing the date range
 */
const calculateFutureDatePreview = (sourceDate, futureMonths) => {
  if (!sourceDate || futureMonths <= 0) return '';
  
  const date = new Date(sourceDate + 'T00:00:00');
  const sourceDay = date.getDate();
  
  // Calculate the last future month date
  const futureDate = new Date(date);
  futureDate.setMonth(futureDate.getMonth() + futureMonths);
  
  // Handle month-end edge cases
  const targetMonth = futureDate.getMonth();
  const daysInTargetMonth = new Date(futureDate.getFullYear(), targetMonth + 1, 0).getDate();
  
  if (sourceDay > daysInTargetMonth) {
    futureDate.setDate(daysInTargetMonth);
  } else {
    futureDate.setDate(sourceDay);
  }
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  return `through ${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()}`;
};

/**
 * Get the last used payment method ID from localStorage
 * Includes migration logic for existing localStorage values (map string to ID)
 * @param {Array} paymentMethods - Available payment methods for validation/migration
 * @returns {number|null} The last used payment method ID or null
 */
const getLastPaymentMethodId = (paymentMethods = []) => {
  try {
    // First try the new ID-based key
    const savedId = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
    if (savedId) {
      const id = parseInt(savedId, 10);
      // Validate that the ID exists in available payment methods
      if (paymentMethods.some(pm => pm.id === id)) {
        return id;
      }
    }
    
    // Migration: Check for legacy string-based value
    const legacyMethod = localStorage.getItem(LEGACY_PAYMENT_METHOD_KEY);
    if (legacyMethod && paymentMethods.length > 0) {
      // Find the payment method by display_name
      const matchingMethod = paymentMethods.find(pm => pm.display_name === legacyMethod);
      if (matchingMethod) {
        // Migrate to new format
        localStorage.setItem(LAST_PAYMENT_METHOD_KEY, matchingMethod.id.toString());
        localStorage.removeItem(LEGACY_PAYMENT_METHOD_KEY);
        return matchingMethod.id;
      }
    }
  } catch (error) {
    logger.error('Failed to read payment method from localStorage:', error);
  }
  return null;
};

/**
 * Save the payment method ID to localStorage
 * @param {number} paymentMethodId - The payment method ID to save
 */
const saveLastPaymentMethodId = (paymentMethodId) => {
  try {
    localStorage.setItem(LAST_PAYMENT_METHOD_KEY, paymentMethodId.toString());
  } catch (error) {
    logger.error('Failed to save payment method to localStorage:', error);
  }
};

const ExpenseForm = ({ onExpenseAdded, people: propPeople, expense = null }) => {
  const isEditing = !!expense;
  
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

  // Payment methods state - fetched from API
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [paymentMethodsError, setPaymentMethodsError] = useState(null);
  
  // Track if the expense being edited has an inactive payment method
  const [editingInactivePaymentMethod, setEditingInactivePaymentMethod] = useState(null);

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
  const [places, setPlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [typeOptions, setTypeOptions] = useState(['Other']); // Default fallback
  const [isCategorySuggested, setIsCategorySuggested] = useState(false); // Track if category was auto-suggested
  
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

  // Fetch categories, places, people, payment methods, and invoice data on component mount
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

    const fetchPlacesData = async () => {
      try {
        const data = await getPlaces();
        if (isMounted && data) {
          setPlaces(data);
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to fetch places:', error);
        }
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

    const fetchPaymentMethodsData = async () => {
      try {
        setPaymentMethodsLoading(true);
        setPaymentMethodsError(null);
        
        const methods = await getActivePaymentMethods();
        if (isMounted && methods) {
          setPaymentMethods(methods);
          
          // If editing and the expense has a payment method that's not in active list,
          // fetch it separately to show in dropdown (disabled)
          if (isEditing && expense?.payment_method_id) {
            const isActive = methods.some(m => m.id === expense.payment_method_id);
            if (!isActive) {
              try {
                const inactiveMethod = await getPaymentMethod(expense.payment_method_id);
                if (isMounted && inactiveMethod) {
                  setEditingInactivePaymentMethod(inactiveMethod);
                }
              } catch (err) {
                logger.error('Failed to fetch inactive payment method:', err);
              }
            }
          }
          
          // Set initial payment method if not editing
          if (!isEditing && !formData.payment_method_id) {
            const lastUsedId = getLastPaymentMethodId(methods);
            if (lastUsedId) {
              setFormData(prev => ({ ...prev, payment_method_id: lastUsedId }));
            } else if (methods.length > 0) {
              // Default to first available method (usually Cash with ID 1)
              const defaultMethod = methods.find(m => m.id === DEFAULT_PAYMENT_METHOD_ID) || methods[0];
              setFormData(prev => ({ ...prev, payment_method_id: defaultMethod.id }));
            }
          }
        }
      } catch (error) {
        if (isMounted) {
          logger.error('Failed to fetch payment methods:', error);
          setPaymentMethodsError('Failed to load payment methods');
        }
      } finally {
        if (isMounted) {
          setPaymentMethodsLoading(false);
        }
      }
    };

    const fetchInvoiceData = async () => {
      // Fetch all invoices if editing a tax-deductible expense (medical or donation)
      if (isEditing && expense?.id && (expense?.type === 'Tax - Medical' || expense?.type === 'Tax - Donation')) {
        try {
          const invoicesData = await getInvoicesForExpense(expense.id);
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
    fetchPlacesData();
    fetchPeopleData();
    fetchPaymentMethodsData();
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
      if (value.trim() === '') {
        setFilteredPlaces([]);
        setShowSuggestions(false);
        // Reset suggestion indicator when place is cleared
        setIsCategorySuggested(false);
      } else {
        const filtered = places.filter(place =>
          place.toLowerCase().includes(value.toLowerCase())
        );
        setFilteredPlaces(filtered);
        setShowSuggestions(filtered.length > 0);
      }
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
  const fetchAndApplyCategorySuggestion = async (place) => {
    if (!place || !place.trim()) {
      return;
    }

    const suggestion = await fetchCategorySuggestion(place);
    
    if (suggestion && suggestion.category) {
      setFormData(prev => ({
        ...prev,
        type: suggestion.category
      }));
      setIsCategorySuggested(true); // Show visual indicator for auto-suggested category
    } else {
      // No suggestion found - default to "Other" (Requirements 2.2)
      setFormData(prev => ({
        ...prev,
        type: 'Other'
      }));
      setIsCategorySuggested(false);
    }
  };

  const handlePlaceSelect = async (place) => {
    // Mark that we're selecting from dropdown to prevent blur handler from running
    justSelectedFromDropdownRef.current = true;
    
    setShowSuggestions(false);
    setFilteredPlaces([]);

    // Fetch category suggestion first, then update both place and category together
    const suggestion = await fetchCategorySuggestion(place);
    
    if (suggestion && suggestion.category) {
      // Update place and category in a single state update to avoid flashing
      setFormData(prev => ({
        ...prev,
        place: place,
        type: suggestion.category
      }));
      setIsCategorySuggested(true);
    } else {
      // No suggestion found - set place and default to "Other"
      setFormData(prev => ({
        ...prev,
        place: place,
        type: 'Other'
      }));
      setIsCategorySuggested(false);
    }

    // Move focus to Amount field after place selection (Requirements 3.1)
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
    
    // Reset the flag after a delay (longer than blur handler delay)
    setTrackedTimeout(() => {
      justSelectedFromDropdownRef.current = false;
    }, 300);
  };

  // Handle place field blur - fetch suggestion if place was typed manually (Requirements 1.3)
  const handlePlaceBlur = async () => {
    // Delay to allow click on suggestion dropdown
    setTrackedTimeout(async () => {
      setShowSuggestions(false);
      
      // Don't fetch suggestion if:
      // - Form is being submitted
      // - Just selected from dropdown (to prevent overwriting the selection)
      // - Place is empty
      // - Category has already been suggested
      if (isSubmittingRef.current || justSelectedFromDropdownRef.current || !formData.place || !formData.place.trim() || isCategorySuggested) {
        return;
      }
      
      await fetchAndApplyCategorySuggestion(formData.place);
    }, 200);
  };

  const validateForm = () => {
    if (!formData.date) {
      setMessage({ text: 'Date is required', type: 'error' });
      return false;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setMessage({ text: 'Amount must be a positive number', type: 'error' });
      return false;
    }
    if (!formData.type) {
      setMessage({ text: 'Type is required', type: 'error' });
      return false;
    }
    if (!formData.payment_method_id) {
      setMessage({ text: 'Payment method is required', type: 'error' });
      return false;
    }
    if (formData.place && formData.place.length > 200) {
      setMessage({ text: 'Place must be 200 characters or less', type: 'error' });
      return false;
    }
    if (formData.notes && formData.notes.length > 200) {
      setMessage({ text: 'Notes must be 200 characters or less', type: 'error' });
      return false;
    }
    
    // Insurance validation for medical expenses (Requirement 3.5)
    if (isMedicalExpense && insuranceEligible) {
      const amountNum = parseFloat(formData.amount) || 0;
      const origCostNum = parseFloat(originalCost) || 0;
      
      if (origCostNum <= 0) {
        setMessage({ text: 'Original cost is required for insurance-eligible expenses', type: 'error' });
        return false;
      }
      
      if (amountNum > origCostNum) {
        setMessage({ text: 'Out-of-pocket amount cannot exceed original cost', type: 'error' });
        return false;
      }
    }
    
    // Posted date validation for credit card expenses (Requirements 4.5)
    if (isCreditCard && postedDate && formData.date && postedDate < formData.date) {
      setMessage({ text: 'Posted date cannot be before transaction date', type: 'error' });
      setPostedDateError('Posted date cannot be before transaction date');
      return false;
    }
    
    // Generic original cost validation for non-medical expenses (Requirements 1.3)
    // Amount (net) cannot exceed original cost (charged amount)
    if (showGenericReimbursementUI && genericOriginalCost) {
      const origCostNum = parseFloat(genericOriginalCost);
      const amountNum = parseFloat(formData.amount) || 0;
      
      if (isNaN(origCostNum) || origCostNum < 0) {
        setMessage({ text: 'Original cost must be a non-negative number', type: 'error' });
        setGenericReimbursementError('Original cost must be a non-negative number');
        return false;
      }
      
      if (amountNum > origCostNum) {
        setMessage({ text: 'Net amount cannot exceed original cost', type: 'error' });
        setGenericReimbursementError('Net amount cannot exceed original cost');
        return false;
      }
    }
    
    return true;
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
      // Prepare form data with insurance fields for medical expenses (Requirements 1.3, 2.3)
      // and posted_date for credit card expenses (Requirements 4.1, 4.2)
      // and original_cost for non-medical expenses with reimbursement (Requirements 2.1, 2.2)
      const expenseFormData = {
        ...formData,
        // Add posted_date for credit card expenses (null or empty string becomes null)
        posted_date: isCreditCard && postedDate ? postedDate : null,
        // Add insurance fields for medical expenses
        ...(isMedicalExpense && {
          insurance_eligible: insuranceEligible,
          claim_status: insuranceEligible ? claimStatus : null,
          original_cost: insuranceEligible && originalCost ? parseFloat(originalCost) : null
        }),
        // Add original_cost for non-medical expenses (Requirements 2.1, 2.2)
        // Now matches medical expense pattern: Amount = net, original_cost = charged amount
        ...(showGenericReimbursementUI && genericOriginalCost && parseFloat(genericOriginalCost) > 0 && {
          original_cost: parseFloat(genericOriginalCost)
        }),
        // Explicitly clear original_cost when it's removed (Requirements 2.4)
        ...(showGenericReimbursementUI && !genericOriginalCost && isEditing && expense?.original_cost && {
          original_cost: null
        })
      };

      // Prepare people allocations for medical expenses
      let peopleAllocations = null;
      if (isMedicalExpense && selectedPeople.length > 0) {
        if (selectedPeople.length === 1) {
          // Single person - assign full amount (and original_amount for insurance)
          peopleAllocations = [{
            personId: selectedPeople[0].id,
            amount: parseFloat(formData.amount),
            originalAmount: insuranceEligible && originalCost ? parseFloat(originalCost) : null
          }];
        } else {
          // Multiple people - use allocated amounts (with original_amount for insurance)
          peopleAllocations = selectedPeople.map(person => ({
            personId: person.id,
            amount: person.amount,
            originalAmount: person.originalAmount || null
          }));
        }
      }

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
        const uploadedInvoices = [];
        
        for (const item of invoiceFiles) {
          try {
            const formData = new FormData();
            formData.append('invoice', item.file);
            formData.append('expenseId', newExpense.id.toString());
            
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
        
        if (uploadedInvoices.length > 0) {
          setInvoices(uploadedInvoices);
          newExpense.invoices = uploadedInvoices;
          newExpense.hasInvoice = true;
          newExpense.invoiceCount = uploadedInvoices.length;
        }
        
        if (uploadedInvoices.length < invoiceFiles.length) {
          setMessage({ 
            text: `Expense ${isEditing ? 'updated' : 'added'} successfully, but ${invoiceFiles.length - uploadedInvoices.length} invoice(s) failed to upload`, 
            type: 'warning' 
          });
        }
      }
      
      // Save payment method for next expense entry (Requirements 5.3)
      if (!isEditing && formData.payment_method_id) {
        saveLastPaymentMethodId(formData.payment_method_id);
      }
      
      // Build success message including future expenses info (Requirements 4.1, 4.2)
      let successText = `Expense ${isEditing ? 'updated' : 'added'} successfully!`;
      if (futureExpensesResult.length > 0) {
        const datePreview = calculateFutureDatePreview(formData.date, futureExpensesResult.length);
        successText = `Expense ${isEditing ? 'updated' : 'added'} and added to ${futureExpensesResult.length} future month${futureExpensesResult.length > 1 ? 's' : ''} ${datePreview}`;
      }
      
      setMessage({ 
        text: successText, 
        type: 'success' 
      });
      
      if (!isEditing) {
        // Clear form and reset suggestion indicator, but keep the last used payment method (Requirements 5.1)
        const lastPaymentMethodId = formData.payment_method_id;
        
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
        
        // Reset future months to 0 (Requirements 1.7)
        setFutureMonths(0);
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

      // Clear success message after 3 seconds
      setTrackedTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 3000);

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

        {/* Posted Date Field for Credit Card Expenses (Requirements 1.1, 6.1, 6.2, 6.4, 6.5) */}
        {isCreditCard && (
          <div className="form-group posted-date-section">
            <label htmlFor="posted_date">Posted Date (optional)</label>
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

        {/* Generic Reimbursement Section for Non-Medical Expenses (Requirements 1.1, 1.2, 1.4, 1.5) */}
        {/* Now matches medical expense pattern: Amount = net (out-of-pocket), Original Cost = charged amount */}
        {showGenericReimbursementUI && (
          <div className="form-group reimbursement-section">
            <label htmlFor="genericOriginalCost">Original Cost $ (optional)</label>
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
            {/* Preview showing Charged/Reimbursed/Net breakdown (Requirement 1.4) */}
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
        )}

        {/* People Selection for Medical Expenses (Requirements 2.1, 2.2, 2.3) */}
        {isMedicalExpense && (
          <div className="form-group">
            <label htmlFor="people">Assign to People</label>
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
        )}

        {/* Insurance Section for Medical Expenses (Requirements 1.1, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.6) */}
        {isMedicalExpense && (
          <div className="form-group insurance-section">
            <label className="insurance-section-title">Insurance Tracking</label>
            
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
              </label>
            </div>
            
            {/* Insurance Details (shown when eligible) */}
            {insuranceEligible && (
              <div className="insurance-details">
                {/* Original Cost Field (Requirement 3.1) */}
                <div className="insurance-field-row">
                  <div className="insurance-field">
                    <label htmlFor="originalCost">Original Cost</label>
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
                    <label htmlFor="claimStatus">Claim Status</label>
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
                
                {/* Status Info Note */}
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
          </div>
        )}

        {/* Invoice Upload for Tax-Deductible Expenses (Medical and Donations) */}
        {isTaxDeductible && (
          <div className="form-group invoice-section">
            <label htmlFor="invoice">Invoice Attachment</label>
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
        )}

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

        {/* Add to Future Months checkbox + dropdown (Requirements 1.1, 1.2, 1.7, 2.1, 2.2) */}
        <div className="form-group future-months-section">
          <div className="future-months-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={futureMonths > 0}
                onChange={(e) => setFutureMonths(e.target.checked ? 1 : 0)}
              />
              <span>Add to Future Months</span>
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
