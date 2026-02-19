import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SyncToast from './SyncToast';

describe('SyncToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when messages array is empty', () => {
    const { container } = render(<SyncToast messages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when messages prop is omitted', () => {
    const { container } = render(<SyncToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toast text correctly', () => {
    const messages = [{ id: 'abc-1', text: '↻ Expenses updated' }];
    render(<SyncToast messages={messages} />);
    expect(screen.getByText('↻ Expenses updated')).toBeInTheDocument();
  });

  it('renders multiple toasts independently', () => {
    const messages = [
      { id: 'id-1', text: '↻ Expenses updated' },
      { id: 'id-2', text: '↻ Budget updated' },
      { id: 'id-3', text: '↻ People updated' },
    ];
    render(<SyncToast messages={messages} />);
    expect(screen.getByText('↻ Expenses updated')).toBeInTheDocument();
    expect(screen.getByText('↻ Budget updated')).toBeInTheDocument();
    expect(screen.getByText('↻ People updated')).toBeInTheDocument();
  });

  it('container has aria-live="polite" for accessibility', () => {
    const messages = [{ id: 'x', text: 'test' }];
    render(<SyncToast messages={messages} />);
    const container = screen.getByRole('status').parentElement;
    expect(container).toHaveAttribute('aria-live', 'polite');
  });

  it('each toast has role="status"', () => {
    const messages = [
      { id: 'a', text: '↻ Loans updated' },
      { id: 'b', text: '↻ Income updated' },
    ];
    render(<SyncToast messages={messages} />);
    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(2);
  });

  it('renders updated messages when props change', () => {
    const { rerender } = render(<SyncToast messages={[]} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<SyncToast messages={[{ id: 'new-1', text: '↻ Investments updated' }]} />);
    expect(screen.getByText('↻ Investments updated')).toBeInTheDocument();
  });

  it('disappears when messages array becomes empty', () => {
    const { rerender } = render(
      <SyncToast messages={[{ id: 'x', text: '↻ Fixed expenses updated' }]} />
    );
    expect(screen.getByText('↻ Fixed expenses updated')).toBeInTheDocument();

    rerender(<SyncToast messages={[]} />);
    expect(screen.queryByText('↻ Fixed expenses updated')).toBeNull();
  });
});
