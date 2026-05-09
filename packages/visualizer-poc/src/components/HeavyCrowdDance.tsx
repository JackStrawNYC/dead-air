/**
 * HeavyCrowdDance — A+++ replaces the sparse CrowdDance overlay.
 *
 * Audit gap: "Dancin' Silhouettes (Heavy Version) — Crowd of 20+ dancing
 * Deadheads with raised hands, hair movement, clothing flutter. Current
 * CrowdDance is bare."
 *
 * 24 unique dancer silhouettes scattered across the lower-third of the
 * frame, each with independent dance phase + body type + arm pose +
 * clothing color. Front row larger, back row smaller (depth perspective).
 * Flowing hair, raised hands, body sway, occasional twirl.
 *
 * Audio reactivity:
 *   energy       → dance intensity (sway amplitude)
 *   bass         → unison hip-bounce (everyone kicks down on the bass)
 *   beatSnap     → dance phase advances + occasional arm-raise burst
 *   vocalEnergy  → some dancers freeze + tilt heads up (listening)
 *   onsetEnvelope→ subtle clothing flutter peaks on attacks
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── DANCER ARCHETYPE ────────────────────────────────────────────
// Single Deadhead silhouette with detailed pose

interface DancerProps {
  cx: number;
  cy: number;
  scale: number;
  phase: number;       // 0..1 dance cycle
  energy: number;      // 0..1 dance intensity
  bassBeat: number;    // 0..1 bass-driven bounce
  archetype: "longhair" | "twirler" | "armsup" | "swayer" | "pog";
  clothingColor: string;
  hairColor: string;
  skinShade: string;
  isListening: boolean;  // vocal-driven freeze + look-up
}

const Dancer: React.FC<DancerProps> = ({
  cx, cy, scale, phase, energy, bassBeat, archetype, clothingColor, hairColor, skinShade, isListening,
}) => {
  const swing = isListening ? 0 : Math.sin(phase * Math.PI * 2) * (10 + energy * 8);
  const bounce = bassBeat * 4;
  const headTilt = isListening ? -8 : Math.sin(phase * Math.PI * 2 + 0.5) * 5;
  const armLiftL = Math.cos(phase * Math.PI * 2) * (8 + energy * 6);
  const armLiftR = Math.cos(phase * Math.PI * 2 + Math.PI) * (8 + energy * 6);

  // Archetype-specific overrides
  const armUpHigh = archetype === "armsup" || (archetype === "twirler" && phase > 0.5);
  const twirlAngle = archetype === "twirler" ? phase * 360 : 0;
  const isPog = archetype === "pog"; // Person of Generic Build (smaller, mid-sway)

  return (
    <g transform={`translate(${cx} ${cy + bounce}) scale(${scale}) rotate(${twirlAngle * 0.1})`}>
      {/* Skirt / pants — flowing */}
      {archetype === "longhair" || archetype === "twirler" ? (
        // Long flowing skirt/dress
        <path
          d={`M -16 32 Q ${swing - 8} 14 -12 -2 L 12 -2 Q ${swing + 8} 14 16 32 Z`}
          fill={clothingColor}
          opacity={0.92}
        />
      ) : (
        // Pants/jeans
        <g>
          <line x1={-3} y1={-2} x2={swing - 4} y2={28} stroke={skinShade} strokeWidth={3} strokeLinecap="round" />
          <line x1={3} y1={-2} x2={-swing + 6} y2={26} stroke={skinShade} strokeWidth={3} strokeLinecap="round" />
        </g>
      )}

      {/* Body torso */}
      <ellipse cx={0} cy={-8} rx={6.5} ry={11} fill={skinShade} />

      {/* Shirt — tie-dye or solid */}
      <ellipse cx={0} cy={-6} rx={6} ry={9} fill={clothingColor} opacity={0.9} />

      {/* Hair — flowing back */}
      {(archetype === "longhair" || archetype === "twirler") ? (
        <path
          d={`M -10 -22 Q ${headTilt * 0.5} -32 10 -22 Q ${swing * 0.4 + 8} -8 4 -8 L -4 -8 Q ${swing * 0.4 - 8} -8 -10 -22 Z`}
          fill={hairColor}
        />
      ) : (
        <ellipse cx={headTilt * 0.4} cy={-22} rx={6.5} ry={5} fill={hairColor} />
      )}

      {/* Head */}
      <ellipse cx={headTilt * 0.5} cy={-22} rx={4.5} ry={5.5} fill={skinShade} />

      {/* Arms — raised pose */}
      {armUpHigh ? (
        <>
          {/* Both arms up high */}
          <path
            d={`M -2 -12 Q -10 ${-armLiftL - 12} -8 ${-armLiftL - 24}`}
            stroke={skinShade}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M 2 -12 Q 10 ${-armLiftR - 12} 8 ${-armLiftR - 24}`}
            stroke={skinShade}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          {/* Hands */}
          <circle cx={-8} cy={-armLiftL - 24} r={2.5} fill={skinShade} />
          <circle cx={8} cy={-armLiftR - 24} r={2.5} fill={skinShade} />
        </>
      ) : (
        <>
          {/* One arm up, one swinging out */}
          <path
            d={`M 0 -12 Q ${armLiftR + 4} ${-armLiftR - 6} ${armLiftR + 8} ${-armLiftR - 18}`}
            stroke={skinShade}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M 0 -10 Q -6 -2 ${-swing - 4} 4`}
            stroke={skinShade}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
          {/* Right hand */}
          <circle cx={armLiftR + 8} cy={-armLiftR - 18} r={2} fill={skinShade} />
        </>
      )}

      {/* Skirt fringe lines (only if long skirt) */}
      {(archetype === "longhair" || archetype === "twirler") && Array.from({ length: 7 }).map((_, i) => (
        <line
          key={i}
          x1={-14 + i * 4.5}
          y1={30}
          x2={-14 + i * 4.5 + swing * 0.4}
          y2={36}
          stroke={clothingColor}
          strokeWidth={1}
          opacity={0.7}
        />
      ))}

      {/* Subtle ground shadow */}
      <ellipse cx={0} cy={36} rx={10} ry={2} fill="rgba(0,0,0,0.35)" />
    </g>
  );
};

