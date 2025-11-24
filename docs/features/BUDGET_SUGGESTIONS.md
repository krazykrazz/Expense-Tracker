# Budget Suggestions Feature

## Overview

The Budget Suggestions feature provides intelligent budget recommendations based on historical spending patterns. The system analyzes spending from the previous 3-6 months to suggest appropriate budget limits for each category.

## How It Works

### Algorithm

1. **Historical Analysis**: Looks back up to 6 months from the target month
2. **Data Collection**: Gathers actual spending for the specified category
3. **Average Calculation**: Computes the average spending across months with data
4. **Smart Rounding**: Rounds the suggestion to the nearest $50 for practical budgeting

### Example

If you're setting a budget for Food in December 2025:
- System checks spending from June-November 2025
- Finds spending: $520, $485, $550, $510, $495 (5 months with data)
- Calculates average: $512
- Suggests: $500 (rounded to nearest $50)

## API Endpoint

### Request

```http
GET /api/budgets/suggest?year=2025&month=12&category=Food
```

**Query Parameters:**
- `year` (required): Target year for the budget
- `month` (required): Target month (1-12)
- `category` (required): Budget category (Food, Gas, or Other)

### Response

```json
{
  "category": "Food",
  "suggestedAmount": 500,
  "averageSpending": 512.00,
  "basedOnMonths": 5
}
```

**Response Fields:**
- `category`: The category for which the suggestion was made
- `suggestedAmount`: Recommended budget amount (rounded to nearest $50)
- `averageSpending`: Actual average spending over the historical period
- `basedOnMonths`: Number of months with spending data used for calculation

### No Historical Data

If there's no historical spending data:

```json
{
  "category": "Gas",
  "suggestedAmount": 0,
  "averageSpending": 0,
  "basedOnMonths": 0
}
```

## Error Handling

### Invalid Request
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Year, month, and category query parameters are required"
  }
}
```

### Invalid Date
```json
{
  "error": {
    "code": "INVALID_DATE",
    "message": "Invalid year or month specified"
  }
}
```

### Invalid Category
```json
{
  "error": {
    "code": "INVALID_CATEGORY",
    "message": "Budget can only be set for Food, Gas, Other categories"
  }
}
```

## Use Cases

### 1. First-Time Budget Setup

When setting up budgets for the first time in a new month, use suggestions to get started with realistic amounts based on your actual spending patterns.

### 2. Budget Adjustment

If you consistently exceed or underspend your budget, use suggestions to recalibrate based on recent trends.

### 3. Seasonal Planning

Get suggestions that account for seasonal variations by analyzing the most recent 6 months of spending.

## Integration with Budget Management

The suggestion feature is designed to work seamlessly with the budget management workflow:

1. User opens Budget Management Modal
2. System can optionally fetch suggestions for each category
3. User reviews suggestions alongside current budgets
4. User can accept, modify, or ignore suggestions

## Technical Details

### Historical Window

- **Maximum lookback**: 6 months
- **Minimum data**: 1 month (will suggest based on single month if that's all available)
- **Excluded months**: Only counts months with actual spending > $0

### Rounding Logic

```javascript
const suggestedAmount = Math.round(averageSpending / 50) * 50;
```

This ensures suggestions are practical amounts:
- $512 → $500
- $537 → $550
- $475 → $500

### Performance

- **Query complexity**: O(n) where n = number of months analyzed (max 6)
- **Database queries**: 1 query per historical month
- **Response time**: Typically < 100ms

## Future Enhancements

Potential improvements for future versions:

1. **Trend Analysis**: Weight recent months more heavily than older months
2. **Seasonal Adjustment**: Detect and account for seasonal patterns
3. **Confidence Scores**: Indicate how reliable the suggestion is based on data consistency
4. **Multiple Strategies**: Offer conservative, moderate, and aggressive suggestions
5. **Machine Learning**: Use ML to predict future spending based on patterns

## Version History

- **v3.8.1**: Initial implementation of budget suggestion endpoint
  - Basic historical average calculation
  - Smart rounding to nearest $50
  - Error handling with structured error codes

## Related Documentation

- [Budget Management Guide](../guides/BUDGET_MANAGEMENT_GUIDE.md)
- [Budget Tracking & Alerts Specification](../../.kiro/specs/budget-tracking-alerts/)
- [API Documentation](../../README.md#api-endpoints)
