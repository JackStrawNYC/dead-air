#!/usr/bin/env npx tsx
/**
 * Bridge Pipeline — transforms pipeline output into visualizer JSON files.
 *
 * Input: Pipeline data dir (from `dead-air ingest + analyze + research`)
 * Output: All JSON files the visualizer consumes.
 *
 * Usage:
 *   npx tsx scripts/bridge-pipeline.ts --date=1977-05-08 [--data-dir=/path/to/dead-air/data]
 *   npx tsx scripts/bridge-pipeline.ts --date=1977-05-08 --db=/path/to/dead-air.db
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "fs";
import { join, resolve, basename } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const VIZ_DATA = join(ROOT, "data");
const VIZ_PUBLIC = join(ROOT, "public");

// ─── Parse arguments ───

const args = process.argv.slice(2);
const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1];
const dataDirArg = args.find((a) => a.startsWith("--data-dir="))?.split("=")[1];

if (!dateArg) {
  console.error("Usage: bridge-pipeline.ts --date=YYYY-MM-DD [--data-dir=path]");
  process.exit(1);
}

const showDate = dateArg;

// Default data dir: ../../data (relative to visualizer-poc)
const pipelineDataDir = dataDirArg
  ? resolve(dataDirArg)
  : resolve(ROOT, "..", "..", "data");

console.log(`Bridge Pipeline: ${showDate}`);
console.log(`Pipeline data: ${pipelineDataDir}`);
console.log(`Visualizer data: ${VIZ_DATA}`);
console.log("");

// ─── Types ───

interface SetlistSong {
  songName: string;
  setNumber: number;
  position: number;
  isSegue: boolean;
  coverArtist?: string;
}

interface SongSegment {
  songName: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
}

interface SongAnalysisData {
  songName: string;
  durationSec: number;
  bpm: number[];
  energy: number[];
  spectralCentroid: number[];
  onsets: number[];
  key?: string;
  mood?: string;
}

interface PipelineAnalysis {
  showId: string;
  songSegments: SongSegment[];
  perSongAnalysis: SongAnalysisData[];
  peakMoments: Array<{ timestamp: number; intensity: number; description: string }>;
}

interface ShowResearch {
  showId: string;
  tourContext: string;
  bandMemberContext: string;
  historicalContext: string;
  songHistories: Array<{
    songName: string;
    timesPlayed: string;
    notableVersions: string;
    thisVersionNotes: string;
  }>;
  fanConsensus: string;
  venueHistory: string;
  songStats?: Array<{
    songName: string;
    timesPlayed: number;
    firstPlayed: string;
    lastPlayed: string;
  }>;
  listenForMoments?: Array<{
    songName: string;
    timestampSec: number;
    description: string;
  }>;
  archiveReviews?: Array<{
    text: string;
    reviewer: string;
    stars?: number;
  }>;
}

// ─── Helper: generate trackId from set/position ───

function makeTrackId(setNumber: number, trackInSet: number): string {
  return `s${setNumber}t${String(trackInSet).padStart(2, "0")}`;
}

// ─── Helper: guess audio filename from pipeline path ───

function inferAudioFilename(filePath: string, trackId: string): string {
  const base = basename(filePath);
  // If file already exists in public/audio, use its name
  const audioDir = join(VIZ_PUBLIC, "audio");
  if (existsSync(join(audioDir, base))) return base;
  // Standard naming: gd{yy}-{mm}-{dd}{trackId}.mp3
  const [year, month, day] = showDate.split("-");
  return `gd${year.slice(2)}-${month}-${day}${trackId}.mp3`;
}

// ─── Load pipeline data ───

function loadPipelineAnalysis(): PipelineAnalysis | null {
  const analysisPath = join(pipelineDataDir, "analysis", showDate, "analysis.json");
  if (!existsSync(analysisPath)) {
    console.warn(`  WARNING: No analysis found at ${analysisPath}`);
    return null;
  }
  return JSON.parse(readFileSync(analysisPath, "utf-8"));
}

function loadPipelineResearch(): ShowResearch | null {
  const researchPath = join(pipelineDataDir, "research", showDate, "research.json");
  if (!existsSync(researchPath)) {
    console.warn(`  WARNING: No research found at ${researchPath}`);
    return null;
  }
  return JSON.parse(readFileSync(researchPath, "utf-8"));
}

function loadShowFromDb(): { venue: string; city: string; state: string; setlist: SetlistSong[]; metadata: Record<string, unknown> } | null {
  // Try to read show data from a SQLite DB
  const dbPath = join(pipelineDataDir, "dead-air.db");
  if (!existsSync(dbPath)) {
    console.warn(`  WARNING: No database at ${dbPath}`);
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT * FROM shows WHERE id = ?").get(showDate) as Record<string, unknown> | undefined;
    db.close();

    if (!row) {
      console.warn(`  WARNING: Show ${showDate} not found in database`);
      return null;
    }

    return {
      venue: (row.venue as string) ?? "",
      city: (row.city as string) ?? "",
      state: (row.state as string) ?? "",
      setlist: JSON.parse((row.setlist as string) ?? "[]"),
      metadata: JSON.parse((row.metadata as string) ?? "{}"),
    };
  } catch (e) {
    console.warn(`  WARNING: Could not read database: ${e}`);
    return null;
  }
}

// ─── Visual mode assignment based on energy ───

type VisualMode = "liquid_light" | "particle_nebula" | "concert_lighting" | "lo_fi_grain" | "stark_minimal" | "oil_projector" | "tie_dye" | "cosmic_dust" | "vintage_film";

function assignVisualMode(songAnalysis: SongAnalysisData | undefined, songName: string): VisualMode {
  if (!songAnalysis) return "liquid_light";

  const avgEnergy = songAnalysis.energy.length > 0
    ? songAnalysis.energy.reduce((a, b) => a + b, 0) / songAnalysis.energy.length
    : 0.3;

  const bpm = songAnalysis.bpm[0] ?? 120;
  const nameLower = songName.toLowerCase();

  // Special cases
  if (nameLower.includes("drums") || nameLower.includes("space")) return "particle_nebula";
  if (nameLower.includes("dark star")) return "cosmic_dust";

  // Energy-based assignment
  if (avgEnergy > 0.5 && bpm > 130) return "tie_dye";
  if (avgEnergy > 0.4) return "concert_lighting";
  if (avgEnergy > 0.25) return "liquid_light";
  if (avgEnergy > 0.15) return "vintage_film";
  return "oil_projector";
}

// ─── Palette assignment based on song position ───

function assignPalette(setNumber: number, position: number): { primary: number; secondary: number } {
  // Distribute hues around the color wheel based on position
  const baseHue = ((setNumber - 1) * 120 + position * 37) % 360;
  const secondaryHue = (baseHue + 150 + position * 20) % 360;
  return { primary: baseHue, secondary: secondaryHue };
}

// ─── Main bridge ───

function bridge() {
  const analysis = loadPipelineAnalysis();
  const research = loadPipelineResearch();
  const showData = loadShowFromDb();

  // Determine setlist source: DB > analysis segments
  let setlist: SetlistSong[];
  if (showData?.setlist?.length) {
    setlist = showData.setlist;
  } else if (analysis?.songSegments?.length) {
    setlist = analysis.songSegments.map((seg, i) => ({
      songName: seg.songName,
      setNumber: 1, // Default to set 1 if no setlist info
      position: i + 1,
      isSegue: false,
    }));
  } else {
    console.error("ERROR: No setlist data available (no DB, no analysis)");
    process.exit(1);
  }

  const venue = showData?.venue
    ? `${showData.venue}${showData.city ? `, ${showData.city}` : ""}${showData.state ? `, ${showData.state}` : ""}`
    : "Unknown Venue";

  const tour = (showData?.metadata?.tour as string) ?? undefined;

  // ── Build trackId mapping ──
  // Track position within each set
  const setTrackCounts: Record<number, number> = {};
  const trackMapping = setlist.map((song) => {
    const set = song.setNumber;
    setTrackCounts[set] = (setTrackCounts[set] ?? 0) + 1;
    const trackInSet = setTrackCounts[set];
    const trackId = makeTrackId(set, trackInSet);

    const songAnalysis = analysis?.perSongAnalysis?.find(
      (a) => a.songName.toLowerCase() === song.songName.toLowerCase(),
    );
    const segment = analysis?.songSegments?.find(
      (s) => s.songName.toLowerCase() === song.songName.toLowerCase(),
    );

    return { song, trackId, songAnalysis, segment };
  });

  // ── 1. Generate setlist.json ──
  console.log("1. Generating setlist.json ...");
  const setlistJson = {
    date: showDate,
    venue,
    bandName: "Grateful Dead",
    taperInfo: (showData?.metadata?.archiveOrgSource as string) ?? "Unknown Source",
    era: classifyEra(showDate),
    venueType: "arena" as const,
    tourName: tour,
    songs: trackMapping.map(({ song, trackId, songAnalysis, segment }) => ({
      trackId,
      title: song.songName,
      set: song.setNumber,
      trackNumber: setTrackCounts[song.setNumber] ?? 1,
      defaultMode: assignVisualMode(songAnalysis, song.songName),
      audioFile: segment
        ? inferAudioFilename(segment.filePath, trackId)
        : `${showDate.replace(/-/g, "")}-${trackId}.mp3`,
      palette: assignPalette(song.setNumber, song.position),
      segueInto: song.isSegue || undefined,
    })),
  };
  writeFileSync(join(VIZ_DATA, "setlist.json"), JSON.stringify(setlistJson, null, 2));
  console.log(`  ✓ ${setlistJson.songs.length} songs`);

  // ── 2. Copy/generate analysis files ──
  console.log("2. Generating analysis files ...");
  const tracksDir = join(VIZ_DATA, "tracks");
  mkdirSync(tracksDir, { recursive: true });

  let timelineOffset = 0;
  const timelineTracks: Array<{ trackId: string; totalFrames: number; globalFrameStart: number; globalFrameEnd: number }> = [];

  for (const { trackId, songAnalysis, segment } of trackMapping) {
    if (!songAnalysis) {
      console.log(`  SKIP: No analysis for ${trackId}`);
      continue;
    }

    const duration = segment?.duration ?? songAnalysis.durationSec;
    const fps = 30;
    const totalFrames = Math.round(duration * fps);
    const tempo = songAnalysis.bpm[0] ?? 120;

    // Generate per-frame analysis from pipeline's coarser data
    const frames = generateFrameData(songAnalysis, totalFrames);

    // Generate sections (simple energy-based segmentation)
    const sections = generateSections(frames, totalFrames);

    const trackAnalysis = {
      meta: {
        source: `pipeline-bridge-${showDate}`,
        duration,
        fps,
        sr: 44100,
        hopLength: 512,
        totalFrames,
        tempo,
        sections,
      },
      frames,
    };

    writeFileSync(
      join(tracksDir, `${trackId}-analysis.json`),
      JSON.stringify(trackAnalysis),
    );

    timelineTracks.push({
      trackId,
      totalFrames,
      globalFrameStart: timelineOffset,
      globalFrameEnd: timelineOffset + totalFrames,
    });
    timelineOffset += totalFrames;
  }
  console.log(`  ✓ ${timelineTracks.length} analysis files`);

  // ── 3. Generate show-timeline.json ──
  console.log("3. Generating show-timeline.json ...");
  const timeline = {
    date: showDate,
    totalFrames: timelineOffset,
    totalDuration: timelineOffset / 30,
    tracks: timelineTracks,
  };
  writeFileSync(join(VIZ_DATA, "show-timeline.json"), JSON.stringify(timeline, null, 2));
  console.log(`  ✓ ${timelineTracks.length} tracks, ${(timelineOffset / 30 / 60).toFixed(1)} min total`);

  // ── 4. Generate song-stats.json from research ──
  if (research) {
    console.log("4. Generating song-stats.json ...");
    const songStats: Record<string, unknown> = {};

    for (const { song, trackId } of trackMapping) {
      const stat = research.songStats?.find(
        (s) => s.songName.toLowerCase() === song.songName.toLowerCase(),
      );
      const history = research.songHistories?.find(
        (h) => h.songName.toLowerCase() === song.songName.toLowerCase(),
      );

      if (stat) {
        songStats[trackId] = {
          title: song.songName,
          timesPlayed: stat.timesPlayed,
          firstPlayed: stat.firstPlayed,
          lastPlayed: stat.lastPlayed,
          notable: history?.thisVersionNotes,
        };
      }
    }

    writeFileSync(
      join(VIZ_DATA, "song-stats.json"),
      JSON.stringify({ showDate, source: "pipeline-research", songs: songStats }, null, 2),
    );
    console.log(`  ✓ ${Object.keys(songStats).length} song stats`);

    // ── 5. Generate narration.json from research ──
    console.log("5. Generating narration.json ...");
    const narrationSongs: Record<string, unknown> = {};

    for (const { song, trackId } of trackMapping) {
      const moments = research.listenForMoments?.filter(
        (m) => m.songName.toLowerCase() === song.songName.toLowerCase(),
      );
      const history = research.songHistories?.find(
        (h) => h.songName.toLowerCase() === song.songName.toLowerCase(),
      );

      narrationSongs[trackId] = {
        listenFor: moments?.map((m) => m.description) ?? [],
        context: history?.thisVersionNotes ?? "",
        songHistory: history?.timesPlayed ?? "",
      };
    }

    // Extract fan reviews from research (archive.org reviews)
    const fanReviews = (research.archiveReviews ?? []).map((r) => ({
      text: r.text,
      reviewer: r.reviewer,
      stars: r.stars,
    }));

    const narration = {
      showDate,
      tourContext: research.tourContext,
      setNarration: {
        set1Intro: research.tourContext.split(".")[0] + ".",
        set2Intro: research.fanConsensus?.split(".")[0] + "." || "",
      },
      songs: narrationSongs,
      fanReviews,
    };

    writeFileSync(join(VIZ_DATA, "narration.json"), JSON.stringify(narration, null, 2));
    console.log(`  ✓ ${Object.keys(narrationSongs).length} narration entries`);
  } else {
    console.log("4-5. SKIP: No research data available");
  }

  // ── 6. Generate show-context.json ──
  console.log("6. Generating show-context.json ...");
  const showContext = {
    venue,
    date: showDate,
    bandName: "Grateful Dead",
    era: classifyEra(showDate),
    tour,
    chapters: generateChapters(setlistJson.songs, research),
  };
  writeFileSync(join(VIZ_DATA, "show-context.json"), JSON.stringify(showContext, null, 2));
  console.log(`  ✓ show-context.json with ${showContext.chapters.length} chapters`);

  // ── 7. Copy audio files ──
  console.log("7. Linking audio files ...");
  const audioSrcDir = join(pipelineDataDir, "audio", showDate);
  const audioDstDir = join(VIZ_PUBLIC, "audio");
  mkdirSync(audioDstDir, { recursive: true });

  if (existsSync(audioSrcDir)) {
    let copied = 0;
    for (const { segment, trackId } of trackMapping) {
      if (!segment) continue;
      const srcFile = segment.filePath;
      const dstFile = join(audioDstDir, inferAudioFilename(srcFile, trackId));
      if (existsSync(srcFile) && !existsSync(dstFile)) {
        copyFileSync(srcFile, dstFile);
        copied++;
      }
    }
    console.log(`  ✓ ${copied} audio files copied`);
  } else {
    console.log(`  SKIP: No audio directory at ${audioSrcDir}`);
  }

  console.log("\nBridge complete! Visualizer data is ready.");
  console.log(`Run: npx tsx scripts/render-show.ts`);
}

// ─── Helpers ───

function classifyEra(date: string): "primal" | "classic" | "hiatus" | "touch_of_grey" | "revival" {
  const year = parseInt(date.split("-")[0]);
  if (year < 1970) return "primal";
  if (year < 1975) return "classic";
  if (year >= 1975 && year <= 1979) return "classic";
  if (year >= 1980 && year <= 1985) return "hiatus";
  if (year >= 1986 && year <= 1990) return "touch_of_grey";
  return "revival";
}

/** Generate per-frame analysis from pipeline's coarser energy/onset data */
function generateFrameData(
  songAnalysis: SongAnalysisData,
  totalFrames: number,
): Array<Record<string, unknown>> {
  const { energy, onsets, bpm } = songAnalysis;
  const energyLen = energy.length || 1;
  const onsetSet = new Set(onsets.map((t) => Math.round(t * 30))); // Convert to frame numbers
  const tempo = bpm[0] ?? 120;
  const beatInterval = Math.round(30 * 60 / tempo); // frames per beat

  const frames: Array<Record<string, unknown>> = [];
  for (let f = 0; f < totalFrames; f++) {
    // Interpolate energy from pipeline's coarser array
    const energyIdx = (f / totalFrames) * energyLen;
    const idx0 = Math.floor(energyIdx);
    const idx1 = Math.min(idx0 + 1, energyLen - 1);
    const t = energyIdx - idx0;
    const rms = (energy[idx0] ?? 0.2) * (1 - t) + (energy[idx1] ?? 0.2) * t;

    // Check onset proximity
    const isOnset = onsetSet.has(f) || onsetSet.has(f - 1) || onsetSet.has(f + 1);
    const isBeat = f % beatInterval < 2;

    frames.push({
      rms: Math.max(0, Math.min(1, rms)),
      centroid: 0.3 + rms * 0.4, // Approximate
      onset: isOnset ? 0.8 : 0,
      beat: isBeat,
      sub: rms * 0.7,
      low: rms * 0.8,
      mid: rms * 0.6,
      high: rms * 0.4,
      chroma: [0.3, 0.1, 0.2, 0.15, 0.25, 0.1, 0.3, 0.15, 0.2, 0.1, 0.25, 0.15],
      contrast: [0.3, 0.25, 0.2, 0.15, 0.2, 0.25, 0.3],
      flatness: 0.3,
    });
  }
  return frames;
}

