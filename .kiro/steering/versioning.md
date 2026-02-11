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
2. **Update all four application version locations**:
   - `frontend/package.json` - "version" field
   - `backend/package.json` - "version" field  
   - `frontend/src/App.jsx` - Footer version display
   - `frontend/src/components/BackupSettings.jsx` - In-app changelog section
3. **Update documentation version references** (see Documentation Updates section below)
4. **Keep versions synchronized** across all locations
5. **Document the change** in `CHANGELOG.md` following the Keep a Changelog format

## Documentation Updates

When releasing a new version, update version references in documentation files to keep examples current:

### Files to Update

1. **`docs/guides/DOCKER_DEPLOYMENT.md`**
   - Update version examples in "Available Tags" section
   - Update version in "Using Specific Versions" examples
   - Update version in docker-compose.yml examples
   - Update version in "Backup and Restore" date examples

2. **`docs/deployment/SHA_BASED_CONTAINERS.md`**
   - Update version examples in "Prerequisites: Version Bump on Main" section
   - Update SHA examples throughout (use actual release SHA)
   - Update version in "Build Image" output examples
   - Update version in "Best Practices" examples

3. **`docker-compose.ghcr.yml`**
   - Update version tag in image reference
   - Update SHA examples in comments

### Version Reference Guidelines

- Use the **current release version** in all examples (e.g., v5.10.0)
- Use the **actual release SHA** from the version bump commit
- Update **date examples** to reflect current year/month
- Keep examples **consistent** across all documentation files

### When to Update

- **Always** update documentation when deploying a new MINOR or MAJOR version
- **Optional** for PATCH versions unless examples are significantly outdated
- Update as part of the version bump commit before building the release

## Examples

- Added "Cheque" payment method → PATCH (3.1.0 → 3.1.1)
- Added collapsible tax deductible lists → PATCH (3.1.1 → 3.1.2)
- Added recurring expenses feature → MINOR (3.1.2 → 3.2.0)
- Changed database schema for expenses table → MAJOR (3.2.0 → 4.0.0)

## Automated Deployment Script

The `scripts/deploy-to-production.ps1` script automates the entire version bump and deployment process:

**What it does:**
1. Determines the new version based on bump type (MAJOR/MINOR/PATCH)
2. Updates all four version locations automatically
3. Updates CHANGELOG.md with new version entry
4. Builds the frontend with the new version
5. Commits the version bump changes
6. Creates a git tag (e.g., `v5.8.1`) marking the release commit
7. Pushes the tag to origin for easy version tracking
8. Builds and deploys to **local registry** (localhost:5000)

**Usage:**
```powershell
.\scripts\deploy-to-production.ps1 -BumpType PATCH -Description "Bug fixes"
.\scripts\deploy-to-production.ps1 -BumpType MINOR -Description "New feature"
.\scripts\deploy-to-production.ps1 -BumpType MAJOR -Description "Breaking changes"
```

**Git Tagging:**
- Each version bump creates an annotated git tag (e.g., `v5.8.1`)
- Tags mark the exact commit where the version was released
- Makes it easy to see version history: `git tag -l`
- Allows easy checkout of specific versions: `git checkout v5.8.1`
- Tags are automatically pushed to origin

**Public Releases (GHCR):**
- The local deployment script deploys to `localhost:5000` for internal use
- When you push the tag to GitHub, CI automatically:
  - Builds and pushes to GHCR (`ghcr.io/krazykrazz/expense-tracker`)
  - Creates a GitHub release with GHCR image references
  - Attaches a docker-compose file for public consumption
- GitHub releases always reference GHCR, not the local registry

## Agent Instructions

When the user requests to push changes to production, build for production, or deploy:

1. **Use the automated deployment script** - Run `.\scripts\deploy-to-production.ps1` with appropriate parameters

2. **Determine the version bump type** based on changes made:
   - MAJOR: Breaking changes, database schema changes requiring migration, API breaking changes
   - MINOR: New features, new endpoints, new UI components
   - PATCH: Bug fixes, UI tweaks, performance improvements, documentation updates

3. **Let the script handle everything** - It will:
   - Update all four version locations
   - Update CHANGELOG.md
   - Build the frontend
   - Commit changes
   - Create and push git tag
   - **Note**: Documentation version references should be updated manually (see Documentation Updates section)

4. **Manual version bumps** (only when not using the deployment script):
   - Update all four application version locations manually
   - Update documentation version references (see Documentation Updates section)
   - Update CHANGELOG.md
   - Rebuild the frontend
   - Commit: `git add -A && git commit -m "vX.Y.Z: description"`
   - Tag: `git tag -a "vX.Y.Z" -m "Release vX.Y.Z: description"`
   - Push tag: `git push origin vX.Y.Z`

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
