/**
 * LyricFragment — displays a lyric fragment at emotional peaks.
 *
 * During climax moments with high energy, a curated lyric floats across
 * the screen as visual poetry. Not subtitles — these are the words that
 * resonate with the moment, chosen by seed for determinism.
 *
 * Gated:
 *   - Only during climax phase (building/peak/sustain) + energy > 0.2
 *   - NOT during IT lock (the music speaks for itself)
 *   - NOT during Drums/Space (too abstract for words)
 *   - NOT during segue crossfade
 *   - NOT during intro hold
 *   - Max one fragment per 20-second window
 */

import React, { useMemo } from "react";
import { useCurrentFrame, interpolate, Easing, useVideoConfig } from "remotion";
import { BAND_CONFIG } from "../data/band-config";
import { seeded } from "../utils/seededRandom";
import { responsiveFontSize } from "../utils/responsive-text";

interface Props {
  /** Seed for deterministic lyric selection */
  showSeed: number;
  /** Song track ID for per-song variation */
  trackId: string;
  /** Current climax phase */
  climaxPhase: string;
  /** Current energy level (0-1) */
  energy: number;
  /** Whether IT/coherence is locked */
  isLocked: boolean;
  /** Whether we're in Drums/Space */
  isDrumsSpace: boolean;
  /** Whether we're in a segue crossfade zone */
  isSegue: boolean;
  /** Intro factor (0 = intro hold, 1 = fully open) */
  introFactor: number;
}

// Minimum frames between lyric appearances
const COOLDOWN_FRAMES = 600; // 20 seconds

// Display duration
const LYRIC_APPEAR = 30;     // 1s fade in
const LYRIC_HOLD = 120;      // 4s hold
const LYRIC_FADE = 60;       // 2s fade out
const LYRIC_TOTAL = LYRIC_APPEAR + LYRIC_HOLD + LYRIC_FADE;

export const LyricFragment: React.FC<Props> = ({
  showSeed,
  trackId,
  climaxPhase,
  energy,
  isLocked,
  isDrumsSpace,
  isSegue,
  introFactor,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // Compute trigger windows: deterministic positions where lyrics CAN appear
  const triggerFrames = useMemo(() => {
    const rng = seeded(showSeed * 41 + trackId.charCodeAt(0) * 13);
    const triggers: number[] = [];
    // Place potential triggers every ~25 seconds with jitter
    for (let t = 900; t < 30000; t += 750) {
      const jitter = Math.floor(rng() * 300) - 150;
      triggers.push(t + jitter);
    }
    return triggers;
  }, [showSeed, trackId]);

  // Find the active trigger (if any)
  const activeTrigger = useMemo(() => {
    for (const t of triggerFrames) {
      if (frame >= t && frame < t + LYRIC_TOTAL) {
        return t;
      }
    }
    return null;
  }, [frame, triggerFrames]);

  // Gate checks
  if (activeTrigger === null) return null;
  if (introFactor < 0.8) return null;
  if (isLocked) return null;
  if (isDrumsSpace) return null;
  if (isSegue) return null;

  // Only show during climax phases with sufficient energy
  const isClimaxPhase = climaxPhase === "building" || climaxPhase === "peak" || climaxPhase === "sustain";
  if (!isClimaxPhase) return null;
  if (energy < 0.2) return null;

  // Select lyric deterministically
  const rng = seeded(showSeed * 31 + activeTrigger * 7);
  const lyricIdx = Math.floor(rng() * BAND_CONFIG.lyrics.length);
  const lyric = BAND_CONFIG.lyrics[lyricIdx];

  // Position: deterministic horizontal and vertical placement
  const posX = 15 + rng() * 70; // 15-85% from left
  const posY = 25 + rng() * 50; // 25-75% from top

  // Fade envelope
  const localFrame = frame - activeTrigger;
  const fadeIn = interpolate(
    localFrame,
    [0, LYRIC_APPEAR],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
  );
  const fadeOut = interpolate(
    localFrame,
    [LYRIC_APPEAR + LYRIC_HOLD, LYRIC_TOTAL],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const opacity = Math.min(fadeIn, fadeOut) * 0.35;

  if (opacity < 0.01) return null;

  // Slow upward drift during display
  const drift = localFrame * 0.03;
  const fontSize = responsiveFontSize(22, height);

  return (
    <div
      style={{
        position: "absolute",
        left: `${posX}%`,
        top: `${posY}%`,
        transform: `translate(-50%, calc(-50% - ${drift}px))`,
        pointerEvents: "none",
        zIndex: 95,
        maxWidth: "55%",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize,
          fontStyle: "italic",
          fontWeight: 300,
          color: `rgba(255, 250, 240, ${opacity.toFixed(3)})`,
          textShadow: `0 0 30px rgba(200, 160, 100, ${(opacity * 0.3).toFixed(3)})`,
          lineHeight: 1.6,
          letterSpacing: "0.04em",
        }}
      >
        {lyric}
      </div>
    </div>
  );
};
