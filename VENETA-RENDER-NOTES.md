# Veneta Render Notes — Pick Up Here

## What exists right now

### On External SSD (`/Volumes/Extreme SSD/dead-air-render/`)
- `veneta-8-27-72-FINAL.mp4` — 107 GB, 2h27m, 4K 60fps. **UNUSABLE**: no overlays (path bug), 50 min too short (auto-trim), ultrafast quality.
- `concat-full.ts` — 109 GB TS file (all 10 chunks concatenated). Same issues.

### In S3 (`s3://remotionlambda-useast1-k7ca3krqhx/`)
- `veneta-overlay-chunks/chunk-01.mp4` through `chunk-10.mp4` — all 10 rendered chunks, 4K 60fps with shaders but NO overlays
- `veneta-overlay-render/dead-air-renderer` — Linux x86_64 binary (has stderr fix + BufWriter fix)
- `veneta-overlay-render/manifest-with-overlays.json` — 1.7 GB manifest (has auto-trim bug + wrong overlay path)
- `veneta-overlay-render/overlay-pngs.tar.gz` — 224 MB, 286 PNGs at 4K
- `veneta-overlay-render/renderer-src.tar.gz` — Rust source
- `veneta-overlay-render/audio/` — 23 MP3 tracks

### On Google Drive (`dead-air-renders/working/`)
- `concat.ts` — 95 GB partial TS (chunks 01-09 only)
- Can be deleted — superseded by external SSD copy

### Local (`packages/renderer/`)
- `manifest-with-overlays.json` — DELETED (was 1.7 GB, freed for space)
- `overlay-pngs/` — 251 MB, 286 PNGs at 4K — still exists locally
- Rust source with fixes applied but UNCOMMITTED
- Local macOS arm64 binary at `target/release/dead-air-renderer` — OLD (April 14, before fixes)

### vast.ai
- ALL instances destroyed
- ~$100-150 spent on failed renders

## What's broken (22 bugs found in audit)

### 4 Render Blockers
1. **gpu.rs:125** — `Backends::VULKAN` hardcoded. Mac has no Vulkan (uses Metal). Change to `Backends::PRIMARY`.
2. **No `--overlay-png-dir` CLI arg** — manifest bakes absolute Mac path. Vast.ai can't find PNGs. Need CLI override.
3. **main.rs:428-434** — failed shaders silently skip frames (no black frame fallback). Causes A/V desync. 3 shaders always fail (molten_forge, luminous_cavern, desert_cathedral — all missing `holdP` variable).
4. **generate-full-manifest.ts:755-798** — auto-trim removes ~38 min of crowd noise/tuning. User wants full uncut show.

### Quality Issues
5. **ffmpeg.rs:34** — default preset `ultrafast`. Should be `medium` for offline renders.
6. **main.rs:304** — `--crf` CLI arg parsed but never passed to ffmpeg. Dead code.
7. **ffmpeg.rs:78-79** — stderr nulled. FFmpeg failures undiagnosable.
8. **Temporal blending dead code** — computed but never applied to non-transition frames.
9. **overlay_cache.rs** — CPU compositing clones 33MB per overlay per frame. Catastrophically slow at 4K.

### H264 Concat Issue
10. Chunks from different GPUs have different SPS/PPS. Fix: output as MPEG-TS or force `repeat-headers=1`.

## What needs to happen for a correct render

### Step 1: Fix the code (30 min)
```
gpu.rs:125         Backends::VULKAN → Backends::PRIMARY
ffmpeg.rs:34       "ultrafast" → "medium" (or env var)  
main.rs:428-434    Write black frame on shader failure, don't skip
main.rs:Args       Add --overlay-png-dir CLI arg
main.rs:302-305    Pass args.crf to FfmpegPipe
generate-full-manifest.ts  Add --no-trim flag, skip lines 755-798
generate-full-manifest.ts  overlay_png_dir: use relative path or CLI-provided
```

### Step 2: Fix the 3 broken shaders (holdP variable)
```
shaders/molten-forge.ts
shaders/luminous-cavern.ts  
shaders/desert-cathedral.ts
```
All reference `holdP` which doesn't exist. Either add it or remove the reference.

### Step 3: Rebuild locally
```bash
cd packages/renderer && cargo build --release
```

### Step 4: Regenerate manifest (no trim, correct overlay path)
```bash
npx tsx generate-full-manifest.ts \
  --data-dir ../visualizer-poc/data \
  --output manifest.json \
  --fps 60 --width 3840 --height 2160 \
  --with-overlays --no-trim \
  --overlay-png-dir ./overlay-pngs
```

### Step 5: Test locally (1000 frames)
```bash
./target/release/dead-air-renderer \
  --manifest manifest.json \
  -o /Volumes/Extreme\ SSD/test-1000.mp4 \
  --width 3840 --height 2160 --fps 60 \
  --overlay-png-dir ./overlay-pngs \
  --start-frame 0 --end-frame 1000
```
Verify:
- Output has overlays visible
- Duration matches expected (1000/60 = 16.7s)
- Quality acceptable
- No shader skip warnings

### Step 6: Full local render
```bash
./target/release/dead-air-renderer \
  --manifest manifest.json \
  -o "/Volumes/Extreme SSD/veneta-FINAL.mp4" \
  --width 3840 --height 2160 --fps 60 \
  --overlay-png-dir ./overlay-pngs
```
Expected: 18-36 hours on Apple Silicon depending on chip.
Output to external SSD (1.8 TB free).

### Step 7: Mux audio
```bash
# Build audio concat list
ls ../visualizer-poc/public/audio/veneta-72/gd72-08-27*.mp3 | sort | \
  sed 's|.*|file '"'"'&'"'"'|' > /tmp/audio.txt

ffmpeg -y -i "/Volumes/Extreme SSD/veneta-FINAL.mp4" \
  -f concat -safe 0 -i /tmp/audio.txt \
  -c:v copy -c:a aac -b:a 320k -shortest \
  "/Volumes/Extreme SSD/veneta-8-27-72-WITH-AUDIO.mp4"
```

### Step 8: Add intro (render locally, concat)

## OR: Re-render on vast.ai (faster but needs fixes first)

If local is too slow:
1. Apply all fixes above
2. Rebuild on vast.ai builder instance
3. Upload fixed binary + fixed manifest to S3
4. Use `--overlay-png-dir /root/overlay-pngs` on each instance
5. Output as `.ts` not `.mp4` (fixes concat boundary issue)
6. Validate each chunk with ffprobe before counting done
7. Concat TS files with `cat` (no bitstream filter needed)

## AWS creds (for S3 access)
Stored in `~/.aws/credentials` — do NOT put keys in this file.
Bucket: remotionlambda-useast1-k7ca3krqhx

## Key paths
- Renderer: `/Users/chrisgardella/dead-air/packages/renderer/`
- Visualizer: `/Users/chrisgardella/dead-air/packages/visualizer-poc/`
- Audio: `packages/visualizer-poc/public/audio/veneta-72/`
- Show data: `packages/visualizer-poc/data/shows/1972-08-27/`
- Overlay PNGs: `packages/renderer/overlay-pngs/`
- External SSD: `/Volumes/Extreme SSD/dead-air-render/`

## What NOT to do
- Do NOT delete any render output without asking
- Do NOT use `Stdio::piped()` on ffmpeg stderr
- Do NOT use `-movflags +faststart` for long renders
- Do NOT hardcode absolute paths in manifests
- Do NOT count S3 file presence as "chunk done" — verify with ffprobe
- Do NOT use `--quiet` on aws s3 cp — errors get swallowed
