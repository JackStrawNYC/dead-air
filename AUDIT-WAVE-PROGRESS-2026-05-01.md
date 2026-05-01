# Audit Action Progress — 2026-05-01

Single-session execution against [`ARCHITECTURAL-AUDIT-2026-04.md`](./ARCHITECTURAL-AUDIT-2026-04.md).

## Completed (code-level, tested)

### Wave 1.1 — MessagePack manifest output (audit Top #1)
- `packages/manifest-generator/generate-manifest-parallel.ts` — detects `.msgpack` / `.mp` extension, writes binary via `msgpackr` with Rust-compatible settings (`useRecords: false`, `useFloat32: ALWAYS`).
- `packages/manifest-generator/convert-manifest-to-msgpack.mts` — one-shot JSON→msgpack converter for legacy manifests.
- `packages/renderer/src/manifest.rs` — added 3 round-trip tests + cross-format equivalence test, all passing.
- `packages/renderer/tests/cross_lang_msgpack.rs` — cross-language test that loads a TS-emitted msgpack file in Rust.
- **Effect**: msgpack manifests load correctly across the language boundary; smaller files, faster startup.

### Wave 1.2 — Overlay error manifest + pre-render validation (audit Debt #7)
- `packages/renderer/src/overlay_cache.rs` — added `validate_schedule()` returning `ValidationReport` with missing overlays, frame-instance counts, sorted by frequency.
- `packages/renderer/src/main.rs` — wired pre-flight validation + new `--strict-overlays` flag that aborts before render if anything is missing.
- 3 new unit tests covering missing/passing/keyframe-skip cases.
- **Effect**: missing overlay PNGs no longer silently render blank; production renders can opt into strict mode.

### Wave 1.3 — Split renderer main.rs into render_loop.rs (audit Section 3 #5)
- `packages/renderer/src/render_loop.rs` — new module with `RenderResources` bag struct + `run()` driving the per-frame pipeline (transitions, motion blur, post-process, effects, composited overlays, readback).
- `packages/renderer/src/main.rs` — went from 924 → 566 lines; now orchestrates init + cleanup, delegates the loop.
- All 37 lib tests still pass.
- **Effect**: render loop is independently callable from tests/benches; main.rs is now scannable.

### Wave 1.4 — Workspace path resolution (audit Debt #8)
- `packages/core/src/utils/paths.ts` — new `findWorkspaceRoot()`, `packageRoot()`, `rendererRoot()`, `visualizerPocRoot()`, `fromRoot()` helpers. Honors `DEAD_AIR_ROOT` env override.
- `packages/pipeline/src/render/rust-renderer.ts` — replaced `'../../../renderer'` with `rendererRoot()`.
- `packages/cli/src/commands/generate-show.ts` — replaced `__dirname, '../../../visualizer-poc/data/...'` with `visualizerPocRoot()`.
- 6 new vitest cases in `paths.test.ts`, all passing.
- **Effect**: cross-package paths survive directory restructuring.

### Wave 1.5 — Move manifest generator out of /renderer/ (audit Debt #11)
- New package: `packages/manifest-generator/` with own `package.json` + `tsconfig.json`.
- Moved: `generate-manifest-parallel.ts`, `generate-full-manifest.ts`, `generate-manifest-worker.ts`, `generate-manifest.ts`, `convert-manifest-to-msgpack.mts`.
- `packages/pipeline/src/render/rust-renderer.ts` updated to point at the new package.
- `packages/renderer/render-show.sh` updated to `cd` into the new location.
- Smoke test: parallel generator runs from new location, processes cached songs.
- **Effect**: TypeScript no longer lives inside the Rust package; correct package topology.

### Wave 2.4 — JSON-based show routing (audit Top #5)
- `packages/visualizer-poc/scripts/extract-show-routing.mts` — extracts `VENETA_SONG_IDENTITIES` to `data/shows/1972-08-27/routing.json`.
- `packages/visualizer-poc/src/data/veneta-routing.ts` — `getVenetaSongIdentity()` now checks the JSON file first, falls back to inline TS.
- 5 new vitest cases in `veneta-routing.test.ts`, all passing.
- **Effect**: show routing is editable via JSON (data/shows/1972-08-27/routing.json), no TypeScript changes required for an iteration cycle.

