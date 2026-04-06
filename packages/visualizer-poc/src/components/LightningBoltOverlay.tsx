/**
 * LightningBoltOverlay — A+++ accent lightning bolt, teleports on transients.
 *
 * Quick dramatic flash bolt that appears on onset peaks. NOT the huge centerpiece
 * (that's ThirteenPointBolt). This one teleports around the screen, is smaller,
 * and spawns multiples during intense moments.
 *
 * 3-layer rendering per bolt:
 *   - Outer glow (wide feGaussianBlur, palette-tinted)
 *   - Main body (gradient fill, bright top to mid bottom)
 *   - Inner white-hot core (narrow, near-white)
 *
 * Organic jagged edges, branching fork sparks, white flash impact,
 * intensity-scaled size, hash-based positioning, multi-bolt spawning.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useSongPalette } from "../data/SongPaletteContext";

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

/** Seeded pseudo-random — deterministic per seed value */
function srand(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** HSL (degrees, 0-100%, 0-100%) to CSS hsl() string */
function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/* ------------------------------------------------------------------ */
/*  13-Point Bolt Geometry                                             */
/* ------------------------------------------------------------------ */

/** Base 13-point bolt vertices (x, y) in a 60x100 viewBox */
const BASE_BOLT: [number, number][] = [
  [30, 0],   // 0: top tip
  [24, 22],  // 1
  [34, 23],  // 2
  [19, 46],  // 3
  [32, 47],  // 4
  [14, 72],  // 5
  [29, 73],  // 6
  [5, 100],  // 7: strike point
  [38, 62],  // 8
  [25, 61],  // 9
  [40, 40],  // 10
  [26, 39],  // 11
  [42, 14],  // 12
];

/** Narrower inner bolt for body gradient */
const INNER_BOLT: [number, number][] = [
  [30, 6],
  [25, 24],
  [33, 25],
  [21, 46],
  [31, 47],
  [17, 70],
  [28, 71],
  [11, 94],
  [36, 63],
  [26, 62],
  [38, 41],
  [27, 40],
  [39, 18],
];

/** Narrowest core bolt for white-hot center */
const CORE_BOLT: [number, number][] = [
  [30, 12],
  [26, 25],
  [32, 26],
  [23, 46],
  [30, 47],
  [20, 68],
  [27, 69],
  [17, 88],
  [34, 64],
  [27, 63],
  [36, 42],
  [28, 41],
  [37, 21],
];

/** Apply deterministic jitter to bolt points for organic jagged edges */
function jitterPoints(
  points: [number, number][],
  frame: number,
  amount: number,
  seedOffset: number,
): string {
  return points
    .map(([x, y], i) => {
      // Don't jitter the tip (0) or strike point (7)
      if (i === 0 || i === 7) return `${x},${y}`;
      const jx = (srand(frame * 0.13 + i * 17.3 + seedOffset) - 0.5) * amount;
      const jy =
        (srand(frame * 0.13 + i * 11.7 + seedOffset + 77) - 0.5) *
        amount *
        0.4;
      return `${(x + jx).toFixed(1)},${(y + jy).toFixed(1)}`;
    })
    .join(" ");
}

/* ------------------------------------------------------------------ */
/*  Branching Fork Sparks                                              */
/* ------------------------------------------------------------------ */

interface ForkBranch {
  path: string;
}

/** Generate 2-3 small fork bolts from random points along the main bolt */
function generateForks(
  frame: number,
  jitterAmt: number,
  count: number,
  seedOffset: number,
): ForkBranch[] {
  const forkSpecs: { idx: number; dx: number; dy: number; dir: 1 | -1 }[] = [
    { idx: 2, dx: 14, dy: 10, dir: 1 },
    { idx: 5, dx: -16, dy: 8, dir: -1 },
    { idx: 9, dx: 12, dy: 7, dir: 1 },
  ];

  return forkSpecs.slice(0, count).map((spec) => {
    const [sx, sy] = BASE_BOLT[spec.idx];
    const j1 =
      (srand(frame * 0.17 + spec.idx * 19 + seedOffset) - 0.5) *
      jitterAmt *
      0.5;
    const j2 =
      (srand(frame * 0.17 + spec.idx * 29 + seedOffset + 40) - 0.5) *
      jitterAmt *
      0.5;
    const mx = sx + spec.dx * 0.5 + j1;
    const my = sy + spec.dy * 0.5 + j2;
    const ex = sx + spec.dx + j1 * 1.2;
    const ey = sy + spec.dy + j2 * 0.7;
    // Sub-fork
    const fx = mx + spec.dir * 6 + j2 * 0.5;
    const fy = my + 5 + j1 * 0.3;

    return {
      path: `M${sx},${sy} L${mx.toFixed(1)},${my.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)} M${mx.toFixed(1)},${my.toFixed(1)} L${fx.toFixed(1)},${fy.toFixed(1)}`,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Single Bolt Instance                                               */
/* ------------------------------------------------------------------ */

interface BoltInstance {
  /** Position as percentage of screen (0-100) */
  posX: number;
  posY: number;
  /** Scale multiplier */
  scale: number;
  /** Rotation in degrees */
  rotation: number;
  /** Opacity multiplier */
  opacityMult: number;
  /** Unique seed for jitter */
  seed: number;
}

interface SingleBoltProps {
  instance: BoltInstance;
  frame: number;
  width: number;
  height: number;
  onsetEnvelope: number;
  energy: number;
  bass: number;
  chromaHue: number;
  beatDecay: number;
  paletteHue: number;
  flashIntensity: number;
  uid: string;
}

const SingleBolt: React.FC<SingleBoltProps> = ({
  instance,
  frame,
  width,
  height,
  onsetEnvelope,
  energy,
  bass,
  chromaHue,
  beatDecay,
  paletteHue,
  flashIntensity,
  uid,
}) => {
  /* --- Size: accent bolt, ~12-18% of viewport, scaled by onset intensity --- */
  const baseSize = Math.min(width, height) * 0.14;
  const intensityScale = interpolate(
    onsetEnvelope,
    [0.25, 0.55, 0.85, 1],
    [0.8, 1.2, 1.6, 2.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const boltSize = baseSize * intensityScale * instance.scale;

  /* --- Colors: blend chromaHue with palette hue --- */
  const blendHue = (chromaHue * 0.6 + paletteHue * 0.4) % 360;
  const bodyTopColor = hsl(blendHue, 85, 72);
  const bodyMidColor = hsl(blendHue, 75, 55);
  const bodyBottomColor = hsl((blendHue + 20) % 360, 70, 45);
  const glowColor = hsl((blendHue + 15) % 360, 80, 50);
  const coreTopColor = hsl(blendHue, 15, 96);
  const coreMidColor = hsl(blendHue, 25, 90);
  const forkColor = hsl(blendHue, 80, 65);
  const forkCoreColor = hsl(blendHue, 20, 92);

  /* --- Organic jitter: stronger on transients --- */
  const jitterAmt = 2 + onsetEnvelope * 6;

  /* --- Glow radius: bass-driven --- */
  const glowStd = interpolate(bass, [0.05, 0.5], [4, 16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- Bolt geometry --- */
  const outerPts = useMemo(
    () => jitterPoints(BASE_BOLT, frame, jitterAmt, instance.seed),
    [frame, jitterAmt, instance.seed],
  );
  const innerPts = useMemo(
    () => jitterPoints(INNER_BOLT, frame, jitterAmt * 0.6, instance.seed + 33),
    [frame, jitterAmt, instance.seed],
  );
  const corePts = useMemo(
    () => jitterPoints(CORE_BOLT, frame, jitterAmt * 0.25, instance.seed + 66),
    [frame, jitterAmt, instance.seed],
  );

  /* --- Fork branches: 2-3 based on energy --- */
  const forkCount = energy > 0.3 ? 3 : 2;
  const forks = useMemo(
    () => generateForks(frame, jitterAmt, forkCount, instance.seed),
    [frame, jitterAmt, forkCount, instance.seed],
  );

  /* --- Opacity: fast attack / decay tied to onset envelope --- */
  const boltOpacity =
    interpolate(onsetEnvelope, [0.25, 0.45, 0.8], [0, 0.65, 0.9], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * instance.opacityMult;

  const filterId = `${uid}-${instance.seed}`;

  return (
    <div
      style={{
        position: "absolute",
        left: `${instance.posX}%`,
        top: `${instance.posY}%`,
        transform: `translate(-50%, -50%) rotate(${instance.rotation}deg)`,
        opacity: boltOpacity,
        willChange: "opacity, transform",
      }}
    >
      <svg
        width={boltSize}
        height={boltSize * 1.67}
        viewBox="0 0 60 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* --- Main body gradient: bright top to darker bottom --- */}
          <linearGradient
            id={`${filterId}-body`}
            x1="50%"
            y1="0%"
            x2="50%"
            y2="100%"
          >
            <stop offset="0%" stopColor={bodyTopColor} />
            <stop offset="45%" stopColor={bodyMidColor} />
            <stop offset="100%" stopColor={bodyBottomColor} />
          </linearGradient>

          {/* --- Core gradient: near-white --- */}
          <linearGradient
            id={`${filterId}-core`}
            x1="50%"
            y1="0%"
            x2="50%"
            y2="100%"
          >
            <stop offset="0%" stopColor={coreTopColor} />
            <stop offset="50%" stopColor={coreMidColor} />
            <stop offset="100%" stopColor="#ffffffcc" />
          </linearGradient>

          {/* --- Wide outer glow filter (palette-tinted) --- */}
          <filter
            id={`${filterId}-glow`}
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={glowStd}
              result="blur"
            />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0"
            />
          </filter>

          {/* --- Core bloom filter --- */}
          <filter
            id={`${filterId}-bloom`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={1.5 + flashIntensity * 2.5}
              result="blur"
            />
            <feColorMatrix
              in="blur"
              type="matrix"
              values={`1 0 0 0 ${flashIntensity * 0.25}  0 1 0 0 ${flashIntensity * 0.25}  0 0 1 0 ${flashIntensity * 0.25}  0 0 0 1 0`}
            />
          </filter>

          {/* --- Fork glow filter --- */}
          <filter
            id={`${filterId}-forkglow`}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={2.5 + onsetEnvelope * 3}
            />
          </filter>
        </defs>

        {/* ======================================================== */}
        {/* LAYER 0: Outer glow (wide, soft, atmospheric)            */}
        {/* ======================================================== */}
        <polygon
          points={outerPts}
          fill={glowColor}
          opacity={0.3 + onsetEnvelope * 0.25}
          filter={`url(#${filterId}-glow)`}
        />

        {/* ======================================================== */}
        {/* LAYER 1: Branching fork sparks                           */}
        {/* ======================================================== */}
        {forks.map((fork, i) => (
          <g key={`fork-${i}`}>
            {/* Fork glow */}
            <path
              d={fork.path}
              stroke={glowColor}
              strokeWidth={1.5 + bass * 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.2 + onsetEnvelope * 0.25}
              filter={`url(#${filterId}-forkglow)`}
            />
            {/* Fork body */}
            <path
              d={fork.path}
              stroke={forkColor}
              strokeWidth={0.8 + bass * 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.45 + onsetEnvelope * 0.3}
            />
            {/* Fork core */}
            <path
              d={fork.path}
              stroke={forkCoreColor}
              strokeWidth={0.3 + flashIntensity * 0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.2 + flashIntensity * 0.4}
            />
          </g>
        ))}

        {/* ======================================================== */}
        {/* LAYER 2: Main bolt body (gradient fill)                  */}
        {/* ======================================================== */}
        <polygon
          points={innerPts}
          fill={`url(#${filterId}-body)`}
          stroke={bodyTopColor}
          strokeWidth={0.8}
          strokeLinejoin="round"
          opacity={0.85 + onsetEnvelope * 0.15}
        />

        {/* ======================================================== */}
        {/* LAYER 3: Inner white-hot core                            */}
        {/* ======================================================== */}
        <polygon
          points={corePts}
          fill={`url(#${filterId}-core)`}
          opacity={0.2 + flashIntensity * 0.6 + beatDecay * 0.15}
          filter={`url(#${filterId}-bloom)`}
        />

        {/* ======================================================== */}
        {/* LAYER 4: Strike-point impact flash                       */}
        {/* ======================================================== */}
        <circle
          cx="5"
          cy="100"
          r={4 + bass * 8 + onsetEnvelope * 5}
          fill={glowColor}
          opacity={
            interpolate(onsetEnvelope, [0.3, 0.7], [0, 0.5], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }) *
            (0.4 + energy * 0.6)
          }
          filter={`url(#${filterId}-glow)`}
        />

        {/* ======================================================== */}
        {/* LAYER 5: Tip ionization point                            */}
        {/* ======================================================== */}
        <circle
          cx="30"
          cy="2"
          r={2 + onsetEnvelope * 4}
          fill={coreTopColor}
          opacity={0.15 + onsetEnvelope * 0.35}
          filter={`url(#${filterId}-bloom)`}
        />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const LightningBoltOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const palette = useSongPalette();

  const onsetEnvelope = snap.onsetEnvelope;
  const energy = snap.energy;
  const bass = snap.bass ?? 0;
  const chromaHue = snap.chromaHue;
  const beatDecay = snap.beatDecay;

  /* --- Gate: only visible on onset transients --- */
  if (onsetEnvelope < 0.25) return null;

  /* --- Flash intensity for white overlay --- */
  const flashIntensity = interpolate(onsetEnvelope, [0.4, 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- Determine how many bolts to spawn --- */
  // Normal: 1 bolt. Strong onset + high energy: 2-3 bolts.
  const boltCount =
    energy > 0.45 && onsetEnvelope > 0.6
      ? 3
      : energy > 0.35 && onsetEnvelope > 0.45
        ? 2
        : 1;

  /* --- Position each bolt instance via hash-based deterministic placement --- */
  const cycleId = Math.floor(frame / 20); // ~0.67s onset cycle at 30fps
  const instances: BoltInstance[] = useMemo(() => {
    const result: BoltInstance[] = [];
    for (let i = 0; i < 3; i++) {
      const hashA = cycleId * 7919 + i * 4327;
      const hashB = cycleId * 6271 + i * 3571;
      const hashC = cycleId * 5381 + i * 2903;
      result.push({
        posX: (((hashA % 60) + 60) % 60) + 20, // 20-80% of width
        posY: (((hashB % 50) + 50) % 50) + 25, // 25-75% of height
        scale:
          i === 0
            ? 1.0
            : 0.55 + srand(hashC) * 0.35, // primary bolt full size, secondaries smaller
        rotation: (srand(hashA * 0.37 + i * 53) - 0.5) * 30, // +/- 15 degrees tilt
        opacityMult: i === 0 ? 1.0 : 0.5 + srand(hashB * 0.19 + i * 71) * 0.3,
        seed: i * 100 + cycleId,
      });
    }
    return result;
  }, [cycleId]);

  /* --- White flash overlay on strong onsets --- */
  const whiteFlashOpacity = interpolate(
    onsetEnvelope,
    [0.6, 0.85, 1.0],
    [0, 0.04, 0.1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {/* --- White impact flash on very strong onsets --- */}
      {whiteFlashOpacity > 0.005 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#ffffff",
            opacity: whiteFlashOpacity,
            willChange: "opacity",
          }}
        />
      )}

      {/* --- Bolt instances --- */}
      {instances.slice(0, boltCount).map((inst, i) => (
        <SingleBolt
          key={`lb-${i}`}
          instance={inst}
          frame={frame}
          width={width}
          height={height}
          onsetEnvelope={onsetEnvelope}
          energy={energy}
          bass={bass}
          chromaHue={chromaHue}
          beatDecay={beatDecay}
          paletteHue={palette.primary}
          flashIntensity={flashIntensity}
          uid={`lb${i}`}
        />
      ))}
    </div>
  );
};
