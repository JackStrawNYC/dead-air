# Silent Failure Audit: Veneta Pipeline
> Generated 2026-04-18. Report only — no behavior changes.

## Summary Table

| # | Issue | Severity | Firing on Veneta? | Affected Frames |
|---|-------|----------|-------------------|----------------|
| 1 | 9 try/catch blocks in analyzeFrame() | LOW | **No** — all 13 functions succeed | 0 |
| 2 | 6 silent catch blocks in batch precompute | LOW | **No** — 0 failures across all songs | 0 |
| 3 | Song identity preferred modes fully blocked | **HIGH** | **Yes** — 3/3 songs with identities fall through | ~32,182 frames (Sugaree + Deal + Bertha) |
| 4 | `luminous_cavern` shader compile failure → black frames | **CRITICAL** | **Yes** — 5,251 frames will render black | 5,251 (0.9%) |
| 5 | Overlay PNG directory | OK | **No** — 286 PNGs loaded correctly | 0 |
| 6 | Missing shader_id / secondary_shader_id refs | OK | **No** — all refs exist in shaders map | 0 |
| 7 | Stem data (drums, vocals) completely missing | **CRITICAL** | **Yes** — 0% of frames have real stem data | 565,954 (100%) |
| 8 | CLAP semantic data partially missing | MEDIUM | Partial — `semantic_psychedelic` only 39.9%, `semantic_chaotic` only 7.1% | ~340K frames missing psychedelic |
| 9 | `song_boundaries` field missing | **HIGH** | **Yes** — field absent from manifest | Chapter cards won't work |
| 10 | `motion_blur_samples` present and correct | OK | **No** — field present, values [1, 2, 4] | 0 |
| 11 | `stem_bass` fallback masking missing data | MEDIUM | **Yes** — shows 100% but is regular bass, not stem | 565,954 (misleading) |

---

## Detailed Findings

### 1. try/catch blocks in analyzeFrame() (lines 255-299)

**File:** `packages/renderer/generate-full-manifest.ts:255-299`

13 analysis functions wrapped in try/catch with `failures.push()`:

| Function | Line | Default on Throw | Firing? |
|----------|------|-----------------|---------|
| `classifyStemSection()` | 255 | `"verse"` | No |
| `detectSolo()` | 256 | `{isSolo: false}` | No |
| `computeDrumsSpacePhase()` | 266/272 | `null` | No |
| `climaxModulation()` | 267/274 | `{satOffset:0, brightOffset:0, bloomOffset:0}` | No |
| `detectStemInterplay()` | 269 | `null` | No |
| `computeCoherence()` | 270 | `{isLocked: false, score: 0}` | No |
| `computeITResponse()` | 271 | `{forceTranscendentShader: false}` | No |
| `computeClimaxState()` | 273 | `{phase: "idle", intensity: 0}` | No |
| `computeReactiveTriggers()` | 275 | `{triggered: false, triggerType: null, shaderPool: []}` | No |
| `detectGroove()` | 278-285 | `{type: "pocket", motionMult: 1.0}` | No |
| `detectJamCycle()` | 286 | `{phase: "setup", progress: 0, isDeepening: false}` | No |
| `getSectionVocabulary()` | 287 | default vocab object | No |
| `computeNarrativeDirective()` | 288-299 | default narrative | No |

**Status:** These DO log via `failures.push()` on the first frame (lines 302-308). Output: `[OK] All 13 analysis functions succeeded` for every Veneta song.

**Logging already exists** for these (logged per-song). No additional logging needed.

### 2. Silent catch blocks in batch precompute (lines 1121, 1158-1161)

**File:** `packages/renderer/generate-full-manifest.ts:1121, 1158-1161`

| Function | Line | Default on Throw | Firing? |
|----------|------|-----------------|---------|
| `batchComputeCoherence()` | 1121 | All frames `{isLocked: false, score: 0}` | No |
| `detectStemInterplay()` | 1158 | `null` | No |
| `computeReactiveTriggers()` | 1159 | `{triggered: false, ...}` | No |
| `detectJamCycle()` | 1160 | `{phase: "setup", progress: 0, ...}` | No |
| `computeClimaxState()` | 1161 | `{phase: "idle", intensity: 0}` | No |

**Status:** 0 failures on Veneta. Precompute neutral-defaults: `interplay=0, reactive=0, jamCycle=0, climax=0` for every song.

**Logging added** by this audit (logs on first frame failure + batch summary counts). No behavior change.

### 3. Song identity preferred modes silently blocked

**File:** `packages/renderer/generate-full-manifest.ts:1276-1280`

