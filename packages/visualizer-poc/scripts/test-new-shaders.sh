#!/bin/bash
cd /Users/chrisgardella/dead-air/packages/visualizer-poc

PASSED=()
FAILED=()
FAIL_DETAILS=()

for SHADER in acid_melt blacklight_glow spinning_spiral liquid_projector liquid_mandala bioluminescence neon_grid warm_nebula prism_refraction cellular_automata; do
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
    echo "$OUTPUT" | grep -i 'shader\|undeclared\|overload\|no matching\|compile\|link' | head -3
    FAILED+=("$SHADER")
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "FAILED (exit $EXIT_CODE)"
    echo "$OUTPUT" | tail -3
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
echo "============================="
echo "RESULTS: ${#PASSED[@]} passed, ${#FAILED[@]} failed"
echo "============================="
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "FAILED:"
  printf '  %s\n' "${FAILED[@]}"
fi
