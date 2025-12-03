import React from 'react';
import CollapsibleSection from './CollapsibleSection';
import TrendIndicator from './TrendIndicator';
import { formatAmount } from '../utils/formatters';
import './BreakdownTab.css';

/**
 * BreakdownTab Component
 * Displays expense breakdowns organized in collapsible sections
 * Shows Weekly Breakdown and Payment Methods with trend indicators
 * 
 * @param {Object} weeklyTotals - Object with week1-week5 properties
 * @param {Object} methodTotals - Object with payment method keys and values
 * @param {Object} previousWeeklyTotals - Previous month's weekly totals for trends
 * @param {Object} previousMethodTotals - Previous month's method totals for trends
 */
const BreakdownTab = ({
  weeklyTotals = {},
  methodTotals = {},
  previousWeeklyTotals = {},
  previousMethodTotals = {}
}) => {
  // Calculate total for weekly breakdown
  const weeklyTotal = Object.values(weeklyTotals).reduce((sum, val) => sum + (val || 0), 0);
  
  // Calculate total for payment methods
  const methodTotal = Object.values(methodTotals).reduce((sum, val) => sum + (val || 0), 0);

  // Format weekly data for display
  const weeklyItems = [
    { label: 'Week 1', current: weeklyTotals.week1 || 0, previous: previousWeeklyTotals.week1 || 0 },
    { label: 'Week 2', current: weeklyTotals.week2 || 0, previous: previousWeeklyTotals.week2 || 0 },
    { label: 'Week 3', current: weeklyTotals.week3 || 0, previous: previousWeeklyTotals.week3 || 0 },
    { label: 'Week 4', current: weeklyTotals.week4 || 0, previous: previousWeeklyTotals.week4 || 0 },
    { label: 'Week 5', current: weeklyTotals.week5 || 0, previous: previousWeeklyTotals.week5 || 0 }
  ];

  // Format payment method data for display
  const methodItems = Object.entries(methodTotals).map(([method, current]) => ({
    label: method,
    current: current || 0,
    previous: previousMethodTotals[method] || 0
  }));

  return (
    <div className="breakdown-tab">
      <CollapsibleSection
        title="Weekly Breakdown"
        summaryValue={`$${formatAmount(weeklyTotal)}`}
        icon="📅"
        defaultExpanded={true}
      >
        <div className="breakdown-items">
          {weeklyItems.map((item) => (
            <div key={item.label} className="breakdown-item">
              <span className="breakdown-label">{item.label}</span>
              <span className="breakdown-value">
                ${formatAmount(item.current)}
                <TrendIndicator
                  currentValue={item.current}
                  previousValue={item.previous}
                />
              </span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Payment Methods"
        summaryValue={`$${formatAmount(methodTotal)}`}
        icon="💳"
        defaultExpanded={false}
      >
        <div className="breakdown-items">
          {methodItems.map((item) => (
            <div key={item.label} className="breakdown-item">
              <span className="breakdown-label">{item.label}</span>
              <span className="breakdown-value">
                ${formatAmount(item.current)}
                <TrendIndicator
                  currentValue={item.current}
                  previousValue={item.previous}
                />
              </span>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default BreakdownTab;
