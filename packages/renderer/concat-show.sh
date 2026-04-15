#!/bin/bash
# Concat Veneta 8/27/72 show from 4 vast.ai chunks + local intro
#
# Usage: ./concat-show.sh <output.mp4> [audio.mp3]
#
# Prerequisites:
#   1. Download chunks from vast.ai instances:
#      scp -P 16890 root@ssh6.vast.ai:/root/chunk-1.mp4 ./chunks/
#      scp -P 16892 root@ssh6.vast.ai:/root/chunk-3.mp4 ./chunks/
#      scp -P 19630 root@ssh2.vast.ai:/root/chunk-4.mp4 ./chunks/
#      scp -P 23320 root@ssh5.vast.ai:/root/chunk-2.mp4 ./chunks/
#
#   2. Render the intro locally:
#      cargo run --release -- --manifest <manifest> -o chunks/intro.mp4 \
#        --width 3840 --height 2160 --fps 60 --with-intro \
#        --show-venue "Old Renaissance Faire Grounds" \
#        --show-city "Veneta, OR" \
#        --show-date "August 27, 1972" \
#        --show-era primal --show-seed 0.827 \
#        --end-frame 1  # just the intro frames

set -euo pipefail

OUTPUT="${1:-veneta-8-27-72-full.mp4}"
AUDIO="${2:-}"
CHUNK_DIR="./chunks"

echo "=== Dead Air — Veneta 8/27/72 Concat ==="

# Verify all chunks exist
for f in intro.mp4 chunk-1.mp4 chunk-2.mp4 chunk-3.mp4 chunk-4.mp4; do
    if [ ! -f "$CHUNK_DIR/$f" ]; then
        echo "ERROR: Missing $CHUNK_DIR/$f"
        echo "Download from vast.ai first (see script header for scp commands)"
        exit 1
    fi
    echo "  Found: $f ($(du -h "$CHUNK_DIR/$f" | cut -f1))"
done

# Create concat list (intro + chunks in order)
cat > /tmp/concat-list.txt << EOF
file '$(cd "$CHUNK_DIR" && pwd)/intro.mp4'
file '$(cd "$CHUNK_DIR" && pwd)/chunk-1.mp4'
file '$(cd "$CHUNK_DIR" && pwd)/chunk-2.mp4'
file '$(cd "$CHUNK_DIR" && pwd)/chunk-3.mp4'
file '$(cd "$CHUNK_DIR" && pwd)/chunk-4.mp4'
EOF

echo ""
echo "Concat order:"
cat /tmp/concat-list.txt
echo ""

if [ -n "$AUDIO" ]; then
    echo "Concatenating video + muxing audio: $AUDIO"
    ffmpeg -y -f concat -safe 0 -i /tmp/concat-list.txt \
        -i "$AUDIO" \
        -c:v copy -c:a aac -b:a 320k \
        -shortest \
        -movflags +faststart \
        "$OUTPUT"
else
    echo "Concatenating video (no audio)"
    ffmpeg -y -f concat -safe 0 -i /tmp/concat-list.txt \
        -c:v copy \
        -movflags +faststart \
        "$OUTPUT"
fi

echo ""
echo "=== Done ==="
echo "Output: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
ffprobe -v quiet -show_format "$OUTPUT" 2>&1 | grep -E "duration|bit_rate" | head -2
