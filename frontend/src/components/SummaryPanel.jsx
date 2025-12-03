import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import IncomeManagementModal from './IncomeManagementModal';
import FixedExpensesModal from './FixedExpensesModal';
import LoansModal from './LoansModal';
import InvestmentsModal from './InvestmentsModal';
import TrendIndicator from './TrendIndicator';
import { formatAmount } from '../utils/formatters';
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
  const [categories, setCategories] = useState([]);

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

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.CATEGORIES);
        if (!response.ok) {
          throw new Error('Failed to fetch categories');
        }
        const data = await response.json();
        setCategories(data.categories || []);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setCategories([]);
      }
    };

    fetchCategories();
  }, []);

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

      {/* Key Metrics Cards */}
      <div className="summary-grid">
        {/* Row 1: Income and Fixed Expenses */}
        <div className="summary-card highlight-card income-card">
          <div className="card-header">
            <span className="card-icon">≡ƒÆ░</span>
            <span className="card-title">Monthly Income</span>
          </div>
          <div className="card-value">${formatAmount(summary.monthlyGross)}</div>
          <button className="card-action-btn" onClick={handleOpenIncomeModal}>
            View/Edit
          </button>
        </div>

        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">≡ƒÅá</span>
            <span className="card-title">Fixed Expenses</span>
          </div>
          <div className="card-value expense-value">
            ${formatAmount(summary.totalFixedExpenses || 0)}
          </div>
          <button className="card-action-btn" onClick={handleOpenFixedExpensesModal}>
            View/Edit
          </button>
        </div>

        {/* Row 2: Variable Expenses and Net Balance */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">≡ƒô¥</span>
            <span className="card-title">Variable Expenses</span>
          </div>
          <div className="card-value expense-value">
            ${formatAmount(summary.total)}
          </div>
          <div className="card-subtitle">
            Monthly tracked expenses
          </div>
        </div>

        <div className="summary-card highlight-card balance-card">
          <div className="card-header">
            <span className="card-icon">≡ƒôè</span>
            <span className="card-title">Net Balance</span>
          </div>
          <div className={`card-value ${summary.netBalance >= 0 ? 'positive' : 'negative'}`}>
            ${formatAmount(summary.netBalance)}
          </div>
          <div className="card-subtitle">
            Income - Fixed - Variable
          </div>
        </div>

        {/* Row 3: Weekly and Payment Methods */}
        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">≡ƒôà</span>
            <span className="card-title">Weekly Breakdown</span>
          </div>
          <div className="card-content">
            <div className="compact-list">
              <div className="compact-item">
                <span>W1</span>
                <span>
                  ${formatAmount(summary?.weeklyTotals?.week1 || 0)}
                  <TrendIndicator 
                    currentValue={summary?.weeklyTotals?.week1 || 0} 
                    previousValue={previousSummary?.weeklyTotals?.week1} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>W2</span>
                <span>
                  ${formatAmount(summary?.weeklyTotals?.week2 || 0)}
                  <TrendIndicator 
                    currentValue={summary?.weeklyTotals?.week2 || 0} 
                    previousValue={previousSummary?.weeklyTotals?.week2} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>W3</span>
                <span>
                  ${formatAmount(summary?.weeklyTotals?.week3 || 0)}
                  <TrendIndicator 
                    currentValue={summary?.weeklyTotals?.week3 || 0} 
                    previousValue={previousSummary?.weeklyTotals?.week3} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>W4</span>
                <span>
                  ${formatAmount(summary?.weeklyTotals?.week4 || 0)}
                  <TrendIndicator 
                    currentValue={summary?.weeklyTotals?.week4 || 0} 
                    previousValue={previousSummary?.weeklyTotals?.week4} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>W5</span>
                <span>
                  ${formatAmount(summary?.weeklyTotals?.week5 || 0)}
                  <TrendIndicator 
                    currentValue={summary?.weeklyTotals?.week5 || 0} 
                    previousValue={previousSummary?.weeklyTotals?.week5} 
                  />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-header">
            <span className="card-icon">≡ƒÆ│</span>
            <span className="card-title">Payment Methods</span>
          </div>
          <div className="card-content">
            <div className="compact-list">
              <div className="compact-item">
                <span>Cash</span>
                <span>
                  ${formatAmount(summary.methodTotals?.Cash || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.Cash || 0} 
                    previousValue={previousSummary?.methodTotals?.Cash} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>Debit</span>
                <span>
                  ${formatAmount(summary.methodTotals?.Debit || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.Debit || 0} 
                    previousValue={previousSummary?.methodTotals?.Debit} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>Cheque</span>
                <span>
                  ${formatAmount(summary.methodTotals?.Cheque || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.Cheque || 0} 
                    previousValue={previousSummary?.methodTotals?.Cheque} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>CIBC MC</span>
                <span>
                  ${formatAmount(summary.methodTotals?.['CIBC MC'] || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.['CIBC MC'] || 0} 
                    previousValue={previousSummary?.methodTotals?.['CIBC MC']} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>PCF MC</span>
                <span>
                  ${formatAmount(summary.methodTotals?.['PCF MC'] || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.['PCF MC'] || 0} 
                    previousValue={previousSummary?.methodTotals?.['PCF MC']} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>WS VISA</span>
                <span>
                  ${formatAmount(summary.methodTotals?.['WS VISA'] || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.['WS VISA'] || 0} 
                    previousValue={previousSummary?.methodTotals?.['WS VISA']} 
                  />
                </span>
              </div>
              <div className="compact-item">
                <span>VISA</span>
                <span>
                  ${formatAmount(summary.methodTotals?.VISA || 0)}
                  <TrendIndicator 
                    currentValue={summary.methodTotals?.VISA || 0} 
                    previousValue={previousSummary?.methodTotals?.VISA} 
                  />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Expense Types */}
        <div className="summary-card full-width">
          <div className="card-header">
            <span className="card-icon">≡ƒÅ╖∩╕Å</span>
            <span className="card-title">Expense Types</span>
          </div>
          <div className="card-content">
            <div className="compact-list horizontal-list">
              {categories.map((category) => {
                const currentValue = summary.typeTotals[category] || 0;
                const previousValue = previousSummary?.typeTotals?.[category] || 0;
                
                // Only show categories that have expenses or had expenses in previous month
                if (currentValue === 0 && previousValue === 0) {
                  return null;
                }
                
                return (
                  <div key={category} className="compact-item">
                    <span>{category}</span>
                    <span>
                      ${formatAmount(currentValue)}
                      <TrendIndicator 
                        currentValue={currentValue} 
                        previousValue={previousValue} 
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {loans.length > 0 && (
        <div className="summary-card loans-card">
          <div className="card-header">
            <span className="card-icon">≡ƒÅª</span>
            <span className="card-title">Outstanding Loans</span>
          </div>
          <div className="card-content">
            <div className="compact-list">
              {loans.map(loan => (
                <div key={loan.id} className="compact-item">
                  <span>{loan.name} ({formatAmount(loan.currentRate)}%)</span>
                  <span>${formatAmount(loan.currentBalance)}</span>
                </div>
              ))}
            </div>
            <div className="card-total">
              <span>Total Debt:</span>
              <span className="total-value">${formatAmount(totalOutstandingDebt)}</span>
            </div>
          </div>
          <button className="card-action-btn" onClick={handleOpenLoansModal}>
            View/Edit
          </button>
        </div>
      )}

      {investments.length > 0 && (
        <div className="summary-card investments-card">
          <div className="card-header">
            <span className="card-icon">≡ƒôê</span>
            <span className="card-title">Investments</span>
          </div>
          <div className="card-content">
            <div className="compact-list">
              {investments.map(investment => (
                <div key={investment.id} className="compact-item">
                  <span>{investment.name} ({investment.type})</span>
                  <span>${formatAmount(investment.currentValue)}</span>
                </div>
              ))}
            </div>
            <div className="card-total">
              <span>Total Investment Value:</span>
              <span className="total-value investment-value">${formatAmount(totalInvestmentValue)}</span>
            </div>
          </div>
          <button className="card-action-btn" onClick={handleOpenInvestmentsModal}>
            ≡ƒæü∩╕Å View/Edit
          </button>
        </div>
      )}

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
