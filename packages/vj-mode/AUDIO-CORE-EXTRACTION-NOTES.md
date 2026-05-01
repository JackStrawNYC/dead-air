# @dead-air/audio-core — Extraction Plan

**Audit Top Opportunity #7 / Tech Debt #4** — eliminate duplicated audio-analysis math between `vj-mode` and `visualizer-poc`.

## What's actually duplicated

After inspection, the two implementations are **conceptually parallel but not literally duplicated**:

- `vj-mode/src/audio/` — real-time WebAudio. Class-based with rolling state buffers (e.g., `BeatDetector` keeps a `Float32Array` onset history and emits frame-by-frame). Built for the live VJ context where you can only see the past, never the future.
- `visualizer-poc/src/utils/` — offline librosa-derived analysis. Functional (`computeCoherence(frames, idx)`) with full frame-history access and lookahead.

These are **different enough that a naïve merge would break one or the other.** The fix isn't "delete one, use the other," it's "design a shared interface that both can implement."

## Genuinely shareable pieces

These functions are pure math with no real-time/offline distinction and could be extracted today with no risk:

| Function | Currently in | Notes |
|---|---|---|
| Gaussian smoothing kernel | `visualizer-poc/utils/gaussian-smoother.ts` | Pure window-weighted average |
| Exponential decay / EMA | both | Single-line, but useful for cross-package consistency |
| Onset-to-beat threshold | both (different shapes) | Worth standardizing |
| Chroma → hue mapping | `visualizer-poc/utils/chroma-palette.ts` | Currently used by both ecosystems |
| Energy gate / hysteresis | `visualizer-poc/utils/audio-reactive.ts` | |

## Proposed package shape

```
packages/audio-core/
├── package.json (no deps; pure TS)
├── src/
│   ├── index.ts              — re-exports
│   ├── kernels.ts            — gaussian, ema, onset detection
│   ├── chroma.ts             — chroma → hue, chroma → palette
│   ├── beat.ts               — adaptive-threshold detection (offline + online variants)
│   ├── energy.ts             — gate, hysteresis, smoothing
│   └── interfaces.ts         — `AudioFeed` (online stream) vs `FrameSeries` (offline array)
└── tests/                    — same tests imported into both consumers
```

## Status

**Phase A done (2026-05-01):** `@dead-air/audio-core` package created and shipped with 5 modules + 89 passing tests.

  - `math.ts` — smoothstep, lerp, clamp + variants
  - `hash.ts` — djb2 string hash + variants
  - `seeded-random.ts` — mulberry32 + LCG + seededShuffle
  - `ring-buffer.ts` — fixed-capacity circular buffer
  - `gaussian-smoother.ts` — incremental Gaussian smoother

The originals in `visualizer-poc/src/utils/` are still in place; nothing has switched over yet. Consumer migration is phase B.

**Phase B (consumer migration) — still deferred (2-4 days):**

  - `visualizer-poc` add `@dead-air/audio-core` as a dependency, replace
    `from "./math"` with `from "@dead-air/audio-core/math"` etc.
    Verify Remotion bundler resolves the package (use a Veneta render diff).
  - `vj-mode` consume the same primitives where the analyzer classes
    currently re-implement them in-line.
  - `manifest-generator` consume directly (it imports utils from
    visualizer-poc today; switching to the shared package decouples it).
  - Once both consumers are switched, delete the originals from
    `visualizer-poc/src/utils/`.

A manifest-output equivalence check on one Veneta song before/after is the gate before deleting the originals.

## Acceptance criteria

- [ ] Both `vj-mode` and `visualizer-poc` import beat/onset/chroma math from `@dead-air/audio-core`
- [ ] Tests in audio-core pass; consumer tests still pass after migration
- [ ] Manifest output for one Veneta song is byte-equivalent before/after
