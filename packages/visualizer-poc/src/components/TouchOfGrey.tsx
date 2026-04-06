/**
 * TouchOfGrey -- Skeleton-to-human metamorphosis overlay.
 *
 * Two overlapping figures sharing a single pose: a detailed anatomical
 * skeleton and a warm human silhouette. Energy drives the morph ratio --
 * quiet passages reveal the skeleton (death), loud passages fill in the
 * human form (life). Transformation particles drift between the two states.
 * "I will get by" text fades in during quiet skeleton-dominant passages.
 *
 * Inspired by the 1987 music video with its puppet skeletons transforming
 * into the band members. The visual language: death becoming life,
 * skeleton becoming flesh, grey becoming color.
 *
 * Audio mapping:
 *   - energy       → skeleton↔human morph ratio (core driver)
 *   - beatDecay    → body sway amplitude
 *   - chromaHue    → neon glow hue (warm=alive, cool=skeleton)
 *   - slowEnergy   → breathing scale pulse
 *   - onsetEnvelope → transformation particle burst intensity
 *   - bass         → ground shadow pulse
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CYCLE = 2700; // 90s at 30fps
const DURATION = 360; // 12s

/** Number of transformation particles */
const PARTICLE_COUNT = 28;

/** Seeded pseudo-random for deterministic particles */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Skeleton Figure — full anatomical detail                           */
/* ------------------------------------------------------------------ */

