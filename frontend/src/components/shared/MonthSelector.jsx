import './MonthSelector.css';
import { getMonthNameLong } from '../../utils/formatters';
import { shiftMonth } from '../../utils/yearMonth';

const MIN_YEAR = 2000;
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, name: getMonthNameLong(i + 1) }));

const MonthSelector = ({ selectedYear, selectedMonth, onMonthChange, onViewAnnualSummary, onViewTaxDeductible, onOpenBudgets, onOpenAnalyticsHub, onOpenFinancialOverview }) => {
  // Generate a broad year range that supports imported legacy history.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxYear = Math.max(currentYear + 2, selectedYear);
  const years = [];
  for (let year = MIN_YEAR; year <= maxYear; year++) {
    years.push(year);
  }

  const handleYearChange = (e) => {
    const year = parseInt(e.target.value, 10);
    onMonthChange(year, selectedMonth);
  };

  const handleMonthChange = (e) => {
    const month = parseInt(e.target.value, 10);
    onMonthChange(selectedYear, month);
  };

  const stepMonth = (delta) => {
    const next = shiftMonth(selectedYear, selectedMonth, delta);
    onMonthChange(next.year, next.month);
  };

  const isFirstMonth = selectedYear <= MIN_YEAR && selectedMonth === 1;
  const isLastMonth = selectedYear >= maxYear && selectedMonth === 12;
  const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;

  return (
    <div className="month-selector">
      <button 
        className="annual-summary-button"
        onClick={onViewAnnualSummary}
        title="View annual summary"
      >
        📊 Annual Summary
      </button>

      <button 
        className="tax-deductible-button"
        onClick={onViewTaxDeductible}
        title="View tax deductible expenses"
      >
        💰 Income Tax
      </button>

      <button 
        className="budgets-button"
        onClick={onOpenBudgets}
        title="Manage budgets and view history"
      >
        💵 Budgets
      </button>

      <button 
        className="analytics-hub-button"
        onClick={onOpenAnalyticsHub}
        title="View spending patterns and predictions"
      >
        📈 Analytics
      </button>

      <button 
        className="financial-overview-button"
        onClick={onOpenFinancialOverview}
        title="Manage loans, investments, and payment methods"
      >
        💼 Financial
      </button>

      <button
        type="button"
        className="month-step-button"
        onClick={() => stepMonth(-1)}
        disabled={isFirstMonth}
        aria-label="Previous month"
        title="Previous month"
      >
        ‹
      </button>

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

      <div className="selector-group">
        <label htmlFor="month-select">Month:</label>
        <select 
          id="month-select"
          value={selectedMonth} 
          onChange={handleMonthChange}
        >
          {MONTHS.map(month => (
            <option key={month.value} value={month.value}>
              {month.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="month-step-button"
        onClick={() => stepMonth(1)}
        disabled={isLastMonth}
        aria-label="Next month"
        title="Next month"
      >
        ›
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          className="month-today-button"
          onClick={() => onMonthChange(currentYear, currentMonth)}
          title="Jump to the current month"
        >
          This month
        </button>
      )}
    </div>
  );
};

export default MonthSelector;
