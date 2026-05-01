# Uniform Schema Codegen — Status & Plan

**Audit Top Opportunity #2 / Tech Debt #3** — eliminate the 4-file (Rust struct, TypeScript packer, GLSL declarations, manifest writer) hand-coordinated uniform layout.

## Current state (May 2026)

The uniform buffer is a 656-byte std140 block. Three files must agree on field order and offsets:

- `packages/renderer/src/uniforms.rs` — 462 lines, hand-written `write_f32(&mut buf, offset, value)` calls per field
- `packages/visualizer-poc/src/shaders/shared/uniforms.glsl.ts` — 190 lines of GLSL declarations
- `packages/manifest-generator/generate-full-manifest.ts` — populates `FrameData` fields

Current safeguards: none. A misaligned offset corrupts every subsequent uniform silently.

## Proposed schema

Single source of truth: `packages/renderer/uniforms/schema.toml` with entries like:

```toml
[[uniform]]
name = "uTime"
type = "float"
offset = 0
group = "time"
description = "Wall-clock seconds since render start"

[[uniform]]
name = "uContrast0"
type = "vec4"
offset = 160
group = "spectral"
description = "Spectral contrast bands 0-3"
```

A `build.rs` (or a tsx script) emits:

1. Rust `#[repr(C)] struct Uniforms` + a `pack(frame, &mut bytes)` function — replaces uniforms.rs
2. TypeScript packer used by the manifest generator (eliminates `as any` casts)
3. GLSL declaration block — replaces sharedUniformsGLSL

## Safe migration path

1. Phase A — write the schema by parsing the existing Rust comments (auto-extract).
2. Phase B — generate the Rust struct, side-by-side with the existing manual one, assert byte-equivalence in CI.
3. Phase C — generate the GLSL block, diff against the existing string, assert equivalence.
4. Phase D — switch the manifest generator to import the schema-typed packer.
5. Phase E — delete the hand-written Rust + GLSL once tests have been green for a render.

## Why deferred

Doing this safely requires the byte-equivalence test infrastructure first, plus a render of a known frame to verify pixel parity. That's ~1 week of focused work. Not appropriate for the same session as the broader Wave 1 cleanup.

## Acceptance criteria

- [ ] Adding a new uniform requires editing only schema.toml
- [ ] CI fails if Rust struct, TS packer, and GLSL declarations drift
- [ ] Schema-driven render produces byte-identical frames to the legacy path on at least one Veneta scene
