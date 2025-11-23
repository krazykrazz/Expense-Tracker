# Budget Management User Guide

## Overview

The Budget Tracking & Alerts feature helps you control spending by setting monthly limits for expense categories and receiving real-time visual feedback on your budget progress.

## Key Features

- **Monthly Budget Limits**: Set spending limits for Food, Gas, and Other categories
- **Real-Time Progress Tracking**: See how much of your budget you've used as you add expenses
- **Color-Coded Alerts**: Visual indicators warn you when approaching or exceeding limits
- **Automatic Carry-Forward**: Budgets automatically copy from previous month
- **Manual Budget Copy**: Copy budgets from any previous month
- **Historical Analysis**: Compare budget performance over 3, 6, or 12 months

## Getting Started

### Setting Your First Budget

1. **Navigate to the month** you want to budget for using the month selector
2. **Click "💵 Manage Budgets"** button in the month selector area
3. **Enter budget amounts** for the categories you want to track:
   - **Food**: Groceries, restaurants, takeout
   - **Gas**: Fuel for vehicles
   - **Other**: All other non-tax-deductible expenses
4. **Click "Save"** to store your budget limits

**Note**: Tax-deductible categories (Tax - Medical, Tax - Donation) cannot have budgets set.

### Understanding Budget Progress

Once you've set budgets, you'll see progress bars for each category in the Budget Summary Panel:

#### Color Coding

- **🟢 Green (0-79%)**: You're doing great! Plenty of budget remaining
- **🟡 Yellow (80-89%)**: Warning - approaching your limit
- **🟠 Orange (90-99%)**: Danger - very close to your limit
- **🔴 Red (100%+)**: Over budget - you've exceeded your limit

#### Progress Bar Information

Each budget card shows:
- **Category name** (e.g., "Food")
- **Budget limit** (e.g., "$500.00")
- **Amount spent** (e.g., "$342.50")
- **Remaining amount** (e.g., "$157.50 remaining") or **Overage** (e.g., "$42.50 over")
- **Progress percentage** (e.g., "68.5%")
- **Visual progress bar** with color coding

## Automatic Budget Carry-Forward

### How It Works

When you navigate to a new month that doesn't have budgets set, the system automatically:

1. **Checks the previous month** for existing budgets
2. **Copies all budget limits** to the current month
3. **Preserves the exact amounts** from the previous month
4. **Allows you to modify** the carried-forward budgets as needed

### Example

- **October 2025**: You set Food = $500, Gas = $200, Other = $300
- **November 2025**: When you first view November, budgets automatically become Food = $500, Gas = $200, Other = $300
- **You can then adjust** November's budgets if your spending needs change

### When Carry-Forward Doesn't Happen

- If you've already manually created budgets for a month, carry-forward won't overwrite them
- If the previous month has no budgets, you'll start with an empty budget list

## Manual Budget Copy

### When to Use Manual Copy

Use manual budget copy when you want to:
- Copy budgets from a specific month (not just the previous month)
- Restore budget limits from several months ago
- Replicate a successful budget configuration

### How to Copy Budgets

1. **Open the Budget Management Modal** for the target month
2. **Click "📋 Copy from Previous Month"** button
3. **Select the source month** from the dropdown (shows months with existing budgets)
4. **Confirm the copy operation**
5. **Choose whether to overwrite** if the target month already has budgets

### Copy Behavior

- **All budgets are copied**: Every category with a budget in the source month is copied
- **Exact amounts preserved**: Budget limits are copied exactly as they were
- **Overwrite option**: If target month has budgets, you can choose to overwrite or cancel
- **Confirmation message**: Shows how many budgets were copied

## Budget Summary Panel

### Overall Summary

At the top of the Budget Summary Panel, you'll see:

- **Total Budgeted**: Sum of all budget limits (e.g., "$1,500.00")
- **Total Spent**: Sum of spending in budgeted categories (e.g., "$1,234.56")
- **Remaining/Overage**: How much budget is left or exceeded (e.g., "$265.44 remaining")
- **Overall Progress**: Percentage of total budget used (e.g., "82.3%")
- **Budgets On Track**: How many budgets are under 100% (e.g., "2 of 3 on track")

### Category Cards

Below the summary, individual cards show progress for each budgeted category with:
- Progress bar
- Spent vs limit amounts
- Remaining/overage
- Color-coded status

## Historical Budget Analysis

### Viewing Budget History

1. **Click "📊 Budget History"** button in the month selector
2. **Select a time period**: 3, 6, or 12 months
3. **Review the analysis** showing:
   - Budget vs actual spending for each category
   - Success rate (% of months budget was met)
   - Average spending per category
   - Month-by-month breakdown

