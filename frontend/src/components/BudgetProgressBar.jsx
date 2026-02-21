import React from 'react';
import { formatCAD } from '../utils/formatters';
import './BudgetProgressBar.css';

/**
 * BudgetProgressBar Component
 * Visual progress bar showing budget utilization with color coding and alert indicators
 * 
 * @param {string} category - Expense category name
 * @param {number} budgetLimit - Budget limit amount
 * @param {number} spent - Amount spent
 * @param {boolean} showAlert - Whether to show alert indicator
 */
const BudgetProgressBar = ({ category, budgetLimit, spent, showAlert = true }) => {
  // Calculate progress percentage
  const progress = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;
  
  // Cap display at 100% for the bar, but track actual percentage
  const displayProgress = Math.min(progress, 100);
  
  // Calculate remaining amount (can be negative for overspending)
  const remaining = budgetLimit - spent;
  
  // Determine status based on progress thresholds
  const getStatus = () => {
    if (progress >= 100) return 'critical';
    if (progress >= 90) return 'danger';
    if (progress >= 80) return 'warning';
    return 'safe';
  };
  
  const status = getStatus();
  
  // Determine if we should show alert indicators
  const shouldShowAlert = showAlert && progress >= 80;
  
  // Format currency - uses cached formatter
  const formatCurrency = (amount) => formatCAD(Math.abs(amount));
  
  return (
    <div className="budget-progress-bar">
      <div className="progress-header">
        <div className="progress-info">
          <span className="progress-percentage">{progress.toFixed(1)}%</span>
          <span className="progress-amounts">
            {formatCurrency(spent)} / {formatCurrency(budgetLimit)}
          </span>
        </div>
        {shouldShowAlert && (
          <div className={`alert-indicator alert-${status}`} title={`Budget at ${progress.toFixed(1)}%`}>
            {status === 'critical' ? '⚠' : status === 'danger' ? '!' : '⚡'}
          </div>
        )}
      </div>
      
      <div className="progress-bar-container">
        <div 
          className={`progress-bar-fill progress-${status}`}
          style={{ width: `${displayProgress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={`${category} budget progress: ${progress.toFixed(1)}%`}
        />
      </div>
      
      <div className="progress-footer">
        {remaining >= 0 ? (
          <span className="remaining-amount">
            {formatCurrency(remaining)} remaining
          </span>
        ) : (
          <span className="overage-amount">
            {formatCurrency(remaining)} over budget
          </span>
        )}
      </div>
    </div>
  );
};

export default BudgetProgressBar;