/** Generate section boundaries from frame data */
function generateSections(
  frames: Array<Record<string, unknown>>,
  totalFrames: number,
): Array<{ frameStart: number; frameEnd: number; label: string; energy: string; avgEnergy: number }> {
  // Simple segmentation: divide into ~2-minute chunks, classify by energy
  const sectionDuration = 30 * 120; // 2 minutes in frames
  const sections: Array<{ frameStart: number; frameEnd: number; label: string; energy: string; avgEnergy: number }> = [];

  let start = 0;
  let sectionIdx = 0;
  while (start < totalFrames) {
    const end = Math.min(start + sectionDuration, totalFrames);
    const sectionFrames = frames.slice(start, end);
    const avgEnergy = sectionFrames.reduce((sum, f) => sum + (f.rms as number), 0) / sectionFrames.length;

    let energy: "low" | "mid" | "high" = "mid";
    if (avgEnergy < 0.15) energy = "low";
    else if (avgEnergy > 0.35) energy = "high";

    sections.push({
      frameStart: start,
      frameEnd: end,
      label: `section_${sectionIdx}`,
      energy,
      avgEnergy,
    });

    start = end;
    sectionIdx++;
  }

  return sections;
}

/** Generate chapter card entries for set breaks */
function generateChapters(
  songs: Array<{ trackId: string; set: number; title: string }>,
  research: ShowResearch | null,
): Array<{ before?: string; after?: string; text: string }> {
  const chapters: Array<{ before?: string; after?: string; text: string }> = [];

  // Find set transitions
  for (let i = 1; i < songs.length; i++) {
    if (songs[i].set !== songs[i - 1].set) {
      const text = research
        ? `${research.tourContext.split(".").slice(0, 2).join(".")}. Set ${songs[i].set} begins.`
        : `Set ${songs[i].set}`;
      chapters.push({
        before: songs[i].trackId,
        text,
      });
    }
  }

  return chapters;
}

// ─── Run ───
bridge();
