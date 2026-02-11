# Design Document: CI/CD Optimization

## Overview

This design implements four high-priority optimizations to the GitHub Actions CI/CD pipeline: test result caching, deployment health checks, automated rollback capability, and dependency caching. These improvements will reduce CI feedback time by 30-50% for incremental changes, increase deployment confidence through automated verification, and provide safety through automatic rollback on failures.

The design leverages GitHub Actions' built-in caching mechanisms, Docker health checks, and workflow orchestration to achieve these goals while maintaining backward compatibility and graceful degradation.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Test Cache   │  │ Dependency   │  │ Deployment   │      │
│  │ Manager      │  │ Cache        │  │ Manager      │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         ├──────────────────┼──────────────────┤              │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼───────┐    │
│  │         GitHub Actions Cache Service                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Health Check Service                     │   │
│  │  - HTTP endpoint verification                         │   │
│  │  - Retry with exponential backoff                     │   │
│  │  - Multi-endpoint support                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Rollback Service                         │   │
│  │  - Previous deployment tracking                       │   │
│  │  - Automatic reversion                                │   │
│  │  - Post-rollback verification                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Test Execution with Caching**:
   - Workflow calculates cache keys based on file hashes
   - Attempts to restore cached test results
   - On cache hit: skips test execution, uses cached results
   - On cache miss: runs tests, stores results in cache

2. **Dependency Installation with Caching**:
   - Workflow calculates cache key from package-lock.json hash
   - Attempts to restore node_modules from cache
   - On cache hit: skips npm ci, uses cached dependencies
   - On cache miss: runs npm ci, stores node_modules in cache

3. **Deployment with Health Checks**:
   - Store current deployment SHA before deploying new version
   - Deploy new Docker image
   - Wait for container to start
   - Execute health checks with retry logic
   - On success: mark deployment complete
   - On failure: trigger rollback

4. **Rollback Workflow**:
   - Retrieve previous deployment SHA
   - Redeploy previous Docker image
   - Execute health checks on rolled-back deployment
   - On success: mark rollback complete
   - On failure: alert operators, halt automation

## Components and Interfaces

### 1. Test Cache Manager

**Purpose**: Manages test result caching to skip tests for unchanged code.

**Implementation**: GitHub Actions workflow steps with cache actions.

**Cache Key Strategy**:
```yaml
# Backend unit tests cache key
backend-unit-${{ hashFiles('backend/**/*.js', '!backend/**/*.test.js', 'backend/package-lock.json') }}

# Backend PBT tests cache key
backend-pbt-${{ hashFiles('backend/**/*.js', '!backend/**/*.pbt.test.js', 'backend/package-lock.json') }}

# Frontend tests cache key
frontend-${{ hashFiles('frontend/src/**/*.{js,jsx}', '!frontend/src/**/*.test.{js,jsx}', 'frontend/package-lock.json') }}
```

**Cache Storage Structure**:
```
cache/
├── test-results/
│   ├── backend-unit-{hash}/
│   │   ├── results.json
│   │   └── coverage/
│   ├── backend-pbt-{hash}/
│   │   ├── results.json
│   │   └── coverage/
│   └── frontend-{hash}/
│       ├── results.json
│       └── coverage/
```

**Workflow Integration**:
```yaml
- name: Restore test cache
  id: test-cache
  uses: actions/cache/restore@v4
  with:
    path: .test-cache
    key: backend-unit-${{ hashFiles('backend/**/*.js', '!backend/**/*.test.js', 'backend/package-lock.json') }}

- name: Run tests (if cache miss)
  if: steps.test-cache.outputs.cache-hit != 'true'
  run: npm run test:unit:ci

- name: Save test cache
  if: steps.test-cache.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with:
    path: .test-cache
    key: ${{ steps.test-cache.outputs.cache-primary-key }}
```

**Cache Invalidation Rules**:
- Source file changes → invalidate dependent test caches
- Test file changes → invalidate that specific test cache
- package.json or package-lock.json changes → invalidate all caches
- Manual workflow dispatch → option to bypass cache

