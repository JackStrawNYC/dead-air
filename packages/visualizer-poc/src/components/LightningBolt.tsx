/**
 * LightningBolt — full-frame dramatic lightning strike on strong onset peaks.
 *
 * This is the BIG STRIKE bolt — fires on onset > 0.5 with 60-frame cooldown.
 * Different from LightningBoltOverlay (small accent) and ThirteenPointBolt (persistent).
 *
 * A+++ visual stack:
 *   - 18-segment jagged main bolt (top-to-bottom, deterministic per bolt frame)
 *   - 5-layer main bolt rendering: atmospheric glow, outer glow, body, inner body, white-hot core
 *   - 5 branching forks (3-layer each: glow, body, core), angled 30-60 degrees
 *   - Impact FX: full-frame white flash, ground radial glow, ceiling origin glow
 *   - Ionization halos at each bend point along main bolt
 *   - Animated electric particles racing along bolt path
 *   - Audio-reactive: onset → core brightness, bass → glow/thickness, chromaHue → color, beatDecay → particle speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { seeded } from "../utils/seededRandom";

/* ── constants ─────────────────────────────────────────────────────── */

const ONSET_THRESHOLD = 0.5;
const BOLT_FADE_FRAMES = 50;
const FLASH_FRAMES = 10;
const COOLDOWN_FRAMES = 60;
const MAIN_SEGMENTS = 18;
const BRANCH_COUNT = 5;
const PARTICLE_COUNT = 12;

/* ── geometry helpers ──────────────────────────────────────────────── */

interface Point {
  x: number;
  y: number;
}

/**
 * Generate a jagged bolt path as an array of points.
 * Uses seeded PRNG for full determinism — same bolt frame = same shape.
 */
function generateBoltPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  segments: number,
  jitterX: number,
  jitterY: number,
  rng: () => number,
): Point[] {
  const points: Point[] = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const baseX = x1 + (x2 - x1) * t;
    const baseY = y1 + (y2 - y1) * t;
    // Organic jitter: larger in middle, tighter at endpoints
    const midFactor = Math.sin(t * Math.PI); // peaks at 0.5
    const ox = (rng() - 0.5) * 2 * jitterX * (0.4 + 0.6 * midFactor);
    const oy = (rng() - 0.5) * 2 * jitterY * 0.3;
    points.push({ x: baseX + ox, y: baseY + oy });
  }
  points.push({ x: x2, y: y2 });
  return points;
}

/** Convert point array to SVG path string */
function pointsToPath(pts: Point[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return d;
}

/** Interpolate a position along a polyline at parameter t (0-1) */
function interpolateAlongPath(pts: Point[], t: number): Point {
  if (pts.length < 2) return pts[0] ?? { x: 0, y: 0 };
  const clamped = Math.max(0, Math.min(1, t));

  // Compute cumulative segment lengths
  const lengths: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
    lengths.push(totalLen);
  }
  if (totalLen === 0) return pts[0];

  const targetLen = clamped * totalLen;
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] >= targetLen) {
      const segLen = lengths[i] - lengths[i - 1];
      const segT = segLen > 0 ? (targetLen - lengths[i - 1]) / segLen : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * segT,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * segT,
      };
    }
  }
  return pts[pts.length - 1];
}

/** Generate branch fork points from the main bolt */
function generateBranch(
  mainPts: Point[],
  branchIndex: number,
  width: number,
  height: number,
  rng: () => number,
): Point[] {
  // Branch origin: positioned along main bolt at 15-80% (spread across bolt)
  const originT = 0.15 + (branchIndex / BRANCH_COUNT) * 0.65 + (rng() - 0.5) * 0.08;
  const origin = interpolateAlongPath(mainPts, originT);

  // Branch direction: outward at 30-60 degrees from vertical
  const side = rng() > 0.5 ? 1 : -1;
  const angle = (30 + rng() * 30) * (Math.PI / 180); // 30-60 degrees
  const branchLen = height * (0.08 + rng() * 0.12); // shorter than main bolt
  const segments = 4 + Math.floor(rng() * 3); // 4-6 segments

  const endX = origin.x + side * Math.sin(angle) * branchLen;
  const endY = origin.y + Math.cos(angle) * branchLen;

  return generateBoltPoints(
    origin.x,
    origin.y,
    endX,
    endY,
    segments,
    width * 0.025,
    height * 0.015,
    rng,
  );
}

