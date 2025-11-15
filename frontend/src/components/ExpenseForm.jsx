import { useState } from 'react';
import { API_ENDPOINTS } from '../config';
import './ExpenseForm.css';

const ExpenseForm = ({ onExpenseAdded }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    place: '',
    notes: '',
    amount: '',
    type: 'Other',
    method: 'Cash'
  });

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringData, setRecurringData] = useState({
    day_of_month: '',
    start_month: '',
    end_month: '',
    ongoing: false
  });

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeOptions = ['Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation'];
  const methodOptions = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRecurringChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'ongoing') {
      setRecurringData(prev => ({
        ...prev,
        ongoing: checked,
        end_month: checked ? '' : prev.end_month
      }));
    } else {
      setRecurringData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
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
    
    // Validate recurring fields if recurring is enabled
    if (isRecurring) {
      if (!recurringData.day_of_month || recurringData.day_of_month < 1 || recurringData.day_of_month > 31) {
        setMessage({ text: 'Day of month must be between 1 and 31', type: 'error' });
        return false;
      }
      if (!recurringData.start_month) {
        setMessage({ text: 'Start month is required for recurring expenses', type: 'error' });
        return false;
      }
      if (!recurringData.ongoing && recurringData.end_month && recurringData.end_month < recurringData.start_month) {
        setMessage({ text: 'End month must be after or equal to start month', type: 'error' });
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
      
      // If recurring is enabled, create the recurring template
      if (isRecurring) {
        const recurringResponse = await fetch('/api/recurring', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            place: formData.place,
            amount: parseFloat(formData.amount),
            notes: formData.notes,
            type: formData.type,
            method: formData.method,
            day_of_month: parseInt(recurringData.day_of_month),
            start_month: recurringData.start_month,
            end_month: recurringData.ongoing ? null : (recurringData.end_month || null)
          })
        });

        if (!recurringResponse.ok) {
          const errorData = await recurringResponse.json();
          throw new Error(errorData.error || 'Failed to create recurring template');
        }
      }
      
      setMessage({ 
        text: isRecurring ? 'Expense and recurring template added successfully!' : 'Expense added successfully!', 
        type: 'success' 
      });
      
      // Clear form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        place: '',
        notes: '',
        amount: '',
        type: 'Other',
        method: 'Cash'
      });
      
      setIsRecurring(false);
      setRecurringData({
        day_of_month: '',
        start_month: '',
        end_month: '',
        ongoing: false
      });

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

          <div className="form-group">
            <label htmlFor="amount">Amount *</label>
            <input
              type="number"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="type">Type *</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
            >
              {typeOptions.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="method">Payment Method *</label>
            <select
              id="method"
              name="method"
              value={formData.method}
              onChange={handleChange}
              required
            >
              {methodOptions.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="place">Place</label>
          <input
            type="text"
            id="place"
            name="place"
            value={formData.place}
            onChange={handleChange}
            maxLength="200"
            placeholder="Where was this expense?"
          />
        </div>

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

        <div className="form-group recurring-checkbox">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            <span>🔄 Make this a recurring expense</span>
          </label>
        </div>

        {isRecurring && (
          <div className="recurring-fields">
            <div className="recurring-section-title">Recurring Settings</div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="day_of_month">Day of Month *</label>
                <input
                  type="number"
                  id="day_of_month"
                  name="day_of_month"
                  value={recurringData.day_of_month}
                  onChange={handleRecurringChange}
                  min="1"
                  max="31"
                  placeholder="1-31"
                  required={isRecurring}
                />
                <small className="field-hint">Day when expense occurs each month</small>
              </div>

              <div className="form-group">
                <label htmlFor="start_month">Start Month *</label>
                <input
                  type="month"
                  id="start_month"
                  name="start_month"
                  value={recurringData.start_month}
                  onChange={handleRecurringChange}
                  required={isRecurring}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="end_month">End Month</label>
                <input
                  type="month"
                  id="end_month"
                  name="end_month"
                  value={recurringData.end_month}
                  onChange={handleRecurringChange}
                  disabled={recurringData.ongoing}
                />
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="ongoing"
                    checked={recurringData.ongoing}
                    onChange={handleRecurringChange}
                  />
                  <span>Ongoing (no end date)</span>
                </label>
              </div>
            </div>
          </div>
        )}

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
