import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../utils/formatters', () => ({
  formatCAD: (val) => `$${parseFloat(val || 0).toFixed(2)}`,
}));

import AnomalyAlertItem from './AnomalyAlertItem';

describe('AnomalyAlertItem', () => {
  const baseAnomaly = {
    expense_id: 42,
    merchant: 'Expensive Store',
    amount: 999.99,
    type: 'amount',
    reason: 'Amount is 3x higher than usual for this merchant',
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

  it('should render type labels for different anomaly types', () => {
    const { rerender } = render(
      <AnomalyAlertItem anomaly={{ ...baseAnomaly, type: 'new_merchant' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    expect(screen.getByText('New Merchant')).toBeInTheDocument();

    rerender(
      <AnomalyAlertItem anomaly={{ ...baseAnomaly, type: 'daily_total' }} onDismiss={onDismiss} onMarkExpected={onMarkExpected} />
    );
    expect(screen.getByText('High Daily Total')).toBeInTheDocument();
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
