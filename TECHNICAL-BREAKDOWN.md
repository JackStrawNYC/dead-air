# Dead Air — Complete Technical Breakdown

**For:** Video Engineer Evaluation
**Date:** March 2026
**Version:** Production

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [End-to-End Pipeline](#2-end-to-end-pipeline)
3. [Audio Analysis (Python/Librosa)](#3-audio-analysis)
4. [Composition Building (Remotion)](#4-composition-building)
5. [Visualizer Architecture (SongVisualizer)](#5-visualizer-architecture)
6. [Shader System (56 GLSL Shaders)](#6-shader-system)
7. [Overlay System (105 Active Overlays)](#7-overlay-system)
8. [Audio Feature Mapping (39 Features/Frame)](#8-audio-feature-mapping)
9. [Post-Processing Pipeline](#9-post-processing-pipeline)
10. [Transition System](#10-transition-system)
11. [Song Identity System](#11-song-identity-system)
12. [Show-Level Intelligence](#12-show-level-intelligence)
13. [3D Camera System](#13-3d-camera-system)
14. [DualShaderQuad Composition](#14-dualshaderquad-composition)
15. [Video / Concert Footage Integration](#15-video--concert-footage-integration)
16. [VJ Mode (Real-Time WebGL)](#16-vj-mode)
17. [Rendering & Encoding](#17-rendering--encoding)
18. [Infrastructure & Testing](#18-infrastructure--testing)

---

## 1. Project Overview

Dead Air is an automated concert documentary pipeline that transforms Grateful Dead soundboard recordings into full-length visual films with real-time audio-reactive psychedelic visuals.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Video Rendering** | Remotion v4.0.242 (offline, frame-by-frame) |
| **3D/WebGL** | Three.js + React Three Fiber 8.18.0 |
| **UI Framework** | React 18.3.1 + TypeScript 5.7 |
| **Audio Analysis** | Python 3.12 + librosa (via Docker sidecar) |
| **Stem Separation** | Demucs (Facebook) |
| **Lyric Alignment** | WhisperX (word-level timestamps) |
| **Build System** | pnpm 9.15.4 + Turbo 2.3.0 (monorepo) |
| **Live Performance** | Vite 6.0 (VJ mode, 60fps target) |
| **Database** | SQLite (better-sqlite3 11.0.0) |
| **Container** | Docker (Python analysis + stem separation) |
| **Encoding** | FFmpeg 6+ (H.264, AAC, loudness normalization) |

### Monorepo Packages

```
packages/
  cli/              — Command-line interface (Commander.js)
  core/             — Shared types, logger, database schema
  pipeline/         — Render orchestration, audio analysis, asset generation
  remotion/         — Remotion config + entry points
  visualizer-poc/   — Main visualizer (56 shaders, 105 overlays, SongVisualizer)
  vj-mode/          — Real-time live VJ performance tool
  dashboard/        — Web UI for render management
```

### Production Stats

| Metric | Value |
|--------|-------|
| Production shaders | 56 |
| Active overlays | 105 (22 A-tier, 83 B-tier) |
| GLSL uniforms | 51 shared across all shaders |
| Audio features per frame | 39 @ 30fps |
| Hand-curated song identities | 62 |
| Tests | 1,021 across 4 packages (all passing) |
| Codebase | ~133K lines TypeScript/GLSL |

---

## 2. End-to-End Pipeline

```
RAW SBD RECORDING (Archive.org)
         |
    [1. INGEST]
         |  Download audio, fetch setlist (setlist.fm), weather data
         |  Select best recording (rank by quality/bitrate/source)
         |  Output: audio files + setlist.json + show-context.json
         v
    [2. ANALYZE]
         |  Python librosa via Docker: 39 features/frame @ 30fps
         |  Stem separation (Demucs): vocals, drums, bass, other
         |  Melodic contour (piptrack), chord detection (24 templates)
         |  Section clustering (agglomerative MFCC-based)
         |  Output: {trackId}-analysis.json (3-9 MB per track)
         v
    [3. RESEARCH]
         |  Archive.org reviews, setlist statistics
         |  Claude AI generates historical context narratives
         |  Output: research.json
         v
    [4. SCRIPT]
         |  Claude generates episode structure
         |  Narration cues, segment breakdown, visual prompts
         |  Output: EpisodeScript in database
         v
    [5. ASSETS]
         |  Narration: ElevenLabs voice synthesis
         |  Images: Grok Aurora (hero) / FLUX Dev (scene)
         |  Videos: Replicate motion generation
         |  Archival: Wikimedia, Flickr, Library of Congress
         |  Output: /assets/{episodeId}/
         v
    [6. COMPOSITION BUILD]
         |  Convert script + analysis into Remotion composition props
         |  Build per-segment metadata (energy, onsets, spectral data)
         |  Calculate frame durations, interleave media
         |  Output: EpisodeProps JSON
         v
    [7. RENDER]
         |  Scene-by-scene via Remotion (3-segment sliding window)
         |  Chunked at 3000 frames to avoid Chrome OOM
         |  Per-segment MP4 @ CRF 18, H.264
         |  FFmpeg concat with 30-frame crossfades
         |  Loudness normalization to -14 LUFS (ITU-R BS.1770)
         |  Output: episode.mp4
         v
    FINISHED VIDEO
```

### CLI Commands

```bash
deadair ingest 1977-05-08              # Download + metadata
deadair analyze 1977-05-08             # Python audio analysis
deadair research 1977-05-08            # Claude AI context
deadair script 1977-05-08              # Episode structure
deadair produce 1977-05-08             # Full pipeline
deadair batch manifest.json            # Multi-show with retry/resume
```

---

## 3. Audio Analysis

### Python Pipeline (analyze.py)

**Sample Rate:** 22,050 Hz
**Hop Length:** 735 samples (= 30fps exactly)
**Execution:** Docker container (`dead-air-gpu`) or local Python 3.12

### Per-Frame Features (39 fields)

#### Spectral (11 fields)
| Field | Range | Description |
|-------|-------|-------------|
| `rms` | 0-1 | Root mean square energy |
| `centroid` | 0-1 | Spectral brightness (20Hz-20kHz mapped) |
| `flatness` | 0-1 | Tonal (0) vs noise (1) |
| `sub` | 0-1 | Sub-bass energy |
| `low` | 0-1 | Low frequency energy |
| `mid` | 0-1 | Mid frequency energy |
| `high` | 0-1 | High frequency energy |
| `chroma[12]` | 0-1 each | Pitch class distribution [C, C#, D, ... B] |
| `contrast[7]` | float | Spectral contrast across 7 bands |
| `onset` | 0-1 | Onset/transient strength |

#### Rhythm (5 fields)
| Field | Type | Description |
|-------|------|-------------|
| `beat` | bool | Beat detected this frame |
| `beatConfidence` | 0-1 | Clarity of beat structure |
| `downbeat` | bool | First beat of measure |
| `localTempo` | BPM | Per-frame tempo (8s window) |
| `musicalTime` | float | Beat count + fractional phase |

#### Melodic & Harmonic (8 fields)
| Field | Range | Description |
|-------|-------|-------------|
| `melodicPitch` | 0-1 | MIDI-normalized pitch (A0-C8) |
| `melodicDirection` | -1/0/+1 | Rising/steady/falling |
| `melodicConfidence` | 0-1 | Pitch detection confidence |
| `chordIndex` | 0-23 | 12 major + 12 minor chord templates |
| `chordConfidence` | 0-1 | Chord match strength |
| `harmonicTension` | 0-1 | Rate of chord change |
| `sectionType` | string | verse/chorus/bridge/solo/jam/intro/outro |
| `improvisationScore` | 0-1 | Free-form jamming detection |

#### Stem Separation (7 fields, Demucs-derived)
| Field | Range | Description |
|-------|-------|-------------|
| `stemBassRms` | 0-1 | Bass track energy |
| `stemDrumOnset` | 0-1 | Drum onset strength |
| `stemDrumBeat` | bool | Drum beat detected |
| `stemVocalRms` | 0-1 | Vocal track energy |
| `stemVocalPresence` | bool | Singing above P70 threshold |
| `stemOtherRms` | 0-1 | Guitar/keys energy |
| `stemOtherCentroid` | 0-1 | Guitar brightness |

#### Structure (2 fields)
| Field | Type | Description |
|-------|------|-------------|
| `sectionIndex` | int | 0-based section number |
| `sectionProgress` | 0-1 | Progress within current section |

### Section Clustering

Agglomerative clustering on MFCC features produces 3-12 sections per song, each tagged with energy level (low/mid/high) and average energy.

### Caching

```
cacheKey = MD5(audioPath + stemsDir + analysisType)
→ data/cache/audio-analysis/{cacheKey}.json
```

Avoids re-analyzing the same song across renders.

---

## 4. Composition Building

### Remotion Compositions (Root.tsx)

| Composition | Duration | Purpose |
|-------------|----------|---------|
| `ShowIntro` | 15.5s | Brand video + venue/date card |
| `SongVisualizer` x N | Per-song | Main audio-reactive visuals |
| `ChapterCard` x N | 6s each | Section dividers |
| `SetBreakCard` | 10s | Between sets |
| `EndCard` | 10-12s | Credits/closing |

**Resolution:** Reads `RENDER_WIDTH` / `RENDER_HEIGHT` env vars (default 1920x1080).

### Pre-Computation (Module Scope)

Before rendering begins, Root.tsx pre-computes cross-song state:
- **Show narrative arc** (8 phases across the concert)
- **Visual fatigue tracking** (shader/overlay usage across songs)
- **Shader variety enforcement** (no repeated shaders across adjacent songs)
- **Film stock selection** (seed-derived, consistent per show)

---

## 5. Visualizer Architecture

### SongVisualizer.tsx — Master Orchestrator

SongVisualizer is the central composition for each song. It manages 10 visual layers:

```
SongVisualizer.tsx
  |
  +-- SceneRouter                      [GLSL shader background]
  |     +-- ResolvedShader (1 of 56)
  |     +-- 90-frame crossfade at section boundaries
  |
  +-- SongArtLayer                     [Ken Burns poster art]
  |     +-- Energy-reactive opacity (70% intro → 10% peaks)
  |
  +-- LyricTriggerLayer               [Word-synced SDF icons]
  |     +-- Curated from lyric-triggers.json
  |
  +-- PoeticLyrics                     [Flowing text overlay]
  |     +-- WhisperX word-level alignment
  |
  +-- DynamicOverlayStack              [105 overlays, 10 layers]
  |     +-- Scheduled per-section via rotation engine
  |     +-- Energy-based opacity + beat-synced accents
  |
  +-- CrowdOverlay                     [Applause/crowd glow]
  |     +-- Detects crowd roar from audio spikes
  |
  +-- SpecialPropsLayer                [Title, DNA, milestones]
  |     +-- Song title card, chord info, play statistics
  |     +-- Fan quotes, archival reviews
  |
  +-- EraGrade                         [Per-era color treatment]
  |     +-- 5 eras: primal/classic/hiatus/touch_of_grey/revival
  |
  +-- EnergyEnvelope                   [Per-frame color modulation]
  |     +-- Saturation, brightness, vignette tied to energy
  |
  +-- CameraMotion                     [CSS camera transforms]
  |     +-- Beat-synced shake, bass tilt, jam drift
  |
  +-- AudioLayer                       [Concert audio playback]
```

### Climax State Machine (5 phases)

Tracks energy across the song to identify and respond to peak moments:

```
quiet → building → approaching → climax → sustain → resolving → quiet
```

Each phase modulates: shader intensity, overlay density, bloom threshold, camera motion, color saturation.

---

## 6. Shader System

### Architecture

All 56 shaders share a common infrastructure:

- **Shared Uniforms** (`uniforms.glsl.ts`): 51 uniforms injected via `${sharedUniformsGLSL}`
- **Post-Processing** (`postprocess.glsl.ts`): Configurable chain via `buildPostProcessGLSL(config)`
- **Noise Library** (`noise.ts`): snoise, fbm/fbm3/fbm6, curlNoise, ridgedMultifractal, hsv2rgb, SDF icons
- **Renderers:**
  - `FullscreenQuad.tsx` — single-pass WebGL quad (most shaders)
  - `MultiPassQuad.tsx` — ping-pong buffer for feedback shaders (uPrevFrame)
  - `DualShaderQuad.tsx` — dual render targets with GPU blending

### Key Uniforms (51 total)

```glsl
// Time & Frame
uniform float uTime, uFrame, uDuration;

// Audio (per-frame from analysis JSON)
uniform float uEnergy, uBass, uMids, uHighs;
uniform float uCentroid, uOnset, uBeat, uFlatness;
uniform float uSlowEnergy, uFastEnergy, uSpectralFlux;
uniform float uBeatDecay, uOnsetEnvelope;

// Stems
uniform float uStemBassRms, uStemDrumOnset, uStemDrumBeat;
uniform float uStemVocalRms, uStemVocalPresence;
uniform float uStemOtherRms, uStemOtherCentroid;

// Melodic & Harmonic
uniform float uMelodicPitch, uMelodicDirection;
uniform float uChordIndex, uHarmonicTension, uChordConfidence;

// Structure
uniform float uSectionType, uSectionProgress;
uniform float uEnergyForecast, uPeakApproaching, uBeatStability;

// Palette
uniform float uPaletteHue1, uPaletteHue2, uPaletteSaturation;
uniform float uChromaHue;

// Camera (3D)
uniform vec3 uCamPos, uCamTarget;
uniform float uCamFov, uCamDof, uCamFocusDist;

// Post-process control
uniform float uShowBloom, uShowGrain, uLensDistortion;
uniform float uClimaxIntensity, uBloomThreshold;

// Transition
uniform float uTransitionProgress;
```

### Shader Categories

| Category | Count | Examples |
|----------|-------|---------|
| **Volumetric Raymarching** | 3 | Clouds, Smoke, Nebula |
| **Organic/Psychedelic** | 12 | Liquid Light, Tie-Dye, Oil Projector, Ink Wash |
| **Cosmic** | 8 | Particle Nebula, Cosmic Dust, Galaxy Spiral, Aurora |
| **Geometric** | 8 | Sacred Geometry, Kaleidoscope, Mandala, Truchet Tiling |
| **Fire/Energy** | 6 | Inferno, Fractal Flames, Electric Arc, Solar Flare |
| **Digital/Glitch** | 5 | Signal Decay, Databend, Digital Rain, Spectral Analyzer |
| **Biological** | 5 | Reaction Diffusion, Morphogenesis, Mycelium, Coral Reef |
| **Atmospheric** | 5 | Deep Ocean, Fluid Light, Aurora Curtains, Smoke Rings |
| **Retro** | 4 | Lo-Fi Grain, Vintage Film, Concert Lighting, Stained Glass |

### Scene Registry Metadata

Each shader is registered with:

```typescript
{
  Component: SceneComponent,
  energyAffinity: "low" | "mid" | "high" | "any",
  complement: VisualMode,                    // Auto-variety opposite
  spectralFamily: "warm" | "bright" | "textural" | "tonal" | "cosmic",
  preferredTransitionIn?: SceneTransitionStyle,
  preferredTransitionOut?: SceneTransitionStyle,
  gradingIntensity?: number,                 // Default 1.0
}
```

### Section-Type Awareness

10 shaders modulate behavior based on `uSectionType`:
- **jam** → faster motion, denser patterns
- **space** → still, minimal, ambient
- **chorus** → vibrant colors, wider bloom
- **solo** → dramatic lighting, focused camera

---

## 7. Overlay System

### Registry (overlay-registry.ts)

**354 total overlays** — 105 active (22 A-tier, 83 B-tier), 249 archived (C-tier).

### 10-Layer Rendering Stack

| Layer | Name | Count | Examples |
|-------|------|-------|---------|
| 1 | Atmospheric | 8 | TieDyeWash, Fireflies, LighterWave |
| 2 | Sacred/Center | 13 | BreathingStealie, StealYourFaceOff |
| 3 | Reactive | 6 | WallOfSound, PhilZone, LightningBolt |
| 4 | Geometric | 10 | VoronoiFlow, PenroseTiling, MoirePattern |
| 5 | Nature/Cosmic | 4 | SunMoonMotif, ChinaCatSunflower |
| 6 | Character | 13 | BearParade, SkeletonBand, MarchingTerrapins |
| 7 | Artifacts/Info | 6 | SongTitle (always-active), VenueMarquee |
| 8 | Typography | — | Reserved |
| 9 | HUD | 10 | VUMeters, Oscilloscope, SpectrumAnalyzer |
| 10 | Distortion | 2 | VHSGlitch, FilmGrain (always-active) |

### Per-Overlay Metadata

```typescript
{
  name: string,
  layer: 1-10,
  tags: OverlayTag[],                                    // "cosmic", "intense", "dead-culture", etc.
  energyBand: "low" | "mid" | "high" | "any",
  weight: 1-3,                                           // Score boost
  dutyCycle: 1-100,                                      // Internal animation cycling %
  energyResponse: [baseEnergy, peakEnergy, responseFactor],
  tier: "A" | "B" | "C",
  alwaysActive?: boolean,
}
```

### Rotation Engine

**Schedule computed once per song** (deterministic via seeded PRNG):

1. **Hero overlay** — song identity's first `overlayBoost` entry appears in window 1
2. **A-tier ceiling** — only A-tier during high-energy peaks
3. **Per-window selection** — weighted random from filtered pool (energy band + tags + tier)
4. **Energy-scaled crossfade duration:**
   - Quiet sections: 150 frames (5s) — glacial tides
   - Mid energy: 90 frames (3s) — standard
   - Peak energy: 45 frames (1.5s) — snappy cuts

### Beat-Synced Accent Flashes

At detected beats, accent overlays (Dead iconography) pulse:
- High energy: 0.75 peak opacity, 25-frame onset threshold
- Mid energy: 0.60 peak, 35-frame threshold
- Low energy: 0.40 peak, 45-frame threshold
- 20-30 frame exponential decay

---

## 8. Audio Feature Mapping

### How Audio Drives Visuals (Examples)

**RMS Energy → Everything:**
```
rms → Gaussian-smoothed → audioSnapshot.energy
  → Shader: bloom threshold (0.60 at quiet → 0.45 at peak)
  → Overlay: crossfade speed (150 frames quiet → 45 frames peak)
  → Camera: zoom scale (1.12x quiet → 1.02x peak)
  → Color: saturation boost (0-25% based on energy)
  → Grain: intensity modulation
```

**Bass → Camera Shake + Shader:**
```
stemBassRms → uBass uniform
  → Camera: shake magnitude (±8px * bass * decay)
  → Camera: rotational tilt (±1.5° on bass hits)
  → Shader: low-frequency displacement in GLSL
```

**Onset → Beat Reactions:**
```
onset → beat detection → uBeat, uBeatDecay
  → Overlay: accent flash trigger
  → Camera: jolt (±8px impulse, 12-frame decay)
  → Shader: applyCameraCut() (6 shaders)
  → Transition: beat-synced crossfade timing
```

**Chroma → Color Palette:**
```
chroma[12] → chroma-palette.ts → dominant pitch class
  → uChromaHue (0-360° hue rotation)
  → Applied to 12+ shaders for harmonic color
```

**Stems → Visual Routing:**
```
stemVocalPresence → vocal spotlight (smoke-and-mirrors god rays)
stemDrumOnset → geometric shaders (rhythmic patterns)
stemBassRms → warm/organic shaders (fluid, fire)
stemOtherRms → textural shaders (tie-dye, feedback)
```

### Derived Features (Computed in TypeScript)

| Feature | Window | Description |
|---------|--------|-------------|
| `slowEnergy` | 6s rolling avg | Ambient energy baseline |
| `fastEnergy` | 0.27s window | Transient punch |
| `spectralFlux` | L2 norm | Rate of spectral change |
| `energyForecast` | 1-3s lookahead | Predicted energy (enables anticipation) |
| `peakApproaching` | 0-1 ramp | Grows as energy rises toward peak |
| `coherence` | multi-band | Band lock-in score (IT detector) |
| `energyAcceleration` | 2nd derivative | Rate of energy change |

---

## 9. Post-Processing Pipeline

### Chain (applied per-shader via buildPostProcessGLSL)

```glsl
// 1. LIFTED BLACKS — prevent pitch-black voids
floor = 0.08 + smoothstep(0.02, 0.10, energy) * 0.12
col = max(col, vec3(0.10, 0.08, 0.12) * floor)

// 2. BLOOM — energy-reactive glow
threshold = mix(0.60, 0.45, energy) + uBloomThreshold
bloomAmount = max(0.0, luma - threshold) * (1.2 + climaxBoost * 0.4)
col = col + bloomColor * bloomAmount  // screen blend

// 3. FILM GRAIN — era-appropriate texture
grain = random(uv * time) * grainStrength * uShowGrain
col += grain * vec3(1.0, 0.95, 0.85)  // warm tint

// 4. LENS DISTORTION — barrel distortion at peaks
uv = barrelDistort(uv, 0.02 + energy * 0.06)

// 5. STAGE FLOOD FILL — palette color in dark areas
fill = stageFloodFill(col, uv, time, energy, hue1, hue2)
col += fill * darknessMask  // additive, only in true blacks

// 6. CLIMAX BRIGHTNESS GUARANTEE — safety net
minLuma = isClimax * uClimaxIntensity * 0.04
if (luma < minLuma) col = col + lift * 0.4  // gentle additive
```

### Era Grading (5 eras)

| Era | Years | Treatment |
|-----|-------|-----------|
| Primal | 1965-1971 | High contrast, desaturated, heavy grain |
| Classic | 1972-1974 | Warm, balanced, moderate grain |
| Hiatus | 1975-1976 | Cool, muted, clean |
| Touch of Grey | 1977-1979 | Golden warmth, rich saturation |
| Revival | 1980-1995 | Bright, vivid, minimal grain |

### Film Stock (Seed-Derived Per Show)

5 stocks selected by `showSeed % 5`:
- Kodak Ektar, Fuji Portra, Kodachrome, CineStill, Cineon
- Each has signature warmth, contrast, saturation, grain, bloom multipliers

---

## 10. Transition System

### Scene-to-Scene (18 styles)

| Style | Description |
|-------|-------------|
| `dissolve` | Alpha blend (default) |
| `morph` | Spatial morph distortion |
| `flash` | White flash bridge |
| `void` | Fade to black, fade in |
| `radial_wipe` | Expanding/contracting circle |
| `distortion_morph` | Shader distortion blend |
| `luminance_key` | Luminance-based mask |
| `kaleidoscope_dissolve` | Fractal fold dissolve |
| `prismatic_split` | RGB channel separation |
| `chromatic_wipe` | Color-based wipe |
| `feedback_dissolve` | Noise-based dissolve |
| `spiral_vortex` | Vortex twirl |
| `interference_pattern` | Wave interference |
| `pixel_scatter` | Pixel displacement |
| `vine_grow` | Organic vine growth |
| `particle_scatter` | Particle burst |
| `gravity_well` | Black-hole pull |
| `curtain_rise` | Theatrical curtain |

### Dynamic Crossfade Duration

```
Quiet → Quiet:  240 frames (8s gentle dissolve)
Loud → Loud:    8 frames (hard cut)
Quiet → Loud:   18 frames (fast snap)
Loud → Quiet:   50 frames (moderate fade)
Default:         30 frames
```

Spectral flux compression: rapid timbral change compresses duration by up to 50%.

### Sacred Segue Detection

Consecutive songs (e.g., Scarlet Begonias → Fire on the Mountain) get:
- 1.5x transition duration
- "morph" style preference
- Palette continuity across the segue

---

## 11. Song Identity System

### Hand-Curated (62 songs)

```typescript
interface SongIdentity {
  preferredModes: VisualMode[],         // 4-8 shader modes
  palette: { primary: 0-360, secondary: 0-360 },
  overlayBoost?: string[],              // +0.30 scoring boost
  overlaySuppress?: string[],           // -0.40 scoring penalty
  overlayDensity?: number,              // 0.5-2.0 multiplier
  moodKeywords?: OverlayTag[],          // Bonus +0.15 per tag match
  climaxBehavior?: {
    peakSaturation?: number,
    peakBrightness?: number,
    flash?: boolean,                    // White flash at climax onset
    climaxDensityMult?: number,
  },
  transitionIn?: TransitionStyle,
  transitionOut?: TransitionStyle,
  drumsSpaceShaders?: Record<SubPhase, VisualMode>,
  hueShift?: number,
  saturationOffset?: number,
}
```

### Auto-Generated (Unmapped Songs)

When no curated identity exists, one is generated from audio features:

1. **Dominant stem** → shader family routing (vocal→bright, drum→geometric, bass→organic)
2. **Energy profile** → mode selection (low→ambient, mid→versatile, high→intense)
3. **Chroma entropy** → tonal vs textural routing
4. **Duration** → transition speed (short→snappy, long→sustained)

---

## 12. Show-Level Intelligence

### Show Arc (8 Phases)

```
set1_opening     → warm, character-forward, fast overlay rotation
set1_deepening   → balanced, standard rotation
set2_opener      → sacred boost, bold visual statement
set2_deep        → abstract, cosmic, geometric, slow (density 0.7)
drums_space      → ultra-abstract, sacred only, no characters (density 0.3)
post_space       → rebuilding, gentle reintroduction (density 0.6)
closing          → warmth returning, bittersweet
encore           → celebration, golden, all-friends party (density 1.3)
```

### Tour Position

```typescript
nightInRun: number    // Current show in run
daysOff: number       // Days since last show
```
- Early tour: +0.1 saturation (fresh energy)
- Late tour: -0.1 saturation (road weary)
- After days off: +0.15 saturation (recharged)

### Venue Profiles

| Venue Type | Overlay Density | Warmth | Grain | Bloom | Vignette |
|------------|----------------|--------|-------|-------|----------|
| Arena | 1.3x | +0.05 | 0.9x | 1.1x | 0.3 |
| Outdoor | 0.8x | -0.05 | 1.2x | 0.8x | 0.1 |
| Theater | 1.0x | +0.1 | 1.0x | 1.0x | 0.5 |

### Set Themes

- **Set 1:** Warm tones, character overlays, slower shader rotation
- **Set 2:** Cool cosmic tones, geometric/sacred priority, lower density
- **Encore:** Golden warmth, celebration, fast rotation

### Visual Fatigue Tracking

Cross-song state prevents visual repetition:
- Tracks shader usage per show (no repeats in adjacent songs)
- Tracks overlay usage (deprioritizes recently-seen overlays)
- Enforces variety via scoring penalties

---

## 13. 3D Camera System

### GLSL Camera Uniforms (6)

```glsl
uniform vec3 uCamPos;         // Orbital position (radius 3.0-3.5)
uniform vec3 uCamTarget;      // Look-at target (near origin)
uniform float uCamFov;        // 45-65 degrees (widens at peaks)
uniform float uCamDof;        // DOF strength (energy * 0.4 + climax * 0.3)
uniform float uCamFocusDist;  // Focus distance (2-5 range)
```

### Motion Components

**Orbital:** `radius = 3.5 - energy * 0.5` (closes in at peaks)
**Vocal Proximity:** 10% closer during singing
**Bass Shake:** `±0.06 * bass * (1 - steadiness)` on X/Y/Z
**Drum Jolt:** Impulse on `drumOnset > 0.5`, exponential decay
**Jam Drift:** Sinusoidal drift, phase-dependent frequency (0.02-0.04 Hz)

### CSS Camera Motion (CameraMotion.tsx)

Applied as CSS transforms (zero GPU cost):
- **Zoom:** 1.12x (quiet) → 1.02x (peaks) — subtle push-in at energy
- **Beat Shake:** ±8px impulse, 12-frame exponential decay
- **Bass Tilt:** ±1.5° rotation, 8-frame decay
- **Jam Drift:** Low-frequency sinusoidal sway (amplitude 1.5-6px)

---

## 14. DualShaderQuad Composition

GPU-level dual-shader rendering with real-time blending:

```
Shader A → RenderTarget A (HalfFloat)
Shader B → RenderTarget B (HalfFloat)
         → Composite Pass (blend shader) → Screen
```

### 5 Blend Modes

| Mode | Description |
|------|-------------|
| `luminance_key` | Bright areas of A reveal B |
| `noise_dissolve` | Perlin noise-based dissolve |
| `additive` | A + B (oversaturates brights) |
| `multiplicative` | A * B (darkens) |
| `depth_aware` | Luminance as fake depth |

Used for: climax dual-shader moments, persistent background layers, GPU-accelerated crossfades.

---

## 15. Video / Concert Footage Integration

### Show Intro (15.5s)

- **Phase 1 (0-7s):** Dead Air brand video (OffthreadVideo)
- **Phase 2 (7-15.5s):** CosmicVoyageScene nebula + venue/date text overlay

### Song Art Layer

Per-song poster art with Ken Burns zoom-pan:
- Intro (0-4s): 70% opacity with title card
- During song: energy-reactive (40% quiet, 10% peaks)
- Climax: further suppressed
- End: reappears as bookend

### Crowd Overlay

Detects crowd roar from audio spikes → warm glow overlay (screen blend, 0.2-0.4 opacity).

---

## 16. VJ Mode

### Architecture Difference

| Aspect | Remotion (Offline) | VJ Mode (Real-Time) |
|--------|-------------------|---------------------|
| **FPS** | 30fps rendered | 60fps target |
| **Audio** | Pre-computed JSON (39 features/frame) | Real-time FFT (WebAudio API) |
| **Shaders** | Same 56 shaders | Same 56 shaders |
| **Control** | Deterministic (seeded) | Operator-controlled |
| **Transitions** | Section-boundary triggered | Manual or auto-intelligent |
| **Output** | MP4 file | Live canvas |

### Audio Pipeline

```
Microphone / Audio File
  → AudioContext + AnalyserNode (FFT 1024/2048)
  → FeatureExtractor (18 real-time features)
  → BeatDetector (onset-threshold peak detection)
  → RollingAudioState (exponential smoothing)
  → SmoothedAudioState (32+ fields → shader uniforms)
```

### Operator Controls

- Scene picker (56 shaders)
- Palette controls (primary/secondary hue, saturation)
- Transition speed + mode (linear / beat-synced / beat-pumped)
- Auto-transition toggle (AI scene selection)
- Preset bank (9 slots, localStorage persisted)
- 10 FX toggles (bloom, grain, flare, halation, CA, CRT, anaglyph, etc.)
- Blackout / Freeze / Lock scene
- MIDI controller support
- Remote WebSocket bridge (iPad/external control)
- Show recording + playback

### Performance

**Optimal (M3 Pro, 18GB):** ANGLE GPU + resolution=0.5 → 60fps
**Never:** frameConcurrency > 1 with ANGLE (shared memory deadlock)

---

## 17. Rendering & Encoding

### Resolution Presets

| Preset | Resolution | Scale | CRF | Workers |
|--------|-----------|-------|-----|---------|
| Draft | 1280x720 | 0.667 | 23 | 6 |
| Preview | 1920x1080 | 1.0 | 23 | 4 |
| Final | 1920x1080 | 1.0 | 18 | 3 |
| **4K** | **3840x2160** | **2.0** | **18** | **4** |

### Mini-Composition Strategy

Chrome can't evaluate large compositions (>30K frames) without hanging. Solution: render with a **3-segment sliding window** (previous + target + next), keeping evaluation to ~300-500 frames per render call.

### Chunking

Segments > 3000 frames are split into chunks, each rendered in a fresh Chrome process to avoid ANGLE GPU memory leaks on Apple Silicon. Chunks are FFmpeg-concatenated with codec copy (no re-encoding).

### FFmpeg Operations

| Operation | Command | Purpose |
|-----------|---------|---------|
| Silence detection | `silencedetect=noise=-35dB:d=3` | Find gaps between songs |
| Segment split | `-ss {start} -to {end} -c copy` | Extract songs (no re-encode) |
| Chunk concat | `-f concat -safe 0 -c copy` | Join render chunks |
| Audio fade | `afade=t=in:d=0.034,afade=t=out` | Prevent clicks at boundaries |
| Loudness norm | `loudnorm=I=-14:TP=-1.5:LRA=11` | Two-pass LUFS normalization |

### Encoding

- **Video:** H.264, CRF 18 (final) / CRF 23 (preview)
- **Audio:** AAC @ 192kbps
- **FPS:** 30
- **Loudness:** -14 LUFS (ITU-R BS.1770, two-pass)

### Checkpoint/Resume

Each segment writes a checkpoint JSON after rendering. The `--resume` flag skips completed segments, enabling crash recovery without re-rendering finished work.

### Known Limitation

ShowIntro can timeout at 4K due to OffthreadVideo memory. Workaround: `--no-intro` flag.

---

## 18. Infrastructure & Testing

### Docker Images

| Image | Purpose | Key Deps |
|-------|---------|----------|
| `dead-air-gpu` | Librosa analysis + Demucs stems + WhisperX lyrics | Python 3.12, PyTorch, librosa, demucs, whisperx |
| `dead-air-analyze` | Enhanced audio analysis | Python 3.12, librosa |

Both use JSON stdin/stdout for clean IPC with the Node.js pipeline.

### Database (SQLite)

7 tables: `shows`, `episodes`, `assets`, `cost_log`, `analytics`, `jobs` + indexes.

### Test Suite

| Package | Tests | Focus |
|---------|-------|-------|
| visualizer-poc | ~326 | Shaders, audio analysis, climax state, overlays, visual utils |
| vj-mode | ~36 | MIDI, beat detector, audio state, store |
| pipeline | ~12 | Docker runner, cache, retry, orchestrator |
| core | ~4 | Logger, config, database |
| **Total** | **~1,021** | **All passing (vitest)** |

### Build Pipeline (Turbo)

```
build      → depends on ^build (transitive deps first), cached
test       → depends on build, cached
type-check → depends on ^build, cached
dev        → persistent (not cached)
```

### Hardware Requirements

**Recommended:** Apple Silicon M3 Pro+, 18GB+ RAM
**GPU Backend:** ANGLE (required on Apple Silicon, never frameConcurrency > 1)
**Render Speed:** 12-16 fps at 1080p, ~3-4 hours per hour of concert
**4K:** ~4x slower (scale 2.0), adaptive concurrency

---

## File Structure

```
dead-air/
├── packages/
│   ├── visualizer-poc/
│   │   ├── src/
│   │   │   ├── Root.tsx                    # Composition registration + pre-compute
│   │   │   ├── SongVisualizer.tsx          # Master orchestrator (10 layers)
│   │   │   ├── components/                 # 394 files (overlays, props, camera)
│   │   │   ├── scenes/                     # 62 files (56 shaders + routing)
│   │   │   ├── shaders/                    # 64 files (GLSL + shared infrastructure)
│   │   │   ├── data/                       # 41 files (registry, identities, config)
│   │   │   └── utils/                      # 98 files (audio, climax, camera, narrative)
│   │   ├── data/
│   │   │   ├── setlist.json               # Track metadata
│   │   │   ├── song-identities.json       # 62 curated profiles
│   │   │   ├── show-context.json          # Chapter cards
│   │   │   ├── tracks/{trackId}-analysis.json  # 3-9 MB per song
│   │   │   └── lyrics/{trackId}.json      # WhisperX alignment
│   │   └── public/audio/                  # SBD recordings
│   │
│   ├── pipeline/
│   │   └── src/
│   │       ├── ingest/                    # Archive.org + setlist + weather
│   │       ├── audio/                     # Librosa analysis + Docker runner
│   │       ├── research/                  # Claude AI context generation
│   │       ├── render/                    # Scene renderer + composition builder
│   │       ├── assets/                    # Image/narration/video generation
│   │       └── batch/                     # Multi-show orchestrator
│   │
│   ├── vj-mode/
│   │   └── src/
│   │       ├── audio/                     # Real-time FFT + beat detection
│   │       ├── engine/                    # Crossfade + auto-transition
│   │       ├── scenes/                    # Same 56 shaders (shared)
│   │       ├── ui/                        # Operator controls
│   │       ├── state/                     # Zustand store
│   │       └── remote/                    # WebSocket bridge
│   │
│   ├── cli/                               # Commander.js entry points
│   ├── core/                              # Types, logger, database
│   └── dashboard/                         # Express + React web UI
│
├── Dockerfile.gpu                         # Python analysis container
├── Dockerfile.analyze                     # Enhanced analysis container
├── turbo.json                             # Build pipeline config
├── pnpm-workspace.yaml                    # Monorepo workspace
└── tsconfig.base.json                     # Shared TypeScript config
```
