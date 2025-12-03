import React from 'react';
import { formatAmount } from '../utils/formatters';
import './KeyMetricsRow.css';

/**
 * KeyMetricsRow Component
 * Displays the three primary financial metrics prominently:
 * - Income (monthly gross)
 * - Total Expenses (fixed + variable)
 * - Net Balance (income - total expenses)
 * 
 * @param {number} income - Monthly gross income
 * @param {number} fixedExpenses - Total fixed expenses
 * @param {number} variableExpenses - Total variable expenses
 */
const KeyMetricsRow = ({ income = 0, fixedExpenses = 0, variableExpenses = 0 }) => {
  // Calculate total expenses as sum of fixed and variable
  const totalExpenses = fixedExpenses + variableExpenses;
  
  // Calculate net balance
  const netBalance = income - totalExpenses;
  
  // Determine color class for net balance
  const netBalanceColorClass = netBalance >= 0 ? 'positive' : 'negative';

  return (
    <div className="key-metrics-row">
      <div className="metric-card income-metric">
        <div className="metric-icon">💰</div>
        <div className="metric-content">
          <span className="metric-label">Income</span>
          <span className="metric-value income-value">
            ${formatAmount(income)}
          </span>
        </div>
      </div>

      <div className="metric-card expenses-metric">
        <div className="metric-icon">📊</div>
        <div className="metric-content">
          <span className="metric-label">Total Expenses</span>
          <span className="metric-value expenses-value">
            ${formatAmount(totalExpenses)}
          </span>
          <span className="metric-breakdown">
            Fixed: ${formatAmount(fixedExpenses)} + Variable: ${formatAmount(variableExpenses)}
          </span>
        </div>
      </div>

      <div className="metric-card balance-metric">
        <div className="metric-icon">💵</div>
        <div className="metric-content">
          <span className="metric-label">Net Balance</span>
          <span className={`metric-value ${netBalanceColorClass}`}>
            ${formatAmount(netBalance)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default KeyMetricsRow;
