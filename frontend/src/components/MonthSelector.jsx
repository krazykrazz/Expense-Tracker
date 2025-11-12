import './MonthSelector.css';

const MonthSelector = ({ selectedYear, selectedMonth, onMonthChange, onViewAnnualSummary }) => {
  // Generate year range from 2020 to 2030
  const years = [];
  for (let year = 2020; year <= 2030; year++) {
    years.push(year);
  }

  // Month names for display
  const months = [
    { value: 1, name: 'January' },
    { value: 2, name: 'February' },
    { value: 3, name: 'March' },
    { value: 4, name: 'April' },
    { value: 5, name: 'May' },
    { value: 6, name: 'June' },
    { value: 7, name: 'July' },
    { value: 8, name: 'August' },
    { value: 9, name: 'September' },
    { value: 10, name: 'October' },
    { value: 11, name: 'November' },
    { value: 12, name: 'December' }
  ];

  const handleYearChange = (e) => {
    const year = parseInt(e.target.value, 10);
    onMonthChange(year, selectedMonth);
  };

  const handleMonthChange = (e) => {
    const month = parseInt(e.target.value, 10);
    onMonthChange(selectedYear, month);
  };

  return (
    <div className="month-selector">
      <div className="selector-group">
        <label htmlFor="year-select">Year:</label>
        <select 
          id="year-select"
          value={selectedYear} 
          onChange={handleYearChange}
        >
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <button 
        className="annual-summary-button"
        onClick={onViewAnnualSummary}
        title="View annual summary"
      >
        📊 Annual Summary
      </button>

      <div className="selector-group">
        <label htmlFor="month-select">Month:</label>
        <select 
          id="month-select"
          value={selectedMonth} 
          onChange={handleMonthChange}
        >
          {months.map(month => (
            <option key={month.value} value={month.value}>
              {month.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default MonthSelector;
