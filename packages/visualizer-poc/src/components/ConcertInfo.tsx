/**
 * ConcertInfo — vintage concert poster typography + ticket stub.
 * Shows venue/date at song starts, ticket stub in corner.
 * Psychedelic poster font style with neon glow.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { useShowContext, formatDateCompact } from "../data/ShowContext";

const SHOW_DURATION = 210; // 7 seconds visible
const FADE_IN = 60;
const FADE_OUT = 60;
const REAPPEAR_INTERVAL = 2700; // re-show every 90 seconds

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
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const venue = (venueProp ?? ctx?.venue ?? "VENUE").toUpperCase();
  const date = (dateProp ?? ctx?.date ?? "DATE").toUpperCase();
  const bandName = ctx?.bandName ?? "GRATEFUL DEAD";
  const ticketNumber = ctx ? formatDateCompact(ctx.dateRaw) : "00000000";

  // Show at start and every REAPPEAR_INTERVAL frames
  const cycleFrame = frame % REAPPEAR_INTERVAL;
  const inWindow = cycleFrame < SHOW_DURATION;

  // Poster text opacity
  const posterFadeIn = interpolate(cycleFrame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const posterFadeOut = interpolate(cycleFrame, [SHOW_DURATION - FADE_OUT, SHOW_DURATION], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const posterOpacity = inWindow ? Math.min(posterFadeIn, posterFadeOut) : 0;

  // Color cycling for the poster text
  const hue1 = (frame * 0.6) % 360;
  const hue2 = (hue1 + 60) % 360;

  // Ticket stub: always visible, corner element
  const ticketOpacity = 0.45;

  // Slight scale animation on poster
  const posterScale = interpolate(cycleFrame, [0, FADE_IN, SHOW_DURATION - FADE_OUT, SHOW_DURATION], [0.9, 1, 1, 0.95], {
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
            top: "8%",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            opacity: posterOpacity,
            transform: `scale(${posterScale})`,
            willChange: "transform, opacity",
          }}
        >
          {/* Band name */}
          <div
            style={{
              fontSize: 52,
              fontWeight: 900,
              fontFamily: "serif",
              letterSpacing: 12,
              color: `hsl(${hue1}, 100%, 65%)`,
              textShadow: `0 0 20px hsl(${hue1}, 100%, 50%), 0 0 40px hsl(${hue2}, 100%, 50%), 0 0 60px hsl(${hue1}, 80%, 40%)`,
              textTransform: "uppercase",
            }}
          >
            {bandName}
          </div>

          {/* Venue */}
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: "serif",
              letterSpacing: 6,
              color: `hsl(${hue2}, 90%, 70%)`,
              textShadow: `0 0 12px hsl(${hue2}, 100%, 50%)`,
              marginTop: 12,
            }}
          >
            {venue}
          </div>

          {/* Date */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 400,
              fontFamily: "monospace",
              letterSpacing: 4,
              color: `hsl(${(hue1 + 180) % 360}, 80%, 70%)`,
              textShadow: `0 0 10px hsl(${(hue1 + 180) % 360}, 100%, 50%)`,
              marginTop: 6,
            }}
          >
            {date}
          </div>

          {/* Song title (if provided) */}
          {songTitle && (
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                fontFamily: "serif",
                fontStyle: "italic",
                letterSpacing: 3,
                color: `hsl(${(hue1 + 90) % 360}, 100%, 75%)`,
                textShadow: `0 0 15px hsl(${(hue1 + 90) % 360}, 100%, 55%)`,
                marginTop: 16,
              }}
            >
              {songTitle}
            </div>
          )}

          {/* Decorative line */}
          <div
            style={{
              width: 200,
              height: 2,
              background: `linear-gradient(90deg, transparent, hsl(${hue1}, 100%, 65%), transparent)`,
              marginTop: 10,
              opacity: 0.6,
            }}
          />
        </div>
      )}

      {/* Ticket stub — bottom left corner */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          opacity: ticketOpacity,
          transform: "rotate(-3deg)",
          filter: "drop-shadow(0 0 8px rgba(255,200,100,0.3))",
        }}
      >
        <div
          style={{
            border: "1.5px solid rgba(255, 200, 100, 0.6)",
            borderRadius: 4,
            padding: "8px 14px",
            background: "rgba(0, 0, 0, 0.5)",
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255, 200, 100, 0.8)",
            lineHeight: 1.6,
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 7, letterSpacing: 3, opacity: 0.6 }}>ADMIT ONE</div>
          <div style={{ fontWeight: 700, fontSize: 11, marginTop: 2 }}>{bandName}</div>
          <div style={{ fontSize: 9, opacity: 0.8 }}>{venue.split(",")[0]}</div>
          <div style={{ fontSize: 9, opacity: 0.7 }}>{date}</div>
          <div style={{ borderTop: "1px dashed rgba(255,200,100,0.3)", marginTop: 4, paddingTop: 3, fontSize: 8, opacity: 0.5 }}>
            NO. {ticketNumber} &nbsp; GA
          </div>
        </div>
      </div>
    </div>
  );
};