/* ── color helpers ─────────────────────────────────────────────────── */

/** Convert chromaHue (0-360) to an electric bolt palette */
function boltPalette(chromaHue: number): {
  atmospheric: string;
  outer: string;
  body: string;
  inner: string;
  core: string;
  particle: string;
} {
  // Base hue derived from chromaHue, biased toward electric purple-blue range
  const hue = (chromaHue * 0.4 + 240) % 360; // blend toward 240 (blue-purple)
  const h2 = (hue + 20) % 360; // slightly shifted for variety

  return {
    atmospheric: `hsla(${hue}, 70%, 40%, 1)`,
    outer: `hsla(${hue}, 80%, 55%, 1)`,
    body: `hsla(${h2}, 60%, 78%, 1)`,
    inner: `hsla(${h2}, 30%, 90%, 1)`,
    core: `hsla(0, 0%, 100%, 1)`,
    particle: `hsla(${hue}, 90%, 70%, 1)`,
  };
}

/* ── main component ────────────────────────────────────────────────── */

interface Props {
  frames: EnhancedFrameData[];
}

export const LightningBolt: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);

  /* ── bolt event detection (deterministic scan) ────────────────── */

  const activeBoltFrame = React.useMemo(() => {
    let bestBolt = -Infinity;
    let cooldownEnd = 0;
    for (let i = 0; i < frames.length && i <= frame; i++) {
      if (i < cooldownEnd) continue;
      const onset = frames[i]?.onset ?? 0;
      if (onset > ONSET_THRESHOLD) {
        bestBolt = i;
        cooldownEnd = i + COOLDOWN_FRAMES;
      }
    }
    return bestBolt;
  }, [frames, frame]);

  const framesSinceBolt = frame - activeBoltFrame;

  // Not visible if no bolt fired or fully faded
  if (activeBoltFrame < 0 || framesSinceBolt > BOLT_FADE_FRAMES) {
    return null;
  }

  /* ── timing envelopes ─────────────────────────────────────────── */

  // Main bolt opacity: sharp attack, exponential-ish decay
  const boltOpacity = interpolate(
    framesSinceBolt,
    [0, 3, BOLT_FADE_FRAMES * 0.4, BOLT_FADE_FRAMES],
    [1.0, 1.0, 0.5, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // White flash envelope
  const flashOpacity =
    framesSinceBolt < FLASH_FRAMES
      ? interpolate(framesSinceBolt, [0, 2, FLASH_FRAMES], [0.12, 0.08, 0.0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // Branch fade: branches fade faster than main bolt
  const branchOpacity = interpolate(
    framesSinceBolt,
    [0, 2, BOLT_FADE_FRAMES * 0.3, BOLT_FADE_FRAMES * 0.6],
    [0.85, 0.85, 0.35, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Particle travel: particles race along bolt over the fade duration
  const particleProgress = interpolate(
    framesSinceBolt,
    [0, BOLT_FADE_FRAMES * 0.8],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Impact glow: ground + ceiling radials fade over ~25 frames
  const impactGlow = interpolate(
    framesSinceBolt,
    [0, 4, 25],
    [1.0, 0.8, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  /* ── audio-reactive parameters ────────────────────────────────── */

  const onsetBrightness = 0.6 + snap.onsetEnvelope * 0.4;
  const bassGlow = 1.0 + snap.bass * 2.5;
  const bassThickness = 1.0 + snap.bass * 0.8;
  const particleSpeed = 0.5 + snap.beatDecay * 1.5;
  const palette = boltPalette(snap.chromaHue);

  /* ── geometry generation (deterministic from bolt frame seed) ── */

  const rng = seeded(activeBoltFrame * 7919 + 31337);

  // Main bolt: slight horizontal wander around center
  const startX = width * (0.42 + rng() * 0.16);
  const endX = width * (0.38 + rng() * 0.24);
  const mainPts = generateBoltPoints(
    startX,
    -height * 0.02,
    endX,
    height * 1.02,
    MAIN_SEGMENTS,
    width * 0.09,
    height * 0.025,
    rng,
  );
  const mainPath = pointsToPath(mainPts);

  // Branches
  const branches = Array.from({ length: BRANCH_COUNT }, (_, i) =>
    generateBranch(mainPts, i, width, height, rng),
  );
  const branchPaths = branches.map(pointsToPath);

  // Ionization halo points: every 2nd vertex of main bolt (skip endpoints)
  const haloPts = mainPts.filter((_, i) => i > 0 && i < mainPts.length - 1 && i % 2 === 0);

  // Particle positions along bolt
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const baseT = (i / PARTICLE_COUNT + particleProgress * particleSpeed) % 1;
    return interpolateAlongPath(mainPts, baseT);
  });

  /* ── SVG filter definitions ───────────────────────────────────── */

  const filterId = `bolt-blur-${activeBoltFrame}`;
  const glowFilterId = `bolt-glow-${activeBoltFrame}`;
  const atmosphericFilterId = `bolt-atmo-${activeBoltFrame}`;

  /* ── layer stroke widths (audio-reactive via bassThickness) ──── */

  const mainAtmospheric = 28 * bassThickness;
  const mainOuter = 14 * bassThickness;
  const mainBody = 5 * bassThickness;
  const mainInner = 2.5 * bassThickness;
  const mainCore = 1.2;

  const branchOuter = 6 * bassThickness;
  const branchBody = 2.5 * bassThickness;
  const branchCore = 0.8;

  /* ── glow radii (audio-reactive via bassGlow) ─────────────────── */

  const atmosphericBlur = 35 * bassGlow;
  const outerBlur = 14 * bassGlow;
  const haloRadius = 8 + snap.bass * 12;
  const impactRadius = 120 + snap.bass * 80;
  const ceilingRadius = 80 + snap.bass * 50;

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* ── white flash overlay ──────────────────────────────── */}
      {flashOpacity > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#FFFFFF",
            opacity: flashOpacity * onsetBrightness,
          }}
        />
      )}

      {/* ── bolt SVG ─────────────────────────────────────────── */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0 }}
        fill="none"
      >
        <defs>
          {/* Atmospheric blur (very wide) */}
          <filter id={atmosphericFilterId} x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation={atmosphericBlur} />
          </filter>

          {/* Outer glow blur */}
          <filter id={glowFilterId} x="-30%" y="-5%" width="160%" height="110%">
            <feGaussianBlur stdDeviation={outerBlur} />
          </filter>

          {/* Subtle body glow */}
          <filter id={filterId} x="-20%" y="-5%" width="140%" height="110%">
            <feGaussianBlur stdDeviation={4 * bassGlow} />
          </filter>

          {/* Radial gradient for ground impact */}
          <radialGradient id={`impact-grad-${activeBoltFrame}`}>
            <stop offset="0%" stopColor={palette.outer} stopOpacity={0.6} />
            <stop offset="40%" stopColor={palette.atmospheric} stopOpacity={0.25} />
            <stop offset="100%" stopColor={palette.atmospheric} stopOpacity={0} />
          </radialGradient>

          {/* Radial gradient for ceiling origin */}
          <radialGradient id={`ceiling-grad-${activeBoltFrame}`}>
            <stop offset="0%" stopColor={palette.core} stopOpacity={0.5} />
            <stop offset="30%" stopColor={palette.outer} stopOpacity={0.2} />
            <stop offset="100%" stopColor={palette.atmospheric} stopOpacity={0} />
          </radialGradient>

          {/* Ionization halo gradient */}
          <radialGradient id={`halo-grad-${activeBoltFrame}`}>
            <stop offset="0%" stopColor={palette.inner} stopOpacity={0.6} />
            <stop offset="50%" stopColor={palette.outer} stopOpacity={0.2} />
            <stop offset="100%" stopColor={palette.atmospheric} stopOpacity={0} />
          </radialGradient>

          {/* Particle glow gradient */}
          <radialGradient id={`particle-grad-${activeBoltFrame}`}>
            <stop offset="0%" stopColor={palette.core} stopOpacity={0.9} />
            <stop offset="40%" stopColor={palette.particle} stopOpacity={0.5} />
            <stop offset="100%" stopColor={palette.particle} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* ── Layer 1: Atmospheric background glow ───────────── */}
        <path
          d={mainPath}
          stroke={palette.atmospheric}
          strokeWidth={mainAtmospheric}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.25 * onsetBrightness}
          filter={`url(#${atmosphericFilterId})`}
        />

        {/* ── Layer 2: Outer glow ────────────────────────────── */}
        <path
          d={mainPath}
          stroke={palette.outer}
          strokeWidth={mainOuter}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.45 * onsetBrightness}
          filter={`url(#${glowFilterId})`}
        />

        {/* ── Layer 3: Main body ─────────────────────────────── */}
        <path
          d={mainPath}
          stroke={palette.body}
          strokeWidth={mainBody}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.85 * onsetBrightness}
          filter={`url(#${filterId})`}
        />

        {/* ── Layer 4: Inner bright body ─────────────────────── */}
        <path
          d={mainPath}
          stroke={palette.inner}
          strokeWidth={mainInner}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * 0.9 * onsetBrightness}
        />

        {/* ── Layer 5: White-hot core ────────────────────────── */}
        <path
          d={mainPath}
          stroke={palette.core}
          strokeWidth={mainCore}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={boltOpacity * onsetBrightness}
        />

        {/* ── Branches (5 forks, 3 layers each) ─────────────── */}
        {branchPaths.map((bp, i) => (
          <React.Fragment key={`branch-${i}`}>
            {/* Branch glow */}
            <path
              d={bp}
              stroke={palette.outer}
              strokeWidth={branchOuter}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={branchOpacity * 0.3 * onsetBrightness}
              filter={`url(#${glowFilterId})`}
            />
            {/* Branch body */}
            <path
              d={bp}
              stroke={palette.body}
              strokeWidth={branchBody}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={branchOpacity * 0.7 * onsetBrightness}
            />
            {/* Branch core */}
            <path
              d={bp}
              stroke={palette.core}
              strokeWidth={branchCore}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={branchOpacity * 0.85 * onsetBrightness}
            />
          </React.Fragment>
        ))}

        {/* ── Ceiling origin glow ────────────────────────────── */}
        {impactGlow > 0 && (
          <ellipse
            cx={startX}
            cy={0}
            rx={ceilingRadius}
            ry={ceilingRadius * 0.5}
            fill={`url(#ceiling-grad-${activeBoltFrame})`}
            opacity={impactGlow * 0.7 * onsetBrightness}
          />
        )}

        {/* ── Ground strike radial glow ──────────────────────── */}
        {impactGlow > 0 && (
          <ellipse
            cx={endX}
            cy={height}
            rx={impactRadius}
            ry={impactRadius * 0.4}
            fill={`url(#impact-grad-${activeBoltFrame})`}
            opacity={impactGlow * 0.6 * onsetBrightness}
          />
        )}

        {/* ── Ionization halos at bend points ────────────────── */}
        {haloPts.map((pt, i) => {
          const haloFade = interpolate(
            framesSinceBolt,
            [0, 5, BOLT_FADE_FRAMES * 0.5],
            [1.0, 0.7, 0.0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          return (
            <circle
              key={`halo-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={haloRadius * (0.7 + 0.3 * Math.sin(i * 1.7))}
              fill={`url(#halo-grad-${activeBoltFrame})`}
              opacity={haloFade * 0.5 * onsetBrightness}
            />
          );
        })}

        {/* ── Electric particles racing along bolt ───────────── */}
        {particles.map((pt, i) => {
          // Each particle has a slightly different phase and size
          const particleFade = interpolate(
            framesSinceBolt,
            [0, BOLT_FADE_FRAMES * 0.6, BOLT_FADE_FRAMES],
            [1.0, 0.6, 0.0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const size = 3 + (i % 3) * 1.5 + snap.bass * 3;
          return (
            <circle
              key={`particle-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={size}
              fill={`url(#particle-grad-${activeBoltFrame})`}
              opacity={particleFade * (0.5 + 0.5 * Math.sin(i * 2.3 + framesSinceBolt * 0.5)) * onsetBrightness}
            />
          );
        })}
      </svg>
    </div>
  );
};
