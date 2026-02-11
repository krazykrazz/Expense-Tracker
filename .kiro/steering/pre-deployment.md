# Pre-Deployment Checklist

Before deploying, verify:

1. All tests pass (backend unit + PBT, frontend)
2. Frontend builds without errors: `cd frontend && npm run build`
3. Version numbers updated in all 5 locations (see `versioning.md`)
4. CHANGELOG.md updated
5. No hardcoded localhost URLs in production code
6. Database migrations are backward-compatible
7. New API endpoints have corresponding `frontend/src/config.js` entries

For the full deployment workflow, see `git-commits.md`.
