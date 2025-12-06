import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import IncomeManagementModal from './IncomeManagementModal';
import FixedExpensesModal from './FixedExpensesModal';
import LoansModal from './LoansModal';
import InvestmentsModal from './InvestmentsModal';
import TrendIndicator from './TrendIndicator';
import './SummaryPanel.css';

const SummaryPanel = ({ selectedYear, selectedMonth, refreshTrigger }) => {
  const [summary, setSummary] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false);
  const [showLoansModal, setShowLoansModal] = useState(false);
  const [showInvestmentsModal, setShowInvestmentsModal] = useState(false);
  const [loans, setLoans] = useState([]);
  const [totalOutstandingDebt, setTotalOutstandingDebt] = useState(0);
  const [investments, setInvestments] = useState([]);
  const [totalInvestmentValue, setTotalInvestmentValue] = useState(0);
  
  // Collapsible panel states
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [expenseTypesOpen, setExpenseTypesOpen] = useState(false);

  /**
   * Process summary data and update state
   * Handles both old (single summary) and new (current/previous) response formats
   */
  const processSummaryData = useCallback((data) => {
    if (data.current) {
      // New structure with previous month data
      setSummary(data.current);
      setPreviousSummary(data.previous);
      
      // Extract loan data from current summary
      if (data.current.loans && Array.isArray(data.current.loans)) {
        setLoans(data.current.loans);
        setTotalOutstandingDebt(data.current.totalOutstandingDebt || 0);
      } else {
        setLoans([]);
        setTotalOutstandingDebt(0);
      }
      
      // Extract investment data from current summary
      if (data.current.investments && Array.isArray(data.current.investments)) {
        setInvestments(data.current.investments);
        setTotalInvestmentValue(data.current.totalInvestmentValue || 0);
      } else {
        setInvestments([]);
        setTotalInvestmentValue(0);
      }
    } else {
      // Old structure (single summary)
      setSummary(data);
      setPreviousSummary(null);
      
      // Extract loan data from summary response
      if (data.loans && Array.isArray(data.loans)) {
        setLoans(data.loans);
        setTotalOutstandingDebt(data.totalOutstandingDebt || 0);
      } else {
        setLoans([]);
        setTotalOutstandingDebt(0);
      }
      
      // Extract investment data from summary response
      if (data.investments && Array.isArray(data.investments)) {
        setInvestments(data.investments);
        setTotalInvestmentValue(data.totalInvestmentValue || 0);
      } else {
        setInvestments([]);
        setTotalInvestmentValue(0);
      }
    }
  }, []);

  /**
   * Fetch summary data from API
   * Reusable function to avoid code duplication
   */
  const fetchSummaryData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_ENDPOINTS.SUMMARY}?year=${selectedYear}&month=${selectedMonth}&includePrevious=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }

      const data = await response.json();
      processSummaryData(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching summary:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, processSummaryData]);

  // Fetch summary when dependencies change
  useEffect(() => {
    fetchSummaryData();
  }, [fetchSummaryData, refreshTrigger]);

  // Modal handlers - simplified using shared fetch function
  const handleOpenIncomeModal = () => setShowIncomeModal(true);
  const handleOpenFixedExpensesModal = () => setShowFixedExpensesModal(true);
  const handleOpenLoansModal = () => setShowLoansModal(true);
  const handleOpenInvestmentsModal = () => setShowInvestmentsModal(true);

  const handleCloseIncomeModal = async () => {
    setShowIncomeModal(false);
    await fetchSummaryData();
  };

  const handleCloseFixedExpensesModal = async () => {
    setShowFixedExpensesModal(false);
    await fetchSummaryData();
  };

  const handleCloseLoansModal = async () => {
    setShowLoansModal(false);
    await fetchSummaryData();
  };

  const handleCloseInvestmentsModal = async () => {
    setShowInvestmentsModal(false);
    await fetchSummaryData();
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="summary-panel">
        <h2>Monthly Summary</h2>
        <div className="loading-message">Loading summary...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="summary-panel">
        <h2>Monthly Summary</h2>
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="summary-panel">
      <h2>Monthly Summary</h2>

      {/* Summary Cards Grid - Order: Income, Fixed, Variable, Balance */}
      <div className="summary-grid">
        {/* Monthly Income Card */}
        <div className="summary-card income-card">
          <div className="card-header">
            <span className="card-icon">🏠</span>
            <span className="card-title">Monthly Income</span>
          </div>
          <div className="card-value positive">{formatCurrency(summary.monthlyGross || 0)}</div>
          <button className="card-action-btn" onClick={handleOpenIncomeModal}>
            Manage Income
          </button>
        </div>

        {/* Fixed Expenses Card */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">📝</span>
            <span className="card-title">Fixed Expenses</span>
          </div>
          <div className="card-value expense-value">{formatCurrency(summary.totalFixedExpenses || 0)}</div>
          <button className="card-action-btn" onClick={handleOpenFixedExpensesModal}>
            Manage Fixed
          </button>
        </div>

        {/* Variable Expenses Card */}
        <div className="summary-card highlight-card">
          <div className="card-header">
            <span className="card-icon">💰</span>
            <span className="card-title">Variable Expenses</span>
          </div>
          <div className="card-value expense-value">{formatCurrency(summary.total || 0)}</div>
        </div>

        {/* Balance Card */}
        <div className="summary-card balance-card">
          <div className="card-header">
            <span className="card-icon">📊</span>
            <span className="card-title">Balance</span>
          </div>
          <div className={`card-value ${(summary.monthlyGross - summary.total - summary.totalFixedExpenses) >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency((summary.monthlyGross || 0) - (summary.total || 0) - (summary.totalFixedExpenses || 0))}
          </div>
          <div className="card-subtitle">Income - All Expenses</div>
        </div>

        {/* Collapsible: Weekly Breakdown */}
        <div className="summary-card full-width">
          <div className="collapsible-header" onClick={() => setWeeklyOpen(!weeklyOpen)}>
            <div className="card-header">
              <span className="card-icon">📅</span>
              <span className="card-title">Weekly Breakdown</span>
            </div>
            <span className="collapse-icon">{weeklyOpen ? '▼' : '▶'}</span>
          </div>
          {weeklyOpen && (
            <div className="card-content">
              <div className="compact-list">
                {Object.entries(summary.weeklyTotals || {}).map(([week, amount]) => {
                  const previousAmount = previousSummary?.weeklyTotals?.[week];
                  return (
                    <div key={week} className="compact-item">
                      <span>Week {week.replace('week', '')}</span>
                      <span>
                        {formatCurrency(amount)}
                        <TrendIndicator currentValue={amount} previousValue={previousAmount} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible: Payment Methods */}
        <div className="summary-card full-width">
          <div className="collapsible-header" onClick={() => setPaymentOpen(!paymentOpen)}>
            <div className="card-header">
              <span className="card-icon">💳</span>
              <span className="card-title">Payment Methods</span>
            </div>
            <span className="collapse-icon">{paymentOpen ? '▼' : '▶'}</span>
          </div>
          {paymentOpen && (
            <div className="card-content">
              <div className="compact-list">
                {Object.entries(summary.methodTotals || {}).map(([method, amount]) => {
                  const previousAmount = previousSummary?.methodTotals?.[method];
                  return (
                    <div key={method} className="compact-item">
                      <span>{method}</span>
                      <span>
                        {formatCurrency(amount)}
                        <TrendIndicator currentValue={amount} previousValue={previousAmount} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible: Expense Types */}
        <div className="summary-card full-width">
          <div className="collapsible-header" onClick={() => setExpenseTypesOpen(!expenseTypesOpen)}>
            <div className="card-header">
              <span className="card-icon">🏷️</span>
              <span className="card-title">Expense Types</span>
            </div>
            <span className="collapse-icon">{expenseTypesOpen ? '▼' : '▶'}</span>
          </div>
          {expenseTypesOpen && (
            <div className="card-content">
              <div className="compact-list">
                {Object.entries(summary.typeTotals || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, amount]) => {
                    const previousAmount = previousSummary?.typeTotals?.[type];
                    return (
                      <div key={type} className="compact-item">
                        <span>{type}</span>
                        <span>
                          {formatCurrency(amount)}
                          <TrendIndicator currentValue={amount} previousValue={previousAmount} />
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Loans Card */}
        <div className="summary-card loans-card">
          <div className="card-header">
            <span className="card-icon">🏦</span>
            <span className="card-title">Outstanding Debt</span>
          </div>
          {loans.length > 0 ? (
            <>
              <div className="card-value negative">{formatCurrency(totalOutstandingDebt)}</div>
              <button className="card-action-btn" onClick={handleOpenLoansModal}>
                Manage Loans
              </button>
            </>
          ) : (
            <>
              <div className="card-value">{formatCurrency(0)}</div>
              <button className="card-action-btn" onClick={handleOpenLoansModal}>
                Manage Loans
              </button>
            </>
          )}
        </div>

        {/* Investments Card */}
        <div className="summary-card investments-card">
          <div className="card-header">
            <span className="card-icon">📈</span>
            <span className="card-title">Total Investments</span>
          </div>
          {investments.length > 0 ? (
            <>
              <div className="card-value positive">{formatCurrency(totalInvestmentValue)}</div>
              <button className="card-action-btn" onClick={handleOpenInvestmentsModal}>
                Manage Investments
              </button>
            </>
          ) : (
            <>
              <div className="card-value">{formatCurrency(0)}</div>
              <button className="card-action-btn" onClick={handleOpenInvestmentsModal}>
                Manage Investments
              </button>
            </>
          )}
        </div>

        {/* Net Worth Card */}
        <div className="summary-card net-worth-card">
          <div className="card-header">
            <span className="card-icon">💎</span>
            <span className="card-title">Net Worth</span>
          </div>
          <div className={`card-value ${(totalInvestmentValue - totalOutstandingDebt) >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(totalInvestmentValue - totalOutstandingDebt)}
          </div>
          <div className="net-worth-breakdown">
            <span className="assets-label">Assets: {formatCurrency(totalInvestmentValue)}</span>
            <span className="separator">-</span>
            <span className="liabilities-label">Liabilities: {formatCurrency(totalOutstandingDebt)}</span>
          </div>
          <div className="card-subtitle">Current month position</div>
        </div>
      </div>

      {showIncomeModal && (
        <IncomeManagementModal
          isOpen={showIncomeModal}
          onClose={handleCloseIncomeModal}
          year={selectedYear}
          month={selectedMonth}
          onUpdate={handleCloseIncomeModal}
        />
      )}

      {showFixedExpensesModal && (
        <FixedExpensesModal
          isOpen={showFixedExpensesModal}
          onClose={handleCloseFixedExpensesModal}
          year={selectedYear}
          month={selectedMonth}
          onUpdate={handleCloseFixedExpensesModal}
        />
      )}

      {showLoansModal && (
        <LoansModal
          isOpen={showLoansModal}
          onClose={handleCloseLoansModal}
          year={selectedYear}
          month={selectedMonth}
          onUpdate={handleCloseLoansModal}
        />
      )}

      {showInvestmentsModal && (
        <InvestmentsModal
          isOpen={showInvestmentsModal}
          onClose={handleCloseInvestmentsModal}
          year={selectedYear}
          month={selectedMonth}
          onUpdate={handleCloseInvestmentsModal}
        />
      )}
    </div>
  );
};

export default SummaryPanel;
