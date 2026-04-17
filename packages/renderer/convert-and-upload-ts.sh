#!/bin/bash
# Download each MP4 chunk → convert to TS → upload TS → delete local
# Reliable but slow (~15-25 min per chunk depending on network)
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$PROJECT_DIR/.env" ]; then
  export AWS_ACCESS_KEY_ID=$(grep REMOTION_AWS_ACCESS_KEY_ID "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_SECRET_ACCESS_KEY=$(grep REMOTION_AWS_SECRET_ACCESS_KEY "$PROJECT_DIR/.env" | cut -d= -f2-)
else
  echo "ERROR: .env not found at $PROJECT_DIR/.env — set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY" >&2
  exit 1
fi
export AWS_DEFAULT_REGION=us-east-1
S3=remotionlambda-useast1-k7ca3krqhx
TMP=/tmp/ts-work
mkdir -p $TMP

for i in 01 02 03 04 05 06 07 08 09 10; do
  # Skip if already in S3
  exists=$(aws s3 ls s3://$S3/veneta-overlay-chunks/chunk-$i.ts 2>/dev/null)
  if [ -n "$exists" ]; then
    echo "chunk-$i.ts already in S3, skipping"
    continue
  fi

  echo "=== chunk-$i ==="
  echo "Downloading..."
  aws s3 cp s3://$S3/veneta-overlay-chunks/chunk-$i.mp4 $TMP/chunk-$i.mp4 --quiet
  ls -lh $TMP/chunk-$i.mp4

  echo "Converting to TS..."
  ffmpeg -y -i $TMP/chunk-$i.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts $TMP/chunk-$i.ts 2>&1 | tail -2
  ls -lh $TMP/chunk-$i.ts

  echo "Uploading TS..."
  aws s3 cp $TMP/chunk-$i.ts s3://$S3/veneta-overlay-chunks/chunk-$i.ts --quiet
  echo "Cleanup..."
  rm -f $TMP/chunk-$i.mp4 $TMP/chunk-$i.ts
  df -h / | tail -1 | awk '{print "  Disk:", $4, "free"}'
  echo ""
done
echo "=== ALL TS FILES UPLOADED ==="
