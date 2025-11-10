import React, { useState, useEffect } from 'react';
import './App.css';
import ExpenseForm from './components/ExpenseForm';
import MonthSelector from './components/MonthSelector';
import ExpenseList from './components/ExpenseList';
import SearchBar from './components/SearchBar';
import SummaryPanel from './components/SummaryPanel';
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
  const [filterType, setFilterType] = useState('');
  const [filterMethod, setFilterMethod] = useState('');

  // Fetch expenses when month/year changes
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `${API_ENDPOINTS.EXPENSES}?year=${selectedYear}&month=${selectedMonth}`
        );
        
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
  }, [selectedYear, selectedMonth]);

  const handleExpenseAdded = (newExpense) => {
    // Add new expense to the list if it belongs to the selected month
    const expenseDate = new Date(newExpense.date);
    const expenseYear = expenseDate.getFullYear();
    const expenseMonth = expenseDate.getMonth() + 1;
    
    if (expenseYear === selectedYear && expenseMonth === selectedMonth) {
      setExpenses(prev => [newExpense, ...prev]);
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

  const handleMonthChange = (year, month) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleSearchChange = (text) => {
    setSearchText(text);
  };

  const handleBackup = async () => {
    try {
      const response = await fetch('/api/backup');
      
      if (!response.ok) {
        throw new Error('Failed to backup database');
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'expense-tracker-backup.db';
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Backup error:', error);
      alert('Failed to backup database. Please try again.');
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to import expenses');
      }

      const result = await response.json();
      
      let message = `Import completed!\n${result.successCount} expenses imported successfully.`;
      if (result.errorCount > 0) {
        message += `\n${result.errorCount} errors occurred.`;
      }
      
      alert(message);
      
      // Refresh the page to show new data
      window.location.reload();
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import expenses. Please check your CSV format.');
    }

    // Reset file input
    event.target.value = '';
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
          <label className="import-button" title="Import expenses from CSV">
            📥 Import
            <input 
              type="file" 
              accept=".csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
          <button 
            className="backup-button" 
            onClick={handleBackup}
            aria-label="Backup database"
            title="Download database backup"
          >
            💾 Backup
          </button>
        </div>
      </header>
      <main className="App-main">
        <MonthSelector 
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
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
          <>
            <ExpenseList 
              expenses={filteredExpenses}
              onExpenseDeleted={handleExpenseDeleted}
              searchText={searchText}
              onAddExpense={() => setShowExpenseForm(true)}
            />
            <SummaryPanel 
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              refreshTrigger={refreshTrigger}
            />
          </>
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
    </div>
  );
}

export default App;
