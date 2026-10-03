import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

const SectionHeader = ({ label, expanded, onToggle, percent, amount, negative }) => (
  <tr className="pl-section-row">
    <th scope="rowgroup">
      <button
        type="button"
        className="pl-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={`pl-chevron ${expanded ? 'expanded' : ''}`} aria-hidden="true">›</span>
        {label}
      </button>
    </th>
    <td className="pl-pct">{percent}</td>
    <td className={`pl-amount ${negative ? 'negative' : ''}`}>{amount}</td>
  </tr>
);

const formatPct = (value) => (value == null ? '—' : `${value.toFixed(1)}%`);

const CashFlowView = ({ data }) => {
  const { totals, incomeByCategory, expensesByCategory } = data;
  const [incomeOpen, setIncomeOpen] = useState(true);
  const [expensesOpen, setExpensesOpen] = useState(true);

  if (totals.income === 0 && totals.expenses === 0) {
    return <div className="period-empty">No income or spending recorded for this period.</div>;
  }

  const hasIncome = totals.income > 0;
  const netPositive = totals.net >= 0;

  return (
    <div className="period-view" data-testid="cash-flow-view">
      <div className="period-stat-cards">
        <div className="period-stat-card">
          <span className="period-stat-label"><span className="period-dot positive" />Income</span>
          <span className="period-stat-value">{formatCurrency(totals.income)}</span>
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label"><span className="period-dot negative" />Spending</span>
          <span className="period-stat-value">{formatCurrency(totals.expenses)}</span>
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label">{netPositive ? 'Saved' : 'Overspent'}</span>
          <span className={`period-stat-value ${netPositive ? 'positive' : 'negative'}`}>
            {formatCurrency(Math.abs(totals.net))}
          </span>
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label">Savings rate</span>
          <span className={`period-stat-value ${totals.savingsRate == null ? '' : netPositive ? 'positive' : 'negative'}`}>
            {formatPct(totals.savingsRate)}
          </span>
          {!hasIncome && <span className="period-stat-sub">No income recorded</span>}
        </div>
      </div>

      <section className="period-card">
        <h3 className="period-card-title">Profit &amp; loss</h3>
        <table className="pl-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="pl-pct">% of income</th>
              <th scope="col" className="pl-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader
              label="Income"
              expanded={incomeOpen}
              onToggle={() => setIncomeOpen(open => !open)}
              percent={hasIncome ? '100.0%' : '—'}
              amount={formatCurrency(totals.income)}
            />
            {incomeOpen && incomeByCategory.map(row => (
              <tr key={`income-${row.category}`} className="pl-item-row">
                <th scope="row">{row.category}</th>
                <td className="pl-pct">{formatPct(row.percentOfIncome)}</td>
                <td className="pl-amount">{formatCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tbody>
            <SectionHeader
              label="Expenses"
              expanded={expensesOpen}
              onToggle={() => setExpensesOpen(open => !open)}
              percent={hasIncome ? formatPct((totals.expenses / totals.income) * 100) : '—'}
              amount={`-${formatCurrency(totals.expenses)}`}
              negative
            />
            {expensesOpen && expensesByCategory.map(row => (
              <tr key={`expense-${row.category}`} className="pl-item-row">
                <th scope="row">{row.category}</th>
                <td className="pl-pct">{hasIncome ? formatPct(row.percentOfIncome) : '—'}</td>
                <td className="pl-amount negative">-{formatCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="pl-net-row">
              <th scope="row">Net {netPositive ? 'savings' : 'shortfall'}</th>
              <td className="pl-pct">{formatPct(totals.savingsRate)}</td>
              <td className={`pl-amount ${netPositive ? 'positive' : 'negative'}`}>
                {netPositive ? '' : '-'}{formatCurrency(Math.abs(totals.net))}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
};

export default CashFlowView;
