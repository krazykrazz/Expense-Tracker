import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import { PAYMENT_METHODS } from '../utils/constants';
import { getPeople } from '../services/peopleApi';
import { getExpenseWithPeople, updateExpense } from '../services/expenseApi';
import { getInvoicesForExpense, updateInvoicePersonLink } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';
import PersonAllocationModal from './PersonAllocationModal';
import InvoiceIndicator from './InvoiceIndicator';
import InvoiceUpload from './InvoiceUpload';
import './ExpenseList.css';
import { formatAmount, formatLocalDate } from '../utils/formatters';

const logger = createLogger('ExpenseList');

// Future months dropdown options (Requirements 2.1, 2.2)
const FUTURE_MONTHS_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 11, label: "11" },
  { value: 12, label: "12" }
];

/**
 * Calculate the future date range preview text
 * @param {string} sourceDate - The source date in YYYY-MM-DD format
 * @param {number} futureMonths - Number of future months
 * @returns {string} Preview text showing the date range
 */
const calculateFutureDatePreview = (sourceDate, futureMonths) => {
  if (!sourceDate || futureMonths <= 0) return '';
  
  const date = new Date(sourceDate + 'T00:00:00');
  const sourceDay = date.getDate();
  
  // Calculate the last future month date
  const futureDate = new Date(date);
  futureDate.setMonth(futureDate.getMonth() + futureMonths);
  
  // Handle month-end edge cases
  const targetMonth = futureDate.getMonth();
  const daysInTargetMonth = new Date(futureDate.getFullYear(), targetMonth + 1, 0).getDate();
  
  if (sourceDay > daysInTargetMonth) {
    futureDate.setDate(daysInTargetMonth);
  } else {
    futureDate.setDate(sourceDay);
  }
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  return `through ${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()}`;
};

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

  // For single person, show inline
  // For multiple people, stack vertically with allocation amounts
  if (people.length === 1) {
    return (
      <span 
        className="people-indicator assigned"
        title={tooltipContent}
        aria-label={`Assigned to ${people[0].name}`}
      >
        <span className="person-icon">👤</span>
        <span className="person-names">{people[0].name}</span>
      </span>
    );
  }

  // Multiple people - stack vertically
  return (
    <div 
      className="people-indicator assigned multi-person"
      title={tooltipContent}
      aria-label={`Assigned to ${people.length} people: ${people.map(p => p.name).join(', ')}`}
    >
      <div className="people-header">
        <span className="person-icon">👤</span>
        <span className="person-count">{people.length}</span>
      </div>
      <div className="people-list-vertical">
        {people.map((p, index) => (
          <div key={index} className="person-row">
            <span className="person-name">{p.name}</span>
            <span className="person-amount">${formatAmount(p.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExpenseList = memo(({ expenses, onExpenseDeleted, onExpenseUpdated, onAddExpense, people: propPeople, currentMonthExpenseCount = 0 }) => {
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
  const [localFilterInvoice, setLocalFilterInvoice] = useState(''); // New invoice filter
  // People selection state for medical expenses
  const [localPeople, setLocalPeople] = useState([]);
  const people = propPeople || localPeople;
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [showPersonAllocation, setShowPersonAllocation] = useState(false);
  // Invoice state for editing - now supports multiple invoices
  const [editInvoices, setEditInvoices] = useState([]);
  // Invoice data cache - now stores arrays of invoices per expense
  const [invoiceData, setInvoiceData] = useState(new Map());
  const [loadingInvoices, setLoadingInvoices] = useState(new Set());
  // Future months state for edit form (Requirements 2.1, 2.2)
  const [editFutureMonths, setEditFutureMonths] = useState(0);

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
          logger.error('Error fetching categories:', err);
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
            logger.error('Failed to fetch people:', error);
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

  // Handle invoice data updates - now supports multiple invoices
  const handleInvoiceUpdated = useCallback((expenseId, newInvoice) => {
    setInvoiceData(prev => {
      const newMap = new Map(prev);
      const existingInvoices = newMap.get(expenseId) || [];
      // Add new invoice to the array
      newMap.set(expenseId, [...existingInvoices, newInvoice]);
      return newMap;
    });
  }, []);

  const handleInvoiceDeleted = useCallback((expenseId, invoiceId) => {
    setInvoiceData(prev => {
      const newMap = new Map(prev);
      const existingInvoices = newMap.get(expenseId) || [];
      // Remove the specific invoice from the array
      if (invoiceId) {
        newMap.set(expenseId, existingInvoices.filter(inv => inv.id !== invoiceId));
      } else {
        // If no invoiceId provided, clear all invoices (backward compatibility)
        newMap.set(expenseId, []);
      }
      return newMap;
    });
  }, []);

  // Handle person link updated for an invoice
  const handlePersonLinkUpdated = useCallback(async (expenseId, invoiceId, personId) => {
    try {
      const result = await updateInvoicePersonLink(invoiceId, personId);
      if (result.success) {
        // Update the invoice in local state
        setInvoiceData(prev => {
          const newMap = new Map(prev);
          const existingInvoices = newMap.get(expenseId) || [];
          newMap.set(expenseId, existingInvoices.map(inv => 
            inv.id === invoiceId 
              ? { ...inv, personId, personName: result.invoice?.personName || null }
              : inv
          ));
          return newMap;
        });
      }
    } catch (error) {
      logger.error('Failed to update invoice person link:', error);
    }
  }, []);

  // Load invoice data for tax-deductible expenses (medical and donations) - now fetches all invoices per expense
  useEffect(() => {
    const loadInvoiceData = async () => {
      const taxDeductibleExpenses = expenses.filter(expense => 
        expense.type === 'Tax - Medical' || expense.type === 'Tax - Donation'
      );
      const expensesToLoad = taxDeductibleExpenses.filter(expense => 
        !invoiceData.has(expense.id) && !loadingInvoices.has(expense.id)
      );

      if (expensesToLoad.length === 0) return;

      // Mark expenses as loading
      setLoadingInvoices(prev => {
        const newSet = new Set(prev);
        expensesToLoad.forEach(expense => newSet.add(expense.id));
        return newSet;
      });

      // Load all invoices for each expense
      const invoicePromises = expensesToLoad.map(async (expense) => {
        try {
          const invoices = await getInvoicesForExpense(expense.id);
          return { expenseId: expense.id, invoices: invoices || [] };
        } catch (error) {
          logger.error(`Failed to load invoices for expense ${expense.id}:`, error);
          return { expenseId: expense.id, invoices: [] };
        }
      });

      try {
        const results = await Promise.all(invoicePromises);
        
        setInvoiceData(prev => {
          const newMap = new Map(prev);
          results.forEach(({ expenseId, invoices }) => {
            newMap.set(expenseId, invoices);
          });
          return newMap;
        });
      } finally {
        // Remove from loading set
        setLoadingInvoices(prev => {
          const newSet = new Set(prev);
          expensesToLoad.forEach(expense => newSet.delete(expense.id));
          return newSet;
        });
      }
    };

    loadInvoiceData();
  }, [expenses, invoiceData, loadingInvoices]);

  const handleEditClick = useCallback(async (expense) => {
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
    
    // Reset future months to 0 when opening edit modal (Requirements 2.1)
    setEditFutureMonths(0);
    
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
        
        // Load invoices if exists - now supports multiple invoices
        const invoices = invoiceData.get(expense.id) || [];
        setEditInvoices(invoices);
      } catch (error) {
        logger.error('Failed to load people for expense:', error);
        setSelectedPeople([]);
        setEditInvoices([]);
      }
    } else if (expense.type === 'Tax - Donation') {
      // Load invoices for donation expenses (no people assignments)
      setSelectedPeople([]);
      const invoices = invoiceData.get(expense.id) || [];
      setEditInvoices(invoices);
    } else {
      setSelectedPeople([]);
      setEditInvoices([]);
    }
    
    setShowEditModal(true);
    setEditMessage({ text: '', type: '' });
  }, [invoiceData]);

  const handleEditChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear people selection when changing away from medical expenses
    if (name === 'type' && value !== 'Tax - Medical') {
      setSelectedPeople([]);
    }
  }, []);

  // Handle people selection for medical expenses
  const handleEditPeopleChange = useCallback((e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => ({
      id: parseInt(option.value),
      name: option.text
    }));
    setSelectedPeople(selectedOptions);
  }, []);

  // Handle person allocation modal save
  const handleEditPersonAllocation = useCallback((allocations) => {
    setShowPersonAllocation(false);
    setSelectedPeople(allocations);
  }, []);

  // Check if current expense type is medical or donation (tax-deductible)
  const isEditingMedicalExpense = editFormData.type === 'Tax - Medical';
  const isEditingDonationExpense = editFormData.type === 'Tax - Donation';
  const isEditingTaxDeductible = isEditingMedicalExpense || isEditingDonationExpense;

  const handleEditSubmit = useCallback(async (e) => {
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
      }, peopleAllocations, editFutureMonths);
      
      // Handle response format - may include futureExpenses array
      let resultExpense = updatedExpense;
      let futureExpensesResult = [];
      if (updatedExpense.expense) {
        resultExpense = updatedExpense.expense;
        futureExpensesResult = updatedExpense.futureExpenses || [];
      }
      
      // Build success message including future expenses info (Requirements 4.1, 4.2)
      if (futureExpensesResult.length > 0) {
        const datePreview = calculateFutureDatePreview(dateValue, futureExpensesResult.length);
        setEditMessage({ 
          text: `Expense updated and added to ${futureExpensesResult.length} future month${futureExpensesResult.length > 1 ? 's' : ''} ${datePreview}`, 
          type: 'success' 
        });
      }
      
      // Notify parent component to update the expense
      if (onExpenseUpdated) {
        onExpenseUpdated(resultExpense);
      }
      
      setShowEditModal(false);
      setExpenseToEdit(null);
      setSelectedPeople([]);
      setEditFutureMonths(0);
    } catch (error) {
      logger.error('Error updating expense:', error);
      setEditMessage({ text: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }, [editFormData, isEditingMedicalExpense, selectedPeople, expenseToEdit, onExpenseUpdated, editFutureMonths]);

  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setExpenseToEdit(null);
    setEditFormData({});
    setEditMessage({ text: '', type: '' });
    setSelectedPeople([]);
    setEditInvoices([]);
    setEditFutureMonths(0);
  }, []);

  // Handle invoice upload in edit modal - now supports multiple invoices
  const handleEditInvoiceUploaded = useCallback((invoice) => {
    setEditInvoices(prev => [...prev, invoice]);
    // Update the invoice data cache
    if (expenseToEdit) {
      setInvoiceData(prev => {
        const newMap = new Map(prev);
        const existingInvoices = newMap.get(expenseToEdit.id) || [];
        newMap.set(expenseToEdit.id, [...existingInvoices, invoice]);
        return newMap;
      });
    }
  }, [expenseToEdit]);

  // Handle invoice deletion in edit modal - now supports deleting specific invoice
  const handleEditInvoiceDeleted = useCallback((invoiceId) => {
    setEditInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    // Update the invoice data cache
    if (expenseToEdit) {
      setInvoiceData(prev => {
        const newMap = new Map(prev);
        const existingInvoices = newMap.get(expenseToEdit.id) || [];
        newMap.set(expenseToEdit.id, existingInvoices.filter(inv => inv.id !== invoiceId));
        return newMap;
      });
    }
  }, [expenseToEdit]);

  // Handle person link updated in edit modal
  const handleEditPersonLinkUpdated = useCallback(async (invoiceId, personId) => {
    try {
      const result = await updateInvoicePersonLink(invoiceId, personId);
      if (result.success) {
        // Update the invoice in local state
        setEditInvoices(prev => prev.map(inv => 
          inv.id === invoiceId 
            ? { ...inv, personId, personName: result.invoice?.personName || null }
            : inv
        ));
        // Update the invoice data cache
        if (expenseToEdit) {
          setInvoiceData(prev => {
            const newMap = new Map(prev);
            const existingInvoices = newMap.get(expenseToEdit.id) || [];
            newMap.set(expenseToEdit.id, existingInvoices.map(inv => 
              inv.id === invoiceId 
                ? { ...inv, personId, personName: result.invoice?.personName || null }
                : inv
            ));
            return newMap;
          });
        }
      }
    } catch (error) {
      logger.error('Failed to update invoice person link:', error);
    }
  }, [expenseToEdit]);

  const handleDeleteClick = useCallback((expense) => {
    setExpenseToDelete(expense);
    setShowConfirmDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
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
      logger.error('Error deleting expense:', error);
      alert('Failed to delete expense. Please try again.');
    } finally {
      setDeletingId(null);
      setExpenseToDelete(null);
    }
  }, [expenseToDelete, onExpenseDeleted]);

  const handleCancelDelete = useCallback(() => {
    setShowConfirmDialog(false);
    setExpenseToDelete(null);
  }, []);

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
      // Apply local invoice filter (only for medical expenses)
      if (localFilterInvoice) {
        // If invoice filter is active, only show tax-deductible expenses (medical and donations)
        if (expense.type !== 'Tax - Medical' && expense.type !== 'Tax - Donation') {
          return false;
        }
        
        const invoices = invoiceData.get(expense.id) || [];
        const hasInvoice = invoices.length > 0 || expense.hasInvoice === true || (expense.invoiceCount && expense.invoiceCount > 0);
        if (localFilterInvoice === 'with-invoice' && !hasInvoice) {
          return false;
        }
        if (localFilterInvoice === 'without-invoice' && hasInvoice) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, localFilterType, localFilterMethod, localFilterInvoice, invoiceData]);

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
      if (localFilterInvoice) {
        const invoiceFilterText = localFilterInvoice === 'with-invoice' ? 'with invoices' : 'without invoices';
        activeFilters.push(`${invoiceFilterText}`);
      }
      
      return `No expenses match the selected filters (${activeFilters.join(', ')}). Try adjusting your filters or clearing them to see all expenses.`;
    }
    
    if (expenses.length === 0) {
      // No expenses at all for this month
      return 'No expenses have been recorded for this period.';
    }
    
    // Show result count when local filters are active
    if (localFilterType || localFilterMethod || localFilterInvoice) {
      const activeFilters = [];
      if (localFilterType) activeFilters.push(localFilterType);
      if (localFilterMethod) activeFilters.push(localFilterMethod);
      if (localFilterInvoice) {
        const invoiceFilterText = localFilterInvoice === 'with-invoice' ? 'with invoices' : 'without invoices';
        activeFilters.push(invoiceFilterText);
      }
      
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
            <select 
              className="filter-select invoice-filter"
              value={localFilterInvoice} 
              onChange={(e) => setLocalFilterInvoice(e.target.value)}
              title="Filter medical expenses by invoice status"
            >
              <option value="">All Invoices</option>
              <option value="with-invoice">With Invoice</option>
              <option value="without-invoice">Without Invoice</option>
            </select>
            {(localFilterType || localFilterMethod || localFilterInvoice) && (
              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setLocalFilterType('');
                  setLocalFilterMethod('');
                  setLocalFilterInvoice('');
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
                    <div className="expense-indicators">
                      <PeopleIndicator expense={expense} />
                      {(expense.type === 'Tax - Medical' || expense.type === 'Tax - Donation') && (
                        <InvoiceIndicator
                          hasInvoice={(() => {
                            const invoices = invoiceData.get(expense.id) || [];
                            return invoices.length > 0 || expense.hasInvoice === true || (expense.invoiceCount && expense.invoiceCount > 0);
                          })()}
                          invoiceCount={(() => {
                            const invoices = invoiceData.get(expense.id) || [];
                            return invoices.length > 0 ? invoices.length : (expense.invoiceCount || 0);
                          })()}
                          invoices={invoiceData.get(expense.id) || []}
                          invoiceInfo={(() => {
                            const invoices = invoiceData.get(expense.id) || [];
                            return invoices.length > 0 ? invoices[0] : expense.invoice;
                          })()}
                          expenseId={expense.id}
                          size="small"
                          alwaysShow={true}
                          className={`list-item ${loadingInvoices.has(expense.id) ? 'loading' : ''}`}
                          onInvoiceUpdated={(invoiceInfo) => handleInvoiceUpdated(expense.id, invoiceInfo)}
                          onInvoiceDeleted={(invoiceId) => handleInvoiceDeleted(expense.id, invoiceId)}
                        />
                      )}
                    </div>
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

              {/* Future Months Selection (Requirements 2.1, 2.2) */}
              <div className="form-group future-months-section">
                <div className="future-months-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editFutureMonths > 0}
                      onChange={(e) => setEditFutureMonths(e.target.checked ? 1 : 0)}
                    />
                    <span>Add to Future Months</span>
                  </label>
                  {editFutureMonths > 0 && (
                    <div className="future-months-count">
                      <select
                        id="edit-future-months"
                        name="futureMonths"
                        value={editFutureMonths}
                        onChange={(e) => setEditFutureMonths(parseInt(e.target.value))}
                        className="future-months-select"
                      >
                        {FUTURE_MONTHS_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="months-label">month{editFutureMonths > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
                {editFutureMonths > 0 && editFormData.date && (
                  <div className="future-months-preview">
                    📅 Will create {editFutureMonths} additional expense{editFutureMonths > 1 ? 's' : ''} {calculateFutureDatePreview(editFormData.date, editFutureMonths)}
                  </div>
                )}
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

              {/* Invoice Upload for Tax-Deductible Expenses (Medical and Donations) - now supports multiple invoices */}
              {isEditingTaxDeductible && expenseToEdit && (
                <div className="form-group">
                  <InvoiceUpload
                    expenseId={expenseToEdit.id}
                    existingInvoices={editInvoices}
                    people={isEditingMedicalExpense ? (selectedPeople.length > 0 ? selectedPeople : people) : []}
                    onInvoiceUploaded={handleEditInvoiceUploaded}
                    onInvoiceDeleted={handleEditInvoiceDeleted}
                    onPersonLinkUpdated={handleEditPersonLinkUpdated}
                    disabled={isSubmitting}
                  />
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
