/**
 * SteamTrain -- Steam locomotive silhouette chugging across the bottom of screen
 * from left to right. Simple train shape: engine body, smokestack, wheels
 * (circles that rotate), cowcatcher, tender car. Puffs of steam rising from
 * smokestack at regular intervals. Speed and steam puff rate driven by energy.
 * Dark silhouette with warm highlight details. Cycle: 55s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VISIBLE_DURATION = 480; // 16s at 30fps
const CYCLE_GAP = 1170;       // 39s gap (55s total - 16s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;
const TRAIN_WIDTH = 320;
const TRAIN_HEIGHT = 120;

// Pre-generate steam puff offsets
interface SteamPuff {
  offsetX: number;
  offsetY: number;
  driftX: number;
  driftY: number;
  maxRadius: number;
  birthFrame: number; // frame offset within cycle when this puff appears
}

function generatePuffs(seed: number): SteamPuff[] {
  const rng = seeded(seed);
  const puffs: SteamPuff[] = [];
  // Generate a puff every ~8-12 frames across the visible duration
  for (let f = 0; f < VISIBLE_DURATION; f += 8) {
    puffs.push({
      offsetX: -5 + rng() * 10,
      offsetY: -5 + rng() * 5,
      driftX: -15 - rng() * 25,
      driftY: -30 - rng() * 50,
      maxRadius: 6 + rng() * 12,
      birthFrame: f,
    });
  }
  return puffs;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SteamTrain: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const puffs = React.useMemo(() => generatePuffs(18690510), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleIndex = Math.floor(frame / CYCLE_TOTAL);
  const cycleFrame = frame % CYCLE_TOTAL;
  const goingRight = cycleIndex % 2 === 0;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.85;

  if (masterOpacity < 0.01) return null;

  // Train position across screen
  const startX = goingRight ? -TRAIN_WIDTH - 50 : width + 50;
  const endX = goingRight ? width + 50 : -TRAIN_WIDTH - 50;
  const trainX = interpolate(progress, [0, 1], [startX, endX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const trainY = height - TRAIN_HEIGHT - 20;

  // Wheel rotation based on distance traveled
  const distanceTraveled = Math.abs(trainX - startX);
  const wheelCircumference = Math.PI * 28; // wheel diameter ~28px
  const wheelRotation = (distanceTraveled / wheelCircumference) * 360;

  // Slight vertical chug (bounce)
  const chugSpeed = 6 + energy * 10;
  const chugAmp = 1.5 + energy * 2;
  const chug = Math.abs(Math.sin(frame * chugSpeed * 0.05)) * chugAmp;

  // Warm glow
  const glowColor = "#FF6F00";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: trainX,
          top: trainY - chug,
          opacity: masterOpacity,
          transform: `scaleX(${goingRight ? 1 : -1})`,
          filter: `drop-shadow(0 0 8px ${glowColor}66) drop-shadow(0 0 20px ${glowColor}33)`,
          willChange: "transform, opacity",
        }}
      >
        <svg width={TRAIN_WIDTH} height={TRAIN_HEIGHT} viewBox="0 0 320 120" fill="none">
          {/* Track/rail line */}
          <line x1="0" y1="108" x2="320" y2="108" stroke="#4E342E" strokeWidth="3" opacity="0.6" />

          {/* Cowcatcher */}
          <polygon points="260,95 285,100 285,108 255,108" fill="#37474F" opacity="0.8" />

          {/* Engine body */}
          <rect x="100" y="55" width="160" height="50" rx="4" fill="#263238" opacity="0.9" />

          {/* Boiler (cylinder) */}
          <rect x="160" y="40" width="90" height="35" rx="17" fill="#37474F" opacity="0.9" />

          {/* Cabin */}
          <rect x="100" y="30" width="55" height="45" rx="3" fill="#263238" opacity="0.9" />
          {/* Cabin roof */}
          <rect x="96" y="26" width="63" height="8" rx="2" fill="#37474F" opacity="0.8" />
          {/* Cabin window */}
          <rect x="110" y="40" width="20" height="15" rx="2" fill="#FF8F00" opacity="0.5" />
          {/* Cabin window glow */}
          <rect x="112" y="42" width="16" height="11" rx="1" fill="#FFB300" opacity="0.3" />

          {/* Smokestack */}
          <rect x="230" y="20" width="16" height="25" rx="2" fill="#263238" opacity="0.9" />
          <rect x="226" y="16" width="24" height="8" rx="3" fill="#37474F" opacity="0.8" />

          {/* Dome on boiler */}
          <ellipse cx="200" cy="40" rx="12" ry="8" fill="#455A64" opacity="0.8" />

          {/* Tender car */}
          <rect x="30" y="55" width="65" height="45" rx="3" fill="#37474F" opacity="0.85" />
          <rect x="35" y="60" width="55" height="25" rx="2" fill="#263238" opacity="0.6" />

          {/* Coupling between tender and engine */}
          <rect x="95" y="78" width="10" height="6" rx="1" fill="#455A64" opacity="0.7" />

          {/* Warm accent lines on engine */}
          <line x1="165" y1="75" x2="250" y2="75" stroke="#FF6F00" strokeWidth="2" opacity="0.4" />
          <line x1="165" y1="85" x2="250" y2="85" stroke="#FF6F00" strokeWidth="1.5" opacity="0.3" />

          {/* Drive wheels (engine) - 3 large */}
          {[170, 210, 250].map((cx, wi) => (
            <g key={`ew-${wi}`} transform={`rotate(${wheelRotation} ${cx} 100)`}>
              <circle cx={cx} cy={100} r={14} stroke="#546E7A" strokeWidth="3" fill="#263238" opacity="0.9" />
              {/* Spokes */}
              {[0, 45, 90, 135].map((angle) => (
                <line
                  key={angle}
                  x1={cx + Math.cos((angle * Math.PI) / 180) * 4}
                  y1={100 + Math.sin((angle * Math.PI) / 180) * 4}
                  x2={cx + Math.cos((angle * Math.PI) / 180) * 12}
                  y2={100 + Math.sin((angle * Math.PI) / 180) * 12}
                  stroke="#78909C"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              ))}
              <circle cx={cx} cy={100} r={3} fill="#78909C" opacity="0.7" />
            </g>
          ))}

          {/* Tender wheels - 2 smaller */}
          {[50, 80].map((cx, wi) => (
            <g key={`tw-${wi}`} transform={`rotate(${wheelRotation} ${cx} 102)`}>
              <circle cx={cx} cy={102} r={10} stroke="#546E7A" strokeWidth="2.5" fill="#263238" opacity="0.9" />
              {[0, 60, 120].map((angle) => (
                <line
                  key={angle}
                  x1={cx + Math.cos((angle * Math.PI) / 180) * 3}
                  y1={102 + Math.sin((angle * Math.PI) / 180) * 3}
                  x2={cx + Math.cos((angle * Math.PI) / 180) * 8}
                  y2={102 + Math.sin((angle * Math.PI) / 180) * 8}
                  stroke="#78909C"
                  strokeWidth="1.2"
                  opacity="0.5"
                />
              ))}
              <circle cx={cx} cy={102} r={2} fill="#78909C" opacity="0.6" />
            </g>
          ))}

          {/* Connecting rod between drive wheels */}
          <line
            x1={170 + Math.cos((wheelRotation * Math.PI) / 180) * 10}
            y1={100 + Math.sin((wheelRotation * Math.PI) / 180) * 10}
            x2={250 + Math.cos((wheelRotation * Math.PI) / 180) * 10}
            y2={100 + Math.sin((wheelRotation * Math.PI) / 180) * 10}
            stroke="#78909C"
            strokeWidth="2"
            opacity="0.5"
          />
        </svg>

        {/* Steam puffs */}
        <svg
          width={200}
          height={120}
          viewBox="0 0 200 120"
          style={{ position: "absolute", left: 195, top: -80 }}
        >
          {puffs.map((puff, pi) => {
            const age = cycleFrame - puff.birthFrame;
            if (age < 0 || age > 60) return null;
            const lifeProgress = age / 60;
            const puffOpacity = interpolate(lifeProgress, [0, 0.2, 0.7, 1], [0, 0.5, 0.3, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const radius = puff.maxRadius * interpolate(lifeProgress, [0, 1], [0.3, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const cx = 40 + puff.offsetX + puff.driftX * lifeProgress;
            const cy = 100 + puff.offsetY + puff.driftY * lifeProgress;
            return (
              <circle
                key={pi}
                cx={cx}
                cy={cy}
                r={radius}
                fill="#B0BEC5"
                opacity={puffOpacity * (0.4 + energy * 0.4)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};
