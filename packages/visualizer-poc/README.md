# Dead Air Visualizer

Audio-reactive concert visualizer for the Grateful Dead. Renders full shows as continuous video where every visual element responds to the music — energy, beats, tempo, spectral content.

Built with [Remotion](https://remotion.dev/) and React.

## Quick Start

```bash
# Install dependencies
pnpm install

# Analyze audio (requires Python venv)
pnpm analyze:show

# Preview in Remotion Studio
pnpm studio

# Render a single song (Morning Dew)
pnpm render:morning-dew

# Render the full show
pnpm render:show

# Resume an interrupted render
pnpm render:show:resume
```

## Architecture

### Audio Analysis Pipeline

```
MP3 audio → Python analyzer → per-frame JSON (RMS, beats, onsets, chroma, spectral)
```

Each song gets a `{trackId}-analysis.json` with per-frame audio features at 30fps:
- `rms` — overall energy
- `beat` — boolean beat detection
- `onset` — onset strength
- `chroma` — 12-bin pitch class distribution
- `centroid`, `flatness`, `sub`, `low`, `mid`, `high` — spectral features

### Visual Layers (bottom to top)

| Layer | Component | Description |
|-------|-----------|-------------|
| 0 | SceneRouter | Base shader visualization (6 modes) |
| 0.5 | SongArtLayer | Per-song poster art (Ken Burns background wash) |
| 0.7 | SceneVideoLayer | Atmospheric videos/images with inverse-energy opacity |
| 0.8 | LyricTriggerLayer | Curated visuals timed to specific lyric phrases |
| 1-10 | Overlay Stack | 40+ animated overlays (bears, bolts, balloons, etc.) |
| Top | SongTitle, FilmGrain | Always-active UI + film texture |

### Audio-Reactive System

All overlays consume a shared `AudioSnapshot` computed once per frame in `SongVisualizer`:

```
AudioSnapshot {
  energy, slowEnergy, bass, mids, highs,
  onsetEnvelope, beatDecay, chromaHue, centroid, flatness
}
```

Components access this via `useAudioSnapshot(frames)` — no redundant computation.

### Overlay Rotation

The `overlay-rotation.ts` scheduler selects which overlays are active per time window:
- Section-aware scoring (energy bands, texture detection)
- Hero overlays get 1.8x opacity boost (bears, bolts, skeletons)
- Energy breathing: 5x dynamic range maps [0.04, 0.30] energy to [0.20, 1.0] opacity
- Crossfade transitions between overlay sets

### Music-Driven Parade System

Parade overlays (BearParade, SkeletonBand, VWBusParade, MarchingTerrapins) use `precomputeMarchWindows()` to find energy-sustained windows aligned to beat frames. Each component has tuned thresholds:

| Component | Energy Threshold | Character |
|-----------|-----------------|-----------|
| MarchingTerrapins | 0.05 | Gentle — chill turtles |
| VWBusParade | 0.07 | Mid energy — cruising vibes |
| BearParade | 0.12 | Peak party bears |
| SkeletonBand | 0.14 | High energy — the band shreds |

### Lyric Trigger System

18 curated phrase-to-visual mappings in `data/lyric-triggers.json`. When a specific lyric is sung (matched against word-level alignment data), a thematic visual fades in. Examples:
- "fire on the mountain" triggers mountain fire video
- "walk me out in the morning dew" triggers dawn landscape
- "jack straw from wichita" triggers Steal Your Face animation

## Key Directories

```
src/
  SongVisualizer.tsx     — Main per-song composition (audio context, layers, overlays)
  Root.tsx               — Remotion composition registration
  components/            — 40+ overlay components + utilities
  components/parametric/ — Shared audio helpers (march windows, snapshot hooks)
  data/                  — Overlay rotation, media resolver, trigger resolver
  scenes/                — 6 shader-based scene modes
  shaders/               — GLSL shaders (liquid light, noise, etc.)
  utils/                 — Audio analysis, energy, climax state, jam evolution, segue detection
data/
  setlist.json           — Show setlist with palette, song art, segue flags
  show-timeline.json     — Global frame offsets for final concat
  show-context.json      — Chapter card narratives
  lyric-triggers.json    — Phrase → visual trigger definitions
  lyrics/                — Word-level alignment files (deepgram + mapped)
  tracks/                — Per-song analysis JSON
scripts/
  render-show.ts         — Full show renderer (chunked + audio mux + concat)
  generate-chapters.ts   — YouTube chapter timestamp export
  generate-song-art.ts   — Song poster art generation
  analyze_show.py        — Audio analysis pipeline
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm studio` | Open Remotion Studio for preview |
| `pnpm render:show` | Render full show to MP4 |
| `pnpm render:show:resume` | Resume interrupted render |
| `pnpm render:morning-dew` | Render Morning Dew (test song) |
| `pnpm test` | Run test suite |
| `pnpm type-check` | TypeScript validation |
| `npx tsx scripts/generate-chapters.ts` | Generate YouTube chapter timestamps |
| `npx tsx scripts/render-show.ts --track=s2t08` | Render single track |
| `npx tsx scripts/render-show.ts --preview` | 15-second preview of each track |

## Rendering

Optimal config on Apple Silicon (M3 Pro, 18GB):
- GL backend: `--gl=angle` (4x faster than SwiftShader)
- Concurrency: 6 (per-song render workers)
- Never use `frameConcurrency > 1` with ANGLE (deadlocks on shared memory)

Full show render: ~3 hours of video, ~45 minutes to render with ANGLE.

## Tests

```bash
pnpm test        # 82 tests across 8 files
pnpm test:watch  # Watch mode
```

Test coverage: audio-reactive computation, energy smoothing, climax state, segue detection, jam evolution, seeded PRNG, march window precomputation, lyric trigger resolution.
