# Dead Air Engine: Complete Architectural Audit
**Date:** April 20, 2026  
**Scope:** Read-only structural analysis. No recommendations actioned.  
**Purpose:** Map the architecture post-Veneta for strategic planning.

---

## SECTION 1: CODEBASE MAP

### Monorepo Overview

```
dead-air/
├── packages/
│   ├── core/              (~990 LoC)   Foundation: types, config, DB, logger
│   ├── pipeline/          (~12,000 LoC) Orchestration: ingest, analysis, rendering
│   ├── cli/               (~1,625 LoC)  Commander CLI: 12 commands
│   ├── dashboard/         (~8,843 LoC)  Full-stack web UI (React + Express)
│   ├── visualizer-poc/    (~250,000 LoC) Visual engine: 133 scenes, 474 overlays
│   ├── vj-mode/           (~8,315 LoC)  Real-time live VJ system
│   └── renderer/          (~10,718 LoC) Rust/wgpu GPU renderer
├── docker/                Docker configs (analyze + GPU containers)
├── scripts/               Shell orchestration (Vast.ai, EC2, partitioning)
├── data/                  Audio, stems, lyrics, analysis, renders, DB
├── docs/                  Handoff notes, scope docs
└── out/                   Render output
```

### Package Detail

| Package | Purpose | LoC | Last Touched | Health |
|---------|---------|-----|--------------|--------|
| **core** | Shared types, Zod config, SQLite, logger | 990 | Mar 19 | Stable |
| **pipeline** | Ingest, analysis orchestration, render dispatch | 12,000 | Apr 18 | Active |
| **cli** | Commander CLI wrapping pipeline stages | 1,625 | Apr 12 | Active |
| **dashboard** | React+Express web UI for show management | 8,843 | Mar 20 | Maintained |
| **visualizer-poc** | Remotion compositions, shaders, overlays, routing | 250,000 | Apr 20 | Hot |
| **vj-mode** | Real-time WebGL VJ with MIDI + WebSocket | 8,315 | Apr 11 | Active |
| **renderer** | Rust/wgpu GPU renderer, FFmpeg pipe | 10,718 | Apr 19 | Hot |

### Dependency Graph

```
@dead-air/core (foundation)
    ↑
    ├── @dead-air/pipeline (imports core for types, config, DB, logger)
    │       ↑
    │       ├── @dead-air/cli (imports pipeline for orchestration)
    │       └── @dead-air/dashboard (imports pipeline for render/analysis)
    │
    └── @dead-air/dashboard (imports core for DB, config)

@dead-air/visualizer-poc  ← standalone (Remotion entry, no package imports)
@dead-air/vj-mode         ← standalone (Vite app, no package imports)
@dead-air/renderer        ← standalone (Rust binary, reads manifest JSON)
```

### Structural Assessment

**What's working:**
- Clear separation between orchestration (pipeline/cli) and rendering (visualizer-poc/renderer)
- Core package keeps shared types DRY
- Standalone packages (visualizer-poc, vj-mode, renderer) are independently deployable

**What's not working:**
- `visualizer-poc` at 250K lines is a monolith doing three jobs: (1) Remotion compositions for legacy browser rendering, (2) manifest generation logic, (3) overlay component library. These should be separate.
- `vj-mode` duplicates audio analysis from visualizer-poc rather than sharing a common package
- The manifest generator lives *inside* the renderer package (`generate-full-manifest.ts`) despite being TypeScript that imports from visualizer-poc — confusing ownership
- `dashboard` imports `pipeline` directly — tight coupling to internal orchestration details

**Should merge:** Nothing.  
**Should split:** `visualizer-poc` into (a) `@dead-air/visual-engine` (routing, analysis utils, song identities) and (b) `@dead-air/remotion-compositions` (React components, legacy browser rendering).  
**Should delete:** Nothing dead — all packages active.  
**Should extract:** Audio analysis math shared between visualizer-poc and vj-mode → `@dead-air/audio-core`.

---

## SECTION 2: DATA FLOW ARCHITECTURE

### Complete Pipeline: Raw Audio → Final Pixel

```
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 1: AUDIO ANALYSIS (Python)                                     │
│                                                                       │
│ raw.mp3 → librosa (SR=22050, HOP=735) → 28 features/frame @ 30fps  │
│         → Demucs (htdemucs) → 4 stems (vocals, drums, bass, other) │
│         → stem analysis → 7 additional features/frame               │
│         → CLAP (optional) → 8 semantic scores/frame                 │
│                                                                       │
│ OUTPUT: {songname}-analysis.json (1-2MB/song, ~50MB for full show)  │
│ FORMAT: { meta: {...}, frames: [{rms, centroid, onset, ...} × N] }  │
└───────────────────────────────────────────┬─────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 2: MANIFEST GENERATION (TypeScript, Node.js)                   │
│                                                                       │
│ Per song (6 workers parallel):                                        │
│   Load analysis JSON → compute 175+ uniforms/frame                   │
│   SceneRouter decides shader_id per frame                            │
│   OverlayRotation schedules overlay layers                           │
│   ClimaxState + PeakOfShow detect sacred moments                     │
│   SongIdentity applies per-song creative direction                   │
│                                                                       │
│ Merge all songs → single manifest + shader GLSL source               │
│                                                                       │
│ OUTPUT: manifest.json (1.4-1.6 GB for 3hr show @ 60fps)             │
│ FORMAT: { shaders: {id: glsl}, frames: [{shader_id, 108 uniforms}]} │
└───────────────────────────────────────────┬─────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 3: GPU RENDERING (Rust/wgpu)                                   │
│                                                                       │
│ Load manifest into RAM (all frames)                                   │
│ Compile all GLSL → WGSL → wgpu pipelines (once at startup)          │
│ Per frame:                                                            │
│   Pack 656-byte uniform buffer (std140)                              │
│   GPU: scene shader → HDR texture                                    │
│   GPU: bloom extract → half-res blur → combine                       │
│   GPU: tonemap (Reinhard) + FXAA                                     │
│   GPU: optional effects (14 modes) + composited effects (10 modes)   │
│   GPU→CPU: async readback to double-buffered CPU buffer              │
│   CPU: composite PNG/SVG overlays (alpha blend)                      │
│   CPU→FFmpeg: write RGBA8 frame to 256MB pipe buffer                 │
│                                                                       │
│ OUTPUT: raw H.264 video stream (no audio)                            │
└───────────────────────────────────────────┬─────────────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STAGE 4: MUXING & DELIVERY                                           │
│                                                                       │
│ ffmpeg -i video.mp4 -i audio.m4a -c:v copy -c:a aac output.mp4      │
│ Loudness normalization (EBU R128)                                     │
│ Chapter markers from song_boundaries                                  │
│                                                                       │
│ OUTPUT: YouTube-ready MP4 (4K, H.264/H.265, AAC audio)               │
└─────────────────────────────────────────────────────────────────────┘
```

