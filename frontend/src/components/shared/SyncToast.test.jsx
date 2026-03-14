import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SyncToast from './SyncToast';

/**
 * Creates a mock toast store compatible with useSyncExternalStore.
 * Returns { subscribe, getSnapshot, setMessages } for test control.
 */
function createMockToastStore(initial = []) {
  let messages = initial;
  const listeners = new Set();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => messages,
    setMessages: (next) => {
      messages = next;
      listeners.forEach((l) => l());
    },
  };
}

describe('SyncToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when messages array is empty', () => {
    const store = createMockToastStore([]);
    const { container } = render(
      <SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toast text correctly', () => {
    const store = createMockToastStore([{ id: 'abc-1', text: '↻ Expenses updated' }]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    expect(screen.getByText('↻ Expenses updated')).toBeInTheDocument();
  });

  it('renders multiple toasts independently', () => {
    const store = createMockToastStore([
      { id: 'id-1', text: '↻ Expenses updated' },
      { id: 'id-2', text: '↻ Budget updated' },
      { id: 'id-3', text: '↻ People updated' },
    ]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    expect(screen.getByText('↻ Expenses updated')).toBeInTheDocument();
    expect(screen.getByText('↻ Budget updated')).toBeInTheDocument();
    expect(screen.getByText('↻ People updated')).toBeInTheDocument();
  });

  it('container has aria-live="polite" for accessibility', () => {
    const store = createMockToastStore([{ id: 'x', text: 'test' }]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    const container = screen.getByRole('status').parentElement;
    expect(container).toHaveAttribute('aria-live', 'polite');
  });

  it('each toast has role="status"', () => {
    const store = createMockToastStore([
      { id: 'a', text: '↻ Loans updated' },
      { id: 'b', text: '↻ Income updated' },
    ]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    const toasts = screen.getAllByRole('status');
    expect(toasts).toHaveLength(2);
  });

  it('renders updated messages when store changes', () => {
    const store = createMockToastStore([]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      store.setMessages([{ id: 'new-1', text: '↻ Investments updated' }]);
    });
    expect(screen.getByText('↻ Investments updated')).toBeInTheDocument();
  });

  it('disappears when messages array becomes empty', () => {
    const store = createMockToastStore([{ id: 'x', text: '↻ Fixed expenses updated' }]);
    render(<SyncToast subscribe={store.subscribe} getSnapshot={store.getSnapshot} />);
    expect(screen.getByText('↻ Fixed expenses updated')).toBeInTheDocument();

    act(() => {
      store.setMessages([]);
    });
    expect(screen.queryByText('↻ Fixed expenses updated')).toBeNull();
  });
});
