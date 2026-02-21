import React from 'react';
import { formatCAD } from '../utils/formatters';
import BudgetProgressBar from './BudgetProgressBar';
import TrendIndicator from './TrendIndicator';
import './BudgetCard.css';

/**
 * BudgetCard Component
 * Summary card showing budget status for a single category
 * 
 * @param {string} category - Expense category name
 * @param {number} budgetLimit - Budget limit amount
 * @param {number} spent - Amount spent
 * @param {number|null} previousMonthSpent - Previous month spending for trend comparison
 */
const BudgetCard = ({ category, budgetLimit, spent, previousMonthSpent = null }) => {
  // Ensure numeric values with defaults
  const safeLimit = Number(budgetLimit) || 0;
  const safeSpent = Number(spent) || 0;
  
  // Calculate remaining amount (can be negative for overspending)
  const remaining = safeLimit - safeSpent;
  const isOverBudget = remaining < 0;
  
  // Get category icon
  const getCategoryIcon = (cat) => {
    const icons = {
      'Food': '🍽️',
      'Gas': '⛽',
      'Other': '📦'
    };
    return icons[cat] || '💰';
  };
  
  // Format currency - uses cached formatter
  const formatCurrency = (amount) => formatCAD(Math.abs(amount));
  
  return (
    <div className="budget-card">
      <div className="budget-card-header">
        <div className="category-info">
          <span className="category-icon" aria-hidden="true">
            {getCategoryIcon(category)}
          </span>
          <h3 className="category-name">{category}</h3>
          {previousMonthSpent !== null && previousMonthSpent !== undefined && (
            <TrendIndicator 
              currentValue={safeSpent} 
              previousValue={Number(previousMonthSpent) || 0}
              threshold={0.05}
            />
          )}
        </div>
      </div>
      
      <div className="budget-card-body">
        <div className="budget-amounts">
          <div className="amount-row">
            <span className="amount-label">Budget:</span>
            <span className="amount-value">{formatCurrency(safeLimit)}</span>
          </div>
          <div className="amount-row">
            <span className="amount-label">Spent:</span>
            <span className="amount-value">{formatCurrency(safeSpent)}</span>
          </div>
          <div className="amount-row">
            <span className="amount-label">
              {isOverBudget ? 'Over:' : 'Remaining:'}
            </span>
            <span className={`amount-value ${isOverBudget ? 'over-budget' : 'under-budget'}`}>
              {formatCurrency(remaining)}
            </span>
          </div>
        </div>
        
        <BudgetProgressBar 
          category={category}
          budgetLimit={safeLimit}
          spent={safeSpent}
          showAlert={true}
        />
      </div>
    </div>
  );
};

export default BudgetCard;
