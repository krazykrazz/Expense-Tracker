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

## Docker Image Build and Push

When pushing to production, automatically:

1. Build using: `.\build-and-push.ps1 -Tag latest`
2. Push to `localhost:5000/expense-tracker:latest`
3. Report: image tag, version, git SHA, success/failure

### Skip Docker Build When:
- User says "skip docker" or "no docker"
- Changes are documentation-only
- Working on a feature branch (not main)

### Multi-Platform Builds
```powershell
.\build-and-push.ps1 -Tag latest -MultiPlatform
```

## What Constitutes a "Major Change"

- New features (MINOR version bump or higher)
- Breaking changes (MAJOR version bump)
- Database schema changes
- API changes

Minor changes (PATCH) may skip some checks at agent's discretion.
