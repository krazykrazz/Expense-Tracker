# CI/CD Troubleshooting Guide

**Last Updated**: February 12, 2026

Quick reference for diagnosing and resolving common CI/CD issues.

## Security Scanning Issues

### npm audit reports high/critical vulnerabilities

The `security-audit` job fails when `npm audit --audit-level=high` finds high or critical vulnerabilities.

**Steps:**
1. Check the workflow summary for the audit report (lists affected packages and severities)
2. Run locally to see details:
   ```bash
   cd backend && npm audit
   cd frontend && npm audit
   ```
3. Fix with `npm audit fix` if safe, or update the specific package
4. If a fix isn't available yet, consider adding to `.npmrc` with `audit-level` override as a temporary measure

### npm audit fails due to registry errors

If `npm audit` itself fails (not a vulnerability finding), the job uses `continue-on-error` so it won't block other jobs. Check the logs for network or registry issues.

### Trivy scan reports vulnerabilities in Docker image

The `build-and-push-ghcr` job fails when Trivy finds CRITICAL or HIGH vulnerabilities in the Docker image.

**Steps:**
1. Download the `trivy-scan-results` artifact from the workflow run
2. Review which packages/layers have vulnerabilities
3. Common fixes:
   - Update the base image in `Dockerfile` (e.g., newer Node.js alpine)
   - Update OS-level packages with `RUN apk upgrade` in Dockerfile
   - Update application dependencies
4. Rebuild and push

### Trivy tool failure (not vulnerability finding)

If Trivy itself crashes or times out, the step has `continue-on-error: true` so the image push continues. Check the logs for the specific error — usually a network issue downloading the vulnerability database.

### Dependabot PRs failing CI

Dependabot PRs run through the same CI checks. If they fail:
1. Check if the dependency update introduced breaking changes
2. Review the PR diff for major version bumps
3. Close the PR and manually update with testing if needed
4. Dependabot PRs skip the `security-audit` job (filtered by `github.actor != 'dependabot[bot]'`)

## Health Check Issues

### Health check fails after deployment

The `deployment-health-check` job runs after GHCR push and verifies the container works.

**Debugging steps:**
1. Check the workflow summary for which endpoint failed (backend `/api/health` or frontend `/`)
2. Expand the "Collect container logs on failure" step in the workflow run for container output
3. Common causes:
   - Application crash on startup (check container logs for errors)
   - Port binding issues (unlikely in CI, but check if port 2424 is in use)
   - Database initialization failure
   - Missing environment variables

### Health check passes locally but fails in CI

**Differences to check:**
- CI runs on `ubuntu-latest`, not Windows
- CI uses `NODE_ENV=production` and `LOG_LEVEL=info`
- No persistent volume is mounted in CI health checks
- The container starts fresh with no existing database

### Health check timeout

If the container takes too long to start:
1. The default timeout is 30s per request with 10 retries and exponential backoff
2. You can increase these via `workflow_dispatch` inputs:
   - `health_check_timeout`: HTTP timeout per request
   - `health_check_retries`: Number of retry attempts
3. Check if the application has slow startup (database migrations, etc.)

### Understanding health check retry output

The health check script (`scripts/health-check.sh`) logs each attempt:
```
Health check attempt 1/10 for http://localhost:2424/api/health
✗ Health check failed: returned 000
  Waiting 5s before retry (exponential backoff)...
Health check attempt 2/10 for http://localhost:2424/api/health
✗ Health check failed: returned 503
  Waiting 10s before retry...
```

- `000` = connection refused (container not ready yet)
- `503` = service unavailable (app starting up)
- `500` = server error (check container logs)

## Rollback Issues

### Rollback triggered automatically

When health checks fail, the workflow automatically rolls back to the previous image.

**What happened:**
1. New image was built and pushed to GHCR
2. Health checks failed on the new image
3. The workflow pulled the previous `:latest` image and redeployed it
4. Health checks ran on the rolled-back deployment

Check the "Rollback Results" section in the workflow summary for details.

### Rollback skipped — "no previous deployment available"

This happens on the first deployment or when no `:latest` tag exists in GHCR. The workflow fails with an error since there's nothing to roll back to. Fix the application issue and push again.

### Rollback health checks also failed

This is the worst case — both the new and previous deployments fail health checks.

**The workflow:**
1. Logs `::error::Rollback also failed - manual intervention required`
2. Halts all automated actions
3. Fails the workflow

**Manual recovery:**
1. Check the container logs from the workflow run
2. Identify what changed between the working and broken states
3. Fix the issue locally, push, and let CI rebuild

### Reviewing rollback audit trail

All rollback actions are logged with timestamps in the workflow output and summary:
- Rollback initiation timestamp
- Previous SHA being rolled back to
- Health check results on rolled-back deployment
- Final status (successful / failed)

Deployment metadata is also stored as a workflow artifact (`deployment-<sha>`) with status `rolled_back` and rollback details.

## Deployment State Issues

### Finding deployment history

Use the deployment history script:
```bash
./scripts/deployment-history.sh owner/repo 5
```

This queries GitHub Actions artifacts for the last N successful deployments. Requires `gh` CLI authenticated and `jq`.

### Deployment metadata missing

Deployment records are stored as GitHub Actions artifacts with 30-day retention. After 30 days, they're automatically deleted. The Docker image OCI labels (`org.opencontainers.image.version`, `org.opencontainers.image.revision`) persist with the image.

## Workflow Configuration

### Manually triggering the workflow

Go to Actions → CI → "Run workflow" and set:
- `health_check_timeout`: HTTP timeout in seconds (default: 30)
- `health_check_retries`: Retry attempts (default: 10)
- `enable_security_scan`: Toggle security scanning (default: true)

### Disabling security scanning temporarily

Set `enable_security_scan` to `false` when manually triggering the workflow. This is useful when a known vulnerability has no fix yet and is blocking deployments.

## General CI Issues

### Tests pass locally but fail in CI

See the main [GITHUB_ACTIONS_CICD.md](./GITHUB_ACTIONS_CICD.md#troubleshooting) troubleshooting section for test-specific issues.

### Re-running failed workflows

1. Go to the failed workflow run in the Actions tab
2. Click "Re-run all jobs" or "Re-run failed jobs"
3. Useful for transient failures (network timeouts, registry issues)

## Related Documentation

- [GitHub Actions CI/CD](./GITHUB_ACTIONS_CICD.md) - Full CI/CD documentation
- [CI Optimization Roadmap](./CI_OPTIMIZATION_ROADMAP.md) - Planned improvements
- [Feature Branch Workflow](./FEATURE_BRANCH_WORKFLOW.md) - Branch strategy