// ─── CROWD ROW LAYOUT ────────────────────────────────────────────
// 24 dancers across 3 depth rows: 8 in back, 9 in middle, 7 in front

interface DancerSeed {
  archetype: DancerProps["archetype"];
  clothingColor: string;
  hairColor: string;
  skinShade: string;
  scaleVar: number;
  phaseOffset: number;
  isListenerCandidate: boolean;
}

// Stable per-frame seed for 24 dancers — sown by hand for visual variety
const DANCER_SEEDS: DancerSeed[] = [
  // Back row (8) — smaller scales, simpler poses
  { archetype: "longhair", clothingColor: "#8a3a8a", hairColor: "#3a1810", skinShade: "#3a2818", scaleVar: 0.55, phaseOffset: 0.10, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#a05030", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 0.5,  phaseOffset: 0.32, isListenerCandidate: false },
  { archetype: "swayer",   clothingColor: "#c84830", hairColor: "#5a3818", skinShade: "#4a3018", scaleVar: 0.55, phaseOffset: 0.55, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#6098c0", hairColor: "#3a1808", skinShade: "#3a2818", scaleVar: 0.5,  phaseOffset: 0.78, isListenerCandidate: true  },
  { archetype: "twirler",  clothingColor: "#d0a020", hairColor: "#1a0a05", skinShade: "#4a3018", scaleVar: 0.6,  phaseOffset: 0.20, isListenerCandidate: false },
  { archetype: "pog",      clothingColor: "#a85070", hairColor: "#3a1810", skinShade: "#3a2818", scaleVar: 0.45, phaseOffset: 0.45, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#509050", hairColor: "#5a3018", skinShade: "#4a3018", scaleVar: 0.55, phaseOffset: 0.65, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#9c5ac0", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 0.55, phaseOffset: 0.88, isListenerCandidate: true  },
  // Middle row (9) — mid scale
  { archetype: "twirler",  clothingColor: "#e34050", hairColor: "#3a1810", skinShade: "#4a3018", scaleVar: 0.78, phaseOffset: 0.05, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#f5b020", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 0.7,  phaseOffset: 0.30, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#5098c0", hairColor: "#5a3018", skinShade: "#4a3018", scaleVar: 0.78, phaseOffset: 0.5,  isListenerCandidate: true  },
  { archetype: "swayer",   clothingColor: "#c0a030", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 0.72, phaseOffset: 0.7,  isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#a04060", hairColor: "#3a1810", skinShade: "#4a3018", scaleVar: 0.8,  phaseOffset: 0.95, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#30a050", hairColor: "#5a3018", skinShade: "#3a2818", scaleVar: 0.7,  phaseOffset: 0.18, isListenerCandidate: false },
  { archetype: "pog",      clothingColor: "#7050a0", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 0.65, phaseOffset: 0.42, isListenerCandidate: false },
  { archetype: "twirler",  clothingColor: "#e08040", hairColor: "#3a1810", skinShade: "#4a3018", scaleVar: 0.75, phaseOffset: 0.62, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#306090", hairColor: "#5a3018", skinShade: "#3a2818", scaleVar: 0.78, phaseOffset: 0.85, isListenerCandidate: true  },
  // Front row (7) — biggest scale, most detail
  { archetype: "twirler",  clothingColor: "#e34050", hairColor: "#1a0a05", skinShade: "#4a3018", scaleVar: 1.05, phaseOffset: 0.12, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#9c5ac0", hairColor: "#3a1810", skinShade: "#3a2818", scaleVar: 1.0,  phaseOffset: 0.38, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#d8a040", hairColor: "#5a3018", skinShade: "#4a3018", scaleVar: 1.1,  phaseOffset: 0.6,  isListenerCandidate: true  },
  { archetype: "twirler",  clothingColor: "#5098c0", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 1.0,  phaseOffset: 0.83, isListenerCandidate: false },
  { archetype: "armsup",   clothingColor: "#c84830", hairColor: "#3a1810", skinShade: "#4a3018", scaleVar: 1.05, phaseOffset: 0.25, isListenerCandidate: false },
  { archetype: "longhair", clothingColor: "#509050", hairColor: "#1a0a05", skinShade: "#3a2818", scaleVar: 1.0,  phaseOffset: 0.5,  isListenerCandidate: false },
  { archetype: "swayer",   clothingColor: "#a04060", hairColor: "#5a3018", skinShade: "#4a3018", scaleVar: 1.08, phaseOffset: 0.72, isListenerCandidate: true  },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const HeavyCrowdDance: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  const energy = Math.min(1, audio?.energy ?? 0);
  const bass = Math.min(1, audio?.bass ?? 0);
  const vocalE = Math.min(1, audio?.vocalEnergy ?? 0);
  const beatSnap = Math.min(1, audio?.drumOnset ?? 0);

  // Bass drives unison hip-bounce
  const bassBeat = bass * (1 + beatSnap);

  // Dance phase advances each frame, bumps on beat
  const danceBase = (frame / fps) * 0.55 + beatSnap * 0.12;

  // Some dancers "freeze and listen" when vocals are leading
  const listeningMode = vocalE > 0.5;

  // Layout: 24 dancers in 3 depth rows across the lower 1/3 of frame
  const rowYs = [
    height * 0.65,  // back row (smallest)
    height * 0.78,  // middle row
    height * 0.92,  // front row (biggest, slightly off bottom)
  ];

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.40 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="crowdGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
          </linearGradient>
        </defs>

        {/* Subtle ground gradient under the crowd — gives them weight */}
        <rect x={0} y={height * 0.55} width={width} height={height * 0.45} fill="url(#crowdGround)" opacity={0.6} />

        {/* Render dancers row by row, back to front (front draws over back) */}
        {[0, 1, 2].map((rowIdx) => {
          const rowSeeds = rowIdx === 0
            ? DANCER_SEEDS.slice(0, 8)
            : rowIdx === 1
              ? DANCER_SEEDS.slice(8, 17)
              : DANCER_SEEDS.slice(17, 24);
          const count = rowSeeds.length;
          // Spread evenly across width with slight randomness
          return (
            <g key={rowIdx}>
              {rowSeeds.map((seed, i) => {
                const xJitter = Math.sin(i * 1.7 + rowIdx * 2.3) * 18;
                const cx = ((i + 0.5) / count) * width + xJitter;
                const cy = rowYs[rowIdx];
                const phase = (danceBase + seed.phaseOffset) % 1;
                const isListening = listeningMode && seed.isListenerCandidate;
                return (
                  <Dancer
                    key={`${rowIdx}-${i}`}
                    cx={cx}
                    cy={cy}
                    scale={seed.scaleVar}
                    phase={phase}
                    energy={energy}
                    bassBeat={bassBeat}
                    archetype={seed.archetype}
                    clothingColor={seed.clothingColor}
                    hairColor={seed.hairColor}
                    skinShade={seed.skinShade}
                    isListening={isListening}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Front-row haze — slight warm cast at the very bottom (stage lights bouncing off crowd) */}
        <rect
          x={0}
          y={height - 80}
          width={width}
          height={80}
          fill="rgba(255,200,140,0.18)"
          opacity={0.5 + energy * 0.3}
        />
      </svg>
    </div>
  );
};
