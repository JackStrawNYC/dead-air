/**
 * CactusGarden — 5-8 desert cactus silhouettes at bottom of screen.
 * Saguaro cacti (tall with arms), barrel cacti (round), prickly pear (paddle shapes).
 * Dark green silhouettes against whatever background.
 * Small flowers bloom on tips during energy peaks (pink/yellow dots).
 * Occasional tumbleweed rolls across. Desert atmosphere.
 * Cycle: 75s (2250 frames), 20s (600 frames) visible.
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

const CYCLE_TOTAL = 2250; // 75s
const VISIBLE_DURATION = 600; // 20s

type CactusType = "saguaro" | "barrel" | "prickly_pear";

interface CactusData {
  type: CactusType;
  x: number; // normalized 0-1
  scale: number;
  armAngleL: number; // saguaro arm angles
  armAngleR: number;
  armHeightL: number; // saguaro arm heights (0-1 fraction of body)
  armHeightR: number;
  flowerCount: number; // how many potential flower spots
}

interface TumbleweedData {
  startFrame: number;
  speed: number;
  y: number; // normalized
  size: number;
  bounceFreq: number;
}

function generateCacti(seed: number): CactusData[] {
  const rng = seeded(seed);
  const types: CactusType[] = ["saguaro", "saguaro", "barrel", "saguaro", "prickly_pear", "barrel", "saguaro"];
  return types.map((type, i) => ({
    type,
    x: 0.05 + (i / (types.length - 1)) * 0.9,
    scale: 0.7 + rng() * 0.6,
    armAngleL: 30 + rng() * 40,
    armAngleR: 30 + rng() * 40,
    armHeightL: 0.3 + rng() * 0.3,
    armHeightR: 0.4 + rng() * 0.3,
    flowerCount: 1 + Math.floor(rng() * 3),
  }));
}

function generateTumbleweeds(seed: number): TumbleweedData[] {
  const rng = seeded(seed);
  const weeds: TumbleweedData[] = [];
  // Schedule tumbleweeds throughout visible duration
  for (let f = 0; f < VISIBLE_DURATION; f += 120 + Math.floor(rng() * 200)) {
    weeds.push({
      startFrame: f,
      speed: 2 + rng() * 3,
      y: 0.82 + rng() * 0.1,
      size: 12 + rng() * 10,
      bounceFreq: 0.06 + rng() * 0.04,
    });
  }
  return weeds;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const CactusGarden: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cacti = React.useMemo(() => generateCacti(19770501), []);
  const tumbleweeds = React.useMemo(() => generateTumbleweeds(19770502), []);

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * 0.7;

  if (opacity < 0.01) return null;

  // Flower bloom threshold
  const flowerBloom = energy > 0.2;
  const flowerOpacity = interpolate(energy, [0.2, 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const groundY = height * 0.88;
  const darkGreen = "#1B5E20";
  const medGreen = "#2E7D32";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          <filter id="cactus-shadow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ground line hint */}
        <line
          x1={0}
          y1={groundY}
          x2={width}
          y2={groundY}
          stroke="rgba(139,119,101,0.15)"
          strokeWidth={1}
        />

        {/* Cacti */}
        {cacti.map((cactus, ci) => {
          const cx = cactus.x * width;
          const baseScale = cactus.scale;

          if (cactus.type === "saguaro") {
            const bodyW = 22 * baseScale;
            const bodyH = 120 * baseScale;
            const armW = 14 * baseScale;
            const armLen = 45 * baseScale;

            const bodyX = cx;
            const bodyBottom = groundY;
            const bodyTop = bodyBottom - bodyH;

            // Left arm
            const armLY = bodyBottom - bodyH * cactus.armHeightL;
            const armLEndX = cx - armLen;
            const armLEndY = armLY - armLen * 0.6;

            // Right arm
            const armRY = bodyBottom - bodyH * cactus.armHeightR;
            const armREndX = cx + armLen;
            const armREndY = armRY - armLen * 0.5;

            // Gentle sway from energy
            const sway = Math.sin(frame * 0.02 + ci * 1.5) * energy * 3;

            return (
              <g key={ci} transform={`translate(${sway}, 0)`} filter="url(#cactus-shadow)">
                {/* Main body */}
                <rect
                  x={bodyX - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={bodyH}
                  rx={bodyW / 2}
                  fill={darkGreen}
                />
                {/* Body highlight */}
                <rect
                  x={bodyX - bodyW / 6}
                  y={bodyTop + 10}
                  width={bodyW / 3}
                  height={bodyH - 20}
                  rx={bodyW / 6}
                  fill={medGreen}
                  opacity={0.3}
                />

                {/* Left arm: vertical from body then up */}
                <line
                  x1={cx - bodyW / 2}
                  y1={armLY}
                  x2={armLEndX}
                  y2={armLY}
                  stroke={darkGreen}
                  strokeWidth={armW}
                  strokeLinecap="round"
                />
                <line
                  x1={armLEndX}
                  y1={armLY}
                  x2={armLEndX}
                  y2={armLEndY}
                  stroke={darkGreen}
                  strokeWidth={armW}
                  strokeLinecap="round"
                />

                {/* Right arm */}
                <line
                  x1={cx + bodyW / 2}
                  y1={armRY}
                  x2={armREndX}
                  y2={armRY}
                  stroke={darkGreen}
                  strokeWidth={armW}
                  strokeLinecap="round"
                />
                <line
                  x1={armREndX}
                  y1={armRY}
                  x2={armREndX}
                  y2={armREndY}
                  stroke={darkGreen}
                  strokeWidth={armW}
                  strokeLinecap="round"
                />

                {/* Flowers on tips during energy peaks */}
                {flowerBloom && (
                  <>
                    <circle cx={bodyX} cy={bodyTop - 3} r={5 * baseScale} fill="#FF80AB" opacity={flowerOpacity} />
                    <circle cx={armLEndX} cy={armLEndY - 3} r={4 * baseScale} fill="#FFD54F" opacity={flowerOpacity} />
                    {cactus.flowerCount > 1 && (
                      <circle cx={armREndX} cy={armREndY - 3} r={4 * baseScale} fill="#FF80AB" opacity={flowerOpacity} />
                    )}
                  </>
                )}
              </g>
            );
          }

          if (cactus.type === "barrel") {
            const r = 25 * baseScale;
            const barrelY = groundY - r;

            return (
              <g key={ci} filter="url(#cactus-shadow)">
                {/* Body */}
                <circle cx={cx} cy={barrelY} r={r} fill={darkGreen} />
                {/* Ribs (vertical lines) */}
                {Array.from({ length: 6 }).map((_, ri) => {
                  const angle = (ri / 6) * Math.PI - Math.PI / 2;
                  const x1 = cx + Math.cos(angle) * r * 0.3;
                  const y1 = barrelY - r * 0.8;
                  const x2 = cx + Math.cos(angle) * r * 0.9;
                  const y2 = barrelY + r * 0.6;
                  return (
                    <line
                      key={ri}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={medGreen}
                      strokeWidth={1}
                      opacity={0.3}
                    />
                  );
                })}
                {/* Flower on top */}
                {flowerBloom && cactus.flowerCount > 0 && (
                  <circle cx={cx} cy={barrelY - r - 2} r={4 * baseScale} fill="#FFD54F" opacity={flowerOpacity} />
                )}
              </g>
            );
          }

          if (cactus.type === "prickly_pear") {
            const padW = 30 * baseScale;
            const padH = 40 * baseScale;
            const baseY = groundY;

            return (
              <g key={ci} filter="url(#cactus-shadow)">
                {/* Base paddle */}
                <ellipse cx={cx} cy={baseY - padH * 0.5} rx={padW * 0.5} ry={padH * 0.5} fill={darkGreen} />
                {/* Left upper paddle */}
                <ellipse cx={cx - padW * 0.4} cy={baseY - padH * 1.2} rx={padW * 0.4} ry={padH * 0.4} fill={darkGreen} />
                {/* Right upper paddle */}
                <ellipse cx={cx + padW * 0.35} cy={baseY - padH * 1.1} rx={padW * 0.35} ry={padH * 0.38} fill={darkGreen} />
                {/* Top paddle */}
                <ellipse cx={cx - padW * 0.1} cy={baseY - padH * 1.7} rx={padW * 0.3} ry={padH * 0.3} fill={medGreen} />
                {/* Flowers */}
                {flowerBloom && (
                  <>
                    <circle cx={cx - padW * 0.1} cy={baseY - padH * 2} r={3 * baseScale} fill="#FF80AB" opacity={flowerOpacity} />
                    <circle cx={cx + padW * 0.35} cy={baseY - padH * 1.5} r={3 * baseScale} fill="#FFD54F" opacity={flowerOpacity} />
                  </>
                )}
              </g>
            );
          }

          return null;
        })}

        {/* Tumbleweeds */}
        {tumbleweeds.map((tw, twi) => {
          const elapsed = cycleFrame - tw.startFrame;
          if (elapsed < 0 || elapsed > 200) return null;

          const twProgress = elapsed / 200;
          const twX = interpolate(twProgress, [0, 1], [-tw.size * 2, width + tw.size * 2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const twY = tw.y * height + Math.abs(Math.sin(elapsed * tw.bounceFreq)) * -20;
          const twRotation = elapsed * 4;

          const twFadeIn = interpolate(twProgress, [0, 0.05], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const twFadeOut = interpolate(twProgress, [0.9, 1], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const twOpacity = Math.min(twFadeIn, twFadeOut) * 0.5;

          return (
            <g
              key={`tw${twi}`}
              transform={`translate(${twX}, ${twY}) rotate(${twRotation})`}
              opacity={twOpacity}
            >
              {/* Tumbleweed: tangled circle of lines */}
              <circle cx={0} cy={0} r={tw.size} fill="none" stroke="#8D6E63" strokeWidth={1.5} opacity={0.6} />
              <circle cx={0} cy={0} r={tw.size * 0.7} fill="none" stroke="#A1887F" strokeWidth={1} opacity={0.4} />
              <line x1={-tw.size * 0.8} y1={-tw.size * 0.3} x2={tw.size * 0.6} y2={tw.size * 0.5} stroke="#8D6E63" strokeWidth={1} opacity={0.3} />
              <line x1={-tw.size * 0.5} y1={tw.size * 0.7} x2={tw.size * 0.8} y2={-tw.size * 0.4} stroke="#8D6E63" strokeWidth={1} opacity={0.3} />
              <line x1={tw.size * 0.2} y1={-tw.size * 0.9} x2={-tw.size * 0.3} y2={tw.size * 0.8} stroke="#A1887F" strokeWidth={0.8} opacity={0.3} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
