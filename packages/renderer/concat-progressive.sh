#!/bin/bash
# Progressive concat — deletes chunks after ffmpeg reads past them to save disk space.
# Monitors ffmpeg time output vs chunk durations to know when each chunk is fully read.
set -euo pipefail

CHUNK_DIR="./chunks"
OUTPUT="veneta-8-27-72-full.mp4"
AUDIO_DIR="../visualizer-poc/public/audio/veneta-72"

# Get duration of each chunk (seconds)
echo "=== Dead Air — Veneta 8/27/72 Progressive Concat ==="
echo "Probing chunk durations..."

INTRO_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$CHUNK_DIR/intro.mp4" | cut -d. -f1)
CHUNK1_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$CHUNK_DIR/chunk-1.mp4" | cut -d. -f1)
CHUNK2_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$CHUNK_DIR/chunk-2.mp4" | cut -d. -f1)
CHUNK3_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$CHUNK_DIR/chunk-3.mp4" | cut -d. -f1)

echo "  intro: ${INTRO_DUR}s"
echo "  chunk-1: ${CHUNK1_DUR}s"
echo "  chunk-2: ${CHUNK2_DUR}s"
echo "  chunk-3: ${CHUNK3_DUR}s"

# Cumulative thresholds (with 30s safety margin past each boundary)
T1=$((INTRO_DUR + CHUNK1_DUR + 30))
T2=$((T1 + CHUNK2_DUR + 30))
T3=$((T2 + CHUNK3_DUR + 30))

echo "  Delete chunk-1 after ${T1}s, chunk-2 after ${T2}s, chunk-3 after ${T3}s"

# Build concat lists
cat > /tmp/concat-list.txt << EOF
file '$PWD/$CHUNK_DIR/intro.mp4'
file '$PWD/$CHUNK_DIR/chunk-1.mp4'
file '$PWD/$CHUNK_DIR/chunk-2.mp4'
file '$PWD/$CHUNK_DIR/chunk-3.mp4'
file '$PWD/$CHUNK_DIR/chunk-4.mp4'
EOF

ls "$PWD/$AUDIO_DIR"/gd72-08-27*.mp3 | sort | sed "s|.*|file '&'|" > /tmp/audio-concat.txt

echo ""
echo "Starting ffmpeg concat..."

# Run ffmpeg in background, monitoring progress
ffmpeg -y -f concat -safe 0 -i /tmp/concat-list.txt \
  -f concat -safe 0 -i /tmp/audio-concat.txt \
  -c:v copy -c:a aac -b:a 320k \
  -shortest \
  -progress /tmp/ffmpeg-progress.txt \
  "$OUTPUT" 2>/tmp/ffmpeg-stderr.txt &

FFPID=$!
echo "ffmpeg PID: $FFPID"

DELETED1=false
DELETED2=false
DELETED3=false

while kill -0 $FFPID 2>/dev/null; do
    # Parse current time from progress file
    if [ -f /tmp/ffmpeg-progress.txt ]; then
        CURRENT=$(grep -o 'out_time_ms=[0-9]*' /tmp/ffmpeg-progress.txt | tail -1 | cut -d= -f2)
        if [ -n "$CURRENT" ]; then
            SECS=$((CURRENT / 1000000))

            if [ "$DELETED1" = false ] && [ "$SECS" -gt "$T1" ]; then
                echo "  [${SECS}s] Past chunk-1 boundary — deleting chunk-1.mp4"
                rm -f "$CHUNK_DIR/chunk-1.mp4"
                DELETED1=true
                df -h / | tail -1 | awk '{print "  Disk:", $4, "free"}'
            fi

            if [ "$DELETED2" = false ] && [ "$SECS" -gt "$T2" ]; then
                echo "  [${SECS}s] Past chunk-2 boundary — deleting chunk-2.mp4"
                rm -f "$CHUNK_DIR/chunk-2.mp4"
                DELETED2=true
                df -h / | tail -1 | awk '{print "  Disk:", $4, "free"}'
            fi

            if [ "$DELETED3" = false ] && [ "$SECS" -gt "$T3" ]; then
                echo "  [${SECS}s] Past chunk-3 boundary — deleting chunk-3.mp4"
                rm -f "$CHUNK_DIR/chunk-3.mp4"
                DELETED3=true
                df -h / | tail -1 | awk '{print "  Disk:", $4, "free"}'
            fi
        fi
    fi
    sleep 5
done

wait $FFPID
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
    echo "=== Done ==="
    echo "Output: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
    ffprobe -v quiet -show_format "$OUTPUT" 2>&1 | grep -E "duration|bit_rate" | head -2
    # Clean up remaining chunks
    echo "Cleaning up remaining chunks..."
    rm -f "$CHUNK_DIR/intro.mp4" "$CHUNK_DIR/chunk-4.mp4"
else
    echo "=== FAILED (exit $STATUS) ==="
    tail -20 /tmp/ffmpeg-stderr.txt
fi
