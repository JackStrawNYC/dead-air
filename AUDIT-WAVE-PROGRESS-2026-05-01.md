# Audit Action Progress — 2026-05-01

Multi-commit execution against [`ARCHITECTURAL-AUDIT-2026-04.md`](./ARCHITECTURAL-AUDIT-2026-04.md).

## Completed (code-level, tested)

### Wave 1 — quick wins (full set)
- **1.1** MessagePack manifest output (msgpackr ↔ rmp-serde, cross-language tested)
- **1.2** Overlay pre-flight validation + `--strict-overlays` flag
  - Sibling: shader_id pre-flight + `--strict-shaders` (mirrors overlay debt #7)
  - Sibling: `--strict-dimensions` catches manifest-vs-CLI WxH/fps drift
  - Sibling: `--validate-only` exits after pre-flight (CI gate, sub-second)
  - Pre-flight now also prints top-10 shader frame distribution every render
- **1.3** Split renderer `main.rs` 924→566 lines, render loop in `render_loop.rs`
- **1.4** Workspace path resolution helpers in `@dead-air/core` + 6 tests
- **1.5** Manifest generator extracted to `@dead-air/manifest-generator` package

### Wave 2 — type safety + show config (all done in code)
- **2.1** Schema-driven uniform codegen — **FULLY CLOSED**
  - Phase A: `extract-uniform-schema.mts` produces `uniforms-schema.json` (116 uniforms)
  - Phase B: `generate-uniform-packer.mts` produces typed TS packer (`generated/uniform-packer.ts`)
  - Phase C: `generate-rust-uniforms.mts` emits Rust offsets/struct + `pack_simple_uniforms` codegen; `generate-glsl-uniforms.mts` emits the GLSL block
  - Phase D: codegen wired into the live render path; 105 hand-written simple write_f32 calls deleted from uniforms.rs (471 → 366 lines)
  - Drift gates: `uniform_schema_drift.rs`, `uniforms_layout_drift.rs`, `uniform_packer_parity.rs`
  - **Adding a new simple uniform is now schema-only** (audit Top #2 acceptance criterion met)
- **2.2** All 11 type errors in `manifest-generator` resolved (caller/callee signature alignment + dead `generate-manifest-worker.ts` deleted)
- **2.3** `@dead-air/audio-core` extracted + consumer migration via shims
  - 5 modules + 89 internal tests
  - manifest-generator switched to direct imports
  - visualizer-poc switched via 5 shim files (zero consumer churn — 1573 tests still pass)
- **2.4** JSON-based show routing — `data/shows/1972-08-27/routing.json` with 5-test fallback layer

### Wave 3 — quality gates + infra
- **3.1** glsl_compat replacement safety net (phase 1)
  - `tests/glsl_compat_fixtures.rs` characterizes all 128 shaders' converted output
  - Captures structural correctness (no empty conversions, every shader has `#version 450`)
  - `DEAD_AIR_GLSL_BASELINE` env var enables byte-for-byte regression mode
- **3.2** Visual regression silent-failure gate
  - `golden_frame_silent_failure_gate` walks all 127 shaders, GPU-renders at 256x256
  - **Initial run found 16 silent failures + 4 compile failures — ALL FIXED**
    - capture detector broadened to non-`_rmp` helper functions (`scope_outside_main`)
    - `stemBass`/`stemDrums`/`vocalE` added to capture candidates
    - varying handling: explicit location 0 for `vUv`, strip non-vUv varyings
    - `luminous-cavern`: vec2-into-snoise(vec3) bug fixed in shader source
    - `solar-flare`: vec2 + vec3 type bug fixed
    - `forest`: 3D-mesh shader excluded from fullscreen-quad pipeline
  - **127/127 pass at strict-mode threshold (0% silent failures)**
- **3.3** Shader LOD scaling — `--scene-scale 0.25..=1.0` flag, parameterized scene_texture, validated end-to-end
- **3.4** Dockerized one-command render
  - `Dockerfile.manifest`, `Dockerfile.renderer`, docker-compose entries
  - `scripts/dead-air-render.sh` orchestrator with skip-switches for resuming
- **3.5** visualizer-poc monolith inventory (phase A)
  - `inventory-imports.mts` walks 879 .ts/.tsx files, classifies engine vs view
  - **0 mixed modules — package boundary is mechanical**
  - Per-directory rollup committed to `inventory-imports.json`

### Wave 4 — perf + live
- **4.1** GPU overlay compositing — **FULLY CLOSED + 4 correctness fixes from a real render**
  - Phase A: `overlay_atlas.rs` shelf packer, 5 unit tests
  - Phase B: `overlay_pass.rs` instanced WGSL pipeline, end-to-end smoke
  - Phase C: render loop integration via `--gpu-overlays` flag
  - Phase D: CPU/GPU pixel parity test — both paths produce 1352 active pixels exactly
  - Phase E: CPU-vs-GPU perf benchmark — **12x speedup** on M3 Pro at 1080p (15.85 ms → 1.33 ms / frame)
  - Bug fixes after a user screenshot exposed orientation issues:
    - Y-flip in WGSL UV mapping (NDC up vs image V down)
    - offset_y direction (CPU image-Y-down vs NDC-Y-up)
    - Rotation handedness (CW in image-space vs CCW in NDC)
    - Blend mode dispatch (was always Normal; now Normal/Screen/Multiply per pipeline)
    - Z-order across interleaved blend modes (now run-batched in input order)
  - Regression coverage: 6 smoke tests in `overlay_pass_smoke.rs` plus parity
- **4.2** Live Rust renderer mode
  - Phase A: `tests/live_mode_budget.rs` measures shader perf at 1080p on M3 Pro
  - Real data: cheap tier OK60, expensive tier needs LOD, volumetric tier too slow
  - Phase B (cpal audio + DSP + winit window) deferred — user is local-only

### Wave 5 — adaptive LOD + GPU profiling + particles (May 2026 session)
- **5.1** Per-shader cost baseline (Debt #12 closed)
  - `tests/shader_cost_profile.rs` walks all 127 shaders at 360p
  - `SHADER-COST-PROFILE-2026-05-02.md` is the optimization triage list
  - Baseline: 80 OK60, 20 OK30, 12 SLOW, 15 BUSTED on M3 Pro
- **5.2** Multi-tier per-frame `--scene-scale`
  - `SceneTargets` bundle (scene + secondary + ping-pong feedback)
  - `GpuRenderer` allocates one bundle per active cost tier
  - render_loop routes per frame: BUSTED → 0.5x bundle, others stay full
  - Transitions render through the smaller-scale bundle to fit the worst-case shader
  - `--slow-scene-scale 0.75`, `--busted-scene-scale 0.5`, `--no-adaptive-scale`
  - 3 multi_tier_render integration tests + all 8 GPU integration tests pass
- **5.3** Particle system wired (Debt #15 closed)
  - `compute.rs` was implemented but never called; now opt-in via `--particles N`
  - Update + render run after scene/pp; double readback ping-pong wins
  - Particle uniforms scale spawn rate with energy, turbulence with bass
  - 2 particle_system_smoke tests confirm M3 Pro compute pipeline works
- **5.4** Pre-flight gates batch
  - `--strict-shaders`, `--strict-dimensions`, `--validate-only` (CI gates)
  - Top-10 shader frame distribution printed every render
  - GPU overlay atlas drops cross-checked vs schedule
- **5.5** Per-tier rollup in pre-flight (cost-baseline summary every render)
- **5.6** Tier-change feedback chain reset (eliminates stale-bundle artifacts)

### Wave 6 — manifest-gen routing unlock (May 2026 session, in progress)
Three "imported but never called" routing functions wired:
- **6.1** `getModeForSection` — sophisticated picker (recency weighting,
  song identity, spectral matching, visual memory, continuous-energy pools)
- **6.2** `dynamicCrossfadeDuration` — energy-aware 2-12s transitions
  (was hardcoded 0.5-3s cap, the Cornell "abrupt transitions" signal)
- **6.3** `detectPeakOfShow` — one-time golden "moment of the show"
  treatment (brightness +0.20, saturation +0.35, overlay density 0.5x,
  camera 0.6x, ~7s duration)

Plus per-song variety enforcement (50% cap), thin-identity drop (when
< 3 valid preferred modes survive blocklist), forest blocklisted
(3D-mesh shader, vWorldPos compile fail), msgpack direct output for
full-show (avoids Node 512MB string limit).

**Round 2 (continuation)** — more dead-data wirings:
- **6.4** `narrative` directive applied (brightness/saturation/temperature
  offsets — was computed every frame, never read)
- **6.5** `sectionVocab` brightness/saturation offsets applied
- **6.6** `grooveModifiers` temperatureShift applied (±10° hue)
- **6.7** `climaxModulation` brightness/saturation half-weight applied
- **6.8** `climaxModulation` bloom + contrast → per-frame `show_bloom`/
  `show_contrast` (was hardcoded constants)
- **6.9** Overlay density chain: narrative + vocab + interplay + peak
  multiplied into per-frame opacity (was dropped)
- **6.10** Drums/Space override expanded from 1 hardcoded shader per
  subphase to 5-element pools (cosmic_voyage was 11.7% of frames
  despite being blocklisted)
- **6.11** DUAL_POOLS blocklist cleanup — 5 entries removed
  (cosmic_voyage / protean_clouds / fluid_2d / particle_nebula /
  bioluminescence) so dual blends no longer render black secondaries
- **6.12** Reactive triggers field-name mismatch fix —
  `triggered`/`shaderPool` → `isTriggered`/`suggestedModes`. Whole
  reactive system was dead code in manifest gen.
- **6.13** `safeDefaultMode` — plugged 3 raw-defaultMode leaks that let
  blocklisted shaders into prevShaderId / routeScene. protean_clouds
  was 4.5% of frames despite being blocked.
- **6.14** `showArcModifiers` wired — was passed as undefined.
  computeShowArcPhase now drives per-song arc treatment.
- **6.15** `songHero` wired from songIdentity.overlayBoost[0] — each
  song's signature overlay is now guaranteed to appear.

Veneta final validation (1920x1080@30fps, 349,507 frames):
- Total unique shaders: 21 → **60** (catalog utilization 24% → 69%)
- BUSTED unique: 2 → **11**
- SLOW unique: 2 → **7**
- 60/60 shaders compile cleanly (forest blocklisted)
- protean_clouds (BLOCKED) frames: leaking → **0%**
- cosmic_voyage (BLOCKED) frames: 11.7% → **0%**
- Top shader dominance: void_light 18.5% → fluid_light 12.5% (flatter)

### Wave 4.2 — Live Rust mode (phase B onwards)
- Frame budget data in hand; needs cpal input, real-time DSP, winit window, reactive router port.

## Test status

`cargo test --lib` = 44 passing
Integration tests = 9 files, all green:
  - cross_lang_msgpack
  - glsl_compat_fixtures (128 shader baseline)
  - render_one_frame
  - render_multi_shader (golden_frame_silent_failure_gate at strict 0% silent fail)
  - scene_scale_lod
  - uniform_schema_drift
  - uniforms_layout_drift (5 sub-tests)
  - validate_all_shaders (127/127 = 100% pass rate)
  - overlay_pass_smoke
  - live_mode_budget (#[ignore], explicit run only)

`pnpm test`:
  - core: 56 passing (incl. 6 path tests)
  - audio-core: 89 passing
  - visualizer-poc: 1573 passing across 85 files (validates the audio-core shim migration)
  - vj-mode: prior tests still pass

## Commits this session
```
a4f11ff  feat: visualizer-poc consumes @dead-air/audio-core via shims
b70ba3f  feat: manifest-generator consumes @dead-air/audio-core
bc39202  feat(renderer): live-mode frame budget benchmark
21a6bc0  feat(renderer): overlay atlas packer
959e7c0  fix(types): align manifest generator caller signatures
7f491bb  fix(shaders): 100% pass rate — golden gate strict
6195087  arch: Wave 3.1 + 3.3 + 3.4 phase 1
4844ad1  arch: Wave 1 + 2.4 + 3.2
fc162a1  docs: deferral plans
+ this commit (Wave 2.1 phase C + 4.1 phase B + audio-core shims + master doc update)
```
