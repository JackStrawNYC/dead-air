#!/usr/bin/env bash
# =============================================================================
# vast-render.sh — One-command deploy + render on Vast.ai GPU instances
#
# Usage:
#   scripts/vast-render.sh --track=d1t03                    # single GPU
#   scripts/vast-render.sh --track=d1t03 --split            # split across 2 GPUs
#   scripts/vast-render.sh --track=d1t03 --split --4k       # 4K split render
#   scripts/vast-render.sh --track=d1t03 --preview          # 10s preview only
#   scripts/vast-render.sh --status                         # check render progress
#   scripts/vast-render.sh --download                       # download finished chunks
#   scripts/vast-render.sh --kill                           # kill renders + destroy instances
#
# Prerequisites:
#   - vastai CLI installed and authenticated
#   - SSH key configured for Vast.ai
#   - Running Vast.ai instances (use `vastai create instance` first)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VIZ_DIR="$PROJECT_DIR/packages/visualizer-poc"

# ── Parse args ────────────────────────────────────────────────────────
TRACK=""
SPLIT=false
PREVIEW=false
STATUS=false
DOWNLOAD=false
KILL=false
RESOLUTION=""
GL="angle"

for arg in "$@"; do
  case "$arg" in
    --track=*) TRACK="${arg#--track=}" ;;
    --split) SPLIT=true ;;
    --preview) PREVIEW=true ;;
    --4k) RESOLUTION="--4k" ;;
    --status) STATUS=true ;;
    --download) DOWNLOAD=true ;;
    --kill) KILL=true ;;
    --gl=*) GL="${arg#--gl=}" ;;
  esac
done

# ── Get running Vast.ai instances ─────────────────────────────────────
get_instances() {
  vastai show instances --raw 2>/dev/null | python3 -c "
import sys, json
instances = json.load(sys.stdin)
for inst in instances:
    if inst.get('actual_status') == 'running':
        ssh_host = inst.get('ssh_host', '')
        ssh_port = inst.get('ssh_port', '')
        inst_id = inst.get('id', '')
        print(f'{inst_id} {ssh_host} {ssh_port}')
" 2>/dev/null || true
}

