import { Component } from 'react';

/**
 * BudgetAlertErrorBoundary Component
 * Error boundary for budget alert rendering failures
 * 
 * Requirements: 7.1 - Add error boundaries for alert rendering failures
 */
class BudgetAlertErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging
    console.error('Budget Alert Error Boundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI for alert rendering errors
      return (
        <div className="budget-alert-error-fallback">
          <div className="budget-alert-error-content">
            <span className="budget-alert-error-icon" aria-hidden="true">⚠</span>
            <div className="budget-alert-error-message">
              <strong>Budget alerts temporarily unavailable</strong>
              <p>There was an issue displaying budget alerts. Your budget data is safe.</p>
            </div>
            <button
              type="button"
              className="budget-alert-error-retry"
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
                // Trigger a re-render by calling the retry callback if provided
                if (this.props.onRetry) {
                  this.props.onRetry();
                }
              }}
              aria-label="Retry loading budget alerts"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default BudgetAlertErrorBoundary;