### Understanding the History View

#### Success Rate

Shows what percentage of months you stayed within budget for each category:
- **100%**: You met the budget every month
- **83%**: You met the budget 5 out of 6 months
- **50%**: You met the budget half the time

#### Average Spending

Shows your average spending per category over the selected period, helping you:
- Set realistic budget limits
- Identify spending trends
- Adjust budgets based on actual patterns

#### Month-by-Month Table

Displays each month with:
- **Budgeted**: The limit you set
- **Spent**: What you actually spent
- **Status**: ✅ Met budget or ❌ Exceeded budget
- **Variance**: How much over or under budget

## Real-Time Budget Updates

### Automatic Recalculation

Budgets update automatically when you:

1. **Add an expense**: Budget progress increases immediately
2. **Edit an expense**: Budget recalculates if amount or category changes
3. **Delete an expense**: Budget progress decreases immediately
4. **Change expense date**: Both old and new month budgets update

### No Manual Refresh Needed

The system handles all updates automatically - you don't need to refresh the page or click any buttons to see updated budget progress.

## Tips for Effective Budgeting

### Setting Realistic Budgets

1. **Review past spending**: Use the historical analysis to see your actual spending patterns
2. **Start conservative**: It's better to exceed a conservative budget than fail at an aggressive one
3. **Adjust monthly**: Your budget can change month-to-month based on your needs
4. **Account for seasonality**: Some months naturally have higher spending (holidays, vacations)

### Using Budget Alerts

1. **Yellow warning (80%)**: Time to be mindful of spending in this category
2. **Orange danger (90%)**: Avoid non-essential purchases in this category
3. **Red critical (100%+)**: You've exceeded your limit - consider adjusting next month's budget

### Budget Categories

**Food**: 
- Groceries
- Restaurants and takeout
- Coffee shops
- Food delivery

**Gas**:
- Vehicle fuel only
- Does not include car maintenance or insurance

**Other**:
- Everything else that's not food, gas, or tax-deductible
- Clothing, entertainment, household items, etc.

**Tax-Deductible** (cannot be budgeted):
- Medical expenses
- Charitable donations
- These are tracked separately for tax purposes

## Troubleshooting

### Budget Not Showing

**Problem**: I set a budget but don't see it in the summary panel

**Solutions**:
- Ensure you clicked "Save" in the budget management modal
- Check that you're viewing the correct month
- Verify the budget amount is greater than zero
- Refresh the page if needed

### Automatic Carry-Forward Not Working

**Problem**: Budgets didn't automatically copy to the new month

**Solutions**:
- Verify the previous month has budgets set
- Check that you haven't already manually created budgets for the current month
- Use manual budget copy as an alternative

### Progress Not Updating

**Problem**: Added an expense but budget progress didn't change

**Solutions**:
- Verify the expense is in a budgeted category (Food, Gas, or Other)
- Check that the expense date matches the budget month
- Ensure the expense was successfully saved
- Refresh the page if the issue persists

### Can't Set Budget for Category

**Problem**: Unable to set budget for Tax - Medical or Tax - Donation

**Solution**: This is by design. Tax-deductible categories cannot have budgets set. Only Food, Gas, and Other categories support budgeting.

## Data Backup

Budget data is automatically included in all database backups. When you:

- **Create a backup**: All budget limits and settings are included
- **Restore from backup**: All budgets are restored exactly as they were
- **Use automated backups**: Budgets are included in scheduled backups

No special action is needed to backup budget data - it's part of your regular database backup.

## Best Practices

1. **Review budgets monthly**: Adjust based on the previous month's performance
2. **Use historical analysis**: Make data-driven decisions about budget limits
3. **Don't ignore alerts**: Yellow and orange warnings are there to help you stay on track
4. **Be flexible**: It's okay to adjust budgets mid-month if circumstances change
5. **Track all expenses**: Budget tracking only works if you record all your spending
6. **Set budgets for all categories**: Even if generous, having a limit helps awareness
7. **Celebrate success**: When you meet your budgets, acknowledge your discipline

## Future Enhancements

Planned features for future releases:

- Custom expense categories with budgets
- Budget templates for quick setup
- Email/push notifications for budget alerts
- Budget forecasting based on spending trajectory
- Budget rollover (carry unused budget to next month)
- Shared household budgets with multiple users
- PDF budget performance reports

## Support

For issues or questions about budget tracking:

1. Check this guide for common solutions
2. Review the main README.md for general application help
3. Check CHANGELOG.md for recent changes and known issues
4. Open an issue on the project repository for bugs or feature requests
