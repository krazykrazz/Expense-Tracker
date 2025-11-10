import React, { useState, useEffect } from 'react';
import './RecurringExpenseForm.css';

const RecurringExpenseForm = ({ template, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    place: '',
    amount: '',
    notes: '',
    type: 'Other',
    method: 'Cash',
    day_of_month: '',
    start_month: '',
    end_month: '',
    ongoing: false
  });

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeOptions = ['Other', 'Food', 'Gas'];
  const methodOptions = ['Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

  useEffect(() => {
    if (template) {
      setFormData({
        place: template.place || '',
        amount: template.amount || '',
        notes: template.notes || '',
        type: template.type || 'Other',
        method: template.method || 'Cash',
        day_of_month: template.day_of_month || '',
        start_month: template.start_month || '',
        end_month: template.end_month || '',
        ongoing: !template.end_month
      });
    }
  }, [template]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'ongoing') {
      setFormData(prev => ({
        ...prev,
        ongoing: checked,
        end_month: checked ? '' : prev.end_month
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const validateForm = () => {
    if (!formData.place || formData.place.trim() === '') {
      setMessage({ text: 'Place is required', type: 'error' });
      return false;
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setMessage({ text: 'Amount must be a positive number', type: 'error' });
      return false;
    }
    if (!formData.day_of_month || formData.day_of_month < 1 || formData.day_of_month > 31) {
      setMessage({ text: 'Day of month must be between 1 and 31', type: 'error' });
      return false;
    }
    if (!formData.start_month) {
      setMessage({ text: 'Start month is required', type: 'error' });
      return false;
    }
    if (!formData.ongoing && formData.end_month && formData.end_month < formData.start_month) {
      setMessage({ text: 'End month must be after or equal to start month', type: 'error' });
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
      const payload = {
        place: formData.place.trim(),
        amount: parseFloat(formData.amount),
        notes: formData.notes.trim(),
        type: formData.type,
        method: formData.method,
        day_of_month: parseInt(formData.day_of_month),
        start_month: formData.start_month,
        end_month: formData.ongoing ? null : (formData.end_month || null)
      };

      const url = template ? `/api/recurring/${template.id}` : '/api/recurring';
      const method = template ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save recurring expense');
      }

      const savedTemplate = await response.json();
      
      setMessage({ 
        text: template ? 'Recurring expense updated successfully!' : 'Recurring expense created successfully!', 
        type: 'success' 
      });

      // Call onSave after a brief delay to show success message
      setTimeout(() => {
        if (onSave) {
          onSave(savedTemplate);
        }
      }, 1000);

    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="recurring-form-container">
      <h2>{template ? 'Edit Recurring Expense' : 'Add Recurring Expense'}</h2>
      <form onSubmit={handleSubmit} className="recurring-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="place">Place *</label>
            <input
              type="text"
              id="place"
              name="place"
              value={formData.place}
              onChange={handleChange}
              maxLength="200"
              placeholder="e.g., Netflix, Rent"
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

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="day_of_month">Day of Month *</label>
            <input
              type="number"
              id="day_of_month"
              name="day_of_month"
              value={formData.day_of_month}
              onChange={handleChange}
              min="1"
              max="31"
              placeholder="1-31"
              required
            />
            <small className="field-hint">Day when expense occurs each month</small>
          </div>

          <div className="form-group">
            <label htmlFor="start_month">Start Month *</label>
            <input
              type="month"
              id="start_month"
              name="start_month"
              value={formData.start_month}
              onChange={handleChange}
              required
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
              value={formData.end_month}
              onChange={handleChange}
              disabled={formData.ongoing}
            />
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="ongoing"
                checked={formData.ongoing}
                onChange={handleChange}
              />
              <span>Ongoing (no end date)</span>
            </label>
          </div>
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

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="form-actions">
          <button 
            type="button" 
            onClick={onCancel}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="submit-button"
          >
            {isSubmitting ? 'Saving...' : (template ? 'Update' : 'Create')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RecurringExpenseForm;
