#!/usr/bin/env npx tsx
/**
 * Extract per-song effect schedules from the full manifest JSON.
 *
 * Reads the manifest (flat frame array) and song_boundaries, then outputs
 * one lightweight JSON file per song with just the effect-related fields
 * that Remotion needs: effectMode, effectIntensity, compositedMode, compositedIntensity.
 *
 * Usage:
 *   npx tsx extract-effect-schedule.ts \
 *     --manifest manifest.json \
 *     --output-dir ../visualizer-poc/public/effect-schedules/
 *
 * For single-song manifests (no song_boundaries), outputs a single file
 * named by --track-id (default: "test").
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface ManifestFrame {
  frame: number;
  effect_mode: number;
  effect_intensity: number;
  composited_mode: number;
  composited_intensity: number;
  // Audio fields needed by effects (forwarded from manifest)
  energy: number;
  bass: number;
  beat_snap: number;
  time: number;
}

interface EffectScheduleFrame {
  /** 0=none, 1-14=post-process effect mode */
  effectMode: number;
  /** 0-1 intensity */
  effectIntensity: number;
  /** 0=none, 1-10=composited effect mode */
  compositedMode: number;
  /** 0-1 intensity */
  compositedIntensity: number;
}

interface EffectSchedule {
  /** Track ID this schedule belongs to */
  trackId: string;
  /** FPS the schedule was generated at */
  fps: number;
  /** Per-frame effect data, indexed by frame number within the song */
  frames: EffectScheduleFrame[];
}

interface SongBoundary {
  title: string;
  track_id: string;
  start_frame: number;
  end_frame: number;
}

function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string, def: string) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : def;
  };

  const manifestPath = getArg("manifest", "manifest.json");
  const outputDir = getArg("output-dir", "../visualizer-poc/public/effect-schedules");
  const trackId = getArg("track-id", "test");
  const fps = parseInt(getArg("fps", "30"));

  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
  }

  mkdirSync(outputDir, { recursive: true });

  console.log(`[extract-effect-schedule] Reading ${manifestPath}...`);
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));

  // Detect format: full manifest (object with frames/song_boundaries) vs single-song (flat array)
  const frames: ManifestFrame[] = Array.isArray(raw) ? raw : raw.frames;
  const boundaries: SongBoundary[] | undefined = Array.isArray(raw) ? undefined : raw.song_boundaries;

  if (boundaries && boundaries.length > 0) {
    // Multi-song manifest: split by song boundaries
    console.log(`[extract-effect-schedule] ${boundaries.length} songs, ${frames.length} total frames`);
    for (const boundary of boundaries) {
      const songFrames = frames.filter(
        (f) => f.frame >= boundary.start_frame && f.frame < boundary.end_frame
      );
      const schedule: EffectSchedule = {
        trackId: boundary.track_id,
        fps,
        frames: songFrames.map((f) => ({
          effectMode: f.effect_mode ?? 0,
          effectIntensity: f.effect_intensity ?? 0,
          compositedMode: f.composited_mode ?? 0,
          compositedIntensity: f.composited_intensity ?? 0,
        })),
      };
      const outPath = join(outputDir, `${boundary.track_id}-effects.json`);
      writeFileSync(outPath, JSON.stringify(schedule));
      const effectCount = schedule.frames.filter((f) => f.effectMode > 0).length;
      const compCount = schedule.frames.filter((f) => f.compositedMode > 0).length;
      console.log(
        `  ${boundary.track_id}: ${schedule.frames.length} frames, ${effectCount} effect, ${compCount} composited → ${outPath}`
      );
    }
  } else {
    // Single-song manifest (flat array): output one file
    const schedule: EffectSchedule = {
      trackId,
      fps,
      frames: frames.map((f) => ({
        effectMode: f.effect_mode ?? 0,
        effectIntensity: f.effect_intensity ?? 0,
        compositedMode: f.composited_mode ?? 0,
        compositedIntensity: f.composited_intensity ?? 0,
      })),
    };
    const outPath = join(outputDir, `${trackId}-effects.json`);
    writeFileSync(outPath, JSON.stringify(schedule));
    const effectCount = schedule.frames.filter((f) => f.effectMode > 0).length;
    const compCount = schedule.frames.filter((f) => f.compositedMode > 0).length;
    console.log(
      `  ${trackId}: ${schedule.frames.length} frames, ${effectCount} effect, ${compCount} composited → ${outPath}`
    );
  }

  console.log("[extract-effect-schedule] Done.");
}

main();
