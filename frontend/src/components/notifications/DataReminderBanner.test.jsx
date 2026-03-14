import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataReminderBanner from './DataReminderBanner';

describe('DataReminderBanner', () => {
  const defaultProps = {
    type: 'investment',
    count: 2,
    monthName: 'December',
    onDismiss: vi.fn(),
    onClick: vi.fn(),
  };

  it('renders with investment type and correct icon', () => {
    render(<DataReminderBanner {...defaultProps} />);
    
    expect(screen.getByText('💡')).toBeInTheDocument();
    expect(screen.getByText(/Update 2 investment values for December/)).toBeInTheDocument();
  });

  it('renders with loan type and correct icon', () => {
    const loanProps = {
      ...defaultProps,
      type: 'loan',
      count: 1,
    };
    
    render(<DataReminderBanner {...loanProps} />);
    
    expect(screen.getByText('💳')).toBeInTheDocument();
    expect(screen.getByText(/Update 1 loan balance for December/)).toBeInTheDocument();
  });

  it('uses singular form for count of 1', () => {
    const singleInvestmentProps = {
      ...defaultProps,
      count: 1,
    };
    
    render(<DataReminderBanner {...singleInvestmentProps} />);
    
    expect(screen.getByText(/Update 1 investment value for December/)).toBeInTheDocument();
  });

  it('uses plural form for count greater than 1', () => {
    const multipleLoansProps = {
      ...defaultProps,
      type: 'loan',
      count: 3,
    };
    
    render(<DataReminderBanner {...multipleLoansProps} />);
    
    expect(screen.getByText(/Update 3 loan balances for December/)).toBeInTheDocument();
  });

  it('calls onClick when banner is clicked', () => {
    const onClick = vi.fn();
    render(<DataReminderBanner {...defaultProps} onClick={onClick} />);
    
    const banner = screen.getByRole('button', { name: /Update 2 investment values for December/ });
    fireEvent.click(banner);
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<DataReminderBanner {...defaultProps} onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByRole('button', { name: 'Dismiss reminder' });
    fireEvent.click(dismissButton);
    
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when dismiss button is clicked', () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<DataReminderBanner {...defaultProps} onClick={onClick} onDismiss={onDismiss} />);
    
    const dismissButton = screen.getByRole('button', { name: 'Dismiss reminder' });
    fireEvent.click(dismissButton);
    
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('displays correct month name', () => {
    const januaryProps = {
      ...defaultProps,
      monthName: 'January',
    };
    
    render(<DataReminderBanner {...januaryProps} />);
    
    expect(screen.getByText(/for January/)).toBeInTheDocument();
  });

  it('displays correct count in message', () => {
    const fiveInvestmentsProps = {
      ...defaultProps,
      count: 5,
    };
    
    render(<DataReminderBanner {...fiveInvestmentsProps} />);
    
    expect(screen.getByText(/Update 5 investment values/)).toBeInTheDocument();
  });
});
