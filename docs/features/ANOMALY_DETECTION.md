# Anomaly Detection

## Overview

The enhanced anomaly detection system transforms raw statistical deviations into actionable financial insights. Rather than simply flagging unusual amounts or new merchants, the system classifies anomalies into 7 meaningful types, attaches structured explanations with historical context, estimates financial impact, detects gradual behavioral drift, clusters related transactions, suppresses low-value alerts, and integrates with the budget system to eliminate redundant notifications.

The system is built as an evolutionary enhancement of the existing `AnomalyDetectionService`. The original 3 detectors (amount, daily total, new merchant) are preserved alongside 5 new detectors. A multi-stage enrichment and filtering pipeline processes all anomalies before they reach the user. The existing API contract is maintained with backward-compatible field additions.

## Features

### Anomaly Classification

Each detected anomaly is classified into exactly one of 7 types:

| Classification | Description | Detection Criteria |
|---|---|---|
| **Large_Transaction** | A single expense far above the category average | Amount exceeds 3 standard deviations above category average |
| **Category_Spending_Spike** | Monthly category spending significantly above historical norms | Monthly total exceeds historical monthly average by more than 50% |
| **New_Merchant** | First purchase at an unfamiliar merchant with a notable amount | Merchant not seen in historical data and amount exceeds first-visit threshold |
| **Frequency_Spike** | Unusually high number of transactions in a category | Monthly transaction count exceeds historical average count by more than 100% |
| **Recurring_Expense_Increase** | A recurring expense pattern showing a meaningful price increase | Amount increases more than 20% over the previous 3 occurrences |
| **Seasonal_Deviation** | Spending deviates from the same month in the prior year | Year-over-year deviation exceeds 25% with 12+ months of data |
| **Emerging_Behavior_Trend** | Gradual spending shift detected via behavioral drift analysis | Recent 3-month average exceeds preceding 3-month average by more than 25% |

The first 3 types map directly from the legacy detectors. The legacy `anomalyType` field (`amount`, `daily_total`, `new_merchant`) is preserved alongside the new `classification` field for backward compatibility.

### Structured Explanations

Every anomaly includes a structured explanation object:

- **Type label**: Human-readable classification name
- **Observed value**: The actual amount or total that triggered the alert
- **Expected range**: Min and max values derived from historical mean ± standard deviation
- **Deviation percentage**: How far above the expected range the observed value falls
- **Comparison period**: The time window used (last 12 months when available, otherwise all available data)

This replaces the previous single-line reason string with scannable, structured data.

### Historical Context

Each anomaly is enriched with historical comparisons:

- **Purchase rank**: Where this amount ranks among all purchases in the same category over the last 24 months (e.g., "3rd largest purchase out of 47")
- **Percentile**: For category-level anomalies, the percentile of the current month's spending relative to all months with data
- **Deviation from average**: Percentage deviation from the historical average for the anomaly's primary metric
- **Frequency**: Average interval between purchases at the flagged merchant or in the flagged category (e.g., "approximately once every 9 months")

### Financial Impact Estimates

Each anomaly projects the potential financial effect if the behavior continues:

- **Annualized change**: The observed monthly deviation projected over 12 months
- **Savings rate change**: The projected impact on savings rate when income data is available (omitted when no income data exists)
- **Budget impact**: When a budget exists for the category, includes the budget limit, current spent amount, projected month-end spending at the current pace, and projected overage (e.g., "At this pace, Dining will exceed its $500 budget by $220 this month")

### Behavior Patterns

Each anomaly is tagged with one of 3 behavior patterns to help users decide whether action is needed:

| Pattern | Criteria |
|---|---|
| **One_Time_Event** | Default — does not meet criteria for the other two patterns |
| **Recurring_Change** | 2 or more similar anomalies (same category and classification) in the last 3 months |
| **Emerging_Trend** | Behavioral drift detected in the same category |

### Confidence Scoring

Each anomaly includes a confidence level reflecting the reliability of the alert based on available historical data:

| Level | Criteria |
|---|---|
| **High** | 12+ months of data AND 10+ transactions in the category |
| **Medium** | 6–11 months of data OR 5–9 transactions |
| **Low** | Fewer than 6 months of data AND fewer than 5 transactions |

Uses the existing `CONFIDENCE_LEVELS` constants from `analyticsConstants.js`.

### Transaction Clustering

Related transactions representing a single real-world event are grouped into a single cluster alert instead of producing multiple individual alerts.

**Cluster detection criteria:**
- 3 or more anomalous transactions within a 7-day window
- Transactions share a common category theme

**Cluster labels:**

| Label | Category Pattern |
|---|---|
| **Travel_Event** | Transportation, accommodation, dining in a non-home location |
| **Moving_Event** | Furniture, home, utilities |
| **Home_Renovation** | Home improvement, furniture, appliances |
| **Holiday_Spending** | Gifts, dining, entertainment in December |

Each cluster alert contains the cluster label, total amount, transaction count, date range, and a list of constituent transactions. Individual alerts for clustered transactions are replaced by the single cluster alert — a transaction never appears in both a cluster and an individual alert.

