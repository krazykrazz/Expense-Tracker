# Post-Merge Steps: CI Path-Based Test Filtering

**PR**: #187  
**Status**: Awaiting merge  
**Created**: March 2, 2026

## Overview

After PR #187 is merged and the path-based test filtering is live, these steps must be completed to fully activate the feature.

## Step 1: Monitor Initial PR Behavior

**When**: Immediately after merge

**Actions**:
1. Create a test PR with frontend-only changes
   - Verify backend tests are skipped
   - Check workflow summary shows correct filtering decision
   - Confirm status aggregator reports success

2. Create a test PR with backend-only changes
   - Verify frontend tests are skipped
   - Check workflow summary shows correct filtering decision
   - Confirm status aggregator reports success

3. Create a test PR with shared infrastructure changes (e.g., modify `Dockerfile`)
   - Verify all tests run
   - Check workflow summary indicates shared infrastructure triggered full tests

4. Create a test PR with documentation-only changes
   - Verify workflow doesn't trigger at all (paths-ignore working)

**Expected Results**:
- Frontend-only: Backend tests skipped, ~3-5 min CI time
- Backend-only: Frontend tests skipped, ~5-7 min CI time
- Shared changes: All tests run, ~8-10 min CI time
- Docs-only: No CI run

## Step 2: Update Branch Protection Rules

**When**: After at least one successful PR with new workflow (Step 1 complete)

**Actions**:
1. Go to GitHub repository settings → Branches → Branch protection rules for `main`

2. **Add new required status checks**:
   - `Backend Tests Status`
   - `Frontend Tests Status`

3. **Remove old required status checks**:
   - `Backend Unit Tests`
   - `Backend PBT Shard 1/3`
   - `Backend PBT Shard 2/3`
   - `Backend PBT Shard 3/3`
   - `Frontend Tests`

4. Verify the new checks appear in the branch protection settings

**Why**: The status aggregator jobs are designed to work with branch protection. They report success when tests are skipped, allowing PRs to merge even when tests don't run.

**Verification**:
- Create a frontend-only PR
- Confirm it can be merged even though backend tests were skipped
- Check that `Backend Tests Status` shows as passed (green checkmark)

## Step 3: Document Observed Savings

**When**: After 5-10 PRs have been merged with the new workflow

**Actions**:
1. Review CI run times for recent PRs
2. Calculate average time savings for single-component PRs
3. Update `docs/development/CI_OPTIMIZATION_ROADMAP.md` with actual metrics

**Metrics to Track**:
- Average CI time for frontend-only PRs (expected: 3-5 min, down from 8-10 min)
- Average CI time for backend-only PRs (expected: 5-7 min, down from 8-10 min)
- Percentage of PRs that benefit from filtering (expected: 60-70%)
- Total CI time saved per week

**Update Location**: `docs/development/CI_OPTIMIZATION_ROADMAP.md` → Phase 1 → Item 6

## Step 4: Update Steering Documentation (Optional)

**When**: After Step 2 is complete

**Actions**:
1. Update `.kiro/steering/git-commits.md` if needed
   - Update the "Required CI checks" section with new status check names
   - Currently lists old check names

**Current Text**:
```
Required CI checks: `Backend Unit Tests`, `Backend PBT Shard 1/3`, `Backend PBT Shard 2/3`, `Backend PBT Shard 3/3`, `Frontend Tests`
```

**New Text**:
```
Required CI checks: `Backend Tests Status`, `Frontend Tests Status`
```

## Troubleshooting

### Issue: Tests run when they should be skipped

**Possible Causes**:
- Shared infrastructure files in the PR
- Empty PR (no file changes)
- Path-filter job failed

**Debug**:
1. Check workflow summary for path filter results
2. Look for shared files in the PR (scripts/, Dockerfile, workflows, etc.)
3. Check path-filter job logs for errors

### Issue: PR blocked from merging despite tests being skipped

**Possible Causes**:
- Branch protection still requires old status checks
- Status aggregator job failed

**Fix**:
1. Complete Step 2 (update branch protection rules)
2. Check status aggregator job logs for errors
3. Verify aggregator jobs ran with `if: always()`

### Issue: Workflow doesn't trigger at all

**Possible Causes**:
- All changes match paths-ignore patterns (docs, markdown, steering)
- This is expected behavior

**Verification**:
- Check if PR only modifies docs/**, *.md, .kiro/steering/**, or CHANGELOG.md
- This is working as designed

## Rollback Plan

If path filtering causes issues:

1. **Quick Fix**: Temporarily disable filtering by removing conditionals from test jobs
   - Remove `needs: path-filter` from test jobs
   - Remove `if` conditions from test jobs
   - Keep status aggregator jobs (they'll always report success)

2. **Full Rollback**: Revert PR #187
   - Create revert PR: `gh pr create --title "Revert: CI path-based test filtering"`
   - Restore old branch protection rules

## Success Criteria

✅ All test scenarios in Step 1 pass  
✅ Branch protection updated (Step 2)  
✅ At least 5 PRs merged successfully with new workflow  
✅ No merge blocking issues reported  
✅ CI time savings documented (Step 3)

## Notes

- The path-filter job uses `dorny/paths-filter@v3` which is well-maintained
- Fail-safe approach: runs all tests on empty PRs, shared changes, or filter failures
- Status aggregators ensure branch protection compatibility
- All 36 property-based tests validate the filtering logic

## Related Documentation

- [CI Documentation](../../../docs/development/GITHUB_ACTIONS_CICD.md) - Updated with path filtering
- [CI Optimization Roadmap](../../../docs/development/CI_OPTIMIZATION_ROADMAP.md) - Marked complete
- [Requirements](./requirements.md) - Original requirements
- [Design](./design.md) - Technical design
- [Tasks](./tasks.md) - Implementation tasks
