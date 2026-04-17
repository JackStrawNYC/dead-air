#!/bin/bash
# Stream chunks from S3, concat with audio, write directly to Google Drive
set -euo pipefail

DRIVE="/Users/chrisgardella/Library/CloudStorage/GoogleDrive-christopher.gardella@gmail.com/My Drive/dead-air-renders"
OUTPUT="$DRIVE/veneta-8-27-72-FINAL.mp4"
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

mkdir -p "$DRIVE"

# Generate signed URLs (4-hour expiry)
echo "=== Generating signed URLs ==="
> /tmp/video-concat.txt
for i in 01 02 03 04 05 06 07 08 09 10; do
  url=$(aws s3 presign "s3://remotionlambda-useast1-k7ca3krqhx/veneta-overlay-chunks/chunk-$i.mp4" --expires-in 14400)
  echo "file '$url'" >> /tmp/video-concat.txt
done

# Audio concat list
ls "$AUDIO_DIR"/gd72-08-27*.mp3 | sort | sed "s|.*|file '&'|" > /tmp/audio-concat.txt

echo "=== Streaming concat → Google Drive ==="
echo "Output: $OUTPUT"
ffmpeg -y -protocol_whitelist 'file,http,https,tcp,tls,pipe' \
  -f concat -safe 0 -i /tmp/video-concat.txt \
  -f concat -safe 0 -i /tmp/audio-concat.txt \
  -c:v copy -c:a aac -b:a 320k \
  -shortest \
  -progress /tmp/ffmpeg-progress.txt \
  "$OUTPUT" 2>/tmp/ffmpeg-stderr.txt

echo ""
echo "=== DONE ==="
ls -lh "$OUTPUT"
ffprobe -v quiet -show_format "$OUTPUT" 2>&1 | grep -E "duration|bit_rate" | head -2