### 2. Dependency Cache Manager

**Purpose**: Caches npm dependencies to speed up installation.

**Implementation**: GitHub Actions setup-node with built-in caching.

**Cache Key Strategy**:
```yaml
# Backend dependencies
backend-deps-${{ runner.os }}-${{ hashFiles('backend/package-lock.json') }}

# Frontend dependencies
frontend-deps-${{ runner.os }}-${{ hashFiles('frontend/package-lock.json') }}
```

**Workflow Integration**:
```yaml
- name: Setup Node.js with caching
  uses: actions/setup-node@v6
  with:
    node-version: '20'
    cache: 'npm'
    cache-dependency-path: backend/package-lock.json

- name: Install dependencies
  run: npm ci
```

**Fallback Behavior**:
- Cache restoration failure → proceed with npm ci
- Cache size limit exceeded → automatic pruning by GitHub Actions
- Network issues → retry with exponential backoff

### 3. Health Check Service

**Purpose**: Verifies deployed application is running correctly.

**Implementation**: Bash script executed in GitHub Actions workflow.

**Health Check Endpoints**:
```
Backend:  http://localhost:2424/api/health
Frontend: http://localhost:5173/
```

**Health Check Script** (`scripts/health-check.sh`):
```bash
#!/bin/bash

ENDPOINT=$1
MAX_RETRIES=${2:-10}
RETRY_DELAY=${3:-5}
TIMEOUT=${4:-30}

for i in $(seq 1 $MAX_RETRIES); do
  echo "Health check attempt $i/$MAX_RETRIES for $ENDPOINT"
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$ENDPOINT")
  
  if [ "$RESPONSE" = "200" ]; then
    echo "✓ Health check passed: $ENDPOINT returned 200"
    exit 0
  fi
  
  echo "✗ Health check failed: $ENDPOINT returned $RESPONSE"
  
  if [ $i -lt $MAX_RETRIES ]; then
    WAIT_TIME=$((RETRY_DELAY * (2 ** (i - 1))))  # Exponential backoff
    echo "Waiting ${WAIT_TIME}s before retry..."
    sleep $WAIT_TIME
  fi
done

echo "✗ Health check failed after $MAX_RETRIES attempts"
exit 1
```

**Workflow Integration**:
```yaml
- name: Wait for container startup
  run: sleep 10

- name: Health check backend
  run: ./scripts/health-check.sh http://localhost:2424/api/health 10 5 30

- name: Health check frontend
  run: ./scripts/health-check.sh http://localhost:5173/ 10 5 30
```

**Configuration Parameters**:
- `MAX_RETRIES`: Number of retry attempts (default: 10)
- `RETRY_DELAY`: Initial delay between retries in seconds (default: 5)
- `TIMEOUT`: HTTP request timeout in seconds (default: 30)
- Exponential backoff: delay doubles on each retry

### 4. Rollback Service

**Purpose**: Automatically reverts to previous deployment on health check failure.

**Implementation**: GitHub Actions workflow with deployment state tracking.

**Deployment State Storage**:
```yaml
# Store current deployment before deploying new version
- name: Store current deployment
  run: |
    CURRENT_SHA=$(docker inspect --format='{{.Config.Image}}' expense-tracker | cut -d':' -f2)
    echo "PREVIOUS_SHA=$CURRENT_SHA" >> $GITHUB_ENV
    echo "Previous deployment SHA: $CURRENT_SHA"
```

**Rollback Workflow**:
```yaml
- name: Rollback on health check failure
  if: failure()
  run: |
    echo "Health checks failed, initiating rollback to $PREVIOUS_SHA"
    
    # Stop current container
    docker-compose down
    
    # Deploy previous version
    docker pull localhost:5000/expense-tracker:$PREVIOUS_SHA
    docker tag localhost:5000/expense-tracker:$PREVIOUS_SHA localhost:5000/expense-tracker:latest
    docker-compose up -d
    
    # Wait for rollback container to start
    sleep 10
    
    # Verify rollback health
    ./scripts/health-check.sh http://localhost:2424/api/health 5 5 30
    
    if [ $? -eq 0 ]; then
      echo "✓ Rollback successful"
    else
      echo "✗ Rollback health checks failed - manual intervention required"
      exit 1
    fi
```

