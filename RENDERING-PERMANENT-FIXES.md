# Rendering Pipeline — Real Fixes (Post-Veneta Postmortem)

## What this is
After Veneta render took 50+ hours, here is the actual diagnosis with code references.

## Context check
- **Cornell (Mar 2026)** — used Remotion pipeline, 30fps output, viewer feedback "not smooth". Considered "shipped" but had quality issues.
- **Rust pipeline (commit 464960f, April 12, 2026)** — Veneta is the first show rendered with this pipeline at full scale.
- **The Rust pipeline introduced 4 latent bugs** that only manifest under load. None were caught by tests.

## Bug 1: FFmpeg stderr deadlock
**File**: `packages/renderer/src/ffmpeg.rs` line 64 (commit 464960f)
**Code**: `.stderr(Stdio::piped())` followed by no reading until `finish()`
**Symptom**: Renderer hangs at ~1700-5000 frames depending on shader complexity
**Why**: Linux pipe buffer is 64KB. ffmpeg writes one progress line per frame to stderr. After ~500 lines (small frames) or fewer (long progress lines with bitrate/eta), pipe fills. ffmpeg blocks on `write()`. Renderer blocks on `write_frame()` waiting for ffmpeg to drain stdin.
**Fix in current code**: Changed to `Stdio::null()` — committed in our session
**Required action**: `git add packages/renderer/src/ffmpeg.rs && git commit -m "fix: ffmpeg stderr deadlock at scale"`

## Bug 2: -movflags +faststart memory bloat
**File**: `packages/renderer/src/ffmpeg.rs` line 56 (commit 464960f)
**Code**: `"-movflags", "+faststart"`
**Symptom**: ffmpeg memory grows linearly with frames. At ~5000 frames of 4K input, ffmpeg sits at 2-3 GB RSS
**Why**: faststart requires moov atom at front of file. ffmpeg buffers entire mdat in memory until end, then writes everything atomically. Doesn't scale to 60-min chunks at 4K.
**Fix in current code**: Removed faststart — committed in our session
**Required action**: Same commit as Bug 1
**Optional follow-up**: Add post-render step `ffmpeg -i out.mp4 -c copy -movflags +faststart out-fast.mp4` if web-hosting needs it

## Bug 3: No write buffering, instant pipe pressure
**File**: `packages/renderer/src/ffmpeg.rs` line 89 (commit 464960f)
**Code**: `stdin.write_all(pixels)?;` directly to ChildStdin
**Symptom**: GPU produces frames at 12-20 fps, ffmpeg encodes at 5-10 fps at 4K. Without buffering, GPU stalls waiting for ffmpeg.
**Why**: Each frame is 33 MB at 4K. Pipe buffer 64KB. Each write_all blocks until ffmpeg drains. GPU can't run ahead.
**Fix in current code**: Added 256MB BufWriter — committed in our session
**Required action**: Same commit as Bug 1

## Bug 4: H264 boundary mismatch on concat
**File**: How chunks are concatenated, not the renderer itself
**Symptom**: `ffmpeg -f concat -i list.txt -c copy out.mp4` fails at random chunk boundaries with `h264_mp4toannexb filter failed to receive output packet`
**Why**: Chunks rendered on different GPUs/drivers produce slightly different SPS/PPS NAL units. The bitstream filter chokes when two chunks have different parameters.
**Fix options**:

**Option A (recommended)**: Change renderer to output MPEG-TS by default
```rust
// In ffmpeg.rs new_with_codec, after line 73:
args.extend([
    "-f".to_string(), "mpegts".to_string(),
    output_path.to_string(),
]);
```
Then file extension changes from `.mp4` to `.ts`. Concat is `cat *.ts > full.ts && ffmpeg -i full.ts -c copy full.mp4`.

**Option B**: Force consistent SPS/PPS via x264 params
```rust
args.extend(["-x264-params".to_string(), "keyint=60:scenecut=0:bframes=0:repeat-headers=1".to_string()]);
```
Same SPS/PPS in every chunk → concat works.

**Option C**: Re-encode at concat time using `concat` filter (slow, last resort)

## Process bugs (not code, but workflow)

### No chunk validation before declaring success
**Symptom**: 4 chunks were uploaded as 3-6 GB partial files (corrupted) and counted as done
**Fix**: Each instance after upload must:
```bash
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 /root/$CHUNK.mp4)
EXPECTED=$(echo "($END - $START) / 60" | bc -l)
if (( $(echo "$DURATION < $EXPECTED * 0.95" | bc -l) )); then
  echo "CORRUPTED: actual=$DURATION expected=$EXPECTED"
  exit 1
fi
```

### No concat output validation
**Symptom**: First "complete" concat was 19 GB of 117 GB expected. Exit code 0.
**Fix**: After concat, verify output duration matches sum of chunk durations within 1%.

### Process leak from restart attempts
**Symptom**: Multiple zombie renderer + ffmpeg processes accumulated, competing for GPU and output file
**Fix**: Use `screen -dmS render-CHUNK` for all renders. Always `screen -X -S render-CHUNK quit` before starting new.

### vast.ai instance unreliability  
**Symptom**: ~30% of created instances fail to become SSH-accessible
**Fix**: Filter `verified=true reliability>0.99` AND skip onstart commands AND retry SSH for 5 min before giving up.

## Pre-flight checklist for next render

Before starting a render, verify:
- [ ] FFmpeg fix is committed: `git log packages/renderer/src/ffmpeg.rs | head -5` should show stderr/buffer commit
- [ ] Run 5000-frame end-to-end test on one instance, verify output duration is correct (catches Bug 1+2+3 regression)
- [ ] Render to TS format (Bug 4 fix)
- [ ] Each chunk uses validation step before upload
- [ ] Local disk has 1.5x the expected output size, OR output goes directly to S3 + Drive
- [ ] vast.ai instances filtered by reliability + network speed

## TL;DR — actual root cause

The Rust renderer is **untested at production scale**. All 4 bugs are present in commit 464960f. Three are now fixed in our local source but **uncommitted**. The TS output change is not yet made.

**Cornell didn't really take 15 hours with no problems** — it was Remotion at 30fps with quality issues. The "we used to render fine" comparison is wrong.

What we lived through this week is **shaking out a brand-new pipeline at scale for the first time**. Painful but expected for a 1-week-old codebase doing 60-min renders at 4K 60fps.
