import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BudgetReminderBanner from './BudgetReminderBanner';

const alert = (overrides) => ({
  id: `budget-alert-${overrides.category}`,
  severity: 'danger',
  progress: 95,
  spent: 95,
  limit: 100,
  ...overrides,
});

describe('BudgetReminderBanner', () => {
  it('rounds progress down so a near-limit budget never reads 100%', () => {
    render(<BudgetReminderBanner alerts={[alert({ category: 'Gas', progress: 99.96, spent: 199.92, limit: 200 })]} />);

    expect(screen.getByTestId('progress-badge')).toHaveTextContent('99%');
    expect(screen.getByText('Gas budget is 99.9% used')).toBeInTheDocument();
  });

  it('opens the pressed category when an alert row is activated with the keyboard', () => {
    const onClick = vi.fn();
    render(
      <BudgetReminderBanner
        alerts={[alert({ category: 'Gas', severity: 'critical', progress: 120 }), alert({ category: 'Groceries' })]}
        onClick={onClick}
      />
    );

    fireEvent.keyDown(screen.getByText('Groceries').closest('.reminder-alert-item'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('Groceries');
  });
});
