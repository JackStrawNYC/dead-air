#!/bin/bash
# Render a chunk of the Veneta show on a vast.ai GPU instance.
# Usage: vast-render.sh <chunk-num> <start-frame> <end-frame> <s3-bucket>
#
# Prerequisites: instance has Rust toolchain, GPU drivers, and wgpu support.
# This script:
#   1. Downloads manifest + overlay PNGs + renderer source from S3
#   2. Compiles the renderer
#   3. Renders the assigned frame range
#   4. Uploads the chunk to S3
set -euo pipefail

CHUNK=${1:?Usage: vast-render.sh <chunk-num> <start-frame> <end-frame> <s3-bucket>}
START=${2:?}
END=${3:?}
S3_BUCKET=${4:-remotionlambda-useast1-k7ca3krqhx}
S3_PREFIX="veneta-overlay-render"

echo "=== Dead Air Renderer — Chunk $CHUNK (frames $START-$END) ==="
echo "GPU:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "  (nvidia-smi not available)"

# Install Rust if needed
if ! command -v cargo &>/dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Install AWS CLI if needed
if ! command -v aws &>/dev/null; then
    echo "Installing AWS CLI..."
    apt-get update -qq && apt-get install -y -qq awscli 2>/dev/null || pip install awscli
fi

# Download renderer source, manifest, and overlay PNGs from S3
echo "Downloading from S3..."
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/renderer-src.tar.gz" /tmp/renderer-src.tar.gz
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/manifest-with-overlays.json" /root/manifest.json
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/overlay-pngs.tar.gz" /tmp/overlay-pngs.tar.gz

echo "Extracting..."
mkdir -p /root/renderer /root/overlay-pngs
tar xzf /tmp/renderer-src.tar.gz -C /root/renderer
tar xzf /tmp/overlay-pngs.tar.gz -C /root/overlay-pngs
rm -f /tmp/renderer-src.tar.gz /tmp/overlay-pngs.tar.gz

# Compile renderer
echo "Compiling renderer..."
cd /root/renderer
cargo build --release 2>&1 | tail -5
RENDERER="./target/release/dead-air-renderer"

echo "Renderer compiled: $($RENDERER --version 2>/dev/null || echo 'ok')"

# Render the chunk
echo ""
echo "=== Rendering chunk-$CHUNK: frames $START to $END ==="
$RENDERER \
    --manifest /root/manifest.json \
    -o "/root/chunk-$CHUNK.mp4" \
    --width 3840 --height 2160 --fps 60 \
    --start-frame "$START" --end-frame "$END" \
    --overlay-png-dir /root/overlay-pngs

echo ""
echo "=== Render complete ==="
ls -lh "/root/chunk-$CHUNK.mp4"

# Upload to S3
echo "Uploading chunk-$CHUNK to S3..."
aws s3 cp "/root/chunk-$CHUNK.mp4" "s3://$S3_BUCKET/veneta-overlay-chunks/chunk-$CHUNK.mp4"

echo "=== Done: chunk-$CHUNK uploaded to s3://$S3_BUCKET/veneta-overlay-chunks/chunk-$CHUNK.mp4 ==="
