import React from "react";
import { Composition, useVideoConfig } from "remotion";
import { SongVisualizer, SongVisualizerProps } from "./SongVisualizer";
import { ShowIntro } from "./components/ShowIntro";
import { ChapterCard } from "./components/ChapterCard";
import { EndCard } from "./components/EndCard";
import type { SetlistEntry, ShowSetlist, OverlaySchedule } from "./data/types";
import { formatDateLong } from "./data/ShowContext";
import setlistData from "../data/setlist.json";
import showContextData from "../data/show-context.json";

// Try to load overlay schedule (may not exist yet — that's OK)
let overlaySchedule: OverlaySchedule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  overlaySchedule = require("../data/overlay-schedule.json") as OverlaySchedule;
} catch {
  // Schedule not generated yet — all overlays will render
}

const setlist = setlistData as ShowSetlist;

const DEFAULT_FRAMES = 31417; // Morning Dew fallback
const SET_BREAK_FRAMES = 150; // 5 seconds at 30fps
const SHOW_INTRO_FRAMES = 300; // 10 seconds at 30fps (5s brand + 5s poster)
const CHAPTER_CARD_FRAMES = 180; // 6 seconds at 30fps
const END_CARD_FRAMES = 360;     // 12 seconds at 30fps

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SongVisualizerComponent = SongVisualizer as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ShowIntroComponent = ShowIntro as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChapterCardComponent = ChapterCard as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EndCardComponent = EndCard as React.ComponentType<any>;

/** SetBreak — 5-second black gap between sets */
const SetBreak: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <div style={{ width, height, backgroundColor: "#000" }} />
  );
};

/** Get activeOverlays for a given trackId from the schedule */
function getActiveOverlays(trackId: string): string[] | undefined {
  return overlaySchedule?.songs[trackId]?.activeOverlays;
}

/** Chapter card entries from show-context.json */
interface ChapterEntry {
  before?: string;
  after?: string;
  text: string;
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
          width={1920}
          height={1080}
          defaultProps={{
            brandSrc: "assets/song-art/dead-air-brand.png",
            posterSrc: setlist.showPoster,
            date: formatDateLong(setlist.date),
            venue: setlist.venue,
            introAudioSrc: `audio/${setlist.songs[0]?.audioFile}`,
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
          width={1920}
          height={1080}
          defaultProps={{ text: ch.text }}
        />
      ))}

      {/* Per-song compositions */}
      {setlist.songs.map((song: SetlistEntry, i: number) => {
        const prevSong = i > 0 ? setlist.songs[i - 1] : null;
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
              activeOverlays: getActiveOverlays(song.trackId),
              show: setlist,
            } satisfies SongVisualizerProps as Record<string, unknown>}
            calculateMetadata={async ({ props }) => {
              const meta = props.meta as { totalFrames?: number } | undefined;
              if (meta?.totalFrames) {
                return { durationInFrames: meta.totalFrames };
              }
              return { durationInFrames: DEFAULT_FRAMES };
            }}
          />
        );
      })}

      {/* Set break compositions for between-set gaps */}
      <Composition
        id="SetBreak"
        component={SetBreak}
        durationInFrames={SET_BREAK_FRAMES}
        fps={30}
        width={1920}
        height={1080}
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

      {/* Morning Dew standalone composition for testing */}
      <Composition
        id="MorningDew"
        component={SongVisualizerComponent}
        durationInFrames={DEFAULT_FRAMES}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          song: setlist.songs.find((s) => s.trackId === "s2t08")!,
          activeOverlays: getActiveOverlays("s2t08"),
          show: setlist,
        } satisfies SongVisualizerProps as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const meta = props.meta as { totalFrames?: number } | undefined;
          if (meta?.totalFrames) {
            return { durationInFrames: meta.totalFrames };
          }
          return { durationInFrames: DEFAULT_FRAMES };
        }}
      />
    </>
  );
};
