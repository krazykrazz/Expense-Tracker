import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../utils/formatters', () => ({
  formatCAD: (val) => `${parseFloat(val || 0).toFixed(2)}`,
}));

import AnomalyAlertItem from './AnomalyAlertItem';

describe('AnomalyAlertItem', () => {
  const baseAnomaly = {
    id: 1,
    expenseId: 42,
    place: 'Expensive Store',
    amount: 999.99,
    anomalyType: 'amount',
    reason: 'Amount is 3x higher than usual for this merchant',
    date: '2026-03-10',
    category: 'Shopping',
  };

  let onDismiss;
  let onMarkExpected;

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render anomaly details', () => {
    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    expect(screen.getByText('Expensive Store')).toBeInTheDocument();
    expect(screen.getByText('Unusual Amount')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-amount')).toHaveTextContent('999.99');
    expect(screen.getByTestId('anomaly-reason')).toHaveTextContent(
      'Amount is 3x higher than usual for this merchant'
    );
  });

  it('should render date and category in meta row', () => {
    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    const meta = screen.getByTestId('anomaly-meta');
    expect(meta).toHaveTextContent('Mar 10, 2026');
    expect(meta).toHaveTextContent('Shopping');
  });

  it('should render type labels for different anomaly types', () => {
    const { rerender } = render(
      <AnomalyAlertItem anomaly={{ ...baseAnomaly, anomalyType: 'new_merchant' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    expect(screen.getByText('New Merchant')).toBeInTheDocument();

    rerender(
      <AnomalyAlertItem anomaly={{ ...baseAnomaly, anomalyType: 'daily_total' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    expect(screen.getByText('High Daily Total')).toBeInTheDocument();
  });

  it('should be clickable and dispatch scrollToExpense event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    const card = screen.getByTestId('anomaly-alert-item');
    // CSS Module scoped class — check for the clickable module class
    expect(card.className).toMatch(/clickable/);
    fireEvent.click(card);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scrollToExpense',
        detail: { expenseId: 42 }
      })
    );
  });

  it('should call onDismiss when dismiss button is clicked', async () => {
    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-dismiss-btn'));
    });

    expect(onDismiss).toHaveBeenCalledWith(baseAnomaly);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should call onMarkExpected when mark-as-expected button is clicked', async () => {
    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-mark-expected-btn'));
    });

    expect(onMarkExpected).toHaveBeenCalledWith(baseAnomaly);
    expect(onMarkExpected).toHaveBeenCalledTimes(1);
  });

  it('should show loading state and disable buttons during dismiss action', async () => {
    let resolvePromise;
    onDismiss.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    // Both buttons should be enabled initially
    expect(screen.getByTestId('anomaly-dismiss-btn')).not.toBeDisabled();
    expect(screen.getByTestId('anomaly-mark-expected-btn')).not.toBeDisabled();

    // Click dismiss
    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-dismiss-btn'));
    });

    // Both buttons should be disabled during loading
    expect(screen.getByTestId('anomaly-dismiss-btn')).toBeDisabled();
    expect(screen.getByTestId('anomaly-mark-expected-btn')).toBeDisabled();
    // Button text changes to '...'
    expect(screen.getByTestId('anomaly-dismiss-btn')).toHaveTextContent('...');

    // Resolve the promise
    await act(async () => {
      resolvePromise();
    });

    // Buttons should be re-enabled
    expect(screen.getByTestId('anomaly-dismiss-btn')).not.toBeDisabled();
    expect(screen.getByTestId('anomaly-mark-expected-btn')).not.toBeDisabled();
  });

  it('should show loading state during mark-as-expected action', async () => {
    let resolvePromise;
    onMarkExpected.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

    render(
      <AnomalyAlertItem anomaly={baseAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-mark-expected-btn'));
    });

    expect(screen.getByTestId('anomaly-mark-expected-btn')).toBeDisabled();
    expect(screen.getByTestId('anomaly-mark-expected-btn')).toHaveTextContent('...');

    await act(async () => {
      resolvePromise();
    });

    expect(screen.getByTestId('anomaly-mark-expected-btn')).not.toBeDisabled();
  });

  it('should render nothing when anomaly is null', () => {
    const { container } = render(
      <AnomalyAlertItem anomaly={null} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('should not render reason when not provided', () => {
    render(
      <AnomalyAlertItem
        anomaly={{ ...baseAnomaly, reason: undefined }}
        onDismiss={onDismiss}
        onMarkExpected={onMarkExpected}
      />
    );
    expect(screen.queryByTestId('anomaly-reason')).not.toBeInTheDocument();
  });
});

/* ============================================================
   SIMPLIFIED CARD LAYOUT TESTS (enriched anomalies)
   ============================================================ */

describe('AnomalyAlertItem — Simplified card layout', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    id: 10,
    expenseId: 42,
    place: 'Expensive Store',
    amount: 999.99,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    summary: 'Unusual purchase size',
    explanationText: 'Your typical Expensive Store transactions are $5–$59',
    typicalRange: 'Typical purchase: $5–$59',
    simplifiedClassification: 'one_time_event',
    explanation: {
      typeLabel: 'Large Transaction',
      observedValue: 999.99,
      expectedRange: { min: 50, max: 200 },
      deviationPercent: 399.9,
      comparisonPeriod: 'last 12 months',
      sampleSize: 25,
    },
    historicalContext: {
      purchaseRank: 3,
      purchaseRankTotal: 150,
      percentile: 98,
      deviationFromAverage: 285.5,
      frequency: 'approximately once every 9 months',
    },
    impactEstimate: {
      annualizedChange: 9600,
      savingsRateChange: -2.5,
      budgetImpact: {
        budgetLimit: 500,
        currentSpent: 450,
        projectedMonthEnd: 720,
        projectedOverage: 220,
      },
    },
    behaviorPattern: 'One_Time_Event',
    confidence: 'high',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render header with vendor name and amount', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByText('Expensive Store')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-amount')).toHaveTextContent('999.99');
  });

  it('should render summary text', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-summary')).toHaveTextContent('Unusual purchase size');
  });

  it('should render explanation text', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-explanation-text')).toHaveTextContent('Your typical Expensive Store transactions are $5–$59');
  });

  it('should render typical range when present', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-typical-range')).toHaveTextContent('Typical purchase: $5–$59');
  });

  it('should omit typical range when null', () => {
    const anomaly = { ...enrichedAnomaly, typicalRange: null };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-typical-range')).not.toBeInTheDocument();
  });

  it('should render classification badge', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-classification-badge')).toHaveTextContent('One-time event');
  });

  it('should render confidence badge', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence-badge')).toHaveTextContent('High confidence');
  });

  it('should apply severity CSS class for high severity', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const root = screen.getByTestId('anomaly-alert-item');
    expect(root.className).toMatch(/severityHigh/);
  });

  it('should apply severity CSS class for medium severity', () => {
    const anomaly = { ...enrichedAnomaly, severity: 'medium' };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const root = screen.getByTestId('anomaly-alert-item');
    expect(root.className).toMatch(/severityMedium/);
  });

  it('should apply severity CSS class for low severity', () => {
    const anomaly = { ...enrichedAnomaly, severity: 'low' };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const root = screen.getByTestId('anomaly-alert-item');
    expect(root.className).toMatch(/severityLow/);
  });

  it('should NOT render old multi-section layout (explanation, historical, impact sections) by default', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    // Old enriched sections should not be in the default view
    expect(screen.queryByTestId('anomaly-explanation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-historical')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-impact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-footer')).not.toBeInTheDocument();
  });

  it('should render "✓ Got it" button that calls onDismiss', async () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const btn = screen.getByTestId('anomaly-got-it-btn');
    expect(btn).toHaveTextContent('✓ Got it');

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onDismiss).toHaveBeenCalledWith(enrichedAnomaly);
  });

  it('should render "Mute alerts like this" link that calls onMarkExpected', async () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const link = screen.getByTestId('anomaly-mute-link');
    expect(link).toHaveTextContent('Mute alerts like this');

    await act(async () => {
      fireEvent.click(link);
    });
    expect(onMarkExpected).toHaveBeenCalledWith(enrichedAnomaly);
  });

  it('should disable buttons during loading state', async () => {
    let resolvePromise;
    onDismiss.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);

    expect(screen.getByTestId('anomaly-got-it-btn')).not.toBeDisabled();
    expect(screen.getByTestId('anomaly-mute-link')).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-got-it-btn'));
    });

    expect(screen.getByTestId('anomaly-got-it-btn')).toBeDisabled();
    expect(screen.getByTestId('anomaly-mute-link')).toBeDisabled();

    await act(async () => {
      resolvePromise();
    });

    expect(screen.getByTestId('anomaly-got-it-btn')).not.toBeDisabled();
  });

  it('should NOT render old Dismiss and Mark as Expected buttons', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-dismiss-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-mark-expected-btn')).not.toBeInTheDocument();
  });
});

