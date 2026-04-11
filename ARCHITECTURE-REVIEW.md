# Dead Air Visual Engine - Architecture Review

**Prepared for technical review, April 2026**
**Engine version: Post-Phase 10, Post-Elite Roadmap**

---

## Executive Summary

Dead Air is a concert documentary visual engine that generates synchronized, audio-reactive video for full Grateful Dead shows. It produces 3+ hour 4K renders where every frame responds to the music through a multi-layered pipeline: Python audio analysis (librosa + Demucs + CLAP) feeds 39+ per-frame features at 30fps into a TypeScript/WebGL rendering engine built on Remotion + Three.js. The engine manages 69 GLSL shader scenes, 184 curated overlays across 10 layers, and a deep narrative system that tracks show arc, tour position, jam evolution, and semantic audio classification.

A companion real-time VJ Mode (React Three Fiber + Web Audio API) shares the shader library for live performance.

**By the numbers:**
- 69 production shader scenes (35+ raymarched 3D, 30+ procedural 2D, 10+ feedback/fluid)
- 184 overlays (63 active A/B tier, 10 layers, beat-synced accents)
- 57+ shared GLSL uniforms fed to every shader
- 160+ computed audio descriptors per frame
- 39 raw audio features extracted per frame at 30fps
- 86 hand-curated song identities with narrative arcs
- 65 VJ Mode scenes (real-time 60fps)
- 900+ tests across the monorepo
- 9-package pnpm monorepo with Turbo orchestration

**First shipped render:** Cornell 5/8/77 (27GB, 3h03m, 4K, 20 songs)

---

## System Architecture