### Serialization Points & Assessment

| Handoff | Format | Size | Assessment |
|---------|--------|------|------------|
| Python → JSON analysis | JSON (per-frame arrays) | 1-2 MB/song | **Fine.** Compact, read once. |
| Analysis → Manifest generator | Read from disk | 50 MB total | **Fine.** Per-song parallelized. |
| Manifest → Rust renderer | JSON (single file) | 1.4-1.6 GB | **PROBLEM.** See below. |
| Rust → FFmpeg | Raw RGBA8 pipe | 33 MB/frame | **Fine.** Pipelined, non-blocking. |
| FFmpeg → Final MP4 | H.264 stream | 27 GB (3hr 4K) | **Fine.** Standard encoding. |

### The 1.4GB Manifest Problem

**Why it's 1.4 GB:** 598,238 frames × 108 JSON fields × ~2.2 KB per frame = 1.31 GB + 0.3 GB JSON overhead (repeated field names, text float encoding).

**Breakdown:**
- Frame uniform data: 1.31 GB (95%)
- GLSL shader source (21 shaders): 1.5 MB (0.1%)
- JSON formatting overhead: 0.3 GB (field name repetition, text floats)

**Is it justified?** Partially. The 108 uniforms per frame are all unique (audio-derived, time-varying). But:
- JSON text floats use 15-25 bytes vs 4 bytes binary = **4-6x waste**
- Field names repeated 598K times = **~320 MB pure waste**
- Shader IDs rarely change (avg run length 333 frames) = run-length encodable

**Quick wins:**
- MessagePack format (already supported by Rust loader): 1.6 GB → ~0.85 GB
- Theoretical minimum (raw binary floats): ~330 MB

**Is anything computed multiple times?** No. Each stage computes unique data. Python does audio features, TypeScript does creative routing, Rust does GPU rendering. No redundant computation across stages.

---

## SECTION 3: THE RUST RENDERER

### Module Structure

```
src/
├── main.rs             (905 lines)  CLI + main render loop + pipelining
├── gpu.rs              (600 lines)  wgpu device, textures, bind groups
├── uniforms.rs         (463 lines)  656-byte std140 buffer packing
├── shader_cache.rs     (200 lines)  GLSL→naga→WGSL compilation + caching
├── glsl_compat.rs      (757 lines)  WebGL ES 1.00 → GLSL 450 conversion
├── postprocess.rs      (400 lines)  5-pass bloom + FXAA + tonemap
├── effects.rs          (600 lines)  14 visual effect modes
├── composited_effects.rs (600 lines) 10 GPU overlay effects
├── transition.rs       (200 lines)  GPU crossfade (4 blend modes)
├── temporal.rs         (150 lines)  Temporal noise reduction
├── motion_blur.rs      (252 lines)  Sub-frame accumulation (2-8 samples)
├── compositor.rs       (258 lines)  CPU alpha blending (6 blend modes)
├── text_layers.rs      (200 lines)  SVG text generation
├── overlay_cache.rs    (200 lines)  PNG image caching
├── manifest.rs         (200 lines)  JSON/MessagePack parsing
├── ffmpeg.rs           (148 lines)  256MB buffered pipe to FFmpeg
├── intro.rs            (200 lines)  15-second cinematic intro
├── endcard.rs          (200 lines)  10-second end card
├── chapter_card.rs     (200 lines)  Per-song chapter cards
└── compute.rs          (disabled)   Particle system (commented out)
```

**Assessment:** Well-organized by concern. Each module has a single responsibility. The only questionable placement is `main.rs` doing both CLI parsing AND the render loop — should be split.

### Uniform Buffer: 656 Bytes std140

The buffer packs 100+ audio-derived values into GPU-readable layout:

- Temporal (12B): uTime, uDynamicTime, uBeatTime
- Core audio (32B): bass, rms, centroid, mids, highs, onset, sub, high
- Smoothed energy (28B): slow/fast energy, spectral flux, accel, trend
- Beat/rhythm (12B): onset snap, beat snap, beat confidence
- Stems (28B): drum onset, bass, vocal, other, vocal presence
- Chroma/spectral (100B): 12-band chroma, contrast, hue, shift
- Structure (28B): section progress, climax, coherence, jam phase
- Palette/era/show (60B): colors, saturation, warmth, grain, bloom
- Camera (36B): position, target, FOV, tilt, DOF
- Lighting (148B): EMA-smoothed section-aware envelope (8 presets)
- Effects (16B): temporal coherence, grain character

**Is it maintainable?** Moderately. Offsets are manually computed with comments. Adding a new uniform requires: (1) add to Rust struct, (2) update byte offset comments, (3) add to TypeScript manifest generator, (4) add to GLSL shared uniforms. Four-file coordination is error-prone but documented.

**Is it fragile?** Yes. One misaligned field silently corrupts all subsequent uniforms. No runtime validation that TypeScript and Rust agree on layout. A schema-driven code generator would eliminate this risk.

### Shader Compilation Pipeline

```
GLSL ES 1.00 (from Three.js/Remotion scenes)
    ↓ webgl_to_desktop() — regex-heavy conversion
    ↓   - #version 450, precision removal, varying→in
    ↓   - inject 160 "global captures" for generated functions
    ↓   - stub texture sampling functions
    ↓
GLSL 450 (desktop)
    ↓ naga::front::glsl → IR
    ↓ naga::Validator → check semantics
    ↓ naga::back::wgsl → WGSL source
    ↓
WGSL (WebGPU)
    ↓ inject real texture/sampler bindings (post-hoc string replacement)
    ↓ wgpu::create_shader_module()
    ↓
Native GPU pipeline
```

