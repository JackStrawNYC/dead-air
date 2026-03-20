/**
 * ConcertInfo — vintage concert poster typography + ticket stub.
 * Shows venue/date at song starts, ticket stub in corner.
 * Psychedelic poster font style with neon glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { useShowContext, formatDateCompact } from "../data/ShowContext";
import { useSongPalette } from "../data/SongPaletteContext";

const DELAY = 60;           // 2s — appears during poster art intro, alongside song title
const SHOW_DURATION = 240;  // 8 seconds visible total (incl fades)
const FADE_IN = 60;
const FADE_OUT = 60;

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
  const { width, height, durationInFrames } = useVideoConfig();
  const ctx = useShowContext();
  const palette = useSongPalette();

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;

  const venue = (venueProp ?? ctx?.venue ?? "VENUE").toUpperCase();
  const date = (dateProp ?? ctx?.date ?? "DATE").toUpperCase();
  const bandName = ctx?.bandName ?? "GRATEFUL DEAD";
  const ticketNumber = ctx ? formatDateCompact(ctx.dateRaw) : "00000000";

  // Show only once, after delay — skip entirely if song is too short (< 30s total)
  const totalNeeded = DELAY + SHOW_DURATION;
  if (durationInFrames < 900) return null; // < 30s — don't clutter short songs

  // For songs shorter than the full window, reduce delay proportionally
  const effectiveDelay = durationInFrames < totalNeeded + 180
    ? Math.max(120, Math.floor((durationInFrames - SHOW_DURATION - 180) * 0.5))
    : DELAY;

  const localFrame = frame - effectiveDelay;
  const inWindow = localFrame >= 0 && localFrame < SHOW_DURATION;

  // Poster text opacity
  const posterFadeIn = interpolate(localFrame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const posterFadeOut = interpolate(localFrame, [SHOW_DURATION - FADE_OUT, SHOW_DURATION], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const posterOpacity = inWindow ? Math.min(posterFadeIn, posterFadeOut) : 0;

  // Palette-locked colors (no more rainbow cycling)
  const hue1 = palette.primary;
  const hue2 = palette.secondary;

  // Ticket stub: fades with concert info
  const ticketOpacity = posterOpacity * 0.6;

  // Slight scale animation on poster
  const posterScale = interpolate(localFrame, [0, FADE_IN, SHOW_DURATION - FADE_OUT, SHOW_DURATION], [0.9, 1, 1, 0.95], {
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
              fontSize: 52 * s,
              fontWeight: 900,
              fontFamily: "serif",
              letterSpacing: 12 * s,
              color: `hsl(${hue1}, 100%, 65%)`,
              textShadow: `0 0 ${20 * s}px hsl(${hue1}, 100%, 50%), 0 0 ${40 * s}px hsl(${hue2}, 100%, 50%), 0 0 ${60 * s}px hsl(${hue1}, 80%, 40%)`,
              textTransform: "uppercase",
            }}
          >
            {bandName}
          </div>

          {/* Venue */}
          <div
            style={{
              fontSize: 20 * s,
              fontWeight: 600,
              fontFamily: "serif",
              letterSpacing: 6 * s,
              color: `hsl(${hue2}, 90%, 70%)`,
              textShadow: `0 0 ${12 * s}px hsl(${hue2}, 100%, 50%)`,
              marginTop: 12 * s,
            }}
          >
            {venue}
          </div>

          {/* Date */}
          <div
            style={{
              fontSize: 18 * s,
              fontWeight: 400,
              fontFamily: "monospace",
              letterSpacing: 4 * s,
              color: `hsl(${(hue1 + 180) % 360}, 80%, 70%)`,
              textShadow: `0 0 ${10 * s}px hsl(${(hue1 + 180) % 360}, 100%, 50%)`,
              marginTop: 6 * s,
            }}
          >
            {date}
          </div>

          {/* Song title (if provided) */}
          {songTitle && (
            <div
              style={{
                fontSize: 28 * s,
                fontWeight: 700,
                fontFamily: "serif",
                fontStyle: "italic",
                letterSpacing: 3 * s,
                color: `hsl(${(hue1 + 90) % 360}, 100%, 75%)`,
                textShadow: `0 0 ${15 * s}px hsl(${(hue1 + 90) % 360}, 100%, 55%)`,
                marginTop: 16 * s,
              }}
            >
              {songTitle}
            </div>
          )}

          {/* Decorative line */}
          <div
            style={{
              width: 200 * s,
              height: 2 * s,
              background: `linear-gradient(90deg, transparent, hsl(${hue1}, 100%, 65%), transparent)`,
              marginTop: 10 * s,
              opacity: 0.6,
            }}
          />
        </div>
      )}

      {/* Ticket stub — bottom left corner */}
      <div
        style={{
          position: "absolute",
          bottom: 20 * s,
          left: 20 * s,
          opacity: ticketOpacity,
          transform: "rotate(-3deg)",
          filter: `drop-shadow(0 0 ${8 * s}px rgba(255,200,100,0.3))`,
        }}
      >
        <div
          style={{
            border: `${1.5 * s}px solid rgba(255, 200, 100, 0.6)`,
            borderRadius: 4 * s,
            padding: `${8 * s}px ${14 * s}px`,
            background: "rgba(0, 0, 0, 0.25)",
            fontFamily: "monospace",
            fontSize: 10 * s,
            color: "rgba(255, 200, 100, 0.8)",
            lineHeight: 1.6,
            minWidth: 140 * s,
          }}
        >
          <div style={{ fontSize: 7 * s, letterSpacing: 3 * s, opacity: 0.6 }}>ADMIT ONE</div>
          <div style={{ fontWeight: 700, fontSize: 11 * s, marginTop: 2 * s }}>{bandName}</div>
          <div style={{ fontSize: 9 * s, opacity: 0.8 }}>{venue.split(",")[0]}</div>
          <div style={{ fontSize: 9 * s, opacity: 0.7 }}>{date}</div>
          <div style={{ borderTop: `${1 * s}px dashed rgba(255,200,100,0.3)`, marginTop: 4 * s, paddingTop: 3 * s, fontSize: 8 * s, opacity: 0.5 }}>
            NO. {ticketNumber} &nbsp; GA
          </div>
        </div>
      </div>
    </div>
  );
};