**Rollback Logging**:
```yaml
- name: Log rollback action
  if: failure()
  run: |
    echo "ROLLBACK_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> $GITHUB_ENV
    echo "ROLLBACK_REASON=Health check failure" >> $GITHUB_ENV
    echo "ROLLBACK_FROM=${{ github.sha }}" >> $GITHUB_ENV
    echo "ROLLBACK_TO=$PREVIOUS_SHA" >> $GITHUB_ENV
```

### 5. Deployment State Tracker

**Purpose**: Maintains history of deployments for rollback and audit purposes.

**Implementation**: GitHub Actions artifacts and environment variables.

**Deployment Metadata Structure**:
```json
{
  "sha": "abc123",
  "timestamp": "2026-02-10T14:30:00Z",
  "environment": "production",
  "version": "5.10.0",
  "status": "success",
  "health_checks": {
    "backend": "passed",
    "frontend": "passed"
  }
}
```

**Storage Mechanism**:
```yaml
- name: Record deployment
  run: |
    cat > deployment-record.json <<EOF
    {
      "sha": "${{ github.sha }}",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "environment": "${{ inputs.environment }}",
      "version": "$(jq -r .version backend/package.json)",
      "status": "success"
    }
    EOF

- name: Upload deployment record
  uses: actions/upload-artifact@v4
  with:
    name: deployment-${{ github.sha }}
    path: deployment-record.json
    retention-days: 30
```

### 6. Cache Statistics Reporter

**Purpose**: Provides visibility into cache effectiveness.

**Implementation**: Workflow summary generation.

**Statistics Collected**:
- Cache hit rate (percentage)
- Time saved by cache hits
- Cache size
- Cache key generation details

**Workflow Integration**:
```yaml
- name: Generate cache statistics
  run: |
    echo "## Cache Statistics" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "| Cache Type | Status | Time Saved |" >> $GITHUB_STEP_SUMMARY
    echo "|------------|--------|------------|" >> $GITHUB_STEP_SUMMARY
    
    if [ "${{ steps.test-cache.outputs.cache-hit }}" = "true" ]; then
      echo "| Test Results | ✓ Hit | ~2 minutes |" >> $GITHUB_STEP_SUMMARY
    else
      echo "| Test Results | ✗ Miss | 0 minutes |" >> $GITHUB_STEP_SUMMARY
    fi
    
    if [ "${{ steps.node-cache.outputs.cache-hit }}" = "true" ]; then
      echo "| Dependencies | ✓ Hit | ~1 minute |" >> $GITHUB_STEP_SUMMARY
    else
      echo "| Dependencies | ✗ Miss | 0 minutes |" >> $GITHUB_STEP_SUMMARY
    fi
```

## Data Models

### Cache Key Model

```typescript
interface CacheKey {
  prefix: string;           // "backend-unit", "backend-pbt", "frontend"
  contentHash: string;      // Hash of source files
  dependencyHash: string;   // Hash of package-lock.json
  version: string;          // Cache format version
}

function generateCacheKey(config: CacheKeyConfig): string {
  return `${config.prefix}-${config.contentHash}-${config.dependencyHash}-v${config.version}`;
}
```

### Deployment Record Model

```typescript
interface DeploymentRecord {
  sha: string;              // Git commit SHA
  timestamp: string;        // ISO 8601 timestamp
  environment: string;      // "staging" | "production"
  version: string;          // Application version
  status: string;           // "success" | "failed" | "rolled_back"
  healthChecks: {
    backend: string;        // "passed" | "failed"
    frontend: string;       // "passed" | "failed"
  };
  rollbackInfo?: {
    previousSha: string;
    reason: string;
    timestamp: string;
  };
}
```

