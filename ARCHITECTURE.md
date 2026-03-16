# Dead Air Engine Architecture

Complete technical reference for the Dead Air concert visualizer system.
Last updated: 2026-03-07.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Pipeline Stages](#2-pipeline-stages)
3. [Rendering Architecture](#3-rendering-architecture)
4. [Shader Inventory](#4-shader-inventory)
5. [Overlay System](#5-overlay-system)
6. [Audio Analysis](#6-audio-analysis)
7. [Climax State Machine](#7-climax-state-machine)
8. [Jam Evolution](#8-jam-evolution)
9. [Visual Focus System](#9-visual-focus-system)
10. [Energy Counterpoint](#10-energy-counterpoint)
11. [Segue Handling](#11-segue-handling)
12. [Video Layer](#12-video-layer)
13. [Lyric System](#13-lyric-system)
14. [Post-Processing](#14-post-processing)
15. [Show Configuration](#15-show-configuration)
16. [Known Issues](#16-known-issues)

---

## 1. Project Structure

### Monorepo Layout

```
dead-air/
├── package.json              # pnpm workspaces, turbo build
├── pnpm-workspace.yaml       # packages/*
├── packages/
│   ├── core/                 # Shared types, config, database
│   ├── cli/                  # Command-line interface
│   ├── pipeline/             # ETL: ingest, analyze, research, script, assets, render
│   ├── visualizer-poc/       # Remotion compositions, shaders, overlays
│   ├── remotion/             # Remotion config and Three.js integration
│   └── dashboard/            # Web UI for monitoring (minimal)
└── data/                     # Runtime data (audio, analysis, renders)
```

- **Package manager**: pnpm 9.15.4
- **Node**: 20.0.0+
- **Build system**: Turborepo

### @dead-air/core (`packages/core/`)

Shared infrastructure.

```
src/
├── config/
│   ├── index.ts      # loadConfig(), getConfig(), resetConfig()
│   └── env.ts        # Zod schema for 20+ env vars
├── db/
│   └── schema.ts     # SQLite: shows, episodes, assets, cost_log, analytics
├── types/
│   └── index.ts      # ShowMetadata, SetlistSong, AudioAnalysis, EpisodeScript, etc.
└── utils/
    ├── logger.ts
    └── cost-tracker.ts
```

**Environment variables** (all optional except NODE_ENV):

| Group | Variables |
|-------|-----------|
| Archive.org | `ARCHIVE_ORG_EMAIL`, `ARCHIVE_ORG_PASSWORD` |
| AI | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN`, `XAI_API_KEY` |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| External | `SETLISTFM_API_KEY`, `FLICKR_API_KEY` |
| AWS/Remotion | `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION`, `REMOTION_CONCURRENCY` |
| Paths | `DATABASE_PATH`, `DATA_DIR`, `ASSETS_DIR`, `RENDER_OUTPUT_DIR` |

**Database schema** (SQLite, SCHEMA_VERSION=1):

```sql
shows       (id=date, venue, city, state, setlist JSON, recording_id, catalog_score)
episodes    (id=ep-{date}, show_id FK, title, status, script JSON, youtube_id, total_cost)
assets      (id, episode_id FK, type, service, prompt_hash, file_path, cost)
cost_log    (episode_id FK, service, operation, input_tokens, output_tokens, cost)
analytics   (episode_id FK, views, watch_hours, ctr, revenue)
```

### @dead-air/cli (`packages/cli/`)

Command-line orchestrator. Entry point: `src/index.ts` (commander).

| Command | Arguments | What It Does |
|---------|-----------|-------------|
| `deadair ingest <date>` | `--skip-audio`, `--format flac|mp3` | Search Archive.org, rank recordings, download audio, fetch setlist/weather |
| `deadair analyze <date>` | `--silence-threshold`, `--skip-librosa` | FFmpeg silence detection, librosa feature extraction (28 features/frame @ 30fps) |
| `deadair research <date>` | `--model`, `--force`, `--archive-id` | Claude Sonnet generates tour/band/song context from reviews + stats |
| `deadair script <date>` | `--model`, `--dry-run`, `--force` | Claude generates episode structure: narrations, segments, YouTube metadata |
| `deadair generate-assets <ep-id>` | `--concurrency`, `--skip-narration/images/archival` | ElevenLabs narration, Replicate/Grok images, archival photo search |
| `deadair produce <date>` | `--from/--to <stage>`, `--lambda` | Master pipeline: ingest -> analyze -> research -> bridge -> script -> generate -> render |
| `deadair preview [ep-id]` | `--port` | Launch Remotion Studio with composition props |
| `deadair status` | `-e <ep-id>` | List episodes or show specific status |
| `deadair catalog` | (not implemented) | Browse Archive.org shows |
| `deadair publish <ep-id>` | (not implemented) | Upload to YouTube |

### @dead-air/pipeline (`packages/pipeline/`)

```
src/
├── ingest/           # Archive.org search, recording ranking, audio download
│   ├── archive-client.ts
│   ├── recording-selector.ts
│   ├── setlist-client.ts
│   ├── weather-client.ts
│   └── downloader.ts
├── audio/            # FFmpeg segmentation, librosa analysis, peak detection
│   ├── orchestrator.ts
│   ├── ffmpeg.ts
│   ├── librosa-sidecar.ts    # Python subprocess
│   ├── segment-matcher.ts
│   └── peak-detector.ts
├── research/         # Claude research generation
│   ├── show-researcher.ts
│   ├── archive-reviews.ts
│   └── song-stats.ts
├── script/           # Episode script generation
│   ├── orchestrator.ts
│   ├── context-assembler.ts
│   ├── response-parser.ts
│   ├── system-prompt.ts
│   └── song-themes.ts
├── assets/           # Image/narration/thumbnail generation
│   ├── orchestrator.ts
│   ├── narration-generator.ts   # ElevenLabs
│   ├── image-generator.ts       # Replicate Flux
│   ├── model-router.ts          # Route prompts to models
│   ├── thumbnail-generator.ts
│   ├── archival-fetcher.ts      # Flickr, WikiMedia, LoC, Calisphere
│   └── cache.ts
├── render/           # Remotion rendering
│   ├── orchestrator.ts
│   ├── composition-builder.ts
│   ├── scene-renderer.ts        # Scene-by-scene with sliding window
│   ├── lambda-renderer.ts       # AWS Lambda
│   ├── post-process.ts          # FFmpeg loudness normalization
│   ├── subtitle-generator.ts
│   └── shorts-builder.ts
└── utils/
    ├── retry.ts
    └── rate-limiter.ts
```

### @dead-air/visualizer-poc (`packages/visualizer-poc/`)

```
src/
├── entry.ts                    # registerRoot(Root)
├── Root.tsx                    # Composition registration
├── SongVisualizer.tsx          # Per-song master orchestrator (650+ lines)
├── components/
│   ├── song-visualizer/        # Composition sub-components
│   │   ├── DynamicOverlayStack.tsx
│   │   ├── SongArtLayer.tsx
│   │   ├── SpecialPropsLayer.tsx
│   │   └── AudioLayer.tsx
│   ├── EnergyEnvelope.tsx      # Energy-reactive CSS filters + bloom
│   ├── EraGrade.tsx            # Per-era color grading
│   ├── CameraMotion.tsx        # Zoom, shake, drift physics
│   ├── ConcertInfo.tsx         # Venue/date poster + ticket stub
│   ├── CrowdOverlay.tsx        # Applause warm glow
│   ├── FilmGrain.tsx           # SVG turbulence grain
│   ├── SceneVideoLayer.tsx     # AI video/image media layer
│   ├── SongTitle.tsx           # Track metadata display
│   ├── SongDNA.tsx             # Song statistics visualization
│   ├── MilestoneCard.tsx       # Historical significance
│   ├── ListenFor.tsx           # Curated audio moments
│   ├── FanQuoteOverlay.tsx     # Fan review quotes
│   ├── LyricTriggerLayer.tsx   # Lyric-timed visuals (DISABLED)
│   ├── PoeticLyrics.tsx        # Flowing lyric display (DISABLED)
│   ├── SetlistScroll.tsx       # Song list scroll
│   ├── ShowIntro.tsx           # Show intro card
│   ├── SetBreakCard.tsx        # Set break card
│   ├── EndCard.tsx             # End card
│   ├── VisualizerErrorBoundary.tsx
│   ├── SilentErrorBoundary.tsx
│   └── parametric/             # 7 parametric overlay families (50 variants)
├── scenes/
│   ├── SceneRouter.tsx         # Section-aware scene routing
│   ├── SceneCrossfade.tsx      # Flash-blackout-eruption transitions
│   ├── scene-registry.ts       # Mode -> component mapping
│   └── *.tsx                   # 14 scene components
├── shaders/
│   ├── noise.ts                # Shared GLSL (simplex, fbm, grain, SDF stealie)
│   ├── overlay-sdf.ts          # Shared SDF primitives
│   └── *.ts                    # 14 shader implementations
├── data/
│   ├── ShowContext.tsx          # Show metadata context provider
│   ├── SongPaletteContext.tsx   # Palette context provider
│   ├── AudioSnapshotContext.tsx # Audio snapshot context provider
│   ├── TempoContext.tsx         # Tempo context provider
│   ├── overlay-registry.ts     # 30 curated overlay entries
│   ├── overlay-components.ts   # Component -> registry mapping
│   ├── overlay-rotation.ts     # Rotation scheduling engine
│   ├── types.ts                # EnhancedFrameData, SectionBoundary, VisualMode
│   ├── lyric-trigger-resolver.ts
│   └── load-track-analysis.ts
├── utils/
│   ├── audio-reactive.ts       # AudioSnapshot computation, Gaussian smoothing
│   ├── climax-state.ts         # 5-phase climax detection + modulation
│   ├── jam-evolution.ts        # Long jam phase detection
│   ├── visual-focus.ts         # Layer opacity hierarchy
│   ├── visual-counterpoint.ts  # Artistic tension (desaturation, flooding, bass isolation)
│   ├── energy.ts               # energyToFactor, calibration
│   ├── set-theme.ts            # Per-set color theming
│   ├── section-lookup.ts       # Binary search for current section
│   ├── math.ts                 # smoothstep, lerp, clamp, seededRandom
│   └── segue-*.ts              # Segue detection, palette blending
├── data/                       # Show data files
│   ├── setlist.json            # Song metadata, shader modes, palettes
│   ├── show-context.json       # Chapter text, stats
│   └── tracks/                 # Per-track analysis JSON
└── scripts/
    ├── analyze.py              # Librosa feature extraction
    ├── scaffold-show.ts        # New show directory setup
    ├── bridge-pipeline.ts      # Pipeline -> visualizer JSON transform
    ├── render-show.ts          # Full show render with checkpointing
    ├── generate-overlay-schedule.ts
    ├── generate-overlay-profiles.ts
    ├── generate-song-art.ts
    ├── generate-youtube-meta.ts
    └── validate-pipeline.ts
```

---

## 2. Pipeline Stages

Execution order when running `deadair produce <date>`:

### Stage 1: Ingest

```
Input:  Show date (YYYY-MM-DD)
Output: data/audio/{date}/*.flac, show record in DB

1. Search Archive.org for Grateful Dead recordings on date
2. Rank recordings by source quality (SBD > AUD, lineage, reviews)
3. Select best recording
4. Fetch file list, filter audio (FLAC > MP3)
5. Fetch setlist from setlist.fm API
6. Fetch weather from historical API (if venue coords known)
7. Download audio to data/audio/{date}/
8. Save show to SQLite
```

### Stage 2: Analyze

```
Input:  Audio files in data/audio/{date}/
Output: data/analysis/{date}/analysis.json

1. Discover audio files
2. FFmpeg silence detection -> segment boundaries
3. Match segments to setlist songs
4. For each segment, run Python librosa subprocess:
   - Extract 28 features per frame at 30fps
   - Features: RMS, centroid, onset, beat, sub, low, mid, high,
     chroma[12], contrast[7], flatness
5. Detect peak moments (energy spikes above threshold)
6. Write analysis.json (meta + frames[])
```

**Analysis JSON format:**
```json
{
  "meta": {
    "source": "filename.mp3",
    "duration": 1047.21,
    "fps": 30,
    "sr": 22050,
    "hopLength": 735,
    "totalFrames": 31417,
    "tempo": 128.6,
    "sections": [
      { "frameStart": 0, "frameEnd": 3600, "label": "verse", "energy": "low", "avgEnergy": 0.08 }
    ]
  },
  "frames": [
    {
      "rms": 0.2836, "centroid": 0.2819, "onset": 0.0, "beat": false,
      "sub": 0.0337, "low": 0.0536, "mid": 0.4258, "high": 0.2477,
      "chroma": [0.489, 0.312, ...],   // 12 pitch classes C-B
      "contrast": [0.047, 0.089, ...], // 7 spectral contrast bands
      "flatness": 0.0648
    }
  ]
}
```

### Stage 3: Research

```
Input:  Show date, setlist
Output: data/research/{date}/research.json

1. Fetch Archive.org user reviews
2. Fetch song statistics from setlist.fm
3. Send context to Claude Sonnet
4. Parse structured JSON response:
   - tourContext, bandMemberContext, historicalContext
   - songHistories[] (timesPlayed, notableVersions, thisVersionNotes)
   - fanConsensus, venueHistory
   - listenForMoments[] (songName, timestampSec, description)
```

### Stage 4: Bridge (optional)

```
Input:  Pipeline data directory
Output: Visualizer-compatible JSON (setlist.json, show-context.json, track analysis files)

npx tsx scripts/bridge-pipeline.ts --date={date} --data-dir={path}
```

### Stage 5: Script

```
Input:  Show + analysis + research
Output: data/scripts/{date}/script.json

1. Assemble context from all prior stages
2. Claude Sonnet generates episode structure:
   - episodeTitle, episodeType (gateway|deep_dive|song_history|top_list)
   - Narrations: intro, set break, outro
   - Segments[]: type (narration|concert_audio|context_text)
     - Visual: scenePrompts[], colorPalette[], mood, visualIntensity
   - YouTube metadata: title, description, tags, chapters
   - thumbnailPrompt, shortsMoments
```

### Stage 6: Generate Assets

```
Input:  Episode script
Output: data/assets/{episodeId}/manifest.json + media files

1. Assign image tier (hero=Grok Aurora, scene=Flux Schnell)
2. Generate narration via ElevenLabs (per narration segment)
3. Generate images via Replicate/Grok (batch with model routing)
4. Composite thumbnail
5. Search archival photos (Flickr, WikiMedia, LoC, Calisphere)
6. Cache by prompt hash
```

### Stage 7: Render

```
Input:  Composition props + assets
Output: data/renders/{episodeId}/{episodeId}.mp4

1. Build Remotion composition props
2. Render:
   - Local: scene-by-scene with 3-segment sliding window (memory optimization)
   - Lambda: invoke Remotion Lambda functions
3. Concatenate segments -> single MP4
4. Post-process: FFmpeg loudness normalization
```

---

## 3. Rendering Architecture

### Composition Registration (Root.tsx)

Root.tsx registers these Remotion compositions:

| Composition | Component | Duration | Purpose |
|------------|-----------|----------|---------|
| ShowIntro | `<ShowIntro>` | 465 frames (15.5s) | Show opening card |
| Chapter-N | `<ChapterCard>` | 180 frames (6s) each | Inter-song context cards |
| {trackId} | `<SongVisualizer>` | Dynamic (from analysis totalFrames) | Per-song visualization |
| SetBreak | `<SetBreakCard>` | 300 frames (10s) | Set break card |
| EndCard | `<EndCard>` | 360 frames (12s) | Closing card |
| MorningDew | `<SongVisualizer>` | Dynamic | Test composition (hardcoded s2t08) |

### Complete Composition Tree

```
Root (Remotion registerRoot)
└── SongVisualizer (per-song master orchestrator)
    ├── ShowContextProvider ─── show metadata, era, seed
    ├── AudioSnapshotProvider ─── pre-computed audio per-frame
    └── VisualizerErrorBoundary
        └── Main container (opacity fade in/out)
            ├── CameraMotion (CSS scale + translate)
            │   └── EraGrade (per-era CSS filter + tint overlay)
            │       └── EnergyEnvelope (energy-reactive CSS filter + bloom)
            │           │
            │           ├── SceneRouter / SceneCrossfade
            │           │   ├── Segue-in crossfade (if segueIn)
            │           │   │   └── SceneCrossfade (outgoing + incoming scenes)
            │           │   ├── Section crossfades (on mode changes)
            │           │   │   └── SceneCrossfade (flash + blackout + eruption)
            │           │   └── Direct Scene render (steady sections)
            │           │
            │           ├── SongArtLayer
            │           │   ├── <Img> (poster art, Ken Burns zoom)
            │           │   └── Bottom vignette (intro legibility)
            │           │
            │           ├── SceneVideoLayer
            │           │   └── <OffthreadVideo> or <Img> per media window
            │           │
            │           ├── DynamicOverlayStack
            │           │   ├── TempoProvider
            │           │   ├── SongPaletteProvider
            │           │   ├── GLSL overlay group (screen blend)
            │           │   │   └── SilentErrorBoundary -> overlay component (repeated)
            │           │   └── DOM overlay group (screen blend)
            │           │       └── SilentErrorBoundary -> overlay component (repeated)
            │           │
            │           ├── CrowdOverlay (radial warm glow)
            │           │
            │           └── SpecialPropsLayer
            │               ├── SongTitle
            │               ├── SongDNA
            │               ├── MilestoneCard
            │               ├── ListenFor
            │               ├── FanQuoteOverlay
            │               └── FilmGrain
            │
            └── AudioLayer
                ├── <Audio> (song playback)
                └── CrowdAmbience (reactive applause volume)
```

Maximum nesting depth: **11 levels**.

### Context Providers

| Provider | Provides | Consumed By |
|----------|----------|-------------|
| `ShowContextProvider` | bandName, venue, date, era, showSeed | EraGrade, ConcertInfo, SetlistScroll |
| `AudioSnapshotProvider` | energy, bass, onsetEnvelope, flatness, etc. | EnergyEnvelope, overlays, CrowdAmbience |
| `SongPaletteProvider` | primary hue, secondary hue, saturation | DynamicOverlayStack, CrowdOverlay, ListenFor |
| `TempoProvider` | tempoFactor (BPM / 120) | Overlay animation speed scaling |

### Scene System

**SceneRouter** (`scenes/SceneRouter.tsx`):
- Determines current section from frame position
- Gets visual mode: sectionOverride > seeded variation > auto-variety > defaultMode
- On mode change: renders SceneCrossfade with 30-frame transition
- Constants: `CROSSFADE_FRAMES = 30`, `BEAT_CROSSFADE_FRAMES = 30`

**SceneCrossfade** (`scenes/SceneCrossfade.tsx`):
- 30-frame flash-blackout-eruption transition:
  - Frames 0-2: White blast (screen blend, opacity 0.8, rapid decay)
  - Frames 2-10: Near-black overlay (opacity 0.8 -> 0.56)
  - Frames 10-30: Incoming scene smoothstep 0 -> 1

**Scene Registry** (`scenes/scene-registry.ts`):

| Mode | Energy Affinity | Complement |
|------|----------------|------------|
| liquid_light | high | oil_projector |
| particle_nebula | low | cosmic_dust |
| concert_lighting | high | lo_fi_grain |
| stark_minimal | low | liquid_light |
| tie_dye | high | vintage_film |
| cosmic_voyage | low | concert_lighting |
| inferno | high | cosmic_voyage |
| deep_ocean | low | inferno |
| aurora | low | tie_dye |
| crystal_cavern | low | inferno |

### Data Flow (Per Frame)

```
SongVisualizer computes (each frame):
  1. computeAudioSnapshot() -> AudioSnapshot
  2. computeClimaxState() -> ClimaxState {phase, intensity, anticipation}
  3. climaxModulation() -> ClimaxModulation {sat, bright, bloom, contrast offsets}
  4. computeJamEvolution() -> JamEvolution {phase, colorTemp, densityMult}
  5. getOverlayOpacities() -> Map<overlayName, opacity>
  6. computeVisualFocus() -> {shaderOpacity, artOpacity, overlayOpacity, grainOpacity}
  7. computeCounterpoint() -> {saturationMult, overlayInversion, cameraFreeze}

These feed into:
  - EnergyEnvelope: CSS filter string (saturate, brightness, contrast, hue-rotate)
  - SceneRouter: shader uniforms (uEnergy, uBass, uClimaxPhase, etc.)
  - DynamicOverlayStack: overlay opacities with MAX_CONCURRENT cap
  - CameraMotion: zoom, shake, drift transforms
  - SongArtLayer: energy-reactive wash opacity
  - SceneVideoLayer: media window scheduling
```

---

## 4. Shader Inventory

### Shared GLSL Library (`shaders/noise.ts`)

Functions available to all shaders:

| Function | Purpose |
|----------|---------|
| `snoise(vec3)` | 3D Simplex noise |
| `fbm(vec3)` | 4-octave Fractional Brownian Motion |
| `fbm6(vec3)` | 6-octave FBM (richer detail) |
| `fbm3(vec3)` | 3-octave FBM (faster) |
| `filmGrain(vec2, float)` | 2-frame-hold grain with warm amber bias |
| `sCurveGrade(vec3, float)` | S-curve color grading (lifted shadows) |
| `beatPulse(float)` | Sharp beat spike at beat boundaries |
| `beatPulseHalf(float)` | Half-beat pulse |
| `lightLeak(vec2, float, float, float)` | Warm amber glow from drifting edge |
| `filmGrainRes(vec2, float, float)` | Resolution-aware grain |
| `halation(vec2, vec3, float)` | Warm glow around bright areas |
| `getChroma(int, vec4, vec4, vec4)` | Access 12-element chroma array |
| `chromaColor(vec2, vec4, vec4, vec4, float)` | Map chroma to color |
| `sdStealie(vec2, float)` | Steal Your Face SDF (ring + divider + bolt) |
| `stealieEmergence(...)` | Complete Stealie appearance effect |

### SDF Primitives (`shaders/overlay-sdf.ts`)

`sdCircle`, `sdBox`, `sdRoundBox`, `sdStar`, `sdBolt`, `sdSkull`, `sdRose`, `sdBear`, `sdRings`, `sdVWBus`, `sdfGlow`

### Standard Uniform Set (all 14 shaders)

```glsl
uniform float uTime;
uniform float uBass, uMids, uHighs;
uniform float uRms, uCentroid, uOnset, uBeat;
uniform float uEnergy, uFlatness;
uniform vec2  uResolution;
uniform float uSectionProgress, uSectionIndex;
uniform float uChromaHue, uChromaShift, uAfterglowHue;
uniform float uPalettePrimary, uPaletteSecondary, uPaletteSaturation;
uniform float uTempo, uMusicalTime;
uniform float uOnsetSnap, uBeatSnap;
uniform float uClimaxPhase, uClimaxIntensity;
uniform vec4  uContrast0, uContrast1;      // 7-band spectral contrast (split into 2 vec4s)
```

Additional uniforms (shader-specific):

| Uniform | Shaders |
|---------|---------|
| `uSlowEnergy` | aurora, deep_ocean, inferno |
| `uJamDensity` | aurora, cosmic_voyage, inferno, liquid_light |
| `uChroma0/1/2` | crystal_cavern, liquid_light |
| `uCamOffset` | liquid_light |

### Per-Shader Details

#### 1. liquid_light.ts

- **Technique**: Multi-pass FBM domain warping with spectral contrast shaping
- **Look**: Oil-on-glass, three layered noise passes, aggressive chromatic aberration
- **Key audio**: bass -> warp strength (0.7+bass*0.8), uJamDensity -> fbm octaves (3-7)
- **Special**: Spectral contrast spatial shaping (6-band influence), chromatic aberration, dust motes, warp trails, waveform ring, SDF Stealie emergence

#### 2. tie_dye.ts

- **Technique**: Radial gradient rotation with domain warping and spiral pattern
- **Look**: Classic tie-dye swirl, radial hue bands rotating
- **Key audio**: bass -> swirl speed (0.8+bass*0.6), mids -> band/ring mix
- **Special**: HSV color space, spiral + radial ring patterns, SDF Stealie emergence

#### 3. aurora.ts

- **Technique**: Volumetric raymarching with Simplex noise FBM
- **Look**: Northern lights, vertical ribbons ripple across starfield
- **Key audio**: energy -> curtain brightness/coverage, uJamDensity -> octaves (3-7) + steps (16-32)
- **Special**: Multi-octave FBM with nimitz rotation, starfield background

#### 4. inferno.ts

- **Technique**: Glow accumulation raymarching (XT95 flame)
- **Look**: Rising flames with heat shimmer, embers, smoke wisps
- **Key audio**: bass -> flame density (0.25-0.05), uJamDensity -> steps (20-60) + octaves (3-6)
- **Special**: Custom flameFBM, proximity glow, heat shimmer UV distortion, rising embers

#### 5. cosmic_voyage.ts

- **Technique**: Kaliset fractal volumetric raymarching
- **Look**: Camera flying through fractal nebula clouds, god rays
- **Key audio**: energy -> camera drift + step count, uJamDensity -> vol steps (20-40) + absorption
- **Special**: Lissajous camera path, domain warp, Kaliset fractal, emission core detection, god rays

#### 6. concert_beams.ts (concert_lighting mode)

- **Technique**: Cone beam raymarching with analytical falloff
- **Look**: Volumetric stage beams, crowd silhouette, sparkling dust
- **Key audio**: energy -> active beam count (3+energy*5), bass -> camera shake, highs -> sparkles
- **Special**: 6 cone beams, stage/crowd silhouettes, sparkle dust, beat rings

#### 7. particle_nebula.ts

- **Technique**: Vertex + fragment shaders for THREE.Points (8K particles)
- **Look**: Golden-ratio sphere distribution, orbiting with jitter, soft glow
- **Key audio**: energy -> orbit radius (0.3-1.5), size (1.5-4.5), alpha (0.08-0.45)
- **Special**: Per-particle chromatic aberration, distance fog, color afterglow, motion stretch

#### 8. deep_ocean.ts

- **Technique**: Caustic light patterns + god rays + bioluminescent particles
- **Look**: Underwater caustic networks, vertical god rays, particles during quiet
- **Key audio**: energy -> surface chop, highs -> caustic sharpness, bass -> god ray intensity
- **Special**: 5-iteration trig folding (joltz0r), bioluminescent particles (inverse energy gate)

#### 9. oil_projector.ts

- **Technique**: Multi-blob FBM domain warping with threshold edges
- **Look**: 1960s overhead projector oil-lamp, large morphing blobs
- **Key audio**: bass -> warp (0.4+bass*0.2), energy -> blob brightness
- **Special**: 3 primary blobs, additive blending, lens falloff mask, glass texture refraction

#### 10. crystal_cavern.ts

- **Technique**: Instanced geometry (400 icosahedrons) with phong shading
- **Look**: Crystal cave, bass-pulsing facets, helical camera orbit
- **Key audio**: bass -> crystal scale pulse, highs -> rotation speed, chroma -> per-crystal glow
- **Special**: Per-instance phase-locked animation, chroma-driven emissive glow

#### 11. vintage_film.ts

- **Technique**: Procedural noise with film artifact overlays
- **Look**: 16mm projector, light leaks, sprocket holes, gate weave, scratches
- **Key audio**: energy -> brightness (0.30+energy*0.50), beatSnap -> gate weave
- **Special**: Sprocket hole animation, vertical scratches, frame flicker, projector hotspot vignette

#### 12. lo_fi_grain.ts

- **Technique**: Simple procedural noise with heavy grain
- **Look**: Warm 16mm, desaturated, heavy grain, amber-brown tones
- **Key audio**: bass -> warp, energy -> brightness (0.35-0.72)
- **Special**: Heavy grain (0.14-0.08 intensity), gate scratch (8% per frame), strong vignette

#### 13. stark_minimal.ts

- **Technique**: Geometric SDF shapes with subtle noise background
- **Look**: Clean abstraction, high contrast, monochrome with accent color
- **Key audio**: rms -> breathing circle, mids -> rotating line length
- **Special**: Breathing circle, concentric rings, cross-hair, section wipe line

#### 14. cosmic_dust.ts

- **Technique**: Procedural star field with FBM nebula clouds
- **Look**: Deep space, multiple star layers, palette-locked nebula
- **Key audio**: energy -> star brightness, onsetSnap -> shooting star
- **Special**: 3 star layers (different scales), hash-based positions, 2 nebula layers, shooting stars

### Song -> Shader Mapping (Cornell '77)

| Song | Default Mode | Section Overrides |
|------|-------------|-------------------|
| New Minglewood Blues | concert_lighting | s3:liquid_light, s5:tie_dye |
| Loser | aurora | s2:oil_projector, s4:deep_ocean |
| El Paso | vintage_film | s3:lo_fi_grain |
| They Love Each Other | oil_projector | s2:tie_dye, s5:liquid_light |
| Jack Straw | concert_lighting | s3:liquid_light, s6:inferno |
| Deal | concert_lighting | s3:tie_dye |
| Lazy Lightnin' | tie_dye | s2:oil_projector |
| Supplication | liquid_light | s2:cosmic_voyage, s5:oil_projector |
| Brown Eyed Women | oil_projector | s0:vintage_film, s4:concert_lighting |
| Mama Tried | vintage_film | s0:lo_fi_grain, s2:vintage_film, s4:oil_projector, s6:lo_fi_grain |
| Row Jimmy | liquid_light | s2:deep_ocean, s6:concert_lighting, s10:deep_ocean |
| Dancin' in the Street | concert_lighting | s2:liquid_light, s4:oil_projector, s7:concert_lighting |
| Scarlet Begonias | liquid_light | s0:oil_projector, s3:tie_dye, s6:liquid_light, s9:inferno |
| Fire on the Mountain | inferno | s3:oil_projector, s7:liquid_light, s9:lo_fi_grain |
| Estimated Prophet | liquid_light | s0:deep_ocean, s3:cosmic_voyage, s5:liquid_light, s7:inferno, s9:particle_nebula |
| St. Stephen | concert_lighting | s2:liquid_light, s4:tie_dye, s6:concert_lighting |
| Not Fade Away | concert_lighting | s2:liquid_light, s4:oil_projector, s9:concert_lighting |
| Drums/Space | cosmic_voyage | s0:tie_dye, s1:stark_minimal, s2:cosmic_voyage |
| Morning Dew | deep_ocean | s2:aurora, s4:liquid_light, s5:concert_lighting, s7:liquid_light, s9:inferno |
| One More Saturday Night | concert_lighting | s2:tie_dye, s4:concert_lighting |

### SDF Stealie Integration

Present in 4 shaders: liquid_light, tie_dye, aurora, cosmic_voyage.

Uses `stealieEmergence()` from noise.ts:
- Energy-gated appearance: `smoothstep(0.3, 0.7, energy)`
- Slow rotation: `time * 0.05`
- Bass pulse: `1.0 + bass * 0.5`
- Noise dissolution (edges eroded by shader's own FBM field)
- Additive blend using shader's own palette colors

---

## 5. Overlay System

### Registry (`data/overlay-registry.ts`)

**30 actively curated overlays** across 10 layers. 354 component files exist (324 preserved but inactive).

Each entry:
```typescript
{
  name: string,           // Component identifier
  layer: 1-10,            // Rendering order
  category: string,       // atmospheric | sacred | reactive | nature | character | distortion
  tags: string[],         // cosmic, psychedelic, dead-culture, intense, organic, etc.
  energyBand: string,     // low | mid | high | any
  weight: 1-3,            // Visual impact
  dutyCycle: 8-100,       // % of frames visible when active
  energyResponse?: [threshold, peak, falloff],
  alwaysActive?: boolean  // Only SongTitle + FilmGrain
}
```

**Layer map:**

| Layer | Category | Count | Contents |
|-------|----------|-------|----------|
| 1 | Atmospheric | 4 | CosmicStarfield, TieDyeWash, LavaLamp, Fireflies |
| 2 | Sacred | 10 | BreathingStealie, ThirteenPointBolt, StealYourFaceOff, SkullKaleidoscope, SkeletonRoses, SacredGeometry, DarkStarPortal, FractalZoom, MandalaGenerator, RoseOverlay |
| 3 | Reactive | 5 | LightningBoltOverlay, ParticleExplosion, LaserShow, EmberRise, WallOfSound |
| 5 | Nature | 3 | ChinaCatSunflower, SugarMagnolia, BoxOfRain |
| 6 | Character | 7 | BearParade, SkeletonBand, MarchingTerrapins, Bertha, JerryGuitar, VWBusParade, CosmicCharlie |
| 7 | Info | 1 | SongTitle (always-active) |
| 10 | Distortion | 2 | VHSGlitch, FilmGrain (always-active) |

Layers 4, 8, 9 are reserved/unused.

### Rotation Engine (`data/overlay-rotation.ts`)

#### Window Duration by Energy

| Energy | Window | Crossfade |
|--------|--------|-----------|
| low | 5400 frames (3 min) | 270 frames (9s) |
| mid | 2700 frames (90s) | 150 frames (5s) |
| high | 1800 frames (60s) | 90 frames (3s) |

#### Overlay Count per Window

| Energy | Min | Max |
|--------|-----|-----|
| low | 1 | 1 |
| mid | 1 | 2 |
| high | 0 | 0 |

`TARGET_VISIBLE = 1` (duty-cycle adjusted to keep ~1 visible at any frame).

#### Pre-Peak Dropout

`DROPOUT_MAX_OVERLAYS = 0` — window immediately before an energy jump gets zero overlays. Creates visual silence before climax.

#### Hero Guarantee

Reserved overlays: BreathingStealie, ThirteenPointBolt, StealYourFaceOff, BearParade, SkeletonBand, MarchingTerrapins, Bertha, JerryGuitar.

1 hero slot per window (if targetCount > 0).

#### Scoring Algorithm

For each overlay candidate:

```
baseScore = 0.5
+ energyBandMatch (±0.3)
+ textureGroupScore (category x texture matrix, ±0.45)
+ tagAffinityScores (per-tag, ±0.15 each)
+ contextAdjustments (Set II, Drums/Space, post-peak grace)
+ energyHints (Claude-curated phase preferences)
+ carryoverBonus (0.4 if prev window < 30s)
- repeatPenalty (0.6 if in previous window)
+ deterministicJitter (±0.08)
```

**Texture x Category scoring matrix:**

| Texture | atmospheric | sacred | reactive | character | narrative |
|---------|-----------|--------|----------|-----------|-----------|
| ambient | +0.25 | +0.45 | -0.30 | +0.05 | -0.50 |
| sparse | +0.20 | +0.25 | -0.20 | +0.10 | -0.40 |
| melodic | +0.10 | +0.05 | 0.00 | +0.25 | +0.10 |
| building | +0.05 | +0.10 | +0.15 | +0.20 | -0.05 |
| rhythmic | 0.00 | 0.00 | +0.20 | +0.30 | -0.15 |
| peak | -0.05 | +0.10 | +0.25 | +0.35 | -0.35 |

#### Accent Overlays (Beat-Synced Flashing)

14 eligible overlays. Triggered when `onsetEnvelope > threshold`:

| Energy | Onset Threshold | Peak Opacity | Decay |
|--------|----------------|-------------|-------|
| high | 0.25 | 1.0 | 24 frames (0.8s) |
| mid | 0.35 | 0.80 | 18 frames (0.6s) |
| low | 0.45 | 0.50 | 12 frames (0.4s) |

### Rendering (`DynamicOverlayStack.tsx`)

**MAX_CONCURRENT** hard caps:

| Energy Level | Max Overlays |
|-------------|-------------|
| quiet (energy < 0.10) | 1 |
| mid | 1 |
| peak (energy > 0.25) | 0 |

All overlays render with `mixBlendMode: "screen"` (dark pixels transparent, bright pixels additive).

**Intro gate**: overlays hidden until frame 420 (14s), then 90-frame fade-in.

**Opacity pipeline**:
```
finalOpacity = rotationOpacity
             * mediaSuppression
             * focusSuppression
             * energyResponseModulation
             + accentFlashOpacity
```

GLSL and DOM overlays separated into two render groups, each wrapped in error boundaries.

---

## 6. Audio Analysis

### Raw Features (28 per frame @ 30fps)

```typescript
interface EnhancedFrameData {
  rms: number;           // Overall energy 0-1
  centroid: number;      // Spectral brightness 0-1
  onset: number;         // Onset strength 0-1
  beat: boolean;         // Binary beat flag
  sub: number;           // 0-100Hz energy 0-1
  low: number;           // 100-400Hz 0-1
  mid: number;           // 400-2000Hz 0-1
  high: number;          // 2000-8000Hz 0-1
  chroma: number[];      // 12 pitch classes (C through B), each 0-1
  contrast: number[];    // 7 spectral contrast bands
  flatness: number;      // 0=tonal, 1=noise
}
```

### AudioSnapshot (Smoothed, per-frame)

Computed in `utils/audio-reactive.ts`:

| Feature | Smoothing Window | Algorithm | Drives |
|---------|-----------------|-----------|--------|
| energy | 60 frames (2s) | Gaussian RMS | Global envelope, climax detection |
| slowEnergy | 180 frames (6s) | Gaussian RMS | Bloom drift, ambient modulation |
| bass | 10 frames (0.33s) | (sub+low)/2 smoothed | Bass isolation, counterpoint |
| mids | 8 frames (0.27s) | Gaussian mid | Tonal tracking |
| highs | 5 frames (0.17s) | Gaussian high | Presence/clarity |
| onsetEnvelope | 18-frame decay | Fast-attack/slow-release | Beat triggers, accent flashing |
| beatDecay | halfLife=15 frames | Exponential from beat | Camera freeze, continuity |
| chromaHue | 15 frames (0.5s) | Circular mean of dominant chroma | Palette hue rotation |
| centroid | 18 frames (0.6s) | Spectral brightness | Timbral color |
| flatness | 15 frames (0.5s) | Raw spectral flatness | Ambient vs. tonal detection |
| spectralFlux | 8 frames (0.27s) | L2 norm of contrast diffs | Transition detection |
| musicalTime | Beat-array interpolation | Beat count + fractional | Phase-locked breathing |

**Gaussian smoothing implementation:**
```
sigma = window * 0.5
weight[i] = exp(-(distance^2) / (2 * sigma^2))
result = sum(frame[i] * weight[i]) / sum(weight[i])
```

### Energy Calibration (`utils/energy.ts`)

Per-song auto-calibration from RMS percentiles:
```
quietThreshold = max(0.02, min(0.10, p10))
loudThreshold  = max(0.15, min(0.50, p90))
```

Energy-to-factor mapping uses Hermite smoothstep:
```
t = (energy - low) / (high - low)
factor = t^2 * (3 - 2t)     // 0 = quiet, 1 = loud
```

### Musical Texture Detection

```typescript
detectTexture(snapshot, energy) -> MusicalTexture:
  energy < 0.10 && flatness > 0.4  -> "ambient"    // Space/Drums
  energy < 0.08                    -> "sparse"      // quiet/tonal
  energy > 0.25 && onset > 0.3     -> "peak"        // loud+percussive
  energy > 0.12 && beatDecay > 0.5 -> "rhythmic"    // driving groove
  energy > 0.08 && flatness < 0.3  -> "melodic"     // tonal, moderate
  else                             -> "building"
```

---

## 7. Climax State Machine

### 5 Phases (`utils/climax-state.ts`)

| Phase | Trigger | Intensity |
|-------|---------|-----------|
| **idle** | energy < 0.08 | 1 - (energy / 0.08) |
| **build** | 0.08 <= energy <= 0.25, delta > 0.001 | smoothstep((energy-0.08) / 0.17) |
| **climax** | In high-energy section, first 20% | smoothstep(sectionProgress / 0.20) |
| **sustain** | In high-energy section, 20%-85% | 1 - abs(midProgress - 0.5) * 0.4 |
| **release** | In high-energy section, last 15% OR energy > 0.20, delta < -0.001 | smoothstep(1 - (progress-0.85) / 0.15) |

**Anticipation sub-state**: phase="build" AND next section is high-energy AND within 150 frames (5s). Overrides build modulation with dramatic darkness.

### Phase Modulation Values (Additive Offsets)

| Phase | Saturation | Brightness | Vignette | Bloom | Contrast | Overlay Density |
|-------|-----------|-----------|---------|------|---------|-----------------|
| idle | -0.15 | -0.15 | -0.06 | -0.05 | -0.05 | 0.70 |
| build | +0.15 | +0.05 | +0.06 | +0.15 | +0.08 | 1.10 |
| climax | +0.30 | +0.10 | +0.12 | +0.35 | +0.12 | 1.60 |
| sustain | +0.20 | +0.06 | +0.08 | +0.22 | +0.08 | 1.40 |
| release | -0.15 | -0.08 | -0.05 | 0.00 | -0.05 | 0.50 |
| **anticipation** | **-0.50** | **-0.40** | **+0.12** | **-0.10** | **-0.15** | **0.0** |

Build interpolates from `BUILD_START = {0, 0, 0, 0, 0, 0.95}` to target.
Release interpolates from `RELEASE_START = {+0.02, +0.005, +0.02, +0.01, +0.02, 1.0}` to target.
Other phases: offset = target * smoothstep(intensity).

### Energy Delta Computation

- Lookback: 60 frames (2s)
- Both current and lookback smoothed with 150-frame Gaussian
- Rising threshold: delta > 0.001
- Falling threshold: delta < -0.001

---

## 8. Jam Evolution

### Detection (`utils/jam-evolution.ts`)

- **Long jam threshold**: 18,000 frames (10 minutes @ 30fps)
- **Drums/Space threshold**: 5,400 frames (3 minutes) -- always gets evolution
- **Smoothing**: 30-second Gaussian (900 frames) for phase-local energy

### 4-Phase Arc

| Phase | Timing | Color Temp | Density Mult | Character |
|-------|--------|-----------|-------------|-----------|
| exploration | 0% to 30% of pre-peak | -0.4 to -0.2 (cool) | 0.85 to 0.95 | Sparse, searching |
| building | 30% to peak-0.15 | -0.2 to +0.5 (warming) | 0.90 to 1.10 | Rising |
| peak_space | peak +/- margin | +0.5 to +0.8 (hot) | 1.10 to 1.25 | Sustained climax |
| resolution | post-peak to end | +0.8 to -0.2 (cooling) | 1.25 to 0.95 | Descent |

### What Jam Density Controls

`uJamDensity` uniform (0.0-1.0, default 0.5) is derived from `densityMult` (0.75-1.25):

| Shader | What Changes |
|--------|-------------|
| liquid_light | FBM octaves: int(mix(3.0, 7.0, uJamDensity)) |
| aurora | FBM octaves + step count: int(mix(16.0, 32.0, uJamDensity)) + curtain brightness |
| inferno | maxSteps: int(mix(20.0, 60.0, uJamDensity)) + flameFBM octaves: int(mix(3.0, 6.0, uJamDensity)) |
| cosmic_voyage | volSteps: int(mix(20.0, 40.0, uJamDensity)) + dark matter absorption |

### Camera Modulation

| Phase | Zoom | Drift Amp | Drift Hz |
|-------|------|-----------|----------|
| exploration | 1.04 | 6px | 0.03 |
| building | 1.04-1.07 | 4px | 0.04 |
| peak_space | 1.07-1.06 | 1.5px | 0.02 |
| resolution | 1.06-1.03 | 5px | 0.025 |

### Color Temperature

Drives `hue-rotate()` in EnergyEnvelope:
- `jamHueShift = jamColorTemp * 15` (max +/-12 degrees)
- Composited with set-level warmth shift

---

## 9. Visual Focus System

### Per-Phase Layer Hierarchy (`utils/visual-focus.ts`)

| Phase | Shader | Art | Overlays | Grain |
|-------|--------|-----|----------|-------|
| climax | 1.0 | 0.0 | **0.0** | 0.5 |
| sustain | 0.95 | 0.0 | **0.0** | 0.6 |
| build | 0.85 | 0.1 | 0.60 | 0.8 |
| release | 0.75 | 0.5 | 0.50 | 1.0 |
| idle | 0.85 | 0.35 | 0.70 | 1.0 |

**Video active override** (80% blend when media playing):
```
shaderOpacity: 0.4, artOpacity: 0.0, overlayOpacity: 0.50, grainOpacity: 0.7
```

### Idle Breathing

8-second sinusoidal cycle (240 frames):
```
breathT = (sin(frame * PI * 2 / 240) + 1) * 0.5
artOpacity oscillates 0.25 - 0.55
shaderOpacity counter-oscillates 0.80 - 0.90
```

### Interpolation

Build/release phases interpolate from idle targets toward phase targets using `intensity` (0-1) to avoid sudden opacity jumps.

---

## 10. Energy Counterpoint

Four artistic tension mechanisms (`utils/visual-counterpoint.ts`):

### Peak Desaturation

```
Trigger:  energy > 0.35 AND onsetEnvelope > 0.6
Effect:   saturationMult drops to 0.5
Recovery: 45 frames (1.5s) smoothstep back to 1.0
Purpose:  Loudest moments go stark/monochrome -- "time stops"
```

### Quiet Flooding

```
Trigger:  energy < 0.08 for 60+ consecutive frames (2s)
Effect:   saturationMult ramps to 1.3 over 30 frames
Purpose:  Silence becomes lush/vibrant, not empty
```

### Bass Isolation

```
Trigger 1: bass > 0.5 AND highs < 0.15 -> overlayInversion = 0.8 (80% suppression)
Trigger 2: bass > 0.4 AND highs < 0.2  -> overlayInversion = 0.3 (gentle)
Purpose:   Deep bass owns the visual field, overlays get out of the way
```

### Downbeat Freeze

```
Trigger:  climaxPhase in {climax, sustain} AND beatDecay > 0.8 AND onset > 0.5
Effect:   cameraFreeze = true for 10 frames
Purpose:  Camera holds still on strong beats during peaks
```

---

## 11. Segue Handling

### Detection

Songs with `segueInto: true` in setlist.json form segue chains. Sacred segues are curated known pairings (Scarlet->Fire, China Cat->I Know You Rider, etc.).

### Visual Transitions

**Segue-in** (first FADE_FRAMES=90 frames / 3s):
- Palette blends from previous song's hue toward current song's hue
- Scene crossfade from previous song's shader mode to current song's mode
- Circular hue interpolation to handle wraparound (0-360)

**Segue-out** (last FADE_FRAMES=90 frames):
- Palette begins blending toward next song's hue
- No scene change (current scene continues to end)

**Palette blending math:**
```
diff = (toPalette - fromPalette + 360) % 360
if (diff > 180) diff -= 360
result = (fromPalette + diff * progress) % 360
```

### What Changes During Segue

- Hue-rotate filter on EnergyEnvelope shifts palette
- Scene shader transitions via SceneCrossfade (if mode changes)
- SongArtLayer fades between poster images
- DynamicOverlayStack receives blended palette via hueRotation prop
- SongTitle shows segue indicator arrow
- No audio gap (continuous playback)

---

## 12. Video Layer

### Media Window Scheduling (`SceneVideoLayer.tsx`)

**Constants:**
```
VIDEO_DISPLAY_FRAMES  = 600    // 20s display
FADE_FRAMES          = 150    // 5s smoothstep
CURATED_FADE_FRAMES  = 90     // 3s (song-specific)
VIDEO_DURATION_FRAMES = 450    // 15s clip
MIN_WINDOW_GAP       = 600    // 20s minimum between windows
```

### Section Scoring

Each section gets scored for media placement:
- Energy preference: low > mid > high (3, 2, 1 points)
- Duration bonus: min(2, sectionLen/3000)
- Texture bonus: ambient +4, sparse +3
- Post-climax bonus: +3 if previous=high, current=low
- Short section penalty: -2
- Intro penalty: -10 (first 15s)
- Post-music: excluded entirely

### Music End Detection

Scans backward from track end. Finds last 3-second window with RMS > 0.10. If gap to end > 10s, excludes post-music dead air (applause/tuning).

### Priority System

| Priority | Source | Opacity | Blur | Saturation |
|----------|--------|---------|------|------------|
| 0 | Song-specific video | 0.85-0.92 | 1.0px | 0.95 |
| 1 | Song-specific image | 0.85 | 1.5px | 0.85 |
| 2 | General category video | 0.45-0.55 (inverse energy) | 3.0px | 0.50 |
| 3 | General category image | 0.45-0.55 (inverse energy) | 5.0px | 0.50 |

### Curated Media Behavior

When priority 0-1 media is active:
- Dark backdrop (0.35 opacity black) suppresses shader
- No hue-rotate (curated has its own color grading)
- Shader opacity forced to 0.4 via visual focus override

### General Media Behavior

When priority 2-3 media is active:
- Inverse energy modulation (louder = shader dominates)
- `mixBlendMode: "lighten"` for natural compositing
- Heavy desaturation (0.50)
- Hue-rotated to match overlay palette

### Video Playback

Phase 1: Fade-in with frozen first frame
Phase 2: Full 15-second playback (starts at 15% opacity threshold)
Phase 3: Tail fade 3s before natural end

---

## 13. Lyric System

### Status: DISABLED

Both components exist but are commented out in SongVisualizer.tsx:
```tsx
{/* Lyrics disabled -- LyricTriggerLayer and PoeticLyrics removed */}
```

**User directive: DO NOT re-enable lyrics. Timing accuracy and spelling reliability are unresolved.**

### LyricTriggerLayer (exists, not mounted)

Displays curated visuals (images/videos) timed to lyric phrases.
```
FADE_IN_FRAMES    = 150  // 5s cinematic fade
FADE_OUT_FRAMES   = 120  // 4s fade out
VIDEO_DURATION    = 450  // 15s playback
```
Uses double-smoothstep for extra-soft transitions. Triggers on first occurrence only (avoids chorus repetition).

### PoeticLyrics (exists, not mounted)

Flowing atmospheric lyric display.
```
MIN_WORDS_FOR_DISPLAY   = 40   // need meaningful word count
MIN_PHRASES_FOR_DISPLAY = 4    // need 4+ phrases
PHRASE_GAP_THRESHOLD    = 0.8s // gap threshold for phrase grouping
INSTRUMENTAL_GAP        = 10s  // suppress in long gaps
WORD_STAGGER_FRAMES     = 3    // ~100ms per word
```
Energy-reactive: opacity 0.75 at quiet, 0.45 at peaks.

### Lyric Trigger Resolver (exists, unused)

`data/lyric-trigger-resolver.ts` aligns lyric phrases with frame windows using word-level timing from:
1. `{trackId}-alignment-deepgram.json` (reliable)
2. `{trackId}-alignment.json` (WhisperX, corrupted >24s durations)

---

## 14. Post-Processing

### EraGrade Color Grading (`components/EraGrade.tsx`)

| Era | CSS Filter | Tint Overlay |
|-----|-----------|-------------|
| primal (1965-67) | saturate(0.70) sepia(0.20) contrast(1.03) brightness(0.97) | rgba(140, 90, 40, 0.05) |
| classic (1968-79) | saturate(0.90) contrast(1.02) brightness(1.0) | rgba(180, 140, 80, 0.02) |
| hiatus (1975-76) | saturate(0.75) contrast(1.0) brightness(0.95) | rgba(60, 80, 120, 0.04) |
| touch_of_grey (1987-90) | saturate(1.15) contrast(1.06) brightness(1.01) | none |
| revival (1991-95) | saturate(0.95) contrast(1.0) brightness(1.0) | none |

### EnergyEnvelope Filters (`components/EnergyEnvelope.tsx`)

CSS filter pipeline applied per-frame:

| Filter | Quiet (factor=0) | Loud (factor=1) | Additional |
|--------|---------|------|------------|
| Saturation | 0.65 | 1.25 | + flatness offset + texture offset + climax offset + counterpoint mult + set theme mult |
| Brightness | 0.60 | 1.05 | + onset punch (0-10%) + climax offset + set theme offset |
| Contrast | 0.85 | 1.15 | + climax offset |
| Hue-rotate | 0 | 0 | + jam color temp (max +/-12deg) + set theme warmth shift |

Bloom (era-aware radial gradient, screen blend):
- Uses slowEnergy (drift, not pulse)
- Opacity = slowFactor * 0.30 + climaxMod.bloomOffset

### Set-Level Theming (`utils/set-theme.ts`)

| Set | Saturation Mult | Warmth Shift | Brightness Offset |
|-----|----------------|-------------|-------------------|
| Set 1 | 1.10 | +5 deg | +0.03 |
| Set 2 | 0.90 | -8 deg | -0.05 |
| Encore (3) | 0.85 | 0 deg | -0.08 |

### Film Grain (`components/FilmGrain.tsx`)

SVG `feTurbulence` with:
- baseFrequency: 0.75
- numOctaves: 4
- Seed changes every frame
- Opacity: quiet 0.10, peak 0.04 (energy-reactive breathing)
- Gate weave: sin/cos micro-jitter (0.8px x, 0.6px y)

### Per-Shader Post-Processing

All shaders apply from noise.ts:
- `filmGrain()` / `filmGrainRes()` - per-fragment grain
- `sCurveGrade()` - lifted shadows, punchy mids
- `lightLeak()` - warm amber edge glow
- `halation()` - warm glow around bright areas

### Camera Motion (`components/CameraMotion.tsx`)

```
Base zoom:      always overscaled (1.03-1.08x, cropped)
Energy zoom:    quiet 1.08x -> peak 1.03x
Beat shake:     +/-3px with exp decay over 12 frames
Bass sway:      continuous sin/cos micro-motion (bass * 8px amplitude)
Jam drift:      phase-dependent Lissajous drift (1.5-6px, 0.02-0.04Hz)
Downbeat freeze: 10 frames of no motion during climax beats
```

---

## 15. Show Configuration

### Manual Setup (visualizer-poc)

1. Run `npx tsx scripts/scaffold-show.ts <show-id> --date YYYY-MM-DD --venue "Venue Name"`
   - Creates `data/shows/{show-id}/setlist.json` (template)
   - Creates `data/shows/{show-id}/show-context.json` (template)
   - Creates `data/shows/{show-id}/tracks/` and `lyrics/` directories

2. Edit `setlist.json`:
```json
{
  "date": "1977-05-08",
  "venue": "Barton Hall, Cornell University, Ithaca, NY",
  "bandName": "Grateful Dead",
  "era": "classic",
  "songs": [{
    "trackId": "s1t02",
    "title": "New Minglewood Blues",
    "set": 1,
    "defaultMode": "concert_lighting",
    "audioFile": "gd77-05-08s1t02.mp3",
    "sectionOverrides": [
      { "sectionIndex": 3, "mode": "liquid_light" }
    ],
    "palette": { "primary": 200, "secondary": 340, "saturation": 0.9 },
    "songArt": "assets/song-art/s1t02.png",
    "segueInto": true
  }]
}
```

3. Edit `show-context.json`:
```json
{
  "chapters": [{
    "before": "s1t02",
    "text": "May 8th, 1977. Ithaca, New York...",
    "stats": { "timesPlayed": 318, "firstPlayed": "1966" }
  }]
}
```

4. Place audio files in `public/audio/`
5. Run analysis: `pnpm analyze:show -- --show {show-id}`
6. Generate overlay schedule: `npx tsx scripts/generate-overlay-schedule.ts`
7. Preview: `npx remotion studio`
8. Render: `npx tsx scripts/render-show.ts --show {show-id}`

### Pipeline Setup (automated)

```bash
deadair produce 1977-05-08
# Runs: ingest -> analyze -> research -> bridge -> script -> generate -> render
```

Or step by step:
```bash
deadair ingest 1977-05-08
deadair analyze 1977-05-08
deadair research 1977-05-08
deadair script 1977-05-08
deadair generate-assets ep-1977-05-08
deadair preview ep-1977-05-08
```

### Data Directory Layout

```
data/
├── dead-air.db                    # SQLite database
├── audio/{date}/                  # Downloaded audio files (FLAC/MP3)
├── analysis/{date}/analysis.json  # Per-song audio features
├── research/{date}/research.json  # Claude research output
├── scripts/{date}/script.json     # Episode structure
├── renders/{episodeId}/
│   ├── props.json                 # Remotion composition props
│   └── {episodeId}.mp4            # Final video
├── assets/{episodeId}/
│   ├── narrations/                # ElevenLabs MP3s
│   ├── images/                    # Replicate/Grok images
│   └── manifest.json
├── cache/                         # API result cache
└── lyrics/                        # 200+ song lyric files
```

---

## 16. Known Issues

### Disabled Features

| Feature | Status | Reason |
|---------|--------|--------|
| LyricTriggerLayer | Commented out in SongVisualizer | Timing/spelling accuracy unresolved |
| PoeticLyrics | Commented out in SongVisualizer | Same as above |
| Media catalog auto-resolution | Degraded | Catalog not yet generated; falls back to legacy sceneVideos[] |
| `deadair catalog` CLI command | Not implemented | Placeholder only |
| `deadair publish` CLI command | Not implemented | Placeholder only |

### Warnings

| Issue | Location | Impact |
|-------|----------|--------|
| s2t08 module not found | Root.tsx (MorningDew test composition) | Non-fatal; composition registration warning for shows without this track analysis file |
| Optional JSON loading | show-data-loader.ts | song-stats.json, milestones.json, narration.json, image-library.json all use try-catch with null fallbacks |

### Architecture Debt

| Item | Description |
|------|-------------|
| SongVisualizer.tsx | 650+ lines, needs decomposition into sub-hooks |
| Duplicated utils | smoothstep, seededRandom, djb2Hash, lerp, clamp appear in multiple files |
| 324 inactive overlays | Component files preserved but not in registry; potential bloat |
| 12-band chroma data | Extracted by librosa, stored in frames, but only `chromaHue` (circular mean) is used by most shaders. Full 12-band chroma could drive pitch-class-specific coloring |

### Rendering Constraints

| Constraint | Value | Notes |
|-----------|-------|-------|
| Remotion version | v4.0.242 | Locked |
| Three.js | via @remotion/three | For shader scenes |
| Render concurrency | 4 | Default; higher risks OOM |
| Render time | ~35-45 min for 2.5 min clip | At concurrency 4, local |
| Public dir copy | 4.8 GB | All audio/assets copied to temp on each render |

---

*End of architecture document.*
