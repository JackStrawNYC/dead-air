/**
 * CarouselHorses — 6 carousel horse silhouettes arranged in a circle,
 * rotating as if viewed from above. Each horse bobs up/down with a
 * slight phase offset (carousel pole motion). Ornate silhouette shapes.
 * Golden/warm amber color with carnival glow. Rotation speed driven
 * by tempo/energy. Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUM_HORSES = 6;
const CYCLE_FRAMES = 60 * 30; // 60s
const VISIBLE_FRAMES = 18 * 30; // 18s
const FADE_FRAMES = 60;

// Carousel horse silhouette as SVG path (ornate prancing horse)
// Normalized to roughly 0,0 to 60,70 bounding box
const HORSE_PATH =
  "M 15 70 L 15 50 C 15 45 10 40 12 35 C 14 30 18 28 20 25 " +
  "C 22 22 25 18 28 15 C 30 13 33 10 35 8 " +
  "C 37 6 40 5 42 6 C 44 7 45 10 44 13 " +
  "C 43 15 41 16 40 18 C 42 17 44 16 46 17 " +
  "C 48 18 49 20 48 22 L 45 25 " +
  "C 47 27 50 30 50 34 C 50 38 48 42 47 45 " +
  "L 47 50 L 47 70 " +
  "M 20 50 L 18 70 M 42 50 L 44 70 " +
  "M 25 35 C 26 33 28 31 30 30 " +
  "M 30 25 L 32 20 C 33 18 35 16 37 17 L 35 22";

// Pole line
const POLE_PATH = "M 30 10 L 30 0";

interface Props {
  frames: EnhancedFrameData[];
}

export const CarouselHorses: React.FC<Props> = ({ frames }) => {
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

  // Deterministic data (useMemo before any return null)
  const horsePhases = React.useMemo(() => {
    const rng = seeded(60197708);
    return Array.from({ length: NUM_HORSES }, () => ({
      bobPhase: rng() * Math.PI * 2,
      bobAmp: 8 + rng() * 12,
      bobFreq: 0.04 + rng() * 0.02,
    }));
  }, []);

  // Cycle timing
  const cyclePos = frame % CYCLE_FRAMES;
  const inShowWindow = cyclePos < VISIBLE_FRAMES;

  if (!inShowWindow) return null;

  // Fade envelope
  const fadeIn = interpolate(cyclePos, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(cyclePos, [VISIBLE_FRAMES - FADE_FRAMES, VISIBLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.6;

  if (masterOpacity < 0.01) return null;

  // Rotation speed driven by energy
  const rotSpeed = interpolate(energy, [0.03, 0.3], [0.3, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Current rotation angle (degrees)
  const rotAngle = frame * rotSpeed;

  // Carousel parameters
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = Math.min(width, height) * 0.28; // elliptical for perspective
  const radiusY = radiusX * 0.35; // foreshortened for top-down perspective
  const horseScale = 0.8;

  // Golden/amber color
  const baseHue = 40; // amber
  const glowColor = `rgba(255, 200, 80, 0.4)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 15px ${glowColor}) drop-shadow(0 0 30px rgba(255, 170, 40, 0.2))`,
        }}
      >
        {/* Center hub */}
        <circle
          cx={centerX}
          cy={centerY}
          r={12}
          fill="none"
          stroke={`hsla(${baseHue}, 80%, 60%, 0.5)`}
          strokeWidth={2}
        />

        {/* Horses arranged in circle */}
        {Array.from({ length: NUM_HORSES }, (_, hi) => {
          const angleOffset = (hi / NUM_HORSES) * 360;
          const angleRad = ((rotAngle + angleOffset) * Math.PI) / 180;

          // Position on ellipse
          const hx = centerX + Math.cos(angleRad) * radiusX;
          const hy = centerY + Math.sin(angleRad) * radiusY;

          // Bobbing (carousel pole motion)
          const hp = horsePhases[hi];
          const bob = Math.sin(frame * hp.bobFreq + hp.bobPhase) * hp.bobAmp;

          // Depth-based scaling: horses at front (bottom) appear larger
          const depthScale = interpolate(Math.sin(angleRad), [-1, 1], [0.5, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          // Depth-based opacity: back horses more transparent
          const depthAlpha = interpolate(Math.sin(angleRad), [-1, 1], [0.3, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const scale = horseScale * depthScale;

          // Horse faces direction of travel (tangent to circle)
          const facingRight = Math.cos(angleRad + Math.PI / 2) > 0;
          const flipX = facingRight ? 1 : -1;

          // Color: slightly warmer when closer
          const lightness = 55 + depthScale * 20;
          const strokeColor = `hsla(${baseHue}, 75%, ${lightness}%, ${depthAlpha})`;

          // Spoke from center to horse
          const spokeAlpha = depthAlpha * 0.3;

          return (
            <g key={hi}>
              {/* Spoke */}
              <line
                x1={centerX}
                y1={centerY}
                x2={hx}
                y2={hy + bob}
                stroke={`hsla(${baseHue}, 60%, 50%, ${spokeAlpha})`}
                strokeWidth={1}
              />
              {/* Horse */}
              <g
                transform={`translate(${hx}, ${hy + bob}) scale(${scale * flipX}, ${scale})`}
                style={{ transformOrigin: "0 0" }}
              >
                <g transform="translate(-30, -50)">
                  {/* Pole */}
                  <path
                    d={POLE_PATH}
                    stroke={`hsla(${baseHue}, 50%, 70%, ${depthAlpha * 0.6})`}
                    strokeWidth={2}
                    fill="none"
                  />
                  {/* Horse body */}
                  <path
                    d={HORSE_PATH}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    fill={`hsla(${baseHue}, 70%, ${lightness - 5}%, ${depthAlpha * 0.15})`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>
            </g>
          );
        })}

        {/* Outer ring */}
        <ellipse
          cx={centerX}
          cy={centerY}
          rx={radiusX + 20}
          ry={radiusY + 7}
          fill="none"
          stroke={`hsla(${baseHue}, 70%, 55%, 0.2)`}
          strokeWidth={1.5}
          strokeDasharray="8 4"
        />
      </svg>
    </div>
  );
};