INSTANCES=($(get_instances))
NUM_INSTANCES=$((${#INSTANCES[@]} / 3))

if [ "$KILL" = true ]; then
  echo "Killing all renders and destroying instances..."
  for ((i=0; i<NUM_INSTANCES; i++)); do
    ID="${INSTANCES[$((i*3))]}"
    HOST="${INSTANCES[$((i*3+1))]}"
    PORT="${INSTANCES[$((i*3+2))]}"
    echo "  Killing processes on $HOST:$PORT (instance $ID)..."
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p "$PORT" "root@$HOST" \
      "pkill -9 -f remotion || true; pkill -9 -f render-show || true; pkill -9 -f chrome || true" 2>/dev/null || true
    echo "  Destroying instance $ID..."
    vastai destroy instance "$ID" 2>/dev/null || true
  done
  echo "Done."
  exit 0
fi

if [ "$STATUS" = true ]; then
  echo "=== Render Status ==="
  for ((i=0; i<NUM_INSTANCES; i++)); do
    HOST="${INSTANCES[$((i*3+1))]}"
    PORT="${INSTANCES[$((i*3+2))]}"
    echo ""
    echo "--- GPU $((i+1)) ($HOST:$PORT) ---"
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p "$PORT" "root@$HOST" bash << 'REMOTE'
      # Check if rendering
      if pgrep -f remotion > /dev/null 2>&1; then
        echo "Status: RENDERING"
      elif pgrep -f render-show > /dev/null 2>&1; then
        echo "Status: BUNDLING/STARTING"
      else
        echo "Status: IDLE"
      fi
      # Count completed chunks
      CHUNKS=$(ls /root/dead-air/packages/visualizer-poc/out/songs/*/chunk-*.mp4 2>/dev/null | wc -l)
      echo "Completed chunks: $CHUNKS"
      # Show last log lines
      echo "Last log:"
      tail -3 /tmp/render-gpu*.log 2>/dev/null || echo "  (no log)"
REMOTE
  done
  exit 0
fi

if [ "$DOWNLOAD" = true ]; then
  echo "=== Downloading rendered chunks ==="
  mkdir -p "$VIZ_DIR/out/songs"
  for ((i=0; i<NUM_INSTANCES; i++)); do
    HOST="${INSTANCES[$((i*3+1))]}"
    PORT="${INSTANCES[$((i*3+2))]}"
    echo "Downloading from GPU $((i+1)) ($HOST:$PORT)..."
    rsync -avz -e "ssh -o StrictHostKeyChecking=no -p $PORT" \
      "root@$HOST:/root/dead-air/packages/visualizer-poc/out/songs/" \
      "$VIZ_DIR/out/songs/" 2>&1 | tail -3
  done
  echo "Done. Files in: $VIZ_DIR/out/songs/"
  exit 0
fi

# ── Validate ──────────────────────────────────────────────────────────
if [ -z "$TRACK" ]; then
  echo "Error: --track=TRACKID is required (e.g., --track=d1t03)"
  echo "Usage: scripts/vast-render.sh --track=d1t03 [--split] [--4k] [--preview]"
  exit 1
fi

if [ "$NUM_INSTANCES" -eq 0 ]; then
  echo "Error: No running Vast.ai instances found."
  echo "Create instances first: vastai create instance ..."
  exit 1
fi

if [ "$SPLIT" = true ] && [ "$NUM_INSTANCES" -lt 2 ]; then
  echo "Error: --split requires 2+ running instances (found $NUM_INSTANCES)"
  exit 1
fi

# How many GPUs to use for split
SPLIT_COUNT="$NUM_INSTANCES"
[ "$SPLIT_COUNT" -gt 4 ] && SPLIT_COUNT=4  # cap at 4-way split

# Get total frames for this track
ANALYSIS_FILE="$VIZ_DIR/data/tracks/${TRACK}-analysis.json"
if [ ! -f "$ANALYSIS_FILE" ]; then
  echo "Error: Analysis file not found: $ANALYSIS_FILE"
  exit 1
fi
TOTAL_FRAMES=$(python3 -c "import json; print(json.load(open('$ANALYSIS_FILE'))['meta']['totalFrames'])")
echo "Track: $TRACK ($TOTAL_FRAMES frames)"

# ── Deploy ────────────────────────────────────────────────────────────
deploy_to_gpu() {
  local HOST="$1"
  local PORT="$2"
  local GPU_NUM="$3"

  echo ""
  echo "=== Deploying to GPU $GPU_NUM ($HOST:$PORT) ==="

  # Single rsync with -L (dereference symlinks), exclude build artifacts
  echo "  [1/3] Syncing project (this may take a few minutes)..."
  rsync -azL \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='.turbo' \
    --exclude='__pycache__' \
    --exclude='out/songs' \
    --exclude='out/bundle' \
    -e "ssh -o StrictHostKeyChecking=no -p $PORT" \
    "$PROJECT_DIR/" "root@$HOST:/root/dead-air/"

  # Install dependencies
  echo "  [2/3] Installing dependencies..."
  ssh -o StrictHostKeyChecking=no -p "$PORT" "root@$HOST" bash << 'INSTALL'
    cd /root/dead-air
    pnpm install --no-frozen-lockfile 2>&1 | tail -3
    # Verify critical binaries
    if [ ! -f packages/visualizer-poc/node_modules/.bin/remotion ]; then
      echo "ERROR: remotion not found after install"
      exit 1
    fi
    echo "Dependencies OK"
INSTALL

  # Verify deployment
  echo "  [3/3] Verifying deployment..."
  ssh -o StrictHostKeyChecking=no -p "$PORT" "root@$HOST" bash << VERIFY
    cd /root/dead-air/packages/visualizer-poc
    ERRORS=0
    [ ! -f src/entry.ts ] && echo "MISSING: src/entry.ts" && ERRORS=\$((ERRORS+1))
    [ ! -f data/setlist.json ] && echo "MISSING: data/setlist.json" && ERRORS=\$((ERRORS+1))
    [ ! -f data/show-timeline.json ] && echo "MISSING: data/show-timeline.json" && ERRORS=\$((ERRORS+1))
    [ ! -f data/tracks/${TRACK}-analysis.json ] && echo "MISSING: data/tracks/${TRACK}-analysis.json" && ERRORS=\$((ERRORS+1))
    [ ! -d public/assets ] && echo "MISSING: public/assets/" && ERRORS=\$((ERRORS+1))
    [ ! -f node_modules/.bin/remotion ] && echo "MISSING: remotion binary" && ERRORS=\$((ERRORS+1))
    if [ \$ERRORS -gt 0 ]; then
      echo "VERIFICATION FAILED: \$ERRORS missing files"
      exit 1
    fi
    echo "All files verified OK"
VERIFY
}

# ── Render ────────────────────────────────────────────────────────────
launch_render() {
  local HOST="$1"
  local PORT="$2"
  local GPU_NUM="$3"
  local FRAME_ARGS="$4"
  local LOG_FILE="/tmp/render-gpu${GPU_NUM}.log"

  echo "  Launching render on GPU $GPU_NUM: $FRAME_ARGS"
  ssh -o StrictHostKeyChecking=no -p "$PORT" "root@$HOST" bash << RENDER
    cd /root/dead-air/packages/visualizer-poc
    rm -rf out/bundle out/songs
    nohup tsx scripts/render-show.ts --track=$TRACK $FRAME_ARGS --gl=$GL $RESOLUTION > $LOG_FILE 2>&1 &
    echo "PID=\$! on GPU $GPU_NUM"
RENDER
}

# ── Main ──────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Dead Air Vast.ai Render"
echo "  Track: $TRACK ($TOTAL_FRAMES frames)"
[ "$SPLIT" = true ] && echo "  Mode: Split across $NUM_INSTANCES GPUs"
[ "$PREVIEW" = true ] && echo "  Preview: First 300 frames only"
echo "============================================"

# Deploy to all needed GPUs
if [ "$SPLIT" = true ]; then
  for ((i=0; i<SPLIT_COUNT; i++)); do
    HOST="${INSTANCES[$((i*3+1))]}"
    PORT="${INSTANCES[$((i*3+2))]}"
    deploy_to_gpu "$HOST" "$PORT" "$((i+1))"
  done
else
  HOST="${INSTANCES[1]}"
  PORT="${INSTANCES[2]}"
  deploy_to_gpu "$HOST" "$PORT" 1
fi

echo ""
echo "=== Starting Render ==="

if [ "$PREVIEW" = true ]; then
  HOST="${INSTANCES[1]}"
  PORT="${INSTANCES[2]}"
  launch_render "$HOST" "$PORT" 1 "--preview"
elif [ "$SPLIT" = true ]; then
  # Split frames evenly across all available GPUs
  CHUNK_SIZE=$((TOTAL_FRAMES / SPLIT_COUNT))
  for ((i=0; i<SPLIT_COUNT; i++)); do
    HOST="${INSTANCES[$((i*3+1))]}"
    PORT="${INSTANCES[$((i*3+2))]}"
    FRAME_START=$((i * CHUNK_SIZE))
    if [ $i -eq $((SPLIT_COUNT - 1)) ]; then
      # Last GPU gets remaining frames
      launch_render "$HOST" "$PORT" "$((i+1))" "--frame-start=$FRAME_START"
    else
      FRAME_END=$(((i + 1) * CHUNK_SIZE))
      launch_render "$HOST" "$PORT" "$((i+1))" "--frame-start=$FRAME_START --frame-end=$FRAME_END"
    fi
  done
  echo ""
  echo "Split $TOTAL_FRAMES frames across $SPLIT_COUNT GPUs ($CHUNK_SIZE frames each)"
else
  HOST="${INSTANCES[1]}"
  PORT="${INSTANCES[2]}"
  launch_render "$HOST" "$PORT" 1 ""
fi

echo ""
echo "Render launched! Monitor with:"
echo "  scripts/vast-render.sh --status"
echo ""
echo "Download results with:"
echo "  scripts/vast-render.sh --download"
echo ""
echo "Kill everything with:"
echo "  scripts/vast-render.sh --kill"
