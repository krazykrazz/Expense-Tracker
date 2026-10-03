import { useEffect, useMemo, useState } from 'react';
import { getPeriodSummary } from '../../services/analyticsApi';
import { createLogger } from '../../utils/logger';
import {
  PERIOD_PRESETS,
  computePeriodRange,
  formatPeriodLabel,
  presetStep,
  shiftMonth,
  toYearMonthString,
} from './periodUtils';
import SpendingView from './SpendingView';
import CashFlowView from './CashFlowView';
import './PeriodViews.css';

const logger = createLogger('PeriodAnalyticsPanel');

const PeriodSelector = ({ period, range, onChange }) => {
  const step = presetStep(period.preset);
  const shift = (direction) => {
    const next = shiftMonth(period.year, period.month, direction * step);
    onChange({ ...period, ...next });
  };

  return (
    <div className="period-selector">
      <div className="period-nav">
        <button type="button" className="period-nav-btn" onClick={() => shift(-1)} aria-label="Previous period">‹</button>
        <span className="period-range-label" data-testid="period-range-label">{formatPeriodLabel(range)}</span>
        <button type="button" className="period-nav-btn" onClick={() => shift(1)} aria-label="Next period">›</button>
      </div>
      <div className="period-presets" role="group" aria-label="Period">
        {PERIOD_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`period-preset ${period.preset === p.id ? 'active' : ''}`}
            aria-pressed={period.preset === p.id}
            onClick={() => onChange({ ...period, preset: p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Period-based analytics (Spending / Cash flow) with a shared range selector.
 * @param {'spending'|'cash-flow'} view
 * @param {{preset:string, year:number, month:number}} period - preset anchored at year/month
 */
const PeriodAnalyticsPanel = ({ view, period, onPeriodChange }) => {
  const range = useMemo(
    () => computePeriodRange(period.preset, period.year, period.month),
    [period.preset, period.year, period.month]
  );
  const start = toYearMonthString(range.start);
  const end = toYearMonthString(range.end);

  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${start}|${end}|${reloadKey}`;
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    getPeriodSummary(start, end, { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data, error: null });
      })
      .catch(err => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        logger.error('Error fetching period summary:', err);
        setResult({ key: requestKey, data: null, error: 'Unable to load data for this period.' });
      });

    return () => controller.abort();
  }, [start, end, requestKey]);

  const loading = result.key !== requestKey;
  const { data, error } = result;

  let content;
  if (loading) {
    content = (
      <div className="period-loading">
        <div className="period-spinner" />
        <p>Loading…</p>
      </div>
    );
  } else if (error) {
    content = (
      <div className="period-error" role="alert">
        <p>{error}</p>
        <button type="button" className="period-retry-btn" onClick={() => setReloadKey(k => k + 1)}>
          Retry
        </button>
      </div>
    );
  } else if (data) {
    content = view === 'cash-flow' ? <CashFlowView data={data} /> : <SpendingView data={data} />;
  }

  return (
    <div className="period-analytics">
      <PeriodSelector period={period} range={range} onChange={onPeriodChange} />
      {content}
    </div>
  );
};

export default PeriodAnalyticsPanel;
