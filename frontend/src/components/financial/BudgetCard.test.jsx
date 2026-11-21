import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BudgetCard from './BudgetCard';

describe('BudgetCard', () => {
  it('shows overspending with an absolute currency amount and over-budget state', () => {
    render(
      <BudgetCard
        category="Food"
        budgetLimit={500}
        spent={650}
        previousMonthSpent={500}
      />
    );

    expect(screen.getByRole('heading', { name: 'Food' })).toBeInTheDocument();
    const overRow = screen.getByText('Over:').parentElement;
    expect(within(overRow).getByText('$150.00')).toHaveClass('over-budget');
  });

  it('shows remaining budget and omits the trend when no prior month exists', () => {
    render(<BudgetCard category="Gas" budgetLimit={200} spent={75} />);

    const remainingRow = screen.getByText('Remaining:').parentElement;
    expect(within(remainingRow).getByText('$125.00')).toHaveClass('under-budget');
    expect(screen.queryByLabelText(/^Trend /)).not.toBeInTheDocument();
  });

  it('normalizes invalid numeric props to zero', () => {
    render(<BudgetCard category="Unknown" budgetLimit="invalid" spent={undefined} />);

    expect(screen.getAllByText('$0.00')).toHaveLength(3);
    expect(screen.getByText('Remaining:')).toBeInTheDocument();
  });
});
