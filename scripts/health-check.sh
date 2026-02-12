#!/bin/bash
#
# Health Check Script
# Performs HTTP health checks with exponential backoff retry logic.
# Designed to run in CI (ubuntu runners), not on local Windows dev machines.
#
# Usage: ./scripts/health-check.sh <endpoint_url> [max_retries] [retry_delay] [timeout]
#
# Parameters:
#   endpoint_url  - Required. The URL to check (e.g., http://localhost:2424/api/health)
#   max_retries   - Optional. Number of retry attempts (default: 10)
#   retry_delay   - Optional. Initial delay between retries in seconds (default: 5)
#   timeout        - Optional. HTTP request timeout in seconds (default: 30)
#
# Exit codes:
#   0 - Health check passed (HTTP 200)
#   1 - Health check failed after all retries
#   2 - Invalid arguments

set -euo pipefail

ENDPOINT="${1:-}"
MAX_RETRIES="${2:-10}"
RETRY_DELAY="${3:-5}"
TIMEOUT="${4:-30}"

if [ -z "$ENDPOINT" ]; then
  echo "::error::Usage: health-check.sh <endpoint_url> [max_retries] [retry_delay] [timeout]"
  exit 2
fi

echo "Health check configuration:"
echo "  Endpoint:    $ENDPOINT"
echo "  Max retries: $MAX_RETRIES"
echo "  Retry delay: ${RETRY_DELAY}s (with exponential backoff)"
echo "  Timeout:     ${TIMEOUT}s"
echo ""

for i in $(seq 1 "$MAX_RETRIES"); do
  echo "Health check attempt $i/$MAX_RETRIES for $ENDPOINT"

  HTTP_CODE=$(curl -s -o /tmp/health_response.txt -w "%{http_code}" \
    --max-time "$TIMEOUT" "$ENDPOINT" 2>/dev/null) || HTTP_CODE="000"

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Health check passed: $ENDPOINT returned 200"
    if [ -f /tmp/health_response.txt ]; then
      echo "  Response: $(cat /tmp/health_response.txt)"
    fi
    exit 0
  fi

  echo "✗ Health check failed: $ENDPOINT returned $HTTP_CODE"
  if [ -f /tmp/health_response.txt ] && [ -s /tmp/health_response.txt ]; then
    echo "  Response body: $(cat /tmp/health_response.txt)"
  fi

  if [ "$i" -lt "$MAX_RETRIES" ]; then
    WAIT_TIME=$((RETRY_DELAY * (2 ** (i - 1))))
    echo "  Waiting ${WAIT_TIME}s before retry (exponential backoff)..."
    sleep "$WAIT_TIME"
  fi
done

echo ""
echo "::error::Health check failed after $MAX_RETRIES attempts for $ENDPOINT"
echo "  Last HTTP status: $HTTP_CODE"
exit 1
