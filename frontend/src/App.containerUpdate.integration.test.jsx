import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

vi.mock('./utils/tabId.js', () => ({
  getTabId: () => 'test-tab-id',
  TAB_ID: 'test-tab-id',
  fetchWithTabId: vi.fn(),
}));

class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    MockEventSource._instances.push(this);
  }
  close() { this.closed = true; }
  static _instances = [];
  static reset() { MockEventSource._instances = []; }
  static latest() {
    return MockEventSource._instances[MockEventSource._instances.length - 1];
  }
}

const INITIAL_VERSION = { version: '5.12.0', startupId: 'abc-123' };
const CHANGED_VERSION = { version: '5.13.0', startupId: 'def-456' };
let currentVersionResponse;
let versionShouldFail;

function mockFetchHandler(url) {
  if (url.includes('/api/version')) {
    if (versionShouldFail) return Promise.reject(new Error('Network error'));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...currentVersionResponse }) });
  }
  if (url.includes('/api/categories'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: ['Groceries'] }) });
  if (url.includes('/api/payment-methods'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ paymentMethods: [{ id: 1, display_name: 'Debit', type: 'debit', is_active: 1 }] }) });
  if (url.includes('/api/people'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/budgets/summary'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 }) });
  if (url.includes('/api/budgets'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ budgets: [] }) });
  if (url.includes('/api/summary'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalExpenses: 0, weeklyTotals: {}, monthlyGross: 0, remaining: 0, typeTotals: {}, methodTotals: {} }) });
  if (url.includes('/api/fixed-expenses'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/income'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ sources: [], total: 0 }) });
  if (url.includes('/api/loans'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/expenses'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  if (url.includes('/api/reminders'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

describe('App Container Update Integration Tests', () => {
  let originalLocation;

  beforeEach(() => {
    MockEventSource.reset();
    vi.stubGlobal('EventSource', MockEventSource);
    currentVersionResponse = { ...INITIAL_VERSION };
    versionShouldFail = false;
    vi.stubGlobal('fetch', vi.fn(mockFetchHandler));
    originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location = originalLocation;
  });

  async function waitForAppReady() {
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(MockEventSource._instances.length).toBeGreaterThanOrEqual(1);
    });
    act(() => { MockEventSource.latest().onopen?.(); });
    await new Promise(r => setTimeout(r, 200));
  }

  async function simulateSseReconnect() {
    const countBefore = MockEventSource._instances.length;
    act(() => { MockEventSource.latest().onerror?.(); });
    await waitFor(() => {
      expect(MockEventSource._instances.length).toBeGreaterThan(countBefore);
      expect(MockEventSource.latest().closed).toBe(false);
    }, { timeout: 5000 });
    act(() => { MockEventSource.latest().onopen?.(); });
  }

  it('shows update banner when version changes after SSE reconnect', async () => {
    render(<App />);
    await waitForAppReady();
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();

    currentVersionResponse = { ...CHANGED_VERSION };
    await simulateSseReconnect();

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    }, { timeout: 8000 });

    const banner = screen.getByTestId('update-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner.textContent).toContain('5.13.0');
  }, 15000);

  it('re-shows banner after dismiss when another mismatch is detected', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitForAppReady();

    currentVersionResponse = { ...CHANGED_VERSION };
    await simulateSseReconnect();

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    }, { timeout: 8000 });

    const dismissBtn = screen.getByLabelText('Dismiss update notification');
    await user.click(dismissBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    });

    await simulateSseReconnect();

    await waitFor(() => {
      expect(screen.getByTestId('update-banner')).toBeInTheDocument();
    }, { timeout: 8000 });
    expect(screen.getByTestId('update-banner').textContent).toContain('5.13.0');
  }, 30000);

  it('does not show banner when version endpoint returns errors', async () => {
    versionShouldFail = true;
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(MockEventSource._instances.length).toBeGreaterThanOrEqual(1);
    });
    act(() => { MockEventSource.latest().onopen?.(); });

    await new Promise(r => setTimeout(r, 8000));
    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();

    await simulateSseReconnect();
    await new Promise(r => setTimeout(r, 6000));

    expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
  }, 25000);
});