Only 3 of 20 Veneta songs have song identities with `preferredModes`. All 3 fall through:

| Song | Preferred Modes | Blocked Modes | Dead-Filtered | Result |
|------|----------------|---------------|--------------|--------|
| **Sugaree** | `protean_clouds, nimitz_aurora, scarlet_golden_haze, aurora` | `protean_clouds` (×3), `scarlet_golden_haze` | 0 match DEAD_CONCERT_SHADERS | **FALLTHROUGH** → energy pool |
| **Deal** | `fire_mountain_smoke, protean_clouds, st_stephen_lightning, deep_ocean, aurora, volumetric_clouds, cosmic_voyage` | `fire_mountain_smoke, protean_clouds, st_stephen_lightning, volumetric_clouds, cosmic_voyage` | 0 match DEAD_CONCERT_SHADERS | **FALLTHROUGH** → energy pool |
| **Bertha** | `protean_clouds, fire_mountain_smoke, st_stephen_lightning, deep_ocean, aurora, volumetric_clouds, cosmic_voyage` | `protean_clouds, fire_mountain_smoke, st_stephen_lightning, volumetric_clouds, cosmic_voyage` | 0 match DEAD_CONCERT_SHADERS | **FALLTHROUGH** → energy pool |

**Root cause:** Song identity preferred modes were authored before the DEAD_CONCERT_SHADERS filter was added. The identity shaders (`protean_clouds`, `aurora`, `deep_ocean`) are not in the 9-shader Dead-concert whitelist, so even when they pass the blocklist, they fail the `DEAD_CONCERT_SHADERS.has(m)` filter.

**No logging exists.** Song visual intent is silently lost.

### 4. `luminous_cavern` shader compile failure → black frames

**File:** `packages/renderer/src/main.rs:590-603`

**Trigger:** `luminous_cavern` GLSL contains `snoise()` function call, but `snoise` is not defined in the shader string embedded in the manifest. Naga transpilation fails with: `GLSL parse error in luminous_cavern: Unknown function 'snoise'`

**Affected frames:** 5,251 frames (0.9% of 565,954 total) reference `luminous_cavern` as `shader_id`.

**Current behavior:** Rust renderer writes a solid black frame + logs `WARN: frame N black (shader luminous_cavern not compiled)` to stderr. A/V sync maintained but video has ~3 minutes of black scattered across the show.

**Logging exists** — both at compile time (line 434: `WARN: luminous_cavern failed: ...`) and at render time (line 603).

### 5. Overlay PNG directory

**File:** `packages/renderer/src/main.rs:449-456`

**Status:** Directory exists at `packages/renderer/overlay-pngs/` with **286 PNG files** loaded. No issue.

### 6. Shader/secondary_shader_id reference validation

**Manifest scan results:**
- 128 shaders in `manifest.shaders` map
- 14 unique `shader_id` values in frames — **all present in map**
- 18 unique `secondary_shader_id` values in frames — **all present in map**
- **No misses.** Zero missing references.

### 7. Stem data completely missing

**CRITICAL FINDING.**

**File:** Analysis JSONs at `packages/visualizer-poc/data/tracks/d1t01-analysis.json` (and all 20 songs)

The Veneta analysis JSONs contain **zero stem fields**. Fields `stemBassRms`, `stemDrumOnset`, `stemDrumBeat`, `stemVocalRms`, `stemVocalPresence`, `stemOtherRms` are all absent.

**Root cause:** `analyze_stems.py` was never run on Veneta audio. Demucs stem separation may have been run (stems may exist as WAVs) but the merge step that adds per-frame stem features to analysis JSONs was not executed.

**Manifest impact:**

| Manifest Field | Source | Actual Value | Expected Value |
|---------------|--------|-------------|----------------|
| `stem_bass` | `stemBassRms \|\| bass` | Regular `bass` (fallback) | Isolated bass stem RMS |
| `stem_drums` | `stemDrumOnset` | **0.0** (100% of frames) | Drum onset strength |
| `vocal_energy` | `stemVocalRms` | **0.0** (100% of frames) | Vocal stem RMS |
| `vocal_presence` | `stemVocalPresence > 0.5` | **0** (100% of frames) | 1 when vocals present |
| `drum_onset` | `stemDrumOnset` | **0.0** | Drum onset |
| `drum_beat` | `stemDrumBeat` | **0.0** | Drum beat |
| `other_energy` | `stemOtherRms` | **0.0** | Other stem RMS |
| `other_centroid` | `stemOtherCentroid` | **0.0** | Other spectral centroid |

