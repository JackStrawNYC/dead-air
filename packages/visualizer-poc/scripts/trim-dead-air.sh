#!/bin/bash
# trim-dead-air.sh — Trim trailing silence from MP3 files.
#
# For each MP3 in the target directory:
#   1. Detect silence using ffmpeg silencedetect filter
#   2. Find the last non-silent audio timestamp
#   3. Trim to 10 seconds after the last non-silent audio
#   4. Overwrite the original file
#
# Usage:
#   ./scripts/trim-dead-air.sh [directory]
#   ./scripts/trim-dead-air.sh public/audio/veneta-72/
#
# Default: public/audio/veneta-72/

set -e

AUDIO_DIR="${1:-public/audio/veneta-72}"
PADDING_SEC=10  # seconds to keep after last sound
SILENCE_THRESHOLD="-50dB"  # silence detection threshold
SILENCE_DURATION="3"  # minimum silence duration to detect (seconds)

cd /Users/chrisgardella/dead-air/packages/visualizer-poc

if [ ! -d "$AUDIO_DIR" ]; then
  echo "ERROR: Directory not found: $AUDIO_DIR"
  exit 1
fi

TRIMMED=0
SKIPPED=0
TOTAL=0

echo "Scanning for trailing silence in $AUDIO_DIR ..."
echo "Silence threshold: $SILENCE_THRESHOLD, min duration: ${SILENCE_DURATION}s"
echo "Padding after last sound: ${PADDING_SEC}s"
echo ""

for MP3 in "$AUDIO_DIR"/*.mp3; do
  [ -f "$MP3" ] || continue
  TOTAL=$((TOTAL + 1))
  BASENAME=$(basename "$MP3")

  # Get total duration
  DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$MP3" 2>/dev/null)
  if [ -z "$DURATION" ]; then
    echo "  SKIP: $BASENAME (can't read duration)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Detect silence periods
  SILENCE_OUTPUT=$(ffmpeg -i "$MP3" -af "silencedetect=noise=$SILENCE_THRESHOLD:d=$SILENCE_DURATION" -f null - 2>&1)

  # Find the last silence_start timestamp (= when the final silence begins)
  LAST_SILENCE_START=$(echo "$SILENCE_OUTPUT" | grep "silence_start:" | tail -1 | sed 's/.*silence_start: //' | awk '{print $1}')

  if [ -z "$LAST_SILENCE_START" ]; then
    echo "  OK: $BASENAME — no trailing silence detected (${DURATION}s)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Calculate trim point: last sound + padding
  TRIM_TO=$(echo "$LAST_SILENCE_START + $PADDING_SEC" | bc)

  # Only trim if we'd save at least 5 seconds
  SAVINGS=$(echo "$DURATION - $TRIM_TO" | bc)
  WOULD_SAVE=$(echo "$SAVINGS > 5" | bc)

  if [ "$WOULD_SAVE" -eq 0 ]; then
    echo "  OK: $BASENAME — trailing silence < 5s (${DURATION}s total)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  TRIM: $BASENAME — ${DURATION}s -> ${TRIM_TO}s (saving ${SAVINGS}s)"

  # Trim using stream copy (no re-encoding, fast)
  TEMP_FILE="${MP3}.trimmed.mp3"
  ffmpeg -y -i "$MP3" -t "$TRIM_TO" -c copy "$TEMP_FILE" 2>/dev/null

  # Verify the trimmed file is valid
  TRIMMED_DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TEMP_FILE" 2>/dev/null)
  if [ -n "$TRIMMED_DURATION" ]; then
    mv "$TEMP_FILE" "$MP3"
    TRIMMED=$((TRIMMED + 1))
  else
    echo "    ERROR: Trimmed file invalid, keeping original"
    rm -f "$TEMP_FILE"
    SKIPPED=$((SKIPPED + 1))
  fi
done

echo ""
echo "Done: $TRIMMED trimmed, $SKIPPED unchanged, $TOTAL total"
