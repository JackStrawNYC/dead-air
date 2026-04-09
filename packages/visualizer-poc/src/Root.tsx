import React from "react";
import { Composition, getInputProps } from "remotion";
import { SongVisualizer, SongVisualizerProps } from "./SongVisualizer";
import { ShowIntro } from "./components/ShowIntro";
import { ChapterCard } from "./components/ChapterCard";
import { SetBreakCard } from "./components/SetBreakCard";
import { EndCard } from "./components/EndCard";
import type { SetlistEntry, ShowSetlist, OverlaySchedule, ColorPalette } from "./data/types";
import { parseSetlist, safeParse, FlexibleTrackAnalysisSchema, OverlayScheduleSchema } from "./data/schemas";
import { SELECTABLE_REGISTRY } from "./data/overlay-registry";
import { formatDateLong, getShowSeed } from "./data/ShowContext";
import { validateSectionOverrides } from "./scenes/SceneRouter";
import { resolveSongMode, lookupSongIdentity, setActiveShowDate } from "./data/song-identities";
import type { PrecomputedNarrative } from "./utils/show-narrative-precompute";
import type { ShowPhase } from "./data/ShowNarrativeContext";
import type { VisualMode } from "./data/types";

// ─── Dynamic show loading ───
// Supports multi-show via --props='{"showId":"1972-08-27"}' or SHOW_ID env var.
// Falls back to data/ root (Cornell '77) for backward compatibility.
const RENDER_WIDTH = parseInt(process.env.RENDER_WIDTH ?? "1920", 10);
const RENDER_HEIGHT = parseInt(process.env.RENDER_HEIGHT ?? "1080", 10);
const RENDER_FPS = parseInt(process.env.RENDER_FPS ?? "30", 10);

const inputProps = getInputProps() as Record<string, unknown>;
const showId = (inputProps.showId as string) ?? process.env.SHOW_ID ?? "";

// Resolve data directory based on showId
// Uses static requires for the default show (Cornell '77) so Webpack can resolve them.
// Dynamic shows use require() with variable paths.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const setlistData = (!showId || showId === "cornell-77")
  ? require("../data/setlist.json")
  : require(`../data/shows/${showId}/setlist.json`);

// eslint-disable-next-line @typescript-eslint/no-require-imports
let showContextData: { chapters: ChapterEntry[] } = { chapters: [] };
try {
  showContextData = (!showId || showId === "cornell-77")
    ? require("../data/show-context.json")
    : require(`../data/shows/${showId}/show-context.json`);
} catch {
  // show-context.json is optional
}

// Per-track analysis is NOT bundled — it's loaded by the Remotion CLI via
// `--props=path/to/analysis.json` and arrives as inputProps. This keeps the JS
// bundle small (under 10 MB instead of ~250 MB) which is critical for render
// worker memory pressure. See scripts/render-show.ts for the props plumbing.

// Pre-computed track-level metadata: total frame counts per track. This tiny
// JSON replaces the need to read each full analysis just to know its length.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const showTimeline = (!showId || showId === "cornell-77")
  ? require("../data/show-timeline.json")
  : require(`../data/shows/${showId}/show-timeline.json`);

interface TimelineTrack { trackId: string; totalFrames: number }
const timelineByTrackId: Record<string, number> = {};
for (const t of (showTimeline.tracks as TimelineTrack[] | undefined) ?? []) {
  timelineByTrackId[t.trackId] = t.totalFrames;
}

// Try to load overlay schedule (may not exist yet — that's OK)
let overlaySchedule: OverlaySchedule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rawSchedule = (!showId || showId === "cornell-77")
    ? require("../data/overlay-schedule.json")
    : require(`../data/shows/${showId}/overlay-schedule.json`);
  overlaySchedule = safeParse(OverlayScheduleSchema, rawSchedule);
} catch {
  // Schedule not generated yet — all overlays will render
}


const setlist = parseSetlist(setlistData);
const showSeed = getShowSeed(setlist);

