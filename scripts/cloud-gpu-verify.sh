#!/usr/bin/env bash
# Run ON the EC2 instance to verify GPU acceleration works for Remotion rendering.
#
# Exits 0 if GPU is good, 1 otherwise.
#
# Stages:
#   1. nvidia-smi works
#   2. EGL libraries installed
#   3. Chrome can launch with --use-gl=egl
#   4. Tiny render benchmark — measure actual frames-per-second
#
# Usage:
#   ssh user@instance 'bash -s' < cloud-gpu-verify.sh
# Or copy and run: bash cloud-gpu-verify.sh

set -e

REPO_DIR="${1:-$HOME/dead-air}"
VISUALIZER_DIR="$REPO_DIR/packages/visualizer-poc"

# Resolution selection: 1080p (default) or 4k via $RESOLUTION env var
RESOLUTION="${RESOLUTION:-1080p}"
if [ "$RESOLUTION" = "4k" ]; then
  BENCH_W=3840
  BENCH_H=2160
  RES_LABEL="4K (3840x2160)"
else
  BENCH_W=1920
  BENCH_H=1080
  RES_LABEL="1080p (1920x1080)"
fi

echo "=========================================="
echo "  Dead Air GPU Verification"
echo "  Resolution: $RES_LABEL"
echo "=========================================="
echo ""

# ─── 1. nvidia-smi ───
echo "[1/4] nvidia-smi check..."
if ! nvidia-smi 2>&1 | head -20; then
  echo ""
  echo "FAIL: nvidia-smi not working. NVIDIA driver missing or broken."
  exit 1
fi
GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
echo "GPU: $GPU_NAME"
echo ""

# ─── 2. EGL libraries ───
echo "[2/4] EGL libraries check..."
EGL_LIB=$(ldconfig -p 2>/dev/null | grep -E "libEGL\.so" | head -1 || echo "")
if [ -z "$EGL_LIB" ]; then
  echo "FAIL: libEGL not found in ldconfig. Install: sudo apt-get install -y libegl1 libgles2"
  exit 1
fi
echo "EGL: $EGL_LIB"
GLES_LIB=$(ldconfig -p 2>/dev/null | grep -E "libGLESv2\.so" | head -1 || echo "")
echo "GLES: $GLES_LIB"
echo ""

# ─── 3. Chrome binary check ───
echo "[3/4] Chrome binary check..."
# Prefer real Chrome > chrome-headless-shell. Real Chrome has better GPU support.
CHROME_BIN=""
for candidate in google-chrome-stable google-chrome chromium chromium-browser; do
  if command -v $candidate >/dev/null 2>&1; then
    CHROME_BIN=$(command -v $candidate)
    break
  fi
done
if [ -z "$CHROME_BIN" ] && [ -d "$VISUALIZER_DIR/node_modules" ]; then
  CHROME_BIN=$(find "$VISUALIZER_DIR/node_modules/.remotion" -name "chrome-headless-shell" -type f 2>/dev/null | head -1)
fi
if [ -z "$CHROME_BIN" ]; then
  echo "FAIL: No Chrome binary found. Install google-chrome-stable or run 'pnpm install' first."
  exit 1
fi
echo "Chrome: $CHROME_BIN"

# Quick GPU info dump from Chrome (to /tmp file so we can inspect)
echo "Dumping chrome://gpu info..."
mkdir -p /tmp/gpu-check
timeout 30 $CHROME_BIN \
  --headless=new \
  --no-sandbox \
  --disable-gpu-sandbox \
  --use-gl=egl \
  --enable-features=Vulkan \
  --enable-unsafe-webgpu \
  --ignore-gpu-blocklist \
  --user-data-dir=/tmp/gpu-check \
  --dump-dom \
  chrome://gpu 2>/dev/null > /tmp/gpu-check/gpu-info.html || true

