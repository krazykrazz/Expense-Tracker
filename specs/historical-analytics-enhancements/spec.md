# Historical Analytics Enhancements — Spec

## Introduction

With 23 years of expense data (2003–2026, 21K+ transactions), the existing analytics features are under-leveraging the historical depth. Several services contain artificial guards (hardcoded lookback caps, naive averaging across decades) that limit analytical value. This spec defines enhancements that exploit the full longitudinal dataset and removes guards that artificially constrain analysis.

## Glossary

- **Historical_Average**: The mean monthly expense total calculated across all available data. Currently a naive average across all 276+ months regardless of economic context or lifestyle phase.
- **Weighted_Historical_Average**: A time-decayed average that gives recent years more influence than distant years, avoiding dilution from 2003-era spending levels.
- **Seasonal_Model**: Spending patterns across calendar months, currently limited to a 60-month (5-year) lookback window.
- **Lookback_Guard**: An artificial maximum on the `months` or `lookbackDays` parameter that prevents queries from accessing the full dataset.
- **Spending_Regime**: A sustained period of consistent spending level/pattern, bounded by changepoints (e.g., moving cities, new job, new dependents).
- **Category_Lifecycle**: The span from first to last occurrence of a spending category in the dataset.
- **Merchant_Lifecycle**: The span from first to last transaction at a given merchant.
- **Annual_Net_Position**: Income minus total expenses (variable + fixed) for a calendar year.
- **CPI_Adjustment**: Adjusting historical dollar amounts by the Consumer Price Index to express values in constant (current-year) dollars.

---

## Part A: Remove Artificial Guards

### Requirement A1: Remove Seasonal Analysis 60-Month Cap

**User Story:** As a user, I want seasonal analysis to leverage all available years of data for more robust seasonal models, rather than being capped at 5 years.

#### Acceptance Criteria

1. THE `analyticsController.js` seasonal endpoint SHALL accept `months` values up to 600 (50 years) or accept a special value `'all'` to use all available data.
2. WHEN `months` is set to `'all'`, THE `spendingPatternsService.getSeasonalAnalysis()` SHALL use the full dataset without date filtering.
3. THE current validation `monthsInt > 60` SHALL be replaced with `monthsInt > 600`.
4. THE frontend seasonal analysis component SHALL offer preset options including "All Time" alongside existing period selectors.

### Requirement A2: Remove Anomaly Lookback 365-Day Cap

**User Story:** As a user, I want anomaly detection baselines computed from the full historical dataset so that anomalies are assessed against long-term behavior, not just the last year.

#### Acceptance Criteria

1. THE `analyticsController.js` anomaly endpoint SHALL accept `lookbackDays` up to 9999 (covering the full dataset).
2. THE anomaly detection service SHALL continue to use `lookbackDays` to scope which *recent* expenses to evaluate for anomalies, but baseline statistics (mean, stdDev) SHALL always be computed from the full historical dataset for that category/merchant.
3. THE current validation `lookbackInt > 365` SHALL be replaced with `lookbackInt > 9999`.

### Requirement A3: Use Weighted Historical Average in Predictions

**User Story:** As a user, I want month-end predictions to reflect recent spending patterns rather than being diluted by 20-year-old data from a different economic context.

#### Acceptance Criteria

1. THE `predictionService._getHistoricalMonthlyAverage()` SHALL use an exponential decay weighting where more recent months carry more weight.
2. THE weighting SHALL use a half-life of 24 months (data from 2 years ago carries 50% weight, 4 years ago 25%, etc.).
3. THE method SHALL also offer a "same-month weighted average" mode: for predicting June 2026, weight June 2025 highest, then June 2024, etc. — leveraging the full 23 Junes available.
4. A new constant `PREDICTION_HALF_LIFE_MONTHS: 24` SHALL be added to `analyticsConstants.js`.

### Requirement A4: Trends Service — Configurable History Window

**User Story:** As a user, I want the trends view to show more than 6 months of spending history when I have decades of data available.

#### Acceptance Criteria

1. THE `trendsService._fetchMonthlyHistory()` SHALL accept a configurable `historyMonths` parameter (default 6, max 600).
2. THE `/api/analytics/trends/:year/:month` endpoint SHALL accept an optional `historyMonths` query parameter.
3. THE frontend TrendsView SHALL offer a period selector (6 months, 12 months, 24 months, All Time).

---

## Part B: New Analytics Features

### Requirement B1: Annual Summary Endpoint

