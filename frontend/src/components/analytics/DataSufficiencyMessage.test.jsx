import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DataSufficiencyMessage from './DataSufficiencyMessage';

describe('DataSufficiencyMessage', () => {
  it('shows a loading state until sufficiency data arrives', () => {
    render(<DataSufficiencyMessage feature="patterns" />);
    expect(screen.getByText('Loading Data Information...')).toBeInTheDocument();
  });

  it('shows the remaining data requirement and feature availability', () => {
    render(
      <DataSufficiencyMessage
        feature="patterns"
        dataSufficiency={{
          monthsOfData: 2,
          missingDataMessage: 'Add one more complete month',
          availableFeatures: {
            recurringPatterns: false,
            predictions: true
          }
        }}
      />
    );

    expect(screen.getByText('1 more month of data needed')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 months')).toBeInTheDocument();
    expect(screen.getByText('Add one more complete month')).toBeInTheDocument();
    expect(screen.getAllByText('Recurring Patterns')[1].parentElement).toHaveClass('unavailable');
    expect(screen.getByText('Spending Predictions').parentElement).toHaveClass('available');
  });

  it('shows quality and date details when available', () => {
    render(
      <DataSufficiencyMessage
        feature="unknown"
        dataSufficiency={{
          monthsOfData: 12,
          dataQualityScore: 84,
          oldestExpenseDate: '2025-01-01',
          newestExpenseDate: '2026-01-31',
          availableFeatures: {}
        }}
      />
    );

    expect(screen.getByText('This Feature')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('2025-01-01')).toBeInTheDocument();
    expect(screen.getByText('2026-01-31')).toBeInTheDocument();
    expect(screen.queryByText(/more month/)).not.toBeInTheDocument();
  });
});
