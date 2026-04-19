# Dead Air: Remotion Render Handoff Notes

> Written 2026-04-19. For a new terminal session picking up the Veneta render.
> The Rust/wgpu renderer works locally but can't deploy to Vast.ai (Vulkan not exposed in Docker).
> Switching to Remotion for the Veneta cloud render.

---

## What Was Done (This Session)

### P0 Fixes — All Complete
1. **Stem data alignment** — Analysis files repointed from disc-track (`d1t01-analysis.json`) to song-named (`promised-land-1972-08-27-analysis.json`) in `data/tracks/`. These are correctly aligned with Demucs stems. The old disc-track files are quarantined at `packages/visualizer-poc/data/tracks-quarantine-DO-NOT-USE/`.
2. **luminous_cavern blocked** — Added to SHADER_BLOCKLIST + removed from dead air pool. Zero black frames.
3. **Song identity whitelist bypass** — `DEAD_CONCERT_SHADERS` whitelist no longer gates song identity preferred modes. 30 unique shaders now route (was 14). Changed at `generate-full-manifest.ts:1314`.
4. **song_boundaries emitted** — 20 entries with correct 3-set structure. Setlist corrected in `packages/visualizer-poc/data/setlist.json`.
5. **Setlist corrected** — Set 1 (tracks 1-9), Set 2 (10-14), Set 3 (15-20). Segue metadata: China Cat > Rider, Dark Star > El Paso > Sing Me Back Home.

### Manifest Generator Changes (`packages/renderer/generate-full-manifest.ts`)
- Analysis path resolution: `resolveAnalysisPath()` function tries song-named files first, falls back to disc-track ID
- Slug function: `song.title.toLowerCase().replace(/'/g, " ").replace(/[^a-z0-9]+/g, "-")`
- Song boundary crossfades: 2-second fade at each of 19 song boundaries (luminance_key for segues, dissolve for others). Boundary crossfade overrides section crossfades. Energy/brightness smoothed across boundary.
- Effect triggers: 14 post-process + 10 composited, hold/cooldown system, ~32% frame coverage
- Shader stripping: only referenced shaders included in manifest (35 used, 93 stripped)
- Song art: `SongArt_{trackId}` overlay in bottom-left, 18% scale, 25% max opacity, energy-faded
- SongTitle: inline SVG via `keyframe_svg` field, Georgia serif italic, fades in 1s, holds 8s, fades out by 11s
- FilmGrain/SmokeWisps: skipped from overlay schedule (no PNG exists)
- Logging: all silent catch blocks now log warnings

### Rust Renderer Changes (`packages/renderer/src/`)
- `effects.rs`: 14 post-process WGSL effects, all A+++ quality verified
- `composited_effects.rs`: 10 composited WGSL effects with additive blending pipeline
- `main.rs`: SVG + PNG overlay systems composite together (was else-if, now both run)
- `main.rs`: composited pipeline wired after effect pipeline
- `manifest.rs`: `composited_mode`, `composited_intensity` fields added
- Song boundary crossfade, intro/endcard all working locally

### What the Rust Renderer Has That Remotion Doesn't
- 14 post-processing effects (kaleidoscope, feedback, hypersaturation, chromatic split, trails, mirror, audio displacement, zoom punch, breath pulse, light leak, time dilation, moire, DoF, glitch)
- 10 composited effects (particles, caustics, celestial, tunnel, fire, ripples, strobe, geometric, liquid metal, concert poster)
- Custom "DEAD AIR" SVG letterform intro (15s)
- Custom endcard with setlist recap (10s)
- Song boundary crossfades (2s luminance_key/dissolve)
- SongTitle SVG overlay

### What Remotion Already Has (No Porting Needed)
- All GLSL shaders (same source files)
- SceneRouter with section-based routing
- Overlay rotation engine (75 active overlays)
- SongArtLayer (bottom-left poster with Ken Burns)
- Dead iconography watermark
- Film grain (GLSL postprocess)
- Song palette color grading
- Era grading (primal/classic/etc.)
- Stem-driven audio reactivity (via analysis JSON)
- CLAP semantic modulation
- DualShaderQuad transitions
- Remotion's own text rendering (React components)

---

## Data Locations

### Analysis Data (Correctly Aligned)
```
/Users/chrisgardella/dead-air/data/tracks/
  promised-land-1972-08-27-analysis.json    (14151 frames, 471.7s)
  sugaree-1972-08-27-analysis.json          (16735 frames, 557.8s)
  me-and-my-uncle-1972-08-27-analysis.json  (6252 frames, 208.4s)
  deal-1972-08-27-analysis.json             (8434 frames, 281.1s)
  ... (20 songs total)
```
These have: core audio (36 fields) + stem data (7 fields) + CLAP semantics (8 fields) = 51 fields per frame.

**Important:** The symlink at `packages/visualizer-poc/data/tracks` points to the OLD disc-track files. Remotion's `SongVisualizer.tsx` loads analysis via this symlink. You may need to repoint it or change how Remotion resolves analysis paths.

### Stems
```
/Users/chrisgardella/dead-air/data/stems/
  promised-land-1972-08-27/  (vocals.wav, drums.wav, bass.wav, other.wav)
  sugaree-1972-08-27/
  ... (20 songs, Dark Star stems are WRONG — Casey Jones audio)
```