**User Story:** As a user, I want to see a single view summarizing each year's total spending, income, and net position across all 23 years, so I can understand long-term financial trajectory.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/annual-summary` SHALL return an array of objects, one per calendar year with data:
   ```json
   {
     "year": 2015,
     "totalExpenses": 85000.00,
     "totalIncome": 72000.00,
     "netPosition": -13000.00,
     "transactionCount": 973,
     "topCategory": "Housing",
     "topCategoryAmount": 28000.00,
     "avgMonthlySpend": 7083.33
   }
   ```
2. THE endpoint SHALL return data for every year that has at least 1 expense record.
3. THE response SHALL be sorted by year ascending.
4. `totalIncome` SHALL be sourced from `income_sources` table (SUM per year).

### Requirement B2: Category Evolution (Decade Heatmap)

**User Story:** As a user, I want to visualize how my spending categories have shifted proportion over time, so I can see lifestyle changes reflected in data.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/category-evolution?granularity=year` SHALL return category proportion data grouped by year (or optionally by quarter).
2. THE response SHALL include for each time period: category name, amount, percentage of total, and transaction count.
3. THE frontend SHALL render this as a stacked area chart or heatmap showing category proportion changes over time.
4. Categories that appear/disappear over the timeline SHALL be highlighted (e.g., "Subscriptions: first seen 2012").

### Requirement B3: Merchant Loyalty Timeline

**User Story:** As a user, I want to see the lifecycle of my merchant relationships — when I started/stopped shopping somewhere, and how spending at each merchant evolved.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/merchant-lifecycle` SHALL return for each merchant with 5+ transactions:
   ```json
   {
     "merchant": "Costco",
     "firstSeen": "2003-07-15",
     "lastSeen": "2026-05-28",
     "totalSpent": 45000.00,
     "totalVisits": 420,
     "avgTransaction": 107.14,
     "activeYears": 23,
     "peakYear": 2024,
     "peakYearAmount": 5200.00,
     "status": "active"
   }
   ```
2. `status` SHALL be "active" if last transaction within 90 days, "inactive" if 90-365 days, "churned" if >365 days.
3. THE endpoint SHALL support `?sortBy=totalSpent|visits|longevity|avgTransaction`.
4. A detail sub-endpoint `GET /api/analytics/merchant-lifecycle/:merchant/trend` SHALL return annual spending at that merchant.

### Requirement B4: Spending Velocity & Acceleration

**User Story:** As a user, I want to know not just how much I'm spending, but whether spending is accelerating or decelerating over time — overall and per category.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/spending-velocity` SHALL compute:
   - Annual spending growth rate (% change year-over-year)
   - 3-year moving average trend
   - Per-category acceleration (positive = spending increasing, negative = decreasing)
2. THE computation SHALL use linear regression over annual totals to determine trend slope.
3. Categories with statistically significant acceleration (p < 0.05 or R² > 0.5) SHALL be flagged as "accelerating" or "decelerating".
4. THE response SHALL include the regression slope, direction, and confidence for each category with 5+ years of data.

### Requirement B5: "This Month in History" Comparison

**User Story:** As a user, I want to compare the current month's spending against the same month in every previous year, to understand how this month compares to my long-term pattern.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/month-history/:month` SHALL return spending totals for the given month across all available years.
2. THE response SHALL include: year, total, category breakdown (top 5), transaction count, and income for that month.
3. THE response SHALL include statistics: all-time average for that month, min/max years, standard deviation, and current year's percentile rank.
4. THE frontend SHALL show a bar chart or sparkline of the historical values with the current year highlighted.

### Requirement B6: Lifestyle Phase Detection (Changepoint Analysis)

