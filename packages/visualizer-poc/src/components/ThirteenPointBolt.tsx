/**
 * ThirteenPointBolt — A+++ quality 13-point lightning bolt overlay.
 *
 * The iconic Grateful Dead lightning bolt that splits the Steal Your Face skull.
 * Multi-layered SVG rendering with organic jagged edges, branching mini-bolts,
 * electric arc sparks, ground-strike impact glow, ionization corona at bend points,
 * and deep audio reactivity driven by energy, bass, onset, chroma, and beat decay.
 *
 * Accent-eligible (high energy band, gated at energy > 0.15).
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color Utilities                                                     */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue + saturation + lightness to an RGB hex string */
function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Seeded pseudo-random for deterministic spark/branch positions per frame */
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/*  Bolt Geometry — organic, jagged 13-point zigzag                    */
/* ------------------------------------------------------------------ */

/** Base 13-point bolt vertices (x, y) in a 200x300 viewBox */
const BASE_BOLT_OUTER: [number, number][] = [
  [100, 0],
  [82, 58],
  [113, 62],
  [72, 122],
  [108, 128],
  [62, 198],
  [102, 202],
  [52, 285],
  [133, 178],
  [92, 172],
  [128, 112],
  [87, 106],
  [122, 42],
];

const BASE_BOLT_INNER: [number, number][] = [
  [100, 18],
  [86, 58],
  [110, 62],
  [78, 118],
  [105, 123],
  [70, 188],
  [100, 192],
  [63, 268],
  [124, 180],
  [96, 175],
  [122, 116],
  [92, 112],
  [116, 48],
];

const BASE_BOLT_CORE: [number, number][] = [
  [100, 35],
  [90, 60],
  [107, 63],
  [83, 115],
  [103, 120],
  [77, 180],
  [99, 183],
  [74, 252],
  [116, 182],
  [98, 178],
  [117, 118],
  [95, 114],
  [112, 52],
];

/** Add organic jitter to bolt points — deterministic per frame */
function jitterPoints(
  points: [number, number][],
  frame: number,
  amount: number,
  seed: number,
): string {
  return points
    .map(([x, y], i) => {
      // Don't jitter the tip or the strike point
      if (i === 0 || i === 7) return `${x},${y}`;
      const jx = (seededRand(frame * 0.1 + i * 13.7 + seed) - 0.5) * amount;
      const jy = (seededRand(frame * 0.1 + i * 7.3 + seed + 99) - 0.5) * amount * 0.5;
      return `${x + jx},${y + jy}`;
    })
    .join(" ");
}

/* ------------------------------------------------------------------ */
/*  Branching Mini-Bolts                                               */
/* ------------------------------------------------------------------ */

interface Branch {
  /** Index into the main bolt where branch forks off */
  sourceIdx: number;
  /** Path d-string for the branch */
  path: string;
}

