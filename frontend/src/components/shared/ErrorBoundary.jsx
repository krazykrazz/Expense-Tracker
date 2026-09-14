import { Component } from 'react';
import { createLogger } from '../../utils/logger';
import './ErrorBoundary.css';

const logger = createLogger('ErrorBoundary');

/**
 * Catches render-time errors in its subtree and shows a recoverable fallback
 * instead of unmounting the whole React tree.
 *
 * Must be a class component — React still has no hook equivalent.
 *
 * Props:
 *   children     - the guarded subtree
 *   name         - label used in logs to identify which boundary tripped
 *   fallback     - optional custom fallback: a ReactNode, or a function
 *                  ({ error, reset }) => ReactNode
 *   onReset      - optional callback invoked before state is cleared
 *   resetKey     - when this changes, a tripped boundary clears itself, so
 *                  closing and reopening a modal retries cleanly
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      prevResetKey: props.resetKey
    };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.prevResetKey) {
      return state.hasError
        ? { hasError: false, error: null, errorInfo: null, prevResetKey: props.resetKey }
        : { prevResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    logger.error(`Render error caught in ${this.props.name || 'unnamed boundary'}`, {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  handleReset() {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return typeof fallback === 'function'
        ? fallback({ error, reset: this.handleReset })
        : fallback;
    }

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-content">
          <h2 className="error-boundary-title">Something went wrong</h2>
          <p className="error-boundary-message">
            This part of the app ran into a problem. Your data has not been affected.
          </p>

          {/* Raw error text is for developers, not users — see R10's equivalent rule on the backend. */}
          {import.meta.env.DEV && (
            <details className="error-boundary-details">
              <summary>Error details (development only)</summary>
              <pre className="error-boundary-stack">{error?.message}</pre>
              {errorInfo?.componentStack && (
                <pre className="error-boundary-stack">{errorInfo.componentStack}</pre>
              )}
            </details>
          )}

          <button type="button" className="btn-primary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
