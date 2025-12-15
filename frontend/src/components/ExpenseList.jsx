import { useState, useEffect, memo, useMemo } from 'react';
import { API_ENDPOINTS } from '../config';
import { PAYMENT_METHODS } from '../utils/constants';
import { getPeople } from '../services/peopleApi';
import { getExpenseWithPeople, updateExpense } from '../services/expenseApi';
import PersonAllocationModal from './PersonAllocationModal';
import './ExpenseList.css';
import { formatAmount, formatLocalDate } from '../utils/formatters';

/**
 * Renders people indicator for medical expenses
 * Shows person icon with count for assigned expenses, or "unassigned" indicator
 * Displays allocation amounts for multi-person expenses
 */
const PeopleIndicator = ({ expense }) => {
  if (expense.type !== 'Tax - Medical') {
    return null;
  }

  const people = expense.people || [];
  const hasPeople = people.length > 0;

  if (!hasPeople) {
    return (
      <span 
        className="people-indicator unassigned"
        title="Medical expense not assigned to any person"
        aria-label="Unassigned medical expense"
      >
        <span className="unassigned-icon">⚠️</span>
        <span className="unassigned-text">Unassigned</span>
      </span>
    );
  }

  // Build detailed tooltip with person names, amounts, and date of birth if available
  const tooltipLines = people.map(p => {
    let line = p.name;
    if (people.length > 1) {
      line += `: $${formatAmount(p.amount)}`;
    }
    if (p.dateOfBirth) {
      line += ` (DOB: ${p.dateOfBirth})`;
    }
    return line;
  });
  
  const tooltipContent = tooltipLines.join('\n');

  // For single person, just show the name
  // For multiple people, show names with allocation amounts
  const displayContent = people.length === 1 
    ? people[0].name
    : people.map(p => `${p.name} ($${formatAmount(p.amount)})`).join(', ');

  return (
    <span 
      className="people-indicator assigned"
      title={tooltipContent}
      aria-label={`Assigned to ${people.length} ${people.length === 1 ? 'person' : 'people'}: ${people.map(p => p.name).join(', ')}`}
    >
      <span className="person-icon">👤</span>
      {people.length > 1 && (
        <span className="person-count">{people.length}</span>
      )}
      <span className="person-names">
        {displayContent}
      </span>
    </span>
  );
};

const ExpenseList = memo(({ expenses, onExpenseDeleted, onExpenseUpdated, onAddExpense, people: propPeople }) => {
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
  // People selection state for medical expenses
  const [localPeople, setLocalPeople] = useState([]);
  const people = propPeople || localPeople;
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [showPersonAllocation, setShowPersonAllocation] = useState(false);

  // Fetch categories and people on mount
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

    fetchCategories();
    fetchPeopleData();

    return () => {
      isMounted = false;
    };
  }, [propPeople]);

  const handleEditClick = async (expense) => {
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
    
    // Load people assignments for medical expenses
    if (expense.type === 'Tax - Medical') {
      try {
        const expenseWithPeople = await getExpenseWithPeople(expense.id);
        if (expenseWithPeople.people && expenseWithPeople.people.length > 0) {
          setSelectedPeople(expenseWithPeople.people.map(p => ({
            id: p.personId,
            name: p.name,
            amount: p.amount
          })));
        } else {
          setSelectedPeople([]);
        }
      } catch (error) {
        console.error('Failed to load people for expense:', error);
        setSelectedPeople([]);
      }
    } else {
      setSelectedPeople([]);
    }
    
    setShowEditModal(true);
    setEditMessage({ text: '', type: '' });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear people selection when changing away from medical expenses
    if (name === 'type' && value !== 'Tax - Medical') {
      setSelectedPeople([]);
    }
  };

  // Handle people selection for medical expenses
  const handleEditPeopleChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => ({
      id: parseInt(option.value),
      name: option.text
    }));
    setSelectedPeople(selectedOptions);
  };

  // Handle person allocation modal save
  const handleEditPersonAllocation = (allocations) => {
    setShowPersonAllocation(false);
    setSelectedPeople(allocations);
  };

  // Check if current expense type is medical
  const isEditingMedicalExpense = editFormData.type === 'Tax - Medical';

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditMessage({ text: '', type: '' });

    // For medical expenses with multiple people, show allocation modal if amounts not set
    if (isEditingMedicalExpense && selectedPeople.length > 1 && !selectedPeople[0].amount) {
      setShowPersonAllocation(true);
      return;
    }

    setIsSubmitting(true);

    try {
      // Ensure date is in YYYY-MM-DD format
      const dateValue = editFormData.date.includes('T') ? editFormData.date.split('T')[0] : editFormData.date;
      
      // Prepare people allocations for medical expenses
      let peopleAllocations = null;
      if (isEditingMedicalExpense && selectedPeople.length > 0) {
        if (selectedPeople.length === 1) {
          // Single person - assign full amount
          peopleAllocations = [{
            personId: selectedPeople[0].id,
            amount: parseFloat(editFormData.amount)
          }];
        } else {
          // Multiple people - use allocated amounts
          peopleAllocations = selectedPeople.map(person => ({
            personId: person.id,
            amount: person.amount
          }));
        }
      } else if (isEditingMedicalExpense) {
        // Medical expense with no people selected - clear allocations
        peopleAllocations = [];
      }

      const updatedExpense = await updateExpense(expenseToEdit.id, {
        date: dateValue,
        place: editFormData.place,
        notes: editFormData.notes,
        amount: parseFloat(editFormData.amount),
        type: editFormData.type,
        method: editFormData.method
      }, peopleAllocations);
      
      // Notify parent component to update the expense
      if (onExpenseUpdated) {
        onExpenseUpdated(updatedExpense);
      }
      
      setShowEditModal(false);
      setExpenseToEdit(null);
      setSelectedPeople([]);
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
    setSelectedPeople([]);
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
                  <div className="place-cell">
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
                    <PeopleIndicator expense={expense} />
                  </div>
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

              {/* People Selection for Medical Expenses */}
              {isEditingMedicalExpense && (
                <div className="form-group">
                  <label htmlFor="edit-people">Assign to People</label>
                  <select
                    id="edit-people"
                    name="people"
                    multiple
                    value={selectedPeople.map(p => p.id.toString())}
                    onChange={handleEditPeopleChange}
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

      {/* Person Allocation Modal for Edit */}
      <PersonAllocationModal
        isOpen={showPersonAllocation}
        expense={{ amount: parseFloat(editFormData.amount) || 0 }}
        selectedPeople={selectedPeople}
        onSave={handleEditPersonAllocation}
        onCancel={() => setShowPersonAllocation(false)}
      />
    </div>
  );
});

ExpenseList.displayName = 'ExpenseList';

export default ExpenseList;