function generateBranches(frame: number, jitterAmt: number): Branch[] {
  // 3 branch points along the main bolt
  const branchSpecs: { idx: number; dx: number; dy: number; len: number; dir: 1 | -1 }[] = [
    { idx: 2, dx: 30, dy: 25, len: 35, dir: 1 },
    { idx: 5, dx: -35, dy: 20, len: 40, dir: -1 },
    { idx: 9, dx: 28, dy: 18, len: 30, dir: 1 },
  ];

  return branchSpecs.map((spec) => {
    const [sx, sy] = BASE_BOLT_OUTER[spec.idx];
    const j1 = (seededRand(frame * 0.15 + spec.idx * 17) - 0.5) * jitterAmt * 0.6;
    const j2 = (seededRand(frame * 0.15 + spec.idx * 23 + 50) - 0.5) * jitterAmt * 0.6;
    const mx = sx + spec.dx * 0.5 + j1;
    const my = sy + spec.dy * 0.5 + j2;
    const ex = sx + spec.dx + j1 * 1.3;
    const ey = sy + spec.dy + j2 * 0.8;
    // Sub-fork
    const fx = mx + spec.dir * spec.len * 0.4 + j2;
    const fy = my + spec.len * 0.3 + j1 * 0.5;

    return {
      sourceIdx: spec.idx,
      path: `M${sx},${sy} L${mx},${my} L${ex},${ey} M${mx},${my} L${fx},${fy}`,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Spark Particles                                                    */
/* ------------------------------------------------------------------ */

interface Spark {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

function generateSparks(
  frame: number,
  beatDecay: number,
  energy: number,
  count: number,
): Spark[] {
  const sparks: Spark[] = [];
  // Bolt tip is at (52, 285) in viewBox
  const tipX = 52;
  const tipY = 285;

  for (let i = 0; i < count; i++) {
    const life = ((frame * 0.8 + i * 37) % 60) / 60; // 0..1 cycle over 2s
    const angle = seededRand(i * 73 + Math.floor(frame / 3) * 11) * Math.PI * 2;
    const dist = life * 60 * (0.5 + energy * 0.8);
    const sparkX = tipX + Math.cos(angle) * dist + (seededRand(i + frame * 0.05) - 0.5) * 20;
    const sparkY = tipY - life * 30 + Math.sin(angle) * dist * 0.3;
    const decay = 1 - life;
    sparks.push({
      cx: sparkX,
      cy: sparkY,
      r: (1 + beatDecay * 3) * decay * (0.5 + seededRand(i * 19) * 0.8),
      opacity: decay * decay * (0.4 + beatDecay * 0.6) * Math.min(energy * 4, 1),
    });
  }
  return sparks;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const ThirteenPointBolt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const bass = snap.bass;
  const onset = snap.onsetEnvelope;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue / 360; // normalize to 0-1

  /* --- Energy gate: only visible above threshold --- */
  const gateOpacity = interpolate(energy, [0.12, 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (gateOpacity <= 0) return null;

  /* --- Derived values --- */

  // Onset drives white-hot flash intensity (0..1)
  const flashIntensity = interpolate(onset, [0.1, 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bass drives bolt thickness and glow radius
  const boltThickness = interpolate(bass, [0.05, 0.5], [1.0, 2.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowRadius = interpolate(bass, [0.05, 0.5], [6, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Beat decay pulses spark particles
  const sparkCount = Math.floor(interpolate(energy, [0.15, 0.5], [6, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));

  // Size: dramatic centerpiece — ~55% viewport height
  const baseSize = Math.min(width, height) * 0.42;
  const breathe = interpolate(energy, [0.1, 0.5], [0.92, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Very slow rotation: drift, not spin (~1.5 deg/s scaled by tempo)
  const rotation = (frame / 30) * 1.5 * tempoFactor;

  // Opacity: layered from energy + beat + onset
  const baseOpacity = interpolate(energy, [0.15, 0.5], [0.35, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(baseOpacity + beatDecay * 0.15 + flashIntensity * 0.2, 0.92) * gateOpacity;

  /* --- Colors --- */
  const boltColor = hslToHex(chromaHue, 0.88, 0.55);
  const boltColorBright = hslToHex(chromaHue, 0.95, 0.7);
  const glowColor = hslToHex(chromaHue + 0.08, 0.9, 0.5);
  const glowColorWarm = hslToHex(chromaHue - 0.05, 0.85, 0.45);
  const coreColor = hslToHex(chromaHue, 0.3, 0.92 + flashIntensity * 0.08);
  const coronaColor = hslToHex(chromaHue + 0.12, 0.6, 0.75);
  const sparkColor = hslToHex(chromaHue + 0.05, 0.95, 0.8);
  const impactColor = hslToHex(chromaHue - 0.1, 0.7, 0.6);

  /* --- Organic jitter amount: subtle normally, stronger on transients --- */
  const jitterAmt = 3 + onset * 8;

  /* --- Geometry: memoize bolt paths per frame --- */
  const outerPath = useMemo(
    () => jitterPoints(BASE_BOLT_OUTER, frame, jitterAmt, 0),
    [frame, jitterAmt],
  );
  const innerPath = useMemo(
    () => jitterPoints(BASE_BOLT_INNER, frame, jitterAmt * 0.6, 42),
    [frame, jitterAmt],
  );
  const corePath = useMemo(
    () => jitterPoints(BASE_BOLT_CORE, frame, jitterAmt * 0.3, 84),
    [frame, jitterAmt],
  );
  const branches = useMemo(() => generateBranches(frame, jitterAmt), [frame, jitterAmt]);
  const sparks = useMemo(
    () => generateSparks(frame, beatDecay, energy, sparkCount),
    [frame, beatDecay, energy, sparkCount],
  );

  /* --- Corona glow points at each bend --- */
  const coronaPoints = BASE_BOLT_OUTER.slice(1, -1); // skip tip and strike

  /* --- Unique filter IDs (prevent SVG ID collisions with multiple overlays) --- */
  const uid = "bolt13";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${breathe * boltThickness * 0.75})`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={baseSize}
          height={baseSize * 1.5}
          viewBox="0 0 200 310"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* --- Gradients --- */}
            <linearGradient id={`${uid}-grad-main`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={boltColorBright} />
              <stop offset="35%" stopColor={boltColor} />
              <stop offset="70%" stopColor={glowColorWarm} />
              <stop offset="100%" stopColor={glowColor} />
            </linearGradient>

            <linearGradient id={`${uid}-grad-core`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor={coreColor} />
              <stop offset="100%" stopColor="#ffffffcc" />
            </linearGradient>

            <radialGradient id={`${uid}-impact`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={impactColor} stopOpacity={0.9 * flashIntensity + 0.3} />
              <stop offset="40%" stopColor={glowColor} stopOpacity={0.4 * energy} />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </radialGradient>

            <radialGradient id={`${uid}-corona`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={coronaColor} stopOpacity="0.7" />
              <stop offset="100%" stopColor={coronaColor} stopOpacity="0" />
            </radialGradient>

            {/* --- SVG Filters --- */}

            {/* Wide outer glow */}
            <filter id={`${uid}-glow-outer`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius * 0.8} result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0"
              />
            </filter>

            {/* Medium glow for inner layers */}
            <filter id={`${uid}-glow-mid`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius * 0.35} result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.8 0"
              />
            </filter>

            {/* White-hot core filter: desaturate + brighten */}
            <filter id={`${uid}-core-hot`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={2 + flashIntensity * 3} result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values={`1 0 0 0 ${flashIntensity * 0.3}  0 1 0 0 ${flashIntensity * 0.3}  0 0 1 0 ${flashIntensity * 0.3}  0 0 0 1 0`}
              />
            </filter>

            {/* Spark glow */}
            <filter id={`${uid}-spark-glow`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
            </filter>

            {/* Impact glow */}
            <filter id={`${uid}-impact-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={8 + bass * 15} />
            </filter>

            {/* Branch glow */}
            <filter id={`${uid}-branch-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={3 + onset * 4} />
            </filter>
          </defs>

          {/* ============================================================ */}
          {/* LAYER 0: Ground strike impact glow                           */}
          {/* ============================================================ */}
          <ellipse
            cx="52"
            cy="290"
            rx={30 + bass * 25}
            ry={10 + bass * 8}
            fill={`url(#${uid}-impact)`}
            filter={`url(#${uid}-impact-glow)`}
            opacity={0.3 + energy * 0.5 + flashIntensity * 0.3}
          />

          {/* ============================================================ */}
          {/* LAYER 1: Outer glow bolt (wide, soft, atmospheric)           */}
          {/* ============================================================ */}
          <polygon
            points={outerPath}
            fill={glowColor}
            opacity={0.35 + onset * 0.2}
            filter={`url(#${uid}-glow-outer)`}
          />

          {/* ============================================================ */}
          {/* LAYER 2: Branching mini-bolts                                */}
          {/* ============================================================ */}
          {branches.map((branch, i) => (
            <g key={`branch-${i}`}>
              {/* Branch glow layer */}
              <path
                d={branch.path}
                stroke={glowColor}
                strokeWidth={2 + bass * 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.25 + onset * 0.3}
                filter={`url(#${uid}-branch-glow)`}
              />
              {/* Branch body */}
              <path
                d={branch.path}
                stroke={boltColor}
                strokeWidth={1 + bass}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.5 + onset * 0.3}
              />
              {/* Branch core */}
              <path
                d={branch.path}
                stroke={coreColor}
                strokeWidth={0.5 + flashIntensity}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={0.3 + flashIntensity * 0.5}
              />
            </g>
          ))}

          {/* ============================================================ */}
          {/* LAYER 3: Main bolt body (gradient fill)                      */}
          {/* ============================================================ */}
          <polygon
            points={outerPath}
            fill={`url(#${uid}-grad-main)`}
            stroke={boltColorBright}
            strokeWidth={1.2}
            strokeLinejoin="round"
            opacity={0.85 + onset * 0.15}
          />

          {/* ============================================================ */}
          {/* LAYER 4: Inner bolt body (brighter, narrower)                */}
          {/* ============================================================ */}
          <polygon
            points={innerPath}
            fill={boltColorBright}
            opacity={0.45 + flashIntensity * 0.25}
            filter={`url(#${uid}-glow-mid)`}
          />

          {/* ============================================================ */}
          {/* LAYER 5: Edge highlight strokes                              */}
          {/* ============================================================ */}
          <polygon
            points={outerPath}
            fill="none"
            stroke={coronaColor}
            strokeWidth={0.8 + onset * 0.8}
            strokeLinejoin="round"
            opacity={0.3 + beatDecay * 0.3}
          />

          {/* ============================================================ */}
          {/* LAYER 6: White-hot core (flash-driven)                       */}
          {/* ============================================================ */}
          <polygon
            points={corePath}
            fill={`url(#${uid}-grad-core)`}
            opacity={0.25 + flashIntensity * 0.65}
            filter={`url(#${uid}-core-hot)`}
          />

          {/* ============================================================ */}
          {/* LAYER 7: Ionization corona at bend points                    */}
          {/* ============================================================ */}
          {coronaPoints.map(([cx, cy], i) => {
            const coronaSize = 8 + energy * 10 + beatDecay * 6;
            const coronaOp =
              0.15 +
              energy * 0.2 +
              (seededRand(frame * 0.2 + i * 31) > 0.5 ? beatDecay * 0.3 : 0);
            return (
              <circle
                key={`corona-${i}`}
                cx={cx}
                cy={cy}
                r={coronaSize}
                fill={`url(#${uid}-corona)`}
                opacity={coronaOp}
              />
            );
          })}

          {/* ============================================================ */}
          {/* LAYER 8: Electric arc sparks from bolt tip                   */}
          {/* ============================================================ */}
          <g filter={`url(#${uid}-spark-glow)`}>
            {sparks.map((spark, i) => (
              <circle
                key={`spark-${i}`}
                cx={spark.cx}
                cy={spark.cy}
                r={spark.r}
                fill={sparkColor}
                opacity={spark.opacity}
              />
            ))}
          </g>

          {/* Spark core (brighter, smaller) */}
          {sparks
            .filter((_, i) => i % 3 === 0)
            .map((spark, i) => (
              <circle
                key={`sparkcore-${i}`}
                cx={spark.cx}
                cy={spark.cy}
                r={spark.r * 0.4}
                fill="#ffffff"
                opacity={spark.opacity * 0.8}
              />
            ))}

          {/* ============================================================ */}
          {/* LAYER 9: Top-tip ionization flash                            */}
          {/* ============================================================ */}
          <circle
            cx="100"
            cy="5"
            r={5 + onset * 12}
            fill={coronaColor}
            opacity={0.15 + onset * 0.4}
            filter={`url(#${uid}-glow-mid)`}
          />
        </svg>
      </div>
    </div>
  );
};
