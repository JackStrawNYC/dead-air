# Live Rust Renderer Mode — Plan

**Audit Top Opportunity #10** — make the Rust renderer drive a real-time projection from a live audio stream, not just from a pre-baked manifest.

## Why this is wanted

VJ Mode (`packages/vj-mode/`) already does live visuals in the browser via WebGL. But it can't match the production renderer's quality (no bloom, no film grain, no overlay system). The audit's vision: take the Rust renderer's quality and make it run frame-by-frame from a live audio feed.

Revenue argument: a "VJ-quality live tour visualizer" is a sellable product. Pre-baked rendering isn't.

## Architecture change required

Today:
```
audio file → Python analysis (offline) → manifest → Rust renderer → MP4
```

Live:
```
mic / line in → real-time DSP → uniforms ring buffer ←→ Rust renderer → display
```

Key swaps:
- **Manifest → in-process state.** No JSON ingest. Renderer reads from a shared memory ring of `FrameData` produced by an audio thread.
- **Audio analysis → real-time WebAudio-style DSP.** Library options: `cpal` for input, `aubio-rs` or hand-rolled DSP for beat/onset detection, `realfft` for FFT.
- **Routing decisions → reactive state machine.** SceneRouter today peeks at the future (whole song known); live mode can only see the past. VJ Mode already has this — port the decision logic.
- **Display target → window or projector.** Today wgpu writes to an offscreen texture → FFmpeg pipe. Live mode needs a `winit` window + presentation surface.

## Phase plan

### Phase A — Frame budget validation (DONE 2026-05-01)
`tests/live_mode_budget.rs` measures p50/p95/p99 per representative shader at 1080p on the target hardware. Run with `cargo test --release --test live_mode_budget -- --ignored --nocapture`.

Initial measurements on Apple M3 Pro:

| Tier        | Shader            | p50 ms | p95 ms | Verdict |
|---|---|---:|---:|---|
| cheap       | (cosmic-voyage)   | 5.1    | 5.2    | OK60    |
| expensive   | fractal-temple    | 20.3   | 21.9   | ok30    |
| expensive   | mandala-engine    | 82.6   | 85.6   | TOO SLOW |
| volumetric  | protean-clouds    | 61.4   | 62.9   | TOO SLOW |
| volumetric  | aurora            | 153.7  | 157.1  | TOO SLOW |
| volumetric  | deep-ocean        | 258.7  | 270.0  | TOO SLOW |
| volumetric  | volumetric-smoke  | 1778.6 | 1800.5 | catastrophic (1.8s/frame) |

**Conclusions:**
1. Live mode at 1080p/60fps is feasible only for the cheap tier (~30% of catalog).
2. The expensive tier (~40%) needs `--scene-scale 0.5` (Wave 3.3) to fit budget.
3. The volumetric tier (~30%) is fundamentally too costly on M3 Pro — must be **excluded** from the live shader pool, OR the live mode must drop to 30fps.
4. Buying a desktop GPU (RTX 4090) would shift the picture. The benchmark should be re-run on target hardware before serious live-product work.

This data informs phase D (reactive scene router) — the live router must filter out volumetric shaders entirely on this class of hardware.

### Phase B — Audio input + DSP (1 week)
- `cpal` input from default device.
- Real-time onset/beat detection — `aubio-rs` is pragmatic; could later port `vj-mode/audio/BeatDetector` to native Rust.
- Output: 30Hz ring buffer of `LiveFeatures { rms, bass, mids, highs, onset, beat, ... }`.

### Phase C — Live FrameData synthesis (3 days)
- New `live_frame.rs`: maps `LiveFeatures` → `FrameData`, derives smoothed/derived fields (slow_energy, fast_bass) from rolling history.
- The reactive state (climax, coherence, jam cycle) needs an online variant — VJ Mode has these in TS, port to Rust.

### Phase D — Reactive scene router (1 week)
- Port `vj-mode/engine/SceneTransitionEngine` decision logic to Rust.
- Output: `(shader_id, secondary_shader_id?, blend_progress?)` per frame from live history.
- Must NOT crash on novel input — degrade gracefully to a known-safe shader.

### Phase E — Window + main loop (3 days)
- `winit` window, wgpu Surface, double-buffered presentation.
- Hot-keys: shader bypass, force-shader, panic-cut to black.
- Optional: WebSocket remote like VJ Mode, MIDI input passthrough.

### Phase F — Production hardening (3 days)
- Pre-cache every shader pipeline at startup (no compilation during performance).
- Watchdog: if a frame takes >50ms, fallback to a known-cheap shader for the next 5s.
- Recording: optional frame-tap to MP4 in parallel with display.

## Rough size estimate

~3-4 weeks per audit, plus ~1 week of stage-environment hardening that's hard to estimate without trying it once.

## Why deferred from this session

- Architecturally distinct from the offline render path (eliminates the manifest layer).
- Needs a live audio environment to validate; not testable from a CI machine.
- Should land after Wave 4.1 (GPU overlay compositing) so the live path isn't bottlenecked by CPU composite.

## Acceptance criteria

- [ ] `dead-air-renderer --live` opens a window driving 1080p/60fps from default audio input
- [ ] Frame budget held: 95th percentile <16ms over a 30-minute live run
- [ ] Hot-keys for emergency shader override and panic-cut
- [ ] Recording mode produces a watchable MP4 in parallel with live display