**Fragility:** The `glsl_compat.rs` layer is **the most fragile code in the entire project.** It uses regex patterns to detect loop bounds, variable captures, and texture usage. It maintains a hardcoded list of 160 variable names. New shaders that use unlisted variable names cause silent black frames. This is the #1 maintenance burden for shader development.

### Post-Processing: Extensible 5-Pass Chain

1. Bloom extract (energy-reactive threshold)
2. Gaussian blur H (21-tap, half-res)
3. Gaussian blur V (21-tap, half-res)
4. Bloom combine (additive)
5. Tonemap (soft Reinhard) + FXAA (optional)

**Assessment:** Well-structured. Each pass is a separate render pass with its own shader. Adding a new pass (e.g., chromatic aberration, vignette) would require: add shader, add texture, insert into pass chain. Moderate effort, low risk.

### Overlay Compositing: CPU-Side (Correct Decision)

SVG overlays are rasterized via `resvg` (tiny_skia backend) then alpha-blended on CPU. PNG overlays are cached and composited per-frame.

**Why CPU not GPU?** Text layout and font rasterization are CPU-only operations. Since the pixel buffer is already on CPU (post-readback) for FFmpeg writing, compositing there avoids a GPU upload + render + re-readback cycle. This is the correct architectural choice.

### Error Handling: Graceful Degradation

- Shader compilation failure → log warning, render black frame (no crash)
- Overlay missing → skip silently, render without
- FFmpeg write failure → panic (fatal, correct)
- Manifest parse failure → panic (fatal, correct)
- Very few `unwrap()` in hot paths — mostly in init code

### Testing: Integration-Focused

7 test modules (1,292 lines): end-to-end frame rendering, shader compilation validation, overlay compositing, benchmark profiling. No unit tests for individual functions — covered implicitly by integration tests.

### Top 5 Architectural Improvements

1. **Replace glsl_compat.rs regex hacks** with proper GLSL parser (tree-sitter-glsl or naga extensions). Eliminates the 160-variable capture list and silent failure mode.

2. **Schema-driven uniform buffer** — generate both Rust struct and TypeScript emitter from a single TOML/JSON definition. Eliminates layout drift risk.

3. **Streaming manifest consumption** — instead of loading 1.4 GB into RAM, stream frames from MessagePack. Reduces startup time and memory by 90%.

4. **GPU overlay compositing** — upload PNG atlas to GPU, composite as final render pass. Eliminates CPU compositing bottleneck for overlay-heavy frames.

5. **Split main.rs** — extract render loop into `render_loop.rs`, keep CLI/init in main. Current 905 lines mixes concerns.

---

## SECTION 4: THE MANIFEST GENERATOR

### Architecture

The manifest generator lives in `/packages/renderer/` as TypeScript files:
- `generate-manifest-parallel.ts` — Production entry point (6-worker parallelism)
- `generate-full-manifest.ts` — Per-song logic (1,000+ lines, imports 15 analysis utilities)
- `generate-manifest.ts` — Legacy simplified version

It imports pure functions from `visualizer-poc/src/`:
- Scene routing (shader selection)
- Overlay rotation (scheduling)
- Climax state machine
- Coherence detection
- Song identities
- Band/era/show configuration

### Shader Selection: Priority Cascade

```
1. Drums/Space override (hardcoded mappings for structural sections)
2. Reactive trigger injection (beat-onset sudden pool injection)
3. Section crossfade (15% fade at section boundaries)
4. Dual-shader composition (energy + beat driven blending)
5. Default: current section's assigned mode from SceneRouter
```

Selection uses seeded PRNG for deterministic reproducibility. Visual memory prevents repetition (recency decay, frequency penalty).

### Overlay Routing: Scoring + Rules Hybrid

Overlay rotation uses:
- Energy-inverted density (quiet = rich layers, loud = clean/sparse)
- Pre-peak dropout (silence 2-3s before climax, then flood)
- Accent overlays on beat onsets (Dead iconography flashes)
- Song identity overlay boost/suppress modifiers
- Semantic category bias (CLAP scores influence overlay selection)

### Where Logic Lives

| Concern | File | Lines |
|---------|------|-------|
| Shader routing | `scenes/routing/shader-variety.ts` | 585 |
| Overlay scheduling | `data/overlay-rotation.ts` | 600 |
| Energy/smoothing | `utils/audio-reactive.ts` + `energy.ts` | 200 |
| Climax detection | `utils/climax-state.ts` | 150 |
| Coherence/"IT" | `utils/coherence.ts` | 100 |
| Peak-of-show | `utils/peak-of-show.ts` | 120 |
| Jam cycle detection | `utils/jam-cycles.ts` | ~200 |
| Section vocabulary | `utils/section-vocabulary.ts` | ~200 |
| Song identities | `data/song-identities.ts` | 602 |
| Band config | `data/band-config.ts` | 486 |
| Era presets | `data/era-presets.ts` | 43 |
| Show-specific | `data/veneta-routing.ts` | 792 |

### Separation of Concerns Assessment

**Creative direction** (what to show):
- Song identities, band config, era presets, show-specific routing
- Overlay tier assignments, accent selections
- Sacred moment definitions, peak-of-show thresholds

**Engine mechanics** (how to compute):
- Energy smoothing, coherence scoring, climax state machines
- Seeded RNG, visual memory, recency decay
- Frame-by-frame uniform calculation, interpolation

**Verdict:** Separation is **good but not formalized.** Creative direction is in `data/` files, engine mechanics in `utils/` and `scenes/routing/`. However, show-specific routing (`veneta-routing.ts`) mixes creative choices with engine logic (shader pool mappings + transition timings). The boundary could be sharper.

### Shape It Should Have

The manifest generator should be:
```
1. CONFIG LAYER (JSON, no code):
   - show.json: setlist, date, venue
   - routing.json: per-song shader pools, overlay preferences
   - palette.json: color direction per song/section
   - moments.json: sacred moments, peak-of-show overrides

2. ENGINE LAYER (pure functions, tested):
   - SceneRouter: config + audio → shader_id per frame
   - OverlayScheduler: config + audio → overlay layers per frame
   - UniformComputer: audio features → 175 uniforms per frame
   - CoherenceDetector: audio → lock state
   - ClimaxEngine: audio + structure → climax phases

3. ASSEMBLY LAYER (orchestration):
   - Load config + analysis
   - Run engine per frame
   - Serialize to manifest format
```

