# Dead Air Visualizer

Audio-reactive concert visualizer for the Grateful Dead. Renders full shows as continuous video where every visual element responds to the music — energy, beats, tempo, spectral content.

Built with [Remotion](https://remotion.dev/) and React. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical deep-dive.

## Quick Start

```bash
# Install dependencies
pnpm install

# Analyze audio (requires Python venv)
pnpm analyze:show

# Validate pipeline data
pnpm validate

# Preview in Remotion Studio
pnpm studio

# Render the full show
pnpm render:show

# Resume an interrupted render
pnpm render:show:resume
```

## Architecture

```
MP3 Audio → Python Analyzer → Per-Frame JSON (28 features at 30fps)
                                    ↓
                           Overlay Scheduler (Claude-powered or algorithmic)
                                    ↓
                           Remotion Render (chunked + audio mux)
                                    ↓
                           FFmpeg Concat → Full Show MP4
```

### Visual Layers (bottom to top)

| Layer | Component | Description |
|-------|-----------|-------------|
| 0 | SceneRouter | Base shader visualization (9 modes via scene registry) |
| 0.5 | SongArtLayer | Per-song poster art (Ken Burns background wash) |
| 0.7 | SceneVideoLayer | Atmospheric videos/images with inverse-energy opacity |
| 0.8 | LyricTriggerLayer | Curated visuals timed to specific lyric phrases |
| 1-10 | Overlay Stack | 370+ animated overlays across 10 rendering layers |
| Top | SongTitle, FilmGrain | Always-active UI + film texture |

### Key Systems

- **Scene Registry** — Pluggable visual mode system (`scene-registry.ts`) with 9 shader modes and energy-based complement mapping
- **Overlay Rotation** — Section-aware scheduling with hero slot guarantees, beat-synced accents, and energy breathing
- **Climax State Machine** — 5-phase detection (idle -> build -> climax -> sustain -> release)
- **Band Config** — Portable artist configuration (`band-config.ts`) for multi-artist support
- **Data Validation** — 13 Zod schemas for runtime validation of all JSON data files
- **Pipeline Health Checks** — `validate-pipeline.ts` verifies data integrity between stages

### Audio-Reactive System

All overlays consume a shared `AudioSnapshot` computed once per frame:
```
AudioSnapshot { energy, slowEnergy, bass, mids, highs,
                onsetEnvelope, beatDecay, chromaHue, centroid, flatness }
```
Components access this via `useAudioSnapshot(frames)` — no redundant computation.

## Key Directories

```
src/
  SongVisualizer.tsx     — Per-song orchestrator (delegates to sub-components)
  components/
    song-visualizer/     — Decomposed sub-components (art, overlays, audio, props)
    parametric/          — 7 parametric overlay families (52 variants)
  scenes/                — 9 shader modes + router + registry
  data/                  — Types, schemas, registries, configs, contexts
  utils/                 — Shared math, hash, PRNG, energy, climax, segue detection
data/
  setlist.json           — Show setlist with palettes, modes, segue flags
  tracks/                — Per-song analysis JSON (28 features per frame)
scripts/
  render-show.ts         — Full show renderer (chunked + audio mux + concat)
  validate-pipeline.ts   — Pipeline health checks (Zod validation + consistency)
  bridge-pipeline.ts     — External pipeline adapter
  generate-overlay-schedule.ts — AI-curated overlay assignments
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm studio` | Open Remotion Studio for preview |
| `pnpm render:show` | Render full show to MP4 |
| `pnpm render:show:resume` | Resume interrupted render |
| `pnpm validate` | Run pipeline health checks |
| `pnpm validate:verbose` | Health checks with full details |
| `pnpm test` | Run test suite (152 tests) |
| `pnpm type-check` | TypeScript validation |
| `npx tsx scripts/render-show.ts --track=s2t08` | Render single track |
| `npx tsx scripts/render-show.ts --preview` | 15-second preview per track |
| `npx tsx scripts/generate-chapters.ts --sub-chapters` | YouTube chapter timestamps |

## Rendering

Optimal config on Apple Silicon (M3 Pro, 18GB):
- GL backend: `--gl=angle` (4x faster than SwiftShader)
- Concurrency: 4 (per-song render workers)
- Never use `frameConcurrency > 1` with ANGLE (deadlocks on shared memory)

Full show render: ~3 hours of video, ~45 minutes to render with ANGLE.

## Tests

```bash
pnpm test        # 152 tests across 13 files
pnpm test:watch  # Watch mode
```

Coverage: audio-reactive, energy, climax state, segue detection, jam evolution, seeded PRNG, march windows, lyric triggers, Zod schemas, band config, crowd detection, math utils, hash utils.
