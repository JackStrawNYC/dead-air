/**
 * ComicExplosions -- POW! BANG! ZAP! BOOM! comic book impact bursts on energy peaks.
 * When energy > 0.28, spawn a comic word in a spiky star burst shape.
 * The burst is a jagged polygon (star with 12-16 points). Bold text inside.
 * 4 different words cycle. Positioned randomly. Each burst lasts 30 frames
 * (quick scale-up then fade). Max 2 simultaneous. Bright yellow/red/white
 * comic colors. Black outline on text.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const WORDS = ["POW!", "BANG!", "ZAP!", "BOOM!"];

const BURST_COLORS = [
  { fill: "#FFD700", stroke: "#FF4500", text: "#FF0000" },   // gold burst, red text
  { fill: "#FF1744", stroke: "#FFD600", text: "#FFFFFF" },   // red burst, white text
  { fill: "#FFEA00", stroke: "#FF6D00", text: "#D50000" },   // yellow burst, dark red text
  { fill: "#FFFFFF", stroke: "#FF1493", text: "#FF1493" },   // white burst, pink text
];

const BURST_DURATION = 30; // frames
const MIN_SPAWN_GAP = 40; // minimum frames between spawns

/** Generate spiky star burst polygon points */
function generateBurstPath(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    coords.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
  }
  return coords.join(" ");
}

interface BurstInstance {
  spawnFrame: number;
  x: number;
  y: number;
  wordIdx: number;
  colorIdx: number;
  pointCount: number;
  rotation: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const ComicExplosions: React.FC<Props> = ({ frames }) => {
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

  // Pre-compute all possible burst spawn points deterministically
  const bursts = React.useMemo(() => {
    const rng = seeded(77_770_508);
    const all: BurstInstance[] = [];
    let lastSpawn = -MIN_SPAWN_GAP;

    for (let f = 0; f < frames.length; f++) {
      // Check rolling energy at this frame
      let eS = 0;
      let eC = 0;
      for (let j = Math.max(0, f - 75); j <= Math.min(frames.length - 1, f + 75); j++) {
        eS += frames[j].rms;
        eC++;
      }
      const e = eC > 0 ? eS / eC : 0;

      if (e > 0.28 && f - lastSpawn >= MIN_SPAWN_GAP && frames[f].onset > 0.3) {
        const x = 0.15 + rng() * 0.7; // 15-85% of width
        const y = 0.1 + rng() * 0.6;  // 10-70% of height
        all.push({
          spawnFrame: f,
          x,
          y,
          wordIdx: Math.floor(rng() * WORDS.length),
          colorIdx: Math.floor(rng() * BURST_COLORS.length),
          pointCount: 12 + Math.floor(rng() * 5), // 12-16 points
          rotation: (rng() - 0.5) * 30,
        });
        lastSpawn = f;
      }
    }
    return all;
  }, [frames]);

  // Find active bursts (max 2)
  const activeBursts = bursts
    .filter((b) => frame >= b.spawnFrame && frame < b.spawnFrame + BURST_DURATION)
    .slice(0, 2);

  if (activeBursts.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {activeBursts.map((burst, bi) => {
        const localFrame = frame - burst.spawnFrame;
        const localProgress = localFrame / BURST_DURATION;

        // Quick scale up then hold
        const scale = interpolate(localProgress, [0, 0.15, 0.7, 1], [0.1, 1.15, 1.0, 0.8], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });

        // Fade out in last 30%
        const opacity = interpolate(localProgress, [0, 0.1, 0.7, 1], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const colors = BURST_COLORS[burst.colorIdx];
        const word = WORDS[burst.wordIdx];
        const bx = burst.x * width;
        const by = burst.y * height;
        const burstSize = 90 + energy * 80;

        const burstPath = generateBurstPath(0, 0, burstSize, burstSize * 0.55, burst.pointCount);

        return (
          <div
            key={bi}
            style={{
              position: "absolute",
              left: bx,
              top: by,
              transform: `translate(-50%, -50%) scale(${scale}) rotate(${burst.rotation}deg)`,
              opacity,
              filter: `drop-shadow(0 0 8px ${colors.stroke})`,
              willChange: "transform, opacity",
            }}
          >
            <svg
              width={burstSize * 2.4}
              height={burstSize * 2.4}
              viewBox={`${-burstSize * 1.2} ${-burstSize * 1.2} ${burstSize * 2.4} ${burstSize * 2.4}`}
            >
              {/* Burst shape */}
              <polygon
                points={burstPath}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth="3"
              />
              {/* Inner highlight */}
              <polygon
                points={generateBurstPath(0, 0, burstSize * 0.75, burstSize * 0.45, burst.pointCount)}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1.5"
              />
              {/* Text with black outline */}
              <text
                x="0"
                y="8"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="Impact, 'Arial Black', sans-serif"
                fontSize={burstSize * 0.45}
                fontWeight="900"
                fill={colors.text}
                stroke="black"
                strokeWidth="3"
                paintOrder="stroke"
                style={{ letterSpacing: "2px" }}
              >
                {word}
              </text>
            </svg>
          </div>
        );
      })}
    </div>
  );
};