Currently layers 1 and 2 are partially mixed — routing logic embeds creative choices that should be configurable.

---

## SECTION 5: THE PYTHON ANALYSIS PIPELINE

### Pipeline Structure

```
scripts/
├── analyze.py              (787 lines)  MAIN: 28+ features/frame @ 30fps
├── analyze_stems.py        (200 lines)  Per-stem RMS, onsets, beats
├── separate_stems.py       (150 lines)  Demucs 4-stem wrapper
├── semantic_analysis.py    (200 lines)  CLAP 8-category scoring
├── batch_analyze.py        (100 lines)  ThreadPool parallel processing
├── align_vocals.py         (150 lines)  WhisperX forced alignment
├── align_lyrics.py         (100 lines)  WhisperX sidecar (stdin/stdout)
└── extract_lyrics.py       (100 lines)  OCR text → per-song lyrics
```

### Orchestration

**TypeScript drives Python as sidecars:**
```
pipeline/src/audio/orchestrator.ts
  → discovers audio files
  → calls analyzeWithEnhancedLibrosa() per song
    → spawns python3 analyze.py via execFileSync()
    → parses JSON stdout
    → caches to data/analysis/{date}/{song}.json
```

**Not a DAG, not a mess — it's a linear pipeline with optional branches:**
```
Audio → Core analysis (always) → Stems (if available) → Semantics (if CLAP enabled)
```

### Adding a New Analysis Type

**Effort: 2-4 hours.** Steps:
1. Write Python function in `analyze.py` (compute feature, normalize to 0-1, pad to n_frames)
2. Add to frame loop (line ~655): `frame["myFeature"] = round(float(arr[i]), 4)`
3. Add TypeScript type to `EnhancedFrameData`
4. Use in `audio-reactive.ts` for smoothing/thresholds
5. Wire to GLSL uniform if GPU needs it (add to uniforms.glsl.ts + uniforms.rs)
6. Update Docker requirements if new dependency

**Assessment:** Adding analysis is straightforward. The Python layer is well-structured for extension. The complexity is in the downstream wiring (TypeScript → Rust → GLSL) not the Python itself.

### Performance

Per 5-minute song:
- Core features: ~30s
- Stem analysis: ~5s (if pre-separated)
- CLAP semantic: 20-300s (GPU vs CPU)
- **Total: 40s-6min depending on CLAP and GPU availability**

---

## SECTION 6: CONFIGURATION & STATE

### Where Configuration Lives

| Config Type | Location | Format | Editable Without Code? |
|------------|----------|--------|----------------------|
| Show setlist | `data/setlist.json` | JSON | Yes |
| Song identities | `data/song-identities.ts` + `.json` override | TS + JSON | Partially (JSON layer yes) |
| Shader routing | `veneta-routing.ts` (per-show) | TypeScript | No |
| Band identity | `data/band-config.ts` | TypeScript | No |
| Era presets | `data/era-presets.ts` | TypeScript | No |
| Overlay registry | `data/overlay-registry.ts` | TypeScript | No |
| Post-processing | `postprocess.rs` (hardcoded) | Rust | No |
| Render params | CLI flags + env vars | Mixed | Yes |
| Pipeline paths | `.env` + `core/config/env.ts` | Zod-validated env | Yes |
| Analysis params | Hardcoded in `analyze.py` | Python constants | No |

### Assessment

Configuration is **scattered across 10+ files in 3 languages.** The pattern is:
- Paths/secrets: `.env` (good)
- Creative direction: TypeScript files that must be edited and recompiled (bad)
- Render parameters: CLI flags (good)
- Analysis parameters: Hardcoded Python constants (bad)

### Can You Add a New Show Without Touching Code?

**Today: No.** You must:
1. Create `data/shows/{showId}/setlist.json` (no code)
2. Run audio analysis pipeline (no code)
3. Create show-specific routing (REQUIRES CODE: TypeScript file with shader pools per song)
4. Optionally create song identities for unmapped songs (REQUIRES CODE or JSON edit)

**What "no-code show addition" would require:**
- Migrate all routing logic to JSON configuration
- Default routing that works without show-specific overrides
- Song identity auto-generation from audio features (partially exists)

---

## SECTION 7: EXTENSIBILITY

### How Hard Is It To...

#### Add a New Shader (7 steps, ~30 minutes)

1. Write GLSL file in `visualizer-poc/src/shaders/my-shader.ts`
2. Export fragment shader string using `${sharedUniformsGLSL}`
3. Register in `scene-registry.ts` with energy affinity + metadata
4. (Optional) Add to song identity preferred modes
5. Run manifest generation — SceneRouter will include it in pool
6. Rust renderer auto-compiles it via shader_cache on first use
7. Verify: render test frame, check glsl_compat doesn't choke on new variables

**Risk:** Step 7 — if shader uses undeclared locals in generated functions, `glsl_compat.rs` may fail silently.

#### Add a New Overlay (5 steps, ~15 minutes)

1. Create PNG file in `renderer/overlay-pngs/`
2. Register in `overlay-registry.ts` with layer, tier, tags, energy response
3. (Optional) Add to song identity overlay boost/suppress
4. Regenerate manifest with `--with-overlays`
5. Verify: check frame output includes new overlay

**Clean and fast.** The overlay system is well-designed for extension.

#### Add a New Visual Mode/Effect (10 steps, ~2 hours)

1. Write WGSL effect shader in `renderer/src/effects.rs`
2. Add enum variant to effect mode list
3. Implement render pass for new mode
4. Add TypeScript mapping in manifest generator (effect_mode field)
5. Wire to audio trigger (which analysis feature activates it?)
6. Add to reactive-triggers or section vocabulary
7. Update uniform buffer if new parameters needed
8. Update both Rust and TypeScript uniform packing
9. Test compilation
10. Verify visual output

**Moderate effort.** The effects pipeline is extensible but requires Rust + TypeScript coordination.

#### Add a New Song Identity (3 steps, ~10 minutes)