/* ============================================================
   DETAILS PANEL TESTS
   ============================================================ */

describe('AnomalyAlertItem — Details panel', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    id: 20,
    expenseId: 42,
    place: 'Expensive Store',
    amount: 999.99,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    summary: 'Unusual purchase size',
    explanationText: 'Your typical purchases are $5–$59',
    explanation: {
      typeLabel: 'Large Transaction',
      observedValue: 999.99,
      expectedRange: { min: 50, max: 200 },
      deviationPercent: 399.9,
      comparisonPeriod: 'last 12 months',
      sampleSize: 25,
    },
    historicalContext: {
      purchaseRank: 3,
      purchaseRankTotal: 150,
      percentile: 98,
      deviationFromAverage: 285.5,
    },
    impactEstimate: {
      annualizedChange: 9600,
      savingsRateChange: -2.5,
    },
    behaviorPattern: 'One_Time_Event',
    confidence: 'high',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have details toggle collapsed by default', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByTestId('anomaly-details-toggle');
    expect(toggle).toHaveTextContent('▾ Details');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('anomaly-details-panel')).not.toBeInTheDocument();
  });

  it('should expand details panel on toggle click', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    expect(screen.getByTestId('anomaly-details-toggle')).toHaveTextContent('▴ Details');
    expect(screen.getByTestId('anomaly-details-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('anomaly-details-panel')).toBeInTheDocument();
  });

  it('should show enriched data in details panel when expanded', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    const panel = screen.getByTestId('anomaly-details-panel');
    expect(panel).toHaveTextContent('999.99');
    expect(panel).toHaveTextContent('50.00');
    expect(panel).toHaveTextContent('200.00');
    expect(panel).toHaveTextContent('+399.9%');
    expect(panel).toHaveTextContent('last 12 months');
    expect(panel).toHaveTextContent('Sample size: 25');
    expect(panel).toHaveTextContent('3rd largest');
    expect(panel).toHaveTextContent('98th percentile');
    expect(panel).toHaveTextContent('+285.5%');
    expect(panel).toHaveTextContent('9600.00');
    expect(panel).toHaveTextContent('-2.5%');
  });

  it('should collapse details panel on second toggle click', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));
    expect(screen.getByTestId('anomaly-details-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));
    expect(screen.queryByTestId('anomaly-details-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('anomaly-details-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('should show "No additional details available" when enriched fields are absent', () => {
    const anomaly = {
      ...enrichedAnomaly,
      explanation: null,
      historicalContext: null,
      impactEstimate: null,
    };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    expect(screen.getByTestId('anomaly-detail-empty')).toHaveTextContent('No additional details available');
  });
});

/* ============================================================
   ACCESSIBILITY TESTS (Req 15.1–15.5)
   ============================================================ */

describe('AnomalyAlertItem — Accessibility', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    id: 30,
    expenseId: 42,
    place: 'Walmart',
    amount: 247.83,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    summary: 'Unusual purchase size',
    explanationText: 'Your typical Walmart purchases are $5–$59',
    typicalRange: 'Typical purchase: $5–$59',
    simplifiedClassification: 'one_time_event',
    explanation: { observedValue: 247.83, expectedRange: { min: 5, max: 59 }, deviationPercent: 320, comparisonPeriod: 'last 12 months', sampleSize: 15 },
    behaviorPattern: 'One_Time_Event',
    confidence: 'high',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have ARIA label on "Got it" button with vendor context (Req 15.1)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const btn = screen.getByTestId('anomaly-got-it-btn');
    expect(btn).toHaveAttribute('aria-label', 'Acknowledge alert for Walmart');
  });

  it('should have ARIA label on "Mute" link with vendor context (Req 15.2)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const link = screen.getByTestId('anomaly-mute-link');
    expect(link).toHaveAttribute('aria-label', 'Mute alerts like this for Walmart');
  });

  it('should fall back to category in ARIA labels when vendor is absent', () => {
    const anomaly = { ...enrichedAnomaly, place: null };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-got-it-btn')).toHaveAttribute('aria-label', 'Acknowledge alert for Shopping');
    expect(screen.getByTestId('anomaly-mute-link')).toHaveAttribute('aria-label', 'Mute alerts like this for Shopping');
  });

  it('should have aria-expanded on details toggle reflecting state (Req 15.3)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByTestId('anomaly-details-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('should have aria-controls on details toggle (Req 15.3)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByTestId('anomaly-details-toggle');
    expect(toggle).toHaveAttribute('aria-controls', `anomaly-details-panel-${enrichedAnomaly.id}`);
  });

  it('should have all interactive elements as focusable buttons for keyboard nav (Req 15.4)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const gotIt = screen.getByTestId('anomaly-got-it-btn');
    const mute = screen.getByTestId('anomaly-mute-link');
    const details = screen.getByTestId('anomaly-details-toggle');

    // All should be <button> elements (natively keyboard-focusable via Tab)
    expect(gotIt.tagName).toBe('BUTTON');
    expect(mute.tagName).toBe('BUTTON');
    expect(details.tagName).toBe('BUTTON');
  });

  it('should show severity as text in details panel when expanded (Req 15.5)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    const severityText = screen.getByTestId('anomaly-severity-text');
    expect(severityText).toHaveTextContent('Severity: High');
  });

  it('should show severity text for all severity levels (Req 15.5)', () => {
    const { rerender } = render(
      <AnomalyAlertItem anomaly={{ ...enrichedAnomaly, severity: 'low' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));
    expect(screen.getByTestId('anomaly-severity-text')).toHaveTextContent('Severity: Low');

    // Collapse before rerender to reset state
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    rerender(
      <AnomalyAlertItem anomaly={{ ...enrichedAnomaly, severity: 'medium' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));
    expect(screen.getByTestId('anomaly-severity-text')).toHaveTextContent('Severity: Medium');
  });

  it('should have severity in ARIA label on card root (Req 15.5)', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const card = screen.getByTestId('anomaly-alert-item');
    expect(card).toHaveAttribute('aria-label', 'Alert for Walmart. High severity');
  });

  it('should have role=region and aria-label on details panel', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    fireEvent.click(screen.getByTestId('anomaly-details-toggle'));

    const panel = screen.getByTestId('anomaly-details-panel');
    expect(panel).toHaveAttribute('role', 'region');
    expect(panel).toHaveAttribute('aria-label', 'Alert details');
  });
});

