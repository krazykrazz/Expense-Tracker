import { useState, useEffect, memo, useMemo } from 'react';
import { API_ENDPOINTS } from '../config';
import { PAYMENT_METHODS } from '../utils/constants';
import './ExpenseList.css';
import { formatAmount, formatLocalDate } from '../utils/formatters';

const ExpenseList = memo(({ expenses, onExpenseDeleted, onExpenseUpdated, searchText, onAddExpense }) => {
  const [deletingId, setDeletingId] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editMessage, setEditMessage] = useState({ text: '', type: '' });
  const [categories, setCategories] = useState([]);
  // Local filters for monthly view only (don't trigger global view)
  const [localFilterType, setLocalFilterType] = useState('');
  const [localFilterMethod, setLocalFilterMethod] = useState('');

  // Fetch categories on mount
  useEffect(() => {
    let isMounted = true;

    const fetchCategories = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.CATEGORIES);
        if (!response.ok) {
          throw new Error('Failed to fetch categories');
        }
        const data = await response.json();
        if (isMounted) {
          setCategories(data.categories || []);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching categories:', err);
          // Fallback to empty array if fetch fails
          setCategories([]);
        }
      }
    };

    fetchCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleEditClick = (expense) => {
    setExpenseToEdit(expense);
    // Ensure date is in YYYY-MM-DD format for the date input
    const dateValue = expense.date.includes('T') ? expense.date.split('T')[0] : expense.date;
    setEditFormData({
      date: dateValue,
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
      // Ensure date is in YYYY-MM-DD format
      const dateValue = editFormData.date.includes('T') ? editFormData.date.split('T')[0] : editFormData.date;
      
      const response = await fetch(API_ENDPOINTS.EXPENSE_BY_ID(expenseToEdit.id), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: dateValue,
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
      
      // Notify parent component to update the expense
      if (onExpenseUpdated) {
        onExpenseUpdated(updatedExpense);
      }
      
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

  const formatDate = formatLocalDate;

  // Filter expenses based on local filters (for current month only)
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Apply local type filter
      if (localFilterType && expense.type !== localFilterType) {
        return false;
      }
      // Apply local method filter
      if (localFilterMethod && expense.method !== localFilterMethod) {
        return false;
      }
      return true;
    });
  }, [expenses, localFilterType, localFilterMethod]);

  /**
   * Generates informative status messages based on filter state
   * 
   * Provides contextual feedback to users about:
   * - Why no expenses are shown (no data vs. filters excluding all results)
   * - How many expenses match the current filters
   * - What filters are currently active
   * 
   * This improves UX by making the filtering behavior transparent and
   * helping users understand why they're seeing (or not seeing) certain expenses.
   * 
   * @returns {string|null} Status message or null if no message needed
   */
  const getFilterStatusMessage = () => {
    if (filteredExpenses.length === 0 && expenses.length > 0) {
      // Expenses exist but all filtered out by local filters
      const activeFilters = [];
      if (localFilterType) activeFilters.push(`category: ${localFilterType}`);
      if (localFilterMethod) activeFilters.push(`payment: ${localFilterMethod}`);
      
      return `No expenses match the selected filters (${activeFilters.join(', ')}). Try adjusting your filters or clearing them to see all expenses.`;
    }
    
    if (expenses.length === 0) {
      // No expenses at all for this month
      return 'No expenses have been recorded for this period.';
    }
    
    // Show result count when local filters are active
    if (localFilterType || localFilterMethod) {
      const activeFilters = [];
      if (localFilterType) activeFilters.push(localFilterType);
      if (localFilterMethod) activeFilters.push(localFilterMethod);
      
      const expenseWord = filteredExpenses.length === 1 ? 'expense' : 'expenses';
      return `Showing ${filteredExpenses.length} ${expenseWord} matching: ${activeFilters.join(', ')}`;
    }
    
    return null;
  };

  const filterStatusMessage = getFilterStatusMessage();
  const noExpensesMessage = filteredExpenses.length === 0 ? filterStatusMessage : null;

  return (
    <div className="expense-list-container">
      <div className="expense-list-header">
        <h2>Expense List</h2>
        <div className="header-controls">
          <div className="filter-controls">
            <select 
              className="filter-select"
              value={localFilterType} 
              onChange={(e) => setLocalFilterType(e.target.value)}
              title="Filter by type (current month only)"
            >
              <option value="">All Types</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select 
              className="filter-select"
              value={localFilterMethod} 
              onChange={(e) => setLocalFilterMethod(e.target.value)}
              title="Filter by payment method (current month only)"
            >
              <option value="">All Methods</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            {(localFilterType || localFilterMethod) && (
              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setLocalFilterType('');
                  setLocalFilterMethod('');
                }}
                title="Clear filters"
              >
                ✕
              </button>
            )}
          </div>
          <button 
            className="add-expense-button" 
            onClick={onAddExpense}
            aria-label="Add new expense"
          >
            + Add Expense
          </button>
        </div>
      </div>

      {noExpensesMessage && (
        <div className="no-expenses-message">
          {noExpensesMessage}
        </div>
      )}

      {filterStatusMessage && filteredExpenses.length > 0 && (
        <div className="filter-status-message">
          {filterStatusMessage}
        </div>
      )}

      {!noExpensesMessage && (
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
            {filteredExpenses.map((expense) => (
              <tr 
                key={expense.id}
                className={
                  expense.type === 'Tax - Medical' ? 'tax-medical-row' : 
                  expense.type === 'Tax - Donation' ? 'tax-donation-row' : ''
                }
              >
                <td>{formatDate(expense.date)}</td>
                <td>
                  {expense.is_generated ? (
                    <span className="place-with-recurring">
                      <span 
                        className="recurring-indicator" 
                        title={expense.template_deleted ? "Template deleted" : "Generated from recurring template"}
                        aria-label={expense.template_deleted ? "Template deleted" : "Generated from recurring template"}
                        style={expense.template_deleted ? { opacity: 0.5 } : {}}
                      >
                        🔄
                      </span>
                      {expense.place || '-'}
                      {expense.template_deleted && (
                        <span className="template-deleted-badge" title="The recurring template for this expense has been deleted">
                          (template deleted)
                        </span>
                      )}
                    </span>
                  ) : (
                    expense.place || '-'
                  )}
                </td>
                <td>{expense.notes || '-'}</td>
                <td className={`amount ${expense.amount >= 350 ? 'high-amount' : ''}`}>
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
      )}

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
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
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
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
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
});

ExpenseList.displayName = 'ExpenseList';

export default ExpenseList;
