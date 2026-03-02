# External Dependencies — Actions Required

These items require GPU compute, API calls, or manual asset creation that cannot be done in code alone.

## 1. WhisperX Lyric Alignment (GPU Required)

**What:** Run WhisperX forced alignment on all 20 concert audio tracks to generate per-word timestamps.

**Why:** The lyric display system (`LyricDisplay.tsx`) and lyric trigger system (`LyricTriggerLayer.tsx`) are fully built and wired, but depend on real alignment data. Current test data is synthetic/heuristic.

**Command:**
```bash
# Requires CUDA GPU or Apple MPS
pnpm deadair analyze --whisperx --show 1977-05-08
# Or manually per track:
python packages/pipeline/scripts/align_lyrics.py \
  --audio public/audio/s2t02-scarlet-begonias.mp3 \
  --lyrics data/lyrics/scarlet-begonias.json \
  --output data/lyrics/s2t02-alignment.json
```

**Estimated time:** 2-3 hours GPU compute for 20 tracks
**Cost:** Free (local GPU) or ~$5 (cloud GPU instance)

---

## 2. Song-Specific Video Generation (Replicate API)

**What:** Generate 13 additional song-specific atmospheric videos via Replicate SVD to cover all 23 setlist songs.

**Current coverage:** 10/23 songs have dedicated video clips (520MB total).
**Missing:** Loser, El Paso, They Love Each Other, Deal, Supplication, Brown Eyed Women, Mama Tried, Row Jimmy, Dancin' in the Street, Estimated Prophet, St. Stephen, Morning Dew (separate from general), One More Saturday Night.

**Command:**
```bash
pnpm deadair generate-assets --type=video --show 1977-05-08 --missing-only
```

**Estimated cost:** $15-20 via Replicate
**Estimated time:** 2-3 hours generation

---

## Notes

Both dependencies are non-blocking for rendering — the system gracefully falls back:
- Without WhisperX: no lyric display (acceptable)
- Without song videos: Ken Burns on song art + shader visualization (acceptable but less varied)
