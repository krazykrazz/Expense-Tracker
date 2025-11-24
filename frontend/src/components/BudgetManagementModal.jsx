import { useState, useEffect } from 'react';
import './BudgetManagementModal.css';
import {
  getBudgets,
  getBudgetSummary,
  createBudget,
  updateBudget,
  deleteBudget,
  copyBudgets,
  getBudgetSuggestion
} from '../services/budgetApi';
import { validateAmount } from '../utils/validation';
import { getMonthNameLong } from '../utils/formatters';
import BudgetCard from './BudgetCard';
import BudgetProgressBar from './BudgetProgressBar';

// Budgetable categories (excludes tax-deductible categories)
const BUDGETABLE_CATEGORIES = [
  'Housing',
  'Utilities',
  'Groceries',
  'Dining Out',
  'Insurance',
  'Gas',
  'Vehicle Maintenance',
  'Entertainment',
  'Subscriptions',
  'Recreation Activities',
  'Pet Care',
  'Other'
];

const BudgetManagementModal = ({ isOpen, onClose, year, month, onBudgetUpdated }) => {
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCopying, setIsCopying] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // Fetch budgets when modal opens or year/month changes
  useEffect(() => {
    if (isOpen) {
      fetchBudgets();
    }
  }, [isOpen, year, month]);

  const fetchBudgets = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getBudgets(year, month);
      setBudgets(data.budgets || []);
      
      // Also fetch summary data
      const summaryData = await getBudgetSummary(year, month);
      setSummary(summaryData);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load budgets. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearValidationErrors = () => {
    setValidationErrors({});
  };

  const getBudgetForCategory = (category) => {
    return budgets.find(b => b.category === category);
  };

  const handleEditBudget = async (category) => {
    const budget = getBudgetForCategory(category);
    setEditingCategory(category);
    setEditAmount(budget ? budget.limit.toString() : '');
    clearValidationErrors();
    
    // Fetch budget suggestion
    setSuggestion(null);
    setLoadingSuggestion(true);
    
    try {
      const suggestionData = await getBudgetSuggestion(year, month, category);
      setSuggestion(suggestionData);
      
      // If no existing budget and suggestion is available, pre-fill with suggestion
      if (!budget && suggestionData.suggestedAmount > 0) {
        setEditAmount(suggestionData.suggestedAmount.toString());
      }
    } catch (err) {
      console.error('Error fetching budget suggestion:', err);
      // Don't show error to user, just skip suggestion
      setSuggestion(null);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleSaveBudget = async () => {
    setError(null);
    
    // Validate amount
    let amountError = validateAmount(editAmount);
    
    // Additional validation: budget must be greater than zero
    if (!amountError) {
      const amount = parseFloat(editAmount);
      if (amount <= 0) {
        amountError = 'Budget limit must be greater than zero';
      }
    }
    
    if (amountError) {
      setValidationErrors({ [editingCategory]: amountError });
      setError('Please fix the validation errors before saving.');
      return;
    }

    const amount = parseFloat(editAmount);
    const existingBudget = getBudgetForCategory(editingCategory);

    setLoading(true);

    try {
      if (existingBudget) {
        // Update existing budget
        const updatedBudget = await updateBudget(existingBudget.id, amount);
        setBudgets(budgets.map(b => 
          b.id === existingBudget.id ? updatedBudget : b
        ));
      } else {
        // Create new budget
        const newBudget = await createBudget(year, month, editingCategory, amount);
        setBudgets([...budgets, newBudget]);
      }

      // Reset edit state
      setEditingCategory(null);
      setEditAmount('');
      clearValidationErrors();
      
      // Notify parent component
      if (onBudgetUpdated) {
        onBudgetUpdated();
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to save budget. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error saving budget:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setEditAmount('');
    setError(null);
    clearValidationErrors();
    setSuggestion(null);
  };

  const handleAcceptSuggestion = () => {
    if (suggestion && suggestion.suggestedAmount > 0) {
      setEditAmount(suggestion.suggestedAmount.toString());
    }
  };

  const handleDeleteBudget = async (category) => {
    const budget = getBudgetForCategory(category);
    if (!budget) return;

    if (!window.confirm(`Are you sure you want to remove the budget for ${category}?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteBudget(budget.id);
      setBudgets(budgets.filter(b => b.id !== budget.id));
      
      // Notify parent component
      if (onBudgetUpdated) {
        onBudgetUpdated();
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete budget. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error deleting budget:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyFromPreviousMonth = async () => {
    // Calculate previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // Check if current month has budgets
    if (budgets.length > 0) {
      if (!window.confirm('This month already has budgets. Copy from previous month will overwrite them. Continue?')) {
        return;
      }
    }

    setIsCopying(true);
    setError(null);

    try {
      const result = await copyBudgets(prevYear, prevMonth, year, month, true);
      
      if (result.copied === 0) {
        alert(`No budgets found in ${getMonthNameLong(prevMonth)} ${prevYear} to copy.`);
      } else {
        // Refresh budgets
        await fetchBudgets();
        
        // Notify parent component
        if (onBudgetUpdated) {
          onBudgetUpdated();
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to copy budgets. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error copying budgets:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setEditingCategory(null);
    setEditAmount('');
    setError(null);
    clearValidationErrors();
    
    onClose();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="budget-modal-overlay" onClick={handleClose}>
      <div className="budget-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="budget-modal-header">
          <h2>Manage Budgets - {getMonthNameLong(month)} {year}</h2>
          <button className="budget-modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="budget-copy-section">
          <button
            className="budget-copy-button"
            onClick={handleCopyFromPreviousMonth}
            disabled={loading || isCopying}
          >
            {isCopying ? 'Copying...' : '📋 Copy from Previous Month'}
          </button>
        </div>

        {error && (
          <div className="budget-modal-error">
            <div>{error}</div>
            {budgets.length === 0 && !loading && (
              <button 
                className="budget-error-retry-button" 
                onClick={fetchBudgets}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="budget-modal-content">
          {loading && budgets.length === 0 ? (
            <div className="budget-modal-loading">Loading budgets...</div>
          ) : (
            <>
              {/* Budget Summary Overview */}
              {budgets.length > 0 && summary && (
                <div className="budget-overview-section">
                  <h3 className="budget-section-title">Budget Overview</h3>
                  
                  {/* Overall Summary Stats */}
                  <div className="budget-summary-stats">
                    <div className="budget-summary-stat">
                      <span className="stat-label">Total Budgeted</span>
                      <span className="stat-value">{formatCurrency(summary.totalBudgeted || 0)}</span>
                    </div>
                    <div className="budget-summary-stat">
                      <span className="stat-label">Total Spent</span>
                      <span className="stat-value spent">{formatCurrency(summary.totalSpent || 0)}</span>
                    </div>
                    <div className="budget-summary-stat">
                      <span className="stat-label">
                        {(summary.remaining || 0) >= 0 ? 'Remaining' : 'Over Budget'}
                      </span>
                      <span className={`stat-value ${(summary.remaining || 0) >= 0 ? 'positive' : 'negative'}`}>
                        {formatCurrency(summary.remaining || 0)}
                      </span>
                    </div>
                    <div className="budget-summary-stat">
                      <span className="stat-label">On Track</span>
                      <span className="stat-value">{summary.budgetsOnTrack || 0} / {summary.totalBudgets || budgets.length}</span>
                    </div>
                  </div>

                  {/* Overall Progress Bar */}
                  <div className="budget-overall-progress">
                    <h4 className="progress-subtitle">Overall Budget Progress</h4>
                    <BudgetProgressBar
                      category="Overall"
                      budgetLimit={summary.totalBudgeted || 0}
                      spent={summary.totalSpent || 0}
                      showAlert={true}
                    />
                  </div>

                  {/* Individual Category Budget Cards */}
                  <div className="budget-category-cards">
                    <h4 className="progress-subtitle">Category Budgets</h4>
                    <div className="budget-cards-grid">
                      {budgets.map((budget) => (
                        <BudgetCard
                          key={budget.id}
                          category={budget.category}
                          budgetLimit={budget.limit}
                          spent={budget.spent}
                          previousMonthSpent={budget.previousMonthSpent || null}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Budget Management Section */}
              <div className="budget-management-section">
                <h3 className="budget-section-title">Manage Budget Limits</h3>
                <div className="budget-categories-list">
                <div className="budget-list-header">
                  <span className="budget-header-category">Category</span>
                  <span className="budget-header-limit">Budget Limit</span>
                  <span className="budget-header-actions">Actions</span>
                </div>
                
                {BUDGETABLE_CATEGORIES.map((category) => {
                  const budget = getBudgetForCategory(category);
                  const isEditing = editingCategory === category;
                  
                  return (
                    <div key={category} className="budget-category-item">
                      <div className="budget-category-name">
                        {category}
                      </div>
                      
                      {isEditing ? (
                        <div className="budget-edit-section">
                          <div className="budget-input-group">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className={`budget-edit-amount ${validationErrors[category] ? 'input-error' : ''}`}
                              disabled={loading}
                              autoFocus
                            />
                            {validationErrors[category] && (
                              <span className="validation-error">{validationErrors[category]}</span>
                            )}
                            
                            {/* Budget Suggestion */}
                            {loadingSuggestion && (
                              <div className="budget-suggestion loading">
                                <span className="suggestion-icon">💡</span>
                                <span className="suggestion-text">Loading suggestion...</span>
                              </div>
                            )}
                            
                            {!loadingSuggestion && suggestion && suggestion.suggestedAmount > 0 && (
                              <div className="budget-suggestion">
                                <span className="suggestion-icon">💡</span>
                                <span className="suggestion-text">
                                  Suggested: {formatCurrency(suggestion.suggestedAmount)}
                                  {suggestion.basedOnMonths > 0 && (
                                    <span className="suggestion-detail">
                                      {' '}(Based on {suggestion.basedOnMonths} month{suggestion.basedOnMonths > 1 ? 's' : ''} average: {formatCurrency(suggestion.averageSpending)})
                                    </span>
                                  )}
                                </span>
                                {editAmount !== suggestion.suggestedAmount.toString() && (
                                  <button
                                    className="suggestion-accept-button"
                                    onClick={handleAcceptSuggestion}
                                    disabled={loading}
                                    title="Use suggested amount"
                                  >
                                    Use
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {!loadingSuggestion && suggestion && suggestion.suggestedAmount === 0 && (
                              <div className="budget-suggestion no-data">
                                <span className="suggestion-icon">ℹ️</span>
                                <span className="suggestion-text">No historical data available for this category</span>
                              </div>
                            )}
                          </div>
                          <div className="budget-edit-actions">
                            <button
                              className="budget-save-button"
                              onClick={handleSaveBudget}
                              disabled={loading}
                              title="Save"
                            >
                              {loading ? '...' : '✓'}
                            </button>
                            <button
                              className="budget-cancel-button"
                              onClick={handleCancelEdit}
                              disabled={loading}
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="budget-category-limit">
                            {budget ? formatCurrency(budget.limit) : (
                              <span className="budget-not-set">Not set</span>
                            )}
                          </div>
                          
                          <div className="budget-category-actions">
                            <button
                              className="budget-edit-button"
                              onClick={() => handleEditBudget(category)}
                              disabled={loading}
                              title={budget ? 'Edit budget' : 'Set budget'}
                            >
                              {budget ? '✏️' : '➕'}
                            </button>
                            {budget && (
                              <button
                                className="budget-delete-button"
                                onClick={() => handleDeleteBudget(category)}
                                disabled={loading}
                                title="Remove budget"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                </div>

                <div className="budget-info-section">
                  <p className="budget-info-text">
                    💡 <strong>Tip:</strong> Budgets apply to all categories except tax-deductible expenses (Tax - Medical, Tax - Donation), which are tracked separately.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BudgetManagementModal;
