#!/usr/bin/env bash
# Cloud render orchestration for Veneta '72 (and other visualizer-poc shows).
#
# Steps:
#   1. Launch g5.xlarge (A10G GPU) on AWS, install Chrome + EGL + NVIDIA driver
#   2. Upload visualizer-poc + data via rsync
#   3. Run cloud-gpu-verify.sh to confirm GPU works
#   4. If verified, run render-show.ts with --gl=egl --preset=preview
#   5. Download out/songs/* and the concatenated full show
#   6. Terminate instance
#
# Usage:
#   scripts/cloud-veneta-render.sh                    # full Veneta render at 1080p
#   scripts/cloud-veneta-render.sh --4k               # full render at 3840x2160
#   scripts/cloud-veneta-render.sh --verify-only      # only run GPU verification
#   scripts/cloud-veneta-render.sh --4k --verify-only # verify at 4K resolution
#   scripts/cloud-veneta-render.sh --keep             # don't terminate after
#   scripts/cloud-veneta-render.sh --instance=g4dn    # use cheaper T4 instead of A10G
#   scripts/cloud-veneta-render.sh --track=d1t02      # render single song only
#   scripts/cloud-veneta-render.sh --resume           # if instance exists, just rerun render
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_NAME="dead-ledger-render"
KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
SG_NAME="dead-ledger-render-sg"
TAG_NAME="dead-air-veneta-render"
SSH_USER="ubuntu"
VOLUME_SIZE=80

# ── Parse args ────────────────────────────────────────────────────────
VERIFY_ONLY=false
KEEP_INSTANCE=false
INSTANCE_PRESET="g5"   # g5 = A10G ($1.00/hr), g4dn = T4 ($0.52/hr)
TRACK_FILTER=""
RESUME=false
RESOLUTION="1080p"     # 1080p (preview preset) or 4k

for arg in "$@"; do
  case "$arg" in
    --verify-only) VERIFY_ONLY=true ;;
    --keep) KEEP_INSTANCE=true ;;
    --instance=g4dn) INSTANCE_PRESET="g4dn" ;;
    --instance=g5) INSTANCE_PRESET="g5" ;;
    --track=*) TRACK_FILTER="${arg#--track=}" ;;
    --resume) RESUME=true ;;
    --4k) RESOLUTION="4k" ;;
    --1080p) RESOLUTION="1080p" ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

if [ "$RESOLUTION" = "4k" ]; then
  PRESET_NAME="4k"
  RES_DESC="3840x2160 (4K)"
else
  PRESET_NAME="preview"
  RES_DESC="1920x1080 (1080p)"
fi

if [ "$INSTANCE_PRESET" = "g5" ]; then
  INSTANCE_TYPE="g5.xlarge"
  GPU_DESC="NVIDIA A10G (24GB, ~31 TFLOPS, \$1.00/hr)"
else
  INSTANCE_TYPE="g4dn.xlarge"
  GPU_DESC="NVIDIA T4 (16GB, ~8 TFLOPS, \$0.526/hr)"
fi

