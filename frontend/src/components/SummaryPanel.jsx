import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
import IncomeManagementModal from './IncomeManagementModal';
import FixedExpensesModal from './FixedExpensesModal';
import './SummaryPanel.css';

const SummaryPanel = ({ selectedYear, selectedMonth, refreshTrigger }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_ENDPOINTS.SUMMARY}?year=${selectedYear}&month=${selectedMonth}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch summary data');
        }

        const data = await response.json();
        setSummary(data);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [selectedYear, selectedMonth, refreshTrigger]);

  const formatAmount = (amount) => {
    return parseFloat(amount || 0).toFixed(2);
  };

  const handleOpenIncomeModal = () => {
    setShowIncomeModal(true);
  };

  const handleCloseIncomeModal = async () => {
    setShowIncomeModal(false);
    
    // Refresh summary to reflect changes
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_ENDPOINTS.SUMMARY}?year=${selectedYear}&month=${selectedMonth}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFixedExpensesModal = () => {
    setShowFixedExpensesModal(true);
  };

  const handleCloseFixedExpensesModal = async () => {
    setShowFixedExpensesModal(false);
    
    // Refresh summary to reflect changes
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_ENDPOINTS.SUMMARY}?year=${selectedYear}&month=${selectedMonth}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching summary:', err);
    } finally {
      setLoading(false);
    }
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

      <div className="summary-columns">
        <div className="summary-column">
          <h3>Weekly Totals</h3>
          <div className="summary-list">
            <div className="summary-item">
              <span className="summary-label">Week 1:</span>
              <span className="summary-value">${formatAmount(summary.weeklyTotals.week1)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Week 2:</span>
              <span className="summary-value">${formatAmount(summary.weeklyTotals.week2)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Week 3:</span>
              <span className="summary-value">${formatAmount(summary.weeklyTotals.week3)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Week 4:</span>
              <span className="summary-value">${formatAmount(summary.weeklyTotals.week4)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Week 5:</span>
              <span className="summary-value">${formatAmount(summary.weeklyTotals.week5)}</span>
            </div>
          </div>
        </div>

        <div className="summary-column">
          <h3>Payment Methods</h3>
          <div className="summary-list">
            <div className="summary-item">
              <span className="summary-label">Cash:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals.Cash)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Debit:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals.Debit)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Cheque:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals.Cheque)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">CIBC MC:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals['CIBC MC'])}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">PCF MC:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals['PCF MC'])}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">WS VISA:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals['WS VISA'])}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">VISA:</span>
              <span className="summary-value">${formatAmount(summary.methodTotals.VISA)}</span>
            </div>
          </div>
        </div>

        <div className="summary-column">
          <h3>Types</h3>
          <div className="summary-list">
            <div className="summary-item">
              <span className="summary-label">Food:</span>
              <span className="summary-value">${formatAmount(summary.typeTotals.Food)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Gas:</span>
              <span className="summary-value">${formatAmount(summary.typeTotals.Gas)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Tax - Medical:</span>
              <span className="summary-value">${formatAmount(summary.typeTotals['Tax - Medical'])}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Tax - Donation:</span>
              <span className="summary-value">${formatAmount(summary.typeTotals['Tax - Donation'])}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Other:</span>
              <span className="summary-value">${formatAmount(summary.typeTotals.Other)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="balance-sheet">
        <div className="balance-row">
          <span className="balance-label">Monthly Gross Income:</span>
          <div className="balance-value-container">
            <span className="balance-value">${formatAmount(summary.monthlyGross)}</span>
            <button className="view-income-button" onClick={handleOpenIncomeModal}>
              👁️ View/Edit
            </button>
          </div>
        </div>
        
        <div className="balance-row">
          <span className="balance-label">Total Fixed Expenses:</span>
          <div className="balance-value-container">
            <span className="balance-value expense-value">-${formatAmount(summary.totalFixedExpenses || 0)}</span>
            <button className="view-fixed-expenses-button" onClick={handleOpenFixedExpensesModal}>
              👁️ View/Edit
            </button>
          </div>
        </div>
        
        <div className="balance-row">
          <span className="balance-label">Total Expenses:</span>
          <span className="balance-value expense-value">-${formatAmount(summary.total)}</span>
        </div>
        
        <div className="balance-row balance-total">
          <span className="balance-label">Net Balance:</span>
          <span className={`balance-value ${summary.netBalance >= 0 ? 'positive' : 'negative'}`}>
            ${formatAmount(summary.netBalance)}
          </span>
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
    </div>
  );
};

export default SummaryPanel;
