import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import IncomeManagementModal from './IncomeManagementModal';
import FixedExpensesModal from './FixedExpensesModal';
import LoansModal from './LoansModal';
import InvestmentsModal from './InvestmentsModal';
import KeyMetricsRow from './KeyMetricsRow';
import TabNavigation from './TabNavigation';
import BreakdownTab from './BreakdownTab';
import CategoriesTab from './CategoriesTab';
import FinancialHealthTab from './FinancialHealthTab';
import './SummaryPanel.css';

const SummaryPanel = ({ selectedYear, selectedMonth, refreshTrigger }) => {
  const [summary, setSummary] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('breakdown');
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false);
  const [showLoansModal, setShowLoansModal] = useState(false);
  const [showInvestmentsModal, setShowInvestmentsModal] = useState(false);
  const [loans, setLoans] = useState([]);
  const [totalOutstandingDebt, setTotalOutstandingDebt] = useState(0);
  const [investments, setInvestments] = useState([]);
  const [totalInvestmentValue, setTotalInvestmentValue] = useState(0);

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

  // Define tabs for navigation
  const tabs = [
    { id: 'breakdown', label: 'Breakdown', icon: '📊' },
    { id: 'categories', label: 'Categories', icon: '🏷️' },
    { id: 'financial', label: 'Financial Health', icon: '💰' }
  ];

  // Handle tab change
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  if (loading) {
    return (
      <div className="summary-panel">
        <h2>Monthly Summary</h2>
        
        {/* Skeleton Loader for Key Metrics */}
        <div className="key-metrics-skeleton">
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
          <div className="skeleton-card"></div>
        </div>

        {/* Skeleton Loader for Tab Navigation */}
        <div className="tab-navigation-skeleton">
          <div className="skeleton-tab"></div>
          <div className="skeleton-tab"></div>
          <div className="skeleton-tab"></div>
        </div>

        {/* Skeleton Loader for Tab Content */}
        <div className="tab-content-skeleton">
          <div className="skeleton-section"></div>
          <div className="skeleton-section"></div>
        </div>
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

      {/* Key Metrics Row */}
      <KeyMetricsRow
        income={summary.monthlyGross || 0}
        fixedExpenses={summary.totalFixedExpenses || 0}
        variableExpenses={summary.total || 0}
      />

      {/* Tab Navigation */}
      <TabNavigation
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'breakdown' && (
          <BreakdownTab
            weeklyTotals={summary.weeklyTotals || {}}
            methodTotals={summary.methodTotals || {}}
            previousWeeklyTotals={previousSummary?.weeklyTotals || {}}
            previousMethodTotals={previousSummary?.methodTotals || {}}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesTab
            typeTotals={summary.typeTotals || {}}
            previousTypeTotals={previousSummary?.typeTotals || {}}
          />
        )}

        {activeTab === 'financial' && (
          <FinancialHealthTab
            monthlyGross={summary.monthlyGross || 0}
            totalFixedExpenses={summary.totalFixedExpenses || 0}
            totalOutstandingDebt={totalOutstandingDebt}
            totalInvestmentValue={totalInvestmentValue}
            loans={loans}
            investments={investments}
            onIncomeClick={handleOpenIncomeModal}
            onFixedExpensesClick={handleOpenFixedExpensesModal}
            onLoansClick={handleOpenLoansModal}
            onInvestmentsClick={handleOpenInvestmentsModal}
          />
        )}
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