1. Add entry to `song-identities.ts` or `data/song-identities.json`
2. Specify preferred modes, palette, overlay modifiers
3. Regenerate manifest

**Trivial.** Songs without entries gracefully default. This is the best-designed extension point.

#### Add a New Post-Processing Effect (8 steps, ~4 hours)

1. Write WGSL shader for new pass
2. Create new texture(s) if needed
3. Create wgpu render pipeline in `postprocess.rs`
4. Insert into pass chain (after bloom? after tonemap?)
5. Add enable/disable logic (which frames need it?)
6. Wire parameters to uniform buffer or per-frame manifest data
7. Update both Rust struct and TypeScript emitter
8. Test with multiple shader types (some effects kill certain shaders)

**Moderate-high effort.** Post-processing is structured but adding passes requires understanding the full texture flow.

#### Render a Different Band (15 steps, ~2-4 weeks)

1. Create `phish-config.ts` with BandConfig (eras, sacred segues, quotes)
2. Switch `BAND_CONFIG` export
3. Create song identities for 20-30 core songs
4. Create/curate overlay library (replace Dead iconography)
5. Define era presets for new band's periods
6. Source and prepare audio files
7. Run analysis pipeline (works as-is)
8. Create show-specific routing for first show
9. Adjust band-specific thresholds (jam detection, space detection differ)
10. Test shader routing with new audio characteristics
11. Curate overlay registry tiers for new content
12. Adjust film grain/grading for band's era
13. Create intro/endcard templates
14. Test full render
15. Iterate on visual quality

**The engine IS designed for multi-band** (BandConfig abstraction exists), but **2-4 weeks of creative work** is needed for each new band. The technical barrier is low; the creative/curation barrier is high.

#### Support New Resolution/Frame Rate (2 steps, ~5 minutes)

1. Pass `--width 1920 --height 1080 --fps 30` to manifest generator
2. Pass same to Rust renderer

**Trivial.** Resolution and FPS are parameterized throughout.

#### Support Live Performance (See Section 10)

---

## SECTION 8: TECHNICAL DEBT (Top 15)

### Ranked by: Frequency of Pain × Risk × Fix Difficulty

| # | Debt | Pain | Risk | Fix Cost | What It Unlocks |
|---|------|------|------|----------|-----------------|
| 1 | **glsl_compat.rs regex hacks** (160 hardcoded vars, fragile loop detection) | Every new shader | Silent black frames | 2-3 weeks | Fearless shader development |
| 2 | **1.4 GB JSON manifest** (text format, all-in-RAM) | Every render startup, 1.6 GB RAM | OOM on smaller machines | 2-3 days | Fast startup, lower RAM, CI-friendly |
| 3 | **Uniform buffer 4-file coordination** (Rust/TS/GLSL/manifest must agree) | Every new uniform | Silent corruption | 1 week | Safe uniform changes, auto-generated bindings |
| 4 | **Duplicated audio analysis** (visualizer-poc + vj-mode) | Bug fixes don't propagate | Feature drift | 1 week | Single source of truth for audio math |
| 5 | **Show routing requires code changes** (veneta-routing.ts is code, not config) | Every new show | Can't iterate without dev | 3-5 days | Non-technical show customization |
| 6 | **31 `any` types in manifest generation** | Type errors at runtime not compile time | Corrupt manifests | 2-3 days | Compile-time schema validation |
| 7 | **Silent overlay failures** (missing PNG → skip without logging) | Debug time when overlays vanish | Shipped broken frames | 1 day | Error manifest, pre-render validation |
| 8 | **Hardcoded relative paths** (4-level-up `../../..` references) | Breaks on structure changes | CI/Docker failures | 1 day | Portable monorepo references |
| 9 | **No visual regression testing** | Manual "render and look at it" | Ship quality regressions | 2 weeks | Automated quality gates |
| 10 | **250K-line visualizer-poc monolith** | Slow to navigate, unclear ownership | Wrong changes to wrong files | 2 weeks | Clear package boundaries |
| 11 | **Manifest generator lives in renderer package** | Confusing ownership, import confusion | Circular dependency risk | 1 day | Correct package topology |
| 12 | **No GPU profiling** (no per-pass timing) | Can't identify slow shaders | Blind optimization | 3 days | Data-driven perf improvements |
| 13 | **Docker not used for rendering** (only analysis) | Manual cloud setup each time | Unreproducible environments | 1 week | One-command cloud render |
| 14 | **Vast.ai scripts are imperative shell** (no error recovery) | Manual intervention on failures | Lost render time | 3-5 days | Resilient distributed rendering |
| 15 | **compute.rs disabled** (particle system commented out) | Blocked feature | None currently | 1 week | GPU particle overlays |

---

## SECTION 9: RENDERING INFRASTRUCTURE

### Current State

```
LOCAL MAC RENDERING:
  npx tsx generate-manifest-parallel.ts → manifest.json (5-10 min)
  cargo run --release -- --manifest manifest.json --output out.mp4 (hours)
  ffmpeg mux audio (seconds)

CLOUD RENDERING (Vast.ai):
  scripts/vast-orchestrate.sh:
    1. Provision N instances (manual Vast.ai selection)
    2. Bootstrap each: Node 22, pnpm, Chrome, ffmpeg, dead-air repo
    3. Partition songs by frame count (greedy bin-packing)
    4. Assign songs to instances
    5. Each instance: generate manifest chunk + render
    6. Download chunks via rsync
    7. Local: concat + mux audio
    8. Local: loudness normalize

DISTRIBUTED MULTI-INSTANCE:
  - Frame-count-aware load balancing
  - Long songs (Dark Star) can split 50/50 across instances
  - No automatic failure recovery (manual SSH intervention)
```

### Manual Steps Count

**Pre-render:** 4 manual steps (download audio, run Demucs, run analysis, create routing config)
**Render:** 3 manual steps (provision cloud, monitor, download chunks)  
**Post-render:** 3 manual steps (concat, mux audio, verify quality)
**Total: 10 manual steps** between "I want to render Veneta" and "YouTube-ready MP4"

### What Docker Should Contain (Post-Veneta)

