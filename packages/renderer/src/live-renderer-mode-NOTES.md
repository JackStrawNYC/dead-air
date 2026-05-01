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

### Phase A — Frame budget validation (1 week)
- Benchmark: render a representative shader at 1080p / 60fps on the target hardware. Confirm <16ms total budget achievable.
- Identify shaders that bust budget; they need either LOD downgrade (Wave 3.3) or exclusion from live pool.

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