### Health Check Result Model

```typescript
interface HealthCheckResult {
  endpoint: string;
  status: number;           // HTTP status code
  responseTime: number;     // Milliseconds
  attempt: number;          // Retry attempt number
  timestamp: string;        // ISO 8601 timestamp
  success: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cache Invalidation Consistency

*For any* set of file changes, when source files, test files, or dependencies change, the cache invalidation logic should correctly identify all affected test caches and mark them for re-execution, ensuring no stale test results are used.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: Dependency Cache Restoration

*For any* unchanged package-lock.json file, restoring dependencies from cache should produce an identical node_modules directory to running npm ci, ensuring deterministic builds.

**Validates: Requirements 4.2, 4.3**

### Property 3: Health Check Retry Behavior

*For any* health check configuration, the retry logic should attempt exactly the configured number of retries with exponential backoff delays, and should only succeed when receiving a 200 status code.

**Validates: Requirements 2.4, 2.5**

### Property 4: Health Check Workflow Completeness

*For any* deployment, when the container is running, health checks should be performed on all configured endpoints (backend and frontend), and deployment should only be marked successful when all endpoints return 200 status codes.

**Validates: Requirements 2.1, 2.2, 2.3, 2.6**

### Property 5: Rollback Workflow Correctness

*For any* failed deployment, the rollback workflow should store the previous SHA before deployment, redeploy the previous image on health check failure, perform health checks on the rolled-back deployment, and mark rollback as successful only when health checks pass.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 6: Rollback Failure Handling

*For any* rollback that fails health checks, the system should alert operators, log the failure with timestamps and reasons, and halt further automated actions without retrying indefinitely.

**Validates: Requirements 3.6, 3.7**

### Property 7: Cache Failure Fallback

*For any* cache restoration failure (test cache or dependency cache), the workflow should fall back to running tests or npm ci without failing the build, ensuring the pipeline remains functional even when caching is unavailable.

**Validates: Requirements 1.6, 4.5, 7.1, 7.2**

### Property 8: Deployment Metadata Persistence

*For any* successful deployment, the system should store deployment metadata including SHA, timestamp, environment, version, and health check results, and this metadata should be retrievable for at least 30 days.

**Validates: Requirements 6.1, 6.2, 6.4, 6.5**

### Property 9: Deployment History Query

*For any* query for deployment history with parameter N, the system should return exactly the last N successful deployments ordered by timestamp descending, with complete metadata for each deployment.

**Validates: Requirements 6.3**

### Property 10: Environment-Specific Health Check Behavior

*For any* non-production environment, when health check endpoints are unreachable, the system should log warnings but not fail the build, while for production environments, unreachable endpoints should fail the build.

**Validates: Requirements 7.3**

### Property 11: Transient vs Permanent Failure Classification

*For any* failure during deployment or rollback, the system should classify it as either transient (network timeout, temporary unavailability) or permanent (invalid configuration, missing resources), retrying only transient failures and alerting immediately for permanent failures.

**Validates: Requirements 7.5**

### Property 12: Configuration Flexibility

*For any* workflow execution, configurable parameters (health check timeout, retry count, cache retention) should be respected, and the system should use sensible defaults when parameters are not provided.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 13: Cache Statistics Accuracy

*For any* workflow run, cache statistics reported in workflow summaries should accurately reflect the actual cache hit/miss status for test results and dependencies, and time saved calculations should be based on measured execution times.

**Validates: Requirements 5.1, 5.2**

### Property 14: Cache Size Management

*For any* cache that exceeds GitHub Actions size limits (10GB per repository), the system should automatically prune old cache entries based on least-recently-used policy, ensuring the cache remains functional.

**Validates: Requirements 5.3**

## Error Handling

### Cache Errors

**Scenario**: Cache restoration fails due to network issues or corrupted cache.

**Handling**:
1. Log warning with cache key and error details
2. Proceed with full test execution or npm ci
3. Report cache miss in statistics
4. Do not fail the workflow

**Example**:
```yaml
- name: Restore cache with error handling
  id: cache
  uses: actions/cache/restore@v4
  with:
    path: .test-cache
    key: ${{ steps.cache-key.outputs.key }}
  continue-on-error: true