# ── Load AWS creds ─────────────────────────────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
  export AWS_ACCESS_KEY_ID=$(grep REMOTION_AWS_ACCESS_KEY_ID "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_SECRET_ACCESS_KEY=$(grep REMOTION_AWS_SECRET_ACCESS_KEY "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_DEFAULT_REGION=$(grep REMOTION_AWS_REGION "$PROJECT_DIR/.env" | cut -d= -f2-)
else
  echo "ERROR: .env not found at $PROJECT_DIR/.env"
  exit 1
fi
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "============================================================"
echo "  Dead Air Cloud Render — Veneta '72"
echo "============================================================"
echo "  Instance:    $INSTANCE_TYPE"
echo "  GPU:         $GPU_DESC"
echo "  Resolution:  $RES_DESC"
echo "  Preset:      $PRESET_NAME"
echo "  Region:      $REGION"
echo "  Verify:      $([ "$VERIFY_ONLY" = true ] && echo YES || echo no)"
echo "  Resume:      $([ "$RESUME" = true ] && echo YES || echo no)"
echo "============================================================"
echo ""

# ── Find or create instance ───────────────────────────────────────────
EXISTING=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$TAG_NAME" "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[].Instances[].InstanceId' --output text --region "$REGION" 2>/dev/null || true)

if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  INSTANCE_ID="$EXISTING"
  PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")
  echo "Using existing instance: $INSTANCE_ID ($PUBLIC_IP)"
else
  if [ "$RESUME" = true ]; then
    echo "ERROR: --resume specified but no running instance found."
    exit 1
  fi

  # Security group
  MY_IP=$(curl -s https://checkip.amazonaws.com)/32
  SG_ID=$(aws ec2 describe-security-groups --group-names "$SG_NAME" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$REGION" 2>/dev/null || true)
  if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
    SG_ID=$(aws ec2 create-security-group \
      --group-name "$SG_NAME" \
      --description "Dead Air render instance SSH access" \
      --region "$REGION" --output text --query 'GroupId')
    aws ec2 authorize-security-group-ingress \
      --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION" >/dev/null
  else
    # Add current IP if not already there
    aws ec2 authorize-security-group-ingress \
      --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION" 2>/dev/null || true
  fi

  # SSH key
  if [ ! -f "$KEY_FILE" ]; then
    aws ec2 delete-key-pair --key-name "$KEY_NAME" --region "$REGION" 2>/dev/null || true
    aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" \
      --query 'KeyMaterial' --output text > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
  fi

  # AMI: Ubuntu 22.04 (Remotion needs glibc 2.35+)
  AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" "Name=state,Values=available" \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
    --output text --region "$REGION")
  echo "AMI: $AMI_ID"

  # User data — install Chrome stable + NVIDIA driver + EGL libs
  USER_DATA=$(cat <<'BOOTSTRAP'
#!/bin/bash
set -ex
exec > /var/log/bootstrap.log 2>&1

export DEBIAN_FRONTEND=noninteractive

# Update apt
apt-get update

# Node.js 22 (matches local dev)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# pnpm
npm install -g pnpm@9

# Core utilities
apt-get install -y ffmpeg tmux git curl wget bc

# Chrome stable (better GPU support than chrome-headless-shell)
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update
apt-get install -y google-chrome-stable

# OpenGL / EGL libraries — required for Chrome --use-gl=egl on NVIDIA
apt-get install -y \
  libegl1 libgles2 libgl1 libglvnd0 libglx0 libopengl0 \
  libgles2-mesa libegl1-mesa libgl1-mesa-glx \
  libgbm1 libdrm2 \
  mesa-utils

# Chromium runtime deps (for chrome-headless-shell fallback)
apt-get install -y \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 \
  libnss3 libgtk-3-0 libxss1 libxtst6 xdg-utils \
  libxkbcommon0 fonts-liberation

# NVIDIA driver — server (headless) variant. 535 is stable, 550+ has features.
apt-get install -y linux-headers-$(uname -r)
apt-get install -y nvidia-driver-550-server nvidia-utils-550-server || \
  apt-get install -y nvidia-headless-535-server nvidia-utils-535-server

# Don't fail bootstrap if nvidia-smi needs reboot — we'll catch this later
nvidia-smi || echo "WARN: nvidia-smi failed (driver may need reboot)"

# Verify EGL is reachable (without GPU, just lib check)
ls -la /usr/lib/x86_64-linux-gnu/libEGL.so* || true

# Mark complete
touch /tmp/bootstrap-complete
BOOTSTRAP
)

  echo "Launching $INSTANCE_TYPE..."
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":$VOLUME_SIZE,\"VolumeType\":\"gp3\",\"DeleteOnTermination\":true}}]" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG_NAME}]" \
    --region "$REGION" \
    --query 'Instances[0].InstanceId' --output text)

  echo "Instance launched: $INSTANCE_ID"
  echo "Waiting for running state..."
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
  PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")
  echo "Public IP: $PUBLIC_IP"
