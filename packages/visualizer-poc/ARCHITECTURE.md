# Dead Air Architecture Guide

## Overview

Dead Air transforms concert soundboard recordings into full-length audio-reactive concert films. Every visual element — shader modes, overlay opacity, color grading, camera motion — responds to per-frame audio analysis.

**Current show:** Cornell '77 (1977-05-08, Barton Hall, Cornell University)

## System Architecture

```
                    INPUT
                      |
              MP3 Audio Files
                      |
         +------------+------------+
         |                         |
   Python Analysis            External Pipeline
   (analyze_show.py)        (dead-air ingest/analyze)
         |                         |
         v                         v
   Per-Track JSON             bridge-pipeline.ts
   (28 features/frame)              |
         |                         |
         +----------+--------------+
                    |
              Visualizer Data
           (setlist.json, tracks/,
            show-context.json, etc.)
                    |
         +----------+----------+
         |          |          |
    Overlay     Song Art    YouTube
    Schedule    Generator    Metadata
         |          |          |
         +----------+----------+
                    |
              Remotion Render
           (per-song compositions)
                    |
              FFmpeg Concat
                    |
               Full Show MP4
```

## Pipeline Stages

### Stage 1: Audio Analysis

**Script:** `scripts/analyze_show.py` (or `bridge-pipeline.ts` from external pipeline)

Librosa extracts 28 features per frame at 30fps:

| Feature | Type | Description |
|---------|------|-------------|
| `rms` | 0-1 | Overall energy (loudness) |
| `centroid` | 0-1 | Spectral centroid (brightness) |
| `onset` | 0-1 | Onset strength (attack detection) |
| `beat` | bool | Beat frame marker |
| `sub` | 0-1 | Sub-bass energy (0-200 Hz) |
| `low` | 0-1 | Low-frequency energy (200-400 Hz) |
| `mid` | 0-1 | Mid-frequency energy (400-2000 Hz) |
| `high` | 0-1 | High-frequency energy (2000-8000 Hz) |
| `chroma` | 12 floats | Pitch class distribution |
| `contrast` | 7 floats | Spectral contrast per band |
| `flatness` | 0-1 | Spectral flatness (noise vs tone) |

**Output:** `data/tracks/{trackId}-analysis.json` (one per song, 10-50 MB each)

Section detection uses agglomerative clustering on MFCC features, producing energy-classified segments (low/mid/high).

### Stage 2: Show Data Assembly

**Files produced:**
- `data/setlist.json` — Song metadata, visual modes, palettes, segue flags
- `data/show-timeline.json` — Cumulative frame offsets for final concat
- `data/show-context.json` — Chapter card narratives between songs
- `data/narration.json` — Tour context, listen-for moments, fan reviews
- `data/song-stats.json` — Historical stats (times played, first/last appearance)
- `data/milestones.json` — Song milestones (debuts, revivals, rare performances)

### Stage 3: Overlay Scheduling

**Script:** `scripts/generate-overlay-schedule.ts`

Two modes:
1. **Intelligent** (Claude-powered) — Sends song context + audio stats to Claude, which curates 10-16 thematic overlays per song
2. **Algorithmic** (fallback) — Scores overlays via audio analysis, energy bands, and tag affinity

**Output:** `data/overlay-schedule.json` with per-song overlay assignments

### Stage 4: Art Generation

**Script:** `scripts/generate-song-art.ts`

Generates AI poster art per song using Replicate (Recraft V4 Pro). Supports style variants (watercolor, risograph, screenprint, blacklight).

### Stage 5: Video Rendering

**Script:** `scripts/render-show.ts`

1. Source hash check — rebuild Remotion bundle only if source files changed
2. Pre-flight validation — verify all analysis, audio, and timeline files exist
3. Per-song rendering: split into chunks (4500 frames each), render video-only, concat losslessly, mux original audio
4. Render supplemental compositions: ShowIntro, ChapterCards, SetBreak, EndCard
5. Final FFmpeg concat respecting narrative structure (segues, set breaks)

