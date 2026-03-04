# Dead Air Pre-Render Audit Tracker

## CRITICAL (Fix Before Render)

- [x] **1. Component Timing Collisions** — SongDNA timing delayed to frame 210 (after song art fade). No spatial overlap with SongTitle or MilestoneCard.
- [x] **2. 12/21 Songs Missing songArt** — Verified: all 20 songs have songArt entries AND files exist on disk. False positive.
- [x] **3. Parametric Overlays Auto-Enable Without Curation** — Schedule is the real curation gate. Added clarifying comment.
- [x] **4. SetlistScroll Energy Gate Too Aggressive** — Threshold raised to 0.28; jitter seeding made static per song.

## HIGH PRIORITY (Render Quality)

- [x] **5. Shader Performance — Liquid Light Heavy** — Background pass reduced from fbm (4 octaves) to fbm3 (3 octaves).
- [x] **6. Concert Beams — Crowd Silhouette Repetition** — Noise frequencies 8→20 and 25→50, added 3rd octave at 80.
- [x] **7. SceneCrossfade is Linear Only** — Added Easing.inOut(Easing.ease) to both opacity curves.
- [x] **8. Film Grain via SVG (400 dots)** — Removed sparse dots. Increased feTurbulence: baseFreq 0.65→0.75, octaves 3→4, opacity 0.4→0.5.
- [x] **9. Energy Threshold Calibration** — calibrateEnergy() auto-calibrates per-song via p10/p90 percentiles. Wired into EnergyEnvelope + overlay rotation.

## MEDIUM PRIORITY (Dead Fan Experience)

- [x] **10. Song-Specific Scene Routing Intelligence** — Auto-variety for long songs: alternate sections get complementary shader modes when no sectionOverrides exist.
- [x] **11. Segue Visual Continuity** — Skip song art + overlay gate during segue-in. Overlays start immediately for seamless visual flow.
- [x] **12. Drums/Space Deserves More** — Lowered jam evolution threshold to 3min for Drums/Space. isDrumsSpace flag passed to computeJamEvolution.
- [x] **13. ConcertInfo Timing May Miss Short Songs** — Added safety: skip for songs <30s, proportionally reduce delay for shorter songs.
- [x] **14. Setlist Jitter Animates Per Frame** — Fixed in #4: seed on dateSeed*313 (static per song).
- [x] **15. show-context.json Data Accuracy** — Fixed: Loser 1967→1971, TLEO 1972→1973, Deal 1972→1971, Mama Tried 1978→1969.

## OPPORTUNITIES FOR ENHANCEMENT

- [x] **16. Venue-Specific Atmosphere** — Added venueType to setlist.json (arena for Barton Hall). EnergyEnvelope vignette now modulated by venue type.
- [x] **17. Signature Moment Markers** — Added SignatureMoment type to types.ts. Infrastructure ready for manual timestamping of iconic musical moments.
- [x] **18. Show-Level Audio Auto-Calibration** — Added calibrateEnergyGlobal() for cross-song energy normalization. Per-song calibration already active via #9.
- [x] **19. Render Checkpointing** — Already implemented: render-show.ts --resume flag skips tracks with existing output + per-chunk resume.
- [x] **20. Overlay Selection Manifest** — Added buildOverlayManifest() to overlay-rotation.ts. Returns JSON-serializable per-window overlay selections.
