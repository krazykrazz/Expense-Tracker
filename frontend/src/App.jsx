import { useState, useEffect } from 'react';
import './App.css';
import ExpenseForm from './components/ExpenseForm';
import MonthSelector from './components/MonthSelector';
import ExpenseList from './components/ExpenseList';
import SearchBar from './components/SearchBar';
import SummaryPanel from './components/SummaryPanel';
import BackupSettings from './components/BackupSettings';
import AnnualSummary from './components/AnnualSummary';
import { API_ENDPOINTS } from './config';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const [showAnnualSummary, setShowAnnualSummary] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterMethod, setFilterMethod] = useState('');

  // Fetch expenses when month/year changes or when searching
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let url;
        if (searchText && searchText.trim().length > 0) {
          // Global search - fetch all expenses
          url = `${API_ENDPOINTS.EXPENSES}`;
        } else {
          // Month-specific view
          url = `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to fetch expenses');
        }
        
        const data = await response.json();
        setExpenses(data);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching expenses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchExpenses();
  }, [selectedYear, selectedMonth, searchText]);

  const handleExpenseAdded = (newExpense) => {
    // Add new expense to the list if it belongs to the selected month
    const expenseDate = new Date(newExpense.date);
    const expenseYear = expenseDate.getFullYear();
    const expenseMonth = expenseDate.getMonth() + 1;
    
    if (expenseYear === selectedYear && expenseMonth === selectedMonth) {
      setExpenses(prev => {
        // Insert in chronological order
        const newList = [...prev, newExpense];
        newList.sort((a, b) => new Date(a.date) - new Date(b.date));
        return newList;
      });
    }
    
    // Trigger summary refresh and close modal
    setRefreshTrigger(prev => prev + 1);
    setShowExpenseForm(false);
  };

  const handleExpenseDeleted = (deletedId) => {
    // Remove deleted expense from the list
    setExpenses(prev => prev.filter(expense => expense.id !== deletedId));
    
    // Trigger summary refresh
    setRefreshTrigger(prev => prev + 1);
  };

  const handleExpenseUpdated = (updatedExpense) => {
    // Update the expense in the list
    setExpenses(prev => prev.map(expense => 
      expense.id === updatedExpense.id ? updatedExpense : expense
    ));
    
    // Trigger summary refresh
    setRefreshTrigger(prev => prev + 1);
  };

  const handleMonthChange = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleSearchChange = (text) => {
    setSearchText(text);
  };

  // Filter expenses based on search text, type, and method
  const filteredExpenses = expenses.filter(expense => {
    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      const placeMatch = expense.place && expense.place.toLowerCase().includes(searchLower);
      const notesMatch = expense.notes && expense.notes.toLowerCase().includes(searchLower);
      
      if (!placeMatch && !notesMatch) {
        return false;
      }
    }
    
    // Type filter
    if (filterType && expense.type !== filterType) {
      return false;
    }
    
    // Method filter
    if (filterMethod && expense.method !== filterMethod) {
      return false;
    }
    
    return true;
  });

  return (
    <div className="App">
      <header className="App-header">
        <h1>Expense Tracker</h1>
        <div className="header-buttons">
          <button 
            className="settings-button" 
            onClick={() => setShowBackupSettings(true)}
            aria-label="Settings"
            title="Backup, import, and restore settings"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>
      <main className="App-main">
        <MonthSelector 
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
          onViewAnnualSummary={() => setShowAnnualSummary(true)}
        />
        <div className="filters-container">
          <SearchBar onSearchChange={handleSearchChange} />
          <div className="filter-dropdowns">
            <div className="filter-group">
              <label htmlFor="type-filter">Type:</label>
              <select 
                id="type-filter"
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="Other">Other</option>
                <option value="Food">Food</option>
                <option value="Gas">Gas</option>
                <option value="Tax - Medical">Tax - Medical</option>
                <option value="Tax - Donation">Tax - Donation</option>
              </select>
            </div>
            <div className="filter-group">
              <label htmlFor="method-filter">Payment Method:</label>
              <select 
                id="method-filter"
                value={filterMethod} 
                onChange={(e) => setFilterMethod(e.target.value)}
              >
                <option value="">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="Debit">Debit</option>
                <option value="CIBC MC">CIBC MC</option>
                <option value="PCF MC">PCF MC</option>
                <option value="WS VISA">WS VISA</option>
                <option value="VISA">VISA</option>
              </select>
            </div>
          </div>
        </div>
        
        {loading && <div className="loading-message">Loading expenses...</div>}
        {error && <div className="error-message">Error: {error}</div>}
        {!loading && !error && (
          <div className="content-layout">
            <div className="content-left">
              <ExpenseList 
                expenses={filteredExpenses}
                onExpenseDeleted={handleExpenseDeleted}
                onExpenseUpdated={handleExpenseUpdated}
                searchText={searchText}
                onAddExpense={() => setShowExpenseForm(true)}
              />
            </div>
            <div className="content-right">
              <SummaryPanel 
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        )}
      </main>

      {showExpenseForm && (
        <div className="modal-overlay" onClick={() => setShowExpenseForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowExpenseForm(false)}
              aria-label="Close"
            >
              ×
            </button>
            <ExpenseForm onExpenseAdded={handleExpenseAdded} />
          </div>
        </div>
      )}

      {showBackupSettings && (
        <div className="modal-overlay" onClick={() => setShowBackupSettings(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowBackupSettings(false)}
              aria-label="Close"
            >
              ×
            </button>
            <BackupSettings />
          </div>
        </div>
      )}

      {showAnnualSummary && (
        <div className="modal-overlay" onClick={() => setShowAnnualSummary(false)}>
          <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={() => setShowAnnualSummary(false)}
              aria-label="Close"
            >
              ×
            </button>
            <AnnualSummary year={selectedYear} />
          </div>
        </div>
      )}

      <footer className="App-footer">
        <span className="version">v3.3.4</span>
      </footer>
    </div>
  );
}

export default App;
