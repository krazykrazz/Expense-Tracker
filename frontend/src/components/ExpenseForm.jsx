import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { getTodayLocalDate } from '../utils/formatters';
import { PAYMENT_METHODS } from '../utils/constants';
import { fetchCategorySuggestion } from '../services/categorySuggestionApi';
import { getPeople } from '../services/peopleApi';
import { createExpense } from '../services/expenseApi';
import PersonAllocationModal from './PersonAllocationModal';
import InvoiceUpload from './InvoiceUpload';
import InvoicePDFViewer from './InvoicePDFViewer';
import './ExpenseForm.css';

// localStorage key for payment method persistence (Requirements 5.1, 5.3)
const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method';

// Default payment method when no saved value exists (Requirements 5.2)
const DEFAULT_PAYMENT_METHOD = 'Cash';

/**
 * Get the last used payment method from localStorage
 * @returns {string} The last used payment method or default
 */
const getLastPaymentMethod = () => {
  try {
    const saved = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
    // Validate that the saved method is still a valid option
    if (saved && PAYMENT_METHODS.includes(saved)) {
      return saved;
    }
  } catch (error) {
    console.error('Failed to read payment method from localStorage:', error);
  }
  return DEFAULT_PAYMENT_METHOD;
};

/**
 * Save the payment method to localStorage
 * @param {string} method - The payment method to save
 */
