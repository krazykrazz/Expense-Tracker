# Test Data

This directory contains test data files used for development and testing purposes.

## Contents

- CSV files for import testing
- Sample expense data
- Test database files

## CSV Import Format

The expense tracker supports CSV imports with the following format:

```
Date,Place,Amount,Notes,Type,Week,Method
```

### Valid Expense Categories

The system supports the following 14 expense categories:

**Essential Living:**
- Housing
- Utilities
- Groceries
- Insurance

**Transportation:**
- Gas
- Vehicle Maintenance

**Food & Dining:**
- Dining Out

**Entertainment & Lifestyle:**
- Entertainment
- Subscriptions
- Recreation Activities

**Family & Pets:**
- Pet Care

**Tax-Deductible:**
- Tax - Medical
- Tax - Donation

**Other:**
- Other

### Sample CSV

See `sample-import.csv` for a complete example with all category types.

### Important Notes

- The "Food" category has been replaced with "Groceries" and "Dining Out"
- Use "Groceries" for grocery store purchases
- Use "Dining Out" for restaurants and takeout
- Tax-deductible categories are prefixed with "Tax - "

## Usage

These files are for development use only and should not be committed to version control.

## Note

All CSV and database files in this directory are ignored by git to prevent accidental commits of test data.
