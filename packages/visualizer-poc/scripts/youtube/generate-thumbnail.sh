#!/usr/bin/env bash
#
# generate-thumbnail.sh
#
# Generate YouTube thumbnails from rendered Dead Air visualizer videos.
# Extracts 5 candidate frames from visually interesting moments, composites
# text overlays (song title, band name, show info), and outputs 1280x720
# thumbnail images ready for YouTube upload.
#
# Usage:
#   ./generate-thumbnail.sh <VIDEO_PATH> <SONG_TITLE> [OUTPUT_PATH]
#
# Arguments:
#   VIDEO_PATH   Path to the rendered video file
#   SONG_TITLE   Song title to display on the thumbnail
#   OUTPUT_PATH  (Optional) Base output path for thumbnails. Defaults to
#                thumbnail.jpg in the same directory as the video.
#
# Outputs:
#   thumbnail_1.jpg through thumbnail_5.jpg  -- 5 candidate thumbnails
#   thumbnail.jpg                            -- best candidate (highest scene score)
#
# Requirements:
#   - ffmpeg / ffprobe
#   - ImageMagick (convert at /usr/local/bin/convert)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CONVERT="/usr/local/bin/convert"
THUMBNAIL_WIDTH=1280
THUMBNAIL_HEIGHT=720
THUMBNAIL_SIZE="${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}"

# Frame extraction points (percentage through the video)
FRAME_PERCENTS=(15 30 45 60 75)

# Text settings
FONT="Helvetica-Bold"
TITLE_SIZE=72
SUBTITLE_SIZE=48
INFO_SIZE=36
STROKE_WIDTH=3

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
usage() {
    echo "Usage: $(basename "$0") <VIDEO_PATH> <SONG_TITLE> [OUTPUT_PATH]"
    echo ""
    echo "Arguments:"
    echo "  VIDEO_PATH   Path to the rendered video file"
    echo "  SONG_TITLE   Song title to display on the thumbnail"
    echo "  OUTPUT_PATH  (Optional) Output path base (default: thumbnail.jpg next to video)"
    exit 1
}

log() {
    echo "[thumbnail] $*"
}

err() {
    echo "[thumbnail] ERROR: $*" >&2
}