```
CONTAINER 1: analysis (EXISTS)
  - Python 3.12 + librosa + numpy + scikit-learn
  - Input: raw audio → Output: analysis JSON

CONTAINER 2: gpu-analysis (EXISTS)
  - Python 3.12 + PyTorch + Demucs + WhisperX + CLAP
  - Input: raw audio → Output: stems + lyrics + semantics

CONTAINER 3: manifest-generator (NEEDS BUILDING)
  - Node 22 + TypeScript + visualizer-poc pure functions
  - Input: analysis JSON + show config → Output: manifest.msgpack

CONTAINER 4: renderer (NEEDS BUILDING)
  - Rust binary + wgpu + FFmpeg + overlay PNGs
  - Input: manifest + overlays → Output: video MP4

CONTAINER 5: orchestrator (NEEDS BUILDING)
  - Thin coordinator that chains containers 1-4
  - Handles partitioning, parallelism, concat, mux
```

### One-Command Render Experience

```bash
dead-air render \
  --show "1972-08-27" \
  --audio ./veneta-audio/ \
  --output ./veneta-final.mp4 \
  --quality 4k-60fps \
  --workers 8
```

**What this would do internally:**
1. Run analysis container (parallel per song)
2. Run stem separation container (parallel per song)
3. Generate manifest (parallel workers)
4. Partition manifest into N chunks
5. Spawn N renderer containers (GPU instances)
6. Wait for all chunks
7. Concat + mux + normalize
8. Output single file

**Gap from current state:** ~2-3 weeks of Docker/orchestration work.

---

## SECTION 10: REAL-TIME / LIVE PERFORMANCE

### What's Incompatible With Live

| Component | Pre-render | Live | Gap |
|-----------|-----------|------|-----|
| Audio analysis | Python batch (40s/song) | Must be <20ms/frame | Complete rewrite needed |
| Manifest generation | 5-10 min pre-compute | Must be frame-by-frame | Architecture change |
| Shader routing | Deterministic look-ahead | Reactive, no future knowledge | Algorithm change |
| Overlay scheduling | Pre-computed timelines | Reactive injection | Minor refactor |
| CLAP semantics | 2s windows, offline | Not feasible real-time | Drop or approximate |
| Stem separation | Demucs (30-90s/song) | Not feasible real-time | Drop or use light model |
| Coherence detection | 90-frame lookback | Can work with buffer | Minor adaptation |

### What Would Need Restructuring

1. **Audio analysis:** Replace Python librosa with WebAudio API + custom DSP (VJ Mode already has this — `BeatDetector`, `ChordDetector`, `FeatureExtractor`)
2. **Shader routing:** Replace deterministic SceneRouter with reactive state machine (VJ Mode already has `SceneTransitionEngine`)
3. **Uniform computation:** Replace pre-computed arrays with real-time audio → uniform mapping (VJ Mode has `VJUniformBridge`)
4. **Manifest:** Eliminate entirely — compute per-frame on the fly

### What Works Live Today

**VJ Mode IS a working live system.** It already has:
- Real-time WebAudio analysis (beat detection, chord recognition, section estimation)
- Reactive shader transitions (energy-driven)
- MIDI input for manual VJ control
- WebSocket remote control server
- Scene crossfading with energy-aware timing
- Show recording capability

**But it runs in the browser (WebGL), not the Rust renderer.** Performance ceiling:
- 1080p: 60fps achievable for simple shaders
- 4K: 30fps for simple shaders, <15fps for complex fractals
- No post-processing pipeline (no bloom, FXAA, tonemap)
- No overlay compositing system

### Is VJ Mode a Real Product?

**Yes, but with caveats:**
- It's a **real-time visualizer**, not a **production-quality renderer**
- Visual quality is significantly below pre-rendered output (no bloom, no film grain, no temporal effects)
- Works for live projection where imperfection is acceptable
- Does NOT work for "YouTube-quality live renders"

**Path to production-quality live:**
1. Port VJ Mode audio analysis to feed Rust renderer uniforms via shared memory
2. Run Rust renderer in "live mode" — frame-by-frame with 16ms budget
3. Skip expensive post-processing (motion blur, temporal blend)
4. Use simpler shaders (aim for 8ms GPU time at 1080p)
5. Pre-cache shader pipelines (no compilation during performance)
6. **Estimated effort: 3-4 weeks**

---

## SECTION 11: MULTI-BAND / MULTI-GENRE EXPANSION

### What's Hardcoded to Grateful Dead

| Component | Dead-Specific Content | Generalization Effort |
|-----------|----------------------|----------------------|
| `band-config.ts` | 6 eras, 48 sacred segues, 38 lyrics, 17 quotes | Create equivalent for new band |
| `song-identities.ts` | 30 Dead songs with visual personalities | Create for new band's songs |
| `overlay-registry.ts` | Dead iconography (skulls, roses, stealie) | Need new icon library |
| `era-presets.ts` | Dead era names + shader pools | Map to new band's periods |
| `veneta-routing.ts` | Veneta-specific overrides | Create per-show routing |
| Shaders themselves | None — purely procedural | Work for any music |
| Audio analysis | None — generic spectral features | Work for any music |
| Overlay components | ~50% Dead iconography, ~50% atmospheric | Atmospheric works for anyone |

### Rendering a Phish Show

**Technical effort:** 1-2 weeks  
**Creative effort:** 2-4 weeks  

**Steps:**
1. Create `phish-config.ts` (eras: Trey-era, 1.0, 2.0, 3.0, 4.0; sacred segues: Divided Sky → Foam, etc.)
2. Create 25-30 Phish song identities (Tweezer, YEM, Fluffhead, etc.)
3. Curate overlay library: Phish donuts, Trey face, Kuroda-style lighting references, MSG sphere imagery
4. Define era presets: early funky (pre-hiatus), precision machine (3.0), ambient jams (4.0)
5. Adjust jam detection thresholds (Phish jams tend longer and more structured than Dead)
6. Source audio from LivePhish or recordings
7. Run standard pipeline (analysis, manifest, render)

**What works out of the box:**
- All audio analysis (genre-agnostic)
- All shaders (procedural, music-reactive)
- All atmospheric overlays (50% of library)
- All post-processing (bloom, grain, tonemap)
- All infrastructure (cloud rendering, Docker)

### Effort Ranking for Non-Dead Content

