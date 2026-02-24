#!/usr/bin/env bash
# Render an episode on the EC2 instance, download the result, and terminate.
#
# Full episode render:
#   scripts/ec2-render-run.sh 1977-05-08 [--keep]
#
# Scene-level render (specific segments):
#   scripts/ec2-render-run.sh 1977-05-08 --segments=11,13-38 [--keep]
#   scripts/ec2-render-run.sh 1977-05-08 --segments=all --gl=swiftshader
#
# Concat-only (local, no EC2):
#   scripts/ec2-render-run.sh 1977-05-08 --concat-only
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_FILE="$HOME/.ssh/dead-ledger-render.pem"
TAG_NAME="dead-air-render"
SSH_USER="ubuntu"

# ── Parse args ────────────────────────────────────────────────────────
SHOW_DATE=""
KEEP_INSTANCE=false
SEGMENTS=""
GL_BACKEND=""  # auto-detect: angle if GPU present, swiftshader otherwise
CONCAT_ONLY=false
EXTRA_FLAGS=""

for arg in "$@"; do
  case "$arg" in
    --keep)
      KEEP_INSTANCE=true
      ;;
    --segments=*)
      SEGMENTS="${arg#--segments=}"
      ;;
    --gl=*)
      GL_BACKEND="${arg#--gl=}"
      ;;
    --concat-only)
      CONCAT_ONLY=true
      ;;
    --concurrency=*|--frame-concurrency=*)
      EXTRA_FLAGS="$EXTRA_FLAGS $arg"
      ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9])
      SHOW_DATE="$arg"
      ;;
    *)
      echo "Unknown arg: $arg"
      ;;
  esac
done

if [ -z "$SHOW_DATE" ]; then
  echo "Usage: scripts/ec2-render-run.sh <YYYY-MM-DD> [options]"
  echo ""
  echo "Full episode render (pnpm deadair produce --from render):"
  echo "  scripts/ec2-render-run.sh 1977-05-08 [--keep]"
  echo ""
  echo "Scene-level render (test-render.ts with specific segments):"
  echo "  scripts/ec2-render-run.sh 1977-05-08 --segments=11,13-38 [--keep]"
  echo "  scripts/ec2-render-run.sh 1977-05-08 --segments=all [--keep]"
  echo ""
  echo "Local concat only (no EC2 needed):"
  echo "  scripts/ec2-render-run.sh 1977-05-08 --concat-only"
  echo ""
  echo "Options:"
  echo "  --keep                    Don't terminate instance after render"
  echo "  --segments=SPEC           Render specific segments (comma-separated indices/ranges)"
  echo "                            Examples: 11,13-38  or  1,5,10-20  or  all"
  echo "  --gl=BACKEND              GL backend: angle (GPU) or swiftshader (CPU, default)"
  echo "  --concurrency=N           Number of parallel segment workers"
  echo "  --frame-concurrency=N     Frames rendered in parallel per worker"
  echo "  --concat-only             Skip EC2 render, just concat local segments"
  echo ""
  echo "Example: scripts/ec2-render-run.sh 1977-05-08 --segments=11,13-38 --keep"
  exit 1
fi

EPISODE_ID="ep-${SHOW_DATE}"

# ── Expand segment spec into indices ──────────────────────────────────
# Input:  "11,13-38" or "all"
# Output: "11 13 14 15 ... 38" or "" (empty = render all via produce)
expand_segments() {
  local spec="$1"

  if [ "$spec" = "all" ] || [ "$spec" = "--all" ]; then
    echo "all"
    return
  fi

  local result=""
  # Split on commas
  IFS=',' read -ra parts <<< "$spec"
  for part in "${parts[@]}"; do
    if [[ "$part" == *-* ]]; then
      # Range: 13-38
      local start="${part%-*}"
      local end="${part#*-}"
      for i in $(seq "$start" "$end"); do
        result="$result $i"
      done
    else
      # Single index
      result="$result $part"
    fi
  done

  echo "$result"
}

