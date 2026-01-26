#!/usr/bin/env bash
# End-to-end test script:
# 1) upload image to /api/uploads
# 2) create measurement job via /api/measurements
# 3) poll until job done and print final result
#
# Usage: ./scripts/e2e_measurement_test.sh ./test.jpg
set -euo pipefail
IMG=${1:-}
if [ -z "$IMG" ]; then
  echo "Usage: $0 path/to/test.jpg"
  exit 2
fi

API_HOST=${API_HOST:-http://localhost:4000}
echo "Using API host: $API_HOST"
echo "Uploading $IMG to /api/uploads..."

UPLOAD_RES=$(curl -s -w "\n%{http_code}" -X POST "${API_HOST}/api/uploads" -F "file=@${IMG}")
HTTP=$(echo "$UPLOAD_RES" | tail -n1)
BODY=$(echo "$UPLOAD_RES" | sed '$d')

if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
  echo "Upload failed: HTTP $HTTP"
  echo "$BODY"
  exit 1
fi

echo "Upload response: $BODY"
# extract key using jq if available
if command -v jq >/dev/null 2>&1; then
  KEY=$(echo "$BODY" | jq -r '.key')
else
  KEY=$(echo "$BODY" | sed -n 's/.*"key"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
fi
if [ -z "$KEY" ] || [ "$KEY" = "null" ]; then
  echo "Failed to parse upload key."
  exit 1
fi
echo "Uploaded key: $KEY"

echo "Enqueue measurement job..."
MEAS_RES=$(curl -s -X POST "${API_HOST}/api/measurements" -H "Content-Type: application/json" -d "{\"imageKey\":\"${KEY}\",\"vehicle\":{\"W\":1800,\"unit\":\"mm\"}}")
echo "Enqueue response: $MEAS_RES"
JOBID=$(echo "$MEAS_RES" | sed -n 's/.*"jobId"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' || true)
if [ -z "$JOBID" ]; then
  echo "Failed to get jobId from response. Full response:"
  echo "$MEAS_RES"
  exit 1
fi
echo "JobId: $JOBID"

echo "Polling for job result..."
TIMEOUT=180
INTERVAL=2
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep $INTERVAL
  ELAPSED=$((ELAPSED+INTERVAL))
  RES=$(curl -s "${API_HOST}/api/measurements/${JOBID}")
  STATUS=$(echo "$RES" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
  echo "[$ELAPSED] status: $STATUS"
  if [ "$STATUS" = "done" ]; then
    echo "Job done. Result:"
    echo "$RES" | jq .
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo "Job failed. Result:"
    echo "$RES" | jq .
    exit 2
  fi
done

echo "Timeout waiting for job result (${TIMEOUT}s)."
echo "Last response:"
curl -s "${API_HOST}/api/measurements/${JOBID}" | jq .
exit 3