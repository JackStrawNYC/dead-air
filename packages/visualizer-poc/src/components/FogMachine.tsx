/**
 * FogMachine — Ground-level fog rolling across the bottom 30% of screen.
 * Multiple overlapping elliptical fog patches that drift horizontally.
 * Fog density increases with energy. Cool blue-gray tones.
 * Fog patches fade in/out as they drift. Slight vertical undulation.
 * Cycle: 50s, always visible during cycle.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface FogPatch {
  /** Starting x position as fraction (0-2, wraps) */
  startX: number;
  /** Y position as fraction of fog zone (0-1) */
  yFrac: number;
  /** Horizontal drift speed (fraction of width per frame) */
  driftSpeed: number;
  /** Vertical undulation frequency */
  undulateFreq: number;
  /** Vertical undulation amplitude in px */
  undulateAmp: number;
  /** Undulation phase */
  undulatePhase: number;
  /** Ellipse rx as fraction of width */
  rx: number;
  /** Ellipse ry as fraction of fog zone height */
  ry: number;
  /** Base opacity */
  baseOpacity: number;
  /** Hue offset from blue-gray base (200-220) */
  hue: number;
  /** Saturation */
  saturation: number;
  /** Lightness */
  lightness: number;
}

const NUM_PATCHES = 12;
const CYCLE_FRAMES = 50 * 30; // 50s cycle

function generatePatches(seed: number): FogPatch[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_PATCHES }, () => ({
    startX: rng() * 2, // spread across double width for wrapping
    yFrac: rng(),
    driftSpeed: 0.0003 + rng() * 0.0008,
    undulateFreq: 0.005 + rng() * 0.012,
    undulateAmp: 5 + rng() * 20,
    undulatePhase: rng() * Math.PI * 2,
    rx: 0.12 + rng() * 0.25,
    ry: 0.15 + rng() * 0.35,
    baseOpacity: 0.15 + rng() * 0.25,
    hue: 200 + rng() * 20,
    saturation: 10 + rng() * 20,
    lightness: 70 + rng() * 20,
  }));
}

const STAGGER_START = 90;

interface Props {
  frames: EnhancedFrameData[];
}

export const FogMachine: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);

  // Rolling energy over +/-75 frames
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const patches = React.useMemo(() => generatePatches(50519770), []);

  // Fog zone: bottom 30% of screen
  const fogTop = height * 0.70;
  const fogHeight = height * 0.30;

  // Master fade in
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Cycle visibility: always visible during 50s cycle (continuous fog)
  const cyclePos = frame % CYCLE_FRAMES;
  const cycleFade = interpolate(cyclePos, [0, 90, CYCLE_FRAMES - 90, CYCLE_FRAMES], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fog density increases with energy
  const densityMult = interpolate(energy, [0.03, 0.3], [0.5, 1.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const masterOpacity = masterFade * cycleFade * densityMult * 0.35;

  if (masterOpacity < 0.01) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `blur(20px)`,
        }}
      >
        {patches.map((patch, pi) => {
          // Drift position wrapping across width
          const rawX = (patch.startX + frame * patch.driftSpeed) % 2;
          const px = rawX * width - width * 0.5; // allow partial off-screen for seamless wrap

          // Vertical undulation
          const undulateY =
            Math.sin(frame * patch.undulateFreq + patch.undulatePhase) * patch.undulateAmp;

          const py = fogTop + patch.yFrac * fogHeight + undulateY;

          const rx = patch.rx * width;
          const ry = patch.ry * fogHeight;

          // Fog patches fade based on horizontal position (fade near edges for seamless feel)
          const edgeFade = interpolate(rawX, [0, 0.15, 1.85, 2], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const alpha = patch.baseOpacity * edgeFade * densityMult;

          if (alpha < 0.02) return null;

          return (
            <ellipse
              key={pi}
              cx={px}
              cy={py}
              rx={rx}
              ry={ry}
              fill={`hsla(${patch.hue}, ${patch.saturation}%, ${patch.lightness}%, ${alpha})`}
            />
          );
        })}
      </svg>
    </div>
  );
};