```
                        ┌─────────────────────────────────┐
                        │        PYTHON PIPELINE          │
                        │  (Docker, GPU-accelerated)      │
                        ├─────────────────────────────────┤
                        │  analyze.py (787 lines)         │
                        │  ├─ librosa: RMS, chroma,       │
                        │  │  contrast, centroid, onset,  │
                        │  │  tempo, flatness (30fps)     │
                        │  ├─ piptrack: melodic pitch,    │
                        │  │  direction, confidence       │
                        │  ├─ chord detection: 24         │
                        │  │  templates (maj/min × 12)    │
                        │  ├─ section detection: MFCC     │
                        │  │  self-similarity clustering  │
                        │  └─ deep: spaceScore, timbral,  │
                        │     improv, dynamic range       │
                        │                                 │
                        │  analyze_stems.py (Demucs)      │
                        │  └─ 4 stems: vocals, drums,     │
                        │     bass, other → per-stem RMS  │
                        │                                 │
                        │  semantic_analysis.py (CLAP)    │
                        │  └─ 8 categories scored per     │
                        │     2s window (psychedelic,     │
                        │     aggressive, tender, cosmic, │
                        │     rhythmic, ambient, chaotic, │
                        │     triumphant)                 │
                        └──────────┬──────────────────────┘
                                   │ JSON (1-3 MB/song)
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      TYPESCRIPT RENDERING ENGINE                        │
│                      (Remotion 4.0.242 + Three.js)                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Root.tsx (378 lines)                                                  │
│  └─ Show-level: load setlist, precompute narrative, register           │
│     per-song Remotion compositions, resolve frame counts               │
│                                                                        │
│  SongVisualizer.tsx (1,027 lines) ─── MASTER ORCHESTRATOR              │
│  ├─ Load analysis JSON + song identity                                 │
│  ├─ Compute: show arc, set theme, tour position, jam evolution         │
│  ├─ Build overlay rotation schedule (pre-baked windows)                │
│  ├─ Delegates to 5 visual layers:                                      │
│  │   1. SceneRouter → base shader (FullscreenQuad/MultiPassQuad)       │
│  │   2. DynamicOverlayStack → 5-20 overlays per section                │
│  │   3. SongArtLayer → poster with Ken Burns parallax                  │
│  │   4. CrowdOverlay → applause energy glow                           │
│  │   5. AudioLayer → song audio + crowd ambience                       │
│  └─ Per-frame: getOverlayOpacities() → render all layers              │
│                                                                        │
│  AudioReactiveCanvas.tsx (624 lines) ─── AUDIO→UNIFORM BRIDGE          │
│  ├─ Gaussian smoothing (12-90 frame windows)                           │
│  ├─ Transient envelopes (fast attack, exponential release)             │
│  ├─ Dynamic time accumulator (0.25x-2.6x energy+tempo modulated)      │
│  ├─ Climax state machine (5 phases)                                    │
│  ├─ 160+ computed fields exposed via AudioDataContext                   │
│  └─ Chroma afterglow, beat stability, energy forecast                  │
│                                                                        │
│  SceneRouter.tsx (1,273 lines) ─── SHADER SELECTION & CROSSFADE        │
│  ├─ Section-based mode pool selection                                   │
│  ├─ Energy gating (low→ambient, mid→balanced, high→intense)            │
│  ├─ Narrative variety enforcement (recency + frequency penalties)       │
│  ├─ Dynamic crossfade duration (5s-24s, spectral flux compressed)      │
│  ├─ Special handling: sacred segues, drums/space, suite continuity     │
│  ├─ Jam evolution integration (phase-specific shader pools)            │
│  ├─ Reactive trigger response (15-frame fast crossfade)                │
│  └─ DualShaderQuad composition (5 blend modes for transitions)         │
│                                                                        │
│  GPU RENDERING PRIMITIVES                                              │
│  ├─ FullscreenQuad.tsx (511 lines)                                     │
│  │   └─ Main shader → FXAA → output. 60+ uniforms per frame.          │
│  ├─ MultiPassQuad.tsx (663 lines)                                      │
│  │   └─ Ping-pong buffers, feedback mode (uPrevFrame), gap detect     │
│  └─ DualShaderQuad.tsx (417 lines)                                     │
│      └─ Two shaders composited with blend shader (5 modes)            │
│                                                                        │
│  OVERLAY ENGINE                                                        │
│  ├─ overlay-rotation.ts (732 lines) ─ schedule + per-frame opacity     │
│  ├─ overlay-scoring.ts (354 lines) ─ 12-component scoring formula      │
│  ├─ overlay-selection.ts (168 lines) ─ hero guarantee, layer spread    │
│  └─ overlay-registry.ts (473 lines) ─ 184 overlays, tier/layer/tags   │
│                                                                        │
│  NARRATIVE INTELLIGENCE                                                │
│  ├─ song-identities.ts (522+ lines) ─ 86 curated song personalities   │
│  ├─ set-theme.ts (160 lines) ─ Set 1 warm/punchy, Set 2 cool/deep     │
│  ├─ tour-position.ts (142 lines) ─ night-in-run + days-off arc        │
│  ├─ visual-narrator.ts (175 lines) ─ per-frame directive synthesis     │
│  ├─ jam-evolution.ts (~200 lines) ─ 4-phase arc for long jams          │
│  ├─ groove-detector.ts (113 lines) ─ pocket/driving/floating/freeform  │
│  ├─ section-vocabulary.ts (181 lines) ─ per-section visual modifiers   │
│  ├─ semantic-router.ts (236 lines) ─ CLAP → shader/overlay biases     │
│  └─ reactive-triggers.ts (400+ lines) ─ 5 mid-section event types     │
│                                                                        │
│  SHADER INFRASTRUCTURE                                                 │
│  ├─ uniforms.glsl.ts (163 lines) ─ 57+ shared GLSL uniforms           │
│  ├─ postprocess.glsl.ts (260 lines) ─ 8-stage post-process chain      │
│  ├─ noise.ts (357 lines) ─ snoise, fbm, curl, ridged, hsv, SDF icons  │
│  ├─ camera-3d.ts (111 lines) ─ pure audio→camera mapping              │
│  └─ scene-registry.ts (1,153 lines) ─ 115 modes with metadata         │
│                                                                        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         VJ MODE (Real-Time)                            │
│                    (React Three Fiber + Web Audio)                      │
├──────────────────────────────────────────────────────────────────────────┤
│  65 scenes sharing shader library from visualizer-poc                  │
│  Real-time FFT (23-46ms latency) → EMA smoothing → shader uniforms     │
│  Zustand state: scene, palette, FX, 9 presets (localStorage)           │
│  MIDI controller support, WebSocket remote control (port 9876)         │
│  Auto-transition engine: energy state machine + scene scoring          │
│  Dynamic resolution scaling (0.25-1.0x) for 60fps target              │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Per-Frame Data Pipeline (Single Frame)

```
Frame N arrives
    │
    ▼
