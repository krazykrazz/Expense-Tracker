import { useState, useEffect } from 'react';
import './TotalDebtView.css';
import { getTotalDebtOverTime } from '../services/loanBalanceApi';
import { formatCurrency, formatMonth } from '../utils/formatters';

const TotalDebtView = ({ isOpen, onClose }) => {
  const [debtHistory, setDebtHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchDebtHistory();
    }
  }, [isOpen]);

  const fetchDebtHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getTotalDebtOverTime();
      setDebtHistory(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load total debt history');
      console.error('Error fetching total debt history:', err);
    } finally {
      setLoading(false);
    }
  };



  const calculateChange = (current, previous) => {
    if (!previous) return null;
    const change = current - previous;
    const percentChange = (change / previous) * 100;
    return { amount: change, percent: percentChange };
  };



  if (!isOpen) {
    return null;
  }

  return (
    <div className="total-debt-modal-overlay" onClick={onClose}>
      <div className="total-debt-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="total-debt-modal-header">
          <h2>Total Outstanding Debt Over Time</h2>
          <button className="total-debt-modal-close" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div className="total-debt-modal-error">
            {error}
            <button className="total-debt-error-retry-button" onClick={fetchDebtHistory}>
              Retry
            </button>
          </div>
        )}

        <div className="total-debt-modal-content">
          {loading ? (
            <div className="total-debt-loading">Loading debt history...</div>
          ) : debtHistory.length === 0 ? (
            <div className="total-debt-empty">
              No debt history available. Add balance entries to your loans to see the total debt trend.
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="total-debt-summary">
                <div className="total-debt-stat">
                  <span className="total-debt-stat-label">Current Total Debt</span>
                  <span className="total-debt-stat-value">
                    {formatCurrency(debtHistory[debtHistory.length - 1].total_debt)}
                  </span>
                </div>
                <div className="total-debt-stat">
                  <span className="total-debt-stat-label">Starting Total Debt</span>
                  <span className="total-debt-stat-value">
                    {formatCurrency(debtHistory[0].total_debt)}
                  </span>
                </div>
                <div className="total-debt-stat">
                  <span className="total-debt-stat-label">Total Reduction</span>
                  <span className="total-debt-stat-value total-debt-reduction">
                    {formatCurrency(debtHistory[0].total_debt - debtHistory[debtHistory.length - 1].total_debt)}
                  </span>
                </div>
                <div className="total-debt-stat">
                  <span className="total-debt-stat-label">Active Loans</span>
                  <span className="total-debt-stat-value">
                    {debtHistory[debtHistory.length - 1].loan_count}
                  </span>
                </div>
              </div>

              {/* History Table */}
              <div className="total-debt-history-table">
                <h3>Monthly History</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Total Debt</th>
                      <th>Change</th>
                      <th>Active Loans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...debtHistory].reverse().map((entry, index) => {
                      const prevEntry = index < debtHistory.length - 1 ? debtHistory[debtHistory.length - 2 - index] : null;
                      const change = calculateChange(entry.total_debt, prevEntry?.total_debt);
                      
                      return (
                        <tr key={`${entry.year}-${entry.month}`}>
                          <td>{formatMonth(entry.year, entry.month)}</td>
                          <td className="total-debt-amount">{formatCurrency(entry.total_debt)}</td>
                          <td className={`total-debt-change ${change ? (change.amount < 0 ? 'negative' : 'positive') : ''}`}>
                            {change ? (
                              <>
                                {change.amount < 0 ? '▼' : '▲'} {formatCurrency(Math.abs(change.amount))}
                                <span className="total-debt-change-percent">
                                  ({change.percent.toFixed(1)}%)
                                </span>
                              </>
                            ) : '—'}
                          </td>
                          <td>{entry.loan_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TotalDebtView;
