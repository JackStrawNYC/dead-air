#!/bin/bash
#
# render-show.sh — Full show render pipeline (composite approach)
#
# Three-pass rendering:
#   Pass 1: Rust/wgpu renders shaders → shaders.mp4 (fast, GPU-native)
#   Pass 2: Remotion renders text/overlays → overlays PNG sequence (transparent)
#   Pass 3: FFmpeg composites overlays over shaders + muxes audio → final.mp4
#
# Usage:
#   cd packages/renderer
#   bash render-show.sh --data-dir /path/to/show-data --output /path/to/output.mp4
#
# Required:
#   - Rust renderer built (cargo build --release)
#   - Node.js + npx available
#   - FFmpeg installed
#   - Show data directory with analysis JSON + audio file
#

set -euo pipefail

# ─── CLI ARGS ─────────────────────────────────────────────────────
DATA_DIR=""
OUTPUT=""
WIDTH=3840
HEIGHT=2160
FPS=60
CRF=18
SKIP_SHADERS=false
SKIP_OVERLAYS=false
SKIP_COMPOSITE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data-dir)   DATA_DIR="$2"; shift 2;;
    --output)     OUTPUT="$2"; shift 2;;
    --width)      WIDTH="$2"; shift 2;;
    --height)     HEIGHT="$2"; shift 2;;
    --fps)        FPS="$2"; shift 2;;
    --crf)        CRF="$2"; shift 2;;
    --skip-shaders)   SKIP_SHADERS=true; shift;;
    --skip-overlays)  SKIP_OVERLAYS=true; shift;;
    --skip-composite) SKIP_COMPOSITE=true; shift;;
    --1080p)      WIDTH=1920; HEIGHT=1080; shift;;
    --4k)         WIDTH=3840; HEIGHT=2160; shift;;
    *)            echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "$DATA_DIR" || -z "$OUTPUT" ]]; then
  echo "Usage: render-show.sh --data-dir <path> --output <path> [--1080p|--4k] [--fps 60]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RENDERER_DIR="$SCRIPT_DIR"
VISUALIZER_DIR="$SCRIPT_DIR/../visualizer-poc"
WORK_DIR="$(dirname "$OUTPUT")/.render-work"
MANIFEST="$WORK_DIR/manifest.json"
SHADERS_MP4="$WORK_DIR/shaders.mp4"
OVERLAYS_DIR="$WORK_DIR/overlays"
COMPOSITE_MP4="$WORK_DIR/composite.mp4"

mkdir -p "$WORK_DIR" "$OVERLAYS_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "  Dead Air — Full Show Render Pipeline"
echo "═══════════════════════════════════════════════════════════"
echo "  Data:    $DATA_DIR"
echo "  Output:  $OUTPUT"
echo "  Size:    ${WIDTH}x${HEIGHT} @ ${FPS}fps"
echo "  CRF:     $CRF"
echo "  Work:    $WORK_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── STEP 1: Generate manifest ────────────────────────────────────
echo "┌─ Step 1/5: Generate manifest"
if [[ ! -f "$MANIFEST" ]]; then
  echo "│  Running manifest generator..."
  cd "$RENDERER_DIR"
  npx tsx generate-full-manifest.ts \
    --data-dir "$DATA_DIR" \
    --output "$MANIFEST" \
    --fps "$FPS" \
    --width "$WIDTH" \
    --height "$HEIGHT"
  echo "│  ✓ Manifest: $(du -h "$MANIFEST" | cut -f1)"
else
  echo "│  ✓ Manifest exists, skipping (delete to regenerate)"
fi
echo "└─"
echo ""

# ─── STEP 2: Rust GPU shader render ──────────────────────────────
echo "┌─ Step 2/5: Rust shader render"
if [[ "$SKIP_SHADERS" == "true" ]]; then
  echo "│  ⏭ Skipped (--skip-shaders)"
elif [[ -f "$SHADERS_MP4" ]]; then
  echo "│  ✓ Shaders MP4 exists, skipping (delete to re-render)"
else
  echo "│  Rendering shaders via Rust/wgpu..."
  cd "$RENDERER_DIR"
  RUST_BINARY="$RENDERER_DIR/target/release/dead-air-renderer"
  if [[ ! -f "$RUST_BINARY" ]]; then
    echo "│  Building Rust renderer..."
    cargo build --release 2>&1 | tail -3
  fi
  time "$RUST_BINARY" \
    --manifest "$MANIFEST" \
    --output "$SHADERS_MP4" \
    --width "$WIDTH" \
    --height "$HEIGHT" \
    --fps "$FPS" \
    --crf "$CRF"
  echo "│  ✓ Shaders: $(du -h "$SHADERS_MP4" | cut -f1)"