const saveLastPaymentMethod = (method) => {
  try {
    localStorage.setItem(LAST_PAYMENT_METHOD_KEY, method);
  } catch (error) {
    console.error('Failed to save payment method to localStorage:', error);
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
    method: expense?.method || getLastPaymentMethod() // Load last used payment method (Requirements 5.1)
  });

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
  const [invoiceInfo, setInvoiceInfo] = useState(expense?.invoice || null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [showInvoiceViewer, setShowInvoiceViewer] = useState(false);

  // Refs for focus management and form state
  const placeInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const isSubmittingRef = useRef(false); // Track if form is being submitted to prevent blur handler interference
  const justSelectedFromDropdownRef = useRef(false); // Track if we just selected from dropdown to prevent blur handler

  // Fetch categories, places, people, and invoice data on component mount
  useEffect(() => {
    let isMounted = true;

    const fetchCategories = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.CATEGORIES);
        if (response.ok && isMounted) {
          const data = await response.json();
          setTypeOptions(data.categories);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to fetch categories:', error);
        }
        // Keep default fallback value
      }
    };

    const fetchPlaces = async () => {
      try {
        const response = await fetch(`${API_ENDPOINTS.EXPENSES}/places`);
        if (response.ok && isMounted) {
          const data = await response.json();
          setPlaces(data);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to fetch places:', error);
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
            console.error('Failed to fetch people:', error);
          }
        }
      }
    };

    const fetchInvoiceData = async () => {
      // Fetch invoice metadata if editing a medical expense
      if (isEditing && expense?.id && expense?.type === 'Tax - Medical') {
        try {
          const { getInvoiceMetadata } = await import('../services/invoiceApi');
          const invoiceData = await getInvoiceMetadata(expense.id);
          if (isMounted && invoiceData) {
            setInvoiceInfo(invoiceData);
          }
        } catch (error) {
          if (isMounted) {
            console.error('Failed to fetch invoice data:', error);
          }
        }
      }
    };

    fetchCategories();
    fetchPlaces();
    fetchPeopleData();
    fetchInvoiceData();

    // Set initial focus to Place field (Requirements 1.1)
    if (placeInputRef.current && !isEditing) {
      placeInputRef.current.focus();
    }

    return () => {
      isMounted = false;
    };
  }, [isEditing, expense?.id, expense?.type]);

  const handleChange = (e) => {
    const { name, value } = e.target;
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

    // Clear suggestion indicator when user manually changes category (Requirements 2.4)
    if (name === 'type') {
      setIsCategorySuggested(false);
      // Clear people selection when changing away from medical expenses
      if (value !== 'Tax - Medical') {
        setSelectedPeople([]);
        // Clear invoice when changing away from medical expenses
        setInvoiceInfo(null);
        setInvoiceFile(null);
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

  // Handle person allocation modal save
  const handlePersonAllocation = (allocations) => {
    setShowPersonAllocation(false);
    // Store allocations for form submission
    setSelectedPeople(allocations);
  };

  // Check if current expense type is medical
  const isMedicalExpense = formData.type === 'Tax - Medical';

  // Handle invoice upload success (Requirements 1.1, 1.2, 2.1)
  const handleInvoiceUploaded = (invoice) => {
    setInvoiceInfo(invoice);
    setInvoiceFile(null); // Clear file state after successful upload
    setMessage({ text: 'Invoice uploaded successfully!', type: 'success' });
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000);
  };

  // Handle invoice deletion (Requirements 2.3, 2.4)
  const handleInvoiceDeleted = () => {
    setInvoiceInfo(null);
    setInvoiceFile(null);
    setMessage({ text: 'Invoice deleted successfully!', type: 'success' });
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      setMessage({ text: '', type: '' });
    }, 3000);
  };

  // Handle invoice file selection for new expenses (Requirements 1.1, 1.5)
  const handleInvoiceFileSelected = (file) => {
    setInvoiceFile(file);
  };

  // Handle viewing invoice (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)
  const handleViewInvoice = () => {
    if (invoiceInfo && expense?.id) {
      window.open(API_ENDPOINTS.INVOICE_BY_EXPENSE(expense.id), '_blank');
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
    setTimeout(() => {
      justSelectedFromDropdownRef.current = false;
    }, 300);
  };

  // Handle place field blur - fetch suggestion if place was typed manually (Requirements 1.3)
  const handlePlaceBlur = async () => {
    // Delay to allow click on suggestion dropdown
    setTimeout(async () => {
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
    if (!formData.method) {
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
      // Prepare people allocations for medical expenses
      let peopleAllocations = null;
      if (isMedicalExpense && selectedPeople.length > 0) {
        if (selectedPeople.length === 1) {
          // Single person - assign full amount
          peopleAllocations = [{
            personId: selectedPeople[0].id,
            amount: parseFloat(formData.amount)
          }];
        } else {
          // Multiple people - use allocated amounts
          peopleAllocations = selectedPeople.map(person => ({
            personId: person.id,
            amount: person.amount
          }));
        }
      }

      let newExpense;
      
      if (isEditing) {
        // Update existing expense
        const { updateExpense } = await import('../services/expenseApi');
        newExpense = await updateExpense(expense.id, formData, peopleAllocations);
      } else {
        // Create new expense
        newExpense = await createExpense(formData, peopleAllocations);
      }

      // Handle invoice upload for new expenses or when invoice file is selected
      if (isMedicalExpense && invoiceFile && newExpense.id) {
        try {
          const formData = new FormData();
          formData.append('invoice', invoiceFile);
          formData.append('expenseId', newExpense.id.toString());

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
            setInvoiceInfo(invoiceResult.invoice);
            newExpense.invoice = invoiceResult.invoice;
            newExpense.hasInvoice = true;
            
            // Notify parent to refresh expense list with invoice indicator
            if (onExpenseAdded) {
              onExpenseAdded({ ...newExpense, hasInvoice: true });
            }
          }
        } catch (invoiceError) {
          console.error('Invoice upload failed:', invoiceError);
          // Don't fail the entire form submission for invoice upload errors
          setMessage({ 
            text: `Expense ${isEditing ? 'updated' : 'added'} successfully, but invoice upload failed: ${invoiceError.message}`, 
            type: 'warning' 
          });
        }
      }
      
      // Save payment method for next expense entry (Requirements 5.3)
      if (!isEditing) {
        saveLastPaymentMethod(formData.method);
      }
      
      setMessage({ 
        text: `Expense ${isEditing ? 'updated' : 'added'} successfully!`, 
        type: 'success' 
      });
      
      if (!isEditing) {
        // Clear form and reset suggestion indicator, but keep the last used payment method (Requirements 5.1)
        const lastMethod = formData.method;
        
        // Reset suggestion indicator first to prevent any pending blur handlers from triggering
        setIsCategorySuggested(false);
        
        setFormData({
          date: getTodayLocalDate(),
          place: '',
          notes: '',
          amount: '',
          type: 'Other',
          method: lastMethod // Pre-select last used payment method for next entry
        });

        // Clear people selection and invoice state
        setSelectedPeople([]);
        setInvoiceInfo(null);
        setInvoiceFile(null);
      }

      // Notify parent component
      if (onExpenseAdded) {
        onExpenseAdded(newExpense);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 3000);

    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
      // Reset submitting ref after a delay to ensure blur handler has completed
      setTimeout(() => {
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

        {/* Row 3: Payment Method (Requirements 3.2) */}
        <div className="form-group">
          <label htmlFor="method">Payment Method *</label>
          <select
            id="method"
            name="method"
            value={formData.method}
            onChange={handleChange}
            required
          >
            {PAYMENT_METHODS.map(method => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>

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
                Selected: {selectedPeople.map(p => p.name).join(', ')}
                {selectedPeople.length > 1 && (
                  <span className="allocation-note"> (allocation required)</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Invoice Upload for Medical Expenses (Requirements 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5) */}
        {isMedicalExpense && (
          <div className="form-group invoice-section">
            <label htmlFor="invoice">Invoice Attachment</label>
            <div className="invoice-upload-wrapper">
              {isEditing ? (
                // For editing existing expenses, use full InvoiceUpload component
                <InvoiceUpload
                  expenseId={expense?.id}
                  existingInvoice={invoiceInfo}
                  onInvoiceUploaded={handleInvoiceUploaded}
                  onInvoiceDeleted={handleInvoiceDeleted}
                  disabled={isSubmitting}
                />
              ) : (
                // For new expenses, show file selection only
                <div className="invoice-new-expense">
                  <div className="invoice-file-input">
                    <input
                      type="file"
                      id="invoice-file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Validate file
                          const MAX_SIZE = 10 * 1024 * 1024; // 10MB
                          if (file.size > MAX_SIZE) {
                            setMessage({ 
                              text: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the 10MB limit`, 
                              type: 'error' 
                            });
                            e.target.value = '';
                            return;
                          }
                          if (file.type !== 'application/pdf') {
                            setMessage({ 
                              text: 'Only PDF files are allowed', 
                              type: 'error' 
                            });
                            e.target.value = '';
                            return;
                          }
                          setInvoiceFile(file);
                          setMessage({ text: '', type: '' });
                        }
                      }}
                      disabled={isSubmitting}
                    />
                    <label htmlFor="invoice-file" className="file-input-label">
                      {invoiceFile ? (
                        <span className="file-selected">
                          📄 {invoiceFile.name} ({(invoiceFile.size / 1024 / 1024).toFixed(1)}MB)
                        </span>
                      ) : (
                        <span className="file-placeholder">
                          📄 Select PDF invoice (optional)
                        </span>
                      )}
                    </label>
                    {invoiceFile && (
                      <button
                        type="button"
                        className="clear-file-btn"
                        onClick={() => {
                          setInvoiceFile(null);
                          document.getElementById('invoice-file').value = '';
                        }}
                        disabled={isSubmitting}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                  <div className="invoice-note">
                    <small>PDF files only • Max 10MB • You can also add an invoice after creating the expense</small>
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
      />
    </div>
  );
};

export default ExpenseForm;