// Activate show-specific routing (e.g. Veneta 8/27/72) based on setlist date.
// This must be set before any lookupSongIdentity calls so show overrides apply.
setActiveShowDate(setlist.date);
const resolveMode = (song: SetlistEntry) =>
  resolveSongMode(song.title, song.defaultMode, showSeed);

// ─── Pre-computed cross-song narrative state ───
// Each song gets the accumulated state from all songs rendered before it.
// Enables show-arc awareness, fatigue tracking, and shader variety enforcement
// across compositions that render in separate Remotion worker processes.
//
// Computed by `scripts/precompute-narrative.ts` (runs before bundling) and
// loaded here as a small (~40 KB) JSON. This used to call precomputeNarrativeStates()
// at module init, which forced Webpack to inline ALL analysis JSONs (~250 MB)
// into the bundle and tanked render performance.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const narrativeStatesRaw = (!showId || showId === "cornell-77")
  ? require("../data/narrative-states.json")
  : require(`../data/shows/${showId}/narrative-states.json`);

interface SerializedNarrative {
  songsCompleted: number;
  songPeakEnergies: number[];
  showEnergyBaseline: number;
  showPhase: ShowPhase;
  hasDrumsSpace: boolean;
  postDrumsSpaceCount: number;
  hasHadCoherenceLock: boolean;
  itLockCount: number;
  usedShaderModes: [VisualMode, number][];
  shaderModeLastUsed: [VisualMode, number][];
  songPeakScores: number[];
  peakOfShowFired: boolean;
  suiteInfo: PrecomputedNarrative["suiteInfo"];
  prevSongContext: PrecomputedNarrative["prevSongContext"];
  predictedOverlayIds: string[];
}

const narrativeStates: PrecomputedNarrative[] = (narrativeStatesRaw as SerializedNarrative[]).map((s) => ({
  songsCompleted: s.songsCompleted,
  songPeakEnergies: s.songPeakEnergies,
  showEnergyBaseline: s.showEnergyBaseline,
  showPhase: s.showPhase,
  hasDrumsSpace: s.hasDrumsSpace,
  postDrumsSpaceCount: s.postDrumsSpaceCount,
  hasHadCoherenceLock: s.hasHadCoherenceLock,
  itLockCount: s.itLockCount,
  usedShaderModes: new Map(s.usedShaderModes),
  shaderModeLastUsed: new Map(s.shaderModeLastUsed),
  songPeakScores: s.songPeakScores,
  peakOfShowFired: s.peakOfShowFired,
  suiteInfo: s.suiteInfo,
  prevSongContext: s.prevSongContext,
  predictedOverlayIds: s.predictedOverlayIds,
}));

const FPS_SCALE = RENDER_FPS / 30; // 1.0 at 30fps, 2.0 at 60fps
const DEFAULT_FRAMES = Math.round(31417 * FPS_SCALE); // Morning Dew fallback
const SET_BREAK_FRAMES = Math.round(300 * FPS_SCALE); // 10 seconds
const SHOW_INTRO_FRAMES = Math.round(465 * FPS_SCALE); // ~15.5s (7s video + 2s crossfade + 5s poster hold + 1.5s fade)
const CHAPTER_CARD_FRAMES = Math.round(180 * FPS_SCALE); // 6 seconds
const END_CARD_FRAMES = Math.round(360 * FPS_SCALE);     // 12 seconds

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SongVisualizerComponent = SongVisualizer as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ShowIntroComponent = ShowIntro as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChapterCardComponent = ChapterCard as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SetBreakCardComponent = SetBreakCard as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EndCardComponent = EndCard as React.ComponentType<any>;

/** Overlays that use Three.js WebGL — excluded from rotation pool because
 *  headless rendering exhausts WebGL contexts and causes delayRender timeouts.
 */
const WEBGL_OVERLAYS = new Set([
  "FluidLight_OilGlass", "FluidLight_LavaFlow", "FluidLight_Aurora",
  "FluidLight_SmokeWisps", "FluidLight_PlasmaField", "FluidLight_InkWater",
]);

