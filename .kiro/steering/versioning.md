# Version Management

## Current Version Locations

The application version is displayed and stored in multiple locations:

1. **Frontend Display**: `frontend/src/App.jsx` - Footer shows version (e.g., `v3.1`)
2. **Frontend Package**: `frontend/package.json` - NPM version field
3. **Backend Package**: `backend/package.json` - NPM version field
4. **In-App Changelog**: `frontend/src/components/BackupSettings.jsx` - Settings page changelog section

## Versioning Rules

Follow Semantic Versioning (SEMVER): `MAJOR.MINOR.PATCH`

### When to Increment

**MAJOR version (X.0.0)** - Breaking changes:
- Database schema changes that require migration
- API endpoint changes that break compatibility
- Removal of features
- Major architectural changes

**MINOR version (x.Y.0)** - New features:
- New features added (e.g., recurring expenses, fixed expenses, tax deductible view)
- New API endpoints
- New UI components or pages
- Significant enhancements to existing features

**PATCH version (x.y.Z)** - Bug fixes:
- Bug fixes
- UI tweaks
- Performance improvements
- Documentation updates

## Update Process
When making changes that warrant a version bump:

1. **Determine the version type** based on the change
2. **Update all four locations**:
   - `frontend/package.json` - "version" field
   - `backend/package.json` - "version" field  
   - `frontend/src/App.jsx` - Footer version display
   - `frontend/src/components/BackupSettings.jsx` - In-app changelog section
3. **Keep versions synchronized** across all locations
4. **Document the change** in `CHANGELOG.md` following the Keep a Changelog format

## Examples

- Added "Cheque" payment method → PATCH (3.1.0 → 3.1.1)
- Added collapsible tax deductible lists → PATCH (3.1.1 → 3.1.2)
- Added recurring expenses feature → MINOR (3.1.2 → 3.2.0)
- Changed database schema for expenses table → MAJOR (3.2.0 → 4.0.0)

## Agent Instructions

When the user requests to push changes to production, build for production, or deploy:

1. **Automatically determine the version bump type** based on changes made:
   - MAJOR: Breaking changes, database schema changes requiring migration, API breaking changes
   - MINOR: New features, new endpoints, new UI components
   - PATCH: Bug fixes, UI tweaks, performance improvements, documentation updates

2. **Automatically update all four locations** without asking:
   - `frontend/package.json` - "version" field
   - `backend/package.json` - "version" field  
   - `frontend/src/App.jsx` - Footer version display
   - `frontend/src/components/BackupSettings.jsx` - In-app changelog (add new entry at the top)

3. **Update CHANGELOG.md** with the new version entry following Keep a Changelog format

4. **Rebuild the frontend** after version update to include the new version in the production build

5. **Inform the user** of the version bump applied (e.g., "Updated version to 3.3.0 (MINOR: added estimated_months_left feature)")

## In-App Changelog Format

When updating `frontend/src/components/BackupSettings.jsx`, add a new changelog entry at the top of the changelog section:

```jsx
<div className="changelog-entry">
  <div className="changelog-version">vX.Y.Z</div>
  <div className="changelog-date">Month Day, Year</div>
  <ul className="changelog-items">
    <li>Feature or change description</li>
    <li>Another feature or change</li>
    <li>Bug fix or improvement</li>
  </ul>
</div>
```

Keep the 4-5 most recent versions visible in the in-app changelog for user reference.
