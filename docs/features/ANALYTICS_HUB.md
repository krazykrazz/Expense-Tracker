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

Flags unusual spending for review using an enhanced 7-type classification system with structured explanations, historical context, and financial impact estimates.

**Classification Types** (expanded from original 3):
- **Large Transaction**: Single expense >3 standard deviations from category average
- **Category Spending Spike**: Monthly category total >50% above historical average
- **New Merchant**: First-time merchant visits with unusually high amounts
- **Frequency Spike**: Transaction count >100% above historical monthly average
- **Recurring Expense Increase**: Recurring pattern with >20% amount increase
- **Seasonal Deviation**: >25% deviation from same month prior year (requires 12+ months data)
- **Emerging Behavior Trend**: Gradual spending drift detected across multiple months

**Enriched Alert Cards**:
- Structured explanations with observed value, expected range, and deviation percentage
- Historical context (purchase rank, category percentile, frequency comparison)
- Financial impact estimates with annualized projections and budget impact
- Behavior pattern labels (One-Time Event, Recurring Change, Emerging Trend)
- Confidence scoring (low/medium/high) based on data availability
- Transaction clustering for related spending events (travel, moving, holidays)
- Budget integration with create/adjust suggestions on drift alerts

**Smart Filtering**:
- Benign pattern suppression (rare categories, seasonal spikes)
- Budget-aware suppression (avoids redundant alerts when budget alerts are active)
- Alert frequency controls (max 3 per category/month, repeat suppression, merging)
- Dismissible alerts with Mark as Expected option

> See [`docs/features/ANOMALY_DETECTION.md`](ANOMALY_DETECTION.md) for full details on the enhanced anomaly detection system.

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
