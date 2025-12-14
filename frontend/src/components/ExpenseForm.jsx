import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { getTodayLocalDate } from '../utils/formatters';
import { PAYMENT_METHODS } from '../utils/constants';
import { fetchCategorySuggestion } from '../services/categorySuggestionApi';
import { getPeople } from '../services/peopleApi';
import { createExpense } from '../services/expenseApi';
import PersonAllocationModal from './PersonAllocationModal';
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

const ExpenseForm = ({ onExpenseAdded }) => {
  const [formData, setFormData] = useState({
    date: getTodayLocalDate(),
    place: '',
    notes: '',
    amount: '',
    type: 'Other',
    method: getLastPaymentMethod() // Load last used payment method (Requirements 5.1)
  });

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [places, setPlaces] = useState([]);
  const [filteredPlaces, setFilteredPlaces] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [typeOptions, setTypeOptions] = useState(['Other']); // Default fallback
  const [isCategorySuggested, setIsCategorySuggested] = useState(false); // Track if category was auto-suggested
  
  // People selection state for medical expenses
  const [people, setPeople] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [showPersonAllocation, setShowPersonAllocation] = useState(false);

  // Refs for focus management and form state
  const placeInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const isSubmittingRef = useRef(false); // Track if form is being submitted to prevent blur handler interference
  const justSelectedFromDropdownRef = useRef(false); // Track if we just selected from dropdown to prevent blur handler

  // Fetch categories, places, and people on component mount
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

    const fetchPeople = async () => {
      try {
        const peopleData = await getPeople();
        if (isMounted) {
          setPeople(peopleData);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to fetch people:', error);
        }
      }
    };

    fetchCategories();
    fetchPlaces();
    fetchPeople();

    // Set initial focus to Place field (Requirements 1.1)
    if (placeInputRef.current) {
      placeInputRef.current.focus();
    }

    return () => {
      isMounted = false;
    };
  }, []);

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

      // Create the expense using the API service
      const newExpense = await createExpense(formData, peopleAllocations);
      
      // Save payment method for next expense entry (Requirements 5.3)
      saveLastPaymentMethod(formData.method);
      
      setMessage({ 
        text: 'Expense added successfully!', 
        type: 'success' 
      });
      
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

      // Clear people selection
      setSelectedPeople([]);

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
      <h2>Add New Expense</h2>
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
          {isSubmitting ? 'Adding...' : 'Add Expense'}
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
