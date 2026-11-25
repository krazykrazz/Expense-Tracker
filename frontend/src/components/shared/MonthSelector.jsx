import { useEffect, useRef, useState } from 'react';
import './MonthSelector.css';
import Icon from './Icon';
import { getMonthNameLong, getMonthNameShort } from '../../utils/formatters';
import { shiftMonth } from '../../utils/yearMonth';

const MIN_YEAR = 2000;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const VIEWS = [
  { key: 'annual', className: 'annual-summary-button', icon: 'barChart', label: 'Annual Summary', title: 'View annual summary', handler: 'onViewAnnualSummary' },
  { key: 'tax', className: 'tax-deductible-button', icon: 'receipt', label: 'Income Tax', title: 'View tax deductible expenses', handler: 'onViewTaxDeductible' },
  { key: 'budgets', className: 'budgets-button', icon: 'wallet', label: 'Budgets', title: 'Manage budgets and view history', handler: 'onOpenBudgets' },
  { key: 'analytics', className: 'analytics-hub-button', icon: 'trendingUp', label: 'Analytics', title: 'View spending patterns and predictions', handler: 'onOpenAnalyticsHub' },
  { key: 'financial', className: 'financial-overview-button', icon: 'briefcase', label: 'Financial', title: 'Manage loans, investments, and payment methods', handler: 'onOpenFinancialOverview' }
];

/**
 * The page's month ("November 2026", with ‹ › to step and a picker on the title) and the buttons that open the
 * main views (Annual Summary, Income Tax, Budgets, Analytics, Financial).
 */
const MonthSelector = (props) => {
  const { selectedYear, selectedMonth, onMonthChange } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const titleRef = useRef(null);

  // Generate a broad year range that supports imported legacy history.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const maxYear = Math.max(currentYear + 2, selectedYear);
  const years = [];
  for (let year = MIN_YEAR; year <= maxYear; year++) {
    years.push(year);
  }

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onPointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target) && !titleRef.current?.contains(event.target)) setPickerOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPickerOpen(false);
        titleRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  const stepMonth = (delta) => {
    const next = shiftMonth(selectedYear, selectedMonth, delta);
    onMonthChange(next.year, next.month);
  };

  const pickMonth = (month) => {
    onMonthChange(selectedYear, month);
    setPickerOpen(false);
    titleRef.current?.focus();
  };

  const isFirstMonth = selectedYear <= MIN_YEAR && selectedMonth === 1;
  const isLastMonth = selectedYear >= maxYear && selectedMonth === 12;
  const isCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
  const title = `${getMonthNameLong(selectedMonth)} ${selectedYear}`;

  return (
    <div className="month-selector">
      <div className="month-nav">
        <button
          type="button"
          className="month-step-button"
          onClick={() => stepMonth(-1)}
          disabled={isFirstMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <Icon name="chevronLeft" size={18} />
        </button>

        <div className="month-title-wrap">
          <button
            type="button"
            ref={titleRef}
            className="month-title"
            onClick={() => setPickerOpen(open => !open)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            title="Choose a month"
          >
            <span className="month-title-text">{title}</span>
            <Icon name="chevronDown" size={16} className="month-title-caret" />
          </button>

          {pickerOpen && (
            <div className="month-picker" role="dialog" aria-label="Choose a month" ref={pickerRef}>
              <div className="month-picker-year">
                <label htmlFor="year-select">Year:</label>
                <select
                  id="year-select"
                  value={selectedYear}
                  onChange={(e) => onMonthChange(parseInt(e.target.value, 10), selectedMonth)}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="month-picker-grid" role="group" aria-label="Month">
                {MONTHS.map(month => (
                  <button
                    key={month}
                    type="button"
                    className={`month-picker-month${month === selectedMonth ? ' selected' : ''}${selectedYear === currentYear && month === currentMonth ? ' current' : ''}`}
                    aria-pressed={month === selectedMonth}
                    aria-label={getMonthNameLong(month)}
                    onClick={() => pickMonth(month)}
                  >
                    {getMonthNameShort(month)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="month-step-button"
          onClick={() => stepMonth(1)}
          disabled={isLastMonth}
          aria-label="Next month"
          title="Next month"
        >
          <Icon name="chevronRight" size={18} />
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

      <nav className="toolbar-nav" aria-label="Views">
        {VIEWS.map(view => (
          <button key={view.key} type="button" className={view.className} onClick={props[view.handler]} title={view.title}>
            <Icon name={view.icon} size={16} />
            {view.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default MonthSelector;
