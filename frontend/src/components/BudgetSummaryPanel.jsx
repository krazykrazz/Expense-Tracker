import React, { useState, useEffect } from 'react';
import { formatCAD } from '../utils/formatters';
import BudgetCard from './BudgetCard';
import BudgetProgressBar from './BudgetProgressBar';
import { getBudgets, getBudgetSummary } from '../services/budgetApi';
import { createLogger } from '../utils/logger';
import './BudgetSummaryPanel.css';

const logger = createLogger('BudgetSummaryPanel');

/**
 * BudgetSummaryPanel Component
 * Overall budget summary showing totals across all categories
 * 
 * @param {number} year - Current year
 * @param {number} month - Current month (1-12)
 * @param {Function} onManageBudgets - Callback to open budget management modal
 * @param {number} refreshTrigger - Trigger to refresh budget data
 */
const BudgetSummaryPanel = ({ year, month, onManageBudgets, refreshTrigger = 0 }) => {
  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBudgetData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch budgets with progress data
        const budgetsData = await getBudgets(year, month);
        setBudgets(budgetsData.budgets || []);

        // Fetch overall summary
        const summaryData = await getBudgetSummary(year, month);
        setSummary(summaryData);
      } catch (err) {
        setError(err.message || 'Failed to load budget data');
        logger.error('Error fetching budget data:', err);
        setBudgets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBudgetData();
  }, [year, month, refreshTrigger]);

  // Format currency - uses cached formatter
  const formatCurrency = (amount) => formatCAD(Math.abs(amount));

  if (loading) {
    return (
      <div className="budget-summary-panel">
        <div className="loading-message">Loading budget data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="budget-summary-panel">
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  // If no budgets exist and no summary data, show empty state
  if ((!budgets || budgets.length === 0) && !summary) {
    return (
      <div className="budget-summary-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <span className="panel-icon">💰</span>
            Budget Overview
          </h2>
          <button className="manage-budgets-btn" onClick={onManageBudgets}>
            Set Up Budgets
          </button>
        </div>
        <div className="empty-state">
          <p>No budgets set for this month.</p>
          <p className="empty-state-hint">Click "Set Up Budgets" to get started.</p>
        </div>
      </div>
    );
  }

  // Calculate values for display
  const totalBudgeted = summary?.totalBudgeted || 0;
  const totalSpent = summary?.totalSpent || 0;
  const remaining = summary?.remaining || 0;
  const progress = summary?.progress || 0;
  const budgetsOnTrack = summary?.budgetsOnTrack || 0;
  const totalBudgets = summary?.totalBudgets || budgets.length;

  return (
    <div className="budget-summary-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon">💰</span>
          Budget Overview
        </h2>
        <button className="manage-budgets-btn" onClick={onManageBudgets}>
          Manage Budgets
        </button>
      </div>

      {/* Overall Summary Section */}
      <div className="overall-summary">
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="stat-label">Total Budgeted</span>
            <span className="stat-value">{formatCurrency(totalBudgeted)}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Total Spent</span>
            <span className="stat-value spent">{formatCurrency(totalSpent)}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">
              {remaining >= 0 ? 'Remaining' : 'Over Budget'}
            </span>
            <span className={`stat-value ${remaining >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(remaining)}
            </span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">On Track</span>
            <span className="stat-value">{budgetsOnTrack} / {totalBudgets}</span>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="overall-progress">
          <h3 className="progress-title">Overall Budget Progress</h3>
          <BudgetProgressBar
            category="Overall"
            budgetLimit={totalBudgeted}
            spent={totalSpent}
            showAlert={true}
          />
        </div>
      </div>

      {/* Individual Category Budget Cards */}
      <div className="category-budgets">
        <h3 className="section-title">Category Budgets</h3>
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
  );
};

export default BudgetSummaryPanel;
