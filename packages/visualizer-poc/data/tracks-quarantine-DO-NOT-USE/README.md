# QUARANTINED — Do Not Use

These disc-track analysis files (d1t01-analysis.json through d3t06-analysis.json) have
frame-misaligned stem data and should NOT be used by the manifest generator.

## What happened

1. These analysis JSONs were generated from unknown source audio at unknown dates.
   Their durations do NOT match the current MP3 files in data/audio/1972-08-27/.
   Example: d1t01 (Promised Land) covers 358.7s, but the actual MP3 is 471.7s.

2. On 2026-04-18, analyze_stems.py was run to merge Demucs stem features into these
   files. But the stems were generated from the current MP3s (correct duration), while
   these analysis files cover different time ranges. The merge aligned frame 0 → frame 0,
   producing misaligned garbage (stem data from one point in time mapped to analysis
   features from a completely different point in time).

3. Correlation between stem_bass and mixed bass was r=0.055 (should be >0.5),
   confirming the misalignment.

## Correct analysis files

Use the song-named analysis files in /data/tracks/ instead:
  - promised-land-1972-08-27-analysis.json (not d1t01-analysis.json)
  - sugaree-1972-08-27-analysis.json (not d1t02-analysis.json)
  - etc.

These have correct durations matching the current MP3s and stems, plus CLAP semantic
fields that the disc-track files lack.

## Quarantined 2026-04-18
