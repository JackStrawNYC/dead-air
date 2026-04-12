#!/bin/bash
#
# render-textures.sh — Batch render all texture PNGs for the TextureImage overlay pipeline.
#
# Generates 1920x1080 transparent PNGs from algorithmic texture components.
# Each texture type has multiple variants for visual variety across shows.
#
# Output: public/assets/textures/*.png
#
# Usage:
#   cd packages/visualizer-poc
#   bash scripts/render-textures.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$PROJECT_DIR/public/assets/textures"

mkdir -p "$OUT_DIR"

echo "=== Rendering texture PNGs to $OUT_DIR ==="
echo ""

TEXTURES=(
  "LiquidLightTexture:5"
  "TieDyeFabricTexture:5"
  "SmokeHazeTexture:4"
  "PsychedelicPosterTexture:5"
)

TOTAL=0
for spec in "${TEXTURES[@]}"; do
  IFS=":" read -r name count <<< "$spec"
  TOTAL=$((TOTAL + count))
done

CURRENT=0
FAILED=0

for spec in "${TEXTURES[@]}"; do
  IFS=":" read -r name count <<< "$spec"

  for v in $(seq 1 "$count"); do
    CURRENT=$((CURRENT + 1))

    # Convert CamelCase to kebab-case for filename
    kebab=$(echo "$name" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
    outfile="$OUT_DIR/${kebab}-${v}.png"

    echo "[$CURRENT/$TOTAL] Rendering ${name} variant ${v}..."

    if npx remotion still src/overlay-entry.ts TexturePreview \
      --frame 0 \
      --output "$outfile" \
      --image-format png \
      --props "{\"textureName\":\"${name}\",\"variant\":${v}}" \
      --log=error 2>&1; then

      size=$(du -h "$outfile" | cut -f1)
      echo "  ✓ ${outfile##*/} (${size})"
    else
      echo "  ✗ FAILED: ${name} variant ${v}"
      FAILED=$((FAILED + 1))
    fi
  done
done

echo ""
echo "=== Done: $((TOTAL - FAILED))/$TOTAL textures rendered ==="
if [ "$FAILED" -gt 0 ]; then
  echo "WARNING: $FAILED textures failed to render"
  exit 1
fi

echo ""
echo "Generated textures:"
ls -lh "$OUT_DIR"/*.png 2>/dev/null || echo "  (none)"
