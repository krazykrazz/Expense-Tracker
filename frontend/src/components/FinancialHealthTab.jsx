import React from 'react';
import FinancialCard from './FinancialCard';
import './FinancialHealthTab.css';

/**
 * FinancialHealthTab Component
 * Displays financial health overview with cards for Income, Fixed Expenses, Loans, and Investments
 * Each card has an action button that opens the corresponding modal
 * 
 * @param {number} monthlyGross - Total monthly income
 * @param {number} totalFixedExpenses - Total fixed expenses
 * @param {number} totalOutstandingDebt - Total outstanding debt from loans
 * @param {number} totalInvestmentValue - Total investment portfolio value
 * @param {Array} loans - Array of loan objects for details display
 * @param {Array} investments - Array of investment objects for details display
 * @param {function} onIncomeClick - Handler for Income card action button
 * @param {function} onFixedExpensesClick - Handler for Fixed Expenses card action button
 * @param {function} onLoansClick - Handler for Loans card action button
 * @param {function} onInvestmentsClick - Handler for Investments card action button
 */
const FinancialHealthTab = ({
  monthlyGross = 0,
  totalFixedExpenses = 0,
  totalOutstandingDebt = 0,
  totalInvestmentValue = 0,
  loans = [],
  investments = [],
  onIncomeClick,
  onFixedExpensesClick,
  onLoansClick,
  onInvestmentsClick
}) => {
  // Prepare loan details for display
  const loanDetails = loans.map(loan => ({
    label: loan.name,
    value: loan.current_balance || 0
  }));

  // Prepare investment details for display
  const investmentDetails = investments.map(investment => ({
    label: investment.name,
    value: investment.current_value || 0
  }));

  return (
    <div className="financial-health-tab">
      <div className="financial-health-grid">
        <FinancialCard
          title="Income"
          icon="💰"
          value={monthlyGross}
          valueColor="positive"
          actionLabel="View/Edit"
          onAction={onIncomeClick}
        />

        <FinancialCard
          title="Fixed Expenses"
          icon="📋"
          value={totalFixedExpenses}
          valueColor="neutral"
          actionLabel="View/Edit"
          onAction={onFixedExpensesClick}
        />

        <FinancialCard
          title="Loans"
          icon="🏦"
          value={totalOutstandingDebt}
          valueColor="negative"
          actionLabel="Manage"
          onAction={onLoansClick}
          details={loanDetails}
        />

        <FinancialCard
          title="Investments"
          icon="📈"
          value={totalInvestmentValue}
          valueColor="positive"
          actionLabel="Manage"
          onAction={onInvestmentsClick}
          details={investmentDetails}
        />
      </div>
    </div>
  );
};

export default FinancialHealthTab;
