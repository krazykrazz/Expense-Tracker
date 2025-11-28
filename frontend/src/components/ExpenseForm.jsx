import { useState, useEffect, useRef } from 'react';
import { API_ENDPOINTS } from '../config';
import { getTodayLocalDate } from '../utils/formatters';
import { PAYMENT_METHODS } from '../utils/constants';
import { fetchCategorySuggestion } from '../services/categorySuggestionApi';
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

  // Refs for focus management
  const placeInputRef = useRef(null);
  const amountInputRef = useRef(null);

  // Fetch categories and distinct places on component mount
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

    fetchCategories();
    fetchPlaces();

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
    setFormData(prev => ({
      ...prev,
      place: place
    }));
    setShowSuggestions(false);
    setFilteredPlaces([]);

    // Fetch category suggestion for this place (Requirements 1.3, 1.4)
    await fetchAndApplyCategorySuggestion(place);

    // Move focus to Amount field after place selection (Requirements 3.1)
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  // Handle place field blur - fetch suggestion if place was typed manually (Requirements 1.3)
  const handlePlaceBlur = async () => {
    // Delay to allow click on suggestion dropdown
    setTimeout(async () => {
      setShowSuggestions(false);
      
      // If place has value and category hasn't been suggested yet, fetch suggestion
      if (formData.place && formData.place.trim() && !isCategorySuggested) {
        await fetchAndApplyCategorySuggestion(formData.place);
      }
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

    setIsSubmitting(true);

    try {
      // Create the expense
      const response = await fetch(API_ENDPOINTS.EXPENSES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: formData.date,
          place: formData.place,
          notes: formData.notes,
          amount: parseFloat(formData.amount),
          type: formData.type,
          method: formData.method
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add expense');
      }

      const newExpense = await response.json();
      
      // Save payment method for next expense entry (Requirements 5.3)
      saveLastPaymentMethod(formData.method);
      
      setMessage({ 
        text: 'Expense added successfully!', 
        type: 'success' 
      });
      
      // Clear form and reset suggestion indicator, but keep the last used payment method (Requirements 5.1)
      const lastMethod = formData.method;
      setFormData({
        date: getTodayLocalDate(),
        place: '',
        notes: '',
        amount: '',
        type: 'Other',
        method: lastMethod // Pre-select last used payment method for next entry
      });
      setIsCategorySuggested(false);

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
    </div>
  );
};

export default ExpenseForm;
