# Visualizer-POC Monolith Split — Plan

**Audit Tech Debt #10** — `visualizer-poc` is 250K LoC doing three jobs (Remotion compositions, manifest helper functions, overlay component library). Split.

## Proposed shape

```
@dead-air/visual-engine        (~80K LoC)
├── data/                       — song-identities, overlay-registry, era-presets, band-config
├── utils/                      — audio-reactive, climax-state, coherence, peak-of-show, ...
├── scenes/routing/             — scene-router, shader-variety, transition-affinity
└── shaders/                    — GLSL strings + shared/uniforms.glsl.ts

@dead-air/remotion-compositions  (~170K LoC)
├── Root.tsx, SongVisualizer.tsx, OverlayOnlyVisualizer.tsx
├── components/                 — all .tsx (overlays, song art, intro, endcard)
├── hooks/
└── entry.ts, overlay-entry.ts
```

The split point is **logic vs presentation.** `visual-engine` exports pure functions and data — no React, no Remotion. `remotion-compositions` exports React components that consume the engine.

## What would have to move

Two consumers depend on the visual-engine half today:
- `@dead-air/manifest-generator` already imports `../visualizer-poc/src/utils/...` and `../visualizer-poc/src/data/...` directly — those imports become `@dead-air/visual-engine/...` after the split.
- `OverlayOnlyVisualizer.tsx` and friends in remotion-compositions also import from utils/data.

Exports that are already declared in the package.json `exports` field:
```
"./shaders/*", "./utils/math", "./data/types", "./scenes/scene-registry"
```
These are the obvious public-API surface to keep stable through the move.

## Phase plan

### Phase A — Inventory (1 day)
- Build a graph of `data/` and `utils/` files: which import each other, which are imported from outside.
- Identify any circular deps — fix before the move.

### Phase B — Create `@dead-air/visual-engine` package skeleton (1 day)
- New `packages/visual-engine/{package.json,tsconfig.json,src/index.ts}`.
- Re-export types/utilities at well-defined paths.
- Empty for now.

### Phase C — Move files (3 days)
- Move `src/utils/`, `src/data/`, `src/scenes/routing/`, `src/shaders/` to `packages/visual-engine/src/`.
- Use `git mv` so history follows.
- Run a sed pass on remaining `visualizer-poc` files: `from "./utils/...` → `from "@dead-air/visual-engine/utils/..."`.
- Same for `manifest-generator`.

### Phase D — Type-check + tests (1 day)
- `pnpm type-check` across the monorepo. Iterate until green.
- Run the existing 326 visualizer-poc tests + 5 manifest-generator smoke tests.

### Phase E — Manifest output equivalence (1 day)
- Generate one Veneta song's manifest before the split (saved aside) and after.
- Diff: must be byte-equivalent.

## Rough size estimate

~7 working days. Audit estimates "2 weeks" because import-graph rewrites always have surprises.

## Risk

- Remotion has its own bundler that resolves imports at composition build time. Cross-package imports might trip on it.
- The `OverlayOnlyVisualizer` and the standard `SongVisualizer` both have data dependencies that need to keep working under both Remotion (browser) and the manifest generator (Node).

## Why deferred from this session

This isn't a one-and-done refactor; it's an import-graph rewrite that needs time to run, hit surprises, fix, repeat. Rolling it into a session that also did Wave 1+2+3 would create a debugging burden across too many surface area.

## Acceptance criteria

- [ ] `pnpm install && pnpm type-check && pnpm test` green across all packages
- [ ] Manifest output for one Veneta song byte-equivalent before/after
- [ ] No file imports across both `@dead-air/visual-engine` and `@dead-air/remotion-compositions` (clean direction)
