# Archived Scripts

These scripts were used for one-time migrations and database fixes. They are kept for reference only and should **NOT** be run on current databases.

## Scripts

### checkMonthlyGross.js
- **Purpose:** Checked the old monthly_gross table structure
- **Status:** Deprecated (replaced by income_sources table)
- **Date Archived:** November 12, 2024

### migrateMonthlyGrossToIncomeSources.js
- **Purpose:** One-time migration from monthly_gross to income_sources table
- **Status:** Migration complete
- **Date Archived:** November 12, 2024

### fixWeeks.js
- **Purpose:** Fixed week calculations in expense records
- **Status:** One-time fix completed
- **Date Archived:** November 12, 2024

## Notes

- These scripts are preserved for historical reference
- Do not run these on production databases
- If you need to reference the logic, see the current implementation in the respective services
