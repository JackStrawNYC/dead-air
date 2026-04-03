#!/bin/bash
# Batch test all non-environment shaders
cd /Users/chrisgardella/dead-air/packages/visualizer-poc

PASSED=()
FAILED=()

# All non-environment shaders
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

for SHADER in "${SHADERS[@]}"; do
  echo -n "Testing $SHADER ... "

  python3 -c "
import json
with open('data/setlist.json') as f:
    d = json.load(f)
for s in d['songs']:
    if s['trackId'] == 's1t06':
        s['defaultMode'] = '$SHADER'
with open('data/setlist.json', 'w') as f:
    json.dump(d, f, indent=2)
"
  rm -f out/bundle/.source-hash

  OUTPUT=$(npx remotion still out/bundle s1t06 /tmp/shader-test.png --props=data/tracks/s1t06-analysis.json --gl=angle --frame=2100 2>&1)
  EXIT_CODE=$?

  if echo "$OUTPUT" | grep -qi "Shader Error\|undeclared\|overload\|no matching\|compile error\|link error"; then
    echo "FAILED (GLSL)"
    echo "  $(echo "$OUTPUT" | grep -i 'shader\|undeclared\|overload\|no matching\|compile\|link' | head -2)"
    FAILED+=("$SHADER")
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "FAILED (exit $EXIT_CODE)"
    echo "  $(echo "$OUTPUT" | tail -3)"
    FAILED+=("$SHADER")
  else
    echo "OK"
    PASSED+=("$SHADER")
  fi
done

# Restore
python3 -c "
import json
with open('data/setlist.json') as f:
    d = json.load(f)
for s in d['songs']:
    if s['trackId'] == 's1t06':
        s['defaultMode'] = 'aurora'
with open('data/setlist.json', 'w') as f:
    json.dump(d, f, indent=2)
"
rm -f out/bundle/.source-hash

echo ""
echo "RESULTS: ${#PASSED[@]} passed, ${#FAILED[@]} failed out of ${#SHADERS[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED:"
  printf '  %s\n' "${FAILED[@]}"
fi
