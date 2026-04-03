#!/bin/bash
# Test all non-environment shaders by rendering a still frame at frame 2100
# for song s1t06 (Jack Straw). Reports which shaders have GLSL errors.

cd /Users/chrisgardella/dead-air/packages/visualizer-poc

SETLIST=data/setlist.json
BUNDLE=out/bundle
ANALYSIS=data/tracks/s1t06-analysis.json
FRAME=2100
TRACK=s1t06

# Save original defaultMode for s1t06
ORIGINAL_MODE=$(python3 -c "import json; d=json.load(open('$SETLIST')); print([s for s in d['songs'] if s['trackId']=='$TRACK'][0]['defaultMode'])")

echo "Original s1t06 mode: $ORIGINAL_MODE"
echo ""

# Non-environment shaders to test
SHADERS=(
  liquid_light oil_projector concert_lighting lo_fi_grain particle_nebula
  stark_minimal tie_dye cosmic_dust vintage_film cosmic_voyage inferno
  deep_ocean aurora crystal_cavern fluid_light void_light fluid_2d
  spectral_analyzer particle_swarm crystalline_growth climax_surge kaleidoscope
  fractal_zoom sacred_geometry reaction_diffusion mandala_engine fractal_flames
  feedback_recursion truchet_tiling diffraction_rings plasma_field voronoi_flow
  electric_arc morphogenesis stained_glass neural_web smoke_rings
  aurora_curtains digital_rain lava_flow mycelium_network ink_wash
  coral_reef solar_flare galaxy_spiral warp_field signal_decay databend
  volumetric_clouds volumetric_smoke volumetric_nebula
  liquid_mandala bioluminescence neon_grid warm_nebula prism_refraction cellular_automata
  acid_melt blacklight_glow spinning_spiral liquid_projector
)

PASSED=()
FAILED=()

for SHADER in "${SHADERS[@]}"; do
  echo "=== Testing: $SHADER ==="

  # Update setlist.json defaultMode for s1t06
  python3 -c "
import json
with open('$SETLIST') as f:
    d = json.load(f)
for s in d['songs']:
    if s['trackId'] == '$TRACK':
        s['defaultMode'] = '$SHADER'
with open('$SETLIST', 'w') as f:
    json.dump(d, f, indent=2)
"

  # Clear source hash to force rebundle pickup
  rm -f "$BUNDLE/.source-hash"

  # Render still frame, capture stderr
  STDERR_FILE="/tmp/shader-test-stderr-$SHADER.txt"
  npx remotion still "$BUNDLE" "$TRACK" /tmp/shader-test.png \
    --props="$ANALYSIS" --gl=angle --frame=$FRAME \
    2>"$STDERR_FILE" 1>/dev/null

  EXIT_CODE=$?
  STDERR_CONTENT=$(cat "$STDERR_FILE")

  # Check for shader errors
  if echo "$STDERR_CONTENT" | grep -qi "Shader Error\|undeclared\|overload\|no matching\|GLSL\|compile error\|link error"; then
    echo "  FAILED: GLSL error detected"
    echo "  Error: $(echo "$STDERR_CONTENT" | grep -i 'shader\|undeclared\|overload\|no matching\|GLSL\|compile\|link' | head -3)"
    FAILED+=("$SHADER")
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "  FAILED: exit code $EXIT_CODE"
    echo "  Last lines: $(tail -3 "$STDERR_FILE")"
    FAILED+=("$SHADER")
  else
    echo "  PASSED"
    PASSED+=("$SHADER")
  fi
  echo ""
done

# Restore original mode
python3 -c "
import json
with open('$SETLIST') as f:
    d = json.load(f)
for s in d['songs']:
    if s['trackId'] == '$TRACK':
        s['defaultMode'] = '$ORIGINAL_MODE'
with open('$SETLIST', 'w') as f:
    json.dump(d, f, indent=2)
"

echo ""
echo "========================================="
echo "RESULTS: ${#PASSED[@]} passed, ${#FAILED[@]} failed"
echo "========================================="
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED shaders:"
  for S in "${FAILED[@]}"; do
    echo "  - $S"
  done
fi
