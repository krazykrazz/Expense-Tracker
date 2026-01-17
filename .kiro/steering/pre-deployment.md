# Pre-Deployment Checklist

Before pushing any major changes to production, the agent should perform the following checks:

## Git Commit Policy

**IMPORTANT: Git commits are USER-CONTROLLED**

The agent should NOT automatically commit changes to git. Instead:

1. **Make all code changes** as requested
2. **Update version numbers** in all required locations
3. **Update CHANGELOG.md** and in-app changelog
4. **Build the frontend** if needed
5. **Build and push Docker image** if requested
6. **DO NOT run `git add` or `git commit`** - wait for the user to commit when ready

The user will decide when to commit and what commit message to use. This allows:
- Batching related fixes into single commits
- Better control over commit history
- Avoiding multiple small commits for iterative fixes

When work is complete, inform the user: "Changes are ready. You can commit when ready."

---

## 1. Specification Review

Check for any pending changes or updates to project specifications:

- Review all files in `.kiro/specs/` for any incomplete or draft specifications
- Look for any `requirements.md` files that have been modified but not implemented
- Check for any `design.md` files with pending design decisions
- Verify all `tasks.md` files have completed tasks or acknowledge incomplete work

## 2. Design Document Review

Ensure all design documents are up-to-date and aligned with implementation:

- Check that implemented features match their design documents
- Look for any design documents marked as "draft" or "in progress"
- Verify that any architectural changes have been documented
- Ensure API contracts and interfaces match the design specifications

## 3. Code Quality and Optimization

Review the codebase for any pending optimizations or refactors:
- Check for any TODO comments or FIXME markers in the code
- Look for duplicate code that should be refactored
- Review for any performance optimizations that were planned but not completed
- Check for any deprecated code or patterns that should be updated
- Verify error handling is consistent and complete
- Ensure logging is appropriate and not excessive

## 4. Documentation Files

Review project documentation for completeness:

- Check `OPTIMIZATION_FINAL_REPORT.md` for any pending optimizations
- Review `OPTIMIZATIONS_COMPLETE.md` for recently completed work
- Look at any spec summary files (e.g., `SPEC_UPDATES_SUMMARY.md`)
- Ensure README files are up-to-date

## 5. Testing

Verify testing coverage before deployment:

- Ensure all new features have appropriate tests
- Check that existing tests still pass
- Verify critical paths are covered by tests

## 6. Version and Changelog

Confirm version management is correct:

- Version numbers are updated in all required locations (see versioning.md)
- CHANGELOG.md has an entry for the new version
- Version bump type (MAJOR/MINOR/PATCH) is appropriate for the changes

## Feature Branch Integration

This checklist now integrates with the feature branch promotion model:

- **Feature Development**: Perform checks before promoting feature branch to main
- **Main Branch**: Perform checks before building and pushing Docker images
- **Hotfixes**: Perform abbreviated checks for critical fixes

## Agent Instructions

When the user requests to promote a feature branch or push to production:

1. **Automatically scan** the locations mentioned above
2. **Report findings** to the user if any issues are discovered:
   - Incomplete specifications
   - Pending design decisions
   - TODO/FIXME comments in changed files
   - Pending optimizations mentioned in documentation
3. **Ask for confirmation** if issues are found: "I found [X] items that may need attention before deployment. Would you like to proceed anyway, or address these first?"
4. **Proceed with deployment** only after user confirmation or if no issues are found

## Docker Image Build and Push (Automatic)

When the user requests to push to production, the agent MUST automatically:

1. **Build the Docker image** using the build-and-push.ps1 script
2. **Push to local registry** at localhost:5000/expense-tracker:latest
3. **Verify the push** was successful
4. **Report the image tag** and version to the user

### Build Command

Execute the following PowerShell command:

```powershell
.\build-and-push.ps1 -Tag latest
```

### What to Report

After building and pushing, inform the user:
- Image tag pushed (e.g., "localhost:5000/expense-tracker:latest")
- Version number from package.json
- Git commit SHA
- Success/failure status

### Error Handling

If the build or push fails:
1. Report the error to the user
2. Show the relevant error message from Docker
3. Ask if they want to retry or skip the Docker push
4. Do NOT proceed with other deployment steps until resolved

### When to Skip

Skip the Docker build and push if:
- The user explicitly says "skip docker" or "no docker"
- The changes are documentation-only (README, markdown files)
- The user is working on a feature branch (not main)

### Multi-Platform Builds

For production releases, consider using multi-platform builds:

```powershell
.\build-and-push.ps1 -Tag latest -MultiPlatform
```

Use multi-platform builds when:
- Deploying to multiple architectures (x86_64 and ARM64)
- User explicitly requests it
- Major version releases

## What Constitutes a "Major Change"

Consider a change major if it involves:

- New features (MINOR version bump or higher)
- Breaking changes (MAJOR version bump)
- Database schema changes
- API changes
- Architectural modifications
- Changes affecting multiple components or modules

Minor changes (PATCH version bumps like bug fixes or small UI tweaks) may skip some of these checks at the agent's discretion.
