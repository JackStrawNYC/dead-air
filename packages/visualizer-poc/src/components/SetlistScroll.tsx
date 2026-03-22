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
import { seeded } from "../utils/seededRandom";

// -- Timing -----------------------------------------------------------------

const DELAY = 900;            // 30s — appears well after intro clears, its own moment
const SHOW_DURATION = 240;    // 8 seconds visible total (incl fades)
const FADE_IN_FRAMES = 60;
const FADE_OUT_FRAMES = 60;

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
  /** 0 = intro period (show setlist early), 1 = engine open (normal 30s delay) */
  introFactor?: number;
}

export const SetlistScroll: React.FC<Props> = ({ frames, currentSong, introFactor = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  // Intro mode: show setlist early (13-21s) on the right side, no energy gate
  // Normal mode: show at 30s on the left side with energy gate
  const isIntroSong = introFactor < 1;
  const INTRO_DELAY = 390;  // 13s — after SongTitle + ConcertInfo clear
  const effectiveDelay = isIntroSong ? INTRO_DELAY : DELAY;

  // Energy gate: only apply for normal (non-intro) appearances
  if (!isIntroSong) {
    const triggerIdx = Math.min(Math.max(0, effectiveDelay), frames.length - 1);
    let triggerEnergySum = 0;
    let triggerCount = 0;
    for (let i = Math.max(0, triggerIdx - 75); i <= Math.min(frames.length - 1, triggerIdx + 75); i++) {
      triggerEnergySum += frames[i].rms;
      triggerCount++;
    }
    const triggerEnergy = triggerCount > 0 ? triggerEnergySum / triggerCount : 0;
    if (triggerEnergy > 0.28) return null;
  }

  const localFrame = frame - effectiveDelay;
  const inWindow = localFrame >= 0 && localFrame < SHOW_DURATION;
  if (!inWindow) return null;

  // Fade in/out
  const fadeIn = interpolate(localFrame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    localFrame,
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

  // Slide in: from right during intro, from left normally
  const slideX = interpolate(localFrame, [0, FADE_IN_FRAMES], [isIntroSong ? 40 : -40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Resolution scaling (designed at 1080p)
  const s = height / 1080;

  // Seeded jitter for authentic handwritten feel (static per song, not per-frame)
  const rng = seeded((ctx?.dateSeed ?? 1977) * 313);
  const jitterX = (rng() - 0.5) * 1.2;
  const jitterY = (rng() - 0.5) * 1.2;

  // Tilt angle -- slight and consistent per cycle
  const tiltSeed = seeded((ctx?.dateSeed ?? 1977) * 508);
  const tiltAngle = -3 + tiltSeed() * 4; // -3 to +1 degrees

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
          fontSize: 18 * s,
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
              left: -14 * s,
              top: 0,
              fontSize: 12 * s,
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
          bottom: 40 * s,
          ...(isIntroSong ? { right: 24 * s } : { left: 24 * s }),
          opacity,
          transform: `translate(${slideX + jitterX}px, ${jitterY}px) rotate(${tiltAngle}deg)`,
          willChange: "transform, opacity",
        }}
      >
        {/* Paper background */}
        <div
          style={{
            background: "rgba(245, 235, 210, 0.92)",
            padding: `${18 * s}px ${22 * s}px ${14 * s}px ${26 * s}px`,
            borderRadius: 2 * s,
            clipPath: TORN_CLIP_PATH,
            boxShadow: `${2 * s}px ${3 * s}px ${12 * s}px rgba(0, 0, 0, 0.45)`,
            minWidth: 200 * s,
            maxWidth: 240 * s,
          }}
        >
          {/* Header */}
          <div
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 14 * s,
              fontWeight: 700,
              letterSpacing: 3 * s,
              color: "rgba(80, 60, 40, 0.7)",
              textTransform: "uppercase",
              marginBottom: 2 * s,
            }}
          >
            {ctx ? `${ctx.venueShort} ${ctx.dateShort}` : "Dead Air"}
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
                    fontSize: 10 * s,
                    fontWeight: 700,
                    fontStyle: "italic",
                    color: "rgba(100, 70, 40, 0.6)",
                    marginBottom: 2 * s,
                    letterSpacing: 1 * s,
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
