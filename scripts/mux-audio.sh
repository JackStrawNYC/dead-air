#!/usr/bin/env bash
# mux-audio.sh — concatenate per-song audio files in setlist order and mux
# onto a rendered video. Without this, dead-air-render.sh produces a silent
# 3-hour MP4. Called by dead-air-render.sh after the Rust render completes;
# can also be run standalone.
#
# Usage:
#   scripts/mux-audio.sh \
#     --show 1972-08-27 \
#     --video /path/to/silent-render.mp4 \
#     --output /path/to/final-with-audio.mp4
#
# Notes:
# - Audio files resolved from packages/visualizer-poc/public/audio/<audioFile>.
# - Concatenated audio is loudness-normalized to -14 LUFS (YouTube spec).
# - Video stream is copied (no re-encode); audio re-encoded to AAC 320k.
# - -shortest used so audio truncates to video length (manifest-gen trims dead
#   air per song, video is shorter than raw audio sum). Drift is bounded by
#   the per-song trim values (typically <2s per song = up to ~45s show-wide).

set -euo pipefail

SHOW=""
VIDEO=""
OUTPUT=""
LOUDNESS_TARGET="-14"   # LUFS — YouTube target
DRY_RUN=false

usage() {
  cat <<EOF
Usage: $(basename "$0") --show <id> --video <silent.mp4> --output <final.mp4>

Required:
  --show <id>       Show identifier (must exist at packages/visualizer-poc/data/shows/<id>)
  --video <path>    Silent video output from dead-air-renderer
  --output <path>   Final MP4 with audio muxed

Options:
  --loudness <db>   LUFS target for normalization (default: -14, YouTube spec)
  --dry-run         Print the concat list + ffmpeg command without running
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --show)     SHOW="$2"; shift 2;;
    --video)    VIDEO="$2"; shift 2;;
    --output)   OUTPUT="$2"; shift 2;;
    --loudness) LOUDNESS_TARGET="$2"; shift 2;;
    --dry-run)  DRY_RUN=true; shift;;
    -h|--help)  usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

[[ -z "$SHOW" || -z "$VIDEO" || -z "$OUTPUT" ]] && usage

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETLIST="${ROOT}/packages/visualizer-poc/data/shows/${SHOW}/setlist.json"
AUDIO_ROOT="${ROOT}/packages/visualizer-poc/public/audio"

[[ ! -f "$SETLIST" ]] && { echo "ERROR: setlist not found: $SETLIST"; exit 1; }
[[ ! -f "$VIDEO" ]] && { echo "ERROR: video not found: $VIDEO"; exit 1; }
mkdir -p "$(dirname "$OUTPUT")"

# Build the ffmpeg concat list from setlist.json.
# Skip songs where the audio file is missing (warn, continue).
CONCAT_LIST="$(mktemp -t deadair-concat-XXXXXX.txt)"
trap 'rm -f "$CONCAT_LIST"' EXIT

MISSING=0
TOTAL=0
while IFS=$'\t' read -r title relpath; do
  TOTAL=$((TOTAL + 1))
  abspath="${AUDIO_ROOT}/${relpath}"
  if [[ ! -f "$abspath" ]]; then
    echo "  WARN: missing audio for '${title}' → ${relpath}" >&2
    MISSING=$((MISSING + 1))
    continue
  fi
  # ffconcat: each `file` line takes a single-quote-escaped path.
  # Single quote → '\''
  esc="${abspath//\'/\'\\\'\'}"
  printf "file '%s'\n" "$esc" >> "$CONCAT_LIST"
done < <(jq -r '.songs[] | "\(.title)\t\(.audioFile)"' "$SETLIST")

if [[ $MISSING -gt 0 ]]; then
  echo "  WARN: ${MISSING}/${TOTAL} songs have missing audio — continuing with available tracks" >&2
fi
if [[ ! -s "$CONCAT_LIST" ]]; then
  echo "ERROR: no audio files found for show ${SHOW}; aborting mux" >&2
  exit 2
fi

# Probe the rendered video duration so we can sanity-check audio coverage.
VIDEO_DURATION_SEC=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO" 2>/dev/null || echo "0")
echo "Video: $(basename "$VIDEO") (${VIDEO_DURATION_SEC}s)"
echo "Audio: ${TOTAL} songs, ${MISSING} missing, $(wc -l < "$CONCAT_LIST" | tr -d ' ') tracks queued"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "--- concat list ---"
  cat "$CONCAT_LIST"
  echo "--- ffmpeg command ---"
  cat <<CMD
ffmpeg -y \\
  -i "$VIDEO" \\
  -f concat -safe 0 -i "$CONCAT_LIST" \\
  -c:v copy \\
  -c:a aac -b:a 320k -ar 48000 \\
  -af "loudnorm=I=${LOUDNESS_TARGET}:TP=-1.5:LRA=11" \\
  -map 0:v:0 -map 1:a:0 \\
  -shortest \\
  "$OUTPUT"
CMD
  exit 0
fi

# Mux + loudness normalize. -shortest truncates audio to video length.
# Two-pass loudnorm would be more accurate but doubles encode time; the
# single-pass default with TP=-1.5 (true peak) and LRA=11 (loudness range)
# is YouTube-acceptable for archival concert content.
ffmpeg -y -hide_banner -loglevel warning -stats \
  -i "$VIDEO" \
  -f concat -safe 0 -i "$CONCAT_LIST" \
  -c:v copy \
  -c:a aac -b:a 320k -ar 48000 \
  -af "loudnorm=I=${LOUDNESS_TARGET}:TP=-1.5:LRA=11" \
  -map 0:v:0 -map 1:a:0 \
  -shortest \
  "$OUTPUT"

# Verify the output has both streams.
HAS_VIDEO=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$OUTPUT" 2>/dev/null || echo "")
HAS_AUDIO=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$OUTPUT" 2>/dev/null || echo "")
OUTPUT_DURATION_SEC=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" 2>/dev/null || echo "0")

if [[ -z "$HAS_VIDEO" ]] || [[ -z "$HAS_AUDIO" ]]; then
  echo "ERROR: output missing streams — video=${HAS_VIDEO:-MISSING}, audio=${HAS_AUDIO:-MISSING}" >&2
  exit 3
fi

# Sync sanity: warn if duration diverges by > 5%.
if command -v python3 >/dev/null 2>&1; then
  DRIFT_PCT=$(python3 -c "v=float('${VIDEO_DURATION_SEC}' or 0); o=float('${OUTPUT_DURATION_SEC}' or 0); print(f'{abs(o-v)/max(v,0.01)*100:.1f}' if v>0 else '0')")
  if python3 -c "import sys; sys.exit(0 if float('${DRIFT_PCT}')>5.0 else 1)"; then
    echo "  WARN: output duration diverges from input video by ${DRIFT_PCT}% (${VIDEO_DURATION_SEC}s → ${OUTPUT_DURATION_SEC}s)" >&2
  fi
fi

OUT_SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')
echo "✓ Mux complete: $OUTPUT (${OUT_SIZE}, ${OUTPUT_DURATION_SEC}s, video=${HAS_VIDEO}, audio=${HAS_AUDIO})"