fi
echo "└─"
echo ""

# ─── STEP 3: Remotion text/overlay render ─────────────────────────
echo "┌─ Step 3/5: Remotion text/overlay render"
if [[ "$SKIP_OVERLAYS" == "true" ]]; then
  echo "│  ⏭ Skipped (--skip-overlays)"
elif [[ -f "$OVERLAYS_DIR/done.marker" ]]; then
  echo "│  ✓ Overlays exist, skipping (delete done.marker to re-render)"
else
  echo "│  Rendering text/overlay layers via Remotion..."
  cd "$VISUALIZER_DIR"

  # Get total frame count from manifest
  TOTAL_FRAMES=$(node -e "
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
    console.log(m.frames ? m.frames.length : 0);
  ")
  echo "│  Total frames: $TOTAL_FRAMES"

  # Render the full show composition as a transparent PNG sequence
  # Only the text/overlay layers render (shaders are replaced by transparent bg)
  RENDER_WIDTH=$WIDTH RENDER_HEIGHT=$HEIGHT RENDER_FPS=$FPS \
  npx remotion render src/entry.ts FullShowOverlays \
    --output "$OVERLAYS_DIR/frame-%06d.png" \
    --image-format png \
    --every-nth-frame 1 \
    --concurrency 4 \
    --log error \
    2>&1 | tail -5

  touch "$OVERLAYS_DIR/done.marker"
  OVERLAY_COUNT=$(ls "$OVERLAYS_DIR"/*.png 2>/dev/null | wc -l)
  echo "│  ✓ Overlays: $OVERLAY_COUNT frames"
fi
echo "└─"
echo ""

# ─── STEP 4: FFmpeg composite ────────────────────────────────────
echo "┌─ Step 4/5: FFmpeg composite (shaders + overlays)"
if [[ "$SKIP_COMPOSITE" == "true" ]]; then
  echo "│  ⏭ Skipped (--skip-composite)"
  COMPOSITE_MP4="$SHADERS_MP4"
elif [[ ! -f "$SHADERS_MP4" ]]; then
  echo "│  ⚠ No shaders MP4, using overlays-only"
  COMPOSITE_MP4="$SHADERS_MP4"
else
  echo "│  Compositing overlays over shaders..."
  ffmpeg -y \
    -i "$SHADERS_MP4" \
    -framerate "$FPS" -i "$OVERLAYS_DIR/frame-%06d.png" \
    -filter_complex "[0:v][1:v]overlay=0:0:format=auto" \
    -c:v libx264 -preset slow -crf "$CRF" \
    -pix_fmt yuv420p -movflags +faststart \
    "$COMPOSITE_MP4" \
    2>&1 | tail -5
  echo "│  ✓ Composite: $(du -h "$COMPOSITE_MP4" | cut -f1)"
fi
echo "└─"
echo ""

# ─── STEP 5: Audio mux ──────────────────────────────────────────
echo "┌─ Step 5/5: Audio mux"
AUDIO_FILE=""
for ext in flac mp3 wav m4a; do
  candidate="$DATA_DIR/audio/show.$ext"
  if [[ -f "$candidate" ]]; then
    AUDIO_FILE="$candidate"
    break
  fi
done
# Also check for any audio file in the audio dir
if [[ -z "$AUDIO_FILE" ]]; then
  AUDIO_FILE=$(find "$DATA_DIR/audio" -type f \( -name "*.flac" -o -name "*.mp3" -o -name "*.wav" \) | head -1)
fi

if [[ -z "$AUDIO_FILE" ]]; then
  echo "│  ⚠ No audio file found in $DATA_DIR/audio/"
  echo "│  Copying video without audio..."
  cp "$COMPOSITE_MP4" "$OUTPUT"
else
  echo "│  Audio: $AUDIO_FILE"
  ffmpeg -y \
    -i "$COMPOSITE_MP4" \
    -i "$AUDIO_FILE" \
    -c:v copy -c:a aac -b:a 256k \
    -shortest -movflags +faststart \
    "$OUTPUT" \
    2>&1 | tail -3
  echo "│  ✓ Final: $(du -h "$OUTPUT" | cut -f1)"
fi
echo "└─"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  ✓ Done: $OUTPUT"
echo "═══════════════════════════════════════════════════════════"
