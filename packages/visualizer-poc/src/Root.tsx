import React from "react";
import { Composition, getInputProps } from "remotion";
import { SongVisualizer, SongVisualizerProps } from "./SongVisualizer";
import { ShowIntro } from "./components/ShowIntro";
import { ChapterCard } from "./components/ChapterCard";
import { SetBreakCard } from "./components/SetBreakCard";
import { EndCard } from "./components/EndCard";
import type { SetlistEntry, ShowSetlist, OverlaySchedule } from "./data/types";
import { parseSetlist, safeParse, FlexibleTrackAnalysisSchema, OverlayScheduleSchema } from "./data/schemas";
import { SELECTABLE_REGISTRY } from "./data/overlay-registry";
import { formatDateLong } from "./data/ShowContext";
import { validateSectionOverrides } from "./scenes/SceneRouter";

// ─── Dynamic show loading ───
// Supports multi-show via --props='{"showId":"1972-08-27"}' or SHOW_ID env var.
// Falls back to data/ root (Cornell '77) for backward compatibility.
const RENDER_WIDTH = parseInt(process.env.RENDER_WIDTH ?? "1920", 10);
const RENDER_HEIGHT = parseInt(process.env.RENDER_HEIGHT ?? "1080", 10);

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

// Import all track analysis files
const analysisCache: Record<string, unknown> = {};
function loadTrackAnalysis(trackId: string) {
  if (analysisCache[trackId]) return analysisCache[trackId];
  try {
    const dataDir = (!showId || showId === "cornell-77") ? "../data" : `../data/shows/${showId}`;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const data = require(`${dataDir}/tracks/${trackId}-analysis.json`);
    const validated = safeParse(FlexibleTrackAnalysisSchema, data);
    analysisCache[trackId] = validated;
    return validated;
  } catch (e) {
    console.error(`[loadTrackAnalysis] FAILED for ${trackId}:`, e);
    return null;
  }
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

const DEFAULT_FRAMES = 31417; // Morning Dew fallback
const SET_BREAK_FRAMES = 300; // 10 seconds at 30fps
const SHOW_INTRO_FRAMES = 465; // ~15.5s at 30fps (7s video + 2s crossfade + 5s poster hold + 1.5s fade)
const CHAPTER_CARD_FRAMES = 180; // 6 seconds at 30fps
const END_CARD_FRAMES = 360;     // 12 seconds at 30fps

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
          fps={30}
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
          fps={30}
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
            fps={30}
            width={1920}
            height={1080}
            defaultProps={{
              song,
              segueIn,
              segueOut,
              segueFromPalette: segueIn ? prevSong?.palette : undefined,
              segueToPalette: segueOut ? nextSong?.palette : undefined,
              segueFromMode: segueIn ? prevSong?.defaultMode : undefined,
              segueToMode: segueOut ? nextSong?.defaultMode : undefined,
              activeOverlays: getActiveOverlays(song.trackId),
              energyHints: getEnergyHints(song.trackId),
              show: setlist,
            } satisfies SongVisualizerProps as Record<string, unknown>}
            calculateMetadata={async ({ props }) => {
              // Try bundle require first (dev/studio), then fall back to --props (CLI render)
              let analysis = loadTrackAnalysis(song.trackId) as { meta?: { totalFrames?: number; sections?: unknown[] }; frames?: unknown[] } | null;
              if (!analysis && (props as Record<string, unknown>).meta && (props as Record<string, unknown>).frames) {
                analysis = safeParse(FlexibleTrackAnalysisSchema, { meta: (props as Record<string, unknown>).meta, frames: (props as Record<string, unknown>).frames });
              }
              if (analysis?.meta) {
                if (analysis.meta.sections) {
                  validateSectionOverrides(song, analysis.meta.sections.length);
                }
                return {
                  durationInFrames: analysis.meta.totalFrames ?? DEFAULT_FRAMES,
                  props: { ...props, analysis },
                };
              }
              return { durationInFrames: DEFAULT_FRAMES };
            }}
          />
        );
      })}

      {/* Set break — cinematic interstitial between sets */}
      <Composition
        id="SetBreak"
        component={SetBreakCardComponent}
        durationInFrames={SET_BREAK_FRAMES}
        fps={30}
        width={1920}
        height={1080}
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
        fps={30}
        width={1920}
        height={1080}
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
          fps={30}
          width={RENDER_WIDTH}
          height={RENDER_HEIGHT}
          defaultProps={{
            song: setlist.songs.find((s) => s.trackId === "s2t08") ?? setlist.songs[0],
            activeOverlays: getActiveOverlays("s2t08"),
            energyHints: getEnergyHints("s2t08"),
            show: setlist,
          } satisfies SongVisualizerProps as Record<string, unknown>}
          calculateMetadata={async ({ props }) => {
            const analysis = loadTrackAnalysis("s2t08") as { meta?: { totalFrames?: number } } | null;
            if (analysis?.meta) {
              return {
                durationInFrames: analysis.meta.totalFrames ?? DEFAULT_FRAMES,
                props: { ...props, analysis },
              };
            }
            return { durationInFrames: DEFAULT_FRAMES };
          }}
        />
      )}
    </>
  );
};
