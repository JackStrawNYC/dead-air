#!/usr/bin/env bash
# One-shot bootstrap script for a Vast.ai container.
# Installs Node.js 22, Chrome stable, EGL libs, ffmpeg, then clones repo.
#
# Run inside the Vast.ai container:
#   wget https://raw.githubusercontent.com/.../vastai-bootstrap.sh -O bootstrap.sh
#   bash bootstrap.sh
#
# Or just paste the script content into a heredoc.

set -ex

export DEBIAN_FRONTEND=noninteractive

echo "============================================================"
echo "  Dead Air Vast.ai Bootstrap"
echo "============================================================"

# Detect base — most Vast.ai images are based on Ubuntu 20/22
. /etc/os-release
echo "OS: $PRETTY_NAME"

# Update apt
apt-get update

# Core utilities
apt-get install -y --no-install-recommends \
  curl wget git ca-certificates gnupg \
  ffmpeg tmux bc rsync vim less

# Node.js 22 (matches local dev)
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v)"

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9
fi
echo "pnpm: $(pnpm -v)"

# Chrome stable — better GPU support than chrome-headless-shell
if ! command -v google-chrome-stable >/dev/null 2>&1; then
  wget -q -O /tmp/chrome-key.pub https://dl-ssl.google.com/linux/linux_signing_key.pub
  gpg --dearmor < /tmp/chrome-key.pub > /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update
  apt-get install -y google-chrome-stable
fi
echo "Chrome: $(google-chrome-stable --version)"

# OpenGL / EGL libraries — required for --use-gl=egl on NVIDIA
apt-get install -y --no-install-recommends \
  libegl1 libgles2 libgl1 libglvnd0 libglx0 libopengl0 \
  libgbm1 libdrm2 \
  libnvidia-egl-wayland1 || true

# Chrome runtime deps
apt-get install -y --no-install-recommends \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 \
  libnss3 libgtk-3-0 libxss1 libxtst6 xdg-utils \
  libxkbcommon0 fonts-liberation || true

# Verify NVIDIA driver is exposed (should be — Vast.ai mounts the host driver)
echo ""
echo "NVIDIA check:"
nvidia-smi || { echo "FAIL: nvidia-smi not working. Container may not have GPU access."; exit 1; }

# Verify EGL is reachable
echo ""
echo "EGL check:"
ldconfig -p | grep -E "libEGL\.so" | head -3 || { echo "FAIL: libEGL not in ldconfig"; exit 1; }

echo ""
echo "============================================================"
echo "  Bootstrap complete"
echo "============================================================"
echo ""
echo "Next steps:"
echo "  1. Upload code:  rsync from local machine"
echo "  2. Verify GPU:   bash cloud-gpu-verify.sh"
echo "  3. Render:       cd dead-air/packages/visualizer-poc && npx tsx scripts/render-show.ts --preset=4k --gl=egl --concurrency=2"
