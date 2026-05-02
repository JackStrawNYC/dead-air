#!/usr/bin/env bash
# dead-air-render — single-command end-to-end render orchestrator (audit Wave 3.4).
#
# Wraps the pipeline: analysis → manifest → render → mux. Picks Docker for
# environment parity when available; falls back to local toolchains otherwise.
#
# Usage:
#   scripts/dead-air-render.sh \
#     --show 1972-08-27 \
#     --output ./out/veneta.mp4 \
#     --width 3840 --height 2160 --fps 60
#
# Steps the script will skip if outputs already exist:
#   1. Per-song analysis JSON  (data/tracks/<song>-analysis.json)
#   2. Manifest                (out/<show>/manifest.msgpack)
#   3. Render MP4              (the --output target)

set -euo pipefail

SHOW=""
OUTPUT=""
WIDTH=1920
HEIGHT=1080
FPS=30
SCENE_SCALE=1.0
USE_DOCKER="auto"
SKIP_ANALYSIS=false
SKIP_MANIFEST=false
SKIP_RENDER=false
STRICT_OVERLAYS=false
STRICT_SHADERS=false
STRICT_DIMENSIONS=false
VALIDATE_ONLY=false
GPU_OVERLAYS=false
NO_ADAPTIVE_SCALE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") --show <id> --output <mp4> [options]

Required:
  --show <id>             Show identifier (e.g. 1972-08-27)
  --output <path>         Final MP4 destination

Resolution/timing:
  --width <px>            Output width  (default 1920)
  --height <px>           Output height (default 1080)
  --fps <n>               Output FPS    (default 30)
  --scene-scale <0..1>    Render scene at this fraction of output (LOD)

Toolchain:
  --docker                Force Docker for everything
  --no-docker             Force local toolchain
  (default: auto-detect)

Skip switches (for resuming):
  --skip-analysis
  --skip-manifest
  --skip-render

Quality gates:
  --strict-overlays       Abort if overlay PNGs are missing
  --strict-shaders        Abort if any frame's shader_id is missing
  --strict-dimensions     Abort if manifest WxH/fps disagree with CLI args
  --strict-all            Enable all three --strict-* gates
  --validate-only         Run pre-flight checks only; skip the render

Performance:
  --gpu-overlays          GPU-side overlay compositing (Wave 4.1)
  --no-adaptive-scale     Skip manifest-aware --scene-scale lowering
                          (use --scene-scale verbatim)
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --show)             SHOW="$2"; shift 2;;
    --output)           OUTPUT="$2"; shift 2;;
    --width)            WIDTH="$2"; shift 2;;
    --height)           HEIGHT="$2"; shift 2;;
    --fps)              FPS="$2"; shift 2;;
    --scene-scale)      SCENE_SCALE="$2"; shift 2;;
    --docker)           USE_DOCKER="yes"; shift;;
    --no-docker)        USE_DOCKER="no"; shift;;
    --skip-analysis)    SKIP_ANALYSIS=true; shift;;
    --skip-manifest)    SKIP_MANIFEST=true; shift;;
    --skip-render)      SKIP_RENDER=true; shift;;
    --strict-overlays)  STRICT_OVERLAYS=true; shift;;
    --strict-shaders)   STRICT_SHADERS=true; shift;;
    --strict-dimensions) STRICT_DIMENSIONS=true; shift;;
    --strict-all)       STRICT_OVERLAYS=true; STRICT_SHADERS=true; STRICT_DIMENSIONS=true; shift;;
    --validate-only)    VALIDATE_ONLY=true; shift;;
    --gpu-overlays)     GPU_OVERLAYS=true; shift;;
    --no-adaptive-scale) NO_ADAPTIVE_SCALE=true; shift;;
    -h|--help)          usage;;
    *)                  echo "Unknown arg: $1"; usage;;
  esac
done

