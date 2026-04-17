#!/bin/bash
# Stream chunks from S3 directly to ffmpeg concat — no local storage of chunks needed.
# Final output ~30-40 GB depending on bitrate.
set -euo pipefail

OUTPUT="/Users/chrisgardella/dead-air/packages/renderer/veneta-8-27-72-FINAL.mp4"
S3_PREFIX="https://remotionlambda-useast1-k7ca3krqhx.s3.amazonaws.com/veneta-overlay-chunks"
AUDIO_DIR="/Users/chrisgardella/dead-air/packages/visualizer-poc/public/audio/veneta-72"

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -f "$PROJECT_DIR/.env" ]; then
  export AWS_ACCESS_KEY_ID=$(grep REMOTION_AWS_ACCESS_KEY_ID "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_SECRET_ACCESS_KEY=$(grep REMOTION_AWS_SECRET_ACCESS_KEY "$PROJECT_DIR/.env" | cut -d= -f2-)
else
  echo "ERROR: .env not found at $PROJECT_DIR/.env — set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY" >&2
  exit 1
fi
export AWS_DEFAULT_REGION=us-east-1

# Generate signed URLs for each chunk (1-hour expiry)
echo "=== Generating signed URLs ==="
> /tmp/video-concat.txt
for i in 01 02 03 04 05 06 07 08 09 10; do
  url=$(aws s3 presign "s3://remotionlambda-useast1-k7ca3krqhx/veneta-overlay-chunks/chunk-$i.mp4" --expires-in 14400)
  echo "file '$url'" >> /tmp/video-concat.txt
done
cat /tmp/video-concat.txt | head -2
echo "..."

# Audio concat
ls "$AUDIO_DIR"/gd72-08-27*.mp3 | sort | sed "s|.*|file '&'|" > /tmp/audio-concat.txt

echo ""
echo "=== Concatenating (streaming from S3) ==="
ffmpeg -y -protocol_whitelist 'file,http,https,tcp,tls,pipe' \
  -f concat -safe 0 -i /tmp/video-concat.txt \
  -f concat -safe 0 -i /tmp/audio-concat.txt \
  -c:v copy -c:a aac -b:a 320k \
  -shortest \
  "$OUTPUT"

echo ""
echo "=== DONE ==="
ls -lh "$OUTPUT"
ffprobe -v quiet -show_format "$OUTPUT" 2>&1 | grep -E "duration|bit_rate" | head -2
