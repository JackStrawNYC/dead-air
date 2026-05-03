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
SKIP_MUX=false
LOUDNESS_TARGET="-14"
INTRO_SECONDS="0"
ENDCARD_SECONDS="0"
STRICT_OVERLAYS=false
STRICT_SHADERS=false
STRICT_DIMENSIONS=false
VALIDATE_ONLY=false
GPU_OVERLAYS=false
NO_ADAPTIVE_SCALE=false
SLOW_SCENE_SCALE=""
BUSTED_SCENE_SCALE=""
PARTICLES=""

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
  --skip-mux              Skip the audio mux step (output is silent video)
  --loudness <db>         LUFS target for mux normalization (default -14)
  --intro-seconds <s>     Length of silent intro to pad before music starts (sync with --with-intro)
  --endcard-seconds <s>   Length of silent endcard to pad after music ends (sync with --with-endcard)

Quality gates:
  --strict-overlays       Abort if overlay PNGs are missing
  --strict-shaders        Abort if any frame's shader_id is missing
  --strict-dimensions     Abort if manifest WxH/fps disagree with CLI args
  --strict-all            Enable all three --strict-* gates
  --validate-only         Run pre-flight checks only; skip the render

Performance:
  --gpu-overlays          GPU-side overlay compositing (Wave 4.1)
  --no-adaptive-scale     Disable per-tier multi-scale rendering
  --slow-scene-scale <s>  Scale for SLOW-tier shaders (default 0.75)
  --busted-scene-scale <s> Scale for BUSTED-tier shaders (default 0.5)
  --particles <N>         GPU particle overlay count (0 = disabled, default 0)
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
    --skip-mux)         SKIP_MUX=true; shift;;
    --loudness)         LOUDNESS_TARGET="$2"; shift 2;;
    --intro-seconds)    INTRO_SECONDS="$2"; shift 2;;
    --endcard-seconds)  ENDCARD_SECONDS="$2"; shift 2;;
    --strict-overlays)  STRICT_OVERLAYS=true; shift;;
    --strict-shaders)   STRICT_SHADERS=true; shift;;
    --strict-dimensions) STRICT_DIMENSIONS=true; shift;;
    --strict-all)       STRICT_OVERLAYS=true; STRICT_SHADERS=true; STRICT_DIMENSIONS=true; shift;;
    --validate-only)    VALIDATE_ONLY=true; shift;;
    --gpu-overlays)     GPU_OVERLAYS=true; shift;;
    --no-adaptive-scale) NO_ADAPTIVE_SCALE=true; shift;;
    --slow-scene-scale) SLOW_SCENE_SCALE="$2"; shift 2;;
    --busted-scene-scale) BUSTED_SCENE_SCALE="$2"; shift 2;;
    --particles) PARTICLES="$2"; shift 2;;
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
  [[ -n "$SLOW_SCENE_SCALE" ]] && RENDER_ARGS+=(--slow-scene-scale "$SLOW_SCENE_SCALE")
  [[ -n "$BUSTED_SCENE_SCALE" ]] && RENDER_ARGS+=(--busted-scene-scale "$BUSTED_SCENE_SCALE")
  [[ -n "$PARTICLES" ]] && RENDER_ARGS+=(--particles "$PARTICLES")

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
    [[ -n "$SLOW_SCENE_SCALE" ]] && DOCKER_RENDER_ARGS+=(--slow-scene-scale "$SLOW_SCENE_SCALE")
    [[ -n "$BUSTED_SCENE_SCALE" ]] && DOCKER_RENDER_ARGS+=(--busted-scene-scale "$BUSTED_SCENE_SCALE")
    [[ -n "$PARTICLES" ]] && DOCKER_RENDER_ARGS+=(--particles "$PARTICLES")
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
  echo "└─ ✓ render complete: $OUTPUT (silent video)"
fi

# ─── Step 4: audio mux ───
# The Rust renderer outputs video-only. Without this step the final MP4
# is a 3-hour silent film. Mux concatenated per-song audio with loudness
# normalization (YouTube spec, -14 LUFS).
if [[ "$SKIP_MUX" == "true" ]] || [[ "$SKIP_RENDER" == "true" ]]; then
  echo "─ Step 4/4 [skipped] — output is silent video at $OUTPUT"
elif [[ ! -f "$OUTPUT" ]]; then
  echo "─ Step 4/4 [skipped] — render output not found at $OUTPUT"
else
  echo "┌─ Step 4/4: audio mux + loudness normalization"
  # Move the silent render aside; final muxed file takes the user's --output path.
  SILENT_VIDEO="${OUTPUT%.*}-silent.${OUTPUT##*.}"
  mv "$OUTPUT" "$SILENT_VIDEO"

  if "${ROOT}/scripts/mux-audio.sh" \
       --show "$SHOW" \
       --video "$SILENT_VIDEO" \
       --output "$OUTPUT" \
       --loudness "$LOUDNESS_TARGET" \
       --intro-seconds "$INTRO_SECONDS" \
       --endcard-seconds "$ENDCARD_SECONDS"; then
    rm -f "$SILENT_VIDEO"
    echo "└─ ✓ mux complete: $OUTPUT (with audio)"
  else
    # Mux failed — keep both files so user can retry mux without re-rendering.
    mv "$SILENT_VIDEO" "$OUTPUT"
    echo "└─ ✗ mux FAILED — keeping silent video at $OUTPUT" >&2
    echo "   Retry with: scripts/mux-audio.sh --show $SHOW --video $OUTPUT --output ${OUTPUT%.*}-final.${OUTPUT##*.}" >&2
    exit 4
  fi
fi

echo "═══════════════════════════════════════════════════"
echo " Done: $OUTPUT"
echo "═══════════════════════════════════════════════════"
