export const PERIOD_PRESETS = [
  { id: 'month', label: 'Month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'last12', label: 'Last 12 months' },
  { id: 'year', label: 'Full year' },
];

const toIdx = (year, month) => year * 12 + (month - 1);
const fromIdx = (idx) => ({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });

// Mirrors the backend's accepted year range for /period-summary
export const MIN_PERIOD = { year: 2000, month: 1 };
export const MAX_PERIOD = { year: 2100, month: 12 };

const clamp = (ym) => {
  const idx = Math.min(Math.max(toIdx(ym.year, ym.month), toIdx(MIN_PERIOD.year, MIN_PERIOD.month)), toIdx(MAX_PERIOD.year, MAX_PERIOD.month));
  return fromIdx(idx);
};

export const shiftMonth = (year, month, delta) => fromIdx(toIdx(year, month) + delta);

export const isSameMonth = (a, b) => a.year === b.year && a.month === b.month;

/**
 * Resolve a preset anchored at a year/month into an inclusive month range.
 * @returns {{ start: {year:number, month:number}, end: {year:number, month:number} }}
 */
export const computePeriodRange = (preset, year, month) => {
  let range;
  switch (preset) {
    case 'ytd':
      range = { start: { year, month: 1 }, end: { year, month } };
      break;
    case 'last12':
      range = { start: shiftMonth(year, month, -11), end: { year, month } };
      break;
    case 'year':
      range = { start: { year, month: 1 }, end: { year, month: 12 } };
      break;
    case 'month':
    default:
      range = { start: { year, month }, end: { year, month } };
  }
  return { start: clamp(range.start), end: clamp(range.end) };
};

/** Number of months the prev/next arrows move the anchor for a preset. */
export const presetStep = (preset) => (preset === 'month' ? 1 : 12);

export const toYearMonthString = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

const shortLabel = ({ year, month }) =>
  new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export const formatPeriodLabel = ({ start, end }) =>
  start.year === end.year && start.month === end.month
    ? shortLabel(start)
    : `${shortLabel(start)} – ${shortLabel(end)}`;