### Behavioral Drift Detection

The system detects gradual spending increases that individually fall below anomaly thresholds but cumulatively represent a meaningful shift.

**How it works:**
1. For each category with 6+ months of data, compare the average monthly spending for the most recent 3-month period against the preceding 3-month period
2. Flag a drift when the recent average exceeds the preceding average by more than 25%
3. At most one drift alert is produced per category per detection run

Drift alerts are classified as `Emerging_Behavior_Trend` and include both period averages, the percentage increase, and the comparison period labels.

### Alert Frequency Controls

To prevent alert fatigue, the system enforces several frequency limits:

- **Per-category cap**: Maximum 3 alerts per category per calendar month
- **Repeat suppression**: Same category + classification within a 30-day window keeps only the most recent occurrence
- **Related alert merging**: Anomalies sharing the same category within a 7-day window (not part of a cluster) are merged into a single consolidated alert

Frequency controls are applied as the final filtering step, after all detection, enrichment, clustering, and suppression.

### Low-Value Alert Suppression

The system suppresses alerts that provide low decision value:

- **Rare category suppression**: Anomalies in predefined rare-purchase categories (Electronics, Furniture, Appliances) with fewer than 4 historical transactions are suppressed
- **Seasonal pattern suppression**: Anomalies matching known seasonal patterns (e.g., Gifts in December) are suppressed when 12+ months of data confirm the pattern
- **Cluster suppression**: Individual alerts for transactions that are part of a detected cluster are replaced by the cluster-level alert

### Budget Integration

The anomaly detection system integrates with the existing budget alert system in three ways:

#### Budget-Aware Suppression
When a category has an active budget alert at Danger (90–99%) or Critical (≥100%) severity, `Category_Spending_Spike` anomalies for that category are suppressed. The budget alert already communicates the overspending condition, so the anomaly would be redundant. Other anomaly types (Large_Transaction, Frequency_Spike, etc.) are not suppressed by budget status because they provide distinct insight value.

#### Budget Impact Projections
When an anomaly occurs in a category with an active budget, the impact estimate includes:
- Budget limit and current spent amount
- Projected month-end spending at the current daily rate
- Projected overage or remaining amount

#### Drift-Based Budget Suggestions
Behavioral drift alerts can include actionable budget suggestions:
- **Create budget**: When drift is detected in a category with no budget, suggests creating one with a limit based on the recent 3-month average (rounded up to nearest $50)
- **Adjust budget**: When drift is detected in a category where the budget has been at Critical severity for 2+ of the last 3 months, suggests increasing the limit based on recent spending

Budget data is fetched once per detection cycle and cached for all anomalies in that run. If the budget API call fails, the pipeline continues without budget integration data.

## Enriched Alert Card Layout

The `AnomalyAlertItem` component renders each anomaly in a structured card layout:

```
┌─────────────────────────────────────────────┐
│ [Classification Badge]  Merchant    $Amount  │  ← Header
│ Date · Category                              │
├─────────────────────────────────────────────┤
│ Explanation                                  │
│ Observed: $X  Expected: $Y–$Z  (+N%)        │
│ Compared to: last 12 months                 │
├─────────────────────────────────────────────┤
│ Historical Context                           │
│ 3rd largest purchase · 95th percentile       │
│ ~once every 9 months                         │
├─────────────────────────────────────────────┤
│ Impact Estimate                              │
│ Annualized: +$X/yr · Savings rate: -N%       │
│ Budget: At this pace, exceeds $500 by $220   │
├─────────────────────────────────────────────┤
│ [One-Time Event] [Confidence: High]          │  ← Footer
│ [Dismiss]  [Mark as Expected]                │
└─────────────────────────────────────────────┘
```

**Section behavior:**
- Sections with no data are omitted entirely (e.g., no savings rate when income data is unavailable, no budget impact when no budget exists)
- Cluster alerts show the cluster label, total amount, transaction count, and date range with a collapsible list of individual transactions
- Drift alerts show both period averages, percentage increase, and any budget suggestion as an actionable prompt
- Classification badges use distinct colors for each of the 7 types
- Confidence level is displayed as a visual indicator alongside the behavior pattern
- Existing Dismiss and Mark as Expected action buttons are preserved with the same API integration
- Click-to-navigate behavior scrolls to the associated expense in the expense list

## Detection Pipeline

The full pipeline executes within a single `detectAnomalies()` call:

### Phase 1: Detection
Eight detectors run in sequence, each appending raw anomalies to a shared array:
1. Amount anomalies (legacy)
2. Daily total anomalies (legacy)
3. New merchant anomalies (legacy)
4. Category spending spike
5. Frequency spike
6. Recurring expense increase
7. Seasonal deviation
8. Behavioral drift

Each detector is wrapped in an individual try/catch — if one fails, the others continue and partial results are returned.

