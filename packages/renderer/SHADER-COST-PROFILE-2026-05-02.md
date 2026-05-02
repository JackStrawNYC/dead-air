# Shader Cost Baseline — 2026-05-02

Apple M3 Pro, 640x360, 10 measure frames per shader (warmup discarded).
Source: `tests/shader_cost_profile.rs`. Re-run with
`cargo test --release --test shader_cost_profile -- --ignored --nocapture`.

Resolution chosen so even pathological shaders complete a frame; relative
ranking holds at higher resolutions but absolute ms scales with pixel count
(roughly 9x at 1080p, 36x at 4K).

Closes audit Debt #12 ("No GPU profiling — blind optimization"). This file
is the triage list for future shader-optimization passes.

## Tier counts

| Tier   | p95 budget    | Count | %    |
|--------|---------------|-------|------|
| OK60   | < 16.67 ms    | 80    | 63%  |
| OK30   | 16.67–33.33ms | 20    | 16%  |
| SLOW   | 33.33–66.67ms | 12    | 9%   |
| BUSTED | > 66.67ms     | 15    | 12%  |

## BUSTED — optimization candidates

Each of these takes the GPU > 4 seconds per frame at 4K. They will
single-handedly bottleneck a multi-instance render if the manifest hits
them often.

| Shader              | p50ms  | p95ms  | Notes |
|---------------------|--------|--------|-------|
| voronoi-flow        | 445.55 | 494.50 | top offender — review iteration count |
| psychedelic-garden  | 319.35 | 352.79 | |
| bioluminescence     | 261.02 | 265.23 | |
| volumetric-smoke    | 221.44 | 242.79 | volumetric raymarcher |
| smoke-rings         | 216.53 | 237.22 | |
| coral-reef          | 110.69 | 129.47 | |
| smoke-and-mirrors   | 104.41 | 116.53 | |
| flower-field        | 100.02 | 109.41 | |
| particle-nebula     |  95.49 | 104.66 | |
| memorial-drift      |  92.48 | 103.22 | |
| bloom-explosion     |  81.85 |  84.83 | |
| inferno             |  69.95 |  80.07 | |
| earthquake-fissure  |  68.29 |  72.94 | |
| lava-flow           |  68.20 |  77.60 | |
| desert-road         |  55.88 |  68.28 | |

## SLOW — borderline at 60fps@4K but acceptable at 30fps

river, fluid-light, particle-swarm, aviary-canopy, reaction-diffusion,
storm-vortex, cosmic-dust, deep-ocean, neural-web, morphogenesis,
mycelium-network, warm-nebula

## Methodology

- Wall-clock around `render_frame + read_pixels`. `read_pixels()` blocks
  until GPU completion, so this captures real GPU time (no need to plumb
  wgpu TIMESTAMP_QUERY through every encoder).
- 1 warmup frame, 10 measure frames per shader.
- 10 frames is small; expect ±10% noise on shaders < 5ms. Outliers in the
  BUSTED tier are robust — the cost gap to the next tier is > 5x.
