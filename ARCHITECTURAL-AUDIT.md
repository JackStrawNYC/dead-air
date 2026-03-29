# Dead Air — Complete Architectural Audit

> Audio-reactive concert visualizer for Grateful Dead soundboard recordings.
> Monorepo: 7 packages, 69 GLSL shaders, 87 active overlays, 852+ tests, Dockerized ML pipeline.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Audio Analysis Pipeline (Python)](#3-audio-analysis-pipeline)
4. [Visualizer Engine](#4-visualizer-engine)
5. [GLSL Shader System](#5-glsl-shader-system)
6. [Overlay System](#6-overlay-system)
7. [Scene Routing & Selection](#7-scene-routing--selection)
8. [Show-Level Personalization](#8-show-level-personalization)
9. [Song Identity System](#9-song-identity-system)
10. [Audio-Reactive System](#10-audio-reactive-system)
11. [Narrative & Arc Systems](#11-narrative--arc-systems)
12. [VJ Mode (Real-Time)](#12-vj-mode-real-time)
13. [CLI & Orchestration](#13-cli--orchestration)
14. [Infrastructure & DevOps](#14-infrastructure--devops)
15. [Test Coverage](#15-test-coverage)
16. [Data Flow Diagram](#16-data-flow-diagram)

---

## 1. System Overview

Dead Air is a **full-stack audio-visual rendering pipeline** that takes raw concert audio recordings and produces music videos where every visual element — shaders, overlays, colors, transitions, camera motion — is driven by real-time audio analysis.

### What It Does

1. **Ingests** concert audio from Archive.org (FLAC/MP3 soundboards)
2. **Analyzes** audio with Python/librosa at 30fps (39 features per frame), plus ML stem separation (Demucs), lyric alignment (WhisperX), and semantic classification (CLAP)
3. **Renders** video via Remotion (headless Chrome + Three.js/WebGL), compositing 69 GLSL shaders, 87 overlays, film grading, and text layers — all synchronized to audio features
4. **Personalizes** every show via deterministic seeding: same audio + same show seed = identical output; different show context = different visual treatment

### Key Numbers

| Metric | Value |
|--------|-------|
| GLSL shaders | 69 production |
| Active overlays | 87 (34 A-tier, 53 B-tier) from 356 registered |
| Shared GLSL uniforms | 57 |
| Audio features/frame | 39 fields at 30fps |
| Song identities (curated) | 86 |
| Era presets | 6 |
| Post-process effects | 33 composable stages |
| Tests | 852 (visualizer) + 83 (VJ mode) |
| Overlay layers | 10 depth layers |
| Show arc phases | 8 |
| Reactive trigger types | 5 |
| Semantic categories (CLAP) | 8 |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript 5.7 (strict), Python 3.12 |
| Video rendering | Remotion 4.0.242 |
| 3D graphics | Three.js 0.183 via @remotion/three |
| Shaders | GLSL (WebGL 1.0) |
| Audio analysis | librosa 0.10.2, Demucs 4.0.1, WhisperX 3.1.6, LAION-CLAP |
| ML inference | PyTorch (CPU), HuggingFace models |
| Containers | Docker (multi-image: analyze + GPU) |
| State management | React Context (visualizer), Zustand (VJ mode) |
| Validation | Zod |
| Testing | Vitest |
| Database | SQLite via better-sqlite3 |
| CI/CD | GitHub Actions |
| Build | Vite (web), tsc (libraries) |

---

## 2. Monorepo Structure

```
dead-air/
├── packages/
│   ├── core/              # Shared types, config, SQLite DB, logger
│   ├── pipeline/          # Render orchestration, FFmpeg, asset generation
│   ├── cli/               # Commander.js CLI (12 commands)
│   ├── remotion/          # Remotion compositions (cold opens, chapters, shorts)
│   ├── visualizer-poc/    # Main engine: shaders, overlays, audio reactivity
│   ├── vj-mode/           # Real-time WebGL VJ application
│   └── dashboard/         # Express + React SPA for render management
├── docker/                # Dockerfile.analyze, Dockerfile.gpu, docker-compose.yml
├── scripts/               # EC2 render scripts, data transforms
├── data/                  # Audio files, analysis JSON, setlists
└── [config files]         # turbo.json, tsconfig.base.json, eslint, prettier
```

### Package Dependency Graph

```
@dead-air/core (standalone)
     ↑
     ├── @dead-air/pipeline
     ├── @dead-air/cli
     ├── @dead-air/remotion
     └── @dead-air/dashboard

@dead-air/visualizer-poc (standalone, largest package)
@dead-air/vj-mode (standalone, imports shader source from visualizer-poc)
```

### Key Config

- **Node:** >=20.0.0
- **Package manager:** pnpm 9.15.4
- **TypeScript:** strict mode, ES2022 target, ESNext modules
- **Turborepo:** Caches build/lint/type-check/test outputs, dependency-aware task graph
- **ESLint:** Flat config, TS recommended, unused vars warning (except `_` prefix)

---

## 3. Audio Analysis Pipeline

### Overview

Raw concert audio goes through a **three-tier analysis pipeline**, each tier producing progressively more semantic features:

```
Tier 1: Core librosa (28 features/frame @ 30fps)
  ↓
Tier 2: Stem separation + derived features (7 additional fields)
  ↓
Tier 3: CLAP semantic understanding (8 categories)
  ↓
Output: 39 features/frame → JSON → consumed by visualizer
```

### Tier 1: Core Audio Analysis (`analyze.py`)

**Runtime:** Python 3.12, librosa 0.10.2
**Frame rate:** 30fps (hop_length=735 samples at sr=22050)

Per-frame features:

| Feature | Type | Description |
|---------|------|-------------|
| `rms` | float | Root-mean-square energy (0-1) |
| `centroid` | float | Spectral center of mass (0-1, brightness) |
| `onset` | float | Transient attack strength (0-1) |
| `beat` | bool | Beat grid pulse |
| `sub` | float | Sub-bass energy (0-100Hz) |
| `low` | float | Low-freq energy (100-400Hz) |
| `mid` | float | Mid-freq energy (400-2kHz) |
| `high` | float | High-freq energy (2-8kHz) |
| `flatness` | float | Spectral flatness (tonal vs noise) |
| `chroma[12]` | float[] | Pitch class histogram (C through B) |
| `contrast[7]` | float[] | 7-band spectral contrast |
| `localTempo` | float | Per-frame BPM |
| `beatConfidence` | float | Beat grid reliability (0-1) |
| `downbeat` | bool | Measure start pulse |
| `melodicPitch` | float | Dominant pitch (MIDI-normalized 0-1) |
| `melodicConfidence` | float | Pitch tracking reliability |
| `melodicDirection` | float | +1 rising, -1 falling, 0 steady |
| `chordIndex` | int | 0-23 (12 major + 12 minor chords) |
| `chordConfidence` | float | Chord detection reliability |
| `harmonicTension` | float | Rate of harmonic change |
| `sectionType` | string | intro/verse/chorus/bridge/solo/jam/space/outro |
| `improvisationScore` | float | Structured (0) vs free (1) |

**Section detection:** Agglomerative clustering on MFCC similarity matrix.

### Tier 2: Deep Audio Features (7 new fields)

| Feature | Source | Description |
|---------|--------|-------------|
| `tempoDerivative` | librosa | Rate of tempo change |
| `dynamicRange` | librosa | Local loudness range |
| `spaceScore` | derived | Silence/sparse detection (>0.6 for 2s+ → overrides sectionType to "space") |
| `timbralBrightness` | MFCC | Spectral brightness from MFCCs |
| `timbralFlux` | MFCC | Rate of timbral change |
| `vocalPitch` | stems | Vocal fundamental frequency |
| `vocalPitchConfidence` | stems | Vocal pitch reliability |

### Tier 2b: Stem-Specific Features (when Demucs stems available)

| Feature | Stem | Description |
|---------|------|-------------|
| `stemBassRms` | bass.wav | Bass guitar energy |
| `stemDrumOnset` | drums.wav | Drum transient strength |
| `stemDrumBeat` | drums.wav | Drum beat pulse |
| `stemVocalRms` | vocals.wav | Vocal volume |
| `stemVocalPresence` | vocals.wav | Vocal detection (bool) |
| `stemOtherRms` | other.wav | Guitar/keys energy |
| `stemOtherCentroid` | other.wav | Guitar/keys brightness |

### Tier 3: Semantic Understanding (CLAP)

**Model:** `laion/larger_clap_music` (~600MB)
**Window:** 2s audio, 0.5s hop, interpolated to 30fps, 1s Gaussian smooth

| Category | Probe Descriptions |
|----------|--------------------|
| `psychedelic` | "swirling effects", "trippy spacey", "liquid light" |
| `aggressive` | "loud driving rock", "heavy distorted", "intense drums" |
| `tender` | "gentle ballad", "soft intimate", "delicate fingerpicking" |
| `cosmic` | "vast space", "ethereal drone", "interstellar atmosphere" |
| `rhythmic` | "steady beat", "funky groove", "tight percussion" |
| `ambient` | "ambient drone", "quiet minimal", "peaceful meditative" |
| `chaotic` | "dissonant noise", "free improvisation", "atonal" |
| `triumphant` | "climactic peak", "euphoric", "grand majestic" |

### Stem Separation (Demucs)

**Model:** htdemucs (hybrid transformer)
**Output:** 4 WAV stems: `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav`
**Device:** Auto-selects CUDA > MPS > CPU

### Lyric Alignment (WhisperX)

**Model:** large-v3
**Output:** Word-level timestamps with confidence scores
**Use:** Karaoke-style lyric display synchronized to audio

### Pipeline Orchestration

```
CLI: deadair analyze --date 1977-05-08
  ↓
orchestrator.ts:
  1. Lookup show in SQLite DB
  2. Discover audio files (FLAC/MP3/SHN)
  3. Segment songs (FFmpeg silence detection or file matching)
  4. Parallel analysis (up to N workers):
     a. Check SHA256 cache → skip if cached
     b. Run analyze.py (Docker or local Python)
     c. Write per-song JSON to data/tracks/
  5. Detect peak moments (top 5 energy peaks)
  6. Assemble show-level analysis.json
```

### Docker Architecture

| Image | Base | Libraries | Memory | Purpose |
|-------|------|-----------|--------|---------|
| `dead-air-analyze` | python:3.12-slim | librosa, numpy, scikit-learn | Default | Audio feature extraction |
| `dead-air-gpu` | python:3.12-slim | torch, demucs, whisperx, laion-clap | 6-8GB | ML workloads |

Volumes: audio (read-only), output/stems/lyrics (read-write), cache (persistent model cache)

---

## 4. Visualizer Engine

### Architecture

The visualizer renders one song at a time as a Remotion composition. Each song gets its own `SongVisualizer` instance that orchestrates all visual systems.

```
Root.tsx (Composition loader)
  ├── ShowIntro (15.5s)
  ├── SongVisualizer × N songs (dynamic duration)
  │   ├── SceneRouter (shader selection + crossfade)
  │   │   └── FullscreenQuad / MultiPassQuad / DualShaderQuad
  │   ├── DynamicOverlayStack (overlay rotation + scoring)
  │   ├── EnergyEnvelope (brightness/saturation/hue modulation)
  │   ├── EraGrade (film stock color grading)
  │   ├── CameraMotion (3D camera system)
  │   ├── Text layers (ConcertInfo, NowPlaying, SetlistScroll)
  │   └── AudioLayer (MP3 sync)
  ├── ChapterCards (between songs)
  ├── SetBreak (10s)
  └── EndCard (12s)
```

### SongVisualizer.tsx — The Master Orchestrator (912 lines)

This is the central file. Every frame, it:

1. **Computes AudioSnapshot** — Gaussian-smoothed audio features from raw analysis
2. **Runs 12+ analysis modules** — Coherence, climax, jam evolution, groove, triggers, peaks, crowd energy, stem character, phrase boundaries, solo detection, visual fatigue, improv detection
3. **Routes scenes** — SceneRouter picks which shader to display per section
4. **Renders shader** — FullscreenQuad/MultiPassQuad executes GLSL with 57 uniforms
5. **Overlays** — DynamicOverlayStack scores and renders 5-20 overlays
6. **Post-processing** — EnergyEnvelope (CSS), EraGrade (film stock)
7. **Text layers** — Outside CameraMotion to avoid blur
8. **Special responses** — IT coherence flashes, dead air ambient shimmer

### Context Providers (Avoid Prop Drilling)

| Provider | Purpose |
|----------|---------|
| `ShowNarrativeProvider` | Cross-song state (used shaders, fatigue, peak detection) |
| `ShowContextProvider` | Show metadata (date, venue, era) |
| `AudioSnapshotProvider` | Current frame's smoothed audio features |
| `SongPaletteContext` | Effective color palette (curated > setlist > chroma-derived) |
| `HeroPermittedProvider` | Gates "hero icon" SDF emergence |
| `JamPhaseProvider` | Current jam phase (-1 to 3) |
| `PeakOfShowProvider` | Peak moment intensity (0-1) |
| `TimeDilationProvider` | Space phase time dilation (0.25-1.0x) |
| `EraGrade` | Film stock CSS filters |
| `EnergyEnvelope` | Global brightness/saturation/hue modulation |
| `CameraMotion` | 3D camera position/target/FOV/DOF |

### Rendering Components

**FullscreenQuad.tsx** (462 lines) — Single-pass shader renderer:
1. Render shader to HalfFloat render target
2. FXAA anti-aliasing pass
3. Display

**MultiPassQuad.tsx** (400+ lines) — Multi-pass with ping-pong buffers:
1. Optional previous-frame feedback texture (`uPrevFrame`)
2. Gap detection (reset on Remotion seek)
3. Main pass → N post-processing passes → FXAA → display

**DualShaderQuad.tsx** (250+ lines) — GPU-level crossfading:
- Renders Shader A and Shader B to separate targets
- Composites via blend shader (luminance_key, noise_dissolve, additive, multiplicative, depth_aware)
- Used during climax phase for dramatic visual escalation

---

## 5. GLSL Shader System

### Architecture

All 69 shaders share a **unified interface**: the same 57 GLSL uniforms, the same noise library, and a composable post-processing chain. This means any shader can react to any audio feature without custom plumbing.

```
┌─────────────────────────────────────────────┐
│  Shader File (e.g., liquid-light.ts)        │
│                                              │
│  ${sharedUniformsGLSL}    ← 57 uniforms    │
│  ${noiseGLSL}              ← noise toolkit  │
│  ${buildPostProcessGLSL(config)}  ← effects │
│                                              │
│  void main() {                               │
│    // Pattern generation (FBM, SDF, etc.)   │
│    // Audio-reactive modulation              │
│    // Color palette assignment               │
│    col = applyPostProcess(col, vUv, p);     │
│    gl_FragColor = vec4(col, 1.0);           │
│  }                                           │
└─────────────────────────────────────────────┘
```

### Shared Uniforms (57 fields)

| Category | Uniforms | Description |
|----------|----------|-------------|
| **Time** | `uTime`, `uDynamicTime` | Wall clock; energy-scaled (freezes in silence) |
| **Core audio** | `uBass`, `uRms`, `uCentroid`, `uHighs`, `uOnset`, `uBeat`, `uMids`, `uEnergy`, `uFlatness` | Direct audio features |
| **Smoothed** | `uSlowEnergy` (6s), `uFastEnergy` (0.27s), `uFastBass`, `uSpectralFlux`, `uEnergyAccel`, `uEnergyTrend`, `uLocalTempo` | Temporal derivatives |
| **Rhythm** | `uTempo`, `uOnsetSnap`, `uBeatSnap`, `uMusicalTime`, `uSnapToMusicalTime`, `uDownbeat`, `uBeatConfidence` | Beat grid |
| **Stems** | `uDrumOnset`, `uDrumBeat`, `uStemBass`, `uVocalEnergy`, `uVocalPresence`, `uOtherEnergy`, `uOtherCentroid` | Per-instrument |
| **Spectral** | `uChromaHue`, `uChromaShift`, `uAfterglowHue`, `uContrast0/1`, `uChroma0/1/2`, `uFFTTexture` | Pitch/spectrum |
| **Structure** | `uSectionProgress`, `uSectionIndex`, `uClimaxPhase`, `uClimaxIntensity`, `uCoherence`, `uJamDensity`, `uJamPhase`, `uJamProgress` | Song structure |
| **Palette** | `uPalettePrimary`, `uPaletteSecondary`, `uPaletteSaturation` | Color identity |
| **Melodic/Harmonic** | `uMelodicPitch`, `uMelodicDirection`, `uChordIndex`, `uHarmonicTension`, `uChordConfidence`, `uSectionType`, `uEnergyForecast`, `uPeakApproaching`, `uBeatStability`, `uImprovisationScore` | Musical intelligence |
| **Film grading** | `uShowWarmth`, `uShowContrast`, `uShowSaturation`, `uShowGrain`, `uShowBloom`, `uVenueVignette` | Per-show personality |
| **3D Camera** | `uCamPos`, `uCamTarget`, `uCamFov`, `uCamDof`, `uCamFocusDist` | Virtual camera |
| **Envelope** | `uEnvelopeBrightness`, `uEnvelopeSaturation`, `uEnvelopeHue` | CSS-side modulation |
| **Deep audio** | `uTempoDerivative`, `uDynamicRange`, `uSpaceScore`, `uTimbralBrightness`, `uTimbralFlux`, `uVocalPitch` | Level 2 features |
| **Semantic** | `uSemanticPsychedelic`, `uSemanticCosmic`, `uSemanticChaotic`, `uSemanticAggressive`, `uSemanticTender`, `uSemanticAmbient`, `uSemanticRhythmic`, `uSemanticTriumphant` | CLAP categories |
| **Peaks/Icons** | `uPeakOfShow`, `uHeroIconTrigger`, `uHeroIconProgress` | Transcendent moments |

**Design choice:** All shaders receive all uniforms. GLSL drivers optimize away unused ones at compile time. This eliminates per-shader uniform boilerplate (saving ~3,450 lines across 69 shaders) and lets any shader react to any feature.

### Post-Processing Chain (33 stages, per-shader configurable)

Each shader calls `buildPostProcessGLSL(config)` to select which effects to include:

| Stage | Effect | Audio Driver |
|-------|--------|-------------|
| 1 | Phil Bomb shockwave | Bass transient → radial UV warp |
| 2 | Thermal shimmer | Energy → heat-haze distortion |
| 3 | Lens distortion | Energy → barrel curvature |
| 4 | Beat jolt | Beat snap → micro-displacement |
| 5 | Beat pulse | Tempo → brightness/saturation swell |
| 6 | Bloom | Energy → self-illumination threshold |
| 7 | Stage flood fill | Palette noise in dark areas |
| 8 | Light leak | Drifting warm amber glow |
| 9 | Anamorphic flare | Bright pixels → horizontal streak |
| 10 | Halation | Warm film glow (red channel bleed) |
| 11 | Depth of field | Camera DOF → radial blur |
| 12 | CRT phosphor | Scanlines + RGB sub-pixel |
| 13 | Chromatic aberration | Energy → R/B fringing |
| 14 | Anaglyph 3D | Red/cyan depth separation |
| 15 | Cinematic grade | ACES filmic tone mapping |
| 16 | Envelope modulations | CSS brightness/saturation/hue |
| 17 | Semantic grading | Psychedelic↔tender, aggressive↔cosmic |
| 18 | Temporal blending | 12-18% feedback accumulation |
| 19 | Show personality | Seed-derived warmth/saturation |
| 20 | Venue vignette | Edge darkening by venue type |
| 21 | Palette cycling | Energy-driven hue rotation |
| 22 | Film grain | Animated, resolution-aware |
| 23 | Onset saturation pulse | Color punch on transients |
| 24 | Improvisation bloom | Glow when band explores |
| 25 | Sacred geometry | Flower-of-life pattern, beat-locked |
| 26 | Onset hue punch | Hue rotation on attacks |
| 27 | Melodic hue breathing | Pitch contour → subtle hue drift |
| 28 | Lifted blacks | Ambient stage wash floor |
| 29 | Darkness texture | Micro-noise in near-black |
| 30 | Crowd roar embers | Warm particles in dead air |
| 31 | Climax brightness guarantee | Safety floor during peaks |
| 32 | Show contrast | Seed-derived curve intensity |
| 33 | Universal brightness floor | 6% minimum luminance |

### Noise Library (`noise.ts`, 862 lines)

| Function | Use |
|----------|-----|
| `snoise(vec3)` | 3D simplex noise (base building block) |
| `fbm(vec3)` | 4-octave fractional Brownian motion |
| `fbm3(vec3)` / `fbm6(vec3)` | 3/6 octave variants (speed vs detail) |
| `curlNoise(vec3)` | Divergence-free 3D flow (fluid advection) |
| `ridgedMultifractal()` | Sharp ridges (volcanoes, coral) |
| `hsv2rgb()` / `rgb2hsv()` | Color space conversion |
| `acesToneMap(vec3)` | Industry-standard filmic tone mapping |
| `cinematicGrade()` | Hue-preserving tone + harmonic palette cycling |
| `sdStealie(vec2)` | Steal Your Face SDF (Grateful Dead logo) |
| `heroIconEmergence()` | Fullscreen 1.2x SDF with chromatic fringe |
| `beatPulse(float)` | Sharp spike at beat boundaries |

### Shader Categories (69 total)

| Category | Count | Examples |
|----------|-------|---------|
| **Volumetric raymarching** | 7 | inferno, volumetric_clouds, deep_ocean, bioluminescence |
| **Fractals/procedural** | 8 | kaleidoscope, fractal_zoom, sacred_geometry, reaction_diffusion |
| **Wave/fluid dynamics** | 6 | liquid_light, fluid_2d, ocean |
| **Particle systems** | 5 | particle_nebula, particle_burst, cosmic_dust |
| **Atmospheric/ethereal** | 8 | aurora, nebula variants, void_light, space_travel |
| **Abstract patterns** | 8 | tie_dye, ink_wash, acid_melt, databend, electric_arc |
| **Geometric lights** | 6 | diffraction_rings, concert_beams, smoke_and_mirrors |
| **Nature/organic** | 8 | forest, river, campfire, desert_road, rain_street |
| **Advanced effects** | 7 | climax_surge, galaxy_spiral, morphogenesis |
| **Minimal/stark** | 4 | stark_minimal, lo_fi_grain, blacklight_glow |

### How Shaders Use Audio

Common patterns across all 69 shaders:

| Uniform | Visual Effect |
|---------|--------------|
| `uEnergy` | Overall brightness, opacity, density |
| `uBass` | Scale/amplitude (low-frequency "weight") |
| `uHighs` | Fine detail/sharpness |
| `uOnsetSnap` | Distortion/burst on transient attacks |
| `uDynamicTime` | Motion speed (freezes in silence, accelerates at peaks) |
| `uJamPhase/uJamDensity` | Jam=denser/faster, space=sparse/slow |
| `uMelodicPitch` | Vertical/rotational modulation |
| `uChordIndex` | Hue selection from palette |
| `uSectionType` | Qualitative behavior (chorus=vibrant, space=minimal) |
| `uClimaxPhase` | Safety floor + intensity boost at peaks |

### 3D Camera System

Pure function computing camera position, target, FOV, DOF from audio state:

- **Orbital motion:** Slow elliptical orbit, radius contracts with energy
- **Bass shake:** Dampened by beat stability (tight rhythm = steady cam)
- **Drum jolt:** Subtle impulse on drum transients
- **Vocal dampening:** Less shake when singing (intimate feel)
- **FOV:** 50-60° (wider at peaks)
- **DOF:** Stronger at peaks, focus distance shortens

---

## 6. Overlay System

### Architecture

87 active overlays (from 356 registered) rendered on 10 depth layers. A **continuous scoring engine** evaluates each overlay every frame against the current audio state.

### Registry Structure

Each overlay entry:

```typescript
{
  name: "BreathingStealie",
  tier: "A",                        // A=essential, B=solid, C=archived
  layer: 2,                         // 1=back, 10=front
  category: "sacred",               // sacred/reactive/atmospheric/character/...
  tags: ["dead_culture", "cosmic"], // For texture matching
  energyBand: "mid",               // low/mid/high/any
  weight: 2,                        // Visual dominance 1-3
  energyResponse: [0.2, 0.7, 3],   // [threshold, peak, falloff] curve
  audioAffinity: {                  // Per-feature scoring
    spectralFlux: 0.8,
    energy: 0.5,
    vocalPresence: -0.3
  },
  blendMode: "screen"
}
```

### Scoring Formula

Per-overlay, per-frame:

```
score = baseScore(energyBand, energyResponse)
      + audioAffinityScore(audioSnapshot, overlay.audioAffinity)
      + tagWeights(snapshot features)
      + contextBias(climax, section type, energy phase)
      + songIdentityBoost(overlayBoost: +0.50, overlaySuppress: -0.40)
      + showArcBias(e.g., drums_space: sacred+0.40, character-0.40)
      + stemSectionBias(vocal→sacred, jam→reactive, quiet→wash)
      + semanticBias(CLAP category → overlay category)
      + reactiveTriggerBoost(if active trigger)
      - coherenceLock(suppress during peak moments)
      - endScreenDim(fade in final 20s)
```

### Density Modulation (12-Factor Product)

Overall overlay density is a product of 12+ factors:

```
combinedDensity = climaxMod × jamEvolution × sectionVocab × narrativeDirective
                × endScreen × venueProfile × crowdDensity × fatigue
                × stemInterplay × peakOfShow × tempoLock × crowdEnergy
                × stemCharacter × abstractionLevel
```

Hard-clamped: `max(0.15, combined)` — Dead iconography always visible.

### Overlay Themes

| Category | Examples | Count |
|----------|---------|-------|
| Sacred (Dead iconography) | BreathingStealie, ThirteenPointBolt, SkullRoses, DarkStarPortal | 11 |
| Character | BearParade, SkeletonBand, MarchingTerrapins, JerrySpotlight | 10 |
| Reactive | LightningBoltOverlay, WallOfSound, ParticleExplosion | 3 |
| Atmospheric | TieDyeWash, FilmGrain | 2+ |
| Nature/Geometric/Artifact | Various | 60+ |

**Dead Culture Guarantee:** Every rotation window has >=1 Dead-themed overlay (Stealies, Bears, Roses, Skeletons, Lightning Bolts, Terrapins).

---

## 7. Scene Routing & Selection

### SceneRouter — How Shaders Are Chosen

The SceneRouter picks which shader to display per section of a song. It's the main decision engine.

**Priority chain:**

1. **Explicit override** — If `song.sectionOverrides[n].mode` set, use it (highest priority)
2. **Coherence lock** — Hold current shader during band "lock-in" (IT detector)
3. **Reactive trigger** — Mid-section audio event forces matching shader pool (15-frame fast crossfade)
4. **Energy-affinity morphing:**
   - Filter shaders by energy level (low/mid/high pool)
   - Intersect with song identity's `preferredModes` (2x weight)
   - Apply spectral-categorical filtering (timbral family → shader spectralFamily match)
   - Apply recency weighting (penalize recently-used modes)
   - Apply stem section bias (solo→dramatic, vocal→warm, jam→generative)
   - Apply chord mood bias, improvisation bias, narrative arc bias, duration bias
   - Seeded selection from weighted pool

### Recency Weighting (Anti-Convergence)

Prevents the "big 4" problem (same high-energy shaders repeating):

| Usage Status | Copies in Pool |
|-------------|---------------|
| Never used | 8 (strong boost) |
| Used 3+ songs ago | 1-6 (recency decay) |
| Used in last 2 songs | 1 (hard cooldown) |

### Dynamic Crossfade Duration

Transition speed adapts to musical context:

| Energy Transition | Duration | Feel |
|-------------------|----------|------|
| Quiet → quiet | 240 frames (8s) | Gentle dissolve |
| Loud → loud | 8 frames | Hard cut |
| Quiet → loud | 18 frames | Fast snap |
| Loud → quiet | 50 frames | Moderate fade |
| High spectral flux | 0.5-1.0x compression | Faster during timbral change |

### Segue Handling

Sacred segues (e.g., Scarlet→Fire) get special treatment:
- Duration: 1.5x normal (900→1350 frames)
- Style: morph/dissolve/distortion_morph
- Palette: Hue crossfade from outgoing to incoming song's palette

---

## 8. Show-Level Personalization

Every show gets a unique visual character through 7 composable systems:

### 8.1 Show Seed

```typescript
showSeed = hashString(date + "::" + venue)
// e.g., "1977-05-08::Barton Hall, Cornell University" → deterministic seed
```

Salts all procedural choices. Same audio + same seed = identical render.

### 8.2 Era Presets (6 historical eras)

| Era | Years | Film Stock | Grain | Color | Shader Pool |
|-----|-------|-----------|-------|-------|-------------|
| **Primal** | 1965-67 | Kodachrome 16mm | 2.0x | Orange-shifted, muted | liquid_light, feedback_recursion |
| **Classic** | 1968-79 | Ektachrome | 1.3x | Vivid, natural | Full pool |
| **Hiatus** | 1975-76 | 16mm Reversal | 1.5x | Desaturated, cool | Limited |
| **Brent Era** | 1980-86 | Betacam SP | 0.7x | Clean, pink cast | Modern pool |
| **Touch of Grey** | 1987-90 | U-Matic | 0.5x | Punchy, neon | Extended |
| **Revival** | 1991-95 | DV/Hi8 | 0.8x | Neutral, soft | Full pool |

### 8.3 Venue Profiles

| Venue Type | Vignette | Bloom | Warmth | Overlay Density | Grain |
|------------|----------|-------|--------|-----------------|-------|
| Arena | 0.3 (open) | 1.25x | Cool | 1.3x | 0.8x |
| Amphitheater | 0.5 | 1.10x | Neutral | 1.0x | 0.9x |
| Theater | 0.7 (intimate) | 0.90x | Warm | 0.8x | 1.1x |
| Club | 0.8 (tight) | 0.80x | Very warm | 0.6x | 1.3x |
| Festival | 0.2 (vast) | 1.30x | Cool | 1.4x | 0.7x |

### 8.4 Show-Level Film Stock (Seed-Derived)

Each show derives 5 parameters from its seed:

| Parameter | Range | Effect |
|-----------|-------|--------|
| Warmth | -0.15 to +0.15 | Hue rotation |
| Contrast | 0.95 to 1.12 | Curve intensity |
| Saturation | -0.05 to +0.10 | Color richness |
| Grain | 0.7 to 1.4 | Film grain intensity |
| Bloom | 0.6 to 1.4 | Peak brightening |

### 8.5 Tour Position Modifiers

Night-in-run and days-off context add small (~10-20%) tweaks:

- **Opener night:** Cool, crisp, tighter density
- **Final night:** Warm, spacious, sacred bias
- **Fresh from days off:** Bright, eager, higher density

### 8.6 Set Themes

| Set | Character | Shaders Boosted |
|-----|-----------|-----------------|
| Set 1 | Warm, punchy, +5° warmth | concert_lighting, tie_dye, inferno |
| Set 2 | Cool, ethereal, -8° warmth | cosmic_voyage, deep_ocean, sacred_geometry |
| Encore | Golden, intimate, +3° warmth | oil_projector, vintage_film, aurora |

### 8.7 Show Arc (8 Phases)

| Phase | When | Density | Hue Shift | Abstraction |
|-------|------|---------|-----------|-------------|
| set1_opening | First 2 songs | 1.2x | +5° warm | 0.0 |
| set1_deepening | Rest of Set 1 | 1.0x | 0° | 0.0 |
| set2_opener | First song Set 2 | 1.4x | -5° cool | 0.1 |
| set2_deep | Mid Set 2 | 0.7x | -10° cosmic | 0.7 |
| drums_space | Jam segment | 0.3x | +15° blue | 1.0 |
| post_space | After jam | 0.6x | +5° warm | 0.5 |
| closing | Last 2 before encore | 0.9x | +8° golden | 0.3 |
| encore | Set 3 | 1.3x | +12° warm gold | 0.2 |

### Composition Order

All modifiers compose in sequence:

```
Base show arc modifiers
  + Set theme (additive offsets, multiplicative multipliers)
  + Tour position modifiers
  + Venue profile
  + Era preset filtering
  + Film stock (show-level seed)
= Final visual treatment for this song in this show
```

---

## 9. Song Identity System

### 86 Hand-Curated Identities

Each Grateful Dead song has a curated visual personality:

```typescript
interface SongIdentity {
  preferredModes: VisualMode[];      // 5-7 favorite shaders
  palette: ColorPalette;              // {primary: hue°, secondary: hue°, saturation}
  overlayBoost?: string[];            // Always-include overlays (+0.50 score)
  overlaySuppress?: string[];         // Never-include overlays (-0.40 score)
  overlayDensity?: number;            // 0.5-2.0 multiplier
  moodKeywords?: string[];            // Tags for overlay texture matching
  climaxBehavior?: {                  // Peak moment tuning
    peakSaturation?: number;
    peakBrightness?: number;
    flash?: boolean;
  };
  narrativeArc?: string;              // meditative_journey | jam_vehicle | elegy | ...
  thematicTags?: string[];            // Story/mood descriptors
}
```

### Fallback: Auto-Generated Identity

Songs not in the curated list derive identity from audio analysis:
- **Palette:** Chroma-based primary/secondary hues + entropy-based saturation
- **Preferred modes:** Energy/tempo heuristics map to shader families
- **Density:** Derived from average energy profile

### Show-Driven Mode Narrowing

From 7 preferred modes → 4 selected per show (seeded):

```
Same song + same show seed → same 4 shaders every time
Same song + different show seed → different 4 shaders
```

### Audio-Derived Palettes (`chroma-palette.ts`)

When no curated palette exists:
1. Average 12 chroma bins across all frames
2. Primary hue = highest-energy pitch class (C=0°, C#=30°, ..., B=330°)
3. Secondary hue = second-highest bin >=60° away
4. Saturation from chroma entropy (peaked=0.95, flat=0.55)
5. Seed-driven jitter (±25° hue, ±0.08 saturation) for show variety

### Modal Color (`modal-color.ts`)

During jam/solo sections, detect musical mode and shift colors:

| Mode | Feel | Hue Shift |
|------|------|-----------|
| Ionian (major) | Bright, assertive | +15° |
| Dorian | Dark, mysterious | -30° |
| Phrygian | Exotic | -60° |
| Lydian | Ethereal | +37° |
| Mixolydian | Bluesy, warm | +22° |
| Aeolian (minor) | Introspective | -45° |
| Locrian | Tense | 0° |

---

## 10. Audio-Reactive System

### Three-Level Architecture

**Level 1: Direct Features (per-frame)**
Raw audio → Gaussian smoothing → shader uniforms

```
energy: 25-frame window (0.83s)
slowEnergy: 180-frame window (6s, for ambient drift)
fastEnergy: 8-frame window (0.27s, for transient punch)
onsetEnvelope: fast attack, 10-frame exponential release
beatDecay: fast attack, 15-frame exponential release
```

**Level 2: Derived Intelligence (multi-frame analysis)**

| Module | Output | Used By |
|--------|--------|---------|
| Climax detection | 5-phase state machine (idle→build→climax→sustain→release) | Density, saturation, brightness |
| Coherence/"IT" detector | Lock score 0-1 + isLocked boolean | Shader lock, flash response |
| Jam evolution | 4 phases (exploration→building→peak→resolution) | Shader pool, density, FBM octaves |
| Groove detector | 4 types (pocket/driving/floating/freeform) | Camera motion, warmth, pulse |
| Phrase boundaries | Musical phrase start/end detection | Transition timing |
| Solo detection | Solo instrument + duration tracking | Shader focus |
| Stem character | Dominant musician (Jerry/Phil/drums) | Shader bias |
| Crowd energy | Audience momentum tracking | Density multiplier |
| Visual fatigue | Cumulative show dampening | Density reduction |
| Peak of show | One-time transcendent moment | Hero icon, brightness boost |

**Level 3: Semantic Understanding (CLAP)**

8 semantic categories at 30fps drive shader/overlay bias:
- High psychedelic → boost kaleidoscope, sacred_geometry
- High aggressive → boost inferno, electric_arc
- High tender → boost aurora, oil_projector
- High cosmic → boost void_light, cosmic_dust

### Reactive Triggers (5 types)

Mid-section audio events that force immediate visual response:

| Trigger | Detection | Shader Pool | Overlays |
|---------|-----------|-------------|----------|
| spectral_eruption | Flux >2x baseline | inferno, electric_arc, fractal_flames | LightningBolt, ParticleExplosion |
| interplay_shift | Dominant stem changes | kaleidoscope, sacred_geometry | BreathingStealie |
| groove_solidify | Beat confidence surge | mandala_engine, truchet_tiling | WallOfSound |
| energy_eruption | RMS jump >50% in 2s | climax_surge, inferno | ParticleExplosion |
| improv_spike | Improv score >0.65 | feedback_recursion, fluid_2d | DarkStarPortal |

Hysteresis: hold=4s, cooldown=6s, coherence lock suppresses all.

### Dynamic Time

Time advances proportionally to energy:
- Quiet (15th percentile) → 12% speed
- Loud (85th percentile) → 100% speed
- Tempo-scaled: 90 BPM → 75% of 120 BPM baseline

Result: Quiet passages drift slowly; peaks have rapid, intense pattern evolution.

---

## 11. Narrative & Arc Systems

### Coherence / "IT" Detection

Detects when the band "locks in" — pure musical coherence:

**4-signal composite:**
1. Chroma stability (30-frame cosine similarity): 0.30 weight
2. Beat regularity (inverse std dev of intervals): 0.25 weight
3. Spectral density (mean 7-band contrast): 0.25 weight
4. Energy sustain (inverse spectral flux): 0.20 weight

**Lock detection:** Enter at score >0.65 for 90 frames (3s), exit at <0.45 for 60 frames.

**Visual response when locked:**
- Flash intensity 0.1-0.4 (chromatic burst)
- Beat-synced strobe 0.05-0.2
- Camera lock (freeze motion)
- Overlay opacity halved (highlight shader)
- If first few locks of the show: force transcendent shader (cosmic/void)

### Climax State Machine

```
idle → [energy >0.25 for 180f, rising] → build
build → [energy >0.30 for 300f] → climax
climax → [energy drops but >0.25] → sustain
sustain → [energy falls] → release
release → [energy stabilizes] → idle
```

Each phase modulates: overlay density (1.5-2.5x at peak), color temperature (warm shift), saturation boost, camera drama.

### Jam Evolution

Long jams (>120s continuous high energy) tracked with sub-phases:

| Phase | Character | Visual Treatment |
|-------|-----------|-----------------|
| 0: Exploration | Loose opening | Sparse detail, gentle drift |
| 1: Building | Momentum ramp | Increasing density, brighter |
| 2: Peak/Space | Highest energy or atmospheric | Maximum detail, transcendent shaders |
| 3: Resolution | Wind-down | Settling, simplified patterns |

### Peak of Show

One-time transcendent moment per show:

**Score:** `energy × (0.5 + coherence×0.5) × (0.7 + tension×0.3)`

**Conditions:** Score exceeds all previous peaks by 1.1x, not in first 40% of setlist, fires once.

**Visual treatment (7s):** +0.20 brightness, +0.35 saturation, 0.5x overlay density, 0.6x camera motion.

### Visual Narrator

Composes show arc + song identity + section type + groove into unified **NarrativeDirective**:

```typescript
{
  heroPermitted: boolean,       // Allow hero icon emergence
  overlayDensityMult: 0.7-1.5,
  motionMult: 0.5-2.0,
  saturationOffset: -0.1 to +0.2,
  brightnessOffset: -0.15 to +0.3,
  temperature: -0.1 to +0.15,
  abstractionLevel: 0-1
}
```

### Section Vocabulary

Per-section-type visual treatment:

| Section | Overlay Density | Camera Steadiness | Drift Speed | Saturation |
|---------|-----------------|-------------------|-------------|-----------|
| Verse | 0.7x | 0.8 | 0.8x | 0 |
| Chorus | 1.3x | 0.5 | 1.2x | +0.15 |
| Jam | 0.5x | 0.3 | 1.3x | -0.03 |
| Space | 0.25x | 0.9 | 0.4x | -0.12 |
| Solo | 0.4x | 0.4 | 1.5x | +0.20 |

---

## 12. VJ Mode (Real-Time)

### Architecture

VJ Mode is a standalone Vite + React app that renders the same 69 shaders in real-time using Web Audio API instead of pre-analyzed data.

```
Web Audio (mic/file) → AudioAnalyzer → FeatureExtractor → RollingAudioState
                                                              ↓
                                              VJUniformBridge → 100+ GLSL uniforms
                                                              ↓
                                              VJCanvas (Three.js @60fps)
                                                              ↓
                                              VJSceneCrossfade (dual canvas + transitions)
```

### Key Differences from Offline Renderer

| Aspect | Offline (Remotion) | Real-Time (VJ Mode) |
|--------|-------------------|---------------------|
| Audio source | Pre-analyzed JSON (39 features) | Web Audio FFT (approximated) |
| Frame rate | 30fps (Remotion timeline) | 60fps (requestAnimationFrame) |
| Scene selection | Deterministic (show arc, identity) | Intelligent auto + operator control |
| Control | Composition-driven | Keyboard (40+ bindings), MIDI, WebSocket |
| Recording | Output to MP4 | Event capture as JSON replay |

### Auto-Transition Engine

Energy state machine drives intelligent scene selection:

```
quiet → building → peak → releasing → groove → quiet
```

Scores candidate scenes: energy affinity (+3), transition affinity (+2), recency penalty (-1), show intelligence bias.

### Show Intelligence

Tracks session state: scene usage counts, show phase (opening→building→peak→wind_down), phase-energy preferences.

### Operator Controls

40+ keyboard bindings: 1-0/Q-O for scene select, Space for transition, Tab for auto mode, P for palette cycle, B/N for blackout/freeze, arrows for hue/saturation, R for recording, X for FX panel, Shift+1-9 for preset banks.

### Remote Control

WebSocket bridge (port 8765) enables multi-client remote control with state synchronization.

---

## 13. CLI & Orchestration

### Commands (12)

| Command | Purpose |
|---------|---------|
| `ingest` | Download audio + metadata from Archive.org |
| `analyze` | Run audio analysis pipeline |
| `research` | Claude-powered show research |
| `script` | Generate visual narrative |
| `generate-assets` | Produce video assets/overlays |
| `produce` | Master orchestrator (all stages) |
| `preview` | Open Remotion Studio |
| `publish` | Export final video |
| `catalog` | List processed shows |
| `status` | Check pipeline progress |
| `batch` | Process multiple shows |
| `generate-show` | Create setlist.json from date + song identities |

### Master Pipeline (`produce`)

```
ingest → analyze → research → bridge → script → generate → render
```

Each stage checkpointed. Supports `--from`/`--to` for partial runs, `--preview` for fast 720p, `--lambda` for AWS rendering.

### Show Generation (`generate-show`)

Creates setlist.json by:
1. Looking up each song title in 86 curated identities
2. Assigning default shader, palette, trackId
3. Auto-detecting era from year
4. Supporting venue type override

---

## 14. Infrastructure & DevOps

### CI/CD (GitHub Actions)

- **test:** Vitest across all packages
- **render:** Full show render (`deadair produce --preset draft/preview/final/4k`)
- **prompt:** Claude Code action for custom tasks
- Runner: ubuntu-latest, 120-minute timeout

### Database

SQLite via better-sqlite3. Stores: shows, segments, analysis metadata, render jobs.

### Environment Variables

- Archive.org auth (soundboard downloads)
- AI APIs (Anthropic, OpenAI, Replicate, xAI, ElevenLabs)
- YouTube (publishing)
- Setlist.fm
- Database/data paths
- Remotion concurrency settings

### Performance

| Context | Metric |
|---------|--------|
| Studio mode | ~30fps interactive |
| CLI render (1080p) | 1-3 min per minute of video |
| 4K render | 3840x2160 via env vars |
| Per-frame budget | ~50-100ms (audio snapshot + shader + overlays) |
| Analysis JSON | ~9.5MB per song |
| GPU memory | ~45MB @ 1080p, ~150MB @ 4K |

---

## 15. Test Coverage

| Package | Test Files | Tests | Framework |
|---------|-----------|-------|-----------|
| visualizer-poc | 24+ | 852 | Vitest |
| vj-mode | 6 | 83 | Vitest |
| pipeline | Multiple | Various | Vitest |
| core | Multiple | Various | Vitest |

Tests cover: audio-reactive computation, climax detection, coherence, overlay scoring, scene routing, shader registry validation, song identity lookup, schema validation.

---

## 16. Data Flow Diagram

```
                              ┌──────────────────────┐
                              │   Archive.org Audio   │
                              │   (FLAC/MP3/SHN)     │
                              └──────────┬───────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐       ┌─────▼─────┐       ┌─────▼─────┐
              │  librosa   │       │  Demucs   │       │  WhisperX │
              │  30fps     │       │  4 stems  │       │  lyrics   │
              │  28 fields │       │           │       │           │
              └─────┬──────┘       └─────┬─────┘       └─────┬─────┘
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  Enhanced Analysis   │
                              │  39 fields/frame     │
                              │  + CLAP semantics    │
                              │  → JSON per song     │
                              └──────────┬───────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
     ┌────────▼────────┐     ┌──────────▼──────────┐    ┌─────────▼─────────┐
     │   Show Config   │     │  Song Identities    │    │  Show Seed        │
     │  (setlist.json) │     │  (86 curated)       │    │  hash(date+venue) │
     └────────┬────────┘     └──────────┬──────────┘    └─────────┬─────────┘
              │                          │                          │
              └──────────────────────────┼──────────────────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │     Root.tsx          │
                              │  - Load all data     │
                              │  - Precompute arc    │
                              │  - Create per-song   │
                              │    compositions      │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  SongVisualizer.tsx   │
                              │  (per song, per frame)│
                              └──────────┬───────────┘
                                         │
         ┌───────────────┬───────────────┼───────────────┬───────────────┐
         │               │               │               │               │
   ┌─────▼─────┐  ┌─────▼──────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
   │ AudioSnap │  │ SceneRouter│  │ Overlay   │  │ Energy    │  │ Era Grade │
   │ (smoothed │  │ (shader    │  │ Stack     │  │ Envelope  │  │ (film     │
   │  features)│  │  selection)│  │ (scoring) │  │ (B/S/H)   │  │  stock)   │
   └─────┬─────┘  └─────┬──────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         │               │               │               │               │
         └───────────────┴───────────────┼───────────────┴───────────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  FullscreenQuad      │
                              │  (WebGL / Three.js)  │
                              │  57 GLSL uniforms    │
                              │  → rendered frame    │
                              └──────────┬───────────┘
                                         │
                              ┌──────────▼───────────┐
                              │  Remotion Encoder    │
                              │  → H.264 MP4        │
                              └──────────────────────┘
```

### How a Single Frame Gets Rendered

```
Frame N arrives (Remotion timeline)
    │
    ├─ 1. Read raw analysis: frames[N] → 39 audio fields
    │
    ├─ 2. Compute AudioSnapshot (Gaussian smoothing, transient envelopes)
    │      → 30+ smoothed/derived values
    │
    ├─ 3. Run analysis modules:
    │      coherence → climax → jam evolution → groove → triggers
    │      → peaks → crowd → stem character → phrases → fatigue
    │
    ├─ 4. Scene routing: pick shader for this section
    │      → energy affinity + identity + recency + spectral match
    │
    ├─ 5. Bind 57 GLSL uniforms from audio state
    │
    ├─ 6. Execute shader (FullscreenQuad/MultiPassQuad)
    │      → pattern generation + audio modulation + 33 post-process stages
    │
    ├─ 7. Score and render 5-20 overlays
    │      → audio affinity + tags + context + density modulation
    │
    ├─ 8. Apply EnergyEnvelope (CSS brightness/saturation/hue)
    │
    ├─ 9. Apply EraGrade (CSS film stock filters)
    │
    ├─ 10. Render text layers (outside CameraMotion for clarity)
    │
    └─ 11. Composite final frame → Remotion captures
```

---

*Generated from full codebase audit of `/Users/chrisgardella/dead-air/` — March 2026*
