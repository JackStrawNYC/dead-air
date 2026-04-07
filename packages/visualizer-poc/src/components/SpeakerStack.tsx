/**
 * SpeakerStack — A+++ overlay: the Wall of Sound era speaker stacks.
 * Multiple towering speaker cabinets across the stage. Each stack has
 * horizontal grilles, woofer cones (vibrating with bass), brand badges,
 * cable runs, and stage edge details. Awe-inspiring scale.
 *
 * Audio reactivity:
 *   slowEnergy → ambient stage glow
 *   energy → grille rim lighting
 *   bass → CONE EXCURSION (cones literally pulse with bass)
 *   beatDecay → cabinet light flash
 *   onsetEnvelope → low-end shockwave
 *   chromaHue → palette tint
 *   tempoFactor → particle drift
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const PARTICLE_COUNT = 50;
const STACK_COUNT = 5;

interface Particle { x: number; y: number; r: number; speed: number; phase: number; }

function buildParticles(): Particle[] {
  const rng = seeded(60_998_117);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.6 + rng() * 1.8,
    speed: 0.0005 + rng() * 0.0016,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const SpeakerStack: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const particles = React.useMemo(buildParticles, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  // Audio
  const ambientGlow = interpolate(snap.slowEnergy, [0.02, 0.32], [0.5, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rimLight = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const coneExcursion = interpolate(snap.bass, [0.0, 0.7], [0.0, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cabinetFlash = snap.beatDecay;
  const shockwave = snap.onsetEnvelope > 0.55 && snap.bass > 0.3 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette — neutral black/gray with chromaHue accent
  const baseHue = 200;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 60 + ambientGlow * 16;
  const tintColor = `hsl(${tintHue}, 60%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 80%, ${Math.min(94, tintLight + 22)}%)`;
  const tintDeep = `hsl(${(tintHue) % 360}, 50%, 16%)`;

  const stageY = height * 0.82;
  const horizonY = height * 0.50;

  // Stack positions across width
  const stackPositions = Array.from({ length: STACK_COUNT }, (_, i) => {
    return width * (0.10 + (i / (STACK_COUNT - 1)) * 0.80);
  });

  // Single speaker cabinet renderer (4 cones in 2x2)
  const renderCab = (cx: number, cy: number, w: number, h: number, label: string) => {
    const cone = (dx: number, dy: number, r: number) => {
      const excursion = 1 + coneExcursion * 0.18;
      return (
        <g key={`cone-${cx}-${dx}-${dy}`}>
          {/* Frame */}
          <circle cx={cx + dx} cy={cy + dy} r={r} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.65)" strokeWidth={1} />
          {/* Surround */}
          <circle cx={cx + dx} cy={cy + dy} r={r * 0.9} fill="none" stroke="rgba(40, 32, 22, 0.7)" strokeWidth={1.6} />
          {/* Spider */}
          <circle cx={cx + dx} cy={cy + dy} r={r * 0.78} fill="rgba(20, 14, 8, 0.95)" />
          {/* Radial spokes */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <line key={`spoke-${i}`}
                x1={cx + dx + Math.cos(a) * (r * 0.18)} y1={cy + dy + Math.sin(a) * (r * 0.18)}
                x2={cx + dx + Math.cos(a) * (r * 0.78)} y2={cy + dy + Math.sin(a) * (r * 0.78)}
                stroke="rgba(40, 32, 22, 0.55)" strokeWidth={0.4} />
            );
          })}
          {/* Concentric rings */}
          {[0.4, 0.55, 0.7].map((f) => (
            <circle key={`ring-${f}`} cx={cx + dx} cy={cy + dy} r={r * f} fill="none" stroke="rgba(60, 50, 40, 0.35)" strokeWidth={0.4} />
          ))}
          {/* Dust cap (excursion) */}
          <circle cx={cx + dx} cy={cy + dy} r={r * 0.22 * excursion} fill="rgba(20, 14, 8, 0.95)" stroke="rgba(80, 70, 60, 0.55)" strokeWidth={0.5} />
          <circle cx={cx + dx - 0.5} cy={cy + dy - 0.5} r={r * 0.10 * excursion} fill="rgba(60, 50, 40, 0.65)" />
          {/* Hot center */}
          <circle cx={cx + dx} cy={cy + dy} r={r * 0.05} fill={tintCore} opacity={0.5 * coneExcursion} />
        </g>
      );
    };

    const halfW = w / 2;
    const halfH = h / 2;

    return (
      <g key={`cab-${cx}-${cy}`}>
        {/* Cabinet body */}
        <rect x={cx - halfW} y={cy - halfH} width={w} height={h} fill="rgba(8, 6, 4, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
        <rect x={cx - halfW + 4} y={cy - halfH + 4} width={w - 8} height={h - 8} fill="none" stroke="rgba(40, 32, 22, 0.55)" strokeWidth={0.8} />
        {/* Corner protectors */}
        {[
          [cx - halfW, cy - halfH], [cx + halfW, cy - halfH],
          [cx - halfW, cy + halfH], [cx + halfW, cy + halfH],
        ].map((pt, i) => (
          <rect key={`cnr-${i}`} x={pt[0] - 4} y={pt[1] - 4} width={8} height={8} fill="rgba(60, 60, 60, 0.85)" />
        ))}
        {/* 2x2 cones */}
        {cone(-w * 0.22, -h * 0.20, w * 0.18)}
        {cone(w * 0.22, -h * 0.20, w * 0.18)}
        {cone(-w * 0.22, h * 0.20, w * 0.18)}
        {cone(w * 0.22, h * 0.20, w * 0.18)}
        {/* Brand badge */}
        <rect x={cx - 14} y={cy + halfH - 14} width={28} height={6} fill="rgba(20, 14, 8, 0.85)" />
        <text x={cx} y={cy + halfH - 9} fontSize={4} fill={tintCore} opacity={0.8 * rimLight} textAnchor="middle">{label}</text>
        {/* Status LED */}
        <circle cx={cx + halfW - 6} cy={cy + halfH - 4} r={1.4} fill={tintCore} opacity={0.6 + cabinetFlash * 0.4} />
      </g>
    );
  };

  // Render a stack: horn cab on top, mid cab middle, sub cab bottom
  const renderStack = (sx: number, idx: number) => {
    const isOuter = idx === 0 || idx === STACK_COUNT - 1;
    const stackW = isOuter ? 90 : 110;

    // Vertical positions
    const subBottom = stageY - 6;
    const subH = 110;
    const midH = 90;
    const hornH = 60;

    return (
      <g key={`stack-${idx}`}>
        {/* Horn cab on top */}
        {renderCab(sx, subBottom - subH - midH - hornH / 2, stackW * 0.85, hornH, "JBL")}
        {/* Mid cab */}
        {renderCab(sx, subBottom - subH - midH / 2, stackW * 0.92, midH, "MEYER")}
        {/* Sub cab (with bigger dual 18s) */}
        <g>
          <rect x={sx - stackW / 2} y={subBottom - subH} width={stackW} height={subH} fill="rgba(8, 6, 4, 0.98)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.5} />
          <rect x={sx - stackW / 2 + 4} y={subBottom - subH + 4} width={stackW - 8} height={subH - 8} fill="none" stroke="rgba(40, 32, 22, 0.55)" strokeWidth={0.8} />
          {/* Single big sub */}
          <circle cx={sx} cy={subBottom - subH / 2} r={stackW * 0.32} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.7)" strokeWidth={1} />
          <circle cx={sx} cy={subBottom - subH / 2} r={stackW * 0.29} fill="none" stroke="rgba(40, 32, 22, 0.7)" strokeWidth={1.6} />
          <circle cx={sx} cy={subBottom - subH / 2} r={stackW * 0.25} fill="rgba(20, 14, 8, 0.95)" />
          {Array.from({ length: 18 }).map((_, i) => {
            const a = (i / 18) * Math.PI * 2;
            return (
              <line key={`sub-spoke-${idx}-${i}`}
                x1={sx + Math.cos(a) * (stackW * 0.06)} y1={subBottom - subH / 2 + Math.sin(a) * (stackW * 0.06)}
                x2={sx + Math.cos(a) * (stackW * 0.25)} y2={subBottom - subH / 2 + Math.sin(a) * (stackW * 0.25)}
                stroke="rgba(40, 32, 22, 0.45)" strokeWidth={0.4} />
            );
          })}
          <circle cx={sx} cy={subBottom - subH / 2} r={(stackW * 0.10) * (1 + coneExcursion * 0.35)} fill="rgba(20, 14, 8, 0.95)" stroke="rgba(80, 70, 60, 0.55)" strokeWidth={0.6} />
          <circle cx={sx - 1} cy={subBottom - subH / 2 - 1} r={(stackW * 0.05) * (1 + coneExcursion * 0.35)} fill="rgba(60, 50, 40, 0.65)" />
          <circle cx={sx} cy={subBottom - subH / 2} r={3 + coneExcursion * 2} fill={tintCore} opacity={0.4 * coneExcursion} />
          {/* Brand badge */}
          <rect x={sx - 18} y={subBottom - 14} width={36} height={6} fill="rgba(20, 14, 8, 0.85)" />
          <text x={sx} y={subBottom - 9} fontSize={4} fill={tintCore} opacity={0.8 * rimLight} textAnchor="middle">EV-DL18</text>
          <circle cx={sx + stackW / 2 - 6} cy={subBottom - 4} r={1.4} fill={tintCore} opacity={0.6 + cabinetFlash * 0.4} />
        </g>

        {/* Cable runs down side */}
        <path d={`M ${sx - stackW / 2 - 4} ${subBottom - subH - midH - hornH + 4} L ${sx - stackW / 2 - 4} ${subBottom - 2} Q ${sx - stackW / 2 - 6} ${subBottom + 4} ${sx - stackW / 2 - 14} ${subBottom + 6}`}
          stroke="rgba(0, 0, 0, 0.95)" strokeWidth={2} fill="none" />
        <path d={`M ${sx - stackW / 2 - 4} ${subBottom - subH - midH - hornH + 4} L ${sx - stackW / 2 - 4} ${subBottom - 2} Q ${sx - stackW / 2 - 6} ${subBottom + 4} ${sx - stackW / 2 - 14} ${subBottom + 6}`}
          stroke="rgba(50, 40, 30, 0.55)" strokeWidth={0.6} fill="none" />

        {/* Glow at base */}
        <ellipse cx={sx} cy={subBottom + 4} rx={stackW * 0.65} ry={6} fill={tintCore} opacity={0.18 + coneExcursion * 0.18 + cabinetFlash * 0.12} style={{ mixBlendMode: "screen" }} />
      </g>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="ss-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020306" />
            <stop offset="50%" stopColor="#04060c" />
            <stop offset="100%" stopColor={tintDeep} />
          </linearGradient>
          <linearGradient id="ss-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(8, 8, 12, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 2, 6, 0.99)" />
          </linearGradient>
          <radialGradient id="ss-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <filter id="ss-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={width} height={height} fill="url(#ss-bg)" />

        {/* Truss + lights */}
        <rect x={width * 0.04} y={height * 0.06} width={width * 0.92} height={5} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.04} y={height * 0.06} width={5} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        <rect x={width * 0.96 - 5} y={height * 0.06} width={5} height={height * 0.42} fill="rgba(0, 0, 0, 0.85)" />
        {[0.15, 0.30, 0.45, 0.55, 0.70, 0.85].map((px, i) => (
          <g key={`fix-${i}`}>
            <line x1={width * px} y1={height * 0.065} x2={width * px} y2={height * 0.11} stroke="rgba(0, 0, 0, 0.9)" strokeWidth={2} />
            <rect x={width * px - 5} y={height * 0.11} width={10} height={6} fill="rgba(0, 0, 0, 0.95)" />
            <circle cx={width * px} cy={height * 0.12} r={2.5 + rimLight * 1.5} fill={tintCore} opacity={0.55 + rimLight * 0.35} />
          </g>
        ))}

        {/* Backdrop */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(4, 4, 8, 0.85)" />

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#ss-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.30 * ambientGlow} />
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`plank-${i}`} x1={0} y1={stageY + 6 + i * 12} x2={width} y2={stageY + 6 + i * 12}
            stroke="rgba(0, 0, 0, 0.45)" strokeWidth={0.6} />
        ))}

        {/* Stage edge cable bundles */}
        {Array.from({ length: 6 }).map((_, i) => {
          const px = width * (0.12 + i * 0.15);
          return (
            <g key={`bundle-${i}`}>
              <ellipse cx={px} cy={stageY + 6} rx={26} ry={3} fill="rgba(0, 0, 0, 0.95)" />
              <line x1={px - 22} y1={stageY + 6} x2={px + 22} y2={stageY + 6} stroke="rgba(50, 40, 30, 0.55)" strokeWidth={0.6} />
              <line x1={px - 18} y1={stageY + 4} x2={px + 18} y2={stageY + 4} stroke="rgba(50, 40, 30, 0.45)" strokeWidth={0.5} />
            </g>
          );
        })}

        {/* Distant rear speaker silhouettes */}
        {[0.20, 0.40, 0.60, 0.80].map((px, i) => (
          <g key={`rear-${i}`} transform={`translate(${width * px} ${stageY - 80})`} opacity={0.45}>
            <rect x={-22} y={0} width={44} height={70} fill="rgba(0, 0, 0, 0.95)" />
            <circle cx={-10} cy={20} r={8} fill="rgba(0, 0, 0, 1)" stroke="rgba(40, 32, 22, 0.3)" strokeWidth={0.4} />
            <circle cx={10} cy={20} r={8} fill="rgba(0, 0, 0, 1)" stroke="rgba(40, 32, 22, 0.3)" strokeWidth={0.4} />
            <circle cx={-10} cy={46} r={8} fill="rgba(0, 0, 0, 1)" stroke="rgba(40, 32, 22, 0.3)" strokeWidth={0.4} />
            <circle cx={10} cy={46} r={8} fill="rgba(0, 0, 0, 1)" stroke="rgba(40, 32, 22, 0.3)" strokeWidth={0.4} />
          </g>
        ))}

        {/* Speaker stacks */}
        {stackPositions.map((sx, i) => renderStack(sx, i))}

        {/* Power distribution box on stage edge */}
        <g transform={`translate(${width * 0.92} ${stageY + 30})`}>
          <rect x={-18} y={-14} width={36} height={28} fill="rgba(20, 18, 14, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1} />
          <rect x={-15} y={-11} width={30} height={22} fill="none" stroke="rgba(50, 40, 30, 0.55)" strokeWidth={0.5} />
          {Array.from({ length: 6 }).map((_, i) => (
            <circle key={`outlet-${i}`} cx={-9 + (i % 3) * 9} cy={-5 + Math.floor(i / 3) * 10} r={2} fill="rgba(0, 0, 0, 0.95)" stroke="rgba(60, 50, 40, 0.5)" strokeWidth={0.4} />
          ))}
          <circle cx={14} cy={-10} r={1.4} fill={tintCore} opacity={0.7 + cabinetFlash * 0.3} />
        </g>

        {/* Bass shockwave (radiates from center stack on heavy onset) */}
        {shockwave > 0 && (
          <>
            <circle cx={width * 0.5} cy={stageY - 50} r={140 + shockwave * 100}
              fill="none" stroke={tintCore} strokeWidth={2 + shockwave * 2} opacity={shockwave * 0.55} style={{ mixBlendMode: "screen" }} />
            <circle cx={width * 0.5} cy={stageY - 50} r={80 + shockwave * 70}
              fill="none" stroke={tintColor} strokeWidth={1.5} opacity={shockwave * 0.4} style={{ mixBlendMode: "screen" }} />
          </>
        )}

        {/* Particles in air (sound waves) */}
        <g style={{ mixBlendMode: "screen" }}>
          {particles.map((p, i) => {
            const t = frame * p.speed * tempoFactor + p.phase;
            const px = (p.x + Math.sin(t * 1.3) * 0.04) * width;
            const py = (p.y + Math.sin(t * 0.7) * 0.03) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            return (
              <circle key={`p-${i}`} cx={px} cy={py} r={p.r * (0.8 + ambientGlow * 0.4)}
                fill={tintCore} opacity={0.30 * flicker * (ambientGlow + coneExcursion * 0.4)} />
            );
          })}
        </g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#ss-vig)" />
      </svg>
    </div>
  );
};
