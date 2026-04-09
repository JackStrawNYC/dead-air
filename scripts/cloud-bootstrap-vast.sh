#!/usr/bin/env bash
# Bootstrap script to run ON a Vast.ai NVIDIA CUDA container.
# Installs Node, Chrome, libnvidia-gl-580 (manual extract), pnpm, runtime deps.
# Idempotent — re-running is safe.
#
# Run via:
#   ssh -p PORT root@IP "bash -s" < cloud-bootstrap-vast.sh

set -e
export DEBIAN_FRONTEND=noninteractive

LOG=/tmp/bootstrap.log
exec > >(tee -a $LOG) 2>&1

echo "[$(date)] === Bootstrap start ==="

# Skip if already complete
if [ -f /tmp/bootstrap-complete ] && command -v google-chrome-stable >/dev/null && ldconfig -p | grep -q libGLX_nvidia; then
  echo "Bootstrap already complete (marker file + chrome + nvidia-gl all present)"
  echo "[$(date)] === Bootstrap done (skipped) ==="
  exit 0
fi

apt-get update -qq

# Step 1: core utilities
echo "[1/5] Core utilities..."
apt-get install -y -qq curl wget git ca-certificates gnupg ffmpeg tmux bc rsync vim

# Step 2: Node.js 22
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | cut -dv -f2 | cut -d. -f1)" != "22" ]; then
  echo "[2/5] Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
echo "Node: $(node -v)"

# Step 3: pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9 2>&1 | tail -1
fi
echo "pnpm: $(pnpm -v)"

# Step 4: Chrome stable
if ! command -v google-chrome-stable >/dev/null 2>&1; then
  echo "[3/5] Google Chrome stable..."
  wget -q -O /tmp/chrome-key.pub https://dl-ssl.google.com/linux/linux_signing_key.pub
  gpg --dearmor < /tmp/chrome-key.pub > /usr/share/keyrings/google-chrome.gpg
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
    > /etc/apt/sources.list.d/google-chrome.list
  apt-get update -qq
  apt-get install -y -qq google-chrome-stable
fi
echo "Chrome: $(google-chrome-stable --version)"

# Step 5: Chrome runtime + EGL deps
echo "[4/5] Chrome runtime deps..."
apt-get install -y -qq \
  libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 \
  libnss3 libgtk-3-0t64 libxss1 libxtst6 xdg-utils \
  libxkbcommon0 fonts-liberation libdrm2 libgbm1 \
  libgl1 libegl1 libgles2 libglvnd0 libglx0 libopengl0 \
  libvulkan1 vulkan-tools mesa-vulkan-drivers >/dev/null 2>&1

# Step 6: NVIDIA GL libraries (CRITICAL — Vast.ai NVIDIA CUDA template doesn't include these)
echo "[5/5] NVIDIA GL libraries (libnvidia-gl-580-server manual extract)..."
if ! ldconfig -p | grep -q libGLX_nvidia; then
  cd /tmp
  apt-get download libnvidia-gl-580-server >/dev/null 2>&1
  mkdir -p /tmp/nvidia-gl
  dpkg-deb -x libnvidia-gl-580-server*.deb /tmp/nvidia-gl/

  # Copy GL/EGL/Vulkan libraries that aren't already mounted by Vast.ai
  for f in /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libGLX_nvidia.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libEGL_nvidia.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libGLESv1_CM_nvidia.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libGLESv2_nvidia.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-glcore.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-eglcore.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-glsi.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-tls.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-rtcore.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvidia-glvkspirv.so* \
           /tmp/nvidia-gl/usr/lib/x86_64-linux-gnu/libnvoptix.so*; do
    [ -e "$f" ] && cp -a "$f" /usr/lib/x86_64-linux-gnu/ 2>/dev/null
  done

  # Copy ICD JSON files
  mkdir -p /usr/share/glvnd/egl_vendor.d /usr/share/vulkan/icd.d
  for f in /tmp/nvidia-gl/usr/share/glvnd/egl_vendor.d/*.json; do
    [ -e "$f" ] && cp -a "$f" /usr/share/glvnd/egl_vendor.d/
  done
  for f in /tmp/nvidia-gl/usr/share/vulkan/icd.d/*.json; do
    [ -e "$f" ] && cp -a "$f" /usr/share/vulkan/icd.d/
  done

  ldconfig
fi

# Verify
echo ""
echo "=== Verification ==="
nvidia-smi --query-gpu=name --format=csv,noheader
echo "GL_NVIDIA libraries: $(ldconfig -p | grep -c libGLX_nvidia) found"
vulkaninfo --summary 2>&1 | grep "deviceName.*NVIDIA" | head -1 || echo "Vulkan: NVIDIA not found"

touch /tmp/bootstrap-complete
echo "[$(date)] === Bootstrap complete ==="