┌─ AudioReactiveCanvas ─────────────────────────────────┐
│  Raw: frames[N] → 39 fields (rms, chroma[12],         │
│       contrast[7], stems, chords, semantic[8]...)      │
│                                                        │
│  Smoothing:                                            │
│  ├─ Gaussian windows: energy(15f), bass(12f),          │
│  │   slowEnergy(90f), fastEnergy(6f)                   │
│  ├─ Transient envelopes: onsetSnap(18f release),       │
│  │   beatSnap(15f), drumOnset(8f)                      │
│  └─ Circular: chromaHue, afterglowHue                  │
│                                                        │
│  Derived:                                              │
│  ├─ dynamicTime (tempo×energy×climax×flux×space)       │
│  ├─ climaxPhase (idle→build→climax→sustain→release)    │
│  ├─ energyForecast (60-frame lookahead)                │
│  ├─ musicalTime (beat-grid-locked)                     │
│  └─ 8 semantic scores, coherence, jamPhase             │
│                                                        │
│  OUTPUT: 160+ fields → AudioDataContext                │
└────────────────────────────────────────────────────────┘
    │
    ├──────────────────────────┐
    ▼                          ▼
┌─ SceneRouter ──────────┐  ┌─ Overlay Engine ────────────┐
│ Section lookup          │  │ Window lookup               │
│ Energy gating           │  │ Per-overlay:                │
│ Variety enforcement     │  │ ├─ Crossfade (45-150f)      │
│ Crossfade scheduling    │  │ ├─ Energy response curve    │
│ Semantic bias           │  │ ├─ Silence breathing        │
│ Reactive triggers       │  │ ├─ Beat accent flashes      │
│                         │  │ └─ Reactive injection       │
│ OUTPUT: shader mode     │  │ OUTPUT: Record<name,0-1>    │
│ + crossfade progress    │  └─────────────────────────────┘
└─────────────────────────┘
    │                          │
    ▼                          ▼
