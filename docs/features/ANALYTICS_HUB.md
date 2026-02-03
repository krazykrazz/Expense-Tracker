# Analytics Hub (Spending Patterns & Predictions)

**Version**: 4.17.0  
**Completed**: January 2026  
**Spec**: `archive/specs/spending-patterns-predictions/`

## Overview

The Analytics Hub provides comprehensive spending analytics including pattern detection, predictions, seasonal analysis, anomaly detection, and merchant analytics in a unified tabbed interface.

## Features

### 1. Spending Patterns Tab

Analyzes spending behavior to identify patterns and trends.

**Key Features**:
- **Recurring Pattern Detection**: Identifies weekly, bi-weekly, and monthly spending patterns
- **Day-of-Week Analysis**: Shows spending distribution by day with high-spending day highlighting
- **Amount Variance**: Calculates expected ranges for recurring expenses

### 2. Predictions Tab

Forecasts end-of-month spending based on historical data.

**Key Features**:
- **Month-End Prediction**: Projects total spending with confidence intervals
- **Category Breakdown**: Shows predicted spending by category
- **Income Comparison**: Warns when predictions exceed income
- **Year-over-Year Variance**: Highlights >20% changes from same month last year
- **Budget Integration**: Shows current budget status alongside predictions

### 3. Seasonal Analysis Tab

Compares spending across time periods to identify seasonal trends.

**Key Features**:
- **Month-over-Month Comparison**: Charts showing spending trends
- **Quarter-over-Quarter Analysis**: Aggregated quarterly comparisons
- **Seasonal Categories**: Identifies categories with >25% seasonal variance

### 4. Anomaly Detection Tab

Flags unusual spending for review.

**Key Features**:
- **Amount Anomalies**: Expenses >3 standard deviations from category average
- **Daily Spikes**: Days with spending >2x daily average
- **New Merchant Alerts**: First-time visits with unusually high amounts
- **Dismissible Alerts**: Mark anomalies as reviewed to exclude from future detection

### 5. Merchants Tab

Integrated merchant analytics (previously standalone).

**Key Features**:
- Top merchants by spending, visits, or average spend
- Monthly trend charts per merchant
- Category and payment method breakdowns
- Fixed expenses integration option

## Data Requirements

- **Minimum**: 3 months of expense data for basic patterns
- **Recommended**: 12+ months for high-confidence predictions
- **Data Sufficiency Messaging**: Clear guidance when insufficient data

## Access

Click the "📈 Analytics" button in the main navigation to open the Analytics Hub.

## Backend Services

| Service | Purpose |
|---------|---------|
| `spendingPatternsService.js` | Pattern detection, day-of-week analysis, seasonal trends |
| `predictionService.js` | Month-end forecasting with confidence levels |
| `anomalyDetectionService.js` | Anomaly detection and dismissal tracking |
| `merchantAnalyticsService.js` | Merchant-level spending analysis |

## API Endpoints

- `GET /api/analytics/patterns` - Spending patterns
- `GET /api/analytics/predictions` - Month-end predictions
- `GET /api/analytics/seasonal` - Seasonal analysis
- `GET /api/analytics/anomalies` - Detected anomalies
- `GET /api/analytics/data-sufficiency` - Data availability check
- `GET /api/analytics/merchants` - Merchant analytics

## Testing

Comprehensive property-based testing with 91+ backend tests covering all analytics services.

---

**Last Updated**: February 2, 2026
