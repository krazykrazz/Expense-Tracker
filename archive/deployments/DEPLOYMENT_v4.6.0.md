# Deployment Guide: v4.6.0 - Medical Expense People Tracking

## Overview

Version 4.6.0 introduces the Medical Expense People Tracking feature, which allows users to associate medical expenses with specific family members for detailed tax reporting.

## Release Date
December 14, 2025

## New Features

### Medical Expense People Tracking
- Associate medical expenses (Tax - Medical) with family members
- People management in Settings → People tab
- Single and multi-person expense allocation
- Person-grouped view in Tax Deductible
- Visual indicators for assigned/unassigned expenses
- Backward compatible with existing medical expenses

## Database Migration

### Automatic Migration
The database migration runs automatically on container startup. No manual intervention required.

### New Tables Created

#### people Table
```sql
CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### expense_people Table
```sql
CREATE TABLE IF NOT EXISTS expense_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
    UNIQUE(expense_id, person_id)
);
```

### Migration Behavior
- Tables are created if they don't exist
- Existing data is preserved
- No data migration required for existing expenses
- Existing medical expenses appear as "Unassigned" in person-grouped views

## Deployment Steps

### Pre-Deployment Checklist
- [ ] Backup current database
- [ ] Verify current version is 4.5.1
- [ ] Review CHANGELOG.md for breaking changes (none in this release)
- [ ] Ensure Docker registry is accessible

### Deployment Process

1. **Pull the latest image:**
   ```bash
   docker pull localhost:5000/expense-tracker:latest
   ```

2. **Stop the current container:**
   ```bash
   docker-compose down
   ```

3. **Start with new image:**
   ```bash
   docker-compose up -d
   ```

4. **Verify deployment:**
   ```bash
   docker logs expense-tracker
   ```
   Look for migration messages indicating tables were created.

5. **Test the feature:**
   - Navigate to Settings → People tab
   - Add a test person
   - Create a medical expense with the person assigned
   - View Tax Deductible to see person grouping

### Docker Compose Configuration
No changes required to docker-compose.yml for this release.

```yaml
version: '3.8'

services:
  expense-tracker:
    image: localhost:5000/expense-tracker:latest
    container_name: expense-tracker
    ports:
      - "2424:2424"
    volumes:
      - ./config:/config
    environment:
      - LOG_LEVEL=info
      - SERVICE_TZ=Etc/UTC
      - NODE_ENV=production
    restart: unless-stopped
```

## Rollback Procedure

If issues are encountered after deployment:

### Quick Rollback

1. **Stop the container:**
   ```bash
   docker-compose down
   ```

2. **Restore previous image:**
   ```bash
   docker pull localhost:5000/expense-tracker:4.5.1
   ```

3. **Update docker-compose.yml:**
   ```yaml
   image: localhost:5000/expense-tracker:4.5.1
   ```

4. **Start with previous version:**
   ```bash
   docker-compose up -d
   ```

### Database Rollback (if needed)

The new tables (`people` and `expense_people`) can be safely dropped if rolling back:

```sql
-- Only run if rolling back to pre-4.6.0
DROP TABLE IF EXISTS expense_people;
DROP TABLE IF EXISTS people;
```

**Note:** This will remove all people data and expense associations. Existing expenses will remain intact.

### Restore from Backup

If a full rollback is needed:

1. Stop the container
2. Replace `config/database/expenses.db` with backup
3. Start with previous version image

## Post-Deployment Verification

### Functional Tests

1. **People Management:**
   - [ ] Can add new person with name and date of birth
   - [ ] Can edit existing person
   - [ ] Can delete person (with cascade warning)

2. **Expense Association:**
   - [ ] Medical expense form shows people dropdown
   - [ ] Single person selection works
   - [ ] Multi-person allocation modal works
   - [ ] Split equally function works

3. **Tax Deductible View:**
   - [ ] Group by Person toggle works
   - [ ] Person sections display correctly
   - [ ] Unassigned section shows expenses without people
   - [ ] Quick assign functionality works

4. **Backward Compatibility:**
   - [ ] Existing medical expenses display correctly
   - [ ] Existing expenses appear in Unassigned section
   - [ ] Can add people to existing expenses

### API Verification

```bash
# Test people endpoint
curl http://localhost:2424/api/people

# Test creating a person
curl -X POST http://localhost:2424/api/people \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Person"}'
```

## Known Issues

None at this time.

## Support

For issues with this deployment:
1. Check container logs: `docker logs expense-tracker`
2. Verify database migration completed
3. Check browser console for frontend errors
4. Review the feature documentation in `docs/features/MEDICAL_EXPENSE_PEOPLE_TRACKING.md`

---

**Version:** 4.6.0  
**Previous Version:** 4.5.1  
**Migration Required:** Yes (automatic)  
**Breaking Changes:** None