check_dependencies() {
    local missing=0

    if ! command -v ffmpeg &>/dev/null; then
        err "ffmpeg not found in PATH"
        missing=1
    fi

    if ! command -v ffprobe &>/dev/null; then
        err "ffprobe not found in PATH"
        missing=1
    fi

    if [[ ! -x "$CONVERT" ]]; then
        # Fall back to convert in PATH
        if command -v convert &>/dev/null; then
            CONVERT="$(command -v convert)"
            log "Using convert at $CONVERT"
        else
            err "ImageMagick convert not found at $CONVERT or in PATH"
            missing=1
        fi
    fi

    if [[ $missing -ne 0 ]]; then
        err "Missing required dependencies. Install them and try again."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Get video duration in seconds
# ---------------------------------------------------------------------------
get_duration() {
    local video="$1"
    ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$video"
}

# ---------------------------------------------------------------------------
# Extract a single frame at a given timestamp
# ---------------------------------------------------------------------------
extract_frame() {
    local video="$1"
    local timestamp="$2"
    local output="$3"

    ffmpeg -y -v error \
        -ss "$timestamp" \
        -i "$video" \
        -frames:v 1 \
        -q:v 2 \
        "$output"
}

# ---------------------------------------------------------------------------
# Compute a simple "visual complexity" score for a frame.
# Uses the standard deviation of pixel luminance -- higher values mean more
# visual detail / contrast, which generally makes a more interesting thumbnail.
# ---------------------------------------------------------------------------
compute_complexity() {
    local image="$1"

    # Use ImageMagick to get the standard deviation of the grayscale channel.
    # The output of -format "%[fx:standard_deviation]" is a 0-1 float.
    "$CONVERT" "$image" -colorspace Gray -format "%[fx:standard_deviation]" info: 2>/dev/null || echo "0"
}

# ---------------------------------------------------------------------------
# Composite text and gradient overlay onto a frame
# ---------------------------------------------------------------------------
composite_thumbnail() {
    local input_frame="$1"
    local song_title="$2"
    local output_path="$3"

    # Build the composite in a single ImageMagick pipeline:
    #   1. Scale/crop the frame to exact thumbnail dimensions
    #   2. Add a gradient overlay at the bottom third for text legibility
    #   3. Render song title (large, white, black stroke)
    #   4. Render "Grateful Dead" subtitle
    #   5. Render show info line
    "$CONVERT" "$input_frame" \
        -resize "${THUMBNAIL_SIZE}^" \
        -gravity center \
        -extent "${THUMBNAIL_SIZE}" \
        \( -size "${THUMBNAIL_WIDTH}x360" \
           gradient:"rgba(0,0,0,0)-rgba(0,0,0,0.85)" \
           -flip \
        \) -gravity south -composite \
        -font "$FONT" \
        -gravity south \
        -strokewidth "$STROKE_WIDTH" \
        -stroke "rgba(0,0,0,0.9)" \
        -fill white \
        -pointsize "$INFO_SIZE" \
        -annotate +0+30 "Cornell '77  \xE2\x80\xA2  5/8/77" \
        -pointsize "$SUBTITLE_SIZE" \
        -annotate +0+75 "Grateful Dead" \
        -strokewidth $((STROKE_WIDTH + 1)) \
        -pointsize "$TITLE_SIZE" \
        -annotate +0+130 "$song_title" \
        "$output_path"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    # -- Parse arguments ------------------------------------------------------
    if [[ $# -lt 2 ]]; then
        usage
    fi

    local video_path="$1"
    local song_title="$2"
    local output_path="${3:-}"

    if [[ ! -f "$video_path" ]]; then
        err "Video file not found: $video_path"
        exit 1
    fi

    check_dependencies

    # Determine output directory and base name
    local video_dir
    video_dir="$(cd "$(dirname "$video_path")" && pwd)"

    if [[ -z "$output_path" ]]; then
        output_path="${video_dir}/thumbnail.jpg"
    fi

    local output_dir
    output_dir="$(dirname "$output_path")"
    local output_base
    output_base="$(basename "$output_path" .jpg)"

    mkdir -p "$output_dir"

    # -- Get video duration ---------------------------------------------------
    local duration
    duration="$(get_duration "$video_path")"

    if [[ -z "$duration" || "$duration" == "N/A" ]]; then
        err "Could not determine video duration."
        exit 1
    fi

    log "Video duration: ${duration}s"
    log "Song title:     $song_title"
    log "Output dir:     $output_dir"

    # -- Create temp directory for intermediate frames ------------------------
    local tmpdir
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT

    # -- Extract candidate frames ---------------------------------------------
    log "Extracting ${#FRAME_PERCENTS[@]} candidate frames..."

    local timestamps=()
    for pct in "${FRAME_PERCENTS[@]}"; do
        local ts
        ts="$(echo "$duration $pct" | awk '{printf "%.3f", $1 * $2 / 100}')"
        timestamps+=("$ts")
    done

    for i in "${!FRAME_PERCENTS[@]}"; do
        local idx=$((i + 1))
        local ts="${timestamps[$i]}"
        local pct="${FRAME_PERCENTS[$i]}"
        local frame_path="${tmpdir}/frame_${idx}.jpg"

        log "  Frame ${idx}: ${pct}% (${ts}s)"
        extract_frame "$video_path" "$ts" "$frame_path"
    done

    # -- Score frames by visual complexity ------------------------------------
    log "Scoring frames by visual complexity..."

    local best_idx=1
    local best_score="0"

    for i in "${!FRAME_PERCENTS[@]}"; do
        local idx=$((i + 1))
        local frame_path="${tmpdir}/frame_${idx}.jpg"
        local score

        if [[ ! -f "$frame_path" ]]; then
            log "  Frame ${idx}: MISSING (skipped)"
            continue
        fi

        score="$(compute_complexity "$frame_path")"
        log "  Frame ${idx}: complexity = ${score}"

        # Compare scores (awk handles float comparison)
        if echo "$score $best_score" | awk '{exit !($1 > $2)}'; then
            best_idx=$idx
            best_score="$score"
        fi
    done

    log "Best frame: #${best_idx} (score: ${best_score})"

    # -- Composite text onto all candidate frames -----------------------------
    log "Compositing thumbnails..."

    for i in "${!FRAME_PERCENTS[@]}"; do
        local idx=$((i + 1))
        local frame_path="${tmpdir}/frame_${idx}.jpg"
        local thumb_path="${output_dir}/${output_base}_${idx}.jpg"

        if [[ ! -f "$frame_path" ]]; then
            continue
        fi

        log "  -> ${thumb_path}"
        composite_thumbnail "$frame_path" "$song_title" "$thumb_path"
    done

    # -- Copy best candidate as the default thumbnail -------------------------
    local best_thumb="${output_dir}/${output_base}_${best_idx}.jpg"
    local default_thumb="${output_dir}/${output_base}.jpg"

    if [[ -f "$best_thumb" ]]; then
        cp "$best_thumb" "$default_thumb"
        log "Default thumbnail (best candidate): ${default_thumb}"
    fi

    # -- Summary --------------------------------------------------------------
    echo ""
    echo "======================================================================"
    echo "  Thumbnail generation complete"
    echo "======================================================================"
    echo ""
    echo "  Candidates:"
    for i in "${!FRAME_PERCENTS[@]}"; do
        local idx=$((i + 1))
        local pct="${FRAME_PERCENTS[$i]}"
        local marker=""
        if [[ $idx -eq $best_idx ]]; then
            marker=" <-- best (auto-selected)"
        fi
        echo "    ${output_base}_${idx}.jpg  (${pct}% through video)${marker}"
    done
    echo ""
    echo "  Default: ${default_thumb}"
    echo ""
    echo "  Review all 5 candidates and pick the one you like best."
    echo "  To use a different candidate as the final thumbnail:"
    echo "    cp ${output_base}_N.jpg ${output_base}.jpg"
    echo ""
    echo "======================================================================"
}

main "$@"
