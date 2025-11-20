import { useState, useEffect } from 'react';
import './FixedExpensesModal.css';
import {
  getMonthlyFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  carryForwardFixedExpenses
} from '../services/fixedExpenseApi';
import { validateName, validateAmount } from '../utils/validation';
import { getMonthNameLong } from '../utils/formatters';

const FixedExpensesModal = ({ isOpen, onClose, year, month, onUpdate }) => {
  const [fixedExpenses, setFixedExpenses] = useState([]);
  const [totalFixed, setTotalFixed] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCarryingForward, setIsCarryingForward] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({
    addName: '',
    addAmount: '',
    editName: '',
    editAmount: ''
  });

  // Fetch fixed expenses when modal opens or year/month changes
  useEffect(() => {
    if (isOpen) {
      fetchFixedExpenses();
    }
  }, [isOpen, year, month]);

  const fetchFixedExpenses = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMonthlyFixedExpenses(year, month);
      setFixedExpenses(data.items || []);
      setTotalFixed(data.total || 0);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load fixed expenses. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching fixed expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = (expenses) => {
    return expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
  };

  const clearValidationErrors = () => {
    setValidationErrors({
      addName: '',
      addAmount: '',
      editName: '',
      editAmount: ''
    });
  };

  const handleAddExpense = async () => {
    // Clear previous validation errors and general errors
    const newErrors = { ...validationErrors };
    setError(null);
    
    // Validate inputs
    const nameError = validateName(newExpenseName);
    const amountError = validateAmount(newExpenseAmount);
    
    newErrors.addName = nameError;
    newErrors.addAmount = amountError;
    setValidationErrors(newErrors);
    
    // If there are validation errors, don't proceed
    if (nameError || amountError) {
      setError('Please fix the validation errors before submitting.');
      return;
    }

    const amount = parseFloat(newExpenseAmount);

    setLoading(true);

    try {
      const createdExpense = await createFixedExpense({
        year,
        month,
        name: newExpenseName.trim(),
        amount
      });
      
      // Update local state
      const updatedExpenses = [...fixedExpenses, createdExpense];
      setFixedExpenses(updatedExpenses);
      setTotalFixed(calculateTotal(updatedExpenses));

      // Reset form
      setNewExpenseName('');
      setNewExpenseAmount('');
      setIsAdding(false);
      clearValidationErrors();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to add fixed expense. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error creating fixed expense:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditExpense = (expense) => {
    setEditingId(expense.id);
    setEditName(expense.name);
    setEditAmount(expense.amount.toString());
  };

  const handleSaveEdit = async () => {
    // Clear previous validation errors and general errors
    const newErrors = { ...validationErrors };
    setError(null);
    
    // Validate inputs
    const nameError = validateName(editName);
    const amountError = validateAmount(editAmount);
    
    newErrors.editName = nameError;
    newErrors.editAmount = amountError;
    setValidationErrors(newErrors);
    
    // If there are validation errors, don't proceed
    if (nameError || amountError) {
      setError('Please fix the validation errors before saving.');
      return;
    }

    const amount = parseFloat(editAmount);

    setLoading(true);

    try {
      const updatedExpense = await updateFixedExpense(editingId, {
        name: editName.trim(),
        amount
      });
      
      // Update local state
      const updatedExpenses = fixedExpenses.map(expense =>
        expense.id === editingId ? updatedExpense : expense
      );
      setFixedExpenses(updatedExpenses);
      setTotalFixed(calculateTotal(updatedExpenses));

      // Reset edit state
      setEditingId(null);
      setEditName('');
      setEditAmount('');
      clearValidationErrors();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to update fixed expense. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error updating fixed expense:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    clearValidationErrors();
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Are you sure you want to delete this fixed expense?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteFixedExpense(id);

      // Update local state
      const updatedExpenses = fixedExpenses.filter(expense => expense.id !== id);
      setFixedExpenses(updatedExpenses);
      setTotalFixed(calculateTotal(updatedExpenses));
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete fixed expense. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error deleting fixed expense:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCarryForward = async () => {
    // Show confirmation if current month already has items
    if (fixedExpenses.length > 0) {
      if (!window.confirm('This month already has fixed expenses. Carry forward from previous month will add more items. Continue?')) {
        return;
      }
    }

    setIsCarryingForward(true);
    setError(null);

    try {
      const data = await carryForwardFixedExpenses(year, month);
      
      // Display message if previous month has no items
      if (data.count === 0) {
        alert('No fixed expenses found in previous month to carry forward.');
      } else {
        // Refresh the fixed expenses list
        await fetchFixedExpenses();
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to carry forward fixed expenses. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error carrying forward fixed expenses:', err);
    } finally {
      setIsCarryingForward(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setIsAdding(false);
    setNewExpenseName('');
    setNewExpenseAmount('');
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setError(null);
    clearValidationErrors();
    
    // Call parent's onUpdate to refresh summary
    if (onUpdate) {
      onUpdate();
    }
    
    onClose();
  };



  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed-expenses-modal-overlay" onClick={handleClose}>
      <div className="fixed-expenses-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="fixed-expenses-modal-header">
          <h2>Manage Fixed Expenses - {getMonthNameLong(month)} {year}</h2>
          <button className="fixed-expenses-modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="fixed-expenses-carry-forward-section">
          <button
            className="fixed-expenses-carry-forward-button"
            onClick={handleCarryForward}
            disabled={loading || isCarryingForward}
          >
            {isCarryingForward ? 'Carrying Forward...' : '📋 Carry Forward from Previous Month'}
          </button>
        </div>

        {error && (
          <div className="fixed-expenses-modal-error">
            <div>{error}</div>
            {fixedExpenses.length === 0 && !loading && (
              <button 
                className="fixed-expenses-error-retry-button" 
                onClick={fetchFixedExpenses}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="fixed-expenses-modal-content">
          {loading && fixedExpenses.length === 0 ? (
            <div className="fixed-expenses-modal-loading">Loading fixed expenses...</div>
          ) : (
            <>
              <div className="fixed-expenses-list">
                {fixedExpenses.length === 0 ? (
                  <div className="fixed-expenses-empty">
                    No fixed expenses for this month. Add one below or carry forward from previous month.
                  </div>
                ) : (
                  fixedExpenses.map((expense) => (
                    <div key={expense.id} className="fixed-expense-item">
                      {editingId === expense.id ? (
                        <div className="fixed-expense-edit">
                          <div className="fixed-expense-input-group">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Fixed expense name"
                              className={`fixed-expense-edit-name ${validationErrors.editName ? 'input-error' : ''}`}
                              disabled={loading}
                            />
                            {validationErrors.editName && (
                              <span className="validation-error">{validationErrors.editName}</span>
                            )}
                          </div>
                          <div className="fixed-expense-input-group">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className={`fixed-expense-edit-amount ${validationErrors.editAmount ? 'input-error' : ''}`}
                              disabled={loading}
                            />
                            {validationErrors.editAmount && (
                              <span className="validation-error">{validationErrors.editAmount}</span>
                            )}
                          </div>
                          <button
                            className="fixed-expense-save-button"
                            onClick={handleSaveEdit}
                            disabled={loading}
                          >
                            {loading ? '...' : '✓'}
                          </button>
                          <button
                            className="fixed-expense-cancel-button"
                            onClick={handleCancelEdit}
                            disabled={loading}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="fixed-expense-display">
                          <span className="fixed-expense-name">{expense.name}</span>
                          <span className="fixed-expense-amount">
                            ${parseFloat(expense.amount).toFixed(2)}
                          </span>
                          <div className="fixed-expense-actions">
                            <button
                              className="fixed-expense-edit-button"
                              onClick={() => handleEditExpense(expense)}
                              disabled={loading}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="fixed-expense-delete-button"
                              onClick={() => handleDeleteExpense(expense.id)}
                              disabled={loading}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="fixed-expenses-add-section">
                {!isAdding ? (
                  <button
                    className="fixed-expenses-add-toggle-button"
                    onClick={() => setIsAdding(true)}
                    disabled={loading}
                  >
                    + Add Fixed Expense
                  </button>
                ) : (
                  <div className="fixed-expenses-add-form">
                    <div className="fixed-expense-input-group">
                      <input
                        type="text"
                        value={newExpenseName}
                        onChange={(e) => setNewExpenseName(e.target.value)}
                        placeholder="Fixed expense name (e.g., Rent)"
                        className={`fixed-expense-add-name ${validationErrors.addName ? 'input-error' : ''}`}
                        disabled={loading}
                      />
                      {validationErrors.addName && (
                        <span className="validation-error">{validationErrors.addName}</span>
                      )}
                    </div>
                    <div className="fixed-expense-input-group">
                      <input
                        type="number"
                        value={newExpenseAmount}
                        onChange={(e) => setNewExpenseAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`fixed-expense-add-amount ${validationErrors.addAmount ? 'input-error' : ''}`}
                        disabled={loading}
                      />
                      {validationErrors.addAmount && (
                        <span className="validation-error">{validationErrors.addAmount}</span>
                      )}
                    </div>
                    <button
                      className="fixed-expenses-add-button"
                      onClick={handleAddExpense}
                      disabled={loading}
                    >
                      {loading ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      className="fixed-expenses-add-cancel-button"
                      onClick={() => {
                        setIsAdding(false);
                        setNewExpenseName('');
                        setNewExpenseAmount('');
                        clearValidationErrors();
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="fixed-expenses-total-section">
                <span className="fixed-expenses-total-label">Total Fixed Expenses:</span>
                <span className="fixed-expenses-total-amount">
                  ${totalFixed.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FixedExpensesModal;