/* ============================================================
   FALLBACK RENDERING TESTS
   ============================================================ */

describe('AnomalyAlertItem — Fallback rendering', () => {
  let onDismiss;
  let onMarkExpected;

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fall back to classification label when summary is absent', () => {
    const anomaly = {
      id: 70,
      expenseId: 1,
      place: 'Store',
      amount: 100,
      anomalyType: 'amount',
      classification: 'Large_Transaction',
      date: '2026-03-10',
      category: 'Shopping',
      severity: 'medium',
      confidence: 'medium',
      explanation: { observedValue: 100, expectedRange: { min: 10, max: 50 }, deviationPercent: 100, comparisonPeriod: 'last 12 months' },
    };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-summary')).toHaveTextContent('Large Transaction');
  });

  it('should fall back to reason as explanation when explanationText is absent', () => {
    const anomaly = {
      id: 71,
      expenseId: 1,
      place: 'Store',
      amount: 100,
      anomalyType: 'amount',
      classification: 'Large_Transaction',
      reason: 'Amount is unusually high',
      date: '2026-03-10',
      category: 'Shopping',
      severity: 'medium',
      confidence: 'medium',
      explanation: { observedValue: 100, expectedRange: { min: 10, max: 50 }, deviationPercent: 100, comparisonPeriod: 'last 12 months' },
    };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-explanation-text')).toHaveTextContent('Amount is unusually high');
  });

  it('should use "Unusual activity detected" when no summary or classification available', () => {
    const anomaly = {
      id: 72,
      expenseId: 1,
      place: 'Store',
      amount: 100,
      classification: 'Unknown_Type',
      date: '2026-03-10',
      category: 'Shopping',
      severity: 'low',
      confidence: 'low',
    };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-summary')).toHaveTextContent('Unusual activity detected');
  });
});