**User Story:** As a user, I want the system to automatically detect major spending regime changes in my history, so I can see life events reflected in data without manually labeling them.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/spending-regimes` SHALL identify statistically significant changepoints in monthly spending totals.
2. THE algorithm SHALL use a sliding-window approach comparing mean spending in adjacent periods (minimum 6-month windows).
3. A regime change SHALL be flagged when the mean spending changes by >25% between adjacent windows AND the change persists for at least 3 months.
4. THE response SHALL include:
   ```json
   {
     "regimes": [
       {
         "startDate": "2003-06",
         "endDate": "2010-08",
         "avgMonthlySpend": 4200.00,
         "label": null
       },
       {
         "startDate": "2010-09",
         "endDate": "2015-03",
         "avgMonthlySpend": 6800.00,
         "changeFromPrevious": "+62%",
         "label": null
       }
     ]
   }
   ```
5. Users SHALL be able to label detected regimes via a `PATCH /api/analytics/spending-regimes/:id` endpoint (e.g., "Moved to Ottawa", "Kids started school").

### Requirement B7: Long-Term Seasonal Model (Multi-Year)

**User Story:** As a user, I want a robust seasonal spending model built from 20+ years of same-month data, so I get reliable expectations for each month.

#### Acceptance Criteria

1. A new endpoint `GET /api/analytics/seasonal-model` SHALL compute per-month statistics using ALL available years:
   - Mean spending for each calendar month (Jan–Dec) across all years
   - Standard deviation and coefficient of variation
   - Trend direction (is January getting more or less expensive over time?)
   - Number of data points (e.g., "based on 23 Januaries")
2. THE model SHALL optionally accept a `?recentBias=true` parameter to apply exponential decay weighting (same half-life as A3).
3. THE response SHALL flag months with high variance (CV > 0.5) as "unpredictable" vs. stable months.

### Requirement B8: Annual Net Position Trend

**User Story:** As a user, I want to see my income vs. expenses plotted year-over-year, so I can see my savings trajectory and identify my best/worst financial years.

#### Acceptance Criteria

1. THE `annual-summary` endpoint (B1) SHALL include `totalIncome` and `netPosition` (income - expenses) per year.
2. THE frontend SHALL render this as a dual-axis or grouped bar chart: income bars, expense bars, with a net position line.
3. THE endpoint SHALL flag years where `netPosition` was negative as "deficit years".
4. THE endpoint SHALL compute cumulative net position (running total) to show long-term savings trajectory.

### Requirement B9: Lifetime Spend per Payment Method

**User Story:** As a user, I want to see the total amount I've spent through each payment method over all time, so I can understand usage patterns across my cards and accounts.

#### Acceptance Criteria

1. THE `paymentMethodService.getAllWithExpenseCounts()` SHALL include `lifetime_spend` (the all-time sum of expenses) in the response payload for each payment method (currently computed as `expense_total_to_date` but stripped before returning).
2. THE `GET /api/payment-methods` list endpoint SHALL return `lifetime_spend` and `total_expense_count` for each payment method.
3. THE `CreditCardDetailView` SHALL display the lifetime spend amount and total transaction count in the card info section.
4. THE `PaymentMethodsSection` (other payment methods) SHALL display lifetime spend inline on each method row.
5. THE frontend SHALL format lifetime spend using the standard `formatCurrency()` helper.

---

## Part C: Performance Considerations

### Requirement C1: Query Performance with 21K+ Rows

**User Story:** As a developer, I need analytics queries to remain performant with the full historical dataset.

#### Acceptance Criteria

1. THE `predictionService._getHistoricalMonthlyAverage()` SHALL NOT call `expenseRepository.findAll()` (which loads all 21K rows into memory). It SHALL use an aggregation query at the database level.
2. NEW analytics endpoints SHALL use SQL aggregation (GROUP BY year/month) rather than loading all rows and processing in JavaScript.
3. ANY endpoint that computes statistics over the full dataset SHALL complete within 500ms on the production SQLite database.
4. Database indexes SHALL be verified for: `idx_date` (expenses.date), `idx_type` (expenses.type), `idx_place` (expenses.place).

### Requirement C2: Caching for Expensive Historical Queries

**User Story:** As a developer, I want to cache computed analytics that span the full dataset, since historical data is immutable.

#### Acceptance Criteria

1. Annual summary data for completed years (prior to current year) SHALL be cacheable since the data cannot change.
2. THE system SHALL invalidate cache for the current year when new expenses are added.
3. Cache strategy SHALL be in-memory with TTL (e.g., 1 hour for current-year aggregations, indefinite for completed years).

---

## Design

### Architecture Decisions

**AD-1: SQL-Level Aggregation Over In-Memory Processing**

All new analytics endpoints will perform aggregation in SQLite (GROUP BY, SUM, AVG, COUNT) rather than fetching all rows into Node.js.

```javascript
// ❌ Current anti-pattern (predictionService)
const all = await expenseRepository.findAll();
const total = all.reduce((sum, e) => sum + e.amount, 0);

