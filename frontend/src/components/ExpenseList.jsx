import { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { getCategories } from '../services/categoriesApi';
import { getPeople } from '../services/peopleApi';
import { getPaymentMethods } from '../services/paymentMethodApi';
import { updateInsuranceStatus, deleteExpense as deleteExpenseApi } from '../services/expenseApi';
import { getInvoicesForExpense, updateInvoicePersonLink } from '../services/invoiceApi';
import { createLogger } from '../utils/logger';
import InvoiceIndicator from './InvoiceIndicator';
import InsuranceStatusIndicator from './InsuranceStatusIndicator';
import QuickStatusUpdate from './QuickStatusUpdate';
import ReimbursementIndicator from './ReimbursementIndicator';
import ExpenseForm from './ExpenseForm';
import FilterChip from './FilterChip';
import './ExpenseList.css';
import { formatAmount, formatLocalDate } from '../utils/formatters';

const logger = createLogger('ExpenseList');

/**
 * Generates grouped filter options for the smart method filter
 * Groups payment methods by type (cash, debit, cheque, credit_card)
 * 
 * Smart grouping logic:
 * - For types with multiple methods (e.g., Credit Card with Visa, Mastercard): 
 *   Shows type header followed by individual methods as indented items
 * - For types with a single method where the name matches the type (e.g., Cash):
 *   Shows only the method directly (no redundant header)
 * - For types with a single method where the name differs from the type:
 *   Shows type header followed by the method
 * 
 * @param {Array} paymentMethods - Array of payment method objects with display_name and type
 * @returns {Array} Array of filter options with value, label, type ('header' | 'item'), and indent properties
 * 
 * Requirements: 1.1
 */
export const generateGroupedMethodOptions = (paymentMethods) => {
  if (!paymentMethods || paymentMethods.length === 0) {
    return [];
  }

  // Define the order and display names for method types
  const typeOrder = ['cash', 'debit', 'cheque', 'credit_card'];
  const typeLabels = {
    cash: 'Cash',
    debit: 'Debit',
    cheque: 'Cheque',
    credit_card: 'Credit Card'
  };

  // Group methods by type
  const methodsByType = {};
  const methodsWithoutType = [];

  paymentMethods.forEach(method => {
    const type = method.type || null;
    if (type && typeOrder.includes(type)) {
      if (!methodsByType[type]) {
        methodsByType[type] = [];
      }
      methodsByType[type].push(method);
    } else {
      // Handle methods with missing or unknown type
      methodsWithoutType.push(method);
    }
  });

  const options = [];

  // Add grouped options in order
  typeOrder.forEach(type => {
    const methods = methodsByType[type];
    if (methods && methods.length > 0) {
      // Check if this type has multiple methods or if the single method name differs from type label
      const hasMultipleMethods = methods.length > 1;
      const singleMethodMatchesType = methods.length === 1 && 
        methods[0].display_name.toLowerCase() === typeLabels[type].toLowerCase();
      
      if (hasMultipleMethods || !singleMethodMatchesType) {
        // Show type header when:
        // 1. Multiple methods of this type exist (e.g., multiple credit cards)
        // 2. Single method name differs from type label
        options.push({
          value: `type:${type}`,
          label: typeLabels[type],
          optionType: 'header',
          indent: false
        });

        // Add individual methods under this type (indented)
        methods.forEach(method => {
          options.push({
            value: `method:${method.display_name}`,
            label: method.display_name + (method.is_active === 0 ? ' (inactive)' : ''),
            optionType: 'item',
            indent: true,
            isInactive: method.is_active === 0
          });
        });
      } else {
        // Single method that matches type label - show directly without header
        // This avoids redundant "Cash" header followed by "Cash" method
        const method = methods[0];
        options.push({
          value: `method:${method.display_name}`,
          label: method.display_name + (method.is_active === 0 ? ' (inactive)' : ''),
          optionType: 'item',
          indent: false,
          isInactive: method.is_active === 0
        });
      }
    }
  });

  // Add methods without type under "Other" if any exist
  if (methodsWithoutType.length > 0) {
    options.push({
      value: 'type:other',
      label: 'Other',
      optionType: 'header',
      indent: false
    });

    methodsWithoutType.forEach(method => {
      options.push({
        value: `method:${method.display_name}`,
        label: method.display_name + (method.is_active === 0 ? ' (inactive)' : ''),
        optionType: 'item',
        indent: true,
        isInactive: method.is_active === 0
      });
    });
  }

  return options;
};

/**
 * Parses a smart method filter value to determine the filter mode and value
 * 
 * @param {string} value - The encoded filter value (e.g., 'type:cash' or 'method:Visa')
 * @returns {Object} Object with mode ('type' | 'method' | 'none') and filterValue
 * 
 * Requirements: 1.2, 1.3
 */
export const parseSmartMethodFilter = (value) => {
  if (!value) return { mode: 'none', filterValue: '' };
  if (value.startsWith('type:')) return { mode: 'type', filterValue: value.slice(5) };
  if (value.startsWith('method:')) return { mode: 'method', filterValue: value.slice(7) };
  return { mode: 'none', filterValue: '' };
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

const ExpenseList = memo(({ 
  expenses, 
  onExpenseDeleted, 
  onExpenseUpdated, 
  onAddExpense, 
  people: propPeople, 
  currentMonthExpenseCount = 0,
  initialInsuranceFilter = '',
  onInsuranceFilterChange
}) => {
  const [deletingId, setDeletingId] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [categories, setCategories] = useState([]);
  // Payment methods state - fetched from API (includes inactive for historical filtering)
  const [paymentMethods, setPaymentMethods] = useState([]);
  // Local filters for monthly view only (don't trigger global view)
  const [localFilterType, setLocalFilterType] = useState('');
  const [localFilterMethod, setLocalFilterMethod] = useState(''); // Smart method filter with encoded values (type: or method:)
  const [localFilterInvoice, setLocalFilterInvoice] = useState(''); // New invoice filter
  const [localFilterInsurance, setLocalFilterInsurance] = useState(initialInsuranceFilter); // Insurance status filter (Requirement 7.4)
  // People selection state for medical expenses
  const [localPeople, setLocalPeople] = useState([]);
  const people = propPeople || localPeople;
  // Invoice data cache - now stores arrays of invoices per expense
  const [invoiceData, setInvoiceData] = useState(new Map());
  const [loadingInvoices, setLoadingInvoices] = useState(new Set());
  // Insurance quick status update state (Requirements 5.1, 5.2, 5.3, 5.4)
  const [quickStatusExpenseId, setQuickStatusExpenseId] = useState(null);
  const [quickStatusPosition, setQuickStatusPosition] = useState({ top: 0, left: 0 });

  // Sync insurance filter from parent prop
  useEffect(() => {
    if (initialInsuranceFilter !== localFilterInsurance) {
      setLocalFilterInsurance(initialInsuranceFilter);
    }
  }, [initialInsuranceFilter]);

  // Notify parent when insurance filter changes (for clearing from parent)
  const handleInsuranceFilterChange = useCallback((value) => {
    setLocalFilterInsurance(value);
    if (onInsuranceFilterChange) {
      onInsuranceFilterChange(value);
    }
  }, [onInsuranceFilterChange]);

  // Fetch categories and people on mount
  useEffect(() => {
    let isMounted = true;

    const fetchCategoriesData = async () => {
      try {
        const categories = await getCategories();
        if (isMounted) {
          setCategories(categories || []);
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

    // Fetch all payment methods (including inactive) for filtering historical data
    const fetchPaymentMethodsData = async () => {
      try {
        // Fetch all payment methods, not just active ones, for historical filtering
        const methods = await getPaymentMethods();
        if (isMounted) {
          setPaymentMethods(methods || []);
        }
      } catch (err) {
        if (isMounted) {
          logger.error('Error fetching payment methods:', err);
          setPaymentMethods([]);
        }
      }
    };

    fetchCategoriesData();
    fetchPeopleData();
    fetchPaymentMethodsData();

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

  // Simplified edit click handler - ExpenseForm handles all state internally
  const handleEditClick = useCallback((expense) => {
    setExpenseToEdit(expense);
    setShowEditModal(true);
  }, []);

  // Simplified cancel handler - just close modal and clear expense
  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
    setExpenseToEdit(null);
  }, []);

  // Callback for ExpenseForm - handles update and closes modal
  const handleExpenseUpdated = useCallback((updatedExpense) => {
    if (onExpenseUpdated) {
      onExpenseUpdated(updatedExpense);
    }
    setShowEditModal(false);
    setExpenseToEdit(null);
  }, [onExpenseUpdated]);

  const handleDeleteClick = useCallback((expense) => {
    setExpenseToDelete(expense);
    setShowConfirmDialog(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!expenseToDelete) return;

    setDeletingId(expenseToDelete.id);
    setShowConfirmDialog(false);

    try {
      await deleteExpenseApi(expenseToDelete.id);

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

  /**
   * Handle insurance status indicator click
   * Opens the QuickStatusUpdate dropdown at the indicator position
   * Requirements: 5.1, 7.1, 7.2
   */
  const handleInsuranceIndicatorClick = useCallback((event, expenseId) => {
    event.preventDefault();
    event.stopPropagation();
    
    const rect = event.currentTarget.getBoundingClientRect();
    // Use viewport-relative coordinates (fixed positioning)
    setQuickStatusPosition({
      top: rect.bottom + 4,
      left: rect.left
    });
    setQuickStatusExpenseId(expenseId);
  }, []);

  /**
   * Handle insurance status change from QuickStatusUpdate
   * Calls the API and updates the expense in the list
   * Requirements: 5.2, 5.3, 5.4
   */
  const handleInsuranceStatusChange = useCallback(async (expenseId, newStatus) => {
    try {
      const result = await updateInsuranceStatus(expenseId, newStatus);
      
      // Notify parent component to update the expense
      if (onExpenseUpdated && result) {
        onExpenseUpdated(result);
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to update insurance status:', error);
      throw error;
    }
  }, [onExpenseUpdated]);

  /**
   * Close the QuickStatusUpdate dropdown
   */
  const handleCloseQuickStatus = useCallback(() => {
    setQuickStatusExpenseId(null);
  }, []);

  const formatDate = formatLocalDate;

  // Filter expenses based on local filters (for current month only)
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Apply local type filter
      if (localFilterType && expense.type !== localFilterType) {
        return false;
      }
      // Apply smart method filter (Requirements 1.2, 1.3)
      if (localFilterMethod) {
        const { mode, filterValue } = parseSmartMethodFilter(localFilterMethod);
        if (mode === 'method') {
          // Filter by specific payment method
          if (expense.method !== filterValue) {
            return false;
          }
        } else if (mode === 'type') {
          // Filter by payment method type
          const paymentMethod = paymentMethods.find(pm => pm.display_name === expense.method);
          if (filterValue === 'other') {
            // "Other" type means methods without a recognized type
            const typeOrder = ['cash', 'debit', 'cheque', 'credit_card'];
            if (paymentMethod && typeOrder.includes(paymentMethod.type)) {
              return false;
            }
          } else {
            if (!paymentMethod || paymentMethod.type !== filterValue) {
              return false;
            }
          }
        }
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
      // Apply insurance status filter (Requirement 7.4)
      if (localFilterInsurance) {
        // Only medical expenses can have insurance status
        if (expense.type !== 'Tax - Medical') {
          return false;
        }
        // Filter by insurance eligibility and claim status
        if (localFilterInsurance === 'eligible') {
          if (!expense.insurance_eligible) return false;
        } else if (localFilterInsurance === 'not-eligible') {
          if (expense.insurance_eligible) return false;
        } else {
          // Filter by specific claim status
          if (!expense.insurance_eligible) return false;
          if (expense.claim_status !== localFilterInsurance) return false;
        }
      }
      return true;
    });
  }, [expenses, localFilterType, localFilterMethod, localFilterInvoice, localFilterInsurance, invoiceData, paymentMethods]);

  // Generate grouped options for the smart method filter (Requirement 1.1)
  const groupedMethodOptions = useMemo(() => {
    return generateGroupedMethodOptions(paymentMethods);
  }, [paymentMethods]);

  // Calculate total active filter count (Requirements 3.1, 3.2, 3.3)
  const totalFilterCount = useMemo(() => {
    let count = 0;
    if (localFilterType) count++;
    if (localFilterMethod) count++;
    if (localFilterInvoice) count++;
    if (localFilterInsurance) count++;
    return count;
  }, [localFilterType, localFilterMethod, localFilterInvoice, localFilterInsurance]);

  // Build active filters array for filter chips (Requirements 4.1, 4.2, 4.3)
  const activeFilters = useMemo(() => {
    const filters = [];
    
    if (localFilterType) {
      filters.push({
        id: 'type',
        label: 'Type',
        value: localFilterType,
        onClear: () => setLocalFilterType('')
      });
    }
    
    if (localFilterMethod) {
      const { mode, filterValue } = parseSmartMethodFilter(localFilterMethod);
      let displayValue = filterValue;
      if (mode === 'type') {
        const typeLabels = {
          cash: 'Cash (all)',
          debit: 'Debit (all)',
          cheque: 'Cheque (all)',
          credit_card: 'Credit Card (all)',
          other: 'Other (all)'
        };
        displayValue = typeLabels[filterValue] || filterValue;
      }
      filters.push({
        id: 'method',
        label: 'Method',
        value: displayValue,
        onClear: () => setLocalFilterMethod('')
      });
    }
    
    if (localFilterInvoice) {
      const invoiceLabels = {
        'with-invoice': 'With Invoice',
        'without-invoice': 'Without Invoice'
      };
      filters.push({
        id: 'invoice',
        label: 'Invoice',
        value: invoiceLabels[localFilterInvoice] || localFilterInvoice,
        onClear: () => setLocalFilterInvoice('')
      });
    }
    
    if (localFilterInsurance) {
      const insuranceLabels = {
        'eligible': 'Eligible',
        'not-eligible': 'Not Eligible',
        'not_claimed': 'Not Claimed',
        'in_progress': 'In Progress',
        'paid': 'Paid',
        'denied': 'Denied'
      };
      filters.push({
        id: 'insurance',
        label: 'Insurance',
        value: insuranceLabels[localFilterInsurance] || localFilterInsurance,
        onClear: () => handleInsuranceFilterChange('')
      });
    }
    
    return filters;
  }, [localFilterType, localFilterMethod, localFilterInvoice, localFilterInsurance, handleInsuranceFilterChange]);

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
    /**
     * Get human-readable insurance filter text
     */
    const getInsuranceFilterText = (filterValue) => {
      switch (filterValue) {
        case 'eligible': return 'insurance eligible';
        case 'not-eligible': return 'not insurance eligible';
        case 'not_claimed': return 'not claimed';
        case 'in_progress': return 'claim in progress';
        case 'paid': return 'claim paid';
        case 'denied': return 'claim denied';
        default: return filterValue;
      }
    };

    /**
     * Get human-readable smart method filter text
     */
    const getSmartMethodFilterText = (filterValue) => {
      const { mode, filterValue: value } = parseSmartMethodFilter(filterValue);
      if (mode === 'type') {
        const typeLabels = {
          cash: 'Cash (all)',
          debit: 'Debit (all)',
          cheque: 'Cheque (all)',
          credit_card: 'Credit Card (all)',
          other: 'Other (all)'
        };
        return typeLabels[value] || value;
      } else if (mode === 'method') {
        return value;
      }
      return filterValue;
    };

    if (filteredExpenses.length === 0 && expenses.length > 0) {
      // Expenses exist but all filtered out by local filters
      const activeFilters = [];
      if (localFilterType) activeFilters.push(`category: ${localFilterType}`);
      if (localFilterMethod) activeFilters.push(`payment: ${getSmartMethodFilterText(localFilterMethod)}`);
      if (localFilterInvoice) {
        const invoiceFilterText = localFilterInvoice === 'with-invoice' ? 'with invoices' : 'without invoices';
        activeFilters.push(`${invoiceFilterText}`);
      }
      if (localFilterInsurance) {
        activeFilters.push(`insurance: ${getInsuranceFilterText(localFilterInsurance)}`);
      }
      
      return `No expenses match the selected filters (${activeFilters.join(', ')}). Try adjusting your filters or clearing them to see all expenses.`;
    }
    
    if (expenses.length === 0) {
      // No expenses at all for this month
      return 'No expenses have been recorded for this period.';
    }
    
    // Show result count when local filters are active
    if (localFilterType || localFilterMethod || localFilterInvoice || localFilterInsurance) {
      const activeFilters = [];
      if (localFilterType) activeFilters.push(localFilterType);
      if (localFilterMethod) activeFilters.push(getSmartMethodFilterText(localFilterMethod));
      if (localFilterInvoice) {
        const invoiceFilterText = localFilterInvoice === 'with-invoice' ? 'with invoices' : 'without invoices';
        activeFilters.push(invoiceFilterText);
      }
      if (localFilterInsurance) {
        activeFilters.push(getInsuranceFilterText(localFilterInsurance));
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
            {/* Filter count badge (Requirements 3.1, 3.2, 3.3) */}
            {totalFilterCount > 0 && (
              <span className="filter-count-badge" data-testid="filter-count-badge">
                {totalFilterCount}
              </span>
            )}
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
            {/* Smart Method Filter - consolidated payment method and type filter (Requirements 1.1, 1.4, 1.5) */}
            <select 
              className="filter-select smart-method-filter"
              value={localFilterMethod} 
              onChange={(e) => setLocalFilterMethod(e.target.value)}
              title="Filter by payment method or type (current month only)"
            >
              <option value="">All Methods</option>
              {groupedMethodOptions.map((option, index) => (
                <option 
                  key={`${option.value}-${index}`}
                  value={option.value}
                  className={`${option.optionType === 'header' ? 'method-type-header' : 'method-item'} ${option.indent ? 'indented' : ''} ${option.isInactive ? 'inactive-option' : ''}`}
                  style={option.indent ? { paddingLeft: '20px' } : {}}
                >
                  {option.indent ? `  ${option.label}` : option.label}
                </option>
              ))}
            </select>
            {/* Invoice Filter */}
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
            {/* Insurance Status Filter */}
            <select 
              className="filter-select insurance-filter"
              value={localFilterInsurance} 
              onChange={(e) => handleInsuranceFilterChange(e.target.value)}
              title="Filter medical expenses by insurance claim status"
            >
              <option value="">All Insurance</option>
              <option value="eligible">Insurance Eligible</option>
              <option value="not-eligible">Not Eligible</option>
              <option value="not_claimed">Not Claimed</option>
              <option value="in_progress">In Progress</option>
              <option value="paid">Paid</option>
              <option value="denied">Denied</option>
            </select>
            {(localFilterType || localFilterMethod || localFilterInvoice || localFilterInsurance) && (
              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setLocalFilterType('');
                  setLocalFilterMethod('');
                  setLocalFilterInvoice('');
                  handleInsuranceFilterChange('');
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

      {/* Active Filter Chips Row (Requirements 4.1, 4.2, 4.3, 4.5) */}
      {activeFilters.length > 0 && (
        <div className="filter-chips-row" data-testid="filter-chips-row">
          {activeFilters.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              value={filter.value}
              onRemove={filter.onClear}
            />
          ))}
        </div>
      )}

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
                      {/* Insurance Status Indicator for medical expenses (Requirements 7.1, 7.2, 7.3) */}
                      {expense.type === 'Tax - Medical' && expense.insurance_eligible === 1 && (
                        <InsuranceStatusIndicator
                          insuranceEligible={true}
                          claimStatus={expense.claim_status}
                          originalCost={expense.original_cost}
                          outOfPocket={expense.amount}
                          size="small"
                          onClick={(event) => handleInsuranceIndicatorClick(event, expense.id)}
                        />
                      )}
                      {/* Reimbursement Indicator for non-medical expenses with original_cost set (Requirements 5.1, 5.3) */}
                      {expense.type !== 'Tax - Medical' && expense.original_cost && expense.original_cost !== expense.amount && (
                        <ReimbursementIndicator
                          originalCost={expense.original_cost}
                          netAmount={expense.amount}
                          size="small"
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
                <td>
                  <span className={expense.payment_method_is_active === 0 ? 'inactive-payment-method' : ''}>
                    {expense.method}
                    {expense.payment_method_is_active === 0 && (
                      <span 
                        className="inactive-indicator" 
                        title="This payment method is inactive"
                      >
                        ⚠️
                      </span>
                    )}
                  </span>
                </td>
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
            <ExpenseForm
              expense={expenseToEdit}
              people={people}
              onExpenseAdded={handleExpenseUpdated}
            />
          </div>
        </div>
      )}

      {/* Quick Status Update Dropdown for Insurance (Requirements 5.1, 5.2, 5.3, 5.4) */}
      {quickStatusExpenseId && (
        <QuickStatusUpdate
          expenseId={quickStatusExpenseId}
          currentStatus={
            expenses.find(e => e.id === quickStatusExpenseId)?.claim_status || 'not_claimed'
          }
          onStatusChange={handleInsuranceStatusChange}
          onClose={handleCloseQuickStatus}
          isOpen={true}
          position={quickStatusPosition}
        />
      )}
    </div>
  );
});

ExpenseList.displayName = 'ExpenseList';

export default ExpenseList;
