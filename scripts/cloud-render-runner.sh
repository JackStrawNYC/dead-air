#!/usr/bin/env bash
# Per-instance render runner. Runs ON each cloud instance.
# Reads chunk assignments from /tmp/chunks.json (uploaded earlier),
# renders each chunk via remotion, writes outputs to /workspace/renders/.
#
# Args: instance label (e.g., "i05")

set -e
LABEL="${1:-unknown}"
LOG=/tmp/render-${LABEL}.log
exec > >(tee -a $LOG) 2>&1

cd /workspace/dead-air/packages/visualizer-poc
# CRITICAL: must be set in the same shell, not inherited from parent
ulimit -n 65535
ulimit -u 65535
mkdir -p /workspace/renders
echo "ulimit -n: $(ulimit -n)"

CHUNKS_FILE=/tmp/chunks.json
if [ ! -f $CHUNKS_FILE ]; then
  echo "FAIL: $CHUNKS_FILE not found"
  exit 1
fi

echo "[$(date)] === Render runner start: $LABEL ==="
echo "Chunks to render:"
python3 -c "
import json
d = json.load(open('$CHUNKS_FILE'))
for c in d['chunks']:
    print(f\"  {c['track']:5s} {c['start']:>7d}-{c['end']:<7d} ({c['frames']:>6,} frames)\")
"

# Render each chunk
TOTAL_CHUNKS=$(python3 -c "import json; print(len(json.load(open('$CHUNKS_FILE'))['chunks']))")
IDX=1
python3 -c "
import json
d = json.load(open('$CHUNKS_FILE'))
for c in d['chunks']:
    print(f\"{c['track']} {c['start']} {c['end']} {c['frames']}\")
" | while read trackId startFrame endFrame frames; do
  echo ""
  echo "[$(date)] [$IDX/$TOTAL_CHUNKS] Rendering $trackId frames $startFrame-$endFrame ($frames frames)"

  outFile="/workspace/renders/${trackId}-${startFrame}-${endFrame}.mp4"
  if [ -f "$outFile" ]; then
    echo "  RESUME: $outFile already exists, skipping"
    IDX=$((IDX + 1))
    continue
  fi

  start_time=$(date +%s)
  set +e
  RENDER_WIDTH=3840 RENDER_HEIGHT=2160 RENDER_FPS=30 \
    node_modules/.bin/remotion render \
    out/bundle \
    "$trackId" \
    "$outFile" \
    --props=data/shows/1972-08-27/tracks/${trackId}-analysis.json \
    --gl=angle-egl \
    --concurrency=4 \
    --frames=${startFrame}-${endFrame} \
    --muted > /tmp/last-render.log 2>&1
  exit_code=$?
  set -e
  end_time=$(date +%s)
  duration=$((end_time - start_time))

  # Verify the output file actually exists and has reasonable size
  if [ "$exit_code" -ne 0 ] || [ ! -f "$outFile" ] || [ "$(stat -c %s "$outFile" 2>/dev/null || stat -f %z "$outFile" 2>/dev/null || echo 0)" -lt 100000 ]; then
    echo "  RENDER FAILED for $trackId chunk $startFrame-$endFrame (exit $exit_code)"
    echo "  --- last 15 lines of remotion output ---"
    tail -15 /tmp/last-render.log
    echo "  --- end ---"
    # Move bad output aside so resume can retry
    [ -f "$outFile" ] && mv "$outFile" "${outFile}.failed"
  else
    fps=$(awk "BEGIN { printf \"%.2f\", $frames / $duration }")
    size=$(ls -lh "$outFile" | awk '{print $5}')
    echo "  ✓ Done in ${duration}s ($fps fps, $size)"
  fi
  IDX=$((IDX + 1))
done

echo ""
echo "[$(date)] === Render runner complete: $LABEL ==="
ls -lh /workspace/renders/*.mp4 2>/dev/null
