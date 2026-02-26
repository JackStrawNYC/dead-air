/**
 * SetlistScroll -- handwritten-style setlist that appears briefly at song transitions.
 * Shows the show setlist on an aged-paper background with torn edges.
 * Current song highlighted. Appears every 90 seconds for 8 seconds.
 * Deterministic via mulberry32 PRNG. Show data from ShowContext.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -- Timing -----------------------------------------------------------------

const REAPPEAR_INTERVAL = 2700; // every 90 seconds at 30 fps
const SHOW_DURATION = 240; // 8 seconds visible
const FADE_IN_FRAMES = 45;
const FADE_OUT_FRAMES = 45;

// -- Torn edge clip path ----------------------------------------------------

const TORN_CLIP_PATH =
  "polygon(2% 0%, 5% 1%, 8% 0%, 12% 2%, 16% 0%, 20% 1%, 24% 0%, 28% 2%, " +
  "32% 0%, 36% 1%, 40% 0%, 44% 2%, 48% 0%, 52% 1%, 56% 0%, 60% 2%, " +
  "64% 0%, 68% 1%, 72% 0%, 76% 2%, 80% 0%, 84% 1%, 88% 0%, 92% 2%, " +
  "96% 0%, 100% 1%, 100% 98%, 97% 100%, 93% 98%, 89% 100%, 85% 98%, " +
  "81% 100%, 77% 98%, 73% 100%, 69% 98%, 65% 100%, 61% 98%, 57% 100%, " +
  "53% 98%, 49% 100%, 45% 98%, 41% 100%, 37% 98%, 33% 100%, 29% 98%, " +
  "25% 100%, 21% 98%, 17% 100%, 13% 98%, 9% 100%, 5% 98%, 0% 100%, 0% 1%)";

// -- Component --------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
  currentSong?: string;
}

export const SetlistScroll: React.FC<Props> = ({ frames, currentSong }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  // Rolling energy (75-frame window each side)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Cycle timing
  const cycleFrame = frame % REAPPEAR_INTERVAL;
  const inWindow = cycleFrame < SHOW_DURATION;

  if (!inWindow) return null;

  // Fade in/out
  const fadeIn = interpolate(cycleFrame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    cycleFrame,
    [SHOW_DURATION - FADE_OUT_FRAMES, SHOW_DURATION],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  if (opacity < 0.01) return null;

  // Slide in from the left
  const slideX = interpolate(cycleFrame, [0, FADE_IN_FRAMES], [-40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Energy-driven subtle scale breathing
  const breathScale = 1 + interpolate(energy, [0.05, 0.35], [0, 0.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Seeded jitter for authentic handwritten feel
  const rng = seeded(frame * 7 + (ctx?.dateSeed ?? 1977));
  const jitterX = (rng() - 0.5) * 1.2;
  const jitterY = (rng() - 0.5) * 1.2;

  // Tilt angle -- slight and consistent per cycle
  const cycleSeed = seeded(Math.floor(frame / REAPPEAR_INTERVAL) * 508);
  const tiltAngle = -3 + cycleSeed() * 4; // -3 to +1 degrees

  // Current song matching (case insensitive partial match)
  const matchesSong = (songName: string) => {
    if (!currentSong) return false;
    return songName.toLowerCase().includes(currentSong.toLowerCase()) ||
      currentSong.toLowerCase().includes(songName.toLowerCase());
  };

  const renderSongLine = (song: string, index: number) => {
    const isActive = matchesSong(song);
    const lineRng = seeded(index * 313 + 77);
    const lineJitter = (lineRng() - 0.5) * 0.8;

    return (
      <div
        key={song}
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 13,
          lineHeight: 1.7,
          color: isActive ? "#FFD700" : "rgba(60, 45, 30, 0.85)",
          fontWeight: isActive ? 700 : 400,
          textShadow: isActive
            ? "0 0 6px rgba(255, 215, 0, 0.6), 0 0 12px rgba(255, 180, 0, 0.3)"
            : "none",
          transform: `translateX(${lineJitter}px)`,
          letterSpacing: 0.4,
          position: "relative",
        }}
      >
        {isActive && (
          <span
            style={{
              position: "absolute",
              left: -14,
              top: 0,
              fontSize: 12,
              color: "#FFD700",
            }}
          >
            {"\u25B6"}
          </span>
        )}
        {song}
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 24,
          opacity,
          transform: `translate(${slideX + jitterX}px, ${jitterY}px) rotate(${tiltAngle}deg) scale(${breathScale})`,
          willChange: "transform, opacity",
        }}
      >
        {/* Paper background */}
        <div
          style={{
            background: "rgba(245, 235, 210, 0.88)",
            padding: "18px 22px 14px 26px",
            borderRadius: 2,
            clipPath: TORN_CLIP_PATH,
            boxShadow: "2px 3px 12px rgba(0, 0, 0, 0.35)",
            minWidth: 200,
            maxWidth: 240,
          }}
        >
          {/* Header */}
          <div
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 3,
              color: "rgba(80, 60, 40, 0.7)",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            {ctx ? `${ctx.venueShort} ${ctx.dateShort}` : "Cornell 5/8/77"}
          </div>

          {/* Divider line */}
          <div
            style={{
              width: "100%",
              height: 1,
              background: "rgba(80, 60, 40, 0.25)",
              marginBottom: 6,
            }}
          />

          {/* Setlist sets from context */}
          {(ctx?.setlistSets ?? []).map((set, setIdx, allSets) => {
            const songOffset = allSets
              .slice(0, setIdx)
              .reduce((sum, s) => sum + s.songs.length, 0);
            return (
              <React.Fragment key={set.label}>
                {setIdx > 0 && <div style={{ height: 8 }} />}
                <div
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: 10,
                    fontWeight: 700,
                    fontStyle: "italic",
                    color: "rgba(100, 70, 40, 0.6)",
                    marginBottom: 2,
                    letterSpacing: 1,
                  }}
                >
                  {set.label}
                </div>
                {set.songs.map((song, i) => renderSongLine(song, i + songOffset))}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