**Key flags:**
- `--resume` — Skip completed songs/chunks
- `--track=s2t08` — Render single song
- `--preview` — 15-second preview per song
- `--seed=N` — PRNG seed for generative variation

### Stage 6: Post-Processing

**Scripts:** `scripts/generate-chapters.ts`, `scripts/generate-youtube-meta.ts`

Generates YouTube chapter timestamps, description, and SEO metadata.

### Health Checks

**Script:** `scripts/validate-pipeline.ts`

Run between any stages to verify data integrity:
```bash
npx tsx scripts/validate-pipeline.ts           # full validation
npx tsx scripts/validate-pipeline.ts --stage=pre  # pre-render only
npx tsx scripts/validate-pipeline.ts -v         # verbose output
```

Checks: file existence, Zod schema validation, frame count alignment, cross-file consistency, audio file presence, data quality (palette diversity, narration coverage).

## Visual Layer Architecture

Rendering order (bottom to top):

```
Layer 0:    SceneRouter (GLSL shader modes — 9 modes)
Layer 0.5:  SongArtLayer (Ken Burns background wash, energy-reactive)
Layer 0.7:  SceneVideoLayer (atmospheric video/image, inverse-energy opacity)
Layer 0.8:  LyricTriggerLayer (curated visuals timed to lyric phrases)
Layers 1-10: DynamicOverlayStack (370+ overlays, 10 rendering layers)
Layer Top:  SongTitle, FilmGrain (always-active UI + texture)
```

### Scene System

9 GLSL shader modes in `src/scenes/` with a pluggable registry (`scene-registry.ts`):

| Mode | Energy Affinity | Description |
|------|-----------------|-------------|
| `liquid_light` | high | Psychedelic liquid light show |
| `oil_projector` | mid | Oil painting animation |
| `concert_lighting` | high | Stage beam effects |
| `lo_fi_grain` | mid | VHS-style grain |
| `particle_nebula` | low | Particle field nebula |
| `stark_minimal` | low | Minimal geometric patterns |
| `tie_dye` | high | Tie-dye swirl patterns |
| `cosmic_dust` | low | Cosmic dust particles |
| `vintage_film` | mid | Film grain + color shift |

SceneRouter handles transitions with beat-synced crossfades (60 frames at nearest beat, 90 frame fallback).

### Overlay System

**370+ overlays** across 10 rendering layers:

| Layer | Category | Count | Examples |
|-------|----------|-------|---------|
| 1 | Atmospheric | ~36 | CosmicStarfield, TieDyeWash, AuroraBorealis |
| 2 | Sacred/Center | ~45 | BreathingStealie, SacredGeometry, ThirdEye |
| 3 | Reactive | ~30 | WaveformOverlay, WallOfSound, DrumCircles |
| 4 | Geometric | ~41 | VortexSpiral, FibonacciSpiral, GameOfLife |
| 5 | Nature/Cosmic | ~60 | MeteorShower, Constellation, BlackHole |
| 6 | Character | ~37 | SkeletonBand, BearParade, JerryGuitar |
| 7 | Artifact | ~52 | PsychedelicBorder, BootlegLabel, Confetti |
| 8 | Typography | 7 | LyricFlash, GarciaQuotes, MantraScroll |
| 9 | HUD | 10 | CassetteReels, NixieTubes, HeartbeatEKG |
| 10 | Distortion | 12 | ChromaticAberration, VHSGlitch, FilmGrain |

Plus **7 parametric families** generating ~52 variants (ParticleField, TieDyePattern, SacredPattern, DeadMotif, CrowdEnergy, VenueAtmosphere, FluidLight).

**Overlay Selection Pipeline:**
1. `overlay-schedule.json` — per-song curated overlay list (16-17 per song)
2. `overlay-rotation.ts` — temporal scheduling (which overlays visible when)
3. `overlay-selector.ts` — energy-based scoring with lookback dedup
4. Per-frame opacity via energy breathing, beat accents, hero slot guarantees

