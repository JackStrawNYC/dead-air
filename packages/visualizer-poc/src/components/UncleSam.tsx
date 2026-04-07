/**
 * UncleSam — A+++ Uncle Sam recruiting-poster scene for "U.S. Blues".
 *
 * Iconic top-hatted Uncle Sam silhouette dominates ~50% of the frame, finger
 * pointing toward camera "I want YOU". White beard, red-and-white striped hat
 * with starred band, blue tailcoat, red bow tie. Behind him: psychedelic
 * stars-and-stripes flag rippling, fireworks bursts, recruiting-poster
 * yellow border vignette. Tie-dye sky behind. The Dead's "U.S. Blues" patriotic
 * irreverence — psychedelic palette, not literal red/white/blue.
 *
 * Audio reactivity:
 *   slowEnergy   → flag wave amplitude
 *   energy       → fireworks intensity
 *   bass         → finger-point throb
 *   beatDecay    → star pulse
 *   onsetEnvelope→ firework burst trigger
 *   chromaHue    → palette shift (psychedelic patriotic)
 *   tempoFactor  → flag/firework rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

interface Firework {
  cx: number;
  cy: number;
  rays: number;
  hue: number;
  phase: number;
  cycle: number;
}

interface FlagPoint {
  baseY: number;
  amp: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const UncleSam: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const stars = React.useMemo<Star[]>(() => {
    const rng = seeded(98_113_447);
    return Array.from({ length: 38 }, () => ({
      x: rng(),
      y: rng() * 0.5,
      size: 2 + rng() * 4,
      phase: rng() * Math.PI * 2,
      speed: 0.005 + rng() * 0.012,
    }));
  }, []);

  const fireworks = React.useMemo<Firework[]>(() => {
    const rng = seeded(45_667_889);
    return Array.from({ length: 6 }, () => ({
      cx: 0.1 + rng() * 0.8,
      cy: 0.10 + rng() * 0.30,
      rays: 16 + Math.floor(rng() * 8),
      hue: rng() * 360,
      phase: rng() * Math.PI * 2,
      cycle: 60 + rng() * 80,
    }));
  }, []);

  const flagPts = React.useMemo<FlagPoint[]>(() => {
    const rng = seeded(33_887_447);
    return Array.from({ length: 18 }, (_, i) => ({
      baseY: 0.5 + (i % 6) * 0.05,
      amp: 8 + rng() * 14,
    }));
  }, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.09], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.91, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const energy = snap.energy;
  const bass = snap.bass;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const onsetEnv = snap.onsetEnvelope;
  const chromaHue = snap.chromaHue;

  const flagWave = 0.5 + slowEnergy * 0.5 + bass * 0.2;
  const fireworkIntensity = 0.5 + energy * 0.4 + onsetEnv * 0.5;
  const fingerPulse = 1 + bass * 0.08 + beatDecay * 0.04;
  const starPulse = 1 + beatDecay * 0.4;

  /* Psychedelic patriotic palette */
  const baseHue = 350;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.40) % 360 + 360) % 360;
  const redHue = (tintHue) % 360;
  const blueHue = (tintHue + 200) % 360;
  const goldHue = (tintHue + 60) % 360;

  const cx = width * 0.5;
  const samCx = cx;
  const samBaseY = height * 0.96;
  const samH = height * 0.92;
  const samW = width * 0.52;

  /* Star pattern (American flag-style 5-point) */
  function drawStar(cxS: number, cyS: number, r: number, fill: string, opacity = 1): React.ReactNode {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.4;
      pts.push(`${cxS + Math.cos(a) * rr},${cyS + Math.sin(a) * rr}`);
    }
    return <polygon points={pts.join(" ")} fill={fill} opacity={opacity} />;
  }

  /* Background star nodes */
  const starNodes = stars.map((s, i) => {
    const t = frame * s.speed + s.phase;
    const flicker = 0.6 + Math.sin(t) * 0.4;
    return (
      <g key={`star-${i}`} opacity={flicker * starPulse * 0.85}>
        {drawStar(s.x * width, s.y * height, s.size * starPulse, `hsl(${goldHue}, 90%, 80%)`, 1)}
      </g>
    );
  });

  /* Firework nodes */
  const fireworkNodes = fireworks.map((fw, i) => {
    const cycleT = ((frame + i * 30) % fw.cycle) / fw.cycle;
    const op = (1 - cycleT) * 0.85 * fireworkIntensity;
    if (op < 0.02) return null;
    const radius = cycleT * 60;
    const rays: React.ReactNode[] = [];
    for (let r = 0; r < fw.rays; r++) {
      const a = (r / fw.rays) * Math.PI * 2;
      const x1 = fw.cx * width + Math.cos(a) * radius * 0.3;
      const y1 = fw.cy * height + Math.sin(a) * radius * 0.3;
      const x2 = fw.cx * width + Math.cos(a) * radius;
      const y2 = fw.cy * height + Math.sin(a) * radius;
      rays.push(
        <line
          key={`fwr-${i}-${r}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`hsl(${(fw.hue + tintHue) % 360}, 90%, 70%)`}
          strokeWidth={1.5}
          strokeLinecap="round"
        />,
      );
    }
    return (
      <g key={`fw-${i}`} opacity={op} style={{ mixBlendMode: "screen" }}>
        <circle cx={fw.cx * width} cy={fw.cy * height} r={radius * 0.3} fill={`hsla(${(fw.hue + tintHue) % 360}, 95%, 85%, 0.6)`} />
        {rays}
      </g>
    );
  });

  /* Flag stripe path generator (rippling waves) */
  const stripeHeight = height * 0.06;
  function buildFlagPath(yBase: number, ampMul: number): string {
    const segs = 30;
    let p = `M 0 ${yBase}`;
    for (let i = 0; i <= segs; i++) {
      const xn = i / segs;
      const x = xn * width;
      const y = yBase + Math.sin(xn * 6 + frame * 0.04 * tempoFactor) * (stripeHeight * 0.4 * ampMul * flagWave)
                    + Math.sin(xn * 12 + frame * 0.03) * (stripeHeight * 0.18 * ampMul);
      p += ` L ${x} ${y}`;
    }
    p += ` L ${width} ${yBase + stripeHeight} L 0 ${yBase + stripeHeight} Z`;
    return p;
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="us-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${blueHue}, 65%, 12%)`} />
            <stop offset="50%" stopColor={`hsl(${(blueHue + 20) % 360}, 65%, 32%)`} />
            <stop offset="100%" stopColor={`hsl(${redHue}, 70%, 38%)`} />
          </linearGradient>
          <linearGradient id="us-coat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${blueHue}, 70%, 30%)`} />
            <stop offset="50%" stopColor={`hsl(${blueHue}, 65%, 22%)`} />
            <stop offset="100%" stopColor={`hsl(${blueHue}, 70%, 12%)`} />
          </linearGradient>
          <linearGradient id="us-hat-stripe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`hsl(${redHue}, 90%, 50%)`} />
            <stop offset="100%" stopColor={`hsl(${redHue}, 95%, 30%)`} />
          </linearGradient>
          <radialGradient id="us-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`hsl(${goldHue}, 95%, 80%)`} stopOpacity={0.85} />
            <stop offset="100%" stopColor={`hsl(${goldHue}, 90%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="us-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0CFA8" />
            <stop offset="100%" stopColor="#B88858" />
          </linearGradient>
          <linearGradient id="us-beard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8F5EE" />
            <stop offset="100%" stopColor="#C8C0B0" />
          </linearGradient>
          <filter id="us-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* SKY (psychedelic patriotic) */}
        <rect width={width} height={height} fill="url(#us-sky)" />

        {/* BACKGROUND STARS */}
        {starNodes}

        {/* === RIPPLING FLAG BEHIND SAM === */}
        <g opacity={0.65}>
          {/* 7 red stripes + 6 white stripes */}
          {Array.from({ length: 7 }, (_, i) => {
            const yBase = height * 0.20 + i * stripeHeight * 1.3;
            return (
              <path
                key={`stripe-r-${i}`}
                d={buildFlagPath(yBase, 1 - i * 0.05)}
                fill={`hsla(${(redHue + i * 8) % 360}, 85%, ${55 - i * 2}%, 0.85)`}
              />
            );
          })}
          {Array.from({ length: 6 }, (_, i) => {
            const yBase = height * 0.20 + stripeHeight * 0.8 + i * stripeHeight * 1.3;
            return (
              <path
                key={`stripe-w-${i}`}
                d={buildFlagPath(yBase, 1 - i * 0.05)}
                fill={`hsla(${(goldHue + i * 6) % 360}, 80%, ${78 - i * 3}%, 0.7)`}
              />
            );
          })}
        </g>

        {/* CANTON (blue field with stars) — upper left */}
        <rect
          x={width * 0.06}
          y={height * 0.18}
          width={width * 0.32}
          height={height * 0.22}
          fill={`hsla(${blueHue}, 70%, 28%, 0.78)`}
        />
        {Array.from({ length: 50 }, (_, i) => {
          const row = Math.floor(i / 10);
          const col = i % 10;
          return (
            <g key={`cs-${i}`}>
              {drawStar(
                width * 0.06 + col * (width * 0.032) + width * 0.016,
                height * 0.18 + row * (height * 0.044) + height * 0.022,
                3 * starPulse,
                `hsl(${goldHue}, 95%, 88%)`,
                0.85,
              )}
            </g>
          );
        })}

        {/* FIREWORKS */}
        {fireworkNodes}

        {/* === UNCLE SAM SILHOUETTE === */}

        {/* Body shadow */}
        <ellipse
          cx={samCx + 6}
          cy={samBaseY - 4}
          rx={samW * 0.4}
          ry={20}
          fill="rgba(0, 0, 0, 0.45)"
          filter="url(#us-blur)"
        />

        {/* TAILCOAT body (pentagon-ish silhouette) */}
        <path
          d={`M ${samCx - samW * 0.30} ${samBaseY}
              Q ${samCx - samW * 0.32} ${samBaseY - samH * 0.30} ${samCx - samW * 0.22} ${samBaseY - samH * 0.45}
              L ${samCx - samW * 0.18} ${samBaseY - samH * 0.55}
              L ${samCx - samW * 0.22} ${samBaseY - samH * 0.62}
              L ${samCx + samW * 0.22} ${samBaseY - samH * 0.62}
              L ${samCx + samW * 0.18} ${samBaseY - samH * 0.55}
              L ${samCx + samW * 0.22} ${samBaseY - samH * 0.45}
              Q ${samCx + samW * 0.32} ${samBaseY - samH * 0.30} ${samCx + samW * 0.30} ${samBaseY}
              Z`}
          fill="url(#us-coat)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={2.5}
        />
        {/* Coat lapels */}
        <path
          d={`M ${samCx - samW * 0.18} ${samBaseY - samH * 0.55}
              L ${samCx - samW * 0.04} ${samBaseY - samH * 0.42}
              L ${samCx - samW * 0.08} ${samBaseY - samH * 0.32}
              L ${samCx - samW * 0.20} ${samBaseY - samH * 0.45} Z`}
          fill={`hsl(${blueHue}, 75%, 18%)`}
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.6}
        />
        <path
          d={`M ${samCx + samW * 0.18} ${samBaseY - samH * 0.55}
              L ${samCx + samW * 0.04} ${samBaseY - samH * 0.42}
              L ${samCx + samW * 0.08} ${samBaseY - samH * 0.32}
              L ${samCx + samW * 0.20} ${samBaseY - samH * 0.45} Z`}
          fill={`hsl(${blueHue}, 75%, 18%)`}
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.6}
        />
        {/* Coat brass buttons */}
        {Array.from({ length: 5 }, (_, i) => (
          <circle
            key={`btn-${i}`}
            cx={samCx}
            cy={samBaseY - samH * 0.42 + i * (samH * 0.06)}
            r={3.5}
            fill={`hsl(${goldHue}, 90%, 65%)`}
            stroke="rgba(40, 28, 8, 0.95)"
            strokeWidth={0.6}
          />
        ))}

        {/* WHITE SHIRT/COLLAR */}
        <path
          d={`M ${samCx - samW * 0.06} ${samBaseY - samH * 0.55}
              L ${samCx - samW * 0.04} ${samBaseY - samH * 0.62}
              L ${samCx + samW * 0.04} ${samBaseY - samH * 0.62}
              L ${samCx + samW * 0.06} ${samBaseY - samH * 0.55}
              L ${samCx + samW * 0.04} ${samBaseY - samH * 0.50}
              L ${samCx - samW * 0.04} ${samBaseY - samH * 0.50} Z`}
          fill="rgba(245, 240, 228, 0.95)"
          stroke="rgba(40, 28, 8, 0.85)"
          strokeWidth={1.2}
        />
        {/* RED BOW TIE */}
        <path
          d={`M ${samCx - 14} ${samBaseY - samH * 0.555}
              L ${samCx - 6} ${samBaseY - samH * 0.555}
              L ${samCx - 6} ${samBaseY - samH * 0.535}
              L ${samCx - 14} ${samBaseY - samH * 0.535} Z`}
          fill={`hsl(${redHue}, 95%, 50%)`}
          stroke="rgba(40, 8, 8, 0.95)"
          strokeWidth={1}
        />
        <path
          d={`M ${samCx + 6} ${samBaseY - samH * 0.555}
              L ${samCx + 14} ${samBaseY - samH * 0.555}
              L ${samCx + 14} ${samBaseY - samH * 0.535}
              L ${samCx + 6} ${samBaseY - samH * 0.535} Z`}
          fill={`hsl(${redHue}, 95%, 50%)`}
          stroke="rgba(40, 8, 8, 0.95)"
          strokeWidth={1}
        />
        <rect
          x={samCx - 6}
          y={samBaseY - samH * 0.555}
          width={12}
          height={20}
          fill={`hsl(${redHue}, 95%, 35%)`}
          stroke="rgba(40, 8, 8, 0.95)"
          strokeWidth={0.8}
        />

        {/* HEAD */}
        <ellipse
          cx={samCx}
          cy={samBaseY - samH * 0.66}
          rx={samW * 0.10}
          ry={samW * 0.13}
          fill="url(#us-skin)"
          stroke="rgba(80, 40, 12, 0.95)"
          strokeWidth={1.8}
        />
        {/* Eyes (glaring forward) */}
        <ellipse cx={samCx - 9} cy={samBaseY - samH * 0.69} rx={3} ry={2} fill="rgba(245, 245, 240, 0.95)" />
        <ellipse cx={samCx + 9} cy={samBaseY - samH * 0.69} rx={3} ry={2} fill="rgba(245, 245, 240, 0.95)" />
        <circle cx={samCx - 9} cy={samBaseY - samH * 0.69} r={1.4} fill={`hsl(${blueHue}, 70%, 30%)`} />
        <circle cx={samCx + 9} cy={samBaseY - samH * 0.69} r={1.4} fill={`hsl(${blueHue}, 70%, 30%)`} />
        {/* Bushy white eyebrows */}
        <path
          d={`M ${samCx - 14} ${samBaseY - samH * 0.71} Q ${samCx - 9} ${samBaseY - samH * 0.72} ${samCx - 4} ${samBaseY - samH * 0.71}`}
          stroke="rgba(245, 240, 228, 0.95)"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${samCx + 4} ${samBaseY - samH * 0.71} Q ${samCx + 9} ${samBaseY - samH * 0.72} ${samCx + 14} ${samBaseY - samH * 0.71}`}
          stroke="rgba(245, 240, 228, 0.95)"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
        {/* Nose */}
        <path
          d={`M ${samCx - 2} ${samBaseY - samH * 0.69} L ${samCx - 4} ${samBaseY - samH * 0.65} L ${samCx + 2} ${samBaseY - samH * 0.65} L ${samCx + 1} ${samBaseY - samH * 0.69}`}
          fill="rgba(180, 110, 60, 0.85)"
          stroke="rgba(80, 40, 12, 0.95)"
          strokeWidth={0.8}
        />
        {/* WHITE BEARD (long, full) */}
        <path
          d={`M ${samCx - samW * 0.10} ${samBaseY - samH * 0.62}
              Q ${samCx - samW * 0.12} ${samBaseY - samH * 0.55} ${samCx - samW * 0.06} ${samBaseY - samH * 0.51}
              L ${samCx - samW * 0.04} ${samBaseY - samH * 0.55}
              L ${samCx + samW * 0.04} ${samBaseY - samH * 0.55}
              L ${samCx + samW * 0.06} ${samBaseY - samH * 0.51}
              Q ${samCx + samW * 0.12} ${samBaseY - samH * 0.55} ${samCx + samW * 0.10} ${samBaseY - samH * 0.62}
              Q ${samCx + samW * 0.04} ${samBaseY - samH * 0.65} ${samCx} ${samBaseY - samH * 0.65}
              Q ${samCx - samW * 0.04} ${samBaseY - samH * 0.65} ${samCx - samW * 0.10} ${samBaseY - samH * 0.62} Z`}
          fill="url(#us-beard)"
          stroke="rgba(120, 100, 70, 0.85)"
          strokeWidth={1.4}
        />
        {/* Mustache */}
        <path
          d={`M ${samCx - 10} ${samBaseY - samH * 0.658}
              Q ${samCx - 4} ${samBaseY - samH * 0.652} ${samCx} ${samBaseY - samH * 0.658}
              Q ${samCx + 4} ${samBaseY - samH * 0.652} ${samCx + 10} ${samBaseY - samH * 0.658}`}
          stroke="rgba(245, 240, 228, 0.95)"
          strokeWidth={2.5}
          fill="none"
        />
        {/* Beard wisps */}
        {Array.from({ length: 18 }, (_, i) => {
          const a = -Math.PI * 0.5 - 0.3 + (i / 17) * 0.6;
          const r1 = samW * 0.08;
          const r2 = samW * 0.12;
          return (
            <line
              key={`bw-${i}`}
              x1={samCx + Math.cos(a) * r1}
              y1={samBaseY - samH * 0.62 + 4 + Math.abs(Math.sin(a)) * 6}
              x2={samCx + Math.cos(a) * r2}
              y2={samBaseY - samH * 0.55 + i * 0.5}
              stroke="rgba(245, 240, 228, 0.85)"
              strokeWidth={1}
            />
          );
        })}

        {/* === TOP HAT === */}
        {/* Hat shadow */}
        <ellipse
          cx={samCx + 4}
          cy={samBaseY - samH * 0.78}
          rx={samW * 0.18}
          ry={6}
          fill="rgba(0, 0, 0, 0.4)"
          filter="url(#us-blur)"
        />
        {/* Hat brim */}
        <ellipse
          cx={samCx}
          cy={samBaseY - samH * 0.78}
          rx={samW * 0.15}
          ry={6}
          fill={`hsl(${blueHue}, 75%, 18%)`}
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={2}
        />
        {/* Hat crown — tall stovepipe with red/white stripes */}
        {Array.from({ length: 8 }, (_, i) => {
          const sty = samBaseY - samH * 0.78 - i * (samH * 0.024);
          const isRed = i % 2 === 0;
          return (
            <rect
              key={`hsr-${i}`}
              x={samCx - samW * 0.10}
              y={sty - samH * 0.024}
              width={samW * 0.20}
              height={samH * 0.024}
              fill={isRed ? `hsl(${redHue}, 90%, 50%)` : "rgba(245, 240, 228, 0.95)"}
              stroke="rgba(0, 0, 0, 0.95)"
              strokeWidth={1.4}
            />
          );
        })}
        {/* Star band on hat (between brim and stripes) */}
        <rect
          x={samCx - samW * 0.10}
          y={samBaseY - samH * 0.78 - samH * 0.024}
          width={samW * 0.20}
          height={samH * 0.024}
          fill={`hsl(${blueHue}, 80%, 22%)`}
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.4}
        />
        {Array.from({ length: 5 }, (_, i) => {
          const sx = samCx - samW * 0.10 + 8 + i * (samW * 0.043);
          return drawStar(sx, samBaseY - samH * 0.78 - samH * 0.012, 3, `hsl(${goldHue}, 95%, 88%)`, 0.95);
        })}
        {/* Hat top highlight */}
        <ellipse
          cx={samCx - samW * 0.05}
          cy={samBaseY - samH * 0.78 - samH * 0.18}
          rx={samW * 0.04}
          ry={2}
          fill="rgba(255, 255, 255, 0.30)"
        />

        {/* === POINTING ARM === */}
        {/* Right arm reaches forward toward viewer */}
        <g transform={`scale(${fingerPulse}, 1) translate(${samCx * (1 - fingerPulse) / fingerPulse}, 0)`}>
          {/* Sleeve */}
          <path
            d={`M ${samCx + samW * 0.10} ${samBaseY - samH * 0.50}
                L ${samCx + samW * 0.30} ${samBaseY - samH * 0.42}
                L ${samCx + samW * 0.30} ${samBaseY - samH * 0.32}
                L ${samCx + samW * 0.10} ${samBaseY - samH * 0.40} Z`}
            fill="url(#us-coat)"
            stroke="rgba(0, 0, 0, 0.95)"
            strokeWidth={2}
          />
          {/* Cuff */}
          <rect
            x={samCx + samW * 0.28}
            y={samBaseY - samH * 0.42}
            width={samW * 0.04}
            height={samH * 0.10}
            fill="rgba(245, 240, 228, 0.95)"
            stroke="rgba(0, 0, 0, 0.85)"
            strokeWidth={1.4}
          />
          {/* Hand + finger */}
          <ellipse
            cx={samCx + samW * 0.34}
            cy={samBaseY - samH * 0.36}
            rx={10}
            ry={6}
            fill="url(#us-skin)"
            stroke="rgba(80, 40, 12, 0.95)"
            strokeWidth={1.2}
          />
          {/* Index finger pointing */}
          <path
            d={`M ${samCx + samW * 0.34} ${samBaseY - samH * 0.36}
                Q ${samCx + samW * 0.40} ${samBaseY - samH * 0.36} ${samCx + samW * 0.42} ${samBaseY - samH * 0.34}
                L ${samCx + samW * 0.42} ${samBaseY - samH * 0.32}
                Q ${samCx + samW * 0.40} ${samBaseY - samH * 0.32} ${samCx + samW * 0.34} ${samBaseY - samH * 0.34} Z`}
            fill="url(#us-skin)"
            stroke="rgba(80, 40, 12, 0.95)"
            strokeWidth={1}
          />
          {/* Fingernail */}
          <ellipse
            cx={samCx + samW * 0.41}
            cy={samBaseY - samH * 0.33}
            rx={1.4}
            ry={0.8}
            fill="rgba(255, 240, 220, 0.85)"
          />
        </g>

        {/* === GLOW HALO around Sam === */}
        <g style={{ mixBlendMode: "screen" }}>
          <ellipse
            cx={samCx}
            cy={samBaseY - samH * 0.55}
            rx={samW * 0.5}
            ry={samH * 0.5}
            fill="url(#us-glow)"
            opacity={0.35 + slowEnergy * 0.25}
          />
        </g>

        {/* === RECRUITING POSTER YELLOW BORDER === */}
        <rect
          x={20}
          y={20}
          width={width - 40}
          height={height - 40}
          fill="none"
          stroke={`hsl(${goldHue}, 90%, 60%)`}
          strokeWidth={6}
          opacity={0.85}
        />
        <rect
          x={32}
          y={32}
          width={width - 64}
          height={height - 64}
          fill="none"
          stroke={`hsl(${redHue}, 85%, 55%)`}
          strokeWidth={2}
          opacity={0.7}
        />

        {/* TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue}, 60%, 50%, ${0.04 + slowEnergy * 0.04})`} />

        {/* VIGNETTE */}
        <radialGradient id="us-vign" cx="50%" cy="50%" r="70%">
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#us-vign)" />
      </svg>
    </div>
  );
};