# ── Concat-only mode (local, no EC2) ─────────────────────────────────
if [ "$CONCAT_ONLY" = true ]; then
  echo "=== Local Concat: $EPISODE_ID ==="
  echo ""
  echo "Running: npx tsx -e \"import { loadConfig, getDb } from '@dead-air/core'; import { buildCompositionProps, concatScenes } from '@dead-air/pipeline'; const config = loadConfig(); const db = getDb(config.paths.database); const props = await buildCompositionProps({ episodeId: '$EPISODE_ID', db, dataDir: config.paths.data }); await concatScenes(props, config.paths.data);\""
  cd "$PROJECT_DIR" && npx tsx -e "
    import { loadConfig, getDb } from '@dead-air/core';
    import { buildCompositionProps, concatScenes } from '@dead-air/pipeline';
    const config = loadConfig();
    const db = getDb(config.paths.database);
    const props = await buildCompositionProps({ episodeId: '$EPISODE_ID', db, dataDir: config.paths.data });
    await concatScenes(props, config.paths.data);
  "
  exit $?
fi

# ── Load AWS creds ────────────────────────────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
  export AWS_ACCESS_KEY_ID=$(grep REMOTION_AWS_ACCESS_KEY_ID "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_SECRET_ACCESS_KEY=$(grep REMOTION_AWS_SECRET_ACCESS_KEY "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_DEFAULT_REGION=$(grep REMOTION_AWS_REGION "$PROJECT_DIR/.env" | cut -d= -f2-)
else
  echo "ERROR: .env not found"
  exit 1
fi
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# ── Find running instance ────────────────────────────────────────────
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$TAG_NAME" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[0].InstanceId' --output text --region "$REGION" 2>/dev/null || true)

if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "None" ]; then
  echo "ERROR: No running instance found with tag '$TAG_NAME'."
  echo "Run scripts/ec2-render-start.sh first."
  exit 1
fi

PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")

echo "=== Dead Air EC2 Render: $SHOW_DATE on $INSTANCE_ID ($PUBLIC_IP) ==="

SSH_OPTS="-i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=120"
REMOTE_DIR="~/dead-air"
RENDER_LOG="/tmp/render-${SHOW_DATE}.log"

# ── Sync any new/changed files before render ──────────────────────────
echo "Syncing latest changes..."
rsync -az --progress \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='*.bak' \
  --exclude='node_modules/' \
  --exclude='data/renders/' \
  --exclude='data/cache/' \
  --exclude='dashboard/dist/' \
  -e "ssh $SSH_OPTS" \
  "$PROJECT_DIR/" $SSH_USER@"$PUBLIC_IP":~/dead-air/

# ── Rebuild if source changed ─────────────────────────────────────────
echo "Rebuilding monorepo..."
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "cd $REMOTE_DIR && pnpm build 2>&1 | tail -5"

# ── Run render ────────────────────────────────────────────────────────
RENDER_START=$(date +%s)

# Auto-detect GPU and set GL backend if not specified
if [ -z "$GL_BACKEND" ]; then
  HAS_GPU=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "nvidia-smi >/dev/null 2>&1 && echo yes || echo no")
  if [ "$HAS_GPU" = "yes" ]; then
    GL_BACKEND="angle"
    echo "GPU detected → using --gl=angle"
  else
    GL_BACKEND="swiftshader"
    echo "No GPU → using --gl=swiftshader"
  fi
fi

# Auto-detect CPU count on remote and set concurrency
REMOTE_CPUS=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "nproc" 2>/dev/null || echo "8")
if [ "$GL_BACKEND" = "angle" ]; then
  # GPU is the bottleneck — 2 workers is optimal for single T4
  RENDER_CONCURRENCY=2
  echo "Remote CPUs: $REMOTE_CPUS, GL: angle → render concurrency: $RENDER_CONCURRENCY"
else
  RENDER_CONCURRENCY=$(( REMOTE_CPUS > 4 ? REMOTE_CPUS - 2 : REMOTE_CPUS ))
  echo "Remote CPUs: $REMOTE_CPUS, GL: swiftshader → render concurrency: $RENDER_CONCURRENCY"