| Band | Effort | Why |
|------|--------|-----|
| Phish | 3-4 weeks | Similar jam structure, similar live taping culture, easy audio sourcing |
| Allman Brothers | 3-4 weeks | Similar era structure, similar jam/blues vocabulary |
| Led Zeppelin (bootlegs) | 4-5 weeks | Different era mapping, audio quality varies wildly, shorter songs |
| Jazz (Miles Davis, Coltrane) | 5-6 weeks | Very different musical structure, jam detection needs retuning |
| Electronic (Tipper, STS9) | 4-5 weeks | Different audio characteristics, section detection needs work |
| Classical | 6+ weeks | Completely different structure, no "jam" concept, overlay library irrelevant |

**Summary:** Multi-band is **architecturally sound** (BandConfig abstraction, genre-agnostic analysis). The bottleneck is creative curation, not engineering.

---

## SECTION 12: TESTING AND QUALITY

### Test Coverage Map

| Package | Test Files | Framework | Coverage Focus |
|---------|-----------|-----------|----------------|
| visualizer-poc | 84 | Vitest | Utils, routing logic, audio math, coherence |
| vj-mode | 10 | Vitest | Audio analysis, state, transitions |
| pipeline | 8 | Vitest | Retry logic, batch orchestration, parsers |
| core | 3 | Vitest | Config validation, DB operations |
| dashboard | 5 | Vitest | Server routes, job store |
| renderer | 7 | Rust #[test] | Shader compilation, frame rendering, overlays |
| **Total** | **117 files** | | |

### What's NOT Tested

1. **Visual output quality** — no pixel-level regression tests
2. **Manifest schema agreement** — TypeScript emitter vs Rust parser not cross-validated
3. **End-to-end pipeline** — no test that runs audio→analysis→manifest→render→verify
4. **Shader visual correctness** — only compilation tested, not appearance
5. **Overlay compositing correctness** — no golden-image comparisons
6. **Performance regression** — benchmarks exist but no CI enforcement
7. **Cross-platform** — no testing on Linux/cloud (only Mac development)

### What Would "Better" Look Like

1. **Golden-frame tests:** Render 10 reference frames, compare pixel-by-pixel against saved PNGs. Flag if RMSE > threshold.
2. **Schema contract tests:** Generate TypeScript type from Rust struct (or vice versa). Fail CI if they diverge.
3. **Pipeline smoke test:** Render 30 seconds of one song end-to-end in CI. Verify MP4 is valid, non-black, correct duration.
4. **Shader compilation gate:** Compile all 133 shaders in CI. Any failure blocks merge.
5. **Performance budget:** Benchmark 100 frames, fail if FPS drops below threshold.

---

## SECTION 13: PERFORMANCE ARCHITECTURE

### Current Render Speeds

**Measured (Veneta 4K 60fps, RTX GPU):**
- Simple shaders: ~10-15 FPS
- Complex procedural (fractals, noise): ~3-8 FPS
- With motion blur (4 samples): ~1-3 FPS
- **Average across full show: ~7.5 FPS (estimated)**

### Per-Frame Time Budget (4K, standard frame)

| Stage | Time | % of Budget |
|-------|------|-------------|
| Scene shader (GPU) | 50-200ms | 60-80% |
| Bloom (5 GPU passes) | 10-30ms | 10-15% |
| Tonemap + FXAA (GPU) | 5-10ms | 3-5% |
| Effects (GPU, optional) | 10-30ms | 5-10% |
| GPU readback (async) | 2-3ms | 1-2% |
| CPU overlay compositing | 1-3ms | <1% |
| FFmpeg pipe write | <1ms | <1% |
| **Total** | **80-300ms** | — |

### The Actual Bottleneck

**Scene shaders are 60-80% of frame time.** Most Dead Air shaders are procedural noise generators with:
- Mandelbrot/Julia iteration (100-1000 per pixel)
- Multi-octave FBM noise (20-50 instructions per octave)
- Domain warping (4-8 recursive lookups)
- Volumetric raymarching (64-128 steps)

At 4K (8.3M pixels), even 50 instructions/pixel = 415M instructions. Complex shaders hit 500-1000 instructions/pixel = 4-8 billion instructions per frame.

### What Would Double Render Speed

1. **Shader LOD system** — reduce iteration counts for less visually critical frames (e.g., during transitions, use half iterations). **Impact: 1.5-2x.** Cost: 1 week.

2. **Resolution scaling** — render complex shaders at 75% resolution, upscale with bicubic. **Impact: 1.8x.** Cost: 3 days.

3. **Temporal reprojection** — reuse 50% of pixels from previous frame, only recompute changed regions. **Impact: 1.5-2x.** Cost: 2 weeks (complex).

4. **Shader tiering** — classify shaders by cost, schedule expensive ones during "hold" periods when camera is static. **Impact: 1.3x.** Cost: 1 week.

### What Would 10x Render Speed

1. **Multi-GPU rendering** — split frame into tiles, each GPU renders a tile, composite on CPU. Requires complete pipeline restructuring. **Impact: Nx for N GPUs.** Cost: 1 month+.

2. **Compute shader rewrite** — replace fragment shaders with compute shaders that can exploit GPU parallelism better (tile-based workgroups). **Impact: 2-3x.** Cost: 2 months.

3. **Shader simplification** — cap all shaders at 64 iterations max, remove volumetric raymarching. **Impact: 3-5x.** Cost: 1 week. **Tradeoff: visual quality reduction.**

4. **Hardware upgrade** — RTX 4090 is ~2-3x faster than RTX 3080 for compute. **Impact: 2-3x.** Cost: $1,600.

**Realistic path to 10x:** Multi-GPU cloud instances (4× RTX 4090s) + shader LOD + resolution scaling = ~12-15x. Already partially implemented via Vast.ai distributed rendering.

---

## SECTION 14: TOP 10 ARCHITECTURAL OPPORTUNITIES

### Ranked by Impact × Feasibility / Risk

