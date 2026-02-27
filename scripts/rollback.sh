#!/bin/bash
#
# Rollback Script
# Reverts a Docker deployment to a previous image version.
# Designed to run in CI (ubuntu runners), not on local Windows dev machines.
#
# Usage: ./scripts/rollback.sh <previous_sha> <registry> <image_name>
#
# Parameters:
#   previous_sha  - Required. The SHA tag or image tag to roll back to
#   registry      - Required. The container registry (e.g., ghcr.io/owner)
#   image_name    - Required. The image name (e.g., expense-tracker)
#
# Exit codes:
#   0 - Rollback deployment completed successfully
#   1 - Rollback failed
#   2 - Invalid arguments

set -euo pipefail

PREVIOUS_SHA="${1:-}"
REGISTRY="${2:-}"
IMAGE_NAME="${3:-}"
CONTAINER_NAME="${4:-expense-tracker-health-check}"

if [ -z "$PREVIOUS_SHA" ] || [ -z "$REGISTRY" ] || [ -z "$IMAGE_NAME" ]; then
  echo "::error::Usage: rollback.sh <previous_sha> <registry> <image_name> [container_name]"
  exit 2
fi

if [ "$PREVIOUS_SHA" = "none" ]; then
  echo "::error::No previous deployment SHA available for rollback"
  exit 1
fi

ROLLBACK_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ROLLBACK_IMAGE="$REGISTRY/$IMAGE_NAME:$PREVIOUS_SHA"

echo "============================================"
echo "  ROLLBACK INITIATED"
echo "============================================"
echo "  Timestamp:  $ROLLBACK_TIMESTAMP"
echo "  Target:     $ROLLBACK_IMAGE"
echo "  Container:  $CONTAINER_NAME"
echo "============================================"
echo ""

# Stop current container
echo "[$ROLLBACK_TIMESTAMP] Stopping current container: $CONTAINER_NAME"
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo "[$ROLLBACK_TIMESTAMP] Current container stopped"

# Pull previous version
echo "[$ROLLBACK_TIMESTAMP] Pulling previous image: $ROLLBACK_IMAGE"
if ! docker pull "$ROLLBACK_IMAGE"; then
  echo "::error::Failed to pull rollback image: $ROLLBACK_IMAGE"
  echo "[$ROLLBACK_TIMESTAMP] ROLLBACK FAILED: Could not pull image"
  exit 1
fi
echo "[$ROLLBACK_TIMESTAMP] Previous image pulled successfully"

# Deploy previous version
echo "[$ROLLBACK_TIMESTAMP] Starting rolled-back container"
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 2424:2424 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  "$ROLLBACK_IMAGE"

# Wait for container startup
# Must be ≥75% of Dockerfile HEALTHCHECK --start-period=40s
echo "[$ROLLBACK_TIMESTAMP] Waiting for container initialization..."
sleep 30

COMPLETION_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo ""
echo "[$COMPLETION_TIMESTAMP] Rollback deployment complete, verifying health..."
echo ""

exit 0