if [ -s /tmp/gpu-check/gpu-info.html ]; then
  GL_RENDERER=$(grep -oP 'GL_RENDERER[^<]*' /tmp/gpu-check/gpu-info.html | head -1 || echo "")
  echo "GL_RENDERER: $GL_RENDERER"
  if echo "$GL_RENDERER" | grep -qi "swiftshader\|software\|llvmpipe"; then
    echo "WARN: Chrome reports software rasterizer, not hardware. EGL fallback path."
  elif echo "$GL_RENDERER" | grep -qi "nvidia\|tesla\|tegra"; then
    echo "OK: Chrome detected NVIDIA hardware via EGL"
  fi
else
  echo "WARN: Could not dump chrome://gpu (Chrome may not support --dump-dom)"
fi
echo ""

# ─── 4. Mini render benchmark ───
echo "[4/4] Mini render benchmark..."
echo "Rendering 60 frames (2 seconds) of d1t02 at $RES_LABEL with --gl=egl..."

if [ ! -d "$VISUALIZER_DIR" ]; then
  echo "FAIL: visualizer-poc not found at $VISUALIZER_DIR"
  exit 1
fi

cd "$VISUALIZER_DIR"

# Ensure bundle exists (build if needed)
if [ ! -f "out/bundle/index.html" ]; then
  echo "Building bundle (first time, takes 2-3 min)..."
  RENDER_WIDTH=$BENCH_W RENDER_HEIGHT=$BENCH_H npx remotion bundle src/entry.ts --out-dir=out/bundle 2>&1 | tail -5
fi

# Render benchmark — 60 frames, single worker, EGL
# Increase timeout for 4K (4x slower per frame)
BENCH_TIMEOUT=600
[ "$RESOLUTION" = "4k" ] && BENCH_TIMEOUT=2400

START=$(date +%s)
RENDER_WIDTH=$BENCH_W RENDER_HEIGHT=$BENCH_H timeout $BENCH_TIMEOUT npx remotion render \
  out/bundle \
  d1t02 \
  /tmp/bench-output.mp4 \
  --props=data/shows/1972-08-27/tracks/d1t02-analysis.json \
  --gl=egl \
  --concurrency=1 \
  --frames=0-59 \
  --muted 2>&1 | tail -15
EXIT_CODE=$?
END=$(date +%s)
DURATION=$((END - START))

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: Render failed (exit $EXIT_CODE)"
  exit 1
fi

if [ "$DURATION" -lt 1 ]; then DURATION=1; fi
FPS=$(awk "BEGIN { printf \"%.2f\", 60.0 / $DURATION }")

echo ""
echo "=========================================="
echo "  Benchmark Result"
echo "=========================================="
echo "  Resolution: $RES_LABEL"
echo "  Frames:     60"
echo "  Duration:   ${DURATION}s"
echo "  FPS:        $FPS"
echo "  GPU:        $GPU_NAME"
echo "=========================================="

# Estimate full Veneta render time (339,351 frames)
if (( $(awk "BEGIN { print ($FPS > 0) }") )); then
  EST_SEC=$(awk "BEGIN { printf \"%d\", 339351 / $FPS }")
  EST_HOURS=$(awk "BEGIN { printf \"%.1f\", $EST_SEC / 3600 }")
  echo "  Estimated full Veneta render: ${EST_HOURS} hours"
  echo "=========================================="
fi
echo ""

# Pass/fail thresholds — looser for 4K (slower per frame is normal)
if [ "$RESOLUTION" = "4k" ]; then
  FAIL_THRESHOLD=0.3
  WARN_THRESHOLD=0.8
else
  FAIL_THRESHOLD=1.0
  WARN_THRESHOLD=3.0
fi

if (( $(awk "BEGIN { print ($FPS < $FAIL_THRESHOLD) }") )); then
  echo "FAIL: rate is too slow ($FPS fps at $RES_LABEL). GPU is not being used effectively."
  echo "Check chrome://gpu output above. Likely software rasterizer fallback."
  exit 1
elif (( $(awk "BEGIN { print ($FPS < $WARN_THRESHOLD) }") )); then
  echo "WARN: rate is acceptable but slow ($FPS fps at $RES_LABEL). GPU may be partially working."
  echo "Full render is feasible but slower than expected."
  exit 0
else
  echo "PASS: GPU acceleration is working ($FPS fps at $RES_LABEL). Ready for full render."
  exit 0
fi