const SkeletonFigure: React.FC<{
  opacity: number;
  color: string;
  sway: number;
  armRaise: number;
  breathe: number;
}> = ({ opacity, color, sway, armRaise, breathe }) => {
  if (opacity < 0.01) return null;
  const sw = sway;
  const br = breathe;
  return (
    <g opacity={opacity}>
      {/* --- Cranium with suture lines --- */}
      <ellipse cx={200 + sw * 0.3} cy={52} rx={28 * (1 + br * 0.02)} ry={34 * (1 + br * 0.02)}
        stroke={color} strokeWidth="2.5" fill="none" />
      {/* Sagittal suture */}
      <line x1={200 + sw * 0.3} y1={20} x2={200 + sw * 0.3} y2={52}
        stroke={color} strokeWidth="0.8" opacity="0.35" />
      {/* Coronal suture */}
      <path d={`M ${178 + sw * 0.3} 42 Q ${200 + sw * 0.3} 30 ${222 + sw * 0.3} 42`}
        stroke={color} strokeWidth="0.8" fill="none" opacity="0.3" />

      {/* --- Eye sockets (deep, anatomical) --- */}
      <ellipse cx={190 + sw * 0.3} cy={48} rx="8" ry="9"
        stroke={color} strokeWidth="2" fill="none" />
      <ellipse cx={210 + sw * 0.3} cy={48} rx="8" ry="9"
        stroke={color} strokeWidth="2" fill="none" />
      {/* Brow ridge */}
      <path d={`M ${178 + sw * 0.3} 40 Q ${200 + sw * 0.3} 35 ${222 + sw * 0.3} 40`}
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />

      {/* --- Nasal cavity (inverted triangle) --- */}
      <path d={`M ${196 + sw * 0.3} 56 L ${200 + sw * 0.3} 65 L ${204 + sw * 0.3} 56`}
        stroke={color} strokeWidth="1.5" fill="none" />
      <line x1={200 + sw * 0.3} y1={58} x2={200 + sw * 0.3} y2={64}
        stroke={color} strokeWidth="0.8" opacity="0.4" />

      {/* --- Jaw (mandible) with teeth --- */}
      <path d={`M ${176 + sw * 0.3} 62 Q ${188 + sw * 0.3} 80 ${200 + sw * 0.3} 82 Q ${212 + sw * 0.3} 80 ${224 + sw * 0.3} 62`}
        stroke={color} strokeWidth="2" fill="none" />
      {/* Upper teeth */}
      {[-10, -5, 0, 5, 10].map((dx) => (
        <line key={`ut${dx}`}
          x1={200 + dx + sw * 0.3} y1={67} x2={200 + dx + sw * 0.3} y2={72}
          stroke={color} strokeWidth="1.2" opacity="0.5" />
      ))}
      {/* Lower teeth */}
      {[-8, -3, 3, 8].map((dx) => (
        <line key={`lt${dx}`}
          x1={200 + dx + sw * 0.3} y1={73} x2={200 + dx + sw * 0.3} y2={78}
          stroke={color} strokeWidth="1.2" opacity="0.45" />
      ))}

      {/* --- Cervical vertebrae (neck) --- */}
      {[88, 94, 100].map((y) => (
        <React.Fragment key={`cv${y}`}>
          <rect x={195 + sw * 0.25} y={y} width="10" height="5" rx="2"
            stroke={color} strokeWidth="1.2" fill="none" opacity="0.5" />
          {/* Spinous process */}
          <line x1={200 + sw * 0.25} y1={y + 2} x2={207 + sw * 0.25} y2={y + 2}
            stroke={color} strokeWidth="0.8" opacity="0.3" />
        </React.Fragment>
      ))}

      {/* --- Clavicles --- */}
      <line x1={200 + sw * 0.2} y1={108} x2={155 + sw * 0.15} y2={104}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1={200 + sw * 0.2} y1={108} x2={245 + sw * 0.15} y2={104}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />

      {/* --- Thoracic spine (12 vertebrae, simplified to 8) --- */}
      {[112, 124, 136, 148, 160, 172, 184, 196].map((y, i) => (
        <React.Fragment key={`tv${y}`}>
          <rect x={196 + sw * (0.2 - i * 0.015)} y={y} width="8" height="10" rx="2"
            stroke={color} strokeWidth="1" fill="none" opacity="0.4" />
        </React.Fragment>
      ))}

      {/* --- Rib cage (12 pairs, rendered as curved bones) --- */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        const y = 114 + i * 8;
        const spread = 30 + i * 2.5 - (i > 8 ? (i - 8) * 5 : 0); // floating ribs shorter
        const curve = 5 + i * 0.8;
        const swOff = sw * (0.18 - i * 0.01);
        const op = i > 9 ? 0.3 : 0.45; // floating ribs fainter
        return (
          <React.Fragment key={`rib${i}`}>
            <path d={`M ${200 + swOff} ${y} Q ${200 - spread * 0.5 + swOff} ${y + curve} ${200 - spread + swOff} ${y + curve * 1.5}`}
              stroke={color} strokeWidth={i < 7 ? "1.8" : "1.3"} fill="none" opacity={op} />
            <path d={`M ${200 + swOff} ${y} Q ${200 + spread * 0.5 + swOff} ${y + curve} ${200 + spread + swOff} ${y + curve * 1.5}`}
              stroke={color} strokeWidth={i < 7 ? "1.8" : "1.3"} fill="none" opacity={op} />
          </React.Fragment>
        );
      })}

      {/* --- Sternum --- */}
      <line x1={200 + sw * 0.18} y1={108} x2={200 + sw * 0.1} y2={185}
        stroke={color} strokeWidth="2" opacity="0.4" />

      {/* --- Lumbar spine --- */}
      {[206, 218, 230, 242, 252].map((y, i) => (
        <rect key={`lv${y}`} x={196 + sw * (0.08 - i * 0.01)} y={y} width="8" height="10" rx="2"
          stroke={color} strokeWidth="1.2" fill="none" opacity="0.4" />
      ))}

      {/* --- Pelvis (ilium, sacrum, ischium) --- */}
      <path d={`M ${168 + sw * 0.05} 258 Q ${184 + sw * 0.04} 280 ${200 + sw * 0.03} 268 Q ${216 + sw * 0.04} 280 ${232 + sw * 0.05} 258`}
        stroke={color} strokeWidth="2.5" fill="none" />
      {/* Sacrum */}
      <path d={`M ${196 + sw * 0.04} 258 L ${200 + sw * 0.03} 272 L ${204 + sw * 0.04} 258`}
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      {/* Iliac crests */}
      <path d={`M ${168 + sw * 0.05} 258 Q ${160 + sw * 0.06} 248 ${165 + sw * 0.06} 238`}
        stroke={color} strokeWidth="2" fill="none" opacity="0.5" />
      <path d={`M ${232 + sw * 0.05} 258 Q ${240 + sw * 0.06} 248 ${235 + sw * 0.06} 238`}
        stroke={color} strokeWidth="2" fill="none" opacity="0.5" />

      {/* --- Left arm --- */}
      {/* Humerus */}
      <line x1={155 + sw * 0.15} y1={104}
        x2={140 + sw * 0.18 - armRaise * 12} y2={165 - armRaise * 40}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Elbow joint */}
      <circle cx={140 + sw * 0.18 - armRaise * 12} cy={165 - armRaise * 40} r="3.5"
        stroke={color} strokeWidth="1.2" fill="none" opacity="0.5" />
      {/* Radius */}
      <line x1={140 + sw * 0.18 - armRaise * 12} y1={165 - armRaise * 40}
        x2={132 + sw * 0.2 - armRaise * 6} y2={220 - armRaise * 65}
        stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Ulna (parallel, slightly offset) */}
      <line x1={143 + sw * 0.18 - armRaise * 12} y1={167 - armRaise * 40}
        x2={136 + sw * 0.2 - armRaise * 6} y2={222 - armRaise * 65}
        stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Hand bones (metacarpals + phalanges) */}
      {[0, 1, 2, 3, 4].map((f) => {
        const baseX = 132 + sw * 0.2 - armRaise * 6;
        const baseY = 220 - armRaise * 65;
        const angle = (-0.4 + f * 0.2) + (armRaise * 0.3);
        const len = f === 0 ? 10 : 14;
        return (
          <line key={`lf${f}`}
            x1={baseX} y1={baseY}
            x2={baseX + Math.cos(angle) * len * (1 - armRaise * 0.3)}
            y2={baseY + Math.sin(angle) * len * (1 - armRaise * 0.5) + len * 0.5}
            stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        );
      })}

      {/* --- Right arm --- */}
      {/* Humerus */}
      <line x1={245 + sw * 0.15} y1={104}
        x2={260 + sw * 0.12} y2={168}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Elbow joint */}
      <circle cx={260 + sw * 0.12} cy={168} r="3.5"
        stroke={color} strokeWidth="1.2" fill="none" opacity="0.5" />
      {/* Radius */}
      <line x1={260 + sw * 0.12} y1={168}
        x2={268 + sw * 0.1} y2={228}
        stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Ulna */}
      <line x1={257 + sw * 0.12} y1={170}
        x2={264 + sw * 0.1} y2={230}
        stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Hand bones */}
      {[0, 1, 2, 3, 4].map((f) => {
        const baseX = 268 + sw * 0.1;
        const baseY = 228;
        const angle = (2.3 + f * 0.2);
        const len = f === 0 ? 10 : 14;
        return (
          <line key={`rf${f}`}
            x1={baseX} y1={baseY}
            x2={baseX + Math.cos(angle) * len}
            y2={baseY + Math.sin(angle) * len + len * 0.3}
            stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        );
      })}

      {/* --- Left leg --- */}
      {/* Femur */}
      <line x1={180 + sw * 0.04} y1={275}
        x2={172 + sw * 0.02} y2={355}
        stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      {/* Knee joint */}
      <circle cx={172 + sw * 0.02} cy={355} r="5"
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      {/* Patella */}
      <ellipse cx={170 + sw * 0.02} cy={355} rx="4" ry="5"
        stroke={color} strokeWidth="1" fill="none" opacity="0.35" />
      {/* Tibia */}
      <line x1={172 + sw * 0.02} y1={360}
        x2={168 + sw * 0.01} y2={440}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Fibula (parallel, thinner) */}
      <line x1={176 + sw * 0.02} y1={362}
        x2={173 + sw * 0.01} y2={438}
        stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
      {/* Foot (metatarsals) */}
      <path d={`M ${168 + sw * 0.01} 440 L ${150 + sw * 0.01} 448 L ${168 + sw * 0.01} 450`}
        stroke={color} strokeWidth="2" fill="none" />
      {/* Toes */}
      {[0, 1, 2, 3, 4].map((t) => (
        <line key={`lt${t}`}
          x1={150 + sw * 0.01} y1={448}
          x2={142 + t * 2 + sw * 0.01} y2={452 - t * 0.5}
          stroke={color} strokeWidth="0.8" opacity="0.4" />
      ))}

      {/* --- Right leg --- */}
      {/* Femur */}
      <line x1={220 + sw * 0.04} y1={275}
        x2={228 + sw * 0.02} y2={355}
        stroke={color} strokeWidth="2.8" strokeLinecap="round" />
      {/* Knee joint */}
      <circle cx={228 + sw * 0.02} cy={355} r="5"
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      {/* Patella */}
      <ellipse cx={230 + sw * 0.02} cy={355} rx="4" ry="5"
        stroke={color} strokeWidth="1" fill="none" opacity="0.35" />
      {/* Tibia */}
      <line x1={228 + sw * 0.02} y1={360}
        x2={232 + sw * 0.01} y2={440}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Fibula */}
      <line x1={224 + sw * 0.02} y1={362}
        x2={228 + sw * 0.01} y2={438}
        stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.4" />
      {/* Foot */}
      <path d={`M ${232 + sw * 0.01} 440 L ${250 + sw * 0.01} 448 L ${232 + sw * 0.01} 450`}
        stroke={color} strokeWidth="2" fill="none" />
      {/* Toes */}
      {[0, 1, 2, 3, 4].map((t) => (
        <line key={`rt${t}`}
          x1={250 + sw * 0.01} y1={448}
          x2={258 - t * 2 + sw * 0.01} y2={452 - t * 0.5}
          stroke={color} strokeWidth="0.8" opacity="0.4" />
      ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Human Figure — filled body silhouette with clothing suggestion     */
/* ------------------------------------------------------------------ */

const HumanFigure: React.FC<{
  opacity: number;
  color: string;
  sway: number;
  armRaise: number;
  breathe: number;
}> = ({ opacity, color, sway, armRaise, breathe }) => {
  if (opacity < 0.01) return null;
  const sw = sway;
  const br = breathe;
  return (
    <g opacity={opacity}>
      {/* --- Head --- */}
      <ellipse cx={200 + sw * 0.3} cy={50} rx={24 * (1 + br * 0.02)} ry={30 * (1 + br * 0.02)}
        fill={color} opacity="0.25" stroke={color} strokeWidth="2.5" />
      {/* Hair suggestion */}
      <path d={`M ${178 + sw * 0.3} 38 Q ${190 + sw * 0.3} 18 ${200 + sw * 0.3} 16 Q ${210 + sw * 0.3} 18 ${222 + sw * 0.3} 38`}
        fill={color} opacity="0.15" stroke={color} strokeWidth="1.5" />

      {/* --- Neck --- */}
      <rect x={191 + sw * 0.28} y={78} width="18" height="22" rx="5"
        fill={color} opacity="0.15" stroke={color} strokeWidth="2" />

      {/* --- Torso (t-shirt suggestion with collar) --- */}
      <path d={`M ${158 + sw * 0.15} 100
        L ${152 + sw * 0.12} 210
        Q ${176 + sw * 0.08} 225 ${200 + sw * 0.06} 228
        Q ${224 + sw * 0.08} 225 ${248 + sw * 0.12} 210
        L ${242 + sw * 0.15} 100
        Q ${220 + sw * 0.2} 92 ${200 + sw * 0.22} 90
        Q ${180 + sw * 0.2} 92 ${158 + sw * 0.15} 100 Z`}
        fill={color} opacity="0.12" stroke={color} strokeWidth="2.5" />
      {/* Collar */}
      <path d={`M ${185 + sw * 0.22} 96 Q ${200 + sw * 0.23} 104 ${215 + sw * 0.22} 96`}
        stroke={color} strokeWidth="1.5" fill="none" opacity="0.4" />

      {/* --- Shoulders --- */}
      <ellipse cx={158 + sw * 0.15} cy={104} rx="10" ry="8"
        fill={color} opacity="0.1" stroke={color} strokeWidth="1.5" />
      <ellipse cx={242 + sw * 0.15} cy={104} rx="10" ry="8"
        fill={color} opacity="0.1" stroke={color} strokeWidth="1.5" />

      {/* --- Hips / pants suggestion --- */}
      <path d={`M ${160 + sw * 0.06} 226
        L ${158 + sw * 0.05} 268
        Q ${180 + sw * 0.04} 275 ${200 + sw * 0.03} 276
        Q ${220 + sw * 0.04} 275 ${242 + sw * 0.05} 268
        L ${240 + sw * 0.06} 226 Z`}
        fill={color} opacity="0.1" stroke={color} strokeWidth="2" />
      {/* Belt line */}
      <line x1={158 + sw * 0.06} y1={228} x2={242 + sw * 0.06} y2={228}
        stroke={color} strokeWidth="1.5" opacity="0.35" />

      {/* --- Left arm (raised based on armRaise) --- */}
      <path d={`M ${155 + sw * 0.15} 106
        Q ${142 + sw * 0.18 - armRaise * 8} ${140 - armRaise * 35}
        ${134 + sw * 0.2 - armRaise * 5} ${218 - armRaise * 62}`}
        stroke={color} strokeWidth="5.5" fill="none" strokeLinecap="round" />
      {/* Hand */}
      <circle cx={132 + sw * 0.2 - armRaise * 5} cy={222 - armRaise * 65} r="7"
        fill={color} opacity="0.2" stroke={color} strokeWidth="2" />

      {/* --- Right arm (at side, gentle) --- */}
      <path d={`M ${245 + sw * 0.15} 106
        Q ${258 + sw * 0.12} 145
        ${264 + sw * 0.1} 226`}
        stroke={color} strokeWidth="5.5" fill="none" strokeLinecap="round" />
      {/* Hand */}
      <circle cx={266 + sw * 0.1} cy={230} r="7"
        fill={color} opacity="0.2" stroke={color} strokeWidth="2" />

      {/* --- Left leg --- */}
      <path d={`M ${182 + sw * 0.04} 272
        Q ${176 + sw * 0.03} 340
        ${170 + sw * 0.01} 440`}
        stroke={color} strokeWidth="6.5" fill="none" strokeLinecap="round" />
      {/* Shoe */}
      <ellipse cx={162 + sw * 0.01} cy={448} rx="16" ry="7"
        fill={color} opacity="0.2" stroke={color} strokeWidth="2" />

      {/* --- Right leg --- */}
      <path d={`M ${218 + sw * 0.04} 272
        Q ${224 + sw * 0.03} 340
        ${230 + sw * 0.01} 440`}
        stroke={color} strokeWidth="6.5" fill="none" strokeLinecap="round" />
      {/* Shoe */}
      <ellipse cx={238 + sw * 0.01} cy={448} rx="16" ry="7"
        fill={color} opacity="0.2" stroke={color} strokeWidth="2" />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Transformation Particles — sparks/motes floating between states    */
/* ------------------------------------------------------------------ */

const TransformationParticles: React.FC<{
  morphRatio: number;
  frame: number;
  warmColor: string;
  coolColor: string;
  intensity: number;
  tempoFactor: number;
}> = ({ morphRatio, frame, warmColor, coolColor, intensity, tempoFactor }) => {
  if (intensity < 0.03) return null;

  const particles: React.ReactNode[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const seed = i * 7.31;
    const r0 = seededRand(seed);
    const r1 = seededRand(seed + 1);
    const r2 = seededRand(seed + 2);
    const r3 = seededRand(seed + 3);
    const r4 = seededRand(seed + 4);

    // Particles cluster around the figure body area
    const baseX = 130 + r0 * 140; // within figure width
    const baseY = 40 + r1 * 400;  // within figure height

    // Float upward and outward during transformation
    const phase = (frame * (0.02 + r2 * 0.03) * tempoFactor + r3 * Math.PI * 2) % (Math.PI * 2);
    const drift = Math.sin(phase) * (15 + r4 * 20) * intensity;
    const rise = -Math.abs(Math.cos(phase * 0.7)) * 12 * intensity;

    // Particles glow warm when human-dominant, cool when skeleton-dominant
    const color = morphRatio > 0.5 ? warmColor : coolColor;
    const size = (1.2 + r2 * 2.5) * (0.4 + intensity * 0.8);
    const particleOpacity = (0.15 + r4 * 0.35) * intensity * (0.5 + Math.abs(Math.sin(phase)) * 0.5);

    // More particles visible during transition (mid-morph)
    const transitionBoost = 1 - Math.abs(morphRatio - 0.5) * 2; // peaks at 0.5
    if (r0 > 0.3 + transitionBoost * 0.4) continue; // cull particles when not transitioning

    particles.push(
      <circle
        key={i}
        cx={baseX + drift}
        cy={baseY + rise}
        r={size}
        fill={color}
        opacity={particleOpacity}
      />
    );
  }

  return <g>{particles}</g>;
};

/* ------------------------------------------------------------------ */
/*  "I will get by" text — appears during quiet/skeleton passages      */
/* ------------------------------------------------------------------ */

const WillGetByText: React.FC<{
  skeletonDominance: number;
  frame: number;
  color: string;
  tempoFactor: number;
}> = ({ skeletonDominance, frame, color, tempoFactor }) => {
  // Only show when skeleton is dominant (quiet passages)
  // Slow pulse in and out
  const textPhase = Math.sin(frame * 0.015 * tempoFactor);
  const showThreshold = 0.65; // skeleton must be at least 65% dominant
  if (skeletonDominance < showThreshold) return null;

  const dominanceFactor = interpolate(skeletonDominance, [showThreshold, 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textOpacity = dominanceFactor * (0.15 + textPhase * 0.1);
  if (textOpacity < 0.02) return null;

  const letterSpacing = 6 + textPhase * 2;

  return (
    <g opacity={textOpacity}>
      <text
        x="200"
        y="490"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        letterSpacing={letterSpacing}
        fill={color}
        opacity="0.8"
      >
        I WILL GET BY
      </text>
      {/* Subtle underline */}
      <line x1="140" y1="498" x2="260" y2="498"
        stroke={color} strokeWidth="0.5" opacity="0.3" />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Ground shadow                                                      */
/* ------------------------------------------------------------------ */

const GroundShadow: React.FC<{
  morphRatio: number;
  bass: number;
  color: string;
}> = ({ morphRatio, bass, color }) => {
  const shadowWidth = 60 + bass * 20;
  const shadowOpacity = 0.06 + morphRatio * 0.04 + bass * 0.03;
  return (
    <ellipse
      cx="200"
      cy="460"
      rx={shadowWidth}
      ry={6 + bass * 3}
      fill={color}
      opacity={shadowOpacity}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const TouchOfGrey: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade envelope
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(snap.energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (masterOpacity < 0.01) return null;

  /* ---- Core morph: energy drives skeleton↔human ---- */
  // High energy = more human (alive), low energy = more skeleton (death)
  // Smoothed with a soft sigmoid curve for organic transitions
  const rawMorph = interpolate(snap.energy, [0.04, 0.22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Smooth via slow sine modulation so it breathes even at steady energy
  const breathMorph = Math.sin(frame * 0.008 * tempoFactor) * 0.08;
  const morphRatio = Math.max(0, Math.min(1, rawMorph + breathMorph)); // 0=skeleton, 1=human
  const skeletonOpacity = 1 - morphRatio;
  const humanOpacity = morphRatio;

  /* ---- Dance sway from beatDecay ---- */
  const swayAmplitude = 3 + snap.beatDecay * 12;
  const sway = Math.sin(frame * 0.04 * tempoFactor) * swayAmplitude;

  /* ---- Arm raise — gentle, energy-modulated ---- */
  const armRaise = interpolate(snap.energy, [0.05, 0.3], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ---- Breathing scale from slowEnergy ---- */
  const breathe = snap.slowEnergy * 0.15;

  /* ---- Neon glow: warm (alive) ↔ cool (skeleton) ---- */
  const hue = snap.chromaHue;
  // Warm hue shifts toward orange/gold when human, cool toward blue/cyan when skeleton
  const warmHue = (hue + 30) % 360;  // shifted toward warm
  const coolHue = (hue + 200) % 360; // shifted toward cool
  const activeHue = morphRatio * warmHue + (1 - morphRatio) * coolHue;
  const activeSat = 50 + morphRatio * 30; // more saturated when alive
  const activeLit = 60 + morphRatio * 15;

  const boneColor = `hsl(${coolHue}, 15%, ${72 + skeletonOpacity * 18}%)`;
  const skinColor = `hsl(${warmHue}, 50%, ${50 + humanOpacity * 20}%)`;
  const glowColor = `hsla(${activeHue}, ${activeSat}%, ${activeLit}%, 0.45)`;
  const particleWarm = `hsl(${warmHue}, 70%, 75%)`;
  const particleCool = `hsl(${coolHue}, 30%, 80%)`;
  const textColor = `hsl(${coolHue}, 10%, ${70 + skeletonOpacity * 20}%)`;

  /* ---- Particle intensity: bursts on onsets, sustained during mid-morph ---- */
  const transitionActivity = 1 - Math.abs(morphRatio - 0.5) * 2; // peaks at 0.5
  const particleIntensity = Math.max(
    snap.onsetEnvelope * 0.7,
    transitionActivity * 0.5,
    snap.energy * 0.3,
  );

  /* ---- Scale figure to viewport ---- */
  const figureScale = (height * 0.78) / 460; // 460 = figure viewBox height
  const figureX = (width - 400 * figureScale) / 2;
  const figureY = height * 0.08;

  /* ---- Outer glow layers ---- */
  const innerGlow = `drop-shadow(0 0 ${8 + morphRatio * 12}px ${glowColor})`;
  const outerGlow = `drop-shadow(0 0 ${20 + morphRatio * 20}px ${glowColor})`;
  const bloom = `drop-shadow(0 0 ${35 + snap.energy * 25}px ${glowColor})`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `${innerGlow} ${outerGlow} ${bloom}`,
        }}
      >
        <g transform={`translate(${figureX}, ${figureY}) scale(${figureScale})`}>
          {/* Ground shadow */}
          <GroundShadow morphRatio={morphRatio} bass={snap.bass} color={glowColor} />

          {/* Skeleton layer (beneath) */}
          <SkeletonFigure
            opacity={skeletonOpacity}
            color={boneColor}
            sway={sway}
            armRaise={armRaise}
            breathe={breathe}
          />

          {/* Human layer (on top) */}
          <HumanFigure
            opacity={humanOpacity}
            color={skinColor}
            sway={sway}
            armRaise={armRaise}
            breathe={breathe}
          />

          {/* Transformation particles between the two states */}
          <TransformationParticles
            morphRatio={morphRatio}
            frame={frame}
            warmColor={particleWarm}
            coolColor={particleCool}
            intensity={particleIntensity}
            tempoFactor={tempoFactor}
          />

          {/* "I will get by" text — quiet passages only */}
          <WillGetByText
            skeletonDominance={skeletonOpacity}
            frame={frame}
            color={textColor}
            tempoFactor={tempoFactor}
          />
        </g>
      </svg>
    </div>
  );
};
