# Dead Air

Audio-reactive concert visualizer for Grateful Dead soundboard recordings. Built with [Remotion](https://www.remotion.dev/), React, and TypeScript.

## What Is This

Dead Air transforms Grateful Dead soundboard recordings into full-length concert films with 340+ overlay components, real-time audio analysis, and cinematic visual treatment. Every visual element — from shader modes to overlay opacity to color grading — responds to the music.

**Current show:** Cornell '77 (1977-05-08, Barton Hall)

## Architecture

```
packages/
  core/          — Shared utilities, types, logger
  pipeline/      — Render orchestration, scene-by-scene rendering, FFmpeg post-processing
  cli/           — Command-line interface for rendering
  remotion/      — Remotion config and entry point
  dashboard/     — Web dashboard for render management
  visualizer-poc — The visualizer itself (components, scenes, audio analysis)
```

### Key Systems

- **Audio Analysis** — Librosa extracts 28 features per frame at 30fps (RMS, spectral centroid, 4 frequency bands, 12 chroma, 7 contrast, flatness, beat, onset)
- **Scene Router** — 7 GLSL shader modes (liquid_light, concert_lighting, particle_nebula, lo_fi_grain, oil_projector, stark_minimal, concert_beams) with 90-frame crossfades
- **Overlay Stack** — 340 components across 10 layers, scheduled per-song by energy band and tag affinity
- **Climax State Machine** — 5-phase detection (idle → build → climax → sustain → release) modulates all visual systems
- **Segue Detection** — Identifies continuous musical events (Scarlet→Fire, China Cat→Rider) for visual continuity
- **Lyric Display** — Karaoke-style word-by-word overlay from WhisperX alignment data
- **Energy Envelope** — Per-frame CSS filter modulation (saturation, brightness, vignette, bloom) from audio energy
- **Era Grading** — Per-era color treatment (primal/classic/hiatus/touch_of_grey/revival)

### Rendering Pipeline

Scene-by-scene rendering with a 3-segment sliding window to avoid Chrome memory issues past ~37K frames:

```
Scene Renderer → Per-segment MP4 (CRF 18) → Micro audio fades → Codec verification → FFmpeg concat → Post-process
```

Checkpoint system enables resume after crashes. ANGLE GPU backend required on Apple Silicon (frameConcurrency must be 1).

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- FFmpeg 6+
- Python 3.10+ with librosa (for audio analysis)

### Setup

```bash
# Clone and install
git clone https://github.com/JackStrawNYC/dead-air.git
cd dead-air
pnpm install

# Analyze audio (generates per-frame feature data)
cd packages/visualizer-poc
pnpm analyze

# Preview in Remotion Studio
pnpm dev

# Render a single song
pnpm render -- --props='{"compositionId":"s2t08"}'
```

### Rendering a Full Show

```bash
# Render all segments (scene-by-scene)
npx tsx packages/cli/src/test-render.ts --gl=angle --frame-concurrency=1 --concurrency=2

# Concatenate into final video
npx tsx packages/cli/src/concat.ts
```

### Adding a New Show

1. Place SBD audio files in `packages/visualizer-poc/public/audio/`
2. Create `data/setlist.json` with track metadata
3. Create `data/show-context.json` with chapter cards
4. Run `pnpm analyze` to generate per-track analysis
5. Run overlay scheduler: `npx tsx scripts/schedule-overlays.ts`

## Project Structure (visualizer-poc)

```
src/
  SongVisualizer.tsx    — Per-song composition (audio + visuals + overlays)
  Root.tsx              — Registers all Remotion compositions
  components/           — 340+ overlay components
    parametric/         — 7 parametric overlay families (50 variants)
  scenes/               — 7 shader-based visual modes
  shaders/              — GLSL shader implementations
  data/                 — Analysis loaders, overlay registry, types
  utils/                — Audio-reactive, climax state, energy helpers
data/
  setlist.json          — Show setlist with track metadata
  show-context.json     — Chapter card text between songs
  tracks/               — Per-track analysis JSON (28 features × N frames)
public/
  audio/                — SBD recording audio files
  assets/               — Scene images, videos, song art, ambient audio
```

## Performance Notes

- **Optimal config (M3 Pro, 18GB):** ANGLE GPU + 2 segment workers + frameConcurrency=1 → ~12-16 fps
- **Never use frameConcurrency > 1 with ANGLE** on Apple Silicon — deadlocks on shared memory
- **SwiftShader is 4x slower** (~3 fps) — avoid unless ANGLE unavailable
- Segment hashing (MD5) enables incremental re-renders — only changed segments re-render

## License

Private repository.
