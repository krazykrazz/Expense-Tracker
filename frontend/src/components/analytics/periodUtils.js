export const PERIOD_PRESETS = [
  { id: 'month', label: 'Month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'last12', label: 'Last 12 months' },
  { id: 'year', label: 'Full year' },
];

const toIdx = (year, month) => year * 12 + (month - 1);
const fromIdx = (idx) => ({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });

export const shiftMonth = (year, month, delta) => fromIdx(toIdx(year, month) + delta);

/**
 * Resolve a preset anchored at a year/month into an inclusive month range.
 * @returns {{ start: {year:number, month:number}, end: {year:number, month:number} }}
 */
export const computePeriodRange = (preset, year, month) => {
  switch (preset) {
    case 'ytd':
      return { start: { year, month: 1 }, end: { year, month } };
    case 'last12':
      return { start: shiftMonth(year, month, -11), end: { year, month } };
    case 'year':
      return { start: { year, month: 1 }, end: { year, month: 12 } };
    case 'month':
    default:
      return { start: { year, month }, end: { year, month } };
  }
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
