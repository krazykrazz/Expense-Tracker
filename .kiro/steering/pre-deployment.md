# Pre-Deployment Checklist

Before pushing major changes to production, run through this checklist. See `versioning.md` for version bump rules and `git-commits.md` for the deployment workflow.

## Checklist

- [ ] Check `.kiro/specs/` for incomplete or draft specifications
- [ ] Verify `tasks.md` files have completed tasks
- [ ] Check for TODO/FIXME comments in changed files
- [ ] Verify error handling is consistent
- [ ] Ensure logging uses the logger module (see `logging-best-practices.md`)
- [ ] Ensure new features have appropriate tests
- [ ] Verify existing tests pass

## Docker Image Build and Push (SHA-Based Workflow)

**CRITICAL**: Version bumps must happen on `main` AFTER feature branch merges, not before.

### Correct Deployment Workflow

1. **Merge feature branch to main** via PR (no version changes on feature branch)
2. **On main: Version bump**
   - Update `frontend/package.json`, `backend/package.json`, `frontend/src/App.jsx`
   - Update `CHANGELOG.md` and `frontend/src/components/BackupSettings.jsx`
   - Build frontend: `cd frontend && npm run build`
   - Commit: `git add -A && git commit -m "v5.8.1: Description"`
3. **Build SHA image**: `.\build-and-push.ps1` (builds with correct version)
4. **Deploy to staging**: `.\build-and-push.ps1 -Environment staging`
5. **Test in staging**, then promote to production: `.\build-and-push.ps1 -Environment production`

The same SHA-tagged image is used across all environments (build once, deploy everywhere).

**Why This Order Matters:**
- The version bump commit creates the "release SHA"
- The Docker image is built from this SHA and contains the correct version
- Same binary artifact (with correct version) moves through staging → production

### SHA-Based Workflow Benefits
- Build once, deploy to multiple environments
- Immutable SHA tags for traceability
- Fast rollbacks by retagging
- No "works in staging but not prod" issues

### Skip Docker Build When:
- User says "skip docker" or "no docker"
- Changes are documentation-only
- Working on a feature branch (not main)

### Multi-Platform Builds
```powershell
.\build-and-push.ps1 -MultiPlatform
```

### See Also
- Full SHA-based workflow documentation: `docs/deployment/SHA_BASED_CONTAINERS.md`
- Complete deployment workflow: `docs/deployment/DEPLOYMENT_WORKFLOW.md`
## What Constitutes a "Major Change"

- New features (MINOR version bump or higher)
- Breaking changes (MAJOR version bump)
- Database schema changes
- API changes

Minor changes (PATCH) may skip some checks at agent's discretion.