### Audio-Reactive System

All overlays consume a shared `AudioSnapshot` computed once per frame:

```typescript
AudioSnapshot {
  energy, slowEnergy, bass, mids, highs,
  onsetEnvelope, beatDecay, chromaHue, centroid, flatness
}
```

Access via `useAudioSnapshot(frames)` hook — no redundant computation.

**Climax State Machine:** 5-phase detection (idle -> build -> climax -> sustain -> release) modulates all visual systems.

## Component Architecture

### SongVisualizer (Orchestrator)

`src/SongVisualizer.tsx` — thin orchestrator that composes:
- `song-visualizer/show-data-loader.ts` — static data loading
- `song-visualizer/SongArtLayer.tsx` — poster art with Ken Burns zoom
- `song-visualizer/DynamicOverlayStack.tsx` — overlay rendering with rotation
- `song-visualizer/SpecialPropsLayer.tsx` — titles, DNA, milestones, quotes
- `song-visualizer/AudioLayer.tsx` — audio playback + crowd ambience

### Band Config (Portability)

`src/data/band-config.ts` defines a `BandConfig` interface for artist-specific content:
- Band name, musicians, eras
- Sacred segues (China Cat -> Rider, Scarlet -> Fire)
- Lyrics and quotes pools
- Overlay tags

Currently configured for the Grateful Dead; designed to be swappable for any artist.

### Data Validation

`src/data/schemas.ts` — 13 Zod schemas for runtime validation:
- `ShowSetlistSchema`, `TrackAnalysisSchema`, `ShowTimelineSchema`
- `NarrationSchema`, `MilestoneDataSchema`, `SongStatsSchema`
- `OverlayScheduleSchema`, `ImageLibrarySchema`, `LyricTriggersConfigSchema`
- `AlignmentDataSchema`

Use `safeParse()` for optional files (returns null instead of throwing).

## Key Directories

```
packages/visualizer-poc/
  src/
    SongVisualizer.tsx          — Per-song orchestrator
    Root.tsx                    — Remotion composition registry
    components/                 — 360+ overlay components
      song-visualizer/          — Decomposed SongVisualizer sub-components
      parametric/               — 7 parametric overlay families
    scenes/                     — 9 shader scenes + router + registry
    shaders/                    — GLSL fragment shaders
    data/                       — Types, schemas, registries, loaders, contexts
    utils/                      — Audio-reactive, energy, climax, math, hash, PRNG
  scripts/
    render-show.ts              — Full show renderer
    validate-pipeline.ts        — Pipeline health checks
    bridge-pipeline.ts          — External pipeline adapter
    generate-overlay-schedule.ts — Overlay curation
    generate-song-art.ts        — AI poster generation
    generate-chapters.ts        — YouTube chapter timestamps
    generate-youtube-meta.ts    — YouTube metadata export
    render-tour.ts              — Multi-show highlight reel
    scaffold-show.ts            — New show template generator
    analyze_show.py             — Python audio analysis
  data/
    setlist.json                — Show metadata
    show-timeline.json          — Frame offsets
    show-context.json           — Chapter narratives
    tracks/                     — Per-song analysis JSON
    lyrics/                     — Word-level alignment files
  public/
    audio/                      — Concert audio files
    assets/                     — Song art, videos, ambient audio
```

## Setup Guide

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **FFmpeg** 6+ (for video concat and audio mux)
- **Python** 3.10+ with librosa (for audio analysis)

### Installation

```bash
git clone https://github.com/JackStrawNYC/dead-air.git
cd dead-air
pnpm install
```

### Setting Up a New Show

1. **Scaffold the show directory:**
   ```bash
   cd packages/visualizer-poc
   npx tsx scripts/scaffold-show.ts my-show --date 1977-05-08 --venue "Barton Hall"
   ```

2. **Place audio files** in `public/audio/` (named per setlist.json `audioFile` field)