### Setlist
```
/Users/chrisgardella/dead-air/packages/visualizer-poc/data/setlist.json
```
20 songs, 3 sets, segue metadata. Track IDs: d1t01-d1t09 (set 1), d2t01-d2t05 (set 2), d3t01-d3t06 (set 3).

### Song Art
```
/Users/chrisgardella/dead-air/packages/visualizer-poc/public/assets/song-art/veneta-72/
  d1t02.png through d3t07.png (WebP disguised as .png)
  show-poster.png
```
18/20 songs have art. Missing: d1t01 (Promised Land), d2t01 (Playing in the Band). Some images have incorrect title text baked in (AI-generated asset issue).

### Overlay PNGs
```
/Users/chrisgardella/dead-air/packages/renderer/overlay-pngs/
  590 files (286 regular + 22 SongArt_ + SVGs)
```

### Lyrics (Deferred — Not for Veneta Render)
```
/Users/chrisgardella/dead-air/packages/pipeline/data/lyrics/       (16 songs + 4 stubs)
/Users/chrisgardella/dead-air/packages/pipeline/data/lyrics-aligned/ (test output)
```
Alignment quality too low for display (67-85% on structured sections, 25% on codas). Infrastructure at `packages/pipeline/scripts/align_vocals.py`.

### R2 Cloud Storage
```
Bucket: deadair
Endpoint: https://4ec1acfd6d15cc97561afd38f1720a72.r2.cloudflarestorage.com
API Token: [REDACTED — ask Chris for the cfat_ token, created 2026-04-19 "DeadAir1"]
Account ID: 4ec1acfd6d15cc97561afd38f1720a72

Uploaded files:
  veneta-render/renderer-src.tar.gz     (119KB)
  veneta-render/manifest.json.gz        (247MB, gzipped)
  veneta-render/overlay-part-aa through ae  (5 × 90MB)
```
Note: These are for the Rust renderer manifest. Remotion doesn't use them. But the R2 bucket is available for Remotion assets if needed.

---

## Known Issues

1. **Dark Star stems are wrong** — Demucs was run on Casey Jones audio (373.9s) instead of Dark Star (1940s). Dark Star renders without stem-driven features. Demucs re-run blocked by local environment (torchcodec dependency issue). Don't touch the Demucs Python environment.

2. **Analysis symlink mismatch** — `packages/visualizer-poc/data/tracks` symlinks to disc-track files (d1t01-analysis.json etc.) which are duration-misaligned with stems. The Rust manifest generator uses `resolveAnalysisPath()` to find song-named files instead. Remotion may need a similar fix or the symlink repointed.

3. **Per-song stem normalization** — Each song's loudest moment = 1.0. Cross-song thresholds unreliable. Left as-is.

4. **Song art content** — Some AI-generated song art PNGs have wrong song titles baked into the image (e.g., Sugaree's art says "The Promised Land"). Asset issue, not code.

---

## Remotion Render Setup (What Needs to Happen)

### Step 1: Fix Analysis Path for Remotion
Remotion loads analysis via `packages/visualizer-poc/data/tracks/{trackId}-analysis.json`. These are the OLD misaligned disc-track files. Either:
- Repoint the symlink to a directory with correctly-named copies of the song-named files
- OR modify Remotion's data loading to use the song-named paths

### Step 2: Verify Remotion Renders Locally
```bash
cd packages/visualizer-poc
npx remotion render --composition SongVisualizer --props '...' --frames 0-60
```
Verify: correct shader, overlays visible, song art in bottom-left, audio-reactive.

### Step 3: Deploy to Vast.ai
The Cornell render used `scripts/vast-render.sh` and `scripts/cloud-bootstrap-vast.sh`. Same approach:
- 4-8 RTX 4090 instances
- Bootstrap: Node.js 22 + Chrome + pnpm + project deps
- Split by song or by frame range
- Renders via headless Chrome (no Vulkan needed)

### Step 4: Concatenate + Audio Mux
```bash
# Concatenate chunks
ffmpeg -f concat -safe 0 -i chunks.txt -c copy veneta-shaders.mp4

# Mux audio
ffmpeg -i veneta-shaders.mp4 -i show-audio.flac \
  -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart \
  "Grateful Dead - Veneta 8-27-72 - Full Show [4K] - Dead Air.mp4"
```

---

## Architecture Reference
- `DEAD-AIR-ARCHITECTURE.md` — Full 893-line system documentation
- `SILENT-FAILURE-AUDIT.md` — All silent failures found and fixed
- `docs/veneta-scope.md` — Render scope with deferred items

## Git State
All changes committed and pushed to `main` at `github.com/JackStrawNYC/dead-air`. Latest commit includes all P0 fixes, effect system, overlay wiring, song title SVG, and boundary crossfades.

## Vast.ai Account
- CLI: `vastai` installed at `/Library/Frameworks/Python.framework/Versions/3.13/bin/vastai`
- Authenticated: yes
- Balance: credits available
- All instances destroyed as of 2026-04-19 08:30 EDT

## Python Environments — DO NOT MIX
- **System Python** (`/Library/Frameworks/Python.framework/Versions/3.13/bin/python3`): Has librosa, demucs (recently installed, torchcodec uninstalled). Used for analyze_stems.py.
- **Alignment venv** (`packages/pipeline/.venv-align/`): Has WhisperX, torch 2.8.0. Completely isolated. Used for align_vocals.py.
- **Do not install packages into the system Python** — the Demucs environment is fragile.