### Phase 2: Enrichment
For each raw anomaly:
1. **Classification** — assign one of 7 types
2. **Explanation** — build structured explanation with expected range and deviation
3. **Historical context** — compute rank, percentile, deviation, frequency
4. **Impact estimation** — project annualized change, savings rate, budget impact
5. **Behavior pattern** — determine One_Time_Event, Recurring_Change, or Emerging_Trend
6. **Confidence scoring** — assign high, medium, or low based on data quantity

Each enrichment step is wrapped in try/catch per anomaly. On failure, default/null values are used and the anomaly is still included.

### Phase 3: Filtering
Applied in order:
1. **Cluster aggregation** — group related anomalies into cluster alerts
2. **Benign pattern suppression** — remove rare-category and seasonal alerts
3. **Budget-aware suppression** — remove redundant Category_Spending_Spike alerts
4. **Alert frequency controls** — enforce per-category caps, repeat suppression, merging
5. **Dismissed/suppression rule filtering** — apply user dismissals and suppression rules

## Technical Implementation

### Backend

#### Constants (`backend/utils/analyticsConstants.js`)
All thresholds, type enumerations, and configuration values are centralized:
- `ANOMALY_CLASSIFICATIONS` — the 7 classification types
- `LEGACY_TYPE_MAP` — maps legacy `anomalyType` values to new classifications
- `BEHAVIOR_PATTERNS` — One_Time_Event, Recurring_Change, Emerging_Trend
- `DETECTION_THRESHOLDS` — all numeric thresholds for detection
- `SUPPRESSION_CONFIG` — rare purchase categories and seasonal spike months
- `THROTTLE_CONFIG` — frequency control parameters
- `CLUSTER_LABELS` — cluster type labels

Existing `ANOMALY_TYPES`, `CONFIDENCE_LEVELS`, and `SEVERITY_LEVELS` are preserved unchanged.

#### Service (`backend/services/anomalyDetectionService.js`)
The existing service is enhanced in-place with private methods organized into three groups:
- **Detection methods**: `_detectCategorySpendingSpikes`, `_detectFrequencySpikes`, `_detectRecurringExpenseIncreases`, `_detectSeasonalDeviations`, `_detectBehavioralDrift`
- **Enrichment methods**: `_classifyAnomaly`, `_buildExplanation`, `_buildHistoricalContext`, `_estimateImpact`, `_assignBehaviorPattern`, `_scoreConfidence`
- **Filtering methods**: `_aggregateClusters`, `_suppressBenignPatterns`, `_suppressBudgetCovered`, `_applyFrequencyControls`, `_attachBudgetSuggestions`

Budget data is fetched via `_fetchBudgetData()` which calls `budgetService` directly (not via HTTP), cached for the detection cycle.

#### API (`GET /api/analytics/anomalies`)
No new endpoints. The existing endpoint returns the enriched anomaly objects in the same response structure (`{ anomalies: [...], metadata: {...} }`). Each anomaly object now contains the additional fields (classification, explanation, historicalContext, impactEstimate, behaviorPattern, confidence, cluster, budgetSuggestion).

### Frontend

#### Component (`frontend/src/components/notifications/AnomalyAlertItem.jsx`)
Restructured into sections (header, explanation, historical context, impact estimate, footer) with conditional rendering. Supports both legacy and enriched anomaly objects for backward compatibility.

#### Styles (`frontend/src/components/notifications/AnomalyAlertItem.module.css`)
Migrated from global CSS to CSS Module following the project's incremental adoption pattern. Includes classification badge colors, section layouts, cluster expand/collapse styles, confidence indicators, and drift alert styles.

### Activity Log Integration

Anomaly dismiss and mark-as-expected actions log activity events with both the legacy `anomaly_type` field and the new `classification` field in metadata. The `user_action` strings use human-readable classification labels (e.g., "Dismissed Large Transaction anomaly for Costco").

## Error Handling

- **Detector failures**: Each detector runs in try/catch. A failing detector is logged and skipped; results from other detectors are still returned.
- **Budget API failures**: Logged at warn level. Pipeline continues without budget integration (budgetImpact and budgetSuggestion are null, budget-aware suppression is skipped).
- **Enrichment failures**: Per-anomaly try/catch. Failed enrichment steps produce default/null values; the anomaly is still included in results.
- **Data insufficiency**: When historical data is insufficient, expected range defaults to `{ min: 0, max: 0 }`, historical context fields are null, and confidence is set to "low". The frontend omits sections with null data.

## Backward Compatibility

- The legacy `anomalyType` field (`amount`, `daily_total`, `new_merchant`) is preserved on every anomaly alongside the new `classification` field
- Existing frontend code that reads `anomalyType` continues to work during incremental migration
- The `LEGACY_TYPE_MAP` in `analyticsConstants.js` maps legacy types to new classifications
- The API response structure is unchanged — new fields are additive
- Existing dismiss and mark-as-expected functionality is preserved
- Activity log events include both legacy and new fields

## Version History

- **v5.13.0**: Enhanced anomaly detection system with 7 classification types, structured explanations, historical context, financial impact estimates, behavior patterns, confidence scoring, transaction clustering, behavioral drift detection, alert frequency controls, budget integration, low-value alert suppression, and enriched alert card layout
