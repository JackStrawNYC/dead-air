#!/usr/bin/env npx tsx
/**
 * Overlay Schedule Generator — computes per-frame overlay transforms.
 *
 * For each frame in a show, determines:
 *   - Which overlays are active (from overlay rotation logic)
 *   - Their opacity (energy-driven)
 *   - Their scale (breathing + beat pulse)
 *   - Their rotation (slow drift + beat impulse)
 *
 * Outputs a JSON schedule that the Rust renderer reads alongside
 * the pre-rendered overlay PNGs.
 *
 * Usage:
 *   npx tsx generate-overlay-schedule.ts \
 *     --data-dir ../visualizer-poc/data \
 *     --output overlay-schedule.json \
 *     --fps 60
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const __dirname = new URL(".", import.meta.url).pathname;
const VISUALIZER_ROOT = resolve(__dirname, "../visualizer-poc");

// ─── Overlay rotation parameters ───
// Simplified version of overlay-rotation.ts logic

interface OverlaySlot {
  overlay_id: string;
  start_frame: number;
  end_frame: number;
  energy_band: "low" | "mid" | "high" | "any";
  blend_mode: string;
}

// Active overlays for rotation (A-tier, always in pool)
const A_TIER_OVERLAYS = [
  "breathing_stealie", "thirteen_point_bolt", "sunflower_stealie",
  "skeleton_roses", "steal_your_face_off", "stealie_fade",
  "dark_star_portal", "american_beauty", "skeleton_band",
  "bear_parade", "marching_terrapins", "dancing_terrapin",
  "grateful_dead_logo", "skull_roses", "rose_overlay",
  "europe72_jester", "wolf_guitar", "grateful_mandala",
  "psychedelic_eye",
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Build overlay rotation schedule for a song
function buildSongOverlaySchedule(
  songFrames: number,
  fps: number,
  energy: number[], // per-frame energy
  seed: number,
): OverlaySlot[] {
  const rng = seededRandom(seed);
  const slots: OverlaySlot[] = [];

  // Window duration: 15-45 seconds depending on energy
  const avgEnergy = energy.reduce((a, b) => a + b, 0) / energy.length;
  const windowDuration = Math.round((20 + (1 - avgEnergy) * 25) * fps);

  // Select 3-5 overlays per window
  const overlaysPerWindow = Math.round(3 + avgEnergy * 2);
  let frame = 0;

  while (frame < songFrames) {
    const windowEnd = Math.min(frame + windowDuration, songFrames);

    // Pick overlays for this window
    const shuffled = [...A_TIER_OVERLAYS].sort(() => rng() - 0.5);
    const selected = shuffled.slice(0, overlaysPerWindow);

    for (const overlay_id of selected) {
      slots.push({
        overlay_id,
        start_frame: frame,
        end_frame: windowEnd,
        energy_band: "any",
        blend_mode: "screen",
      });
    }

    frame = windowEnd;
  }

  return slots;
}

// Compute per-frame transform for an overlay
function computeTransform(
  frame: number,
  fps: number,
  energy: number,
  bass: number,
  beatDecay: number,
  onsetEnvelope: number,
  tempoFactor: number,
  slotProgress: number, // 0-1 within slot
): { opacity: number; scale: number; rotation_deg: number; offset_x: number; offset_y: number } {
  // Fade in/out at slot boundaries
  const fadeIn = Math.min(1, slotProgress * 10);
  const fadeOut = Math.min(1, (1 - slotProgress) * 10);
  const fadeMask = Math.min(fadeIn, fadeOut);

  // Energy-driven opacity: wider range (quiet=dim, loud=bright)
  const energyOpacity = 0.15 + energy * 0.55;
  const opacity = energyOpacity * fadeMask;

  // Breathing scale + beat pulse
  const breathe = 1 + Math.sin(frame * 0.018 * tempoFactor) * 0.08;
  const beatPulse = 1 + beatDecay * 0.15;
  const scale = breathe * beatPulse;

  // Slow rotation + beat impulse
  const rotation_deg = (frame / fps) * 0.5 * tempoFactor + beatDecay * 3;

  return {
    opacity,
    scale,
    rotation_deg: rotation_deg % 360,
    offset_x: 0,
    offset_y: 0,
  };
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : def;
  };

  const dataDir = getArg("data-dir", join(VISUALIZER_ROOT, "data"));
  const outputPath = getArg("output", "overlay-schedule.json");
  const fps = parseInt(getArg("fps", "60"));

  const setlist = JSON.parse(readFileSync(join(dataDir, "setlist.json"), "utf-8"));
  console.log(`Generating overlay schedule for ${setlist.songs?.length ?? 0} songs @ ${fps}fps`);

  const allFrameOverlays: any[][] = [];
  let songSeed = 42;

  for (const song of setlist.songs ?? []) {
    const trackPath = join(dataDir, "tracks", `${song.trackId}-analysis.json`);
    if (!existsSync(trackPath)) { continue; }

    const analysis = JSON.parse(readFileSync(trackPath, "utf-8"));
    const frames = analysis.frames ?? [];
    const tempo = analysis.meta?.tempo ?? 120;
    const afps = analysis.meta?.fps ?? 30;
    const totalOut = Math.ceil((frames.length / afps) * fps);
    const tempoFactor = tempo / 120;

    // Build overlay slots for this song
    const energyArr = frames.map((f: any) => f.rms ?? 0);
    const slots = buildSongOverlaySchedule(totalOut, fps, energyArr, songSeed++);

    // For each output frame, compute active overlays + transforms
    for (let outFrame = 0; outFrame < totalOut; outFrame++) {
      const ai = Math.min(Math.floor(outFrame * (afps / fps)), frames.length - 1);
      const f = frames[ai] ?? {};
      const energy = f.rms ?? 0.2;
      const bass = (f.sub ?? 0.1) + (f.low ?? 0.05);
      const beatDecay = f.beat ? 1.0 : Math.max(0, (allFrameOverlays.length > 0 ? 0 : 0) * 0.95);
      const onsetEnv = f.onset ?? 0;

      // Find active slots for this frame
      const activeSlots = slots.filter(s => outFrame >= s.start_frame && outFrame < s.end_frame);

      const frameInstances = activeSlots.map(slot => {
        const slotLen = slot.end_frame - slot.start_frame;
        const slotProgress = (outFrame - slot.start_frame) / slotLen;

        const transform = computeTransform(
          outFrame, fps, energy, bass, beatDecay, onsetEnv, tempoFactor, slotProgress,
        );

        return {
          overlay_id: slot.overlay_id,
          transform,
          blend_mode: slot.blend_mode,
          keyframe_svg: null,
        };
      });

      allFrameOverlays.push(frameInstances);
    }

    console.log(`  ${song.title}: ${totalOut} frames, ${slots.length} overlay slots`);
  }

  // Write schedule
  console.log(`\nWriting: ${allFrameOverlays.length} frames of overlay data`);

  const { createWriteStream } = await import("fs");
  const ws = createWriteStream(outputPath);
  ws.write("[\n");
  for (let i = 0; i < allFrameOverlays.length; i++) {
    if (i > 0) ws.write(",\n");
    ws.write(JSON.stringify(allFrameOverlays[i]));
  }
  ws.write("\n]");
  await new Promise<void>((res) => ws.end(res));

  const { statSync } = await import("fs");
  const mb = (statSync(outputPath).size / 1048576).toFixed(1);
  console.log(`Done: ${outputPath} (${mb} MB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