// ✅ New pattern
const result = await db.get(
  `SELECT SUM(amount) as total, COUNT(*) as count 
   FROM expenses WHERE date >= ? AND date < ?`, [start, end]
);
```

**AD-2: Repository-Level Analytics Methods**

New aggregation queries will be added to a dedicated `analyticsRepository.js` to keep controller/service logic clean.

**AD-3: Exponential Decay Weighting**

Compute weights in JavaScript after fetching per-month aggregates from SQL. This avoids complex SQL expressions while still letting the DB handle the heavy lifting.

```javascript
const monthlyTotals = await analyticsRepo.getMonthlyTotals(); // [{year, month, total}]
const halfLife = 24; // months
const weighted = monthlyTotals.map(m => {
  const monthsAgo = ((now.getFullYear() - m.year) * 12) + (now.getMonth() + 1 - m.month);
  const weight = Math.pow(0.5, monthsAgo / halfLife);
  return { ...m, weight, weightedTotal: m.total * weight };
});
```

**AD-4: Cache Layer**

Simple in-memory cache keyed by `endpoint:params:year`:
- Completed years: cached indefinitely (data can't change)
- Current year: 1-hour TTL
- Invalidation: on expense create/update/delete, clear current-year cache entries

**AD-5: No Breaking API Changes**

Existing endpoints keep current defaults. New params are optional:
- `/api/analytics/trends/:year/:month` — still defaults to 6-month history (add optional `?historyMonths=N`)
- `/api/analytics/seasonal` — still defaults to 12 months (add `?months=all`)
- `/api/analytics/anomalies` — still defaults to current lookback (raise cap only)

### New Files

| File | Purpose |
|------|---------|
| `backend/repositories/analyticsRepository.js` | SQL aggregation queries for historical analytics |
| `backend/services/annualSummaryService.js` | Annual summary computation (B1, B8) |
| `backend/services/categoryEvolutionService.js` | Category proportions over time (B2) |
| `backend/services/merchantLifecycleService.js` | Merchant first/last seen, status (B3) |
| `backend/services/spendingVelocityService.js` | Growth rates, regression (B4) |
| `backend/services/monthHistoryService.js` | Same-month comparisons (B5) |
| `backend/services/regimeDetectionService.js` | Changepoint detection (B6) |
| `backend/services/seasonalModelService.js` | Multi-year seasonal model (B7) |
| `backend/services/analyticsCacheService.js` | In-memory cache with TTL |
| `backend/routes/historicalAnalyticsRoutes.js` | Route definitions for new endpoints |
| `frontend/src/components/analytics/AnnualSummaryView.jsx` | Year-over-year dashboard |
| `frontend/src/components/analytics/MerchantTimelineView.jsx` | Merchant lifecycle UI |
| `frontend/src/components/analytics/MonthHistoryView.jsx` | "This month in history" UI |

### Modified Files

| File | Change |
|------|--------|
| `backend/controllers/analyticsController.js` | Raise validation caps (A1, A2) |
| `backend/services/trendsService.js` | Parameterize history window (A4) |
| `backend/services/predictionService.js` | Weighted average (A3) |
| `backend/services/paymentMethodService.js` | Expose lifetime_spend (B9) |
| `backend/utils/analyticsConstants.js` | Add PREDICTION_HALF_LIFE_MONTHS, raise CONFIDENCE_HIGH_MONTHS |
| `frontend/src/components/analytics/TrendsView.jsx` | Period selector UI (A4) |
| `frontend/src/components/credit-cards/CreditCardDetailView.jsx` | Lifetime spend display (B9) |
| `frontend/src/components/financial/FinancialOverviewModal.jsx` | Lifetime spend on method rows (B9) |

### API Design

All new endpoints under `/api/analytics/`:

| Method | Path | Query Params |
|--------|------|-------------|
| GET | `/annual-summary` | `?includeIncome=true` |
| GET | `/category-evolution` | `?granularity=year\|quarter` |
| GET | `/merchant-lifecycle` | `?sortBy=totalSpent\|visits\|longevity&minTransactions=5` |
| GET | `/merchant-lifecycle/:merchant/trend` | — |
| GET | `/spending-velocity` | `?minYears=5` |
| GET | `/month-history/:month` | — |
| GET | `/spending-regimes` | `?minChangePercent=25&minWindowMonths=6` |
| PATCH | `/spending-regimes/:id` | Body: `{ "label": "..." }` |
| GET | `/seasonal-model` | `?recentBias=true` |

### Frontend Integration

The Analytics Hub modal already supports multiple views/tabs. New views will be added as additional tabs:
- "Annual Overview" (B1 + B8)
- "Category Shifts" (B2)
- "Merchant Timeline" (B3)
- "This Month in History" (B5)

Spending velocity (B4) and regime detection (B6) will be surfaced as insight cards within existing views rather than separate tabs.

---

## Tasks

### Phase 1: Remove Artificial Guards (Part A)

#### Task 1: Raise validation caps in analyticsController.js
- [ ] Change `monthsInt > 60` to `monthsInt > 600` (line ~147)
- [ ] Change `lookbackInt > 365` to `lookbackInt > 9999` (line ~239)
- [ ] Update error messages to reflect new limits
- [ ] Add `'all'` as accepted value for months param (convert to full dataset range)
- **Files:** `backend/controllers/analyticsController.js`

#### Task 2: Parameterize trendsService history window
- [ ] Change `_fetchMonthlyHistory()` to accept `historyMonths` parameter (default 6)
- [ ] Update the for-loop from `i < 6` to `i < historyMonths`
- [ ] Pass `historyMonths` from controller (read from query param)
- [ ] Update `/api/analytics/trends/:year/:month` route to accept `?historyMonths=N`
- **Files:** `backend/services/trendsService.js`, `backend/controllers/analyticsController.js`, `backend/routes/analyticsRoutes.js`

#### Task 3: Implement weighted historical average in predictionService
- [ ] Replace `_getHistoricalMonthlyAverage()` naive averaging with exponential decay
- [ ] Add `PREDICTION_HALF_LIFE_MONTHS: 24` to `analyticsConstants.js`
- [ ] Add same-month weighted mode (weight June 2025 > June 2024 > June 2023...)
- [ ] Replace `findAll()` call with SQL aggregation query
- **Files:** `backend/services/predictionService.js`, `backend/utils/analyticsConstants.js`, `backend/repositories/expenseRepository.js` or new `analyticsRepository.js`

#### Task 4: Frontend period selectors for existing views
- [ ] Add period selector to TrendsView (6mo, 12mo, 24mo, All)
- [ ] Add "All Time" option to seasonal analysis months selector
- [ ] Wire up new query params to API calls
- **Files:** `frontend/src/components/analytics/TrendsView.jsx`, seasonal analysis component

### Phase 2: New Analytics Repository & Services (Part B backend)

#### Task 5: Create analyticsRepository.js
- [ ] `getAnnualExpenseTotals()` — GROUP BY year
- [ ] `getAnnualIncomeTotals()` — from income_sources GROUP BY year
- [ ] `getCategoryByPeriod(granularity)` — GROUP BY year/quarter + category
- [ ] `getMerchantLifecycles(minTransactions)` — aggregates per merchant
- [ ] `getMerchantAnnualTrend(merchant)` — per-year totals for one merchant
- [ ] `getMonthlyTotals()` — all monthly totals for regime detection
- [ ] `getMonthAcrossYears(month)` — same month across all years
- **Files:** `backend/repositories/analyticsRepository.js`

#### Task 6: Implement annualSummaryService
- [ ] Combine expense totals + income totals per year
- [ ] Compute netPosition, avgMonthlySpend, topCategory per year
- [ ] Compute cumulative net position (running total)
- [ ] Flag deficit years
- **Files:** `backend/services/annualSummaryService.js`

#### Task 7: Implement merchantLifecycleService
- [ ] Compute status (active/inactive/churned) from lastSeen
- [ ] Identify peak year per merchant
- [ ] Support sorting options
- **Files:** `backend/services/merchantLifecycleService.js`

#### Task 8: Implement spendingVelocityService
- [ ] Compute YoY growth rates
- [ ] Compute 3-year moving averages
- [ ] Implement linear regression for per-category trends
- [ ] Flag significant acceleration/deceleration
- **Files:** `backend/services/spendingVelocityService.js`

#### Task 9: Implement monthHistoryService
- [ ] Gather same-month data across all years
- [ ] Compute statistics (mean, stdDev, min, max, percentile)
- [ ] Include top-5 category breakdown per year
- **Files:** `backend/services/monthHistoryService.js`

#### Task 10: Implement regimeDetectionService
- [ ] Sliding window changepoint detection over monthly totals
- [ ] Threshold: >25% change sustained for 3+ months
- [ ] Support user labels (stored in new DB table or JSON config)
- **Files:** `backend/services/regimeDetectionService.js`

#### Task 11: Implement seasonalModelService
- [ ] All-year per-month statistics (mean, stdDev, CV, trend)
- [ ] Optional recency bias with exponential decay
- [ ] Flag high-variance months
- **Files:** `backend/services/seasonalModelService.js`

#### Task 12: Implement categoryEvolutionService
- [ ] Category proportions by year/quarter
- [ ] Identify first/last seen dates per category
- [ ] Compute proportion shifts
- **Files:** `backend/services/categoryEvolutionService.js`

### Phase 3: Routes & Controllers (Part B API layer)

#### Task 13: Create historicalAnalyticsRoutes and controller methods
- [ ] Wire up all new endpoints
- [ ] Input validation (month 1-12, sortBy whitelist, etc.)
- [ ] Integrate cache layer
- **Files:** `backend/routes/historicalAnalyticsRoutes.js`, `backend/controllers/analyticsController.js` (or new controller)

#### Task 14: Implement analyticsCacheService
- [ ] In-memory cache with Map
- [ ] TTL logic: completed years = indefinite, current year = 1 hour
- [ ] Invalidation on expense CRUD events
- [ ] Hook into expense create/update/delete paths
- **Files:** `backend/services/analyticsCacheService.js`, `backend/controllers/expenseController.js` (invalidation hook)

### Phase 4: Frontend Views (Part B UI)

#### Task 15: AnnualSummaryView component
- [ ] Fetch and display annual-summary data
- [ ] Dual bar chart (income vs expenses) + net position line
- [ ] Highlight deficit years
- [ ] Show cumulative net position

#### Task 16: MerchantTimelineView component
- [ ] Sortable table of merchant lifecycles
- [ ] Click-through to per-merchant annual trend chart
- [ ] Status badges (active/inactive/churned)

#### Task 17: MonthHistoryView component
- [ ] Bar chart of current month across all years
- [ ] Statistics panel (mean, percentile, min/max)
- [ ] Category breakdown for selected year

#### Task 18: CategoryEvolutionView component
- [ ] Stacked area chart or heatmap
- [ ] Category first/last seen annotations
- [ ] Granularity toggle (year/quarter)

#### Task 19: Expose lifetime spend per payment method (B9)
- [ ] Stop stripping `expense_total_to_date` in `paymentMethodService.getAllWithExpenseCounts()` — rename to `lifetime_spend` in output
- [ ] Ensure `total_expense_count` is also included (already is, just verify)
- [ ] Display lifetime spend + total transaction count in `CreditCardDetailView` info section
- [ ] Display lifetime spend on each row in `PaymentMethodsSection` (other methods)
- **Files:** `backend/services/paymentMethodService.js`, `frontend/src/components/credit-cards/CreditCardDetailView.jsx`, `frontend/src/components/financial/FinancialOverviewModal.jsx`

#### Task 20: Integrate new views into Analytics Hub
- [ ] Add tabs/navigation for new views
- [ ] Lazy-load new view components
- [ ] Responsive layout

### Phase 5: Testing & Performance

#### Task 21: Backend tests for new services
- [ ] Unit tests for each new service (mock repository)
- [ ] Integration tests for new endpoints (test DB with representative data)
- [ ] Property-based tests for regression/statistics functions

#### Task 22: Performance validation
- [ ] Verify all new endpoints complete <500ms on prod dataset
- [ ] Add database index if needed (likely already covered by idx_date, idx_type, idx_place)
- [ ] Load test with 21K rows

---

## Appendix: Identified Artificial Guards (Current State)

| Location | Guard | Current Limit | Impact |
|----------|-------|--------------|--------|
| `analyticsController.js:147` | Seasonal months cap | `monthsInt > 60` | Can't analyze beyond 5 years |
| `analyticsController.js:239` | Anomaly lookback cap | `lookbackInt > 365` | Baselines limited to 1 year |
| `predictionService._getHistoricalMonthlyAverage()` | Naive average | All months equally weighted | 2003 data dilutes 2025 predictions |
| `trendsService._fetchMonthlyHistory()` | Hardcoded 6 months | `for (let i = 0; i < 6; i++)` | Trends view limited to half a year |
| `spendingPatternsService.getSeasonalAnalysis()` | Month filter | `startDate.setUTCMonth(... - months)` | Combined with 60-month cap |
| `predictionService._getHistoricalMonthlyAverage()` | `findAll()` loads all rows | 21K rows into JS memory | Performance concern (should use SQL aggregation) |
| `ANALYTICS_CONFIG.CONFIDENCE_HIGH_MONTHS: 12` | Confidence ceiling | 12 months = "high" | With 276 months, confidence granularity is lost |
