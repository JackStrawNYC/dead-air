/**
 * BobCowboyHat — A+++ giant cowboy-hat hero scene.
 *
 * Bob Weir's signature wide-brim Stetson dominates the frame at ~50% width:
 * tall pinched crown, dramatic brim curl, woven hatband with concho buckle,
 * decorative stitching, eagle feather, weathered leather creases, and a
 * faint band of rainbow stitching. The hat sits over a dusty western horizon
 * with a setting sun, distant mesas, sagebrush silhouettes, and lazy
 * tumbleweeds blown across the foreground.
 *
 * Audio reactivity:
 *   slowEnergy   → sun warmth + rim light
 *   energy       → dust density + concho shine
 *   bass         → tumbleweed roll speed
 *   beatDecay    → hat rim glow pulse
 *   onsetEnvelope→ gold concho flash
 *   chromaHue    → western palette shift
 *   tempoFactor  → wind/tumbleweed rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

interface DustMote {
  bx: number;
  by: number;
  r: number;
  speed: number;
  phase: number;
}

interface Tumbleweed {
  bx: number;
  by: number;
  r: number;
  speed: number;
  phase: number;
}

interface Sage {
  x: number;
  scale: number;
  branchCount: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const BobCowboyHat: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const dust = React.useMemo<DustMote[]>(() => {
    const rng = seeded(67_223_005);
    return Array.from({ length: 70 }, () => ({
      bx: rng(),
      by: 0.3 + rng() * 0.65,
      r: 0.4 + rng() * 1.6,
      speed: 0.001 + rng() * 0.005,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const tumbles = React.useMemo<Tumbleweed[]>(() => {
    const rng = seeded(33_115_009);
    return Array.from({ length: 4 }, (_, i) => ({
      bx: -0.1 + (i * 0.34) + rng() * 0.04,
      by: 0.78 + rng() * 0.10,
      r: 14 + rng() * 18,
      speed: 0.0015 + rng() * 0.0025,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const sages = React.useMemo<Sage[]>(() => {
    const rng = seeded(82_447_103);
    return Array.from({ length: 12 }, (_, i) => ({
      x: i / 11 + (rng() - 0.5) * 0.05,
      scale: 0.6 + rng() * 0.7,
      branchCount: 5 + Math.floor(rng() * 4),
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

  const sunBright = 0.6 + slowEnergy * 0.4;
  const conchoShine = 0.5 + energy * 0.4 + onsetEnv * 0.5 + beatDecay * 0.2;
  const rimGlow = 0.5 + slowEnergy * 0.3 + beatDecay * 0.3;
  const tumbleSpeed = 0.5 + bass * 2.0;

  const baseHue = 28;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.30) % 360 + 360) % 360;
  const skyTop = `hsl(${(tintHue + 230) % 360}, 45%, 24%)`;
  const skyMid = `hsl(${(tintHue + 12) % 360}, 75%, 48%)`;
  const skyHorizon = `hsl(${(tintHue - 6 + 360) % 360}, 92%, 70%)`;
  const skyBottom = `hsl(${(tintHue - 14 + 360) % 360}, 78%, 60%)`;
  const sandColor = `hsl(${(tintHue + 8) % 360}, 55%, 55%)`;
  const sandShade = `hsl(${(tintHue + 14) % 360}, 50%, 38%)`;

  const cx = width * 0.5;
  const horizonY = height * 0.62;

  /* HAT geometry — ~50% of frame width */
  const hatW = width * 0.50;
  const hatCx = cx;
  const hatCy = height * 0.50;
  const brimW = hatW;
  const brimH = hatW * 0.16;
  const crownW = hatW * 0.46;
  const crownH = hatW * 0.34;

  /* Dust nodes */
  const dustNodes = dust.map((d, i) => {
    const t = frame * d.speed * tempoFactor + d.phase;
    const px = ((d.bx + Math.sin(t) * 0.02 + t * 0.04) % 1.2) * width;
    const py = (d.by * height) + Math.cos(t * 1.3) * 4;
    const op = (0.18 + Math.sin(t * 2 + i) * 0.10) * (0.5 + energy * 0.5);
    return (
      <circle
        key={`dust-${i}`}
        cx={px}
        cy={py}
        r={d.r}
        fill={`hsla(${tintHue + 10}, 60%, 70%, ${op})`}
      />
    );
  });

  /* Tumbleweed nodes */
  const tumbleNodes = tumbles.map((tw, i) => {
    const t = frame * tw.speed * tempoFactor * tumbleSpeed + tw.phase;
    const px = ((tw.bx + t * 0.4) % 1.4) * width - tw.r;
    const py = tw.by * height + Math.sin(t * 4) * 6;
    const rot = (frame * tumbleSpeed * 8 + i * 90) % 360;
    return (
      <g key={`tw-${i}`} transform={`translate(${px}, ${py}) rotate(${rot})`}>
        <circle cx={0} cy={0} r={tw.r} fill="rgba(110, 76, 30, 0.32)" />
        {Array.from({ length: 18 }, (_, k) => {
          const a = (k / 18) * Math.PI * 2 + (k % 2) * 0.3;
          const r0 = tw.r * 0.4;
          const r1 = tw.r * (0.85 + (k % 3) * 0.05);
          return (
            <line
              key={k}
              x1={Math.cos(a) * r0}
              y1={Math.sin(a) * r0}
              x2={Math.cos(a) * r1}
              y2={Math.sin(a) * r1}
              stroke="rgba(140, 92, 36, 0.85)"
              strokeWidth={0.8}
            />
          );
        })}
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2 + 0.4;
          return (
            <line
              key={`b-${k}`}
              x1={Math.cos(a) * tw.r * 0.3}
              y1={Math.sin(a) * tw.r * 0.3}
              x2={Math.cos(a + 0.7) * tw.r * 0.95}
              y2={Math.sin(a + 0.7) * tw.r * 0.95}
              stroke="rgba(80, 50, 20, 0.7)"
              strokeWidth={0.6}
            />
          );
        })}
      </g>
    );
  });

  /* Sage silhouettes */
  const sageNodes = sages.map((s, i) => {
    const sx = s.x * width;
    const sy = horizonY + 6 + (i % 2) * 4;
    const w = 18 * s.scale;
    const h = 12 * s.scale;
    const branches = Array.from({ length: s.branchCount }, (_, k) => {
      const dx = (k - s.branchCount / 2) * (w / s.branchCount);
      const ty = sy - h - Math.sin(k * 0.7) * 3;
      return (
        <line
          key={k}
          x1={sx + dx * 0.2}
          y1={sy}
          x2={sx + dx}
          y2={ty}
          stroke="rgba(20, 14, 8, 0.85)"
          strokeWidth={1.2}
        />
      );
    });
    return (
      <g key={`sage-${i}`} opacity={0.85}>
        <ellipse cx={sx} cy={sy} rx={w * 0.4} ry={1.2} fill="rgba(20, 14, 8, 0.85)" />
        {branches}
        {Array.from({ length: s.branchCount * 2 }, (_, k) => (
          <circle
            key={`leaf-${k}`}
            cx={sx + (k - s.branchCount) * (w / (s.branchCount * 2))}
            cy={sy - h - Math.sin(k * 0.4) * 2}
            r={1.6}
            fill="rgba(80, 90, 50, 0.85)"
          />
        ))}
      </g>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <linearGradient id="bch-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="40%" stopColor={skyMid} />
            <stop offset="75%" stopColor={skyHorizon} />
            <stop offset="100%" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="bch-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFAE0" stopOpacity={0.95 * sunBright} />
            <stop offset="40%" stopColor={`hsl(${(tintHue + 14) % 360}, 95%, 70%)`} stopOpacity={0.7 * sunBright} />
            <stop offset="100%" stopColor={`hsl(${tintHue}, 90%, 60%)`} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="bch-felt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2615" />
            <stop offset="40%" stopColor="#5b3a1d" />
            <stop offset="80%" stopColor="#3a230f" />
            <stop offset="100%" stopColor="#1c1108" />
          </linearGradient>
          <linearGradient id="bch-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d1108" />
            <stop offset="50%" stopColor="#2d1c10" />
            <stop offset="100%" stopColor="#0f0804" />
          </linearGradient>
          <radialGradient id="bch-concho" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#FFF8C0" />
            <stop offset="30%" stopColor="#F4D060" />
            <stop offset="65%" stopColor="#B07020" />
            <stop offset="100%" stopColor="#5a380c" />
          </radialGradient>
          <linearGradient id="bch-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sandColor} />
            <stop offset="100%" stopColor={sandShade} />
          </linearGradient>
          <filter id="bch-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* SKY */}
        <rect width={width} height={height} fill="url(#bch-sky)" />

        {/* SUN — behind/lower right */}
        <circle cx={width * 0.74} cy={horizonY - 8} r={Math.min(width, height) * 0.10 * 4} fill="url(#bch-sun)" />
        <circle cx={width * 0.74} cy={horizonY - 8} r={Math.min(width, height) * 0.07} fill="rgba(255, 240, 200, 0.85)" opacity={sunBright} />
        <circle cx={width * 0.74} cy={horizonY - 8} r={Math.min(width, height) * 0.04} fill="#FFFFFF" opacity={0.92 * sunBright} />

        {/* BACKGROUND CLOUDS */}
        {Array.from({ length: 7 }, (_, i) => {
          const cxC = (i / 6) * width + Math.sin(frame * 0.0005 + i) * 12;
          const cyC = height * (0.18 + (i % 3) * 0.06);
          return (
            <ellipse
              key={`cloud-${i}`}
              cx={cxC}
              cy={cyC}
              rx={60 + i * 8}
              ry={14 + (i % 3) * 4}
              fill={`rgba(255, 230, 190, ${0.4 + (i % 2) * 0.12})`}
              filter="url(#bch-blur)"
            />
          );
        })}

        {/* MESAS in distance */}
        <path
          d={`M 0 ${horizonY}
              L ${width * 0.10} ${horizonY - 26}
              L ${width * 0.16} ${horizonY - 26}
              L ${width * 0.20} ${horizonY - 14}
              L ${width * 0.30} ${horizonY - 38}
              L ${width * 0.40} ${horizonY - 38}
              L ${width * 0.44} ${horizonY - 18}
              L ${width * 0.58} ${horizonY - 22}
              L ${width * 0.66} ${horizonY - 22}
              L ${width * 0.70} ${horizonY - 8}
              L ${width * 0.84} ${horizonY - 30}
              L ${width * 0.92} ${horizonY - 30}
              L ${width * 0.96} ${horizonY - 14}
              L ${width} ${horizonY}
              L ${width} ${horizonY + 6}
              L 0 ${horizonY + 6} Z`}
          fill={`hsl(${(tintHue + 240) % 360}, 35%, 25%)`}
          opacity={0.9}
        />
        {/* Mesas mid-layer */}
        <path
          d={`M 0 ${horizonY + 4}
              L ${width * 0.16} ${horizonY - 12}
              L ${width * 0.28} ${horizonY - 12}
              L ${width * 0.36} ${horizonY + 4}
              L ${width * 0.52} ${horizonY - 6}
              L ${width * 0.62} ${horizonY - 6}
              L ${width * 0.66} ${horizonY + 4}
              L ${width * 0.80} ${horizonY - 14}
              L ${width * 0.92} ${horizonY - 14}
              L ${width} ${horizonY + 4}
              L ${width} ${horizonY + 8}
              L 0 ${horizonY + 8} Z`}
          fill={`hsl(${(tintHue + 220) % 360}, 30%, 18%)`}
          opacity={0.95}
        />

        {/* GROUND */}
        <rect x={0} y={horizonY + 6} width={width} height={height - horizonY - 6} fill="url(#bch-ground)" />

        {/* SAND TEXTURE LINES */}
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={`sandline-${i}`}
            x1={0}
            y1={horizonY + 12 + i * (height - horizonY - 12) / 12}
            x2={width}
            y2={horizonY + 16 + i * (height - horizonY - 12) / 12}
            stroke={`rgba(60, 36, 16, ${0.18 - i * 0.01})`}
            strokeWidth={0.6}
          />
        ))}

        {/* SAGE silhouettes */}
        {sageNodes}

        {/* TUMBLEWEEDS */}
        {tumbleNodes}

        {/* DUST BACK LAYER */}
        <g opacity={0.6}>{dustNodes.slice(0, 35)}</g>

        {/* === HAT === */}
        {/* Hat ground shadow */}
        <ellipse
          cx={hatCx}
          cy={hatCy + brimH * 0.7}
          rx={brimW * 0.55}
          ry={brimH * 0.24}
          fill="rgba(0, 0, 0, 0.35)"
          filter="url(#bch-blur)"
        />

        {/* Outer brim glow rim (3-layer) */}
        <ellipse
          cx={hatCx}
          cy={hatCy}
          rx={brimW * 0.56}
          ry={brimH * 0.66}
          fill="none"
          stroke={`hsla(${(tintHue + 14) % 360}, 90%, 70%, ${0.30 * rimGlow})`}
          strokeWidth={6}
          filter="url(#bch-blur)"
        />
        <ellipse
          cx={hatCx}
          cy={hatCy}
          rx={brimW * 0.55}
          ry={brimH * 0.62}
          fill="none"
          stroke={`hsla(${(tintHue + 18) % 360}, 95%, 78%, ${0.55 * rimGlow})`}
          strokeWidth={3}
        />

        {/* HAT BRIM (curved upward at edges) */}
        <path
          d={`M ${hatCx - brimW * 0.50} ${hatCy + brimH * 0.10}
              Q ${hatCx - brimW * 0.55} ${hatCy - brimH * 0.20} ${hatCx - brimW * 0.42} ${hatCy - brimH * 0.20}
              Q ${hatCx - brimW * 0.20} ${hatCy + brimH * 0.20} ${hatCx} ${hatCy + brimH * 0.20}
              Q ${hatCx + brimW * 0.20} ${hatCy + brimH * 0.20} ${hatCx + brimW * 0.42} ${hatCy - brimH * 0.20}
              Q ${hatCx + brimW * 0.55} ${hatCy - brimH * 0.20} ${hatCx + brimW * 0.50} ${hatCy + brimH * 0.10}
              Q ${hatCx + brimW * 0.40} ${hatCy + brimH * 0.50} ${hatCx} ${hatCy + brimH * 0.55}
              Q ${hatCx - brimW * 0.40} ${hatCy + brimH * 0.50} ${hatCx - brimW * 0.50} ${hatCy + brimH * 0.10}
              Z`}
          fill="url(#bch-felt)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={3}
        />

        {/* Brim underside shadow */}
        <path
          d={`M ${hatCx - brimW * 0.46} ${hatCy + brimH * 0.18}
              Q ${hatCx} ${hatCy + brimH * 0.35} ${hatCx + brimW * 0.46} ${hatCy + brimH * 0.18}
              L ${hatCx + brimW * 0.40} ${hatCy + brimH * 0.50}
              Q ${hatCx} ${hatCy + brimH * 0.55} ${hatCx - brimW * 0.40} ${hatCy + brimH * 0.50} Z`}
          fill="rgba(0, 0, 0, 0.55)"
        />

        {/* Brim edge stitching */}
        {Array.from({ length: 38 }, (_, i) => {
          const t = i / 37;
          const a = -Math.PI + t * Math.PI;
          const ex = hatCx + Math.cos(a) * brimW * 0.49;
          const ey = hatCy + Math.sin(a) * brimH * 0.55 + brimH * 0.10;
          return (
            <circle
              key={`bs-${i}`}
              cx={ex}
              cy={ey}
              r={0.7}
              fill="rgba(220, 180, 90, 0.85)"
            />
          );
        })}

        {/* Brim curl creases */}
        <path
          d={`M ${hatCx - brimW * 0.42} ${hatCy - brimH * 0.18}
              Q ${hatCx - brimW * 0.30} ${hatCy + brimH * 0.05} ${hatCx - brimW * 0.18} ${hatCy + brimH * 0.05}`}
          stroke="rgba(20, 12, 4, 0.6)"
          strokeWidth={1.2}
          fill="none"
        />
        <path
          d={`M ${hatCx + brimW * 0.42} ${hatCy - brimH * 0.18}
              Q ${hatCx + brimW * 0.30} ${hatCy + brimH * 0.05} ${hatCx + brimW * 0.18} ${hatCy + brimH * 0.05}`}
          stroke="rgba(20, 12, 4, 0.6)"
          strokeWidth={1.2}
          fill="none"
        />

        {/* CROWN — tall pinched top */}
        <path
          d={`M ${hatCx - crownW * 0.5} ${hatCy + brimH * 0.10}
              Q ${hatCx - crownW * 0.48} ${hatCy - crownH * 0.85} ${hatCx - crownW * 0.20} ${hatCy - crownH * 0.95}
              Q ${hatCx - crownW * 0.10} ${hatCy - crownH * 1.05} ${hatCx} ${hatCy - crownH * 0.85}
              Q ${hatCx + crownW * 0.10} ${hatCy - crownH * 1.05} ${hatCx + crownW * 0.20} ${hatCy - crownH * 0.95}
              Q ${hatCx + crownW * 0.48} ${hatCy - crownH * 0.85} ${hatCx + crownW * 0.5} ${hatCy + brimH * 0.10}
              Q ${hatCx} ${hatCy + brimH * 0.05} ${hatCx - crownW * 0.5} ${hatCy + brimH * 0.10} Z`}
          fill="url(#bch-felt)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={3}
        />

        {/* CROWN PINCH (center crease) */}
        <path
          d={`M ${hatCx} ${hatCy - crownH * 0.85}
              Q ${hatCx - 4} ${hatCy - crownH * 0.40} ${hatCx} ${hatCy + brimH * 0.05}`}
          stroke="rgba(0, 0, 0, 0.85)"
          strokeWidth={2.5}
          fill="none"
        />
        <path
          d={`M ${hatCx} ${hatCy - crownH * 0.85}
              Q ${hatCx + 4} ${hatCy - crownH * 0.40} ${hatCx} ${hatCy + brimH * 0.05}`}
          stroke="rgba(120, 80, 30, 0.55)"
          strokeWidth={1.2}
          fill="none"
        />

        {/* Crown side dents */}
        <path
          d={`M ${hatCx - crownW * 0.35} ${hatCy - crownH * 0.55}
              Q ${hatCx - crownW * 0.20} ${hatCy - crownH * 0.45} ${hatCx - crownW * 0.10} ${hatCy - crownH * 0.55}`}
          stroke="rgba(0, 0, 0, 0.55)"
          strokeWidth={1.6}
          fill="none"
        />
        <path
          d={`M ${hatCx + crownW * 0.35} ${hatCy - crownH * 0.55}
              Q ${hatCx + crownW * 0.20} ${hatCy - crownH * 0.45} ${hatCx + crownW * 0.10} ${hatCy - crownH * 0.55}`}
          stroke="rgba(0, 0, 0, 0.55)"
          strokeWidth={1.6}
          fill="none"
        />

        {/* HATBAND */}
        <path
          d={`M ${hatCx - crownW * 0.50} ${hatCy + brimH * 0.05}
              Q ${hatCx} ${hatCy + brimH * 0.00} ${hatCx + crownW * 0.50} ${hatCy + brimH * 0.05}
              L ${hatCx + crownW * 0.50} ${hatCy + brimH * 0.16}
              Q ${hatCx} ${hatCy + brimH * 0.10} ${hatCx - crownW * 0.50} ${hatCy + brimH * 0.16} Z`}
          fill="url(#bch-band)"
          stroke="rgba(0, 0, 0, 0.95)"
          strokeWidth={1.4}
        />
        {/* Hatband decorative stitching */}
        {Array.from({ length: 22 }, (_, i) => {
          const t = i / 21;
          const sx = hatCx - crownW * 0.50 + t * crownW * 1.0;
          const sy = hatCy + brimH * 0.10 - Math.sin(t * Math.PI) * 1;
          return (
            <line
              key={`hbst-${i}`}
              x1={sx}
              y1={sy - 1.5}
              x2={sx}
              y2={sy + 1.5}
              stroke={`hsl(${(i * 24) % 360}, 80%, 65%)`}
              strokeWidth={0.7}
              opacity={0.85}
            />
          );
        })}

        {/* Concho buckle (left of band) */}
        <circle
          cx={hatCx - crownW * 0.30}
          cy={hatCy + brimH * 0.08}
          r={brimH * 0.15 * (1 + onsetEnv * 0.15)}
          fill="url(#bch-concho)"
          stroke="rgba(40, 20, 4, 0.95)"
          strokeWidth={0.8}
        />
        {/* Concho center stamp */}
        <circle
          cx={hatCx - crownW * 0.30}
          cy={hatCy + brimH * 0.08}
          r={brimH * 0.06}
          fill="rgba(220, 160, 40, 0.85)"
          stroke="rgba(40, 20, 4, 0.95)"
          strokeWidth={0.5}
        />
        {/* Concho rays (sun pattern) */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <line
              key={`cr-${i}`}
              x1={hatCx - crownW * 0.30 + Math.cos(a) * brimH * 0.07}
              y1={hatCy + brimH * 0.08 + Math.sin(a) * brimH * 0.07}
              x2={hatCx - crownW * 0.30 + Math.cos(a) * brimH * 0.13}
              y2={hatCy + brimH * 0.08 + Math.sin(a) * brimH * 0.13}
              stroke="rgba(60, 30, 8, 0.85)"
              strokeWidth={0.7}
            />
          );
        })}
        {/* Concho shine */}
        <circle
          cx={hatCx - crownW * 0.30 - 2}
          cy={hatCy + brimH * 0.06}
          r={1.8}
          fill="#FFF8D8"
          opacity={conchoShine}
        />

        {/* Eagle feather tucked into hatband */}
        <g transform={`translate(${hatCx + crownW * 0.30}, ${hatCy + brimH * 0.06}) rotate(-20)`}>
          <path
            d={`M 0 0
                Q -2 -8 -1 -22
                Q 0 -34 2 -42
                Q 4 -34 5 -22
                Q 5 -8 3 0 Z`}
            fill="rgba(245, 240, 220, 0.92)"
            stroke="rgba(40, 24, 8, 0.9)"
            strokeWidth={0.7}
          />
          <line x1="2" y1="-2" x2="2.5" y2="-40" stroke="rgba(40, 24, 8, 0.85)" strokeWidth={0.5} />
          {/* Feather barbs */}
          {Array.from({ length: 8 }, (_, i) => {
            const fy = -6 - i * 4;
            return (
              <g key={`barb-${i}`}>
                <line x1="2" y1={fy} x2={-2} y2={fy + 1} stroke="rgba(120, 80, 30, 0.75)" strokeWidth={0.4} />
                <line x1="2" y1={fy} x2={6} y2={fy + 1} stroke="rgba(120, 80, 30, 0.75)" strokeWidth={0.4} />
              </g>
            );
          })}
          {/* Black tip */}
          <ellipse cx="2" cy="-40" rx="2.5" ry="3" fill="rgba(20, 12, 4, 0.95)" />
          {/* Red string tying it on */}
          <line x1="0" y1="0" x2="-2" y2="2" stroke="rgba(180, 40, 30, 0.9)" strokeWidth={0.8} />
        </g>

        {/* Crown felt creases (weathered) */}
        {Array.from({ length: 14 }, (_, i) => {
          const t = i / 13;
          const yC = hatCy - crownH * 0.70 + t * crownH * 0.55;
          const xLen = crownW * (0.30 + Math.sin(t * 5) * 0.08);
          return (
            <line
              key={`crease-${i}`}
              x1={hatCx - xLen}
              y1={yC + Math.sin(i * 0.7) * 1.2}
              x2={hatCx + xLen}
              y2={yC + Math.cos(i * 0.5) * 1.2}
              stroke="rgba(20, 12, 4, 0.30)"
              strokeWidth={0.6}
            />
          );
        })}

        {/* Top crown highlight */}
        <ellipse
          cx={hatCx}
          cy={hatCy - crownH * 0.80}
          rx={crownW * 0.18}
          ry={crownH * 0.06}
          fill="rgba(180, 130, 70, 0.45)"
        />

        {/* Hatband bottom shadow */}
        <line
          x1={hatCx - crownW * 0.50}
          y1={hatCy + brimH * 0.18}
          x2={hatCx + crownW * 0.50}
          y2={hatCy + brimH * 0.18}
          stroke="rgba(0, 0, 0, 0.65)"
          strokeWidth={1.2}
        />

        {/* === END HAT === */}

        {/* DUST FRONT LAYER */}
        <g opacity={0.85}>{dustNodes.slice(35)}</g>

        {/* Sun glint above hat */}
        <ellipse
          cx={hatCx + crownW * 0.20}
          cy={hatCy - crownH * 0.85}
          rx={2}
          ry={5}
          fill="rgba(255, 240, 200, 0.7)"
          opacity={beatDecay * 0.7 + 0.2}
        />

        {/* WARM ATMOSPHERIC TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue + 10}, 80%, 55%, ${0.05 + slowEnergy * 0.06})`} />

        {/* VIGNETTE */}
        <radialGradient id="bch-vign" cx="50%" cy="50%" r="70%">
          <stop offset="50%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#bch-vign)" />
      </svg>
    </div>
  );
};
