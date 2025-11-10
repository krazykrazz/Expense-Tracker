import React, { useState } from 'react';
import { API_ENDPOINTS } from '../config';
import './ExpenseList.css';

const ExpenseList = ({ expenses, onExpenseDeleted, searchText }) => {
  const [deletingId, setDeletingId] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editMessage, setEditMessage] = useState({ text: '', type: '' });

  const handleEditClick = (expense) => {
    setExpenseToEdit(expense);
    setEditFormData({
      date: expense.date,
      place: expense.place || '',
      notes: expense.notes || '',
      amount: expense.amount.toString(),
      type: expense.type,
      method: expense.method
    });
    setShowEditModal(true);
    setEditMessage({ text: '', type: '' });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditMessage({ text: '', type: '' });
    setIsSubmitting(true);

    try {
      const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(expenseToEdit.id), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: editFormData.date,
          place: editFormData.place,
          notes: editFormData.notes,
          amount: parseFloat(editFormData.amount),
          type: editFormData.type,
          method: editFormData.method
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update expense');
      }

      const updatedExpense = await response.json();
      
      // Update the expense in the list
      window.location.reload(); // Simple refresh to update all data
      
      setShowEditModal(false);
      setExpenseToEdit(null);
    } catch (error) {
      console.error('Error updating expense:', error);
      setEditMessage({ text: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setExpenseToEdit(null);
    setEditFormData({});
    setEditMessage({ text: '', type: '' });
  };

  const handleDeleteClick = (expense) => {
    setExpenseToDelete(expense);
    setShowConfirmDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;

    setDeletingId(expenseToDelete.id);
    setShowConfirmDialog(false);

    try {
      const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(expenseToDelete.id), {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete expense');
      }

      // Notify parent component
      if (onExpenseDeleted) {
        onExpenseDeleted(expenseToDelete.id);
      }
    } catch (error) {
      console.error('Error deleting expense:', error);
      alert('Failed to delete expense. Please try again.');
    } finally {
      setDeletingId(null);
      setExpenseToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmDialog(false);
    setExpenseToDelete(null);
  };

  const formatAmount = (amount) => {
    return parseFloat(amount).toFixed(2);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (expenses.length === 0) {
    const message = searchText 
      ? 'No results found for your search.' 
      : 'No expenses have been recorded for this period.';
    
    return (
      <div className="expense-list-container">
        <h2>Expense List</h2>
        <div className="no-expenses-message">
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className="expense-list-container">
      <h2>Expense List</h2>
      <div className="table-wrapper">
        <table className="expense-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Place</th>
              <th>Notes</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Week</th>
              <th>Method</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td>{formatDate(expense.date)}</td>
                <td>{expense.place || '-'}</td>
                <td>{expense.notes || '-'}</td>
                <td className={`amount ${expense.amount > 400 ? 'high-amount' : ''}`}>
                  ${formatAmount(expense.amount)}
                </td>
                <td>{expense.type}</td>
                <td>{expense.week}</td>
                <td>{expense.method}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="edit-button"
                      onClick={() => handleEditClick(expense)}
                      disabled={deletingId === expense.id}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDeleteClick(expense)}
                      disabled={deletingId === expense.id}
                    >
                      {deletingId === expense.id ? 'Deleting...' : '🗑️ Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showConfirmDialog && (
        <div className="modal-overlay">
          <div className="confirm-dialog">
            <h3>Confirm Delete</h3>
            <p>Are you sure you want to delete this expense?</p>
            {expenseToDelete && (
              <div className="expense-details">
                <p><strong>Date:</strong> {formatDate(expenseToDelete.date)}</p>
                <p><strong>Amount:</strong> ${formatAmount(expenseToDelete.amount)}</p>
                <p><strong>Place:</strong> {expenseToDelete.place || '-'}</p>
              </div>
            )}
            <div className="dialog-actions">
              <button 
                className="cancel-button" 
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button 
                className="confirm-button" 
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && expenseToEdit && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={handleCancelEdit}
              aria-label="Close"
            >
              ×
            </button>
            <h3>Edit Expense</h3>
            <form onSubmit={handleEditSubmit} className="edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-date">Date *</label>
                  <input
                    type="date"
                    id="edit-date"
                    name="date"
                    value={editFormData.date}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-amount">Amount *</label>
                  <input
                    type="number"
                    id="edit-amount"
                    name="amount"
                    value={editFormData.amount}
                    onChange={handleEditChange}
                    step="0.01"
                    min="0.01"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-type">Type *</label>
                  <select
                    id="edit-type"
                    name="type"
                    value={editFormData.type}
                    onChange={handleEditChange}
                    required
                  >
                    <option value="Other">Other</option>
                    <option value="Food">Food</option>
                    <option value="Gas">Gas</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="edit-method">Payment Method *</label>
                  <select
                    id="edit-method"
                    name="method"
                    value={editFormData.method}
                    onChange={handleEditChange}
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="Debit">Debit</option>
                    <option value="CIBC MC">CIBC MC</option>
                    <option value="PCF MC">PCF MC</option>
                    <option value="WS VISA">WS VISA</option>
                    <option value="VISA">VISA</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-place">Place</label>
                <input
                  type="text"
                  id="edit-place"
                  name="place"
                  value={editFormData.place}
                  onChange={handleEditChange}
                  maxLength="200"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-notes">Notes</label>
                <textarea
                  id="edit-notes"
                  name="notes"
                  value={editFormData.notes}
                  onChange={handleEditChange}
                  maxLength="200"
                  rows="3"
                />
              </div>

              {editMessage.text && (
                <div className={`message ${editMessage.type}`}>
                  {editMessage.text}
                </div>
              )}

              <div className="dialog-actions">
                <button 
                  type="button"
                  className="cancel-button" 
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="save-button" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
