# Audit Action Progress — 2026-05-01

Single-session execution against [`ARCHITECTURAL-AUDIT-2026-04.md`](./ARCHITECTURAL-AUDIT-2026-04.md).
Two commits land the changes; deferral docs capture the rest.

## Completed (code-level, tested)

### Wave 1.1 — MessagePack manifest output (audit Top #1)
- `packages/manifest-generator/generate-manifest-parallel.ts` — detects `.msgpack` / `.mp` extension, writes binary via `msgpackr` with Rust-compatible settings (`useRecords: false`, `useFloat32: ALWAYS`).
- `packages/manifest-generator/convert-manifest-to-msgpack.mts` — one-shot JSON→msgpack converter for legacy manifests.
- `packages/renderer/src/manifest.rs` — added 3 round-trip tests + cross-format equivalence test, all passing.
- `packages/renderer/tests/cross_lang_msgpack.rs` — cross-language test that loads a TS-emitted msgpack file in Rust.

### Wave 1.2 — Overlay error manifest + pre-render validation (audit Debt #7)
- `packages/renderer/src/overlay_cache.rs` — `validate_schedule()` returning `ValidationReport` with missing overlays, frame-instance counts, sorted by frequency.
- `packages/renderer/src/main.rs` — pre-flight validation + new `--strict-overlays` flag.
- 3 unit tests covering missing/passing/keyframe-skip cases.

### Wave 1.3 — Split renderer main.rs into render_loop.rs (audit Section 3 #5)
- `packages/renderer/src/render_loop.rs` — `RenderResources` bag struct + `run()` function.
- `main.rs`: 924 → 566 lines.

### Wave 1.4 — Workspace path resolution (audit Debt #8)
- `packages/core/src/utils/paths.ts` — `findWorkspaceRoot/packageRoot/rendererRoot/visualizerPocRoot/fromRoot`. `DEAD_AIR_ROOT` env override.
- `pipeline/src/render/rust-renderer.ts` and `cli/src/commands/generate-show.ts` updated to use helpers.
- 6 vitest cases pass.

### Wave 1.5 — Move manifest generator out of /renderer/ (audit Debt #11)
- New `packages/manifest-generator/` with own `package.json` + `tsconfig.json`.
- Moved 5 generator files; relative imports kept working (same depth).
- `rust-renderer.ts` + `render-show.sh` updated.

### Wave 2.4 — JSON-based show routing (audit Top #5)
- `packages/visualizer-poc/scripts/extract-show-routing.mts` — extracts `VENETA_SONG_IDENTITIES` to `data/shows/1972-08-27/routing.json`.
- `veneta-routing.ts::getVenetaSongIdentity` checks JSON first, falls back to inline TS.
- 5 vitest cases pass.

### Wave 3.1 — glsl_compat replacement safety net (audit Top #3, BIGGEST RISK) — phase 1
- `packages/renderer/tests/glsl_compat_fixtures.rs` — characterization fixtures.
- Walks 128 shader fixtures, runs `webgl_to_desktop`, writes converted output + hash manifest.
- Asserts no empty conversions + `#version 450` in every output.
- `DEAD_AIR_GLSL_BASELINE` env var enables byte-for-byte regression mode.
- Phase 2 (replace regex with tree-sitter-glsl) now has its safety net.

### Wave 3.2 — Visual regression silent-failure gate (audit Top #6)
- `packages/renderer/tests/render_multi_shader.rs::golden_frame_silent_failure_gate` — walks all 128 GLSL fixtures, GPU-renders at 256x256, asserts non-black + non-uniform output.
- **Found 16 silently-broken shaders** — the audit's #15 risk surfaced.
- `DEAD_AIR_STRICT_GOLDEN_FRAMES=1` fails on any silent failure.
- Also fixed `tests/render_one_frame.rs` and `tests/render_multi_shader.rs::test_render_multiple_shaders` (were stale).

### Wave 3.3 — Shader LOD scaling (audit Top #9)
- `gpu.rs` parameterized with `scene_width`/`scene_height` (independent of output dims). Scene/secondary/feedback textures sized down; output texture + readback stay full-res; postprocess sampler upscales.
- New `--scene-scale` flag (range 0.25..=1.0, default 1.0).
- `tests/scene_scale_lod.rs` validates scale=0.75 produces valid full-res output.

### Wave 3.4 — Dockerized one-command render (audit Top #4) — phase 1
- `docker/Dockerfile.manifest` — Node 22 + tsx + msgpackr.
- `docker/Dockerfile.renderer` — Rust + wgpu/Vulkan + ffmpeg multi-stage.
- `docker/docker-compose.yml` — `generate-manifest` + `render` services with `--gpus all`.
- `scripts/dead-air-render.sh` — orchestrator with `--show/--output/--width/--height/--fps/--scene-scale` flags + Docker auto-detect + skip switches.

## Partial

### Wave 2.2 — `any` types in manifest generation (audit Debt #6)
- Typed two reducer parameters; added `EnhancedFrameData` import.
- 11 type errors remain (caller/callee signature drift). Documented at top of `generate-full-manifest.ts`.

## Documented + deferred (each multi-week)

### Wave 2.1 — Schema-driven uniform codegen
Plan: `packages/renderer/src/uniform-schema-NOTES.md` — schema shape, 5-phase safe migration (parse Rust comments → generate Rust struct → generate GLSL → switch TS packer → delete legacy), acceptance criteria.

### Wave 2.3 — Extract @dead-air/audio-core
Plan: `packages/vj-mode/AUDIO-CORE-EXTRACTION-NOTES.md` — analysis of vj-mode (real-time class state) vs visualizer-poc (offline functional), shareable primitives, package shape.

### Wave 3.5 — Split visualizer-poc 250K-line monolith
Plan: `packages/visualizer-poc/MONOLITH-SPLIT-NOTES.md` — split into `@dead-air/visual-engine` (data/, utils/, scenes/routing/, shaders/) + `@dead-air/remotion-compositions` (React/Remotion). 5-phase migration with manifest-output equivalence gate.

### Wave 4.1 — GPU overlay compositing
Plan: `packages/renderer/src/gpu-overlay-compositing-NOTES.md` — atlas builder → GPU upload → instanced compositing pipeline → hot-path swap → pixel equivalence test.

### Wave 4.2 — Live Rust renderer mode
Plan: `packages/renderer/src/live-renderer-mode-NOTES.md` — frame budget validation → cpal audio + DSP → live FrameData synthesis → reactive router port from VJ Mode → winit window → production hardening.

## Test status

- `cargo test --lib` — 37 passing (including new manifest msgpack + overlay validation tests)
- `cargo test --test cross_lang_msgpack` — 1 passing (TS→Rust msgpack)
- `cargo test --test render_one_frame` — 1 passing (was previously broken)
- `cargo test --test render_multi_shader golden_frame_silent_failure_gate` — 1 passing (12% silent-fail baseline reported)
- `cargo test --test scene_scale_lod` — 1 passing (LOD validates)
- `cargo test --test glsl_compat_fixtures` — 1 passing (128 shader baseline written)
- `pnpm test` (core) — 56 passing (6 new path tests)
- `pnpm test` (visualizer-poc, scoped) — 5 new veneta-routing tests passing

## Honest framing

Two commits ship roughly 1-2 days of solid engineering value across 9 audit items. The remaining 5 deferred items each have a written plan with phase breakdown and acceptance criteria — they total ~10-13 weeks of estimated work and are the right size for individual focused engineering blocks, not "more turns of this conversation."
