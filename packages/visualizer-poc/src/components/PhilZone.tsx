/**
 * PhilZone — Bass runs visualization across the bottom of the frame.
 * Layer 3, reacts to stemBassRms or sub-bass. Horizontal wave/pulse
 * visualization across bottom 20% of screen. Thick undulating line that
 * throbs with bass. Color: deep purple/blue. Line thickness and amplitude
 * driven by sub + low frequency bands. Creates "bass zone" visual at the
 * bottom of the frame. When stemBassRms is available, use it; otherwise
 * fall back to sub+low.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

const NUM_WAVE_POINTS = 64;
const FADE_IN_FRAMES = 90;

interface WavePoint {
  /** Phase offset for this point's oscillation */
  phase: number;
  /** Frequency multiplier */
  freqMult: number;
  /** Secondary phase for harmonics */
  phase2: number;
  /** Secondary frequency multiplier */
  freqMult2: number;
}

function generateWavePoints(seed: number): WavePoint[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_WAVE_POINTS }, () => ({
    phase: rng() * Math.PI * 2,
    freqMult: 0.8 + rng() * 0.6,
    phase2: rng() * Math.PI * 2,
    freqMult2: 1.5 + rng() * 1.5,
  }));
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PhilZone: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  const fd = frames[idx];

  // Get bass energy — prefer stemBassRms, fall back to (sub + low) / 2
  const bassEnergy =
    fd.stemBassRms != null ? fd.stemBassRms : (fd.sub + fd.low) / 2;

  // Rolling bass energy over +/-50 frames for smooth response
  let bassSum = 0;
  let subSum = 0;
  let lowSum = 0;
  let eCount = 0;
  for (
    let i = Math.max(0, idx - 50);
    i <= Math.min(frames.length - 1, idx + 50);
    i++
  ) {
    const f = frames[i];
    bassSum += f.stemBassRms != null ? f.stemBassRms : (f.sub + f.low) / 2;
    subSum += f.sub;
    lowSum += f.low;
    eCount++;
  }
  const smoothBass = eCount > 0 ? bassSum / eCount : 0;
  const smoothSub = eCount > 0 ? subSum / eCount : 0;
  const smoothLow = eCount > 0 ? lowSum / eCount : 0;

  // Wave points seeded for determinism
  const wavePoints = React.useMemo(
    () => generateWavePoints((ctx?.showSeed ?? 19770508) + 5551),
    [ctx?.showSeed],
  );

  // Energy gate: need some bass presence
  const gateOpacity = interpolate(smoothBass, [0.03, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (gateOpacity < 0.01) return null;

  // Master fade in
  const masterFade = interpolate(frame, [0, FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Overall opacity: 15-55% based on bass energy
  const baseOpacity = interpolate(smoothBass, [0.05, 0.4], [0.15, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = baseOpacity * gateOpacity * masterFade;

  if (masterOpacity < 0.01) return null;

  // Wave parameters driven by bass
  // Amplitude: how tall the wave gets (in px)
  const amplitude = interpolate(bassEnergy, [0.02, 0.5], [8, 80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Line thickness driven by sub + low
  const lineThickness = interpolate(
    (fd.sub + fd.low) / 2,
    [0.02, 0.4],
    [3, 14],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Wave speed — bass pulses push it faster
  const waveSpeed = interpolate(smoothBass, [0.05, 0.3], [0.02, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color: deep purple/blue range
  const hue = interpolate(smoothBass, [0.05, 0.4], [260, 280], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const saturation = interpolate(smoothBass, [0.05, 0.4], [60, 90], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lightness = interpolate(smoothBass, [0.05, 0.4], [30, 55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat throb: momentary amplitude boost on beats
  const beatBoost = fd.beat ? 1.4 : 1.0;

  // Bass zone vertical position: bottom 20% of screen
  const zoneTop = height * 0.82;
  const zoneMid = height * 0.9;

  // Build the wave path — main wave
  const buildWavePath = (
    yBase: number,
    ampMult: number,
    timeOffset: number,
  ): string => {
    const points: string[] = [];
    for (let i = 0; i <= NUM_WAVE_POINTS; i++) {
      const t = i / NUM_WAVE_POINTS;
      const x = t * width;
      const wp = wavePoints[Math.min(i, NUM_WAVE_POINTS - 1)];
      const wave1 =
        Math.sin(
          frame * waveSpeed * wp.freqMult + wp.phase + t * Math.PI * 4 + timeOffset,
        ) * amplitude * ampMult * beatBoost;
      const wave2 =
        Math.sin(
          frame * waveSpeed * 1.7 * wp.freqMult2 +
            wp.phase2 +
            t * Math.PI * 6 +
            timeOffset * 1.3,
        ) *
        amplitude *
        ampMult *
        0.35;
      // Sub-bass adds a slow, deep undulation
      const subWave =
        Math.sin(frame * 0.01 + t * Math.PI * 2) *
        smoothSub *
        40 *
        ampMult;

      const y = yBase + wave1 + wave2 + subWave;

      if (i === 0) {
        points.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      } else {
        // Smooth with quadratic curves
        const prevT = (i - 1) / NUM_WAVE_POINTS;
        const prevWp = wavePoints[Math.min(i - 1, NUM_WAVE_POINTS - 1)];
        const prevWave1 =
          Math.sin(
            frame * waveSpeed * prevWp.freqMult +
              prevWp.phase +
              prevT * Math.PI * 4 +
              timeOffset,
          ) * amplitude * ampMult * beatBoost;
        const prevWave2 =
          Math.sin(
            frame * waveSpeed * 1.7 * prevWp.freqMult2 +
              prevWp.phase2 +
              prevT * Math.PI * 6 +
              timeOffset * 1.3,
          ) *
          amplitude *
          ampMult *
          0.35;
        const prevSubWave =
          Math.sin(frame * 0.01 + prevT * Math.PI * 2) *
          smoothSub *
          40 *
          ampMult;
        const prevX = prevT * width;
        const prevY = yBase + prevWave1 + prevWave2 + prevSubWave;

        const cpX = (prevX + x) / 2;
        const cpY = (prevY + y) / 2;
        points.push(`Q ${prevX.toFixed(1)} ${prevY.toFixed(1)} ${cpX.toFixed(1)} ${cpY.toFixed(1)}`);
        if (i === NUM_WAVE_POINTS) {
          points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
      }
    }
    return points.join(" ");
  };

  // Build multiple wave layers for depth
  const mainPath = buildWavePath(zoneMid, 1.0, 0);
  const secondPath = buildWavePath(zoneMid + 6, 0.7, 1.5);
  const thirdPath = buildWavePath(zoneMid - 4, 0.5, 3.0);

  // Glow gradient for the bass zone
  const zoneGradId = `phil-zone-grad-${idx}`;
  const glowGradId = `phil-glow-grad-${idx}`;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{ opacity: masterOpacity, mixBlendMode: "screen" }}
      >
        <defs>
          {/* Vertical gradient for the bass zone background glow */}
          <linearGradient
            id={zoneGradId}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={`hsla(${hue}, ${saturation}%, ${lightness}%, 0)`}
            />
            <stop
              offset="30%"
              stopColor={`hsla(${hue}, ${saturation}%, ${lightness - 5}%, ${0.05 * smoothBass * 3})`}
            />
            <stop
              offset="100%"
              stopColor={`hsla(${hue}, ${saturation}%, ${lightness - 10}%, ${0.08 * smoothBass * 3})`}
            />
          </linearGradient>

          {/* Glow effect for the wave line */}
          <filter id={glowGradId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={lineThickness * 0.8} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background glow zone */}
        <rect
          x={0}
          y={zoneTop}
          width={width}
          height={height - zoneTop}
          fill={`url(#${zoneGradId})`}
        />

        {/* Third wave layer (most transparent, depth) */}
        <path
          d={thirdPath}
          fill="none"
          stroke={`hsla(${hue + 15}, ${saturation - 10}%, ${lightness - 10}%, 0.2)`}
          strokeWidth={lineThickness * 0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `blur(4px)` }}
        />

        {/* Second wave layer */}
        <path
          d={secondPath}
          fill="none"
          stroke={`hsla(${hue + 8}, ${saturation}%, ${lightness - 5}%, 0.35)`}
          strokeWidth={lineThickness * 0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: `blur(2px)` }}
        />

        {/* Main wave — thickest, brightest */}
        <path
          d={mainPath}
          fill="none"
          stroke={`hsla(${hue}, ${saturation}%, ${lightness}%, 0.7)`}
          strokeWidth={lineThickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowGradId})`}
        />

        {/* Hot core line — thin bright center */}
        <path
          d={mainPath}
          fill="none"
          stroke={`hsla(${hue - 10}, ${saturation + 5}%, ${lightness + 25}%, 0.5)`}
          strokeWidth={lineThickness * 0.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
