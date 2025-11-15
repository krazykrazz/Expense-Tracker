# Version Management

## Current Version Locations

The application version is displayed and stored in multiple locations:

1. **Frontend Display**: `frontend/src/App.jsx` - Footer shows version (e.g., `v3.1`)
2. **Frontend Package**: `frontend/package.json` - NPM version field
3. **Backend Package**: `backend/package.json` - NPM version field

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
2. **Update all three locations**:
   - `frontend/package.json` - "version" field
   - `backend/package.json` - "version" field  
   - `frontend/src/App.jsx` - Footer version display
3. **Keep versions synchronized** across all locations
4. **Document the change** in a changelog or commit message

## Examples

- Added "Cheque" payment method → PATCH (3.1.0 → 3.1.1)
- Added collapsible tax deductible lists → PATCH (3.1.1 → 3.1.2)
- Added recurring expenses feature → MINOR (3.1.2 → 3.2.0)
- Changed database schema for expenses table → MAJOR (3.2.0 → 4.0.0)

## Agent Reminder

When completing feature work or bug fixes, always ask: "Should I update the version number for this change?" and update all three locations if appropriate.
