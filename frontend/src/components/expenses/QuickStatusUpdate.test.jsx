import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuickStatusUpdate from './QuickStatusUpdate';

describe('QuickStatusUpdate', () => {
  it('does not render while closed', () => {
    render(<QuickStatusUpdate expenseId={1} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('only offers allowed transitions and closes after success', async () => {
    const onStatusChange = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    render(
      <QuickStatusUpdate
        expenseId={17}
        currentStatus="not_claimed"
        onStatusChange={onStatusChange}
        onClose={onClose}
        isOpen
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status to In Progress' }));

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith(17, 'in_progress');
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the menu open and reports failed updates', async () => {
    render(
      <QuickStatusUpdate
        expenseId={4}
        currentStatus="in_progress"
        onStatusChange={vi.fn().mockRejectedValue(new Error('Permission denied'))}
        onClose={vi.fn()}
        isOpen
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Change status to Paid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape and on an outside click', () => {
    const onClose = vi.fn();
    const { container } = render(
      <QuickStatusUpdate
        expenseId={1}
        onStatusChange={vi.fn()}
        onClose={onClose}
        isOpen
      />
    );

    fireEvent.keyDown(container.querySelector('[role="menu"]'), { key: 'Escape' });
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