/* ============================================================
   CSS MODULE CLASS SCOPING
   ============================================================ */

describe('AnomalyAlertItem — CSS Module class scoping', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    id: 40,
    expenseId: 42,
    place: 'Store',
    amount: 100,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'medium',
    summary: 'Unusual purchase size',
    explanation: { typeLabel: 'Large Transaction', observedValue: 100, expectedRange: { min: 10, max: 50 }, deviationPercent: 100, comparisonPeriod: 'last 12 months' },
    behaviorPattern: 'One_Time_Event',
    confidence: 'high',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should apply CSS Module scoped class on root element', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const root = screen.getByTestId('anomaly-alert-item');
    expect(root.className).toMatch(/alertItem/);
    expect(root.className).toMatch(/clickable/);
  });
});

/* ============================================================
   BACKWARD COMPATIBILITY
   ============================================================ */

describe('AnomalyAlertItem — Backward compatibility', () => {
  let onDismiss;
  let onMarkExpected;

  const legacyAnomaly = {
    id: 100,
    expenseId: 10,
    place: 'Old Store',
    amount: 200,
    anomalyType: 'amount',
    reason: 'Amount is unusually high',
    date: '2026-01-15',
    category: 'Groceries',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render legacy layout with type badge and reason when no classification', () => {
    render(<AnomalyAlertItem anomaly={legacyAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByText('Unusual Amount')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-reason')).toHaveTextContent('Amount is unusually high');
  });

  it('should NOT render simplified card elements for legacy anomaly', () => {
    render(<AnomalyAlertItem anomaly={legacyAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-explanation-text')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-details-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-got-it-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-mute-link')).not.toBeInTheDocument();
  });

  it('should render enriched anomaly with reason as explanation fallback when no explanationText', () => {
    const enrichedWithReason = {
      id: 101,
      expenseId: 42,
      place: 'Store',
      amount: 500,
      anomalyType: 'amount',
      classification: 'Large_Transaction',
      reason: 'This is the fallback reason',
      date: '2026-03-10',
      category: 'Shopping',
      severity: 'high',
      explanation: { typeLabel: 'Large Transaction', observedValue: 500, expectedRange: { min: 50, max: 200 }, deviationPercent: 150, comparisonPeriod: 'last 12 months' },
      behaviorPattern: 'One_Time_Event',
      confidence: 'high',
    };
    render(<AnomalyAlertItem anomaly={enrichedWithReason} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    // Should use reason as explanation fallback since no explanationText
    expect(screen.getByTestId('anomaly-explanation-text')).toHaveTextContent('This is the fallback reason');
    // Should NOT render old-style reason element
    expect(screen.queryByTestId('anomaly-reason')).not.toBeInTheDocument();
  });
});

/* ============================================================
   DARK MODE TESTS (Req 5.5, 11.5)
   ============================================================ */

describe('AnomalyAlertItem — Dark mode', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    id: 50,
    expenseId: 42,
    place: 'Walmart',
    amount: 247.83,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    summary: 'Unusual purchase size',
    explanationText: 'Your typical Walmart purchases are $5–$59',
    typicalRange: 'Typical purchase: $5–$59',
    simplifiedClassification: 'one_time_event',
    confidence: 'high',
    explanation: { observedValue: 247.83, expectedRange: { min: 5, max: 59 }, deviationPercent: 320, comparisonPeriod: 'last 12 months', sampleSize: 15 },
    behaviorPattern: 'One_Time_Event',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should apply severityHigh class when wrapped in theme-dark parent', () => {
    const { container } = render(
      <div className="theme-dark">
        <AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
      </div>
    );
    const card = container.querySelector('[data-testid="anomaly-alert-item"]');
    expect(card.className).toMatch(/severityHigh/);
    expect(card.className).toMatch(/alertItem/);
  });

  it('should apply severityMedium class in dark mode wrapper', () => {
    const anomaly = { ...enrichedAnomaly, severity: 'medium' };
    const { container } = render(
      <div className="theme-dark">
        <AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
      </div>
    );
    const card = container.querySelector('[data-testid="anomaly-alert-item"]');
    expect(card.className).toMatch(/severityMedium/);
  });

  it('should apply severityLow class in dark mode wrapper', () => {
    const anomaly = { ...enrichedAnomaly, severity: 'low' };
    const { container } = render(
      <div className="theme-dark">
        <AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
      </div>
    );
    const card = container.querySelector('[data-testid="anomaly-alert-item"]');
    expect(card.className).toMatch(/severityLow/);
  });

  it('should render all card elements correctly in dark mode', () => {
    render(
      <div className="theme-dark">
        <AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
      </div>
    );
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-summary')).toHaveTextContent('Unusual purchase size');
    expect(screen.getByTestId('anomaly-explanation-text')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-got-it-btn')).toHaveTextContent('✓ Got it');
    expect(screen.getByTestId('anomaly-mute-link')).toHaveTextContent('Mute alerts like this');
    expect(screen.getByTestId('anomaly-classification-badge')).toHaveTextContent('One-time event');
    expect(screen.getByTestId('anomaly-confidence-badge')).toHaveTextContent('High confidence');
  });
});

