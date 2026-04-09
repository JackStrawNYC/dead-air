/**
 * ConcertInfo — vintage concert poster typography (centered).
 * Shows band/venue/date/song at the start of every Nth song (default: every 3rd).
 * Stage announcements / tuning entries are skipped from the rotation count.
 * Psychedelic poster font style with neon glow; ~12s visible window.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "../utils/font-shim";
import { useShowContext } from "../data/ShowContext";
import { useSongPalette } from "../data/SongPaletteContext";

const { fontFamily: cormorant } = loadFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

// Centered intro text: shows on every 3rd song only (so it doesn't get repetitive
// across a full show), and stays visible for ~12 seconds when it does appear.
// Stage announcements are filtered out of the rotation count.
const DELAY = 60;            // 2s — appears during poster art intro
const SHOW_DURATION = 360;   // 12s visible window total (incl fades)
const FADE_IN = 60;          // 2s fade in
const FADE_OUT = 60;         // 2s fade out
const SHOW_EVERY_NTH = 3;    // Show on every 3rd real song (idx 0, 3, 6, 9, ...)

interface Props {
  venue?: string;
  date?: string;
  songTitle?: string;
}

export const ConcertInfo: React.FC<Props> = ({
  venue: venueProp,
  date: dateProp,
  songTitle,
}) => {
  const frame = useCurrentFrame();
  const { height, durationInFrames } = useVideoConfig();
  const ctx = useShowContext();
  const palette = useSongPalette();

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;

  const venue = (venueProp ?? ctx?.venue ?? "VENUE").toUpperCase();
  const date = (dateProp ?? ctx?.date ?? "DATE").toUpperCase();
  const bandName = ctx?.bandName ?? "GRATEFUL DEAD";

  // Skip entirely if song is too short (< 30s) — no point showing on tiny clips
  if (durationInFrames < 900) return null;

  // Gate: only show on every Nth real song (skip stage announcements/tuning).
  // Without a current song title to look up, just render (back-compat behavior).
  if (songTitle && ctx?.setlistSets) {
    const allSongs = ctx.setlistSets.flatMap((s) => s.songs);
    const realSongs = allSongs.filter((s) => !/stage announcement|tuning/i.test(s));
    const idx = realSongs.findIndex(
      (s) =>
        s.toLowerCase().includes(songTitle.toLowerCase()) ||
        songTitle.toLowerCase().includes(s.toLowerCase()),
    );
    if (idx < 0 || idx % SHOW_EVERY_NTH !== 0) return null;
  }

  const localFrame = frame - DELAY;
  const inWindow = localFrame >= 0 && localFrame < SHOW_DURATION;

  const posterFadeIn = interpolate(localFrame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const posterFadeOut = interpolate(
    localFrame,
    [SHOW_DURATION - FADE_OUT, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const posterOpacity = inWindow ? Math.min(posterFadeIn, posterFadeOut) : 0;

  // Palette-locked colors (no more rainbow cycling)
  const hue1 = palette.primary;
  const hue2 = palette.secondary;

  // Slight scale animation on poster
  // Quick scale-in at start; otherwise stable for the whole song
  const posterScale = interpolate(localFrame, [0, FADE_IN], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Vintage concert poster text (centered) */}
      {posterOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: posterOpacity,
            transform: `scale(${posterScale})`,
            willChange: "transform, opacity",
          }}
        >
          {/* Band name */}
          <div
            style={{
              fontSize: 48 * s,
              fontWeight: 700,
              fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
              letterSpacing: 14 * s,
              color: "rgba(255, 255, 255, 0.96)",
              textShadow: `0 ${2 * s}px ${6 * s}px rgba(0,0,0,0.85), 0 0 ${30 * s}px hsl(${hue1}, 60%, 40%), 0 0 ${60 * s}px hsl(${hue2}, 50%, 30%)`,
              textTransform: "uppercase",
            }}
          >
            {bandName}
          </div>

          {/* Decorative line above venue */}
          <div
            style={{
              width: 180 * s,
              height: 1 * s,
              background: `linear-gradient(90deg, transparent, hsl(${hue1}, 50%, 75%), transparent)`,
              marginTop: 14 * s,
              opacity: 0.7,
            }}
          />

          {/* Venue */}
          <div
            style={{
              fontSize: 18 * s,
              fontWeight: 400,
              fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
              letterSpacing: 6 * s,
              color: "rgba(255, 255, 255, 0.92)",
              textShadow: `0 ${1 * s}px ${4 * s}px rgba(0,0,0,0.85), 0 0 ${8 * s}px hsl(${hue2}, 40%, 35%)`,
              marginTop: 12 * s,
            }}
          >
            {venue}
          </div>

          {/* Date */}
          <div
            style={{
              fontSize: 16 * s,
              fontWeight: 400,
              fontFamily: `${cormorant}, 'Cormorant Garamond', Georgia, serif`,
              letterSpacing: 5 * s,
              color: "rgba(255, 255, 255, 0.85)",
              textShadow: `0 ${1 * s}px ${4 * s}px rgba(0,0,0,0.85), 0 0 ${6 * s}px hsl(${hue1}, 30%, 30%)`,
              marginTop: 6 * s,
            }}
          >
            {date}
          </div>

          {/* Song title intentionally NOT rendered here — the title card shows
              band/venue/date only. songTitle is still received as a prop because
              it's used for the every-Nth-song gate above. */}

          {/* Decorative line below */}
          <div
            style={{
              width: 120 * s,
              height: 1 * s,
              background: `linear-gradient(90deg, transparent, hsl(${hue1}, 50%, 75%), transparent)`,
              marginTop: 12 * s,
              opacity: 0.55,
            }}
          />
        </div>
      )}
    </div>
  );
};
