import { useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';

const PALETTE = [
  '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#ef4444',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
];

const RADIUS = 60;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DonutChart = ({ slices, total }) => {
  const arcs = slices.reduce((acc, slice) => {
    const length = total > 0 ? (slice.total / total) * CIRCUMFERENCE : 0;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].length : 0;
    acc.push({ ...slice, length, offset });
    return acc;
  }, []);
  const centerLabel = formatCurrency(Math.round(total)).replace(/\.00$/, '');
  return (
    <svg
      className="period-donut"
      viewBox="0 0 160 160"
      role="img"
      aria-label={`Spending breakdown, total ${formatCurrency(total)}`}
    >
      <g transform="rotate(-90 80 80)">
        {arcs.map(arc => (
          <circle
            key={arc.category}
            cx="80"
            cy="80"
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
            strokeDashoffset={-arc.offset}
          >
            <title>{`${arc.category}: ${formatCurrency(arc.total)}`}</title>
          </circle>
        ))}
      </g>
      <text x="80" y="74" textAnchor="middle" className="period-donut-label">Total</text>
      <text
        x="80"
        y="94"
        textAnchor="middle"
        className="period-donut-value"
        style={{ fontSize: centerLabel.length > 9 ? 13 : 17 }}
      >
        {centerLabel}
      </text>
    </svg>
  );
};

const SpendingView = ({ data }) => {
  const { totals, expensesByCategory } = data;

  const slices = useMemo(
    () => expensesByCategory.map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] })),
    [expensesByCategory]
  );

  if (expensesByCategory.length === 0) {
    return <div className="period-empty">No spending recorded for this period.</div>;
  }

  const largest = expensesByCategory[0];
  const maxTotal = largest.total;

  return (
    <div className="period-view" data-testid="spending-view">
      <div className="period-stat-cards">
        <div className="period-stat-card">
          <span className="period-stat-label"><span className="period-dot negative" />Total spending</span>
          <span className="period-stat-value">{formatCurrency(totals.expenses)}</span>
          {totals.fixedExpenses > 0 && (
            <span className="period-stat-sub">incl. {formatCurrency(totals.fixedExpenses)} fixed</span>
          )}
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label">Average per month</span>
          <span className="period-stat-value">{formatCurrency(totals.averageMonthlyExpenses)}</span>
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label">Largest category</span>
          <span className="period-stat-value period-stat-text" title={largest.category}>{largest.category}</span>
          <span className="period-stat-sub">{largest.percentOfExpenses.toFixed(1)}% of spending</span>
        </div>
        <div className="period-stat-card">
          <span className="period-stat-label">Transactions</span>
          <span className="period-stat-value">{totals.transactionCount.toLocaleString('en-US')}</span>
        </div>
      </div>

      <section className="period-card">
        <h3 className="period-card-title">Spending breakdown</h3>
        <div className="period-breakdown">
          <div className="period-breakdown-chart">
            <DonutChart slices={slices} total={totals.expenses} />
          </div>
          <ul className="period-ranked-list" aria-label="Spending by category">
            {slices.map(slice => (
              <li key={slice.category} className="period-ranked-item">
                <div className="period-ranked-row">
                  <span className="period-ranked-name">
                    <span className="period-dot" style={{ backgroundColor: slice.color }} />
                    <span className="period-ranked-label" title={slice.category}>{slice.category}</span>
                    {slice.fixed > 0 && (
                      <span className="period-ranked-meta">
                        {slice.variable > 0 ? `· ${formatCurrency(slice.fixed)} fixed` : '· fixed'}
                      </span>
                    )}
                  </span>
                  <span className="period-ranked-amount">{formatCurrency(slice.total)}</span>
                  <span className="period-ranked-pct">{slice.percentOfExpenses.toFixed(1)}%</span>
                </div>
                <div className="period-ranked-track">
                  <div
                    className="period-ranked-bar"
                    style={{ width: `${(slice.total / maxTotal) * 100}%`, backgroundColor: slice.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};

export default SpendingView;
