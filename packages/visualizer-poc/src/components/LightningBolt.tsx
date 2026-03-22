/**
 * LightningBolt — 13-point bolt that cracks across screen on big onset hits.
 * Event-based: bolt fires on onset > 0.5, then fades over ~45 frames.
 * Brief white flash accompanies each strike. Between bolts: nothing visible.
 * Multiple branching paths from main bolt for dramatic effect.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

const ONSET_THRESHOLD = 0.5;
const BOLT_FADE_FRAMES = 45;
const FLASH_FRAMES = 10;
const COOLDOWN_FRAMES = 60; // minimum frames between bolts

/** Generate a jagged bolt path between two points */
function generateBoltPath(
  x1: number, y1: number,
  x2: number, y2: number,
  segments: number,
  jitter: number,
  seed: number,
): string {
  const points: [number, number][] = [[x1, y1]];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const baseX = x1 + (x2 - x1) * t;
    const baseY = y1 + (y2 - y1) * t;
    // Deterministic pseudo-random jitter from seed
    const hash = Math.sin(seed * 9301 + i * 4973) * 10000;
    const offsetX = (hash - Math.floor(hash) - 0.5) * jitter * 2;
    const hash2 = Math.sin(seed * 7919 + i * 6151) * 10000;
    const offsetY = (hash2 - Math.floor(hash2) - 0.5) * jitter * 0.5;
    points.push([baseX + offsetX, baseY + offsetY]);
  }
  points.push([x2, y2]);

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  return d;
}

/** Generate branch bolt paths splitting off from the main bolt */
function generateBranches(
  mainPath: string,
  width: number,
  height: number,
  seed: number,
): string[] {
  const branches: string[] = [];
  const branchCount = 3;

  for (let b = 0; b < branchCount; b++) {
    const hash = Math.sin(seed * 3571 + b * 2347) * 10000;
    const t = 0.2 + (hash - Math.floor(hash)) * 0.5; // branch point 20-70% along
    // Approximate branch origin from main bolt center region
    const originX = width * (0.3 + t * 0.4);
    const originY = height * (0.1 + t * 0.6);
    const hash2 = Math.sin(seed * 8111 + b * 5297) * 10000;
    const endX = originX + (hash2 - Math.floor(hash2) - 0.5) * width * 0.4;
    const endY = originY + height * 0.15 + (hash2 - Math.floor(hash2)) * height * 0.15;

    branches.push(
      generateBoltPath(originX, originY, endX, endY, 5, width * 0.04, seed + b * 100)
    );
  }
  return branches;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const LightningBolt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  // Track bolt firing: scan backwards to find most recent onset peak
  const lastBoltFrame = React.useMemo(() => {
    let last = -Infinity;
    let cooldownEnd = 0;
    for (let i = 0; i < frames.length; i++) {
      if (i < cooldownEnd) continue;
      const f = frames[i];
      const onset = f?.onset ?? 0;
      if (onset > ONSET_THRESHOLD) {
        last = i;
        cooldownEnd = i + COOLDOWN_FRAMES;
      }
    }
    return last;
  }, [frames]);

  // Find the active bolt for current frame
  const activeBoltFrame = React.useMemo(() => {
    let bestBolt = -Infinity;
    let cooldownEnd = 0;
    for (let i = 0; i < frames.length && i <= frame; i++) {
      if (i < cooldownEnd) continue;
      const f = frames[i];
      const onset = f?.onset ?? 0;
      if (onset > ONSET_THRESHOLD) {
        bestBolt = i;
        cooldownEnd = i + COOLDOWN_FRAMES;
      }
    }
    return bestBolt;
  }, [frames, frame]);

  const framesSinceBolt = frame - activeBoltFrame;

  // Not visible if no bolt has fired or bolt has fully faded
  if (activeBoltFrame < 0 || framesSinceBolt > BOLT_FADE_FRAMES) {
    return null;
  }

  // Bolt fade: full brightness at strike, fading over BOLT_FADE_FRAMES
  const boltOpacity = interpolate(framesSinceBolt, [0, BOLT_FADE_FRAMES], [1.0, 0.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // White flash: 10% opacity for first FLASH_FRAMES, then gone
  const flashOpacity = framesSinceBolt < FLASH_FRAMES
    ? interpolate(framesSinceBolt, [0, FLASH_FRAMES], [0.10, 0.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // Generate bolt geometry deterministically from bolt frame (seed)
  const seed = activeBoltFrame;
  const mainBolt = generateBoltPath(
    width * 0.45, 0,            // top-center-ish
    width * 0.55, height,       // bottom-center-ish
    13,                          // 13-point bolt
    width * 0.08,               // jitter
    seed,
  );
  const branches = generateBranches(mainBolt, width, height, seed);

  // Bolt color: bright electric white-blue, uses palette highlight
  const boltColor = "#E8E0FF";
  const coreColor = "#FFFFFF";
  const glowColor = "#7B68EE";

  // Scale glow with onset intensity
  const glowSize = 8 + snap.onsetEnvelope * 20;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* White flash overlay */}
      {flashOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#FFFFFF",
            opacity: flashOpacity,
          }}
        />
      )}

      {/* Bolt SVG */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
        fill="none"
      >
        {/* Outer glow layer */}
        <path
          d={mainBolt}
          stroke={glowColor}
          strokeWidth={12}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.4}
          filter={`blur(${glowSize}px)`}
        />

        {/* Main bolt */}
        <path
          d={mainBolt}
          stroke={boltColor}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity}
          style={{ filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})` }}
        />

        {/* Core (white hot center) */}
        <path
          d={mainBolt}
          stroke={coreColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.9}
        />

        {/* Branch bolts */}
        {branches.map((branchPath, i) => (
          <React.Fragment key={i}>
            <path
              d={branchPath}
              stroke={boltColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={boltOpacity * 0.6}
              style={{ filter: `drop-shadow(0 0 ${glowSize * 0.6}px ${glowColor})` }}
            />
            <path
              d={branchPath}
              stroke={coreColor}
              strokeWidth={0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={boltOpacity * 0.5}
            />
          </React.Fragment>
        ))}
      </svg>
    </div>
  );
};
