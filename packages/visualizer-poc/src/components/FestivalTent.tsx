/**
 * FestivalTent — Festival tent canopy silhouette framing the edges of frame.
 * Triangular tent peaks along the top with draped fabric curves between them.
 * Subtle pennant flags hang from the peaks and sway with energy. The canopy
 * edges pulse with warm light. Dark silhouette aesthetic. Appears every 75s
 * for 25s when energy > 0.06.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PeakData {
  /** x position as fraction of width */
  x: number;
  /** Peak height (pixels above top drape line) */
  peakHeight: number;
  /** Pennant hue */
  pennantHue: number;
  /** Pennant sway frequency */
  swayFreq: number;
  /** Pennant sway phase */
  swayPhase: number;
  /** Pennant size */
  pennantSize: number;
}

const NUM_PEAKS = 7;

function generatePeaks(seed: number): PeakData[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PEAKS }, (_, i) => ({
    x: -0.05 + (i / (NUM_PEAKS - 1)) * 1.1,
    peakHeight: 40 + rng() * 30,
    pennantHue: rng() * 360,
    swayFreq: 0.02 + rng() * 0.03,
    swayPhase: rng() * Math.PI * 2,
    pennantSize: 12 + rng() * 10,
  }));
}

// Timing: appears every 75s (2250 frames) for 25s (750 frames)
const CYCLE_PERIOD = 2250;
const SHOW_DURATION = 750;
const FADE_FRAMES = 60;

interface Props {
  frames: EnhancedFrameData[];
}

export const FestivalTent: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const peaks = React.useMemo(() => generatePeaks((ctx?.showSeed ?? 19770508)), [ctx?.showSeed]);

  // Cycle timing
  const cyclePos = frame % CYCLE_PERIOD;
  const inShowWindow = cyclePos < SHOW_DURATION;

  // Energy gate
  const energyGate = energy > 0.06 ? 1 : 0;

  // Fade envelope
  const showFadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const showFadeOut = interpolate(
    cyclePos,
    [SHOW_DURATION - FADE_FRAMES, SHOW_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) },
  );
  const showEnvelope = Math.min(showFadeIn, showFadeOut);

  const masterOpacity = inShowWindow ? showEnvelope * energyGate : 0;

  if (masterOpacity < 0.01) return null;

  // Drape baseline (how far down the tent fabric hangs)
  const drapeBaseline = 80;

  // Build the canopy path: peaks with catenary curves between them
  const buildCanopyPath = (): string => {
    const segments: string[] = [];
    // Start above left edge
    const firstPeak = peaks[0];
    const startX = firstPeak.x * width;
    const startY = drapeBaseline - firstPeak.peakHeight;
    segments.push(`M ${startX} ${-20}`);
    segments.push(`L ${startX} ${startY}`);

    for (let i = 1; i < peaks.length; i++) {
      const prev = peaks[i - 1];
      const curr = peaks[i];
      const prevX = prev.x * width;
      const currX = curr.x * width;
      const prevY = drapeBaseline - prev.peakHeight;
      const currY = drapeBaseline - curr.peakHeight;

      // Catenary-like sag between peaks
      const midX = (prevX + currX) / 2;
      const sagDepth = 20 + energy * 15;
      const midY = Math.max(prevY, currY) + sagDepth;

      segments.push(`Q ${midX} ${midY} ${currX} ${currY}`);
    }

    // Close off the right side and top
    const lastPeak = peaks[peaks.length - 1];
    const endX = lastPeak.x * width;
    segments.push(`L ${endX} ${-20}`);
    segments.push(`Z`);

    return segments.join(" ");
  };

  // Edge glow intensity from energy
  const glowIntensity = interpolate(energy, [0.06, 0.35], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Edge glow hue shifts slowly
  const edgeHue = (frame * 0.5) % 360;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <linearGradient id="tent-edge-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsla(${edgeHue}, 70%, 60%, 0)`} />
            <stop offset="70%" stopColor={`hsla(${edgeHue}, 70%, 60%, 0.15)`} />
            <stop offset="100%" stopColor={`hsla(${edgeHue}, 80%, 70%, 0.4)`} />
          </linearGradient>
        </defs>

        {/* Main canopy silhouette */}
        <path
          d={buildCanopyPath()}
          fill="rgba(8, 8, 12, 0.85)"
          stroke={`hsla(${edgeHue}, 70%, 65%, 0.5)`}
          strokeWidth={2}
          style={{ filter: `drop-shadow(0 ${glowIntensity}px ${glowIntensity * 2}px hsla(${edgeHue}, 70%, 60%, 0.4))` }}
        />

        {/* Side pillars / tent poles */}
        <rect x={0} y={0} width={35} height={height} fill="rgba(8, 8, 12, 0.7)" />
        <rect x={width - 35} y={0} width={35} height={height} fill="rgba(8, 8, 12, 0.7)" />

        {/* Pennant flags hanging from peaks */}
        {peaks.map((peak, i) => {
          const px = peak.x * width;
          const py = drapeBaseline - peak.peakHeight;
          const sway = Math.sin(frame * peak.swayFreq + peak.swayPhase) * (5 + energy * 10);
          const s = peak.pennantSize;

          return (
            <g key={i} transform={`translate(${px}, ${py})`}>
              {/* Flag triangle */}
              <polygon
                points={`0,5 ${sway + s * 0.6},${5 + s} ${sway - s * 0.2},${5 + s * 0.8}`}
                fill={`hsla(${peak.pennantHue}, 75%, 55%, 0.6)`}
                stroke={`hsla(${peak.pennantHue}, 80%, 70%, 0.3)`}
                strokeWidth={0.5}
              />
              {/* Pole knob */}
              <circle
                cx={0}
                cy={0}
                r={3}
                fill={`hsla(${edgeHue}, 60%, 50%, 0.7)`}
              />
            </g>
          );
        })}

        {/* String lights between peaks */}
        {peaks.slice(0, -1).map((peak, i) => {
          const next = peaks[i + 1];
          const x1 = peak.x * width;
          const x2 = next.x * width;
          const y1 = drapeBaseline - peak.peakHeight + 10;
          const y2 = drapeBaseline - next.peakHeight + 10;
          const midX = (x1 + x2) / 2;
          const sagY = Math.max(y1, y2) + 15;

          // Light bulbs along the string
          const numBulbs = 5;
          return (
            <g key={`string-${i}`}>
              <path
                d={`M ${x1} ${y1} Q ${midX} ${sagY} ${x2} ${y2}`}
                fill="none"
                stroke="rgba(60, 55, 50, 0.4)"
                strokeWidth={1}
              />
              {Array.from({ length: numBulbs }, (_, bi) => {
                const t = (bi + 1) / (numBulbs + 1);
                const bx = x1 + (x2 - x1) * t + (midX - (x1 + x2) / 2) * 4 * t * (1 - t) * 0;
                // Quadratic bezier point
                const u = t;
                const bxQ = (1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * midX + u * u * x2;
                const byQ = (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * sagY + u * u * y2;
                const bulbFlicker = 0.5 + Math.sin(frame * 0.08 + bi * 1.7 + i * 3.1) * 0.5;
                const bulbHue = (edgeHue + bi * 40 + i * 60) % 360;
                return (
                  <circle
                    key={bi}
                    cx={bxQ + bx * 0}
                    cy={byQ}
                    r={2.5}
                    fill={`hsla(${bulbHue}, 90%, 75%, ${0.3 + bulbFlicker * 0.5})`}
                    style={{ filter: `blur(1px) drop-shadow(0 0 4px hsla(${bulbHue}, 90%, 70%, 0.5))` }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
