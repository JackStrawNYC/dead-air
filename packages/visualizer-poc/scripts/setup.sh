#!/bin/bash
# Setup script for visualizer-poc
# Run from the visualizer-poc directory: bash scripts/setup.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Setting up visualizer-poc ==="

# 1. Copy audio file into public/ (symlinks don't survive webpack bundling)
mkdir -p public/audio
AUDIO_SRC="../../data/audio/1977-05-08/gd77-05-08s2t08.mp3"
if [ ! -e public/audio/gd77-05-08s2t08.mp3 ]; then
  cp "$AUDIO_SRC" public/audio/gd77-05-08s2t08.mp3
  echo "Copied audio file (24 MB)"
else
  echo "Audio file already exists"
fi

# 2. Create data directory
mkdir -p data

# 3. Install node dependencies
echo "Installing node dependencies..."
cd ../.. && pnpm install && cd packages/visualizer-poc

# 4. Python venv for analysis
if command -v python3 &>/dev/null; then
  if [ ! -d ".venv" ]; then
    echo "Creating Python venv..."
    python3 -m venv .venv
  fi
  echo "Installing Python deps..."
  .venv/bin/pip install -q -r scripts/requirements.txt
else
  echo "WARNING: python3 not found. Install it to run analyze.py"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Run analysis:  pnpm analyze"
echo "  2. Preview:       pnpm studio"
echo "  3. Test render:   pnpm render:clip   (30s clip)"
echo "  4. Full render:   pnpm render        (17.5 min, ~17 min to render)"
