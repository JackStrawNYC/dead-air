/**
 * DrumCircle — A+++ overlay: Mickey + Bill's drum kit + percussion in a circular formation.
 * Multiple drums (kick, snare, toms, cymbals, congas, tambourines, gongs) arranged
 * in a circle. Drumsticks crossed. Stage lights overhead. Subtle drumstick motion
 * sync'd to beats. Percussionist silhouette suggested between two kits.
 *
 * Audio reactivity:
 *   slowEnergy → ambient stage glow
 *   energy → cymbal shimmer
 *   bass → kick drum head pulse
 *   beatDecay → drumstick motion + tom flash
 *   onsetEnvelope → snare/cymbal flash
 *   chromaHue → palette tint
 *   tempoFactor → stick rhythm speed
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

interface Particle { x: number; y: number; r: number; speed: number; phase: number; }

function buildParticles(): Particle[] {
  const rng = seeded(57_812_220);
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rng(),
    y: rng() * 0.85,
    r: 0.6 + rng() * 1.6,
    speed: 0.0006 + rng() * 0.0018,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

export const DrumCircle: React.FC<Props> = ({ frames }) => {
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
  const cymbalShimmer = interpolate(snap.energy, [0.02, 0.30], [0.4, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const kickPulse = interpolate(snap.bass, [0.0, 0.7], [1.0, 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const stickMotion = snap.beatDecay;
  const flash = snap.onsetEnvelope > 0.55 ? Math.min(1, (snap.onsetEnvelope - 0.4) * 1.6) : 0;

  // Palette — warm brass/wood
  const baseHue = 28;
  const tintHue = ((baseHue + (snap.chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const tintLight = 60 + ambientGlow * 16;
  const tintColor = `hsl(${tintHue}, 76%, ${tintLight}%)`;
  const tintCore = `hsl(${tintHue}, 92%, ${Math.min(96, tintLight + 22)}%)`;
  const brassColor = `hsl(${(tintHue + 8) % 360}, 80%, ${66 + cymbalShimmer * 14}%)`;
  const tintDeep = `hsl(${(tintHue + 8) % 360}, 60%, 22%)`;

  const cx = width * 0.5;
  const cy = height * 0.58;
  const stageY = height * 0.82;
  const horizonY = height * 0.50;
  const radius = Math.min(width, height) * 0.27;

  // Drum positions on circle (12 drums total)
  const drumLayout = [
    { angle: -Math.PI / 2, type: "kick", size: 1.3 },           // top - kick
    { angle: -Math.PI / 2 + 0.5, type: "tom", size: 0.85 },     // upper right
    { angle: -Math.PI / 2 + 0.95, type: "tom", size: 0.85 },
    { angle: 0, type: "floortom", size: 1.0 },                  // right - floor tom
    { angle: 0.6, type: "conga", size: 1.05 },                  // lower right
    { angle: 1.3, type: "tambourine", size: 0.7 },
    { angle: Math.PI / 2, type: "snare", size: 0.95 },          // bottom - snare
    { angle: Math.PI - 0.6, type: "conga", size: 1.05 },        // lower left
    { angle: Math.PI - 1.3, type: "gong", size: 1.2 },
    { angle: Math.PI, type: "floortom", size: 1.0 },            // left
    { angle: -Math.PI / 2 - 0.95, type: "tom", size: 0.85 },    // upper left
    { angle: -Math.PI / 2 - 0.5, type: "tom", size: 0.85 },
  ];

  // Cymbal positions (above the ring)
  const cymbalLayout = [
    { angle: -Math.PI / 2 - 1.3, dist: 1.15 },
    { angle: -Math.PI / 2 + 1.3, dist: 1.15 },
    { angle: -Math.PI / 2 - 0.4, dist: 1.25 },
    { angle: -Math.PI / 2 + 0.4, dist: 1.25 },
  ];

  // Render single drum
  const renderDrum = (a: number, type: string, size: number, idx: number) => {
    const dx = cx + Math.cos(a) * radius;
    const dy = cy + Math.sin(a) * radius * 0.75;

    if (type === "kick") {
      const r = 38 * size;
      return (
        <g key={`drum-${idx}`}>
          <ellipse cx={dx} cy={dy} rx={r} ry={r * 0.95} fill="rgba(20, 14, 8, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.4} />
          <ellipse cx={dx} cy={dy} rx={r * 0.88} ry={r * 0.85 * kickPulse} fill="rgba(220, 200, 160, 0.9)" stroke={brassColor} strokeWidth={1.2} />
          <ellipse cx={dx} cy={dy} rx={r * 0.6} ry={r * 0.55 * kickPulse} fill="none" stroke="rgba(80, 60, 40, 0.55)" strokeWidth={0.8} />
          <circle cx={dx} cy={dy} r={r * 0.10} fill={brassColor} opacity={0.85} />
          {/* Lugs */}
          {Array.from({ length: 10 }).map((_, i) => {
            const la = (i / 10) * Math.PI * 2;
            return <rect key={`lug-${i}`} x={dx + Math.cos(la) * r - 1} y={dy + Math.sin(la) * r * 0.95 - 3} width={2} height={6} fill={brassColor} />;
          })}
        </g>
      );
    }

    if (type === "snare" || type === "tom" || type === "floortom") {
      const r = (type === "floortom" ? 26 : type === "snare" ? 22 : 18) * size;
      const headFlash = flash > 0 && idx % 2 === 0 ? flash : 0;
      return (
        <g key={`drum-${idx}`}>
          <ellipse cx={dx} cy={dy} rx={r} ry={r * 0.92} fill="rgba(20, 14, 8, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1.2} />
          <ellipse cx={dx} cy={dy} rx={r * 0.88} ry={r * 0.80} fill="rgba(220, 200, 160, 0.9)" stroke={brassColor} strokeWidth={1} />
          <ellipse cx={dx} cy={dy} rx={r * 0.55} ry={r * 0.50} fill="none" stroke="rgba(80, 60, 40, 0.45)" strokeWidth={0.6} />
          {headFlash > 0 && (
            <ellipse cx={dx} cy={dy} rx={r * 0.88} ry={r * 0.80} fill={tintCore} opacity={headFlash * 0.55} style={{ mixBlendMode: "screen" }} />
          )}
          {/* Lugs */}
          {Array.from({ length: 8 }).map((_, i) => {
            const la = (i / 8) * Math.PI * 2;
            return <rect key={`lug-${i}`} x={dx + Math.cos(la) * r - 1} y={dy + Math.sin(la) * r * 0.92 - 2.5} width={2} height={5} fill={brassColor} />;
          })}
          {/* Snares wires (only for snare) */}
          {type === "snare" && (
            <line x1={dx - r} y1={dy + r * 0.85} x2={dx + r} y2={dy + r * 0.85} stroke={brassColor} strokeWidth={0.6} />
          )}
        </g>
      );
    }

    if (type === "conga") {
      const r = 16 * size;
      return (
        <g key={`drum-${idx}`}>
          {/* Conga body — tall barrel */}
          <path d={`M ${dx - r} ${dy - 4} L ${dx - r * 0.85} ${dy + 36} L ${dx + r * 0.85} ${dy + 36} L ${dx + r} ${dy - 4} Q ${dx} ${dy - 8} ${dx - r} ${dy - 4} Z`}
            fill="rgba(80, 40, 20, 0.95)" stroke="rgba(0, 0, 0, 1)" strokeWidth={1} />
          {/* Head */}
          <ellipse cx={dx} cy={dy - 4} rx={r} ry={r * 0.32} fill="rgba(220, 200, 160, 0.92)" stroke={brassColor} strokeWidth={1} />
          {/* Tension hardware */}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`tens-${i}`} x1={dx - r + i * (r * 0.4)} y1={dy - 2} x2={dx - r + 2 + i * (r * 0.4)} y2={dy + 16} stroke={brassColor} strokeWidth={0.6} />
          ))}
          {/* Hoop */}
          <ellipse cx={dx} cy={dy - 4} rx={r} ry={r * 0.32} fill="none" stroke={brassColor} strokeWidth={1.2} />
        </g>
      );
    }

    if (type === "tambourine") {
      const r = 14 * size;
      return (
        <g key={`drum-${idx}`}>
          <circle cx={dx} cy={dy} r={r} fill="rgba(120, 80, 30, 0.9)" stroke="rgba(0, 0, 0, 0.85)" strokeWidth={1} />
          <circle cx={dx} cy={dy} r={r * 0.85} fill="rgba(220, 200, 160, 0.85)" />
          {/* Jingles */}
          {Array.from({ length: 8 }).map((_, i) => {
            const la = (i / 8) * Math.PI * 2;
            return <circle key={`jin-${i}`} cx={dx + Math.cos(la) * r * 0.92} cy={dy + Math.sin(la) * r * 0.92} r={1.6} fill={brassColor} opacity={0.85 + cymbalShimmer * 0.15} />;
          })}
        </g>
      );
    }

    if (type === "gong") {
      const r = 28 * size;
      return (
        <g key={`drum-${idx}`}>
          {/* Frame */}
          <rect x={dx - r - 4} y={dy - r - 4} width={2} height={r * 2 + 8} fill="rgba(40, 24, 12, 0.95)" />
          <rect x={dx + r + 2} y={dy - r - 4} width={2} height={r * 2 + 8} fill="rgba(40, 24, 12, 0.95)" />
          <rect x={dx - r - 4} y={dy - r - 6} width={r * 2 + 10} height={2} fill="rgba(40, 24, 12, 0.95)" />
          {/* Ropes */}
          <line x1={dx - r - 3} y1={dy - r - 4} x2={dx - r * 0.7} y2={dy - r * 0.7} stroke="rgba(40, 24, 12, 0.85)" strokeWidth={0.8} />
          <line x1={dx + r + 3} y1={dy - r - 4} x2={dx + r * 0.7} y2={dy - r * 0.7} stroke="rgba(40, 24, 12, 0.85)" strokeWidth={0.8} />
          {/* Gong disc */}
          <circle cx={dx} cy={dy} r={r} fill="rgba(160, 120, 40, 0.92)" stroke="rgba(60, 40, 10, 0.9)" strokeWidth={1.4} />
          <circle cx={dx} cy={dy} r={r * 0.85} fill="none" stroke="rgba(220, 180, 60, 0.55)" strokeWidth={0.8} />
          <circle cx={dx} cy={dy} r={r * 0.65} fill="none" stroke="rgba(220, 180, 60, 0.45)" strokeWidth={0.6} />
          <circle cx={dx} cy={dy} r={r * 0.40} fill="none" stroke="rgba(220, 180, 60, 0.40)" strokeWidth={0.5} />
          {/* Center dome */}
          <circle cx={dx} cy={dy} r={r * 0.18} fill="rgba(220, 180, 60, 0.85)" stroke="rgba(60, 40, 10, 0.9)" strokeWidth={0.8} />
          <circle cx={dx - 2} cy={dy - 2} r={r * 0.08} fill="rgba(255, 230, 140, 0.9)" />
        </g>
      );
    }

    return null;
  };

  // Render cymbal
  const renderCymbal = (a: number, dist: number, idx: number) => {
    const cymX = cx + Math.cos(a) * radius * dist;
    const cymY = cy + Math.sin(a) * radius * 0.75 * dist - 30;
    const cymR = 22;
    const flashOnsetIdx = flash > 0 && idx % 2 === 0 ? flash : 0;
    return (
      <g key={`cym-${idx}`}>
        {/* Stand */}
        <line x1={cymX} y1={cymY + 4} x2={cymX} y2={stageY - 12} stroke="rgba(20, 20, 20, 0.95)" strokeWidth={1.4} />
        {/* Cymbal disc */}
        <ellipse cx={cymX} cy={cymY} rx={cymR} ry={cymR * 0.18} fill="rgba(220, 180, 60, 0.95)" stroke="rgba(60, 40, 10, 0.85)" strokeWidth={0.8} />
        {/* Concentric grooves */}
        {[0.85, 0.7, 0.55, 0.4].map((f) => (
          <ellipse key={`cgroove-${f}`} cx={cymX} cy={cymY} rx={cymR * f} ry={cymR * 0.18 * f} fill="none" stroke="rgba(60, 40, 10, 0.4)" strokeWidth={0.4} />
        ))}
        {/* Bell */}
        <ellipse cx={cymX} cy={cymY - 1.5} rx={cymR * 0.18} ry={2} fill="rgba(255, 220, 100, 0.95)" />
        {/* Shimmer */}
        <ellipse cx={cymX} cy={cymY} rx={cymR} ry={cymR * 0.18} fill={tintCore} opacity={0.18 * cymbalShimmer} style={{ mixBlendMode: "screen" }} />
        {/* Flash */}
        {flashOnsetIdx > 0 && (
          <ellipse cx={cymX} cy={cymY} rx={cymR * 1.5} ry={cymR * 0.5} fill={tintCore} opacity={flashOnsetIdx * 0.55} style={{ mixBlendMode: "screen" }} />
        )}
      </g>
    );
  };

  // Drumstick pair (crossed in foreground)
  const stickAngle = stickMotion * 0.18 * Math.sin(frame * 0.5 * tempoFactor);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="dc-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0604" />
            <stop offset="50%" stopColor="#140a06" />
            <stop offset="100%" stopColor={tintDeep} />
          </linearGradient>
          <linearGradient id="dc-stage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(14, 10, 6, 0.95)" />
            <stop offset="100%" stopColor="rgba(2, 1, 0, 0.99)" />
          </linearGradient>
          <radialGradient id="dc-halo">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.35} />
            <stop offset="60%" stopColor={tintColor} stopOpacity={0.10} />
            <stop offset="100%" stopColor={tintColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="dc-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>
          <linearGradient id="dc-stick" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3a2010" />
            <stop offset="50%" stopColor="#7a4818" />
            <stop offset="100%" stopColor="#2a1808" />
          </linearGradient>
          <filter id="dc-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Background */}
        <rect width={width} height={height} fill="url(#dc-bg)" />

        {/* Truss + lights */}
        <rect x={width * 0.04} y={height * 0.06} width={width * 0.92} height={5} fill="rgba(0, 0, 0, 0.85)" />
        {[0.18, 0.32, 0.46, 0.54, 0.68, 0.82].map((px, i) => (
          <g key={`fix-${i}`}>
            <line x1={width * px} y1={height * 0.065} x2={width * px} y2={height * 0.11} stroke="rgba(0, 0, 0, 0.9)" strokeWidth={2} />
            <rect x={width * px - 5} y={height * 0.11} width={10} height={6} fill="rgba(0, 0, 0, 0.95)" />
            <circle cx={width * px} cy={height * 0.12} r={2.5 + cymbalShimmer * 1.5} fill={tintCore} opacity={0.55 + cymbalShimmer * 0.35} />
            <path d={`M ${width * px - 4} ${height * 0.13} L ${width * px - 22} ${height * 0.36} L ${width * px + 22} ${height * 0.36} L ${width * px + 4} ${height * 0.13} Z`}
              fill={tintColor} opacity={0.10 * cymbalShimmer} style={{ mixBlendMode: "screen" }} />
          </g>
        ))}

        {/* Backdrop */}
        <rect x={0} y={horizonY} width={width} height={stageY - horizonY} fill="rgba(8, 4, 2, 0.85)" />

        {/* Stage floor */}
        <rect x={0} y={stageY} width={width} height={height - stageY} fill="url(#dc-stage)" />
        <rect x={0} y={stageY - 1} width={width} height={2} fill={tintColor} opacity={0.30 * ambientGlow} />
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`plank-${i}`} x1={0} y1={stageY + 6 + i * 12} x2={width} y2={stageY + 6 + i * 12}
            stroke="rgba(0, 0, 0, 0.45)" strokeWidth={0.6} />
        ))}

        {/* Halo behind drum kit */}
        <ellipse cx={cx} cy={cy + 20} rx={radius * 1.6 * (0.85 + ambientGlow * 0.3)} ry={radius * 1.0}
          fill="url(#dc-halo)" style={{ mixBlendMode: "screen" }} />

        {/* Cymbals (back layer) */}
        {cymbalLayout.map((c, i) => renderCymbal(c.angle, c.dist, i))}

        {/* Percussionist silhouette suggestion (between two kits) */}
        <g transform={`translate(${cx} ${cy + 30})`}>
          <ellipse cx={0} cy={-30} rx={12} ry={14} fill="rgba(0, 0, 0, 0.95)" />
          <path d="M -22 -10 Q -28 12 -22 32 L 22 32 Q 28 12 22 -10 Q 0 -22 -22 -10 Z" fill="rgba(0, 0, 0, 0.95)" />
          {/* Hair / hat */}
          <path d="M -12 -42 Q 0 -48 12 -42 Q 14 -36 12 -30 L -12 -30 Q -14 -36 -12 -42 Z" fill="rgba(0, 0, 0, 0.95)" />
        </g>

        {/* Drums (foreground ring) */}
        {drumLayout.map((d, i) => renderDrum(d.angle, d.type, d.size, i))}

        {/* Crossed drumsticks center foreground */}
        <g transform={`translate(${cx} ${cy + 14}) rotate(${stickAngle * 60})`}>
          <line x1={-50} y1={0} x2={50} y2={0} stroke="url(#dc-stick)" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={50} cy={0} rx={3.5} ry={2.5} fill="rgba(220, 200, 160, 0.95)" />
          <ellipse cx={-50} cy={0} rx={2} ry={1.5} fill="rgba(80, 50, 18, 0.95)" />
        </g>
        <g transform={`translate(${cx} ${cy + 14}) rotate(${-30 - stickAngle * 60})`}>
          <line x1={-50} y1={0} x2={50} y2={0} stroke="url(#dc-stick)" strokeWidth={3} strokeLinecap="round" />
          <ellipse cx={50} cy={0} rx={3.5} ry={2.5} fill="rgba(220, 200, 160, 0.95)" />
          <ellipse cx={-50} cy={0} rx={2} ry={1.5} fill="rgba(80, 50, 18, 0.95)" />
        </g>

        {/* Onset flash burst from kit center */}
        {flash > 0 && (
          <>
            <circle cx={cx} cy={cy + 14} r={radius * 1.4 + flash * 60}
              fill="none" stroke={tintCore} strokeWidth={2 + flash * 2} opacity={flash * 0.5} style={{ mixBlendMode: "screen" }} />
            <circle cx={cx} cy={cy + 14} r={radius * 0.9 + flash * 40}
              fill="none" stroke={tintColor} strokeWidth={1.5} opacity={flash * 0.4} style={{ mixBlendMode: "screen" }} />
          </>
        )}

        {/* Particles */}
        <g style={{ mixBlendMode: "screen" }}>
          {particles.map((p, i) => {
            const t = frame * p.speed * tempoFactor + p.phase;
            const px = (p.x + Math.sin(t * 1.2) * 0.04) * width;
            const py = (p.y + Math.sin(t * 0.6) * 0.02) * height;
            const flicker = 0.5 + Math.sin(t * 2.4) * 0.4;
            return (
              <circle key={`p-${i}`} cx={px} cy={py} r={p.r * (0.8 + ambientGlow * 0.4)}
                fill={tintCore} opacity={0.30 * flicker * ambientGlow} />
            );
          })}
        </g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#dc-vig)" />
      </svg>
    </div>
  );
};
