#!/usr/bin/env bash
# Launch an EC2 instance (Ubuntu 22.04), provision it, and upload the Dead Air project.
#
# CPU render (SwiftShader):
#   scripts/ec2-render-start.sh
#
# GPU render (ANGLE + NVIDIA T4):
#   scripts/ec2-render-start.sh --gpu
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEY_NAME="dead-ledger-render"
KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
SG_NAME="dead-ledger-render-sg"
TAG_NAME="dead-air-render"
VOLUME_SIZE=50
SSH_USER="ubuntu"

# ── Parse flags ──────────────────────────────────────────────────────
USE_GPU=false
for arg in "$@"; do
  case "$arg" in
    --gpu) USE_GPU=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

if [ "$USE_GPU" = true ]; then
  INSTANCE_TYPE="g4dn.xlarge"   # 4 vCPU, 16GB RAM, 1x NVIDIA T4 GPU ($0.526/hr)
  echo "Mode: GPU (g4dn.xlarge + NVIDIA T4, use --gl=angle)"
else
  INSTANCE_TYPE="c5.4xlarge"    # 16 vCPU, 32GB RAM, CPU-only ($0.68/hr)
  echo "Mode: CPU (c5.4xlarge, use --gl=swiftshader)"
fi

# ── Load AWS creds from .env ──────────────────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
  export AWS_ACCESS_KEY_ID=$(grep REMOTION_AWS_ACCESS_KEY_ID "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_SECRET_ACCESS_KEY=$(grep REMOTION_AWS_SECRET_ACCESS_KEY "$PROJECT_DIR/.env" | cut -d= -f2-)
  export AWS_DEFAULT_REGION=$(grep REMOTION_AWS_REGION "$PROJECT_DIR/.env" | cut -d= -f2-)
else
  echo "ERROR: .env not found at $PROJECT_DIR/.env"
  exit 1
fi
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "=== Dead Air EC2 Render: Starting (region: $REGION) ==="

# ── Check for existing running instance ───────────────────────────────
EXISTING=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=$TAG_NAME" "Name=instance-state-name,Values=running,pending" \
  --query 'Reservations[].Instances[].InstanceId' --output text --region "$REGION" 2>/dev/null || true)

if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  EXISTING_IP=$(aws ec2 describe-instances --instance-ids $EXISTING \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")
  echo "Instance already running: $EXISTING ($EXISTING_IP)"
  echo "Use scripts/ec2-render-run.sh to render, or terminate manually."
  exit 0
fi

# ── Security group (reuse from dead-ledger) ──────────────────────────
MY_IP=$(curl -s https://checkip.amazonaws.com)/32
SG_ID=$(aws ec2 describe-security-groups --group-names "$SG_NAME" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$REGION" 2>/dev/null || true)

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  echo "Creating security group $SG_NAME..."
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SG_NAME" \
    --description "Dead Ledger/Air render instance SSH access" \
    --region "$REGION" --output text --query 'GroupId')
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION"
  echo "Security group created: $SG_ID (SSH from $MY_IP)"
else
  # Update SSH rule to current IP
  aws ec2 revoke-security-group-ingress \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr "0.0.0.0/0" --region "$REGION" 2>/dev/null || true
  EXISTING_CIDRS=$(aws ec2 describe-security-groups --group-ids "$SG_ID" --region "$REGION" \
    --query 'SecurityGroups[0].IpPermissions[?FromPort==`22`].IpRanges[].CidrIp' --output text 2>/dev/null || true)
  for cidr in $EXISTING_CIDRS; do
    aws ec2 revoke-security-group-ingress \
      --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$cidr" --region "$REGION" 2>/dev/null || true
  done
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP" --region "$REGION" 2>/dev/null || true
  echo "Security group $SG_ID updated (SSH from $MY_IP)"
fi

# ── SSH key pair (reuse from dead-ledger) ─────────────────────────────
if [ ! -f "$KEY_FILE" ]; then
  echo "Creating SSH key pair $KEY_NAME..."
  aws ec2 delete-key-pair --key-name "$KEY_NAME" --region "$REGION" 2>/dev/null || true
  aws ec2 create-key-pair --key-name "$KEY_NAME" --region "$REGION" \
    --query 'KeyMaterial' --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "Key saved to $KEY_FILE"
else
  KEY_EXISTS=$(aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" \
    --query 'KeyPairs[0].KeyName' --output text 2>/dev/null || true)
  if [ -z "$KEY_EXISTS" ] || [ "$KEY_EXISTS" = "None" ]; then
    echo "Re-importing key pair to AWS..."
    PUBLIC_KEY=$(ssh-keygen -y -f "$KEY_FILE")
    aws ec2 import-key-pair --key-name "$KEY_NAME" \
      --public-key-material "$(echo "$PUBLIC_KEY" | base64)" --region "$REGION"
  fi
  echo "Using existing key: $KEY_FILE"
fi

# ── Find latest Ubuntu 22.04 AMI (glibc 2.35 required by Remotion 4.0) ──
AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text --region "$REGION")
echo "AMI: $AMI_ID (Ubuntu 22.04)"

# ── User data bootstrap script ───────────────────────────────────────
if [ "$USE_GPU" = true ]; then
USER_DATA=$(cat <<'BOOTSTRAP'
#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm@9

# Install ffmpeg and tmux
apt-get install -y ffmpeg tmux

# Install Chromium dependencies for Remotion
apt-get install -y \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
  libnss3 libgtk-3-0 libxss1 libxtst6 xdg-utils wget \
  libxkbcommon0 fonts-liberation

# Install NVIDIA driver for T4 GPU (headless server mode, no X11 needed)
apt-get install -y linux-headers-$(uname -r)
apt-get install -y nvidia-headless-535-server nvidia-utils-535-server

# Verify GPU is detected
nvidia-smi || echo "WARNING: nvidia-smi failed — driver may need reboot"

# Signal ready
touch /tmp/bootstrap-complete
BOOTSTRAP
)
else
USER_DATA=$(cat <<'BOOTSTRAP'
#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install pnpm
npm install -g pnpm@9

# Install ffmpeg and tmux
apt-get install -y ffmpeg tmux

# Install Chromium dependencies for Remotion
apt-get install -y \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
  libnss3 libgtk-3-0 libxss1 libxtst6 xdg-utils wget \
  libxkbcommon0 fonts-liberation

# Signal ready
touch /tmp/bootstrap-complete
BOOTSTRAP
)
fi

# ── Launch instance (on-demand for render reliability) ───────────────
echo "Launching on-demand instance ($INSTANCE_TYPE)..."
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

# ── Wait for running state ────────────────────────────────────────────
echo "Waiting for instance to enter running state..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")
echo "Instance running: $PUBLIC_IP"

# ── Wait for SSH to be ready ──────────────────────────────────────────
SSH_OPTS="-i $KEY_FILE -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"
echo "Waiting for SSH..."
for i in $(seq 1 60); do
  if ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "echo ready" 2>/dev/null; then
    echo "SSH ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: SSH timed out after 5 minutes"
    exit 1
  fi
  sleep 5
done

# ── Wait for bootstrap to complete ────────────────────────────────────
echo "Waiting for bootstrap to complete (Node.js, pnpm, ffmpeg, Chromium)..."
for i in $(seq 1 60); do
  if ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "test -f /tmp/bootstrap-complete" 2>/dev/null; then
    echo "Bootstrap complete."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "WARNING: Bootstrap timed out. Check /var/log/cloud-init-output.log on the instance."
    echo "Continuing with rsync anyway..."
    break
  fi
  sleep 10
done

# ── Rsync project to instance ────────────────────────────────────────
echo "Uploading project to instance (this may take a few minutes)..."
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

echo "Upload complete."

# ── Install/rebuild dependencies on instance ─────────────────────────
echo "Installing dependencies on instance (pnpm install)..."
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "cd ~/dead-air && pnpm install 2>&1 | tail -10"

# ── Build the monorepo ────────────────────────────────────────────────
echo "Building monorepo (pnpm build)..."
ssh $SSH_OPTS $SSH_USER@"$PUBLIC_IP" "cd ~/dead-air && pnpm build 2>&1 | tail -10"

echo ""
echo "=== Dead Air EC2 Render Instance Ready ==="
echo "  Instance ID: $INSTANCE_ID"
echo "  Instance:    $INSTANCE_TYPE"
echo "  Public IP:   $PUBLIC_IP"
echo "  SSH:         ssh $SSH_OPTS $SSH_USER@$PUBLIC_IP"
echo ""
if [ "$USE_GPU" = true ]; then
  echo "GPU instance — use --gl=angle for rendering:"
  echo "  scripts/ec2-render-run.sh 1977-05-08 --segments=all --gl=angle"
else
  echo "CPU instance — use --gl=swiftshader for rendering:"
  echo "  scripts/ec2-render-run.sh 1977-05-08 --segments=all --gl=swiftshader"
fi
