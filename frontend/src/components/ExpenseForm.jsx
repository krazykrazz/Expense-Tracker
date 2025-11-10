import React, { useState } from 'react';
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

  const [message, setMessage] = useState({ text: '', type: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeOptions = ['Other', 'Food', 'Gas'];
  const methodOptions = ['Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
      
      setMessage({ text: 'Expense added successfully!', type: 'success' });
      
      // Clear form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        place: '',
        notes: '',
        amount: '',
        type: 'Other',
        method: 'Cash'
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