fi

# Install tmux if not available
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "which tmux >/dev/null 2>&1 || sudo apt-get install -y tmux >/dev/null 2>&1"

# Kill any existing render tmux session
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux kill-session -t render 2>/dev/null || true"

if [ -n "$SEGMENTS" ]; then
  # ── Scene-level render mode via test-render.ts ──
  SEGMENT_INDICES=$(expand_segments "$SEGMENTS")

  if [ "$SEGMENT_INDICES" = "all" ]; then
    # Render all segments — generate index list from segment count
    RENDER_CMD="npx tsx packages/cli/src/test-render.ts --episode=$EPISODE_ID --gl=$GL_BACKEND --concurrency=$RENDER_CONCURRENCY$EXTRA_FLAGS"
    echo ""
    echo "Rendering ALL segments (will print segment map, then render all)..."
    echo "NOTE: --segments=all requires manual index list. Falling back to produce --from render."
    echo ""
    RENDER_CMD="REMOTION_CONCURRENCY=$RENDER_CONCURRENCY pnpm deadair produce $SHOW_DATE --from render"
  else
    RENDER_CMD="npx tsx packages/cli/src/test-render.ts --episode=$EPISODE_ID --gl=$GL_BACKEND --concurrency=$RENDER_CONCURRENCY$EXTRA_FLAGS $SEGMENT_INDICES"
  fi

  echo ""
  echo "Starting scene render: $RENDER_CMD"
  echo "────────────────────────────────────────────────────────────────"

  ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux new-session -d -s render \
    'cd $REMOTE_DIR && $RENDER_CMD 2>&1 | tee $RENDER_LOG; echo RENDER_EXIT_CODE=\$? >> $RENDER_LOG'"
else
  # ── Full episode render mode (original behavior) ──
  echo ""
  echo "Starting render: pnpm deadair produce $SHOW_DATE --from render"
  echo "────────────────────────────────────────────────────────────────"

  ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux new-session -d -s render \
    'cd $REMOTE_DIR && REMOTION_CONCURRENCY=$RENDER_CONCURRENCY pnpm deadair produce $SHOW_DATE --from render 2>&1 | tee $RENDER_LOG; echo RENDER_EXIT_CODE=\$? >> $RENDER_LOG'"
fi

echo "Render started in tmux session. Tailing log..."
echo ""

# Poll the log file until render completes
LAST_LINE_COUNT=0
while true; do
  # Check if instance is still running
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text --region "$REGION" 2>/dev/null || echo "unknown")
  if [ "$STATE" != "running" ]; then
    echo ""
    echo "ERROR: Instance $INSTANCE_ID is no longer running (state: $STATE)"
    echo "Spot instance may have been reclaimed."
    exit 1
  fi

  # Get new log lines (trim whitespace from wc output)
  CURRENT_LINES=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "wc -l < $RENDER_LOG 2>/dev/null | tr -d ' ' || echo 0")
  if [ "$CURRENT_LINES" -gt "$LAST_LINE_COUNT" ]; then
    SKIP=$(( LAST_LINE_COUNT + 1 ))
    ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "sed -n '${SKIP},${CURRENT_LINES}p' $RENDER_LOG 2>/dev/null" || true
    LAST_LINE_COUNT=$CURRENT_LINES
  fi

  # Check if render finished
  DONE=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "grep -c 'RENDER_EXIT_CODE' $RENDER_LOG 2>/dev/null || echo 0")
  if [ "$DONE" -gt 0 ]; then
    break
  fi

  # Check if tmux session is still alive
  TMUX_ALIVE=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux has-session -t render 2>/dev/null && echo yes || echo no")
  if [ "$TMUX_ALIVE" = "no" ]; then
    # Session ended — grab any remaining lines
    CURRENT_LINES=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "wc -l < $RENDER_LOG 2>/dev/null | tr -d ' ' || echo 0")
    if [ "$CURRENT_LINES" -gt "$LAST_LINE_COUNT" ]; then
      SKIP=$(( LAST_LINE_COUNT + 1 ))
      ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "sed -n '${SKIP},${CURRENT_LINES}p' $RENDER_LOG 2>/dev/null" || true
    fi
    break
  fi

  sleep 30