fi

SSH_OPTS="-i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ServerAliveInterval=30 -o ServerAliveCountMax=120"

# ── Wait for SSH ──────────────────────────────────────────────────────
if [ "$RESUME" = false ]; then
  echo ""
  echo "Waiting for SSH..."
  for i in $(seq 1 60); do
    if ssh $SSH_OPTS -o ConnectTimeout=5 $SSH_USER@"$PUBLIC_IP" "echo ready" 2>/dev/null; then
      echo "SSH ready."
      break
    fi
    [ "$i" -eq 60 ] && { echo "ERROR: SSH timed out"; exit 1; }
    sleep 5
  done

  echo ""
  echo "Waiting for bootstrap (Node + Chrome + NVIDIA driver, ~5-10 min)..."
  for i in $(seq 1 90); do
    if ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "test -f /tmp/bootstrap-complete" 2>/dev/null; then
      echo "Bootstrap complete."
      break
    fi
    if [ $((i % 6)) -eq 0 ]; then
      echo "  ...still waiting (${i}/90, $((i*10))s elapsed)"
    fi
    [ "$i" -eq 90 ] && { echo "ERROR: Bootstrap timed out (15 min)"; ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tail -50 /var/log/bootstrap.log" || true; exit 1; }
    sleep 10
  done

  # Check if NVIDIA driver requires reboot (very common after first install)
  if ! ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "nvidia-smi >/dev/null 2>&1"; then
    echo ""
    echo "NVIDIA driver loaded but needs reboot. Rebooting..."
    ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "sudo reboot" || true
    sleep 30
    echo "Waiting for SSH after reboot..."
    for i in $(seq 1 30); do
      if ssh $SSH_OPTS -o ConnectTimeout=5 $SSH_USER@"$PUBLIC_IP" "nvidia-smi >/dev/null 2>&1" 2>/dev/null; then
        echo "Reboot complete, nvidia-smi works."
        break
      fi
      [ "$i" -eq 30 ] && { echo "ERROR: Reboot/nvidia recovery failed"; exit 1; }
      sleep 10
    done
  fi
fi

# ── Upload code + data (only if not resuming) ─────────────────────────
if [ "$RESUME" = false ]; then
  echo ""
  echo "Uploading visualizer-poc code + Veneta data..."
  echo "(excludes node_modules, out/, library/ — should be ~1 GB)"

  rsync -az --info=progress2 \
    --exclude='.git/' \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    --exclude='node_modules/' \
    --exclude='packages/visualizer-poc/out/' \
    --exclude='packages/visualizer-poc/public/assets/library/' \
    --exclude='packages/visualizer-poc/data/tracks-cornell/' \
    --exclude='packages/cli/dist/' \
    --exclude='packages/core/dist/' \
    --exclude='packages/pipeline/dist/' \
    --exclude='packages/dashboard/' \
    --exclude='dashboard/dist/' \
    -e "ssh $SSH_OPTS" \
    "$PROJECT_DIR/" $SSH_USER@"$PUBLIC_IP":~/dead-air/

  echo ""
  echo "Installing dependencies (pnpm install)..."
  ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "cd ~/dead-air && pnpm install 2>&1 | tail -10"
fi

# ── Upload verification script ────────────────────────────────────────
echo ""
echo "Uploading verification script..."
scp $SSH_OPTS "$SCRIPT_DIR/cloud-gpu-verify.sh" $SSH_USER@"$PUBLIC_IP":~/cloud-gpu-verify.sh
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "chmod +x ~/cloud-gpu-verify.sh"

# ── Run GPU verification ──────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Running GPU verification at $RES_DESC..."
echo "============================================================"
if ! ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "RESOLUTION=$RESOLUTION bash ~/cloud-gpu-verify.sh"; then
  echo ""
  echo "============================================================"
  echo "  GPU VERIFICATION FAILED"
  echo "============================================================"
  echo "Instance kept alive for debugging: $INSTANCE_ID ($PUBLIC_IP)"
  echo "SSH: ssh $SSH_OPTS $SSH_USER@$PUBLIC_IP"
  echo "Terminate when done: aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION"
  exit 1
fi

if [ "$VERIFY_ONLY" = true ]; then
  echo ""
  echo "Verify-only mode complete."
  if [ "$KEEP_INSTANCE" = false ]; then
    echo "Terminating instance..."
    aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
    echo "Instance terminated."
  else
    echo "Instance kept alive: $INSTANCE_ID ($PUBLIC_IP)"
  fi
  exit 0
fi

# ── Run full render ────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Starting full render"
echo "============================================================"

TRACK_ARG=""
if [ -n "$TRACK_FILTER" ]; then
  TRACK_ARG="--track=$TRACK_FILTER"
  echo "Mode: single track ($TRACK_FILTER)"
else
  echo "Mode: full Veneta show (21 tracks)"
fi

RENDER_LOG="/tmp/veneta-render.log"

# Kill any old render session, start fresh in tmux
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux kill-session -t veneta 2>/dev/null || true"
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux new-session -d -s veneta \
  'cd ~/dead-air/packages/visualizer-poc && \
   npx tsx scripts/render-show.ts --preset=$PRESET_NAME --gl=egl --concurrency=2 --resume $TRACK_ARG \
   2>&1 | tee $RENDER_LOG; echo RENDER_EXIT_CODE=\$? >> $RENDER_LOG'"

echo "Render started in tmux session 'veneta'. Tailing log..."
echo ""

# Tail the log
LAST_LINES=0
while true; do
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' --output text --region "$REGION" 2>/dev/null || echo unknown)
  if [ "$STATE" != "running" ]; then
    echo ""
    echo "ERROR: Instance no longer running (state: $STATE)"
    exit 1
  fi

  CURRENT=$(ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "wc -l < $RENDER_LOG 2>/dev/null | tr -d ' ' || echo 0")
  if [ "$CURRENT" -gt "$LAST_LINES" ]; then
    SKIP=$((LAST_LINES + 1))
    ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "sed -n '${SKIP},${CURRENT}p' $RENDER_LOG 2>/dev/null" || true
    LAST_LINES=$CURRENT
  fi

  if ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "grep -q RENDER_EXIT_CODE $RENDER_LOG 2>/dev/null"; then
    break
  fi

  if ! ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "tmux has-session -t veneta 2>/dev/null"; then
    echo "tmux session ended"
    break
  fi

  sleep 30
done

# ── Download outputs ──────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Downloading rendered outputs..."
echo "============================================================"

LOCAL_OUT="$PROJECT_DIR/packages/visualizer-poc/out/songs"
mkdir -p "$LOCAL_OUT"

rsync -avz --info=progress2 \
  --include='*.mp4' \
  --include='*-full-show.mp4' \
  --exclude='*-chunks/' \
  --exclude='bundle/' \
  -e "ssh $SSH_OPTS" \
  $SSH_USER@"$PUBLIC_IP":~/dead-air/packages/visualizer-poc/out/ "$PROJECT_DIR/packages/visualizer-poc/out/" || true

# ── Terminate ─────────────────────────────────────────────────────────
if [ "$KEEP_INSTANCE" = false ]; then
  echo ""
  echo "Terminating instance..."
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
  echo "Instance terminated."
else
  echo ""
  echo "Instance kept alive: $INSTANCE_ID ($PUBLIC_IP)"
  echo "Terminate manually: aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION"
fi

echo ""
echo "============================================================"
echo "  Cloud render complete"
echo "============================================================"
echo "Output: $LOCAL_OUT"