/* ============================================================
   REDUCED MOTION TESTS (Req 15.6)
   ============================================================ */

describe('AnomalyAlertItem — Reduced motion', () => {
  let onDismiss;
  let onMarkExpected;
  let originalMatchMedia;

  const enrichedAnomaly = {
    id: 60,
    expenseId: 42,
    place: 'Walmart',
    amount: 247.83,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    summary: 'Unusual purchase size',
    explanationText: 'Your typical Walmart purchases are $5–$59',
    typicalRange: 'Typical purchase: $5–$59',
    simplifiedClassification: 'one_time_event',
    confidence: 'high',
    explanation: { observedValue: 247.83, expectedRange: { min: 5, max: 59 }, deviationPercent: 320, comparisonPeriod: 'last 12 months', sampleSize: 15 },
    behaviorPattern: 'One_Time_Event',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);

    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('should render card correctly when reduced motion is preferred', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-alert-item')).toBeInTheDocument();
    expect(screen.getByText('Walmart')).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-summary')).toHaveTextContent('Unusual purchase size');
    expect(screen.getByTestId('anomaly-got-it-btn')).toHaveTextContent('✓ Got it');
  });

  it('should still toggle details panel when reduced motion is preferred', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByTestId('anomaly-details-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('anomaly-details-panel')).toBeInTheDocument();
  });

  it('should still call onDismiss when reduced motion is preferred', async () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-got-it-btn'));
    });
    expect(onDismiss).toHaveBeenCalledWith(enrichedAnomaly);
  });
});