done

RENDER_END=$(date +%s)
RENDER_DURATION=$(( RENDER_END - RENDER_START ))
RENDER_MINS=$(( RENDER_DURATION / 60 ))
RENDER_SECS=$(( RENDER_DURATION % 60 ))
echo "────────────────────────────────────────────────────────────────"
echo "Render completed in ${RENDER_MINS}m ${RENDER_SECS}s"

# ── Download rendered files ───────────────────────────────────────────
echo ""
echo "Downloading rendered files..."
LOCAL_OUT="$PROJECT_DIR/data/renders/$EPISODE_ID"
mkdir -p "$LOCAL_OUT"

if [ -n "$SEGMENTS" ]; then
  # ── Scene-level download: rsync segment MP4s + hash files ──
  mkdir -p "$LOCAL_OUT/scenes"

  echo "  Downloading scene segments from data/renders/$EPISODE_ID/scenes/..."
  rsync -avz --progress \
    --include='segment-*.mp4' \
    --include='segment-*.hash' \
    --exclude='*' \
    -e "ssh $SSH_OPTS" \
    $SSH_USER@"$PUBLIC_IP":"$REMOTE_DIR/data/renders/$EPISODE_ID/scenes/" "$LOCAL_OUT/scenes/"

  # Count downloaded segments
  CLIP_COUNT=$(find "$LOCAL_OUT/scenes" -name "segment-*.mp4" -type f | wc -l | tr -d ' ')
  echo "  Downloaded $CLIP_COUNT segment(s) to data/renders/$EPISODE_ID/scenes/"

  # Also grab props.json if it exists (needed for concat)
  scp $SSH_OPTS $SSH_USER@"$PUBLIC_IP":"$REMOTE_DIR/data/renders/$EPISODE_ID/props.json" "$LOCAL_OUT/props.json" 2>/dev/null || true

  echo ""
  echo "To concatenate all segments into final episode:"
  echo "  scripts/ec2-render-run.sh $SHOW_DATE --concat-only"
else
  # ── Full episode download (original behavior) ──
  REMOTE_FILES=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" \
    "ls $REMOTE_DIR/data/renders/$EPISODE_ID/*.mp4 2>/dev/null || true")

  if [ -z "$REMOTE_FILES" ]; then
    echo "WARNING: No rendered files found on the instance."
    echo "Check the render output above for errors."
  else
    for file in $REMOTE_FILES; do
      BASENAME=$(basename "$file")
      echo "  Downloading $BASENAME..."
      scp $SSH_OPTS $SSH_USER@"$PUBLIC_IP":"$file" "$LOCAL_OUT/$BASENAME"
      echo "  Saved to data/renders/$EPISODE_ID/$BASENAME"
    done
    echo "Download complete."
  fi
fi

# ── Terminate instance ────────────────────────────────────────────────
if [ "$KEEP_INSTANCE" = true ]; then
  echo ""
  echo "Instance kept alive (--keep flag). Remember to terminate later:"
  echo "  aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION"
else
  echo ""
  echo "Terminating instance $INSTANCE_ID..."
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null
  echo "Instance terminated."
fi

echo ""
echo "=== Dead Air EC2 Render Complete ==="
echo "  Show:     $SHOW_DATE"
echo "  Duration: ${RENDER_MINS}m ${RENDER_SECS}s"
if [ -n "$SEGMENTS" ]; then
  echo "  Mode:     scene-level (segments: $SEGMENTS)"
  echo "  Output:   data/renders/$EPISODE_ID/scenes/"
else
  echo "  Mode:     full episode"
  echo "  Output:   data/renders/$EPISODE_ID/"
fi