**Downstream effects of zero stems:**
- All stem-driven shader routing is disabled (detectStemInterplay returns null data)
- Overlay density modifiers based on `stemSectionType` (vocal/solo/quiet/jam) all fire as "instrumental"
- Vocal-reactive features (vocalWeight, vocalPresence gating) do nothing
- Drum-reactive camera jolt (uniforms.rs) never fires (threshold 0.5, value always 0.0)
- `stem_bass` LOOKS populated but is misleading — it's just the regular mixed bass, not the isolated instrument

### 8. CLAP semantic data partially populated

| Field | Non-zero % | Notes |
|-------|-----------|-------|
| `semantic_psychedelic` | 39.9% | Only fires on ~40% of frames |
| `semantic_cosmic` | 100.0% | Fully populated |
| `semantic_aggressive` | 89.9% | Good coverage |
| `semantic_tender` | 100.0% | Fully populated |
| `semantic_rhythmic` | 100.0% | Fully populated |
| `semantic_ambient` | 100.0% | Fully populated |
| `semantic_chaotic` | 7.1% | Very sparse — only fires during extreme moments |
| `semantic_triumphant` | 100.0% | Fully populated |

**Assessment:** This is likely correct CLAP behavior — `semantic_chaotic` and `semantic_psychedelic` ARE sparse because most music moments don't score high on these categories. The 0% values represent legitimate low scores, not missing data. **Not a bug.**

### 9. `song_boundaries` field missing

**File:** `packages/renderer/src/manifest.rs:38` — `song_boundaries: Option<Vec<SongBoundary>>`

The manifest does NOT contain `song_boundaries`. This means `--with-chapter-cards` will produce zero chapter cards.

**Root cause:** `generate-full-manifest.ts` does not emit this field. Need to check if it's supposed to — grep shows `song_boundaries` is referenced in the manifest struct but never written by the TS generator.

### 10. `motion_blur_samples` correctly present

Field present in 100% of frames. Values observed: `[1, 2, 4]` — adaptive as designed (1=quiet, 2=medium, 4=climax).

### 11. `stem_bass` fallback masking

**File:** `packages/renderer/generate-full-manifest.ts:636`

```typescript
stem_bass: L("stemBassRms") || bass,
```

The `|| bass` fallback means `stem_bass` shows 100% non-zero, but it's the **mixed** bass signal, not the isolated bass instrument. This masks the fact that stem data is completely missing. A downstream consumer checking `if (stem_bass > 0)` would think stems are available when they're not.

---

## Additional Silent Catch Blocks Found

| File | Line | Operation | Catch Behavior | Logging Added? |
|------|------|-----------|---------------|----------------|
| `generate-full-manifest.ts` | 78 | Shader GLSL import | Swallow entirely | **YES** (this audit) |
| `generate-full-manifest.ts` | 220 | `computeAudioSnapshot()` | Fall back to manual Gaussian smoothing | **YES** (this audit) |
| `generate-full-manifest.ts` | 1121 | `batchComputeCoherence()` | All frames neutral | **YES** (this audit) |
| `generate-full-manifest.ts` | 1158 | `detectStemInterplay()` per-frame | `null` | **YES** (this audit) |
| `generate-full-manifest.ts` | 1159 | `computeReactiveTriggers()` per-frame | No triggers | **YES** (this audit) |
| `generate-full-manifest.ts` | 1160 | `detectJamCycle()` per-frame | Phase "setup" | **YES** (this audit) |
| `generate-full-manifest.ts` | 1161 | `computeClimaxState()` per-frame | Phase "idle" | **YES** (this audit) |

All 7 silent catch blocks now have logging. Behavior unchanged.

---

## Recommendations (Not Implemented — Report Only)

1. **CRITICAL: Run `analyze_stems.py` on all 20 Veneta songs** — stems may already be separated but not analyzed. This would populate drum/vocal/other features for 565K frames.

2. **CRITICAL: Fix `luminous_cavern` shader** — add `snoise` function definition to its GLSL, or add it to SHADER_BLOCKLIST to prevent 5,251 black frames.

3. **HIGH: Update song identity preferred modes** — Sugaree/Deal/Bertha identities reference shaders not in DEAD_CONCERT_SHADERS. Either expand the whitelist or update identities.

4. **HIGH: Emit `song_boundaries` from manifest generator** — required for chapter cards to work.

5. **MEDIUM: Remove `stem_bass` fallback masking** — change `L("stemBassRms") || bass` to `L("stemBassRms") ?? 0` so missing stem data is visible, not masked.

6. **LOW: Validate all shader_ids at manifest write time** — add pre-flight check before writing manifest.