┌─ GPU Rendering ────────────────────────────────────────┐
│  1. Bind 60+ uniforms from AudioDataContext            │
│  2. compute3DCamera() → position, target, fov, dof     │
│  3. Update FFT texture (7-band → 64-bin DataTexture)   │
│  4. Main fragment shader → render target               │
│  5. [MultiPass: N post-passes, feedback buffer copy]   │
│  6. [DualShader: render B, composite with blend mode]  │
│  7. FXAA anti-aliasing → final output                  │
│  8. Overlay stack composited on top (CSS)              │
│  9. Crowd glow, song art, lyrics layered               │
│  → Remotion captures frame                             │
└────────────────────────────────────────────────────────┘
```

---

## What's Working Well

### 1. Audio Intelligence Depth
The three-level audio pipeline is genuinely sophisticated. Level 1 (librosa core: RMS, chroma, contrast, stems) provides solid reactivity. Level 2 (rhythm/harmony: melodic pitch, chord detection, beat stability, improvisation score) enables musical awareness beyond simple energy. Level 3 (CLAP semantic classification) adds perceptual understanding ("this sounds psychedelic" vs "this sounds tender"). The graceful degradation design (all semantic/stem features optional with `?? 0` defaults) means the engine works with basic analysis and gets richer with each layer.

### 2. Narrative Architecture
The composition chain (show arc → set theme → tour position → section vocabulary → groove detection → jam evolution → visual narrator) produces a unified `NarrativeDirective` per frame that modulates every subsystem. This is rare in music visualizers — most react frame-by-frame without memory. Dead Air knows where it is in the show, the set, the tour, the jam cycle, and adjusts accordingly. The pre-computed narrative state prevents cross-song repetition (recency + frequency penalties on shader selection).

### 3. Shader Uniform Architecture
The shared uniform system (57+ GLSL uniforms injected into every shader via `${sharedUniformsGLSL}`) is well-designed. Adding a new audio feature propagates to all 69 shaders automatically. GLSL dead-code elimination handles unused uniforms at zero GPU cost. The 8-stage post-process chain (`buildPostProcessGLSL()`) gives every shader film-grade finishing (ACES tone mapping, bloom, chromatic aberration, film grain, halation) via a simple config object.

### 4. Overlay Scoring System
The 12-component scoring formula (tier bonus → energy Gaussian → texture×category routing → stem section → song identity → show arc → carryover/penalty → semantic bias → deterministic jitter) is well-calibrated. Pre-peak dropout (strip to 0 overlays before climax) creates genuine visual impact. Energy-scaled crossfade timing (5s quiet → 1.5s peak) and silence breathing (progressive withdrawal during quiet) show good taste.

### 5. Dual Rendering Modes
Sharing the shader library between offline Remotion rendering and real-time VJ Mode is architecturally sound. VJ Mode's separate audio pipeline (Web Audio FFT → EMA smoothing vs. librosa → Gaussian smoothing) is appropriate for the different latency requirements. The Zustand store with 9-slot presets, MIDI support, and WebSocket remote control makes VJ Mode genuinely performable.

### 6. Deterministic Pipeline
Everything is seeded (show date + venue hash). Same audio → same analysis → same shader selection → same overlay rotation → same visual output. This is critical for iterating on render quality — you can change one parameter and compare renders frame-by-frame.

---

## What Needs Improvement

### 1. SceneRouter Complexity (P0 - Maintainability Risk)
**File:** `SceneRouter.tsx` — 1,273 lines of interdependent conditionals

The routing logic accumulates every special case (sacred segues, drums/space, suite continuity, jam phases, reactive triggers, semantic bias, dual-shader composition) in one file. Small changes cascade unpredictably. There's limited test coverage for interaction effects (e.g., sacred segue during a jam phase with an active reactive trigger).

**Recommendation:** Extract routing into a pipeline of composable routing strategies. Each strategy (energy routing, narrative variety, jam routing, reactive override) is a pure function `(context, candidates) → weighted candidates`. Chain them. Test each independently. The SceneRouter becomes a thin orchestrator calling the chain.

### 2. SongVisualizer God Object (P0 - Maintainability Risk)
**File:** `SongVisualizer.tsx` — 1,027 lines

This file loads analysis, resolves song identity, computes show arc, builds overlay schedules, manages 5 visual layers, handles segues, and coordinates narrative state. It's the single point of failure and the hardest file to modify safely.

**Recommendation:** Extract into focused hooks: `useSongAnalysis()`, `useShowArc()`, `useOverlaySchedule()`, `useSegueState()`. SongVisualizer becomes a composition of hooks, each independently testable.

### 3. Raymarching Code Duplication (P1 - Performance + Maintenance)
35+ raymarched shaders each implement their own normal calculation, ambient occlusion, shadow functions — all following the same 3-epsilon-sample pattern but with inconsistent epsilon values (0.001 vs 0.002 vs 0.003). This is ~105 duplicated function implementations.

**Recommendation:** Extract `calcNormal(pos, mapFunc, epsilon)`, `calcAO()`, `calcSoftShadow()` into noise.ts. Each shader provides only its scene-specific `map()` function. Standardize epsilon to resolution-aware value.

### 4. Post-Process Shader Compilation (P1 - GPU Memory)
123 shaders each generate a unique post-process shader via `buildPostProcessGLSL()` with different config flags (grain: "light" vs "normal", bloom on/off, etc.). This creates 123 separate GPU shader programs when most could share a single program with runtime `uniform bool` flags.

**Recommendation:** Compile one universal post-process shader with 19 runtime boolean uniforms. GLSL `if (uBloomEnabled)` branching is cheaper than maintaining 123 shader variants in GPU memory.

### 5. Per-Frame Computation Overhead (P1 - Performance)
AudioReactiveCanvas computes 160+ fields every frame regardless of which shader is active. Multiple Gaussian windows (15-90 frame scans) sum to 200+ array lookups per frame. Chroma afterglow scans backward 60 frames every frame. Energy calibration is repeated per-song when it could be cached at show level.

**Recommendation:** 
- Lazy evaluation: compute only fields the active shader samples (uniform whitelist per scene)
- Ring buffer for smoothing instead of per-frame array scans
- Cache per-song energy percentiles during analysis phase
- Memoize overlay scores per section boundary instead of per frame

### 6. Memory Pressure at Scale (P1 - Scalability)
Full analysis JSON passed as props to each Remotion composition. For 50+ song shows: 50 × 20MB = 1GB+ in analysis data alone. Render targets (HalfFloat, 16-bit): FullscreenQuad=2 targets, MultiPassQuad=4, DualShaderQuad=3 — each ~16MB at 1080p. Manual `dispose()` calls for GPU cleanup rely on proper React lifecycle; shader crashes can leak VRAM.

**Recommendation:**
- Stream analysis frames on demand instead of loading entire JSON
- Implement GPU memory monitoring (track allocated render targets)
- Add error boundaries with explicit GPU cleanup on crash
- Consider shared render target pool across scenes

### 7. Transition System is CSS, Not GPU (P2 - Visual Quality)
Scene transitions use CSS opacity crossfade (two DOM elements fading). Both shaders render simultaneously, but there's no shader-to-shader morph — no shared UV space, no GPU blend modes during transition. The `DualShaderQuad` exists for composition but isn't used for transitions.

**Recommendation:** Route transitions through DualShaderQuad with GPU blend modes (luminance_key, noise_dissolve already implemented). This enables morph-style transitions where shader A's geometry dissolves into shader B's, rather than a simple opacity fade.

### 8. Hardcoded Magic Numbers (P2 - Tuning)
Scattered throughout shaders: `float R = 1.0 + bass*0.15`, `baseSymmetry = mix(8.0, 3.0, tension)`, `symmetry = 6.0 + tension * 6.0`. Camera: orbital radius 3.5, shake frequencies 3.7/2.3/4.1 Hz. Crossfade: quiet=720f, loud=150f. All hardcoded with no central config.

**Recommendation:** Extract per-shader tuning into a config object at the top of each shader file. Extract camera parameters to `CameraProfile` configs. This enables A/B testing different parameter sets without recompiling shaders.

### 9. VJ Mode / Offline Feature Divergence (P2 - Platform Parity)
VJ Mode uses real-time FFT with 14 raw features (RMS, bands, centroid, onset, chroma, contrast). Offline uses librosa with 39+ features (adding stems, melodic pitch, chords, sections, semantic, improvisation). This means VJ Mode can't use the narrative intelligence (jam evolution, groove detection, semantic routing) that makes offline renders rich.

**Recommendation:** Bridge the gap by implementing lightweight approximations of key offline features in the VJ audio pipeline: beat stability from onset variance, basic chord detection from chroma peaks, section estimation from energy contour. Even 60% accuracy would unlock narrative features in VJ mode.

### 10. Section Detection Quality (P2 - Audio Intelligence)
Section detection uses MFCC self-similarity clustering — local to each song, no cross-song context. "Space" sections are detected post-hoc via spaceScore override rather than explicit training. The sectionType string mapping has no priority/precedence logic, causing oscillation at boundaries.

**Recommendation:** Consider training a lightweight classifier (or using a pre-trained model) on labeled Grateful Dead sections. The Dead's structure is well-documented (verse/chorus/jam/space/drums are clearly delineated). Even a simple decision tree on (energy, flatness, beatConfidence, vocalPresence) would outperform unsupervised MFCC clustering.

---

## What's Holding It Back from Greatest Ever

### 1. No Temporal Coherence in Shader Space
The biggest gap. Each frame is rendered independently — there's no motion vector field, no optical flow, no temporal anti-aliasing between frames. Raymarched scenes have no sub-frame interpolation. When energy changes rapidly, the visual response can feel "steppy" rather than fluid. The `uPrevFrame` feedback in MultiPassQuad helps for fluid shaders, but the 35+ raymarched shaders have zero inter-frame coherence.

**What "greatest ever" looks like:** Temporal reprojection (cache previous frame's depth buffer, warp it to current camera, blend). This eliminates shimmer on thin geometry, enables motion blur, and makes the 30fps output look like 60fps. Implementing a simple depth-based reprojection pass after the main shader would be transformative.

### 2. No True Motion Blur
Camera moves (orbital, shake, jolt) happen frame-to-frame with no blur. Fast bass shakes look like teleportation, not motion. Raymarched scenes render crisp geometry that should have velocity-dependent blur during intense passages.

**What "greatest ever" looks like:** Accumulation buffer (render N sub-frames per output frame with slight camera jitter, average). Even N=2 sub-frames would dramatically improve perceived smoothness. Alternatively, post-process velocity blur from camera delta.

### 3. Camera System is 2.5D
`compute3DCamera()` generates orbital motion around origin with shake/jolt modifiers, but it's fundamentally a single orbit plane. No dolly-in through geometry, no crane shots following energy, no rack focus between foreground/background elements. DOF is a uniform but most shaders don't implement depth-aware blur.

**What "greatest ever" looks like:** Authored camera paths per shader (or per section type): dolly through the fractal temple during a build, crane up during climax, intimate close-up during tender vocals. DOF as a post-process using the raymarching depth buffer (already computed but not exported).

### 4. No Lighting Continuity Across Shaders
Each shader has its own lighting model (diffuse+specular+fresnel+AO). There's no shared lighting environment. When crossfading between shaders, the light direction, color temperature, and shadow behavior can change discontinuously.

**What "greatest ever" looks like:** A shared lighting context (key light direction, color temp, ambient level) that all shaders sample. The visual narrator modulates this context per section type — warm golden key light for tender passages, cold blue backlight for space sections, strobing multi-source for peaks. Crossfades maintain lighting continuity even as geometry changes.

### 5. No Depth Compositing Between Layers
Overlays are composited via CSS (DOM stacking), not GPU depth. A "Lightning Bolt" overlay always renders on top of the shader, never integrated into the scene. No atmospheric depth (fog, haze) between overlay and shader layers.

**What "greatest ever" looks like:** Render overlays as textured quads in the 3D scene at various depths. Apply shared atmospheric fog. Lightning bolt appears to strike through the shader's geometry. Sacred geometry orbits within the fractal temple. This requires moving overlay rendering from CSS to WebGL.

### 6. Limited Geometric Vocabulary
69 shaders is impressive, but the geometric vocabulary is still bounded: raymarched SDFs (tunnels, temples, kaleidoscopes), 2D domain warping (liquid, plasma, voronoi), and feedback systems (fluid, reaction-diffusion). Missing: particle systems with millions of points (GPU compute), volumetric light scattering with proper ray-atmosphere interaction, tessellated mesh deformation, instanced geometry responding to audio.

**What "greatest ever" looks like:** GPU compute shaders (WebGPU when available) for million-particle systems. Signed distance field morphing between different geometries (temple → mandala → kaleidoscope as a continuous morph). Proper volumetric rendering with scattering and absorption, not just density-based raymarching.

### 7. 30fps Ceiling
The shipped Cornell render was 30fps, and viewer feedback noted it felt "not smooth." The engine supports 60fps via `RENDER_FPS` env var, but doubling the frame count doubles render time for an already multi-hour process. With heavy raymarching shaders (80 steps × 4 normal evaluations × 16 snoise calls per normal), GPU time per frame is already tight.

**What "greatest ever" looks like:** Adaptive frame complexity. Heavy shaders at 30fps with temporal reprojection to synthesize intermediate frames. Light shaders at native 60fps. Per-shader profiling to budget GPU time and reduce raymarch steps when frame time exceeds target. Consider SHADER_DOWNSCALE=2 for heavy shaders (render at half-res, upscale with temporal super-resolution).

### 8. No Show-Level Visual Memory
The narrative precomputation tracks cross-song shader usage and peak-of-show state, but there's no visual memory — the engine doesn't remember what it showed the audience and adapt. In a 3-hour show, similar energy profiles produce similar visuals. The recency penalty helps but operates on mode names, not visual characteristics.

**What "greatest ever" looks like:** A visual embedding space. Track what colors, geometries, motion speeds, and overlay themes the audience has seen (accumulated feature vector). Route toward underrepresented visual regions. After 90 minutes of warm fractals, actively steer toward cool, geometric, sparse aesthetics — even if the energy profile would normally suggest fractals again.

### 9. Static Shader Parameters
Each shader's audio-reactive parameters (how much bass affects radius, how energy scales rotation speed) are hardcoded. There's no per-show or per-song tuning. A shader that looks great for "Dark Star" might feel wrong for "Sugar Magnolia" because the parameter relationships are fixed.

**What "greatest ever" looks like:** Per-song shader parameter profiles. The song identity already specifies preferred shaders — extend it to specify parameter overrides per shader. `darkStar: { fractal_temple: { orbitalSpeed: 0.5, bassReactivity: 0.3 } }`. This enables the same shader to feel contemplative for ballads and explosive for peaks.

### 10. No Audience/Crowd Intelligence
The engine renders what it thinks the music deserves, but has no model of audience experience. It doesn't know that a 20-minute "Dark Star" jam builds a specific kind of tension that needs a specific kind of visual release. It doesn't know that the transition from "Scarlet Begonias" → "Fire on the Mountain" is one of the most anticipated moments in a Dead show.

**What "greatest ever" looks like:** A Grateful Dead show knowledge graph. Key moments annotated: famous segues, peak jams, audience eruption points. The engine pre-loads visual strategies for these moments — not just reacting to audio, but anticipating what the audience feels because it understands the cultural weight of the moment.

---

## Component Inventory

### Core Rendering (visualizer-poc/src/)

| File | Lines | Role |
|------|-------|------|
| SongVisualizer.tsx | 1,027 | Master per-song orchestrator |
| Root.tsx | 378 | Show-level Remotion composition registry |
| components/FullscreenQuad.tsx | 511 | Single-pass GPU renderer + FXAA |
| components/MultiPassQuad.tsx | 663 | Multi-pass renderer + feedback buffers |
| components/DualShaderQuad.tsx | 417 | Dual-shader compositor (5 blend modes) |
| components/AudioReactiveCanvas.tsx | 624 | Audio → 160+ uniforms bridge |
| scenes/SceneRouter.tsx | 1,273 | Shader selection + crossfade orchestration |
| scenes/SceneCrossfade.tsx | 169 | CSS opacity crossfade (5 styles) |
| scenes/scene-registry.ts | 1,153 | 115 mode entries with metadata |

### Shader Infrastructure (visualizer-poc/src/shaders/)

| File | Lines | Role |
|------|-------|------|
| shared/uniforms.glsl.ts | 163 | 57+ shared GLSL uniform declarations |
| shared/postprocess.glsl.ts | 260 | 8-stage post-process chain builder |
| noise.ts | 357 | Noise, SDF, color, film grain, tone mapping |
| 135+ shader .ts files | 80-520 each | Vertex + fragment shader pairs |

### Audio Pipeline (visualizer-poc/src/utils/)

| File | Lines | Role |
|------|-------|------|
| audio-reactive.ts | 540 | AudioSnapshot computation (50+ fields) |
| reactive-triggers.ts | 400+ | 5 mid-section event types with hysteresis |
| semantic-router.ts | 236 | CLAP → shader/overlay/color biases |
| groove-detector.ts | 113 | pocket/driving/floating/freeform detection |
| jam-evolution.ts | ~200 | 4-phase jam arc (explore→build→peak→resolve) |
| section-vocabulary.ts | 181 | Per-section visual parameter table |
| chroma-palette.ts | 93 | Audio-derived primary/secondary color |
| modal-color.ts | 188 | 7 church modes → hue/saturation shifts |
| camera-3d.ts | 111 | Pure audio → 3D camera state mapping |
| climax-state.ts | 177 | Climax detection + modulation |
| coherence.ts | ~100 | Visual coherence lock |

### Overlay System (visualizer-poc/src/data/)

| File | Lines | Role |
|------|-------|------|
| overlay-rotation.ts | 732 | Schedule building + per-frame opacity |
| overlay-scoring.ts | 354 | 12-component scoring formula |
| overlay-selection.ts | 168 | Top-N selection with constraints |
| overlay-registry.ts | 473 | 184 overlays with tier/layer/tag metadata |
| continuous-overlay.ts | 850+ | Experimental per-frame scoring engine |

### Narrative Intelligence (visualizer-poc/src/)

| File | Lines | Role |
|------|-------|------|
| data/song-identities.ts | 522+ | 86 curated song visual personalities |
| utils/visual-narrator.ts | 175 | Per-frame narrative directive synthesis |
| utils/set-theme.ts | 160 | Set 1/2/Encore visual modifiers |
| utils/tour-position.ts | 142 | Night-in-run + days-off arc |

### Python Analysis (pipeline/ + visualizer-poc/scripts/)

| File | Lines | Role |
|------|-------|------|
| analyze.py | 787 | Enhanced 30fps feature extraction |
| analyze_stems.py | 119 | Demucs stem separation |
| semantic_analysis.py | 200+ | CLAP 8-category scoring |
| batch_analyze.py | 159 | Parallel processing wrapper |

### VJ Mode (vj-mode/src/)

| File | Lines | Role |
|------|-------|------|
| audio/FeatureExtractor.ts | 158 | Real-time FFT → features (zero-alloc) |
| audio/RollingAudioState.ts | 100+ | EMA smoothing + section synthesis |
| engine/VJCanvas.tsx | 123 | R3F Canvas + 60fps useFrame loop |
| engine/VJSceneCrossfade.tsx | 100+ | Scene transition compositor |
| engine/AutoTransitionEngine.ts | 80+ | Multi-factor scene selection |
| state/VJStore.ts | 377 | Zustand: scene, palette, FX, presets |
| scenes/scene-list.ts | 698 | 65 VJ scenes with metadata |

### Monorepo

| Package | Purpose | Key Tech |
|---------|---------|----------|
| core | Shared types, DB | better-sqlite3, Zod |
| cli | Render orchestration | Commander.js, tsx |
| pipeline | Multi-threaded render + FFmpeg | Remotion bundler/renderer/lambda |
| dashboard | Web UI for management | React, Vite |
| remotion | Offline video renderer | Remotion 4.0.242, 70+ composition components |
| visualizer-poc | Shaders + analysis | Three.js, librosa wrappers |
| vj-mode | Live WebGL visualizer | R3F, Zustand, Web Audio |

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Video Orchestration | Remotion | 4.0.242 |
| 3D Graphics | Three.js | 0.183.1 |
| React Three.js | @react-three/fiber | 8.18.0 |
| UI Framework | React | 18.3.1 |
| Schema Validation | Zod | 4.3.6 |
| State (VJ) | Zustand | 5.0.0 |
| Audio Analysis | librosa + Demucs + CLAP | Python 3.12 |
| Stem Separation | Demucs (htdemucs) | via torch |
| Semantic Audio | LAION CLAP | 1.1.4+ |
| Build | Vite + TypeScript | 6.0.0 / 5.7.0 |
| Monorepo | pnpm + Turbo | 9.15.4 |
| Testing | Vitest | 4.0.18 |
| CI/CD | GitHub Actions | Node 20 |
| Containerization | Docker (GPU) | Python 3.12-slim |

---

## Summary for Review

**The engine is impressive.** The audio intelligence stack (librosa → Demucs → CLAP → 160+ derived features) is deep. The narrative architecture (show arc → set theme → tour position → jam evolution → visual narrator) is uniquely ambitious for a music visualizer. The shader library (69 scenes, 57+ shared uniforms, 8-stage post-process) is production-quality. The overlay system (12-component scoring, pre-peak dropout, silence breathing) shows good taste.

**The architecture is sound but reaching complexity limits.** SceneRouter (1,273 lines) and SongVisualizer (1,027 lines) are the pressure points. Both need decomposition into composable pipelines before the next feature wave.

**The path to "greatest ever" is about coherence:** temporal coherence between frames (reprojection, motion blur), lighting coherence across shaders (shared lighting context), depth coherence between layers (GPU compositing), and experiential coherence across the show (visual memory, audience modeling). The engine has all the ingredients — the synthesis layer needs to become as sophisticated as the individual components.