3. **Option A: Use the external pipeline (recommended for new shows):**
   ```bash
   # From the monorepo root
   pnpm deadair ingest --date 1977-05-08
   pnpm deadair analyze --date 1977-05-08
   pnpm deadair research --date 1977-05-08

   # Bridge into visualizer format
   cd packages/visualizer-poc
   npx tsx scripts/bridge-pipeline.ts --date=1977-05-08
   ```

3. **Option B: Use standalone Python analysis:**
   ```bash
   cd packages/visualizer-poc
   pnpm analyze:show          # Analyzes all songs in setlist.json
   ```

4. **Validate the data:**
   ```bash
   npx tsx scripts/validate-pipeline.ts
   ```

5. **Generate overlays and art (optional but recommended):**
   ```bash
   # AI-curated overlay assignments (requires ANTHROPIC_API_KEY)
   npx tsx scripts/generate-overlay-schedule.ts

   # AI poster art (requires REPLICATE_API_TOKEN)
   npx tsx scripts/generate-song-art.ts
   ```

6. **Preview in Remotion Studio:**
   ```bash
   pnpm studio
   ```

7. **Render:**
   ```bash
   pnpm render:show              # Full render
   pnpm render:show:resume       # Resume interrupted render
   npx tsx scripts/render-show.ts --track=s2t08  # Single song
   npx tsx scripts/render-show.ts --preview       # 15s preview per song
   ```

8. **Generate YouTube metadata:**
   ```bash
   npx tsx scripts/generate-chapters.ts --sub-chapters
   npx tsx scripts/generate-youtube-meta.ts
   ```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For overlay curation | Claude API for intelligent overlay scheduling |
| `REPLICATE_API_TOKEN` | For art generation | Replicate API for AI poster art |

### Rendering Performance

| Config | Platform | FPS | Notes |
|--------|----------|-----|-------|
| `--gl=angle`, concurrency=4 | M3 Pro 18GB | ~12-16 | Recommended for Apple Silicon |
| `--gl=angle`, concurrency=6 | 32GB+ | ~18-22 | More RAM allows higher concurrency |
| `--gl=swiftshader` | Any | ~3 | 4x slower, avoid unless ANGLE unavailable |

**Never use `frameConcurrency > 1` with ANGLE on Apple Silicon** — deadlocks on shared memory.

Full Cornell '77 render: ~3 hours of video, ~45 minutes to render with ANGLE on M3 Pro.

## Testing

```bash
pnpm test         # 152 tests across 13 files
pnpm test:watch   # Watch mode
```

Coverage: audio-reactive computation, energy smoothing, climax state detection, segue detection, jam evolution, seeded PRNG, march windows, lyric triggers, Zod schemas, band config, crowd detection, math utils, hash utils.

## Adding a New Scene

1. Create the scene component in `src/scenes/MyScene.tsx`
2. Create the GLSL shader in `src/shaders/my-scene.ts`
3. Register in `src/scenes/scene-registry.ts`:
   ```typescript
   import { MyScene } from "./MyScene";

   // Add to SCENE_REGISTRY:
   my_scene: {
     Component: MyScene,
     energyAffinity: "mid",
     complement: "liquid_light",
   },
   ```
4. Add `"my_scene"` to the `VisualMode` type in `src/data/types.ts`

## Adding a New Overlay

1. Create component in `src/components/MyOverlay.tsx` implementing audio-reactive behavior
2. Add registry entry in `src/data/overlay-registry.ts`:
   ```typescript
   { name: "MyOverlay", layer: 5, category: "nature", tags: ["organic"], energyBand: "mid", weight: 2 },
   ```
3. Add component mapping in `src/data/overlay-components.ts`
4. The overlay scheduler will automatically consider it for selection

## Adding a New Parametric Family

1. Create the family component in `src/components/parametric/MyFamily.tsx`
2. Export variant configs from `src/components/parametric/index.ts`
3. Variants are auto-registered into the overlay system
