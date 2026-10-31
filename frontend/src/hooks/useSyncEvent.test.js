import { describe, test, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncEvent } from './useSyncEvent';

const dispatchSync = (entityType) => {
  act(() => {
    window.dispatchEvent(new CustomEvent('syncEvent', { detail: { entityType } }));
  });
};

describe('useSyncEvent', () => {
  test('calls back only for the requested entity types', () => {
    const callback = vi.fn();
    renderHook(() => useSyncEvent(['loan', 'credit_card'], callback));

    dispatchSync('loan');
    dispatchSync('income');
    dispatchSync('credit_card');

    expect(callback.mock.calls).toEqual([['loan'], ['credit_card']]);
  });

  test('accepts a single entity type string', () => {
    const callback = vi.fn();
    renderHook(() => useSyncEvent('investment', callback));

    dispatchSync('investment');

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('always calls the latest callback without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(({ cb }) => useSyncEvent('loan', cb), { initialProps: { cb: first } });
    const subscriptions = addSpy.mock.calls.filter(([type]) => type === 'syncEvent').length;

    rerender({ cb: second });
    dispatchSync('loan');
    addSpy.mockRestore();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(1);
  });

  test('stops listening on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useSyncEvent('loan', callback));

    unmount();
    dispatchSync('loan');

    expect(callback).not.toHaveBeenCalled();
  });

  test('ignores events without a detail', () => {
    const callback = vi.fn();
    renderHook(() => useSyncEvent('loan', callback));

    act(() => { window.dispatchEvent(new CustomEvent('syncEvent')); });

    expect(callback).not.toHaveBeenCalled();
  });
});
