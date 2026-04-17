#!/bin/bash
# Progressive download + concat for Veneta overlay render.
# Downloads each chunk from S3, adds to concat, deletes after read.
set -euo pipefail

CHUNK_DIR="/Users/chrisgardella/dead-air/packages/renderer/chunks"
OUTPUT="/Users/chrisgardella/dead-air/packages/renderer/veneta-8-27-72-FINAL.mp4"
S3=remotionlambda-useast1-k7ca3krqhx
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

mkdir -p "$CHUNK_DIR"
cd "$CHUNK_DIR"

# Download all chunks first, then concat (need them all on disk for ffmpeg concat demuxer)
# But progressive: download → if disk getting full, concat what we have, etc.
# Simpler: download all first since we have enough space if output is on different volume

echo "=== Step 1: Download all 10 chunks from S3 ==="
for i in 01 02 03 04 05 06 07 08 09 10; do
  if [ ! -f "chunk-$i.mp4" ]; then
    echo "Downloading chunk-$i..."
    aws s3 cp s3://$S3/veneta-overlay-chunks/chunk-$i.mp4 chunk-$i.mp4
    df -h / | tail -1 | awk '{print "  Disk:", $4, "free"}'
  else
    echo "chunk-$i already local"
  fi
done

echo ""
echo "=== Step 2: Build audio concat list ==="
ls "$AUDIO_DIR"/gd72-08-27*.mp3 | sort | sed "s|.*|file '&'|" > /tmp/audio-concat.txt

echo "=== Step 3: Build video concat list ==="
cat > /tmp/video-concat.txt << EOF
file '$CHUNK_DIR/chunk-01.mp4'
file '$CHUNK_DIR/chunk-02.mp4'
file '$CHUNK_DIR/chunk-03.mp4'
file '$CHUNK_DIR/chunk-04.mp4'
file '$CHUNK_DIR/chunk-05.mp4'
file '$CHUNK_DIR/chunk-06.mp4'
file '$CHUNK_DIR/chunk-07.mp4'
file '$CHUNK_DIR/chunk-08.mp4'
file '$CHUNK_DIR/chunk-09.mp4'
file '$CHUNK_DIR/chunk-10.mp4'
EOF

# Get cumulative chunk durations for progressive deletion
echo "=== Probing chunk durations for progressive deletion ==="
DUR=()
TOTAL=0
for i in 01 02 03 04 05 06 07 08 09 10; do
  d=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "chunk-$i.mp4" | cut -d. -f1)
  DUR+=($d)
  TOTAL=$((TOTAL + d))
  echo "  chunk-$i: ${d}s (cumulative: ${TOTAL}s)"
done

# Cumulative delete points (with 60s safety margin)
T01=$((${DUR[0]} + 60))
T02=$((T01 + ${DUR[1]} + 60))
T03=$((T02 + ${DUR[2]} + 60))
T04=$((T03 + ${DUR[3]} + 60))
T05=$((T04 + ${DUR[4]} + 60))
T06=$((T05 + ${DUR[5]} + 60))
T07=$((T06 + ${DUR[6]} + 60))
T08=$((T07 + ${DUR[7]} + 60))
T09=$((T08 + ${DUR[8]} + 60))

echo ""
echo "=== Step 4: Concat with progressive deletion ==="
ffmpeg -y -f concat -safe 0 -i /tmp/video-concat.txt \
  -f concat -safe 0 -i /tmp/audio-concat.txt \
  -c:v copy -c:a aac -b:a 320k \
  -shortest \
  -progress /tmp/ffmpeg-progress.txt \
  "$OUTPUT" 2>/tmp/ffmpeg-stderr.txt &

FFPID=$!
echo "ffmpeg PID: $FFPID"

# Track which chunks have been deleted
DEL01=false; DEL02=false; DEL03=false; DEL04=false; DEL05=false
DEL06=false; DEL07=false; DEL08=false; DEL09=false

while kill -0 $FFPID 2>/dev/null; do
  if [ -f /tmp/ffmpeg-progress.txt ]; then
    CURRENT=$(grep -o 'out_time_ms=[0-9]*' /tmp/ffmpeg-progress.txt | tail -1 | cut -d= -f2)
    if [ -n "$CURRENT" ]; then
      SECS=$((CURRENT / 1000000))

      if [ "$DEL01" = false ] && [ "$SECS" -gt "$T01" ]; then
        echo "  [${SECS}s] Past chunk-01 — deleting"; rm -f chunk-01.mp4; DEL01=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL02" = false ] && [ "$SECS" -gt "$T02" ]; then
        echo "  [${SECS}s] Past chunk-02 — deleting"; rm -f chunk-02.mp4; DEL02=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL03" = false ] && [ "$SECS" -gt "$T03" ]; then
        echo "  [${SECS}s] Past chunk-03 — deleting"; rm -f chunk-03.mp4; DEL03=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL04" = false ] && [ "$SECS" -gt "$T04" ]; then
        echo "  [${SECS}s] Past chunk-04 — deleting"; rm -f chunk-04.mp4; DEL04=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL05" = false ] && [ "$SECS" -gt "$T05" ]; then
        echo "  [${SECS}s] Past chunk-05 — deleting"; rm -f chunk-05.mp4; DEL05=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL06" = false ] && [ "$SECS" -gt "$T06" ]; then
        echo "  [${SECS}s] Past chunk-06 — deleting"; rm -f chunk-06.mp4; DEL06=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL07" = false ] && [ "$SECS" -gt "$T07" ]; then
        echo "  [${SECS}s] Past chunk-07 — deleting"; rm -f chunk-07.mp4; DEL07=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL08" = false ] && [ "$SECS" -gt "$T08" ]; then
        echo "  [${SECS}s] Past chunk-08 — deleting"; rm -f chunk-08.mp4; DEL08=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
      if [ "$DEL09" = false ] && [ "$SECS" -gt "$T09" ]; then
        echo "  [${SECS}s] Past chunk-09 — deleting"; rm -f chunk-09.mp4; DEL09=true
        df -h / | tail -1 | awk '{print "    Disk:", $4, "free"}'
      fi
    fi
  fi
  sleep 5
done

wait $FFPID
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo ""
  echo "=== DONE ==="
  echo "Output: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
  ffprobe -v quiet -show_format "$OUTPUT" 2>&1 | grep -E "duration|bit_rate" | head -2
  rm -f chunk-10.mp4  # cleanup last chunk
else
  echo "=== FAILED (exit $STATUS) ==="
  tail -20 /tmp/ffmpeg-stderr.txt
fi
