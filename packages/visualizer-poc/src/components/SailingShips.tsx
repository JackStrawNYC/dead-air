/**
 * SailingShips -- 2-3 tall sailing ship silhouettes on the horizon.
 * Ships have hull, 2-3 masts with triangular/rectangular sails.
 * Sails billow (slight deformation) with energy. Ships rock gently on waves
 * (small sine rotation). Dark silhouette against lighter sky area.
 * Ocean wave line beneath. Cycle: 70s, 20s visible.
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

const NUM_SHIPS = 3;
const VISIBLE_DURATION = 600; // 20s at 30fps
const CYCLE_GAP = 1500;       // 50s gap (70s total - 20s visible)
const CYCLE_TOTAL = VISIBLE_DURATION + CYCLE_GAP;

interface ShipDef {
  xFraction: number;
  scale: number;
  rockPhase: number;
  rockFreq: number;
  driftSpeed: number;
  numMasts: number;
}

function generateShips(seed: number): ShipDef[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_SHIPS }, () => ({
    xFraction: 0.1 + rng() * 0.7,
    scale: 0.7 + rng() * 0.5,
    rockPhase: rng() * Math.PI * 2,
    rockFreq: 0.02 + rng() * 0.015,
    driftSpeed: 0.15 + rng() * 0.25,
    numMasts: 2 + Math.floor(rng() * 2), // 2 or 3
  }));
}

/** Single ship SVG with hull, masts, and sails */
const Ship: React.FC<{
  numMasts: number;
  sailBillow: number; // 0-1, how much sails billow
  shipScale: number;
}> = ({ numMasts, sailBillow, shipScale }) => {
  const w = 140 * shipScale;
  const h = 120 * shipScale;
  const billow = 3 + sailBillow * 8;

  return (
    <svg width={w} height={h} viewBox="0 0 140 120" fill="none">
      {/* Hull */}
      <path
        d="M 15 85 Q 20 100, 70 100 Q 120 100, 125 85 L 130 80 L 10 80 Z"
        fill="#1B2631"
        opacity="0.85"
      />
      {/* Hull highlight */}
      <path
        d="M 20 82 Q 70 88, 120 82"
        stroke="#34495E"
        strokeWidth="1.5"
        fill="none"
        opacity="0.5"
      />
      {/* Bowsprit */}
      <line x1="125" y1="78" x2="138" y2="68" stroke="#1B2631" strokeWidth="2" opacity="0.8" />

      {/* Masts and sails */}
      {Array.from({ length: numMasts }, (_, mi) => {
        const mastX = 40 + mi * 30;
        const mastTop = 10 + mi * 5;
        const mastBottom = 80;
        return (
          <g key={mi}>
            {/* Mast */}
            <line
              x1={mastX}
              y1={mastTop}
              x2={mastX}
              y2={mastBottom}
              stroke="#1B2631"
              strokeWidth="2.5"
              opacity="0.9"
            />
            {/* Square sail (rectangle with billow) */}
            <path
              d={`M ${mastX - 15} ${mastTop + 8} Q ${mastX} ${mastTop + 8 + billow}, ${mastX + 15} ${mastTop + 8} L ${mastX + 15} ${mastTop + 35} Q ${mastX} ${mastTop + 35 + billow * 0.5}, ${mastX - 15} ${mastTop + 35} Z`}
              fill="#2C3E50"
              opacity="0.75"
            />
            {/* Triangular sail (fore-and-aft) */}
            <path
              d={`M ${mastX} ${mastTop + 2} L ${mastX + 18 + billow * 0.8} ${mastTop + 40} L ${mastX} ${mastTop + 45} Z`}
              fill="#34495E"
              opacity="0.6"
            />
            {/* Yard (horizontal beam) */}
            <line
              x1={mastX - 16}
              y1={mastTop + 8}
              x2={mastX + 16}
              y2={mastTop + 8}
              stroke="#1B2631"
              strokeWidth="1.5"
              opacity="0.7"
            />
          </g>
        );
      })}

      {/* Flag on tallest mast */}
      <polygon
        points={`40,10 ${52 + billow * 0.5},6 ${52 + billow * 0.3},14`}
        fill="#922B21"
        opacity="0.7"
      />

      {/* Rigging lines */}
      <line x1="40" y1="10" x2="15" y2="78" stroke="#1B2631" strokeWidth="0.8" opacity="0.35" />
      <line x1="40" y1="10" x2="125" y2="78" stroke="#1B2631" strokeWidth="0.8" opacity="0.35" />
      {numMasts >= 3 && (
        <line x1="100" y1="20" x2="130" y2="70" stroke="#1B2631" strokeWidth="0.8" opacity="0.3" />
      )}
    </svg>
  );
};

interface Props {
  frames: EnhancedFrameData[];
}

export const SailingShips: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const ships = React.useMemo(() => generateShips(14920101), []);

  // Energy calculation
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  const cycleFrame = frame % CYCLE_TOTAL;

  if (cycleFrame >= VISIBLE_DURATION) return null;

  const progress = cycleFrame / VISIBLE_DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.75;

  if (masterOpacity < 0.01) return null;

  // Horizon line at about 60% height
  const horizonY = height * 0.6;

  // Wave line
  const waveSegments = 60;
  const wavePoints: string[] = [];
  for (let s = 0; s <= waveSegments; s++) {
    const sx = (s / waveSegments) * width;
    const wave1 = Math.sin(s * 0.3 + frame * 0.04) * 3;
    const wave2 = Math.sin(s * 0.15 + frame * 0.025) * 5;
    const sy = horizonY + wave1 + wave2;
    wavePoints.push(s === 0 ? `M ${sx} ${sy}` : `L ${sx} ${sy}`);
  }
  const wavePath = wavePoints.join(" ");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Ocean wave line */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          opacity: masterOpacity * 0.5,
        }}
      >
        <path d={wavePath} stroke="#34495E" strokeWidth="2" fill="none" opacity="0.6" />
      </svg>

      {/* Ships */}
      {ships.map((ship, si) => {
        // Slow drift
        const driftX = ship.xFraction * width + Math.sin(frame * 0.003 + si * 2) * 30 * ship.driftSpeed;

        // Rocking on waves
        const rock = Math.sin(frame * ship.rockFreq + ship.rockPhase) * (2 + energy * 3);

        // Vertical bob on waves
        const bob = Math.sin(frame * ship.rockFreq * 0.8 + ship.rockPhase + 0.5) * (2 + energy * 2);

        // Sail billow from energy
        const sailBillow = interpolate(energy, [0.02, 0.25], [0.1, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        const shipH = 120 * ship.scale;

        return (
          <div
            key={si}
            style={{
              position: "absolute",
              left: driftX - 70 * ship.scale,
              top: horizonY - shipH * 0.8 + bob,
              transformOrigin: "center bottom",
              transform: `rotate(${rock}deg)`,
              opacity: masterOpacity,
              filter: `drop-shadow(0 0 6px rgba(52, 73, 94, 0.4))`,
              willChange: "transform, opacity",
            }}
          >
            <Ship
              numMasts={ship.numMasts}
              sailBillow={sailBillow}
              shipScale={ship.scale}
            />
          </div>
        );
      })}
    </div>
  );
};
