import { useState, useEffect } from 'react';
import useTabState from '../hooks/useTabState';
import {
  getBudgets,
  getBudgetSummary,
  createBudget,
  updateBudget,
  deleteBudget,
  copyBudgets,
  getBudgetSuggestion,
  getBudgetHistory
} from '../services/budgetApi';
import { getCategories } from '../services/categoriesApi';
import { validateAmount } from '../utils/validation';
import { getMonthNameLong, getMonthNameShort, formatCAD } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import BudgetCard from './BudgetCard';
import BudgetProgressBar from './BudgetProgressBar';
import './BudgetsModal.css';

const logger = createLogger('BudgetsModal');

// ─── Manage Tab Content ───────────────────────────────────────────────────────

const ManageTabContent = ({ year, month, onBudgetUpdated, focusedCategory }) => {
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCopying, setIsCopying] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  useEffect(() => {
    const fetchCategoriesData = async () => {
      try {
        const categoriesData = await getCategories();
        const budgetableCategories = (categoriesData || [])
          .filter(cat => typeof cat === 'string' && !cat.startsWith('Tax -'));
        setCategories(budgetableCategories);
      } catch (err) {
        logger.error('Error fetching categories:', err);
        setCategories([]);
      }
    };
    fetchCategoriesData();
  }, []);

  useEffect(() => {
    fetchBudgets();
    if (focusedCategory && typeof focusedCategory === 'string') {
      setTimeout(() => {
        handleEditBudget(focusedCategory);
      }, 100);
    }
  }, [year, month, focusedCategory]);

  const fetchBudgets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgets(year, month);
      setBudgets(data.budgets || []);
      const summaryData = await getBudgetSummary(year, month);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message || 'Network error. Unable to load budgets.');
      logger.error('Error fetching budgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearValidationErrors = () => setValidationErrors({});

  const getBudgetForCategory = (category) => budgets.find(b => b.category === category);

  const handleEditBudget = async (category) => {
    if (!category || typeof category !== 'string') {
      logger.warn('handleEditBudget called with invalid category:', category);
      return;
    }
    const budget = getBudgetForCategory(category);
    setEditingCategory(category);
    setEditAmount(budget ? budget.limit.toString() : '');
    clearValidationErrors();
    setSuggestion(null);
    setLoadingSuggestion(true);
    try {
      const suggestionData = await getBudgetSuggestion(year, month, category);
      setSuggestion(suggestionData);
      if (!budget && suggestionData.suggestedAmount > 0) {
        setEditAmount(suggestionData.suggestedAmount.toString());
      }
    } catch (err) {
      logger.error('Error fetching budget suggestion:', err);
      setSuggestion(null);
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleSaveBudget = async () => {
    setError(null);
    let amountError = validateAmount(editAmount);
    if (!amountError) {
      const amount = parseFloat(editAmount);
      if (amount <= 0) amountError = 'Budget limit must be greater than zero';
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
        await updateBudget(existingBudget.id, amount);
      } else {
        await createBudget(year, month, editingCategory, amount);
      }
      await fetchBudgets();
      setEditingCategory(null);
      setEditAmount('');
      clearValidationErrors();
      if (onBudgetUpdated) onBudgetUpdated();
    } catch (err) {
      setError(err.message || 'Network error. Unable to save budget.');
      logger.error('Error saving budget:', err);
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
    if (!window.confirm(`Are you sure you want to remove the budget for ${category}?`)) return;
    setLoading(true);
    setError(null);
    try {
      await deleteBudget(budget.id);
      setBudgets(budgets.filter(b => b.id !== budget.id));
      if (onBudgetUpdated) onBudgetUpdated();
    } catch (err) {
      setError(err.message || 'Network error. Unable to delete budget.');
      logger.error('Error deleting budget:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyFromPreviousMonth = async () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    if (budgets.length > 0) {
      if (!window.confirm('This month already has budgets. Copy from previous month will overwrite them. Continue?')) return;
    }
    setIsCopying(true);
    setError(null);
    try {
      const result = await copyBudgets(prevYear, prevMonth, year, month, true);
      if (result.copied === 0) {
        alert(`No budgets found in ${getMonthNameLong(prevMonth)} ${prevYear} to copy.`);
      } else {
        await fetchBudgets();
        if (onBudgetUpdated) onBudgetUpdated();
      }
    } catch (err) {
      setError(err.message || 'Network error. Unable to copy budgets.');
      logger.error('Error copying budgets:', err);
    } finally {
      setIsCopying(false);
    }
  };

  const formatCurrency = (amount) => formatCAD(amount);

  return (
    <div className="budgets-tab-panel">
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
            <button className="budget-error-retry-button" onClick={fetchBudgets}>Retry</button>
          )}
        </div>
      )}

      <div className="budget-modal-content">
        {loading && budgets.length === 0 ? (
          <div className="budget-modal-loading">Loading budgets...</div>
        ) : (
          <>
            {budgets.length > 0 && summary && (
              <div className="budget-overview-section">
                <h3 className="budget-section-title">Budget Overview</h3>
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
                    <span className="stat-label">{(summary.remaining || 0) >= 0 ? 'Remaining' : 'Over Budget'}</span>
                    <span className={`stat-value ${(summary.remaining || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(summary.remaining || 0)}
                    </span>
                  </div>
                  <div className="budget-summary-stat">
                    <span className="stat-label">On Track</span>
                    <span className="stat-value">{summary.budgetsOnTrack || 0} / {summary.totalBudgets || budgets.length}</span>
                  </div>
                </div>
                <div className="budget-overall-progress">
                  <h4 className="progress-subtitle">Overall Budget Progress</h4>
                  <BudgetProgressBar
                    category="Overall"
                    budgetLimit={summary.totalBudgeted || 0}
                    spent={summary.totalSpent || 0}
                    showAlert={true}
                  />
                </div>
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

            <div className="budget-management-section">
              <h3 className="budget-section-title">Manage Budget Limits</h3>
              <div className="budget-categories-list">
                <div className="budget-list-header">
                  <span className="budget-header-category">Category</span>
                  <span className="budget-header-limit">Budget Limit</span>
                  <span className="budget-header-actions">Actions</span>
                </div>
                {categories.map((category) => {
                  const budget = getBudgetForCategory(category);
                  const isEditing = editingCategory === category;
                  return (
                    <div key={category} className="budget-category-item">
                      <div className="budget-category-name">{category}</div>
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
                            <button className="budget-save-button" onClick={handleSaveBudget} disabled={loading} title="Save">
                              {loading ? '...' : '✓'}
                            </button>
                            <button className="budget-cancel-button" onClick={handleCancelEdit} disabled={loading} title="Cancel">
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="budget-category-limit">
                            {budget ? formatCurrency(budget.limit) : <span className="budget-not-set">Not set</span>}
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
  );
};

// ─── History Tab Content ──────────────────────────────────────────────────────

const HistoryTabContent = ({ year, month }) => {
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [periodMonths, setPeriodMonths] = useState(6);

  useEffect(() => {
    fetchHistoryData();
  }, [year, month, periodMonths]);

  const fetchHistoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgetHistory(year, month, periodMonths);
      setHistoryData(data);
    } catch (err) {
      setError(err.message || 'Failed to load budget history');
      logger.error('Error fetching budget history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!historyData || !historyData.categories) return;
    const headers = ['Category', 'Month', 'Year', 'Budgeted', 'Spent', 'Variance', 'Met Budget'];
    const rows = [];
    Object.entries(historyData.categories).forEach(([category, categoryData]) => {
      categoryData.history.forEach((monthData) => {
        const variance = monthData.budgeted - monthData.spent;
        rows.push([category, monthData.month, monthData.year, monthData.budgeted.toFixed(2), monthData.spent.toFixed(2), variance.toFixed(2), monthData.met ? 'Yes' : 'No']);
      });
    });
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `budget-history-${year}-${month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => formatCAD(amount);

  const formatPercentage = (value) => `${value.toFixed(1)}%`;

  if (loading) {
    return <div className="budget-modal-loading">Loading budget history...</div>;
  }

  if (error) {
    return <div className="budget-history-error">Error: {error}</div>;
  }

  const hasData = historyData && historyData.categories && Object.keys(historyData.categories).length > 0;

  return (
    <div className="budgets-tab-panel">
      <div className="period-selector">
        <label>Time Period:</label>
        <div className="period-buttons">
          {[3, 6, 12].map((n) => (
            <button
              key={n}
              className={`period-btn ${periodMonths === n ? 'active' : ''}`}
              onClick={() => setPeriodMonths(n)}
            >
              {n} Months
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="empty-state">
          <p>No budget history available for the selected period.</p>
          <p className="empty-state-hint">Set up budgets and track expenses to see historical data.</p>
        </div>
      ) : (
        <>
          <div className="export-section">
            <button className="export-btn" onClick={handleExportCSV}>📥 Export to CSV</button>
          </div>

          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Success Rate</th>
                  <th>Avg Budgeted</th>
                  <th>Avg Spent</th>
                  <th>Avg Variance</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(historyData.categories).map(([category, categoryData]) => {
                  const avgBudgeted = categoryData.averageBudgeted || 0;
                  const avgSpent = categoryData.averageSpent || 0;
                  const avgVariance = avgBudgeted - avgSpent;
                  const successRate = categoryData.successRate || 0;
                  return (
                    <tr key={category}>
                      <td className="category-cell"><strong>{category}</strong></td>
                      <td className="success-rate-cell">
                        <span className={`success-rate ${successRate >= 80 ? 'good' : successRate >= 50 ? 'moderate' : 'poor'}`}>
                          {formatPercentage(successRate)}
                        </span>
                      </td>
                      <td className="amount-cell">{formatCurrency(avgBudgeted)}</td>
                      <td className="amount-cell">{formatCurrency(avgSpent)}</td>
                      <td className={`amount-cell ${avgVariance >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(avgVariance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="monthly-breakdown">
            <h3>Monthly Details</h3>
            {Object.entries(historyData.categories).map(([category, categoryData]) => (
              <div key={category} className="category-section">
                <h4 className="category-title">{category}</h4>
                <div className="monthly-table-container">
                  <table className="monthly-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Budgeted</th>
                        <th>Spent</th>
                        <th>Variance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryData.history.map((monthData, index) => {
                        const variance = monthData.budgeted - monthData.spent;
                        const monthLabel = `${getMonthNameShort(monthData.month)} ${monthData.year}`;
                        return (
                          <tr key={index}>
                            <td>{monthLabel}</td>
                            <td className="amount-cell">{monthData.budgeted > 0 ? formatCurrency(monthData.budgeted) : 'No budget'}</td>
                            <td className="amount-cell">{formatCurrency(monthData.spent)}</td>
                            <td className={`amount-cell ${variance >= 0 ? 'positive' : 'negative'}`}>
                              {monthData.budgeted > 0 ? formatCurrency(variance) : '-'}
                            </td>
                            <td className="status-cell">
                              {monthData.budgeted > 0 ? (
                                <span className={`status-badge ${monthData.met ? 'met' : 'exceeded'}`}>
                                  {monthData.met ? '✓ Met' : '✗ Exceeded'}
                                </span>
                              ) : (
                                <span className="status-badge no-budget">No budget</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── BudgetsModal ─────────────────────────────────────────────────────────────

const BudgetsModal = ({ isOpen, onClose, year, month, onBudgetUpdated, focusedCategory = null }) => {
  const [activeTab, setActiveTab] = useTabState('budgets-modal-tab', 'manage');

  // focusCategory overrides persisted tab — always force manage tab when non-null
  useEffect(() => {
    if (focusedCategory !== null && focusedCategory !== undefined) {
      setActiveTab('manage');
    }
  }, [focusedCategory]);

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="budgets-modal-overlay" onClick={handleClose}>
      <div className="budgets-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="budgets-modal-header">
          <h2>💵 Budgets — {getMonthNameLong(month)} {year}</h2>
          <button className="budgets-modal-close" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        <div className="budgets-tabs">
          <button
            className={`tab-button ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            📋 Manage
          </button>
          <button
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📊 History
          </button>
        </div>

        <div className="budgets-tab-content">
          {activeTab === 'manage' && (
            <ManageTabContent
              year={year}
              month={month}
              onBudgetUpdated={onBudgetUpdated}
              focusedCategory={focusedCategory}
            />
          )}
          {activeTab === 'history' && (
            <HistoryTabContent year={year} month={month} />
          )}
        </div>
      </div>
    </div>
  );
};

export default BudgetsModal;