/** Get activeOverlays for a given trackId — full library available.
 *  The rotation engine's scoring (texture, energy, layer) handles
 *  what's appropriate per window. No need to pre-filter to 17 overlays.
 */
function getActiveOverlays(trackId: string): string[] | undefined {
  if (!overlaySchedule?.songs[trackId]) return undefined;
  // Give the rotation engine the full selectable registry (minus WebGL overlays)
  return SELECTABLE_REGISTRY.map((e) => e.name).filter((n) => !WEBGL_OVERLAYS.has(n));
}

/** Get effective palette for a song: setlist JSON > curated identity */
function getEffectivePalette(song: SetlistEntry): ColorPalette | undefined {
  if (song.palette) return song.palette;
  const identity = lookupSongIdentity(song.title);
  return identity?.palette;
}

/** Get per-overlay energy phase hints for a given trackId */
function getEnergyHints(trackId: string): Record<string, import("./data/types").OverlayPhaseHint> | undefined {
  return overlaySchedule?.songs[trackId]?.energyHints;
}

/** Chapter card entries from show-context.json */
interface ChapterEntry {
  before?: string;
  after?: string;
  text: string;
  stats?: {
    timesPlayed: number;
    firstPlayed?: string;
    notable?: string;
  };
}
const chapters: ChapterEntry[] = showContextData.chapters;

