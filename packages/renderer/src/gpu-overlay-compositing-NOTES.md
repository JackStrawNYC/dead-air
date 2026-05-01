# GPU Overlay Compositing — Plan

**Audit Top Opportunity #8** — replace the CPU `overlay_cache::composite_instance` per-frame loop with a single GPU pass that draws all overlay instances from a texture atlas.

## Why this is wanted

Current state (audit Section 3, "Overlay Compositing: CPU-Side"):
- After GPU readback, every overlay instance for the current frame is composited on CPU via `composite_transformed` (pixel loop with sampling, alpha blend, blend modes).
- For overlay-heavy frames (10+ instances at 4K) this is the dominant CPU cost — measurable in render budget.
- Adding new blend modes or animated overlays means writing more CPU code.

Goal: upload overlay PNGs to GPU once at startup, then composite per-frame in a single shader pass with one draw call per instance (or instanced rendering for many).

## Phase plan

### Phase A — Atlas builder (CPU-side, no GPU changes)
- New `overlay_atlas.rs`: takes the overlay PNG cache, packs into a single 4096x4096 RGBA8 atlas using a simple skyline / shelf packer (see `texture_packer` crate).
- Emits `AtlasEntry { overlay_id, uv_min, uv_max, src_size }`.
- Test: pack 87 representative overlays, assert no overlap and reasonable utilization (>60%).

### Phase B — GPU upload + bind group
- Atlas texture lives on GPU as `Rgba8Unorm`, one wgpu::Texture for the entire show.
- Bind group layout: { sampler, atlas_texture }.

### Phase C — Compositing pipeline
- Vertex shader: takes per-instance buffer (transform matrix + atlas UV rect + opacity + blend mode index) and emits 4 vertices per overlay.
- Fragment shader: samples atlas, applies opacity + blend mode (Screen / Normal / Multiply matches current CPU impl), writes to output texture.
- Use `instanced_draw` for batching multiple overlays in one call.

### Phase D — Hot-path swap
- Add `--gpu-overlays` flag (default off during validation).
- When enabled, after the postprocess pass, run the overlay compositing pass instead of CPU `composite_instance`.
- Skip the CPU readback → composite → re-upload cycle.

### Phase E — Pixel equivalence test
- Render one Veneta frame through CPU path, render same frame through GPU path, RMSE < 1.0/255 per channel.
- This is the gate before flipping the default.

## Rough size estimate

| Phase | Files touched | Time |
|---|---|---|
| A | new `overlay_atlas.rs`, `overlay_cache.rs` (refactor cache) | 2 days |
| B | `gpu.rs` (atlas binding) | 1 day |
| C | new `overlay_pass.rs` + WGSL | 3 days |
| D | `render_loop.rs`, `main.rs` flag | 1 day |
| E | new test + golden frame compare | 1-2 days |

Total: ~8-10 working days. Matches audit's "2 weeks" estimate.

## Why deferred from this session

- The CPU compositor isn't the bottleneck on Mac dev (shaders are 60-80% of budget per audit Section 13). GPU compositing only matters at the high end.
- Phase A through E need to ship together — partial implementation leaves two compositor paths to maintain.

## Acceptance criteria

- [ ] `--gpu-overlays` flag composites all overlays via single GPU pass
- [ ] Pixel-equivalence test passes (RMSE < 1.0/255 per channel) on a Veneta frame
- [ ] Overlay-heavy frame budget improved by ≥20% in a render benchmark
- [ ] CPU `composite_instance` retained behind a `--cpu-overlays` flag for fallback