### Wave 3.2 — Visual regression: silent-failure gate (audit Top #6, partial)
- `packages/renderer/tests/render_multi_shader.rs` — new `golden_frame_silent_failure_gate` test walks all 128 GLSL fixtures, GPU-renders each at 256x256, asserts non-black + non-uniform output.
- Threshold tunable via `DEAD_AIR_STRICT_GOLDEN_FRAMES=1`.
- **Found 16 silently-broken shaders** (12% of catalog) — the audit's #15 risk in action. They're listed in test output for individual triage.
- Also fixed `tests/render_one_frame.rs` and `tests/render_multi_shader.rs::test_render_multiple_shaders` which were stale (missing FrameData fields, missing `render_frame` arg).
- **Effect**: regressions in glsl_compat or uniform packing now show up as test failures with named offenders.

## Partial (code-level)

### Wave 2.2 — `any` types in manifest generation (audit Debt #6)
- Added `EnhancedFrameData` import + typed two reducer parameters in `generate-full-manifest.ts`.
- 11 type errors remain — they reflect signature drift between callers and callees (computeReactiveTriggers, detectJamCycle, computeNarrativeDirective, ShowVisualSeed.era access). Each needs caller/callee alignment.
- Documented in a header comment block at the top of `generate-full-manifest.ts`.

## Documented + deferred (real implementation > 1 week each)

### Wave 2.1 — Schema-driven uniform codegen
- Plan: `packages/renderer/src/uniform-schema-NOTES.md` — schema shape, 5-phase safe migration, acceptance criteria.

### Wave 2.3 — Extract @dead-air/audio-core
- Plan: `packages/vj-mode/AUDIO-CORE-EXTRACTION-NOTES.md` — analysis of vj-mode (real-time class-based) vs visualizer-poc (offline functional) implementations, identified genuinely shareable primitives, proposed package shape, acceptance criteria.

## Not started

| Task | Audit estimate | Why not in this session |
|---|---|---|
| Wave 3.1 — Replace glsl_compat.rs regex with proper GLSL parser | 2-3 weeks | tree-sitter-glsl integration + regression-test all 128 shaders |
| Wave 3.3 — Shader LOD/complexity tiering | 1 week | Requires new render-target plumbing in gpu.rs + per-shader cost classification |
| Wave 3.4 — Dockerized one-command render | 2-3 weeks | 4 new container images + orchestrator + cloud reproducibility validation |
| Wave 3.5 — Split visualizer-poc 250K-line monolith | 2 weeks | Two-package extraction with import-graph rewrites |
| Wave 4.1 — GPU overlay compositing | 2 weeks | New atlas pipeline + texture upload path + final render pass |
| Wave 4.2 — Live Rust renderer mode | 3-4 weeks | Architecture change — eliminate manifest, share memory with VJ analysis |

## Test status

Across the touched packages:
- `cargo test --lib` — 37 passing (including 3 new manifest msgpack + 3 new overlay validation tests)
- `cargo test --test cross_lang_msgpack` — 1 passing (Rust loads TS-emitted msgpack)
- `cargo test --test render_one_frame` — 1 passing (was previously broken)
- `cargo test --test render_multi_shader golden_frame` — 1 passing, reports 16 silently-broken shaders
- `pnpm test` (core) — 56 passing (6 new path tests)
- `pnpm test` (visualizer-poc, scoped) — 5 new veneta-routing tests passing

## Honest framing

This is roughly 1-2 days of engineering value delivered in one session. The remaining items in the audit total ~14-19 weeks of estimated work — they are individual focused engineering blocks, not "complete in one go" tasks. The deferral docs (Wave 2.1 NOTES, Wave 2.3 NOTES, this file) capture the next concrete steps so future sessions can pick up cleanly.