- name: Run tests (always)
  run: npm run test:unit:ci
```

### Health Check Errors

**Scenario**: Health check endpoint returns non-200 status or times out.

**Handling**:
1. Log detailed error (status code, response body, timing)
2. Retry with exponential backoff up to configured limit
3. If all retries fail, trigger rollback
4. Alert operators via workflow failure notification

**Example**:
```bash
if [ "$RESPONSE" != "200" ]; then
  echo "Health check failed: HTTP $RESPONSE"
  echo "Response body: $(curl -s $ENDPOINT)"
  echo "Attempt $i of $MAX_RETRIES"
fi
```

### Rollback Errors

**Scenario**: Rollback deployment fails or rolled-back deployment fails health checks.

**Handling**:
1. Log rollback failure with full context
2. Do not retry rollback automatically
3. Fail the workflow with clear error message
4. Require manual operator intervention
5. Send notification to configured channels

**Example**:
```yaml
- name: Handle rollback failure
  if: failure()
  run: |
    echo "::error::Rollback failed - manual intervention required"
    echo "Previous SHA: $PREVIOUS_SHA"
    echo "Failed SHA: ${{ github.sha }}"
    echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    exit 1
```

### Deployment State Errors

**Scenario**: Unable to store or retrieve deployment metadata.

**Handling**:
1. Log warning about metadata storage failure
2. Continue with deployment (metadata is for audit, not critical)
3. Attempt to store metadata in workflow logs as fallback
4. Do not fail the workflow

**Example**:
```yaml
- name: Store deployment metadata
  run: |
    cat > deployment-record.json <<EOF
    {...}
    EOF
  continue-on-error: true
```

### Configuration Errors

**Scenario**: Invalid configuration parameters (negative timeout, invalid environment).

**Handling**:
1. Validate configuration at workflow start
2. Fail fast with clear error message
3. Provide guidance on valid values
4. Do not proceed with invalid configuration

**Example**:
```yaml
- name: Validate configuration
  run: |
    if [ "${{ inputs.timeout }}" -lt 1 ]; then
      echo "::error::Invalid timeout: must be positive integer"
      exit 1
    fi
