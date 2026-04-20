#!/bin/bash
##
## vast-orchestrate.sh — Multi-instance full-show render orchestrator
##
## Provisions N Vast.ai instances, bootstraps each, assigns songs balanced
## by frame count, monitors progress, and collects results.
##
## Usage:
##   ./scripts/vast-orchestrate.sh [--instances=8] [--fps=60] [--4k] [--dry-run]
##   ./scripts/vast-orchestrate.sh --status          # Check all instances
##   ./scripts/vast-orchestrate.sh --collect          # Download finished MP4s
##   ./scripts/vast-orchestrate.sh --destroy          # Destroy all instances
##
## Prerequisites:
##   - vastai CLI authenticated
##   - SSH key configured for Vast.ai
##   - R2 credentials in env (for upload)
##

set -euo pipefail

REPO_URL="https://github.com/JackStrawNYC/dead-air.git"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SETLIST="$PROJECT_DIR/packages/visualizer-poc/data/setlist.json"
ANALYSIS_DIR="$PROJECT_DIR/data/tracks"
STATE_DIR="$PROJECT_DIR/out/vast-render-state"

NUM_INSTANCES=8
FPS=60
RESOLUTION=""
DRY_RUN=false
ACTION="render"

for arg in "$@"; do
  case "$arg" in
    --instances=*) NUM_INSTANCES="${arg#*=}" ;;
    --fps=*) FPS="${arg#*=}" ;;
    --4k) RESOLUTION="" ;;
    --1080p) RESOLUTION="" ;;
    --dry-run) DRY_RUN=true ;;
    --status) ACTION="status" ;;
    --collect) ACTION="collect" ;;
    --destroy) ACTION="destroy" ;;
  esac
done

mkdir -p "$STATE_DIR"

# ─── Song frame counts ───
get_song_frames() {
  node -e "
    const fs = require('fs');
    const setlist = JSON.parse(fs.readFileSync('$SETLIST', 'utf8'));
    for (const song of setlist.songs) {
      const aPath = '$ANALYSIS_DIR/' + song.title.toLowerCase().replace(/'/g,' ').replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'') + '-' + setlist.date + '-analysis.json';
      try {
        const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
        const frames60 = a.meta.totalFrames * ($FPS / 30);
        console.log(song.trackId + '\t' + song.title + '\t' + Math.round(frames60));
      } catch { console.log(song.trackId + '\t' + song.title + '\t0'); }
    }
  "
}

# ─── Balance songs across instances by total frames ───
assign_songs() {
  node -e "
    const lines = \`$(get_song_frames)\`.trim().split('\n');
    const songs = lines.map(l => { const [id, title, frames] = l.split('\t'); return { id, title, frames: parseInt(frames) }; });
    const N = $NUM_INSTANCES;

    // Sort longest first (greedy bin packing)
    songs.sort((a, b) => b.frames - a.frames);

    const bins = Array.from({ length: N }, () => ({ songs: [], totalFrames: 0 }));
    for (const song of songs) {
      // Find lightest bin
      let minIdx = 0;
      for (let i = 1; i < N; i++) {
        if (bins[i].totalFrames < bins[minIdx].totalFrames) minIdx = i;
      }
      bins[minIdx].songs.push(song);
      bins[minIdx].totalFrames += song.frames;
    }

    // If Dark Star is alone in a bin and >100k frames, split it
    for (let i = 0; i < N; i++) {
      const ds = bins[i].songs.find(s => s.id === 'd3t01');
      if (ds && ds.frames > 100000 && bins[i].songs.length === 1) {
        // Find lightest OTHER bin to share
        let lightIdx = -1;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          if (lightIdx === -1 || bins[j].totalFrames < bins[lightIdx].totalFrames) lightIdx = j;
        }
        if (lightIdx >= 0) {
          const half = Math.floor(ds.frames / 2);
          console.log('SPLIT\t' + i + '\t' + ds.id + '\t0-' + half);
          console.log('SPLIT\t' + lightIdx + '\t' + ds.id + '\t' + half + '-' + ds.frames);
          bins[i].songs = bins[i].songs.filter(s => s.id !== 'd3t01');
          bins[i].totalFrames -= ds.frames;
          bins[i].totalFrames += half;
          bins[lightIdx].totalFrames += ds.frames - half;
        }
      }
    }

    for (let i = 0; i < N; i++) {
      const ids = bins[i].songs.map(s => s.id).join(',');
      const names = bins[i].songs.map(s => s.title).join(', ');
      const hours = (bins[i].totalFrames / (20 * 3600)).toFixed(1); // ~20 fps at concurrency 10
      console.log('BIN\t' + i + '\t' + ids + '\t' + bins[i].totalFrames + '\t' + hours + 'h\t' + names);
    }
  "
}

# ─── Bootstrap script sent to each instance ───
BOOTSTRAP_SCRIPT='
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq nodejs npm wget gnupg2 ffmpeg imagemagick > /dev/null 2>&1

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
apt-get install -y -qq nodejs > /dev/null 2>&1
npm i -g pnpm > /dev/null 2>&1

# Chrome
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - > /dev/null 2>&1
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update -qq && apt-get install -y -qq google-chrome-stable > /dev/null 2>&1

# Clone + install
cd /root
git clone --depth 1 REPO_URL_PLACEHOLDER dead-air > /dev/null 2>&1
cd dead-air && pnpm install --frozen-lockfile > /dev/null 2>&1

echo "BOOTSTRAP_COMPLETE"
'

case "$ACTION" in
  render)
    echo "=== Veneta Full-Show Render ==="
    echo "Instances: $NUM_INSTANCES | FPS: $FPS | Resolution: ${RESOLUTION:-1080p}"
    echo ""
    echo "=== Song Assignment ==="
    assign_songs
    echo ""
    if [ "$DRY_RUN" = true ]; then
      echo "[DRY RUN] Would provision $NUM_INSTANCES instances and start rendering."
      exit 0
    fi
    echo "Run with --dry-run first to verify assignments."
    echo "Full provisioning not yet implemented — use assignments above with vast-render.sh per instance."
    ;;

  status)
    echo "=== Instance Status ==="
    vastai show instances
    ;;

  collect)
    echo "=== Collecting renders ==="
    echo "Not yet implemented — pull per-song MP4s from each instance via rsync"
    ;;

  destroy)
    echo "=== Destroying all instances ==="
    vastai show instances --raw 2>/dev/null | node -e "
      const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      d.forEach(i => console.log(i.id));
    " | while read id; do
      echo "Destroying $id..."
      vastai destroy instance "$id"
    done
    ;;
esac