[[ -z "$SHOW" ]] && { echo "ERROR: --show required"; usage; }
[[ -z "$OUTPUT" ]] && { echo "ERROR: --output required"; usage; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${ROOT}/out/${SHOW}"
mkdir -p "$WORK" "$(dirname "$OUTPUT")"

MANIFEST="${WORK}/manifest.msgpack"
DATA_DIR="${ROOT}/packages/visualizer-poc/data/shows/${SHOW}"
TRACKS_DIR="${ROOT}/data/tracks"

# ─── Toolchain detection ───
if [[ "$USE_DOCKER" == "auto" ]]; then
  if command -v docker >/dev/null 2>&1; then
    USE_DOCKER="yes"
  else
    USE_DOCKER="no"
  fi
fi

cat <<EOF
═══════════════════════════════════════════════════
 Dead Air render — show ${SHOW}
   Output:  ${OUTPUT}
   Size:    ${WIDTH}x${HEIGHT} @ ${FPS}fps
   LOD:     scene_scale=${SCENE_SCALE}
   Docker:  ${USE_DOCKER}
═══════════════════════════════════════════════════
EOF

# ─── Step 1: analysis ───
if [[ "$SKIP_ANALYSIS" == "true" ]]; then
  echo "─ Step 1/3 [skipped]"
else
  echo "┌─ Step 1/3: per-song analysis"
  if [[ "$USE_DOCKER" == "yes" ]]; then
    cd "$ROOT/docker"
    docker compose run --rm analyze-show
    cd "$ROOT"
  else
    pushd "$ROOT/packages/pipeline/scripts" >/dev/null
    python3 batch_analyze.py "$DATA_DIR/setlist.json" "$TRACKS_DIR" || \
      echo "  (some songs already analyzed — continuing)"
    popd >/dev/null
  fi
  echo "└─"
fi

# ─── Step 2: manifest ───
if [[ "$SKIP_MANIFEST" == "true" ]]; then
  echo "─ Step 2/3 [skipped]"
elif [[ -f "$MANIFEST" ]]; then
  echo "─ Step 2/3 [cached: $MANIFEST]"
else
  echo "┌─ Step 2/3: manifest generation → $MANIFEST"
  if [[ "$USE_DOCKER" == "yes" ]]; then
    cd "$ROOT/docker"
    docker compose run --rm \
      -v "$ROOT/data:/data/in:ro" \
      -v "$ROOT/out/${SHOW}:/data/out" \
      generate-manifest \
      --data-dir /data/in \
      --output /data/out/manifest.msgpack \
      --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"
    cd "$ROOT"
  else
    cd "$ROOT/packages/manifest-generator"
    npx tsx generate-manifest-parallel.ts \
      --data-dir "$ROOT/data" \
      --output "$MANIFEST" \
      --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"
    cd "$ROOT"
  fi
  echo "└─ ✓ manifest: $(ls -lh "$MANIFEST" | awk '{print $5}')"
fi

# ─── Step 3: render + mux ───
if [[ "$SKIP_RENDER" == "true" ]]; then
  echo "─ Step 3/3 [skipped]"
else
  echo "┌─ Step 3/3: GPU render → $OUTPUT"
  RENDER_ARGS=(
    --manifest "$MANIFEST"
    --output "$OUTPUT"
    --width "$WIDTH"
    --height "$HEIGHT"
    --fps "$FPS"
    --scene-scale "$SCENE_SCALE"
  )
  [[ "$STRICT_OVERLAYS" == "true" ]] && RENDER_ARGS+=(--strict-overlays)
  [[ "$STRICT_SHADERS" == "true" ]] && RENDER_ARGS+=(--strict-shaders)
  [[ "$STRICT_DIMENSIONS" == "true" ]] && RENDER_ARGS+=(--strict-dimensions)
  [[ "$VALIDATE_ONLY" == "true" ]] && RENDER_ARGS+=(--validate-only)
  [[ "$GPU_OVERLAYS" == "true" ]] && RENDER_ARGS+=(--gpu-overlays)
  [[ "$NO_ADAPTIVE_SCALE" == "true" ]] && RENDER_ARGS+=(--no-adaptive-scale)

  if [[ "$USE_DOCKER" == "yes" ]] && command -v nvidia-smi >/dev/null 2>&1; then
    cd "$ROOT/docker"
    DOCKER_RENDER_ARGS=(
      --manifest /data/manifest.msgpack
      --output "/data/$(basename "$OUTPUT")"
      --width "$WIDTH" --height "$HEIGHT" --fps "$FPS"
      --scene-scale "$SCENE_SCALE"
    )
    [[ "$STRICT_OVERLAYS" == "true" ]] && DOCKER_RENDER_ARGS+=(--strict-overlays)
    [[ "$STRICT_SHADERS" == "true" ]] && DOCKER_RENDER_ARGS+=(--strict-shaders)
    [[ "$STRICT_DIMENSIONS" == "true" ]] && DOCKER_RENDER_ARGS+=(--strict-dimensions)
    [[ "$VALIDATE_ONLY" == "true" ]] && DOCKER_RENDER_ARGS+=(--validate-only)
    [[ "$GPU_OVERLAYS" == "true" ]] && DOCKER_RENDER_ARGS+=(--gpu-overlays)
    [[ "$NO_ADAPTIVE_SCALE" == "true" ]] && DOCKER_RENDER_ARGS+=(--no-adaptive-scale)
    docker compose run --rm \
      -v "$ROOT/out/${SHOW}:/data" \
      render \
      "${DOCKER_RENDER_ARGS[@]}"
    cp "$ROOT/out/${SHOW}/$(basename "$OUTPUT")" "$OUTPUT"
    cd "$ROOT"
  else
    cd "$ROOT/packages/renderer"
    if [[ ! -f "target/release/dead-air-renderer" ]]; then
      echo "  Building Rust renderer (release)..."
      cargo build --release
    fi
    ./target/release/dead-air-renderer "${RENDER_ARGS[@]}"
    cd "$ROOT"
  fi
  echo "└─ ✓ render complete: $OUTPUT"
fi

echo "═══════════════════════════════════════════════════"
echo " Done: $OUTPUT"
echo "═══════════════════════════════════════════════════"