```

## Testing Strategy

### Unit Tests

**Test Cache Manager**:
- Cache key generation with various file combinations
- Cache invalidation logic for different change scenarios
- Cache statistics calculation accuracy
- Error handling for cache restoration failures

**Health Check Service**:
- HTTP request execution with various status codes
- Retry logic with exponential backoff timing
- Timeout handling
- Multi-endpoint verification
- Error logging format and content

**Rollback Service**:
- Previous SHA storage and retrieval
- Rollback execution steps
- Post-rollback health check verification
- Failure handling and operator alerts

**Deployment State Tracker**:
- Metadata serialization and deserialization
- Deployment history queries with various N values
- Retention policy enforcement
- Artifact upload and download

### Property-Based Tests

**Property 1: Cache Invalidation Consistency**
- Generate random file change sets
- Verify cache invalidation matches expected behavior
- Test with source files, test files, and dependency changes
- Minimum 100 iterations

**Property 2: Dependency Cache Restoration**
- Generate random package-lock.json files
- Verify cache restoration produces identical node_modules
- Test with various dependency configurations
- Minimum 100 iterations

**Property 3: Health Check Retry Behavior**
- Generate random retry configurations
- Verify retry count and backoff timing
- Test with various HTTP status codes
- Minimum 100 iterations

**Property 4: Health Check Workflow Completeness**
- Generate random endpoint configurations
- Verify all endpoints are checked
- Test with various success/failure combinations
- Minimum 100 iterations

**Property 5: Rollback Workflow Correctness**
- Generate random deployment scenarios
- Verify rollback steps execute in correct order
- Test with various health check outcomes
- Minimum 100 iterations

**Property 6: Rollback Failure Handling**
- Generate random rollback failure scenarios
- Verify alerts are sent and automation halts
- Test with various failure types
- Minimum 100 iterations

**Property 7: Cache Failure Fallback**
- Generate random cache failure scenarios
- Verify workflow continues without caching
- Test with various failure types
- Minimum 100 iterations

**Property 8: Deployment Metadata Persistence**
- Generate random deployment records
- Verify metadata is stored and retrievable
- Test with various metadata fields
- Minimum 100 iterations

**Property 9: Deployment History Query**
- Generate random deployment histories
- Verify query returns correct N deployments
- Test with various N values
- Minimum 100 iterations

**Property 10: Environment-Specific Health Check Behavior**
- Generate random environment configurations
- Verify production vs non-production behavior differs
- Test with various failure scenarios
- Minimum 100 iterations

**Property 11: Transient vs Permanent Failure Classification**
- Generate random failure scenarios
- Verify correct classification and retry behavior
- Test with various failure types
- Minimum 100 iterations

**Property 12: Configuration Flexibility**
- Generate random configuration values
- Verify parameters are respected
- Test with defaults and custom values
- Minimum 100 iterations

**Property 13: Cache Statistics Accuracy**
- Generate random cache hit/miss scenarios
- Verify statistics match actual behavior
- Test with various cache configurations
- Minimum 100 iterations

**Property 14: Cache Size Management**
- Generate random cache sizes
- Verify pruning occurs at size limits
- Test with various cache entry counts
- Minimum 100 iterations

### Integration Tests

**End-to-End Deployment with Health Checks**:
1. Deploy new version
2. Verify health checks execute
3. Verify deployment marked successful
4. Verify deployment metadata stored

**End-to-End Rollback**:
1. Deploy version that fails health checks
2. Verify rollback triggers automatically
3. Verify previous version deployed
4. Verify rollback health checks execute
5. Verify rollback metadata stored

**Cache Effectiveness**:
1. Run workflow with no changes
2. Verify cache hits for tests and dependencies
3. Verify time savings reported
4. Make changes and verify cache invalidation

**Graceful Degradation**:
1. Simulate cache service unavailable
2. Verify workflow completes successfully
3. Verify tests run without caching
4. Verify appropriate warnings logged

### Test Configuration

All property-based tests should:
- Run minimum 100 iterations
- Use fast-check library for JavaScript/TypeScript
- Tag tests with feature name and property number
- Include clear failure messages with counterexamples

Example test tag:
```javascript
// Feature: ci-optimization, Property 1: Cache invalidation consistency
test('cache invalidation for file changes', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string()),  // Changed files
      (changedFiles) => {
        const invalidatedCaches = calculateInvalidatedCaches(changedFiles);
        // Verify invalidation logic
      }
    ),
    { numRuns: 100 }
  );
});
```

## Implementation Notes

### GitHub Actions Limitations

- Cache size limit: 10GB per repository
- Cache retention: 7 days for unused caches
- Workflow run time limit: 6 hours
- Artifact retention: configurable, default 90 days

### Performance Targets

- Test cache hit: ~2 minutes saved per workflow
- Dependency cache hit: ~1 minute saved per workflow
- Health check execution: <30 seconds per endpoint
- Rollback execution: <2 minutes total
- Total CI time reduction: 30-50% for incremental changes

### Security Considerations

- Cache keys include content hashes to prevent cache poisoning
- Health check endpoints should not expose sensitive information
- Deployment metadata should not include secrets
- Rollback should verify image signatures before deployment

### Monitoring and Observability

- Cache hit rates tracked in workflow summaries
- Health check timing logged for performance analysis
- Rollback events logged with full context
- Deployment history queryable for audit purposes

### Future Enhancements

- Code coverage tracking with trend analysis
- Test flakiness detection and reporting
- Automated dependency vulnerability scanning
- Performance regression detection
- Self-hosted runner support for faster execution
