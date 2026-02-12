#!/bin/bash
#
# Deployment History Query Script
# Queries GitHub Actions artifacts API to retrieve the last N successful deployments.
# Designed to run in CI (ubuntu runners) or locally with gh CLI authenticated.
#
# Usage: ./scripts/deployment-history.sh <repo> [count]
#
# Parameters:
#   repo   - Required. GitHub repository in owner/repo format
#   count  - Optional. Number of recent successful deployments to return (default: 5)
#
# Requires: gh CLI authenticated, jq
#
# Exit codes:
#   0 - Success
#   1 - Error
#   2 - Invalid arguments

set -euo pipefail

REPO="${1:-}"
COUNT="${2:-5}"

if [ -z "$REPO" ]; then
  echo "Usage: deployment-history.sh <owner/repo> [count]" >&2
  exit 2
fi

if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI is required but not installed" >&2
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed" >&2
  exit 1
fi

# Query artifacts with deployment- prefix, sorted by creation date
ARTIFACTS=$(gh api \
  -H "Accept: application/vnd.github+json" \
  "/repos/$REPO/actions/artifacts?per_page=100&name=deployment-" \
  --paginate 2>/dev/null || echo '{"artifacts":[]}')

# Extract deployment artifacts, download and filter successful ones
RESULTS="[]"
FOUND=0

# Get artifact IDs and names, sorted newest first
ARTIFACT_LIST=$(echo "$ARTIFACTS" | jq -r '.artifacts | sort_by(.created_at) | reverse | .[].id' 2>/dev/null || echo "")

for ARTIFACT_ID in $ARTIFACT_LIST; do
  if [ "$FOUND" -ge "$COUNT" ]; then
    break
  fi

  # Download artifact to temp dir
  TMPDIR=$(mktemp -d)
  if gh api "/repos/$REPO/actions/artifacts/$ARTIFACT_ID/zip" > "$TMPDIR/artifact.zip" 2>/dev/null; then
    if unzip -q -o "$TMPDIR/artifact.zip" -d "$TMPDIR" 2>/dev/null; then
      RECORD_FILE="$TMPDIR/deployment-record.json"
      if [ -f "$RECORD_FILE" ]; then
        STATUS=$(jq -r '.status // ""' "$RECORD_FILE" 2>/dev/null || echo "")
        if [ "$STATUS" = "success" ]; then
          RESULTS=$(echo "$RESULTS" | jq --slurpfile rec "$RECORD_FILE" '. + $rec')
          FOUND=$((FOUND + 1))
        fi
      fi
    fi
  fi
  rm -rf "$TMPDIR"
done

echo "$RESULTS" | jq '.'
