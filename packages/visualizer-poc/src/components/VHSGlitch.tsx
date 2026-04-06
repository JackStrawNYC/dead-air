/**
 * VHSGlitch — Multi-layered VHS distortion system.
 *
 * Fires only during energy peaks (>0.25). Comprehensive VHS simulation:
 *   - RGB channel split (3 independent offsets, bass-driven)
 *   - Scan line grid (every 3-4px, subtle persistence)
 *   - Horizontal displacement bands (4-6 shifting image regions)
 *   - Static noise patches (SVG feTurbulence rectangles)
 *   - Tracking distortion line (tempo-scaled vertical scan)
 *   - Bottom-of-frame roll bar (classic VHS artifact)
 *   - Color bleeding / warm edge wash
 *   - Tape head switch noise (bottom 5% flash)
 *   - "PLAY" / "REC" indicator with frame counter
 *   - Rapid on/off flicker tied to event envelope
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── CONFIG ──────────────────────────────────────────────────────

const ENERGY_THRESHOLD = 0.25;
const MIN_GLITCH_DURATION = 12;
const MAX_GLITCH_DURATION = 36;
const COOLDOWN = 50; // min frames between glitch events

// ── TYPES ───────────────────────────────────────────────────────

interface GlitchEvent {
  startFrame: number;
  duration: number;
  intensity: number;
  seed: number;
}

interface DisplacementBand {
  y: number;
  height: number;
  xShift: number;
  opacity: number;
}

interface NoisePatch {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  opacity: number;
}

// ── HELPERS ─────────────────────────────────────────────────────

/** Format frame count as VHS-style timecode HH:MM:SS:FF */
function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const ff = frame % fps;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number, d = 2) => String(n).padStart(d, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

// ── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const VHSGlitch: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, bass, onsetEnvelope, mids, highs } = snap;

  // ── Pre-compute glitch events deterministically ──────────────

  const glitchEvents = React.useMemo(() => {
    const events: GlitchEvent[] = [];
    let lastEnd = -COOLDOWN;

    for (let f = 0; f < frames.length; f++) {
      // Rolling energy (±75 frame window)
      let rSum = 0;
      let rCount = 0;
      for (
        let j = Math.max(0, f - 75);
        j <= Math.min(frames.length - 1, f + 75);
        j++
      ) {
        rSum += frames[j].rms;
        rCount++;
      }
      const re = rCount > 0 ? rSum / rCount : 0;

      if (re >= ENERGY_THRESHOLD && f - lastEnd >= COOLDOWN) {
        const rng = seeded(f * 13 + 666);
        const dur =
          MIN_GLITCH_DURATION +
          Math.floor(rng() * (MAX_GLITCH_DURATION - MIN_GLITCH_DURATION));
        events.push({
          startFrame: f,
          duration: dur,
          intensity: interpolate(re, [ENERGY_THRESHOLD, 0.55], [0.35, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          seed: Math.floor(rng() * 999999),
        });
        lastEnd = f + dur;
      }
    }
    return events;
  }, [frames]);

  // ── Find active glitch event ─────────────────────────────────

  const activeGlitch = glitchEvents.find(
    (g) => frame >= g.startFrame && frame < g.startFrame + g.duration,
  );

  if (!activeGlitch) return null;

  const glitchAge = frame - activeGlitch.startFrame;
  const glitchProgress = glitchAge / activeGlitch.duration;

  // Attack/sustain/release envelope
  const envelope = interpolate(
    glitchProgress,
    [0, 0.08, 0.75, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const intensity = activeGlitch.intensity * envelope;

  // Per-frame deterministic RNG
  const rng = seeded(frame * 7 + 31337);

  // Rapid flicker: skip ~20% of frames during event for that stuttery VHS feel
  const flickerOn = rng() > 0.2;
  if (!flickerOn) return null;

  // ── RGB CHANNEL SPLIT ────────────────────────────────────────
  // Each channel gets independent offset amount, bass-driven
  const baseOffset = 2 + intensity * 12 + bass * 8;
  const rOffset = baseOffset * (0.8 + rng() * 0.4);
  const gOffset = baseOffset * (0.3 + rng() * 0.4) * (rng() > 0.5 ? 1 : -1);
  const bOffset = -baseOffset * (0.7 + rng() * 0.5);
  const channelAlpha = 0.06 + intensity * 0.06;

  // ── SCAN LINE GRID ───────────────────────────────────────────
  // Every 3-4px horizontal lines across the full frame
  const scanLineSpacing = 3 + Math.floor(rng() * 2); // 3 or 4
  const scanLineAlpha = 0.08 + intensity * 0.12;

  // ── HORIZONTAL DISPLACEMENT BANDS ────────────────────────────
  const numBands = 4 + Math.floor(rng() * 3); // 4-6
  const bands: DisplacementBand[] = Array.from({ length: numBands }, () => {
    const bandH = 8 + rng() * 40;
    return {
      y: rng() * height,
      height: bandH,
      xShift: (rng() - 0.5) * 60 * intensity + bass * 20 * (rng() - 0.5),
      opacity: 0.15 + rng() * 0.35,
    };
  });

  // ── STATIC NOISE PATCHES ─────────────────────────────────────
  const numPatches = 3 + Math.floor(rng() * 3); // 3-5
  const noisePatches: NoisePatch[] = Array.from({ length: numPatches }, () => ({
    x: rng() * width * 0.8,
    y: rng() * height,
    w: 60 + rng() * 200,
    h: 10 + rng() * 40,
    seed: Math.floor(rng() * 1000),
    opacity: (0.15 + rng() * 0.4) * intensity + onsetEnvelope * 0.2,
  }));

  // ── TRACKING DISTORTION LINE ─────────────────────────────────
  // Tempo-scaled vertical scan speed
  const trackingSpeed = 3.2 * tempoFactor;
  const trackingY = (frame * trackingSpeed) % height;
  const trackingWidth = 3 + onsetEnvelope * 5;

  // When tracking line passes, scan lines thicken — modeled as proximity factor
  const trackingInfluence = (y: number) => {
    const dist = Math.abs(y - trackingY);
    return dist < 30 ? 1 - dist / 30 : 0;
  };

  // ── ROLL BAR ─────────────────────────────────────────────────
  // Dark band at bottom of frame, slowly drifting upward
  const rollBarY = height - 40 + Math.sin(frame * 0.03 * tempoFactor) * 20;
  const rollBarHeight = 20 + intensity * 15;
  const rollBarAlpha = 0.25 + intensity * 0.3;

  // ── TAPE HEAD SWITCH NOISE ───────────────────────────────────
  // Brief white flash in bottom 5% of frame, onset-driven
  const headSwitchActive = onsetEnvelope > 0.5 && rng() > 0.4;
  const headSwitchAlpha = headSwitchActive ? 0.2 + onsetEnvelope * 0.3 : 0;

  // ── COLOR BLEEDING ───────────────────────────────────────────
  // Warm color wash at left/right edges
  const bleedAlpha = 0.04 + intensity * 0.06;

  // ── REC INDICATOR ────────────────────────────────────────────
  // Blinking "REC" dot with timecode
  const recVisible = Math.floor(frame / (fps * 0.5)) % 2 === 0; // blink every 0.5s
  const timecode = formatTimecode(frame, fps);

  // Unique SVG filter ID per frame to avoid collisions
  const filterId = `vhs-turb-${frame}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* ── RGB Channel Split ──────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(255, 30, 20, ${channelAlpha})`,
          transform: `translateX(${rOffset}px)`,
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(20, 255, 40, ${channelAlpha * 0.7})`,
          transform: `translateX(${gOffset}px)`,
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(20, 40, 255, ${channelAlpha})`,
          transform: `translateX(${bOffset}px)`,
          mixBlendMode: "screen",
        }}
      />

      {/* ── Scan Line Grid ─────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, ${scanLineAlpha}) 0px,
            rgba(0, 0, 0, ${scanLineAlpha}) 1px,
            transparent 1px,
            transparent ${scanLineSpacing}px
          )`,
          mixBlendMode: "multiply",
        }}
      />

      {/* ── SVG Layer: bands, noise patches, tracking line ──── */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Per-patch feTurbulence filters for static noise */}
          {noisePatches.map((patch, i) => (
            <filter
              key={`f-${i}`}
              id={`${filterId}-${i}`}
              x="0%"
              y="0%"
              width="100%"
              height="100%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={`${0.5 + patch.seed * 0.002} ${0.1 + patch.seed * 0.001}`}
                numOctaves={3}
                seed={patch.seed + frame * 17}
                result="noise"
              />
              <feColorMatrix
                in="noise"
                type="saturate"
                values="0"
                result="gray"
              />
            </filter>
          ))}
        </defs>

        {/* Horizontal displacement bands */}
        {bands.map((band, i) => {
          const thicken = trackingInfluence(band.y + band.height / 2);
          const extraH = thicken * 6;
          return (
            <rect
              key={`band-${i}`}
              x={band.xShift}
              y={band.y - extraH / 2}
              width={width}
              height={band.height + extraH}
              fill={`rgba(180, 180, 200, ${band.opacity * intensity})`}
              opacity={1}
            />
          );
        })}

        {/* Static noise patches */}
        {noisePatches.map((patch, i) => (
          <rect
            key={`noise-${i}`}
            x={patch.x}
            y={patch.y}
            width={patch.w}
            height={patch.h}
            fill="white"
            opacity={patch.opacity}
            filter={`url(#${filterId}-${i})`}
          />
        ))}

        {/* Tracking distortion line — bright white core + dark edges */}
        <rect
          x={0}
          y={trackingY - trackingWidth * 2}
          width={width}
          height={trackingWidth * 0.8}
          fill={`rgba(0, 0, 0, ${0.4 * intensity})`}
        />
        <rect
          x={0}
          y={trackingY - trackingWidth * 0.5}
          width={width}
          height={trackingWidth}
          fill={`rgba(255, 255, 255, ${0.5 * intensity + onsetEnvelope * 0.2})`}
        />
        <rect
          x={0}
          y={trackingY + trackingWidth * 0.5}
          width={width}
          height={trackingWidth * 0.8}
          fill={`rgba(0, 0, 0, ${0.35 * intensity})`}
        />

        {/* Roll bar — dark band near bottom */}
        <rect
          x={0}
          y={rollBarY}
          width={width}
          height={rollBarHeight}
          fill={`rgba(10, 5, 15, ${rollBarAlpha})`}
        />
        {/* Roll bar soft edges */}
        <rect
          x={0}
          y={rollBarY - 8}
          width={width}
          height={8}
          fill={`rgba(10, 5, 15, ${rollBarAlpha * 0.4})`}
        />
        <rect
          x={0}
          y={rollBarY + rollBarHeight}
          width={width}
          height={8}
          fill={`rgba(10, 5, 15, ${rollBarAlpha * 0.4})`}
        />
      </svg>

      {/* ── Tape Head Switch Noise (bottom 5%) ─────────────────── */}
      {headSwitchActive && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: height * 0.05,
            background: `rgba(255, 255, 255, ${headSwitchAlpha})`,
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* ── Color Bleeding / Warm Edge Wash ────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(
            to right,
            rgba(200, 120, 80, ${bleedAlpha}) 0%,
            transparent 8%,
            transparent 92%,
            rgba(180, 100, 120, ${bleedAlpha}) 100%
          )`,
          mixBlendMode: "screen",
        }}
      />

      {/* ── Overall VHS Color Tint ─────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(90, 70, 110, ${intensity * 0.05})`,
          mixBlendMode: "color",
        }}
      />

      {/* ── Slight Vignette (VHS camera lens) ──────────────────── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(
            ellipse at center,
            transparent 50%,
            rgba(0, 0, 0, ${0.08 + intensity * 0.06}) 100%
          )`,
        }}
      />

      {/* ── REC / PLAY Indicator ───────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: height * 0.04,
          left: width * 0.04,
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: 0.7 * intensity,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: Math.max(14, width * 0.012),
          color: "white",
          textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
          letterSpacing: 2,
        }}
      >
        {/* Blinking red dot */}
        {recVisible && (
          <div
            style={{
              width: Math.max(8, width * 0.006),
              height: Math.max(8, width * 0.006),
              borderRadius: "50%",
              backgroundColor: "#ff2020",
              boxShadow: "0 0 4px rgba(255,32,32,0.6)",
            }}
          />
        )}
        <span>REC</span>
      </div>

      {/* Timecode bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: height * 0.06,
          right: width * 0.04,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: Math.max(12, width * 0.01),
          color: "white",
          opacity: 0.5 * intensity,
          textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
          letterSpacing: 1.5,
        }}
      >
        {timecode}
      </div>

      {/* ── SP / EP Mode Indicator ─────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: height * 0.04,
          right: width * 0.04,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: Math.max(11, width * 0.009),
          color: "white",
          opacity: 0.4 * intensity,
          textShadow: "1px 1px 2px rgba(0,0,0,0.8)",
          letterSpacing: 2,
        }}
      >
        SP
      </div>
    </div>
  );
};
