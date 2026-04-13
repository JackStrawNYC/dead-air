/**
 * SmokeWisps — 7 rising bezier curves that drift upward continuously.
 *
 * Each wisp is a quadratic bezier that loops when it exits the top.
 * Horizontal drift from bass. Density/opacity from energy.
 * Always visible (no cycle timing) — constant ambient layer at low opacity.
 *
 * Audio reactivity:
 *   energy       -> wisp opacity/density
 *   bass         -> horizontal drift
 *   slowEnergy   -> wisp thickness
 *   beatDecay    -> brightness pulse
 *   chromaHue    -> subtle color tint
 *   tempoFactor  -> rise speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const WISP_COUNT = 7;

interface Wisp {
  baseX: number;       // 0-1 normalized horizontal position
  speed: number;       // rise speed multiplier
  driftFreq: number;   // horizontal oscillation frequency
  driftAmp: number;    // horizontal oscillation amplitude
  phase: number;       // time offset
  thickness: number;   // base stroke width
  opacity: number;     // base opacity
}

const WISPS: Wisp[] = [
  { baseX: 0.15, speed: 0.0018, driftFreq: 0.012, driftAmp: 30, phase: 0, thickness: 1.5, opacity: 0.18 },
  { baseX: 0.30, speed: 0.0022, driftFreq: 0.015, driftAmp: 22, phase: 40, thickness: 2.0, opacity: 0.22 },
  { baseX: 0.42, speed: 0.0015, driftFreq: 0.010, driftAmp: 35, phase: 100, thickness: 1.8, opacity: 0.16 },
  { baseX: 0.55, speed: 0.0020, driftFreq: 0.018, driftAmp: 28, phase: 180, thickness: 2.2, opacity: 0.20 },
  { baseX: 0.65, speed: 0.0025, driftFreq: 0.013, driftAmp: 20, phase: 250, thickness: 1.4, opacity: 0.17 },
  { baseX: 0.78, speed: 0.0016, driftFreq: 0.011, driftAmp: 32, phase: 330, thickness: 1.9, opacity: 0.21 },
  { baseX: 0.88, speed: 0.0019, driftFreq: 0.016, driftAmp: 25, phase: 420, thickness: 1.6, opacity: 0.15 },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const SmokeWisps: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // Always visible — no cycle timing. Master opacity stays subtle.
  const energyAlpha = interpolate(snap.energy, [0, 0.3], [0.12, 0.28], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const brightPulse = 1 + snap.beatDecay * 0.2;
  const bassDrift = snap.bass * 15;
  const strokeScale = 1 + snap.slowEnergy * 0.4;

  const hue = snap.chromaHue;
  const wispColor = `hsla(${hue}, 8%, 75%, `;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ willChange: "opacity" }}>
        <defs>
          <filter id="sw-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g filter="url(#sw-blur)">
          {WISPS.map((w, i) => {
            // Each wisp rises from bottom to top in a looping cycle
            const t = ((frame * tempoFactor * w.speed + w.phase * 0.01) % 1);
            const baseX = w.baseX * width;
            const bottomY = height + 40;
            const topY = -60;
            const totalH = bottomY - topY;

            // Three control points for quadratic bezier, all rising
            const y0 = bottomY - t * totalH;
            const y1 = y0 - totalH * 0.35;
            const y2 = y0 - totalH * 0.7;

            const drift0 = Math.sin((frame + w.phase) * w.driftFreq) * w.driftAmp + bassDrift;
            const drift1 = Math.sin((frame + w.phase) * w.driftFreq * 1.3 + 1) * w.driftAmp * 1.2 + bassDrift * 0.7;
            const drift2 = Math.sin((frame + w.phase) * w.driftFreq * 0.8 + 2) * w.driftAmp * 0.9 + bassDrift * 0.5;

            const x0 = baseX + drift0;
            const x1 = baseX + drift1;
            const x2 = baseX + drift2;

            // Fade at edges
            const edgeFade = Math.min(
              interpolate(y0, [topY, topY + 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              interpolate(y0, [bottomY - 80, bottomY], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            );

            const alpha = w.opacity * energyAlpha * brightPulse * edgeFade;
            if (alpha < 0.01) return null;

            const sw = w.thickness * strokeScale;

            return (
              <path
                key={`wisp-${i}`}
                d={`M ${x0} ${y0} Q ${x1} ${y1} ${x2} ${y2}`}
                stroke={`${wispColor}${alpha.toFixed(3)})`}
                strokeWidth={sw}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
};
