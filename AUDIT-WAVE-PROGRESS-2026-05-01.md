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
  - Phase B (cpal audio + DSP + winit window) deferred

## Not yet started (large-scope)

### Wave 3.5 — visualizer-poc package split (phase B, the actual move)
- Inventory done; the move itself needs `git mv` + sed import rewrite + manifest-output equivalence test.
- Plan in `MONOLITH-SPLIT-NOTES.md` — ~7 working days.

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
