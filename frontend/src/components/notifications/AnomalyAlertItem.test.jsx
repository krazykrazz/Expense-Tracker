import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../utils/formatters', () => ({
  formatCAD: (val) => `$${parseFloat(val || 0).toFixed(2)}`,
}));

import AnomalyAlertItem from './AnomalyAlertItem';

describe('AnomalyAlertItem', () => {
  const baseAnomaly = {
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
    expect(screen.getByTestId('anomaly-amount')).toHaveTextContent('$999.99');
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
   ENRICHED ANOMALY ALERT TESTS
   ============================================================ */

describe('AnomalyAlertItem — Enriched anomaly rendering', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    expenseId: 42,
    place: 'Expensive Store',
    amount: 999.99,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    explanation: {
      typeLabel: 'Large Transaction',
      observedValue: 999.99,
      expectedRange: { min: 50, max: 200 },
      deviationPercent: 399.9,
      comparisonPeriod: 'last 12 months',
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

  it('should render explanation section with observed vs expected values', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const section = screen.getByTestId('anomaly-explanation');
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent('999.99');
    expect(section).toHaveTextContent('50.00');
    expect(section).toHaveTextContent('200.00');
    expect(section).toHaveTextContent('+399.9%');
    expect(section).toHaveTextContent('last 12 months');
  });

  it('should render historical context section', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const section = screen.getByTestId('anomaly-historical');
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent('3rd largest');
    expect(section).toHaveTextContent('150');
    expect(section).toHaveTextContent('98th percentile');
    expect(section).toHaveTextContent('+285.5%');
    expect(section).toHaveTextContent('approximately once every 9 months');
  });

  it('should render impact estimate section', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const section = screen.getByTestId('anomaly-impact');
    expect(section).toBeInTheDocument();
    expect(section).toHaveTextContent('9600.00');
    expect(section).toHaveTextContent('-2.5%');
    expect(section).toHaveTextContent('500.00');
    expect(section).toHaveTextContent('220.00');
  });

  it('should render footer with behavior pattern and confidence', () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const footer = screen.getByTestId('anomaly-footer');
    expect(footer).toBeInTheDocument();
    expect(screen.getByTestId('anomaly-behavior-pattern')).toHaveTextContent('One Time Event');
    expect(screen.getByTestId('anomaly-confidence')).toHaveTextContent('High confidence');
  });

  it('should omit explanation section when explanation is null', () => {
    const anomaly = { ...enrichedAnomaly, explanation: null };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-explanation')).not.toBeInTheDocument();
  });

  it('should omit historical context section when historicalContext is null', () => {
    const anomaly = { ...enrichedAnomaly, historicalContext: null };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-historical')).not.toBeInTheDocument();
  });

  it('should omit impact estimate section when impactEstimate is null', () => {
    const anomaly = { ...enrichedAnomaly, impactEstimate: null };
    render(<AnomalyAlertItem anomaly={anomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-impact')).not.toBeInTheDocument();
  });
});

describe('AnomalyAlertItem — Classification badges', () => {
  let onDismiss;
  let onMarkExpected;

  const makeAnomaly = (classification) => ({
    expenseId: 1,
    place: 'Test Store',
    amount: 100,
    anomalyType: 'amount',
    classification,
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'medium',
    explanation: { typeLabel: classification, observedValue: 100, expectedRange: { min: 10, max: 50 }, deviationPercent: 100, comparisonPeriod: 'last 12 months' },
    behaviorPattern: 'One_Time_Event',
    confidence: 'medium',
  });

  const classificationLabels = {
    Large_Transaction: 'Large Transaction',
    Category_Spending_Spike: 'Category Spike',
    New_Merchant: 'New Merchant',
    Frequency_Spike: 'Frequency Spike',
    Recurring_Expense_Increase: 'Recurring Increase',
    Seasonal_Deviation: 'Seasonal',
    Emerging_Behavior_Trend: 'Emerging Trend',
  };

  const classificationStyles = {
    Large_Transaction: 'classLargeTransaction',
    Category_Spending_Spike: 'classCategorySpendingSpike',
    New_Merchant: 'classNewMerchant',
    Frequency_Spike: 'classFrequencySpike',
    Recurring_Expense_Increase: 'classRecurringExpenseIncrease',
    Seasonal_Deviation: 'classSeasonalDeviation',
    Emerging_Behavior_Trend: 'classEmergingBehaviorTrend',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  Object.entries(classificationLabels).forEach(([classification, label]) => {
    it(`should render correct badge label for ${classification}`, () => {
      render(<AnomalyAlertItem anomaly={makeAnomaly(classification)} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  Object.entries(classificationStyles).forEach(([classification, styleName]) => {
    it(`should apply CSS class containing ${styleName} for ${classification}`, () => {
      render(<AnomalyAlertItem anomaly={makeAnomaly(classification)} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
      const badge = screen.getByText(classificationLabels[classification]);
      expect(badge.className).toMatch(new RegExp(styleName));
    });
  });
});

describe('AnomalyAlertItem — Cluster alerts', () => {
  let onDismiss;
  let onMarkExpected;

  const clusterAnomaly = {
    expenseId: null,
    place: 'Multiple',
    amount: 1500,
    anomalyType: 'daily_total',
    classification: 'Large_Transaction',
    date: '2026-03-01',
    category: 'Travel',
    severity: 'medium',
    explanation: { typeLabel: 'Transaction Cluster', observedValue: 1500, expectedRange: { min: 100, max: 400 }, deviationPercent: 275, comparisonPeriod: 'last 12 months' },
    historicalContext: { purchaseRank: null, purchaseRankTotal: null, percentile: 95, deviationFromAverage: 200, frequency: null },
    impactEstimate: { annualizedChange: 12000, savingsRateChange: null, budgetImpact: null },
    behaviorPattern: 'One_Time_Event',
    confidence: 'medium',
    cluster: {
      label: 'Travel_Event',
      totalAmount: 1500,
      transactionCount: 4,
      dateRange: { start: '2026-03-01', end: '2026-03-05' },
      transactions: [
        { expenseId: 101, place: 'Hotel ABC', amount: 600, date: '2026-03-01' },
        { expenseId: 102, place: 'Restaurant XYZ', amount: 150, date: '2026-03-02' },
        { expenseId: 103, place: 'Taxi Service', amount: 250, date: '2026-03-03' },
        { expenseId: 104, place: 'Souvenir Shop', amount: 500, date: '2026-03-05' },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render cluster header with label, transaction count, and total amount', () => {
    render(<AnomalyAlertItem anomaly={clusterAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const cluster = screen.getByTestId('anomaly-cluster');
    expect(cluster).toBeInTheDocument();
    expect(cluster).toHaveTextContent('Travel Event');
    expect(cluster).toHaveTextContent('4 transactions');
    expect(cluster).toHaveTextContent('1500.00');
  });

  it('should have cluster transactions collapsed by default', () => {
    render(<AnomalyAlertItem anomaly={clusterAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByText('Hotel ABC')).not.toBeInTheDocument();
    expect(screen.queryByText('Restaurant XYZ')).not.toBeInTheDocument();
  });

  it('should expand cluster transactions on toggle click', () => {
    render(<AnomalyAlertItem anomaly={clusterAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByRole('button', { name: /expand transactions/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/Hotel ABC/)).toBeInTheDocument();
    expect(screen.getByText(/Restaurant XYZ/)).toBeInTheDocument();
    expect(screen.getByText(/Taxi Service/)).toBeInTheDocument();
    expect(screen.getByText(/Souvenir Shop/)).toBeInTheDocument();
  });

  it('should collapse cluster transactions on second toggle click', () => {
    render(<AnomalyAlertItem anomaly={clusterAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const toggle = screen.getByRole('button', { name: /expand transactions/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/Hotel ABC/)).toBeInTheDocument();

    const collapseToggle = screen.getByRole('button', { name: /collapse transactions/i });
    fireEvent.click(collapseToggle);
    expect(screen.queryByText('Hotel ABC')).not.toBeInTheDocument();
  });
});

describe('AnomalyAlertItem — Drift alerts', () => {
  let onDismiss;
  let onMarkExpected;

  const driftAnomaly = {
    expenseId: null,
    place: '',
    amount: 0,
    anomalyType: 'daily_total',
    classification: 'Emerging_Behavior_Trend',
    date: '2026-03-15',
    category: 'Dining',
    severity: 'medium',
    explanation: { typeLabel: 'Emerging Behavior Trend', observedValue: 800, expectedRange: { min: 200, max: 500 }, deviationPercent: 60, comparisonPeriod: 'last 6 months' },
    historicalContext: { purchaseRank: null, purchaseRankTotal: null, percentile: null, deviationFromAverage: 45.2, frequency: null },
    impactEstimate: { annualizedChange: 3600, savingsRateChange: -1.2, budgetImpact: null },
    behaviorPattern: 'Emerging_Trend',
    confidence: 'high',
    _driftData: {
      recentAvg: 800,
      precedingAvg: 500,
      percentageIncrease: 60,
    },
    budgetSuggestion: {
      action: 'create_budget',
      category: 'Dining',
      suggestedLimit: 850,
      currentLimit: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render drift period averages', () => {
    render(<AnomalyAlertItem anomaly={driftAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const drift = screen.getByTestId('anomaly-drift');
    expect(drift).toBeInTheDocument();
    expect(drift).toHaveTextContent('800.00');
    expect(drift).toHaveTextContent('500.00');
  });

  it('should render percentage increase', () => {
    render(<AnomalyAlertItem anomaly={driftAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const drift = screen.getByTestId('anomaly-drift');
    expect(drift).toHaveTextContent('+60.0%');
  });

  it('should render budget suggestion for create_budget action', () => {
    render(<AnomalyAlertItem anomaly={driftAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const suggestion = screen.getByTestId('anomaly-budget-suggestion');
    expect(suggestion).toBeInTheDocument();
    expect(suggestion).toHaveTextContent('creating a budget');
    expect(suggestion).toHaveTextContent('Dining');
    expect(suggestion).toHaveTextContent('850.00');
  });

  it('should render budget suggestion for adjust_budget action', () => {
    const adjustAnomaly = {
      ...driftAnomaly,
      budgetSuggestion: {
        action: 'adjust_budget',
        category: 'Dining',
        suggestedLimit: 900,
        currentLimit: 600,
      },
    };
    render(<AnomalyAlertItem anomaly={adjustAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    const suggestion = screen.getByTestId('anomaly-budget-suggestion');
    expect(suggestion).toHaveTextContent('adjusting a budget');
    expect(suggestion).toHaveTextContent('900.00');
  });

  it('should not render budget suggestion when null', () => {
    const noBudgetSuggestion = { ...driftAnomaly, budgetSuggestion: null };
    render(<AnomalyAlertItem anomaly={noBudgetSuggestion} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-budget-suggestion')).not.toBeInTheDocument();
  });
});

describe('AnomalyAlertItem — Confidence indicator', () => {
  let onDismiss;
  let onMarkExpected;

  const makeAnomaly = (confidence) => ({
    expenseId: 1,
    place: 'Store',
    amount: 100,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'medium',
    explanation: { typeLabel: 'Large Transaction', observedValue: 100, expectedRange: { min: 10, max: 50 }, deviationPercent: 100, comparisonPeriod: 'last 12 months' },
    behaviorPattern: 'One_Time_Event',
    confidence,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn().mockResolvedValue(undefined);
    onMarkExpected = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render "High confidence" text', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('high')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence')).toHaveTextContent('High confidence');
  });

  it('should render "Medium confidence" text', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('medium')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence')).toHaveTextContent('Medium confidence');
  });

  it('should render "Low confidence" text', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('low')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence')).toHaveTextContent('Low confidence');
  });

  it('should apply confidenceHigh CSS class for high confidence', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('high')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence').className).toMatch(/confidenceHigh/);
  });

  it('should apply confidenceMedium CSS class for medium confidence', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('medium')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence').className).toMatch(/confidenceMedium/);
  });

  it('should apply confidenceLow CSS class for low confidence', () => {
    render(<AnomalyAlertItem anomaly={makeAnomaly('low')} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-confidence').className).toMatch(/confidenceLow/);
  });
});

describe('AnomalyAlertItem — Action buttons in enriched layout', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    expenseId: 42,
    place: 'Expensive Store',
    amount: 999.99,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'high',
    explanation: { typeLabel: 'Large Transaction', observedValue: 999.99, expectedRange: { min: 50, max: 200 }, deviationPercent: 399.9, comparisonPeriod: 'last 12 months' },
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

  it('should call onDismiss when dismiss button is clicked in enriched layout', async () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-dismiss-btn'));
    });
    expect(onDismiss).toHaveBeenCalledWith(enrichedAnomaly);
  });

  it('should call onMarkExpected when mark-as-expected button is clicked in enriched layout', async () => {
    render(<AnomalyAlertItem anomaly={enrichedAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('anomaly-mark-expected-btn'));
    });
    expect(onMarkExpected).toHaveBeenCalledWith(enrichedAnomaly);
  });
});

describe('AnomalyAlertItem — CSS Module class scoping', () => {
  let onDismiss;
  let onMarkExpected;

  const enrichedAnomaly = {
    expenseId: 42,
    place: 'Store',
    amount: 100,
    anomalyType: 'amount',
    classification: 'Large_Transaction',
    date: '2026-03-10',
    category: 'Shopping',
    severity: 'medium',
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
    // CSS Module classes contain the module name pattern
    expect(root.className).toMatch(/alertItem/);
    expect(root.className).toMatch(/clickable/);
  });
});

describe('AnomalyAlertItem — Backward compatibility', () => {
  let onDismiss;
  let onMarkExpected;

  const legacyAnomaly = {
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

  it('should NOT render explanation, historical, or impact sections for legacy anomaly', () => {
    render(<AnomalyAlertItem anomaly={legacyAnomaly} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.queryByTestId('anomaly-explanation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-historical')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-impact')).not.toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-footer')).not.toBeInTheDocument();
  });

  it('should NOT render reason when enriched anomaly has both reason and explanation', () => {
    const enrichedWithReason = {
      expenseId: 42,
      place: 'Store',
      amount: 500,
      anomalyType: 'amount',
      classification: 'Large_Transaction',
      reason: 'This should not appear',
      date: '2026-03-10',
      category: 'Shopping',
      severity: 'high',
      explanation: { typeLabel: 'Large Transaction', observedValue: 500, expectedRange: { min: 50, max: 200 }, deviationPercent: 150, comparisonPeriod: 'last 12 months' },
      behaviorPattern: 'One_Time_Event',
      confidence: 'high',
    };
    render(<AnomalyAlertItem anomaly={enrichedWithReason} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />);
    expect(screen.getByTestId('anomaly-explanation')).toBeInTheDocument();
    expect(screen.queryByTestId('anomaly-reason')).not.toBeInTheDocument();
  });
});
