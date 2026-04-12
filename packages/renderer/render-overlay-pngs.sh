#!/bin/bash
# Render top 20 overlay components to transparent PNGs using Remotion
# Output: /tmp/dead-air-overlays/<overlay_name>.png

set -e

OUTPUT_DIR="/tmp/dead-air-overlays"
mkdir -p "$OUTPUT_DIR"

cd "$(dirname "$0")/../visualizer-poc"

OVERLAYS=(
  BreathingStealie
  ThirteenPointBolt
  GodRays
  Fireflies
  TieDyeWash
  BearParade
  SkeletonBand
  MarchingTerrapins
  CosmicStarfield
  LavaLamp
  SkullKaleidoscope
  DarkStarPortal
  RoseOverlay
  LightningBoltOverlay
  StealYourFaceOff
  SacredGeometry
  VoronoiFlow
  FractalZoom
  MandalaGenerator
  StainedGlass
)

echo "Rendering ${#OVERLAYS[@]} overlays to $OUTPUT_DIR..."

for name in "${OVERLAYS[@]}"; do
  echo "  Rendering $name..."
  npx remotion still \
    --entry-point ../renderer/render-overlays.tsx \
    "Overlay_${name}" \
    --frame 15 \
    --output "${OUTPUT_DIR}/${name}.png" \
    --image-format png \
    --scale 1 \
    2>&1 | tail -1
done

echo "Done! $(ls "$OUTPUT_DIR"/*.png 2>/dev/null | wc -l) overlays rendered."
