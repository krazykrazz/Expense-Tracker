# CI/CD Optimization Roadmap

**Last Updated**: February 28, 2026  
**Status**: Phase 1 In Progress

This document outlines planned optimizations and improvements for the CI/CD pipeline and deployment process.

## Current State

The project uses GitHub Actions for CI/CD with:
- Parallel test execution (backend unit, backend PBT sharded 3-way, frontend)
- Per-worker database isolation for parallel Jest execution
- Docker image builds with BuildKit caching
- SHA-based deployment workflow for immutable releases
- PR-based workflow with branch protection

## Optimization Categories

### 1. Test Execution Speed ⚡

**Current Performance**:
- Backend Unit Tests: ~60 test files, parallel workers
- Backend PBT Tests: 145 files across 3 shards, parallel workers per shard
- Frontend Tests: Vitest parallel execution

**Planned Optimizations**:

#### High Priority
- ✅ Already optimized: PBT sharding and parallel workers
- ✅ Already optimized: Per-worker database isolation
- ✅ Already optimized: Dependency caching via `setup-node` with `cache: 'npm'`
- ~~Test result caching for unchanged files~~ — Deprioritized: unlimited minutes on public repos makes the complexity not worth the ~2 min savings

#### Medium Priority
- Add test result annotations for better PR feedback
- Add code coverage tracking with Codecov

#### Low Priority
- Investigate test flakiness detection with retry logic

### 2. Docker Build Optimization 🐳

**Current State**:
- Uses BuildKit cache (GitHub Actions cache)
- Builds from scratch each time
- Multi-platform support available

**Planned Optimizations**:

#### High Priority
- Multi-stage build optimization in Dockerfile
- Separate dependency installation from build step

#### Medium Priority
- Layer caching improvements
- Build time tracking and reporting

#### Low Priority
- Investigate Docker layer compression

### 3. CI Workflow Improvements 🚀

**Planned Enhancements**:

#### High Priority
- ✅ Dependency caching (handled by `setup-node` with `cache: 'npm'`)
- ✅ Deployment health checks (automated in CI after GHCR push)
- ✅ Rollback capability (automatic on health check failure)
- ✅ Workflow status badge in README

#### Medium Priority
- Add PR size labeling
- Add build time tracking
- Add PR template for consistency
- Wire up or remove unused `enable_security_scan` workflow_dispatch input

#### Low Priority
- Add automated changelog generation
- Add automated version bumping

### 4. Deployment Process Improvements 📦

**Current State**:
- Manual PowerShell scripts for local deployment
- SHA-based immutable images
- Environment promotion (staging → latest)
- ✅ Automated health checks after GHCR push
- ✅ Automatic rollback on health check failure
- ✅ Deployment metadata stored as workflow artifacts (30-day retention)

**Planned Optimizations**:

#### High Priority
- ✅ Deployment status tracking (metadata artifacts with SHA, timestamp, version, health results)
- ✅ Deployment health verification (backend + frontend health checks)
- ✅ Rollback capability (automatic with post-rollback health verification)

#### Medium Priority
- Add deployment notifications
- Add deployment metrics
- Mount `/config` volume in rollback container to match main health check (rollback.sh currently omits it)

#### Low Priority
- Add automated deployment scheduling

### 5. Security Improvements 🔒

**Status**: In Progress (Phase 1)

The repository is now public, making security the highest priority. Most Phase 1 security items are implemented; Docker image scanning (Trivy) is still planned.

**Completed**:
- ✅ Dependency vulnerability scanning (`npm audit --audit-level=high` in CI security-audit job)
- ✅ Security policy documentation (`SECURITY.md`)
- ✅ Dependabot for automated dependency updates (npm + GitHub Actions)

**Planned**:
- Docker image scanning (Trivy) — not yet implemented in CI workflow

**Findings from Final Assessment** (ci-pipeline-hardening spec, Task 15):
- Rollback script (`scripts/rollback.sh`) does not mount `/config` volume when redeploying the rolled-back container, unlike the main health check container — may cause rollback health checks to fail if the app requires `/config` for SQLite initialization
- The `enable_security_scan` workflow_dispatch input is defined but never referenced in any job condition — dead input that should either be wired up or removed
- The `test-health-report` job exists in the workflow but is not documented in `GITHUB_ACTIONS_CICD.md`

**Future Enhancements** (Lower Priority):
- Add SAST (Static Application Security Testing)
- Add secret scanning alerts

### 6. Monitoring and Observability 📊

**Planned Enhancements**:

#### Medium Priority
- Add build time tracking
- Add test flakiness detection
- Add CI/CD metrics dashboard

#### Low Priority
- Add performance regression detection
- Add resource usage tracking

### 7. Documentation and Developer Experience 📚

**Planned Enhancements**:

#### High Priority
- ✅ Workflow status badge in README
- Add PR template
- Document `test-health-report` job in CI docs (exists in workflow but not documented)

#### Medium Priority
- ✅ CI/CD troubleshooting guide (`docs/development/CI_TROUBLESHOOTING.md`)
- Add performance optimization guide

#### Low Priority
- Add video tutorials for common workflows

### 8. Cost Optimization 💰

**Current State**:
- Using GitHub-hosted runners (free for public repos)
- Parallel execution reduces total time
- Dependency caching reduces network usage

**Planned Optimizations**:

#### Low Priority
- Investigate self-hosted runners (if repo becomes private)
- Optimize runner selection based on workload

## Implementation Priority

### Phase 1: Security & Deployment Safety (In Progress)
**Updated**: February 2026

1. **Security Hardening** (Partially Complete)
   - ✅ Dependency vulnerability scanning (`npm audit --audit-level=high` in CI security-audit job — added by ci-pipeline-hardening spec)
   - ⬜ Docker image scanning (Trivy) — planned, not yet implemented
   - ✅ Dependabot configuration (npm + GitHub Actions)
   - ✅ Security policy (SECURITY.md)

2. ✅ **Deployment Health Checks**
   - Automated health checks after GHCR push
   - Backend and frontend endpoint verification
   - Configurable retries with exponential backoff

3. ✅ **Rollback Capability**
   - Automatic rollback on health check failure
   - Post-rollback health verification
   - Operator alerting on rollback failure

4. ✅ **Deployment State Tracking**
   - Deployment metadata artifacts (30-day retention)
   - OCI image labels for traceability
   - Deployment history query script

5. ✅ **Workflow Status Badge**
   - CI badge in README linking to Actions page

### Phase 2: Quality of Life (Next Up)
**Target**: Q2 2026

1. **PR Size Labeling**
   - Automatic labels based on lines changed
   - Helps reviewers prioritize

2. **Build Time Tracking**
   - Track and report build times
   - Identify performance regressions

3. **PR Template**
   - Standardize PR descriptions
   - Checklist for common requirements

4. **Test Result Annotations**
   - Display test failures inline in PR
   - Faster debugging

### Phase 3: Nice to Have
**Target**: Q3-Q4 2026

1. **Code Coverage Tracking**
   - Track coverage trends over time
   - Prevent coverage regressions

2. **Automated Changelog**
   - Generate changelog from commits
   - Reduce manual documentation work

3. **SAST**
   - Static application security testing
   - Deeper code-level vulnerability detection

## Success Metrics

### Performance Metrics
- **CI Run Time**: Target <10 minutes for full suite
- **Test Execution Time**: Target <5 minutes per job
- **Docker Build Time**: Target <3 minutes
- **Deployment Time**: Target <2 minutes

### Quality Metrics
- **Test Flakiness Rate**: Target <1%
- **CI Failure Rate**: Target <5%
- **Deployment Success Rate**: Target >99%

### Developer Experience Metrics
- **Time to Feedback**: Target <5 minutes for PR checks
- **PR Merge Time**: Target <1 hour after approval
- **Rollback Time**: Target <5 minutes

## Related Documentation

- [GitHub Actions CI/CD](./GITHUB_ACTIONS_CICD.md) - Current CI/CD documentation
- [CI/CD Troubleshooting Guide](./CI_TROUBLESHOOTING.md) - Common issues and debugging steps
- [Feature Branch Workflow](./FEATURE_BRANCH_WORKFLOW.md) - Branch strategy
- [Deployment Workflow](../deployment/DEPLOYMENT_WORKFLOW.md) - Deployment process
- [SHA-Based Containers](../deployment/SHA_BASED_CONTAINERS.md) - Container strategy

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-28 | Final assessment (Task 15): fixed CI docs health check wait time (10s→30s), identified rollback /config gap, dead `enable_security_scan` input, undocumented `test-health-report` job | System |
| 2026-02-27 | Fix Phase 1 status: mark Trivy as planned, update npm audit description to match security-audit job implementation | System |
| 2026-02-12 | Phase 1 complete: security hardening, health checks, rollback, deployment tracking, badge | System |
| 2026-02-10 | Initial roadmap created | System |

