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
WITH_OVERLAYS=false
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
    --with-overlays)  WITH_OVERLAYS=true; shift;;
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
echo ""
echo "  Mode A (default): Rust shaders only + audio mux"
echo "    Fast (10-35fps GPU). No text/overlays."
echo "    Steps: manifest → Rust render → audio mux"
echo ""
echo "  Mode B (--with-overlays): Rust shaders + Remotion overlays"
echo "    Requires alpha-capable codec (ProRes 4444 or PNG seq)."
echo "    Steps: manifest → Rust render → Remotion overlays → composite → audio"
echo ""
echo "  Mode C (--remotion-only): Full Remotion render"
echo "    Slowest but includes ALL text/overlays/cards."
echo "    Steps: Remotion render → audio mux"
echo "═══════════════════════════════════════════════════════════"
echo "  Data:    $DATA_DIR"
echo "  Output:  $OUTPUT"
echo "  Size:    ${WIDTH}x${HEIGHT} @ ${FPS}fps"
echo "  CRF:     $CRF"
echo "  Work:    $WORK_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── STEP 1: Generate manifest ────────────────────────────────────
echo "┌─ Step 1/5: Generate manifest (parallel)"
if [[ -f "$MANIFEST" ]] && [[ $(python3 -c "import json; print(len(json.load(open('$MANIFEST')).get('frames',[])))" 2>/dev/null) -gt 0 ]]; then
  echo "│  ✓ Manifest exists with frames, skipping (delete to regenerate)"
else
  echo "│  Running parallel manifest generator..."
  # Manifest generator now lives in @dead-air/manifest-generator (sibling package).
  cd "$RENDERER_DIR/../manifest-generator"
  NCPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)
  WORKERS=$((NCPU > 2 ? NCPU - 1 : 1))
  echo "│  Concurrency: $WORKERS workers"
  npx tsx generate-manifest-parallel.ts \
    --data-dir "$DATA_DIR" \
    --output "$MANIFEST" \
    --fps "$FPS" \
    --width "$WIDTH" \
    --height "$HEIGHT" \
    --concurrency "$WORKERS"
  echo "│  ✓ Manifest: $(du -h "$MANIFEST" | cut -f1)"
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
OVERLAYS_MP4="$WORK_DIR/overlays.mp4"
if [[ "$WITH_OVERLAYS" != "true" ]]; then
  echo "│  ⏭ Skipped (pass --with-overlays to enable Mode B)"
elif [[ "$SKIP_OVERLAYS" == "true" ]]; then
  echo "│  ⏭ Skipped (--skip-overlays)"
elif [[ -f "$OVERLAYS_MP4" ]]; then
  echo "│  ✓ Overlays MP4 exists, skipping (delete to re-render)"
else
  echo "│  Rendering text/overlay layers via Remotion (OVERLAY_ONLY mode)..."
  echo "│  This uses the existing Remotion pipeline with shaders disabled."
  echo "│  Text, overlays, and cards render on transparent background."
  echo "│"
  cd "$RENDERER_DIR/.."

  # Use the existing CLI produce command with --renderer=remotion and OVERLAY_ONLY=true
  # This renders per-song compositions then concatenates, same as a normal Remotion render
  # but with OVERLAY_ONLY=true so SongVisualizer skips shaders
  OVERLAY_ONLY=true \
  RENDER_WIDTH=$WIDTH RENDER_HEIGHT=$HEIGHT RENDER_FPS=$FPS \
  npx tsx packages/cli/src/commands/produce.ts render \
    --data-dir "$DATA_DIR" \
    --output "$OVERLAYS_MP4" \
    --renderer remotion \
    --codec prores \
    --prores-profile 4444 \
    2>&1 | tail -10

  # If prores with alpha isn't available, fall back to PNG sequence
  if [[ ! -f "$OVERLAYS_MP4" ]]; then
    echo "│  ProRes 4444 failed, falling back to H.264 overlay render..."
    OVERLAY_ONLY=true \
    RENDER_WIDTH=$WIDTH RENDER_HEIGHT=$HEIGHT RENDER_FPS=$FPS \
    npx tsx packages/cli/src/commands/produce.ts render \
      --data-dir "$DATA_DIR" \
      --output "$OVERLAYS_MP4" \
      --renderer remotion \
      2>&1 | tail -10
  fi

  if [[ -f "$OVERLAYS_MP4" ]]; then
    echo "│  ✓ Overlays: $(du -h "$OVERLAYS_MP4" | cut -f1)"
  else
    echo "│  ⚠ Overlay render failed — continuing without overlays"
  fi
fi
echo "└─"
echo ""

# ─── STEP 4: FFmpeg composite ────────────────────────────────────
echo "┌─ Step 4/5: FFmpeg composite (shaders + overlays)"
if [[ "$WITH_OVERLAYS" != "true" ]]; then
  echo "│  ⏭ Skipped (no overlays to composite)"
  COMPOSITE_MP4="$SHADERS_MP4"
elif [[ "$SKIP_COMPOSITE" == "true" ]]; then
  echo "│  ⏭ Skipped (--skip-composite)"
  COMPOSITE_MP4="$SHADERS_MP4"
elif [[ ! -f "$SHADERS_MP4" ]]; then
  echo "│  ⚠ No shaders MP4 — using overlays only"
  COMPOSITE_MP4="$OVERLAYS_MP4"
elif [[ ! -f "$OVERLAYS_MP4" ]]; then
  echo "│  ⚠ No overlays MP4 — using shaders only"
  COMPOSITE_MP4="$SHADERS_MP4"
else
  echo "│  Compositing overlays over shaders..."
  ffmpeg -y \
    -i "$SHADERS_MP4" \
    -i "$OVERLAYS_MP4" \
    -filter_complex "[0:v][1:v]overlay=0:0:format=auto:shortest=1" \
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
