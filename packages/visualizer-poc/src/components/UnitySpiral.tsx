/**
 * UnitySpiral — A+++ golden ratio sacred geometry scene.
 *
 * A massive Fibonacci spiral fills ~70% of the frame, drawn from nested
 * golden rectangles. Sacred geometry: Vesica Piscis, Metatron's cube hints,
 * Flower of Life ring, dotted Fibonacci numbers along the spiral arc, and
 * traveling luminous orbs. Background: deep cosmic field of stars and
 * nebulae suggesting the cosmic unity that the spiral embodies.
 *
 * Audio reactivity:
 *   slowEnergy   → spiral glow
 *   energy       → orb count + brightness
 *   bass         → galaxy churn
 *   beatDecay    → spiral arm pulse
 *   onsetEnvelope→ Vesica Piscis flash
 *   chromaHue    → spiral palette tint
 *   tempoFactor  → orb travel speed + spiral rotation
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

const PHI = 1.61803398875;

interface BgStar {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

interface Nebula {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hue: number;
  phase: number;
}

interface OrbSpec {
  baseT: number;
  speed: number;
  size: number;
  hue: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const UnitySpiral: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const bgStars = React.useMemo<BgStar[]>(() => {
    const rng = seeded(72_445_119);
    return Array.from({ length: 110 }, () => ({
      x: rng(),
      y: rng(),
      size: 0.6 + rng() * 2.4,
      phase: rng() * Math.PI * 2,
      speed: 0.005 + rng() * 0.012,
    }));
  }, []);

  const nebulae = React.useMemo<Nebula[]>(() => {
    const rng = seeded(33_887_445);
    return Array.from({ length: 6 }, () => ({
      cx: rng(),
      cy: rng(),
      rx: 0.18 + rng() * 0.16,
      ry: 0.12 + rng() * 0.10,
      hue: rng() * 360,
      phase: rng() * Math.PI * 2,
    }));
  }, []);

  const orbs = React.useMemo<OrbSpec[]>(() => {
    const rng = seeded(45_119_887);
    return Array.from({ length: 18 }, (_, i) => ({
      baseT: i / 18,
      speed: 0.001 + rng() * 0.002,
      size: 2 + rng() * 4,
      hue: rng() * 360,
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

  const spiralGlow = 0.55 + slowEnergy * 0.4 + beatDecay * 0.25;
  const orbBright = 0.5 + energy * 0.5;

  const baseHue = 44;
  const tintHue = ((baseHue + (chromaHue - 180) * 0.32) % 360 + 360) % 360;
  const tintColor = `hsl(${tintHue}, 80%, 65%)`;
  const tintCore = `hsl(${tintHue}, 95%, 88%)`;
  const tintEdge = `hsl(${tintHue}, 65%, 50%)`;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const baseScale = Math.min(width, height) * 0.36;
  const spiralRot = (frame * 0.08 * tempoFactor) % 360;

  /* === Background Star Nodes === */
  const starNodes = bgStars.map((s, i) => {
    const flicker = 0.5 + Math.sin(frame * s.speed + s.phase) * 0.5;
    return (
      <circle
        key={`bs-${i}`}
        cx={s.x * width}
        cy={s.y * height}
        r={s.size}
        fill={`hsl(${(tintHue + i * 4) % 360}, 90%, 80%)`}
        opacity={flicker * 0.8}
      />
    );
  });

  /* === Nebula Nodes === */
  const nebulaNodes = nebulae.map((n, i) => {
    const churn = 1 + bass * 0.2 + Math.sin(frame * 0.005 + n.phase) * 0.05;
    return (
      <ellipse
        key={`neb-${i}`}
        cx={n.cx * width}
        cy={n.cy * height}
        rx={n.rx * width * churn}
        ry={n.ry * height * churn}
        fill={`hsla(${(n.hue + tintHue) % 360}, 80%, 60%, 0.18)`}
      />
    );
  });

  /* === Golden Ratio Spiral Path ===
     Build a logarithmic spiral approximating the Fibonacci spiral.
     r = a * phi^(theta / (pi/2))  — golden spiral
     We trace it in segments. */
  function buildSpiralPath(): string {
    const turns = 4.5;
    const segs = 240;
    const a = baseScale * 0.06;
    let p = "";
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * turns * Math.PI * 2;
      const r = a * Math.pow(PHI, t / (Math.PI / 2)) * 0.18;
      const x = cx + Math.cos(t) * r;
      const y = cy + Math.sin(t) * r;
      p += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    return p;
  }
  const spiralPath = buildSpiralPath();

  /* === Nested Golden Rectangles === */
  function buildGoldenRects(): React.ReactNode[] {
    const rects: React.ReactNode[] = [];
    let w = baseScale * 1.4;
    let h = w / PHI;
    let rx = cx - w / 2;
    let ry = cy - h / 2;
    let rotation = 0;
    for (let i = 0; i < 9; i++) {
      rects.push(
        <rect
          key={`gr-${i}`}
          x={rx}
          y={ry}
          width={w}
          height={h}
          fill="none"
          stroke={tintColor}
          strokeWidth={1.2}
          opacity={0.45 - i * 0.04}
          transform={`rotate(${rotation}, ${cx}, ${cy})`}
        />,
      );
      // Recurse: take the square portion off, then the new rect is the smaller portion
      const newW = h;
      const newH = w - h;
      // Position the new rectangle inside the previous one
      rx = rx + (w - newW);
      w = newW;
      h = newH;
      rotation += 90;
    }
    return rects;
  }

  /* === Flower of Life === */
  function buildFlowerOfLife(): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const r = baseScale * 0.35;
    const positions = [
      [0, 0],
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }),
      ...Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return [Math.cos(a) * r * 1.732, Math.sin(a) * r * 1.732];
      }),
    ];
    positions.forEach(([dx, dy], i) => {
      out.push(
        <circle
          key={`fol-${i}`}
          cx={cx + dx}
          cy={cy + dy}
          r={r}
          fill="none"
          stroke={tintColor}
          strokeWidth={0.7}
          opacity={0.22}
        />,
      );
    });
    return out;
  }

  /* === Vesica Piscis === */
  const vesicaR = baseScale * 0.5;
  const vesicaFlash = 0.4 + onsetEnv * 0.6;

  /* === Metatron's Cube hints (lines connecting flower centers) === */
  function buildMetatron(): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const r = baseScale * 0.35;
    const points: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        out.push(
          <line
            key={`met-${i}-${j}`}
            x1={points[i][0]}
            y1={points[i][1]}
            x2={points[j][0]}
            y2={points[j][1]}
            stroke={tintEdge}
            strokeWidth={0.5}
            opacity={0.25}
          />,
        );
      }
    }
    return out;
  }

  /* === Travelling orbs along the spiral === */
  const orbNodes = orbs.map((o, i) => {
    const t = ((o.baseT + frame * o.speed * tempoFactor) % 1) * 4.5 * Math.PI * 2;
    const a = baseScale * 0.06;
    const r = a * Math.pow(PHI, t / (Math.PI / 2)) * 0.18;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    return (
      <g key={`orb-${i}`}>
        <circle cx={x} cy={y} r={o.size * 3} fill={`hsl(${(o.hue + tintHue) % 360}, 90%, 70%)`} opacity={0.18 * orbBright} />
        <circle cx={x} cy={y} r={o.size * 1.6} fill={`hsl(${(o.hue + tintHue) % 360}, 90%, 78%)`} opacity={0.45 * orbBright} />
        <circle cx={x} cy={y} r={o.size} fill={tintCore} opacity={0.92 * orbBright} />
      </g>
    );
  });

  /* === Fibonacci numbers along arc === */
  const fibNumbers = [1, 1, 2, 3, 5, 8, 13, 21, 34];
  const fibLabels = fibNumbers.map((n, i) => {
    const t = (i / 8) * 4 * Math.PI;
    const a = baseScale * 0.06;
    const r = a * Math.pow(PHI, t / (Math.PI / 2)) * 0.18;
    const x = cx + Math.cos(t) * r * 1.15;
    const y = cy + Math.sin(t) * r * 1.15;
    return (
      <text
        key={`fib-${i}`}
        x={x}
        y={y}
        fontSize="14"
        fontFamily="Georgia, serif"
        fontWeight="700"
        textAnchor="middle"
        fill={tintCore}
        opacity={0.85}
      >
        {n}
      </text>
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <radialGradient id="usp-bg" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor={`hsl(${(tintHue + 240) % 360}, 60%, 12%)`} />
            <stop offset="60%" stopColor={`hsl(${(tintHue + 230) % 360}, 65%, 6%)`} />
            <stop offset="100%" stopColor="rgba(0, 0, 4, 1)" />
          </radialGradient>
          <radialGradient id="usp-glow">
            <stop offset="0%" stopColor={tintCore} stopOpacity={0.85 * spiralGlow} />
            <stop offset="50%" stopColor={tintColor} stopOpacity={0.40 * spiralGlow} />
            <stop offset="100%" stopColor={tintEdge} stopOpacity={0} />
          </radialGradient>
          <filter id="usp-blur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* COSMIC BACKGROUND */}
        <rect width={width} height={height} fill="url(#usp-bg)" />

        {/* NEBULAE */}
        <g filter="url(#usp-blur)">{nebulaNodes}</g>

        {/* BACKGROUND STARS */}
        {starNodes}

        {/* CENTRAL HALO BEHIND SPIRAL */}
        <circle
          cx={cx}
          cy={cy}
          r={baseScale * 1.3}
          fill="url(#usp-glow)"
          style={{ mixBlendMode: "screen" }}
        />

        {/* === FLOWER OF LIFE === */}
        <g transform={`rotate(${spiralRot * 0.2}, ${cx}, ${cy})`}>
          {buildFlowerOfLife()}
        </g>

        {/* === METATRON LINES === */}
        <g transform={`rotate(${spiralRot * 0.1}, ${cx}, ${cy})`}>
          {buildMetatron()}
        </g>

        {/* === VESICA PISCIS === */}
        <g opacity={0.5 + vesicaFlash * 0.4}>
          <circle
            cx={cx - vesicaR * 0.5}
            cy={cy}
            r={vesicaR}
            fill="none"
            stroke={tintCore}
            strokeWidth={1.8}
            opacity={0.55 + vesicaFlash * 0.4}
          />
          <circle
            cx={cx + vesicaR * 0.5}
            cy={cy}
            r={vesicaR}
            fill="none"
            stroke={tintCore}
            strokeWidth={1.8}
            opacity={0.55 + vesicaFlash * 0.4}
          />
        </g>

        {/* === GOLDEN RECTANGLES (rotating) === */}
        <g transform={`rotate(${spiralRot}, ${cx}, ${cy})`}>
          {buildGoldenRects()}
        </g>

        {/* === GOLDEN SPIRAL (3-LAYER) === */}
        <g transform={`rotate(${spiralRot}, ${cx}, ${cy})`}>
          <path
            d={spiralPath}
            stroke={tintEdge}
            strokeWidth={9}
            fill="none"
            opacity={0.20 * spiralGlow}
            filter="url(#usp-blur)"
          />
          <path
            d={spiralPath}
            stroke={tintColor}
            strokeWidth={4}
            fill="none"
            opacity={0.55 * spiralGlow}
          />
          <path
            d={spiralPath}
            stroke={tintCore}
            strokeWidth={1.6}
            fill="none"
            opacity={0.92 * spiralGlow}
          />
        </g>

        {/* === FIBONACCI NUMBERS === */}
        <g transform={`rotate(${spiralRot}, ${cx}, ${cy})`}>
          {fibLabels}
        </g>

        {/* === TRAVELING ORBS === */}
        <g style={{ mixBlendMode: "screen" }}>
          {orbNodes}
        </g>

        {/* === CENTRAL BRIGHT POINT === */}
        <circle cx={cx} cy={cy} r={6 + beatDecay * 8} fill={tintCore} opacity={0.95 * spiralGlow} />
        <circle cx={cx} cy={cy} r={18 + beatDecay * 14} fill="url(#usp-glow)" style={{ mixBlendMode: "screen" }} />

        {/* TINT WASH */}
        <rect width={width} height={height} fill={`hsla(${tintHue}, 70%, 60%, ${0.04 + slowEnergy * 0.04})`} />

        {/* VIGNETTE */}
        <radialGradient id="usp-vign" cx="50%" cy="50%" r="65%">
          <stop offset="40%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.65)" />
        </radialGradient>
        <rect width={width} height={height} fill="url(#usp-vign)" />
      </svg>
    </div>
  );
};
