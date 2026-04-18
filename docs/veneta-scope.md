# Veneta 8/27/72 (Sunshine Daydream) — Render Scope

## Active Systems

- Rust/wgpu GPU renderer at 4K 60fps
- 30 unique shaders (song identity routing + energy pool)
- 14 post-processing effects + 10 composited effects (~32% frame coverage)
- Song boundary crossfades (2s luminance_key for segues, dissolve for others)
- Stem-aligned audio analysis (19/20 songs, Dark Star stems broken)
- 8 CLAP semantic fields (100% coverage from song-named analysis)
- Intro (15s), chapter cards (3s per song), endcard (10s)
- Overlay system (75 active overlays, audio-reactive transforms)

## Deferred

- **Lyric display — DEFERRED.** Tested but source audio doesn't support sacred-line accuracy. WhisperX alignment on Demucs-isolated vocal stems achieves ~67-85% strict confidence on structured song sections but only ~25% on dense live codas/jams (Sugar Magnolia Sunshine Daydream coda). Below the sacred-display threshold for a production render. Infrastructure exists at `packages/pipeline/scripts/align_vocals.py` and is ready for future shows with cleaner vocal separation. Future shows may support.

- **Dark Star stem separation.** Demucs stems for Dark Star are from wrong audio file (Casey Jones). Re-run blocked by local Demucs environment issues. Dark Star renders without stem-driven features (zero stem signal).

## Known Issues

- Per-song stem normalization (each song's max = 1.0) makes cross-song thresholds unreliable
- 107 of 128 shaders in manifest are never referenced (payload waste)
- `veneta-routing.ts` show-specific shader curation is dead code (identity routing now bypasses it)
