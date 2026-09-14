import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';

const mockLoggerError = vi.fn();
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args) => mockLoggerError(...args)
  })
}));

function Boom({ message = 'kaboom' }) {
  throw new Error(message);
}

function Fine() {
  return <div>all good</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    mockLoggerError.mockClear();
    // React logs caught render errors to console.error; silence that noise.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
    cleanup();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Fine />
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders a recoverable fallback instead of a blank tree when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reports through the logger exactly once per caught error', () => {
    render(
      <ErrorBoundary name="TestBoundary">
        <Boom message="specific failure" />
      </ErrorBoundary>
    );

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [message, detail] = mockLoggerError.mock.calls[0];
    expect(message).toContain('TestBoundary');
    expect(detail.message).toBe('specific failure');
    expect(detail.componentStack).toBeTruthy();
  });

  it('"Try again" clears the error and re-renders children', async () => {
    const user = userEvent.setup();

    function Flaky() {
      const [shouldThrow, setShouldThrow] = useState(true);
      if (shouldThrow) {
        return (
          <ErrorBoundary onReset={() => setShouldThrow(false)}>
            <Boom />
          </ErrorBoundary>
        );
      }
      return (
        <ErrorBoundary>
          <Fine />
        </ErrorBoundary>
      );
    }

    render(<Flaky />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onReset before clearing state', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('clears the error when resetKey changes, so reopening a modal retries cleanly', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="modal-open-1">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="modal-open-2">
        <Fine />
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('does not clear the error when resetKey is unchanged', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="same">
        <Boom />
      </ErrorBoundary>
    );

    rerender(
      <ErrorBoundary resetKey="same">
        <Fine />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows error details in development', () => {
    vi.stubEnv('DEV', true);

    render(
      <ErrorBoundary>
        <Boom message="dev-visible detail" />
      </ErrorBoundary>
    );

    expect(screen.getByText(/error details/i)).toBeInTheDocument();
    expect(screen.getByText('dev-visible detail')).toBeInTheDocument();
  });

  it('hides error details outside development', () => {
    vi.stubEnv('DEV', false);

    render(
      <ErrorBoundary>
        <Boom message="leaky internal detail" />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText(/error details/i)).not.toBeInTheDocument();
    expect(screen.queryByText('leaky internal detail')).not.toBeInTheDocument();
  });

  it('renders a custom fallback node when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('supports a fallback render prop receiving the error and a reset callback', async () => {
    const user = userEvent.setup();

    function Flaky() {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <ErrorBoundary
          onReset={() => setShouldThrow(false)}
          fallback={({ error, reset }) => (
            <div>
              <span>caught: {error.message}</span>
              <button onClick={reset}>retry</button>
            </div>
          )}
        >
          {shouldThrow ? <Boom message="render prop error" /> : <Fine />}
        </ErrorBoundary>
      );
    }

    render(<Flaky />);
    expect(screen.getByText(/caught: render prop error/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('isolates failures — a sibling boundary keeps rendering', () => {
    render(
      <div>
        <ErrorBoundary name="left">
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary name="right">
          <Fine />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