export const Root: React.FC = () => {
  return (
    <>
      {/* Show intro poster composition */}
      {setlist.showPoster && (
        <Composition
          id="ShowIntro"
          component={ShowIntroComponent}
          durationInFrames={SHOW_INTRO_FRAMES}
          fps={RENDER_FPS}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          defaultProps={{
            videoSrc: "assets/dead-air-intro.mp4",
            posterSrc: setlist.showPoster,
            date: formatDateLong(setlist.date),
            venue: setlist.venue,
            eraPalette: { primary: 210, secondary: 270 },
          }}
        />
      )}

      {/* Chapter card compositions — one per entry in show-context.json */}
      {chapters.map((ch, i) => (
        <Composition
          key={`chapter-${i}`}
          id={`Chapter-${i}`}
          component={ChapterCardComponent}
          durationInFrames={CHAPTER_CARD_FRAMES}
          fps={RENDER_FPS}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          defaultProps={{ text: ch.text, stats: ch.stats }}
        />
      ))}

      {/* Per-song compositions */}
      {setlist.songs.map((song: SetlistEntry, i: number) => {
        const prevSong = i > 0 ? setlist.songs[i - 1] : null;
        const nextSong = i < setlist.songs.length - 1 ? setlist.songs[i + 1] : null;
        const segueIn = !!(prevSong?.segueInto && prevSong.set === song.set);
        const segueOut = !!song.segueInto;

        return (
          <Composition
            key={song.trackId}
            id={song.trackId}
            component={SongVisualizerComponent}
            durationInFrames={DEFAULT_FRAMES}
            fps={RENDER_FPS}
            width={RENDER_WIDTH}
            height={RENDER_HEIGHT}
            defaultProps={{
              song: { ...song, defaultMode: resolveMode(song) },
              segueIn,
              segueOut,
              segueFromPalette: segueIn ? getEffectivePalette(prevSong!) : undefined,
              segueToPalette: segueOut ? getEffectivePalette(nextSong!) : undefined,
              segueFromMode: segueIn && prevSong ? resolveMode(prevSong) : undefined,
              segueToMode: segueOut && nextSong ? resolveMode(nextSong) : undefined,
              activeOverlays: getActiveOverlays(song.trackId),
              energyHints: getEnergyHints(song.trackId),
              show: setlist,
              narrativeState: narrativeStates[i],
            } satisfies SongVisualizerProps as Record<string, unknown>}
            calculateMetadata={async ({ props }) => {
              // Three load paths in priority order:
              //   1. inputProps (CLI --props=path/to/json or Lambda inputProps)
              //   2. fetch from staticFile (Lambda render — JSONs live in public/tracks/)
              //   3. fall through to show-timeline.json for duration only
              const p = props as Record<string, unknown>;
              let analysis: { meta?: { totalFrames?: number; sections?: unknown[] }; frames?: unknown[] } | null = null;

              if (p.meta && p.frames) {
                analysis = safeParse(FlexibleTrackAnalysisSchema, { meta: p.meta, frames: p.frames });
              } else {
                // Lambda path: fetch from public/tracks/<trackId>-analysis.json
                try {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { staticFile } = require("remotion") as { staticFile: (p: string) => string };
                  const url = staticFile(`tracks/${song.trackId}-analysis.json`);
                  const res = await fetch(url);
                  if (res.ok) {
                    const json = await res.json();
                    analysis = safeParse(FlexibleTrackAnalysisSchema, json);
                  }
                } catch {
                  // staticFile fetch failed — fall through to timeline lookup
                }
              }

              if (analysis?.meta) {
                if (analysis.meta.sections) {
                  validateSectionOverrides(song, analysis.meta.sections.length);
                }
                return {
                  durationInFrames: Math.round((analysis.meta.totalFrames ?? DEFAULT_FRAMES) * FPS_SCALE),
                  props: { ...props, analysis },
                };
              }
              // Fallback: use show-timeline.json totalFrames so the composition has
              // the right length even though SongVisualizer will render its empty fallback.
              const tf = timelineByTrackId[song.trackId];
              const durationInFrames = tf
                ? Math.round(tf * FPS_SCALE)
                : DEFAULT_FRAMES;
              return { durationInFrames };
            }}
          />
        );
      })}

      {/* Set break — cinematic interstitial between sets */}
      <Composition
        id="SetBreak"
        component={SetBreakCardComponent}
        durationInFrames={SET_BREAK_FRAMES}
        fps={RENDER_FPS}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
        defaultProps={{
          venue: setlist.venue,
          date: formatDateLong(setlist.date),
          setNumber: 1,
          narrative: chapters.find((ch) => ch.after === "s1t13")?.text,
          nextSetNarrative: chapters.find((ch) => ch.before === "s2t02")?.text,
        }}
      />

      {/* End card composition */}
      <Composition
        id="EndCard"
        component={EndCardComponent}
        durationInFrames={END_CARD_FRAMES}
        fps={RENDER_FPS}
        width={RENDER_WIDTH}
        height={RENDER_HEIGHT}
        defaultProps={{
          brandSrc: "assets/song-art/dead-air-brand.png",
          posterSrc: setlist.showPoster,
          date: formatDateLong(setlist.date),
          venue: setlist.venue,
        }}
      />


      {/* Morning Dew standalone composition for testing (only if s2t08 exists in this setlist) */}
      {setlist.songs.find((s) => s.trackId === "s2t08") && (
        <Composition
          id="MorningDew"
          component={SongVisualizerComponent}
          durationInFrames={DEFAULT_FRAMES}
          fps={RENDER_FPS}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          defaultProps={{
            song: setlist.songs.find((s) => s.trackId === "s2t08") ?? setlist.songs[0],
            activeOverlays: getActiveOverlays("s2t08"),
            energyHints: getEnergyHints("s2t08"),
            show: setlist,
          } satisfies SongVisualizerProps as Record<string, unknown>}
          calculateMetadata={async ({ props }) => {
            const p = props as Record<string, unknown>;
            if (p.meta && p.frames) {
              const analysis = safeParse(FlexibleTrackAnalysisSchema, { meta: p.meta, frames: p.frames });
              if (analysis?.meta) {
                return {
                  durationInFrames: Math.round((analysis.meta.totalFrames ?? DEFAULT_FRAMES) * FPS_SCALE),
                  props: { ...props, analysis },
                };
              }
            }
            const tf = timelineByTrackId["s2t08"];
            return { durationInFrames: tf ? Math.round(tf * FPS_SCALE) : DEFAULT_FRAMES };
          }}
        />
      )}
    </>
  );
};