| # | Opportunity | Impact | Effort | Risk | Urgency |
|---|-------------|--------|--------|------|---------|
| 1 | **MessagePack manifest + streaming load** | High: 50% smaller, 90% less RAM, faster startup | 2-3 days | Very low (already supported) | Immediate |
| 2 | **Schema-driven uniform codegen** | High: eliminates silent corruption, 4-file sync eliminated | 1 week | Low | Next quarter |
| 3 | **Replace glsl_compat.rs regex layer** | High: eliminates #1 maintenance burden, enables fearless shader dev | 2-3 weeks | Medium (might break existing shaders) | Next quarter |
| 4 | **Dockerized one-command render** | High: eliminates 10 manual steps, enables CI rendering | 2-3 weeks | Low | Post-Veneta |
| 5 | **JSON-based show routing** (no-code show config) | Medium-High: enables non-dev show creation, faster iteration | 1 week | Low | Before next show |
| 6 | **Visual regression testing** | Medium-High: catches quality regressions, enables confident refactoring | 2 weeks | Low | Before major refactors |
| 7 | **Extract @dead-air/audio-core** (shared analysis math) | Medium: eliminates dual maintenance, single bug-fix path | 1 week | Low | Before VJ Mode productization |
| 8 | **GPU overlay compositing** | Medium: enables complex overlay effects, reduces CPU work | 2 weeks | Medium (new pipeline path) | When overlay complexity grows |
| 9 | **Shader LOD/complexity tiering** | Medium: ~2x render speed for free | 1 week | Low | Before next long render |
| 10 | **Live Rust renderer mode** | High (revenue): enables real-time VJ product | 3-4 weeks | High (architectural change) | When pursuing live market |

### Details

**#1: MessagePack Manifest**
- What: Switch manifest output from JSON to MessagePack (format already supported by Rust)
- Why: 1.6 GB → 0.85 GB, load time drops proportionally, RAM halved
- Unlocks: CI rendering feasible, faster iteration cycles
- Risk: Nearly zero — Rust loader already has MessagePack path

**#2: Schema-Driven Uniform Codegen**
- What: Single TOML/JSON file defines all uniforms → generates Rust struct, TypeScript emitter, GLSL declarations
- Why: Currently 4 files must stay in sync manually. One wrong offset corrupts all subsequent uniforms.
- Unlocks: Safe uniform addition (add once, generated everywhere)
- Risk: Low — additive change, old code continues working during migration

**#3: Replace GLSL Compat Layer**
- What: Use tree-sitter-glsl or custom parser instead of regex for WebGL→GLSL 450
- Why: 160 hardcoded variable names. Silent black frames on new shaders. Major maintenance burden.
- Unlocks: Any shader "just works" without manual variable list maintenance
- Risk: Medium — must validate all 133 existing shaders still compile

**#4: Dockerized One-Command Render**
- What: Full pipeline in containers: analysis → manifest → render → mux
- Why: 10 manual steps currently. Unreproducible environments. Cloud setup is imperative shell.
- Unlocks: `dead-air render --show X` as single command, CI/CD pipelines
- Risk: Low — containerizing existing tools, not rewriting

**#5: JSON Show Routing**
- What: Migrate `veneta-routing.ts` creative choices to `routing.json` per show
- Why: Currently every new show requires TypeScript code changes
- Unlocks: Dashboard-editable show direction, non-developer iteration
- Risk: Low — pure configuration extraction

---

## SECTION 15: THE SINGLE BIGGEST RISK

### The GLSL Compatibility Layer Will Eventually Break a Render

**What:** `packages/renderer/src/glsl_compat.rs` uses regex patterns to convert WebGL ES 1.00 shaders to GLSL 450. It maintains a hardcoded list of 160 variable names that might be "captured" by generated raymarching functions. It uses string matching to detect loop bounds and texture usage.

**Why it's the biggest risk:**
1. **Silent failure mode.** When a shader uses a variable not in the 160-name list, the function compiles but reads uninitialized memory → black or garbage pixels. No error, no warning.
2. **Grows more fragile over time.** Every new shader is a roll of the dice. Complex procedural shaders (which produce the best visuals) are most likely to trigger edge cases.
3. **Single point of failure for all rendering.** Every pixel in every frame passes through this layer. A bug here affects the entire show.
4. **Unreproducible failures.** Whether a shader works depends on which variables it happens to use, which is only discoverable at compile time.

**Worst case scenario:** You render a 3-hour show overnight. 2 hours in, a shader transition introduces a scene that uses a variable named `ringPos` (not in the capture list). That scene renders as pure black or visual garbage for 8 minutes. You don't notice until reviewing the final output. The entire render is unusable and must be re-done after fixing the capture list.

**How we avoid it:**
1. **Short-term:** Run `validate_all_shaders` test before every render. It catches compilation failures but NOT silent-black-frame failures from missing captures.
2. **Medium-term:** Add a "golden frame" validation — render one frame per shader, verify non-black output (< 5% of pixels are #000000).
3. **Long-term:** Replace the regex-based conversion with a proper GLSL parser that performs actual scope analysis and automatically identifies all captured variables. This eliminates the manual list entirely.

**Time to fix properly:** 2-3 weeks for parser replacement + validation against all 133 shaders.

**Cost of NOT fixing:** Every new shader carries risk of silent rendering failure. Development velocity for new visual content is permanently throttled by this uncertainty.

---

## APPENDIX: KEY METRICS

| Metric | Value |
|--------|-------|
| Total LoC (TypeScript) | ~280,000 |
| Total LoC (Rust) | ~10,700 |
| Total LoC (Python) | ~2,500 |
| Packages | 7 |
| Shader scenes | 133 |
| Overlay components | 474 |
| Active overlays (A+B tier) | 87 |
| Audio features per frame | 28-43 (depending on stems/CLAP) |
| Manifest uniforms per frame | 108 |
| GPU uniform buffer | 656 bytes (std140) |
| GPU textures per frame | 13-15 |
| GPU VRAM usage | 241-274 MB |
| System RAM (rendering) | 600-1000 MB |
| Manifest size (Veneta 60fps) | 1.64 GB |
| Frames (Veneta 60fps) | 598,238 |
| Render speed (4K complex) | 3-8 FPS |
| Render speed (4K simple) | 10-15 FPS |
| Manual steps per render | 10 |
| Test files | 117 |
| Docker containers | 2 (analysis, GPU) |
| Cloud render instances | 4-8 (Vast.ai) |

---

*End of audit. No changes made. No actions taken.*
