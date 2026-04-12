/**
 * BoxOfRain — A wireframe cube floating in space, containing rain.
 *
 * Phil Lesh's meditation on the earth as a vessel for life. Tender, beautiful.
 * A glowing wireframe cube hovers in gentle rotation. Rain falls inside the cube,
 * constrained to its volume — drops create ripples when they hit the floor.
 * Lighter rain falls outside, unconstrained. A faint ground reflection mirrors
 * the cube below. Soft ambient glow envelops the whole scene.
 *
 * Audio: slowEnergy → rotation speed, bass → rain intensity,
 *        energy → glow brightness, chromaHue → wireframe + rain tint,
 *        beatDecay → cube glow pulse.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InternalDrop {
  /** Normalized X within cube, -1 to 1 */
  x: number;
  /** Normalized Z within cube, -1 to 1 (depth) */
  z: number;
  /** Fall speed multiplier */
  speed: number;
  /** Phase offset for staggered entry */
  phase: number;
  /** Drop length in pixels */
  length: number;
  /** Brightness 0-1 */
  brightness: number;
}

interface ExternalDrop {
  /** Screen-space X normalized 0-1 */
  x: number;
  /** Fall speed multiplier */
  speed: number;
  /** Phase offset */
  phase: number;
  /** Drop length */
  length: number;
  /** Brightness 0-1 */
  brightness: number;
  /** Wind drift amount */
  windDrift: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_INTERNAL_DROPS = 48;
const NUM_EXTERNAL_DROPS = 30;
const MAX_RIPPLES = 12;
const CYCLE = 1800; // 60s at 30fps
const DURATION = 480; // 16s at 30fps

/* ------------------------------------------------------------------ */
/*  Generators                                                         */
/* ------------------------------------------------------------------ */

function generateInternalDrops(seed: number): InternalDrop[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_INTERNAL_DROPS }, () => ({
    x: (rng() - 0.5) * 1.8,
    z: (rng() - 0.5) * 1.8,
    speed: 1.2 + rng() * 2.5,
    phase: rng() * 400,
    length: 6 + rng() * 14,
    brightness: 0.5 + rng() * 0.5,
  }));
}

function generateExternalDrops(seed: number): ExternalDrop[] {
  const rng = seeded(seed + 999);
  return Array.from({ length: NUM_EXTERNAL_DROPS }, () => ({
    x: rng(),
    speed: 1.8 + rng() * 3.5,
    phase: rng() * 500,
    length: 10 + rng() * 20,
    brightness: 0.15 + rng() * 0.25,
    windDrift: (rng() - 0.4) * 0.6,
  }));
}

/* ------------------------------------------------------------------ */
/*  3D Projection                                                      */
/* ------------------------------------------------------------------ */

function project3D(
  x: number,
  y: number,
  z: number,
  rotY: number,
  rotX: number,
  scale: number,
): { px: number; py: number; depth: number } {
  // Rotate around Y axis
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = x * cosY - z * sinY;
  const z1 = x * sinY + z * cosY;

  // Rotate around X axis
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y1 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;

  return { px: x1 * scale, py: y1 * scale, depth: z2 };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const BoxOfRain: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const { energy, slowEnergy, bass, chromaHue, beatDecay } = snap;

  const internalDrops = React.useMemo(() => generateInternalDrops(77_508_01), []);
  const externalDrops = React.useMemo(() => generateExternalDrops(77_508_01), []);

  /* ---- Cycle / visibility ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const opacity = interpolate(progress, [0, 0.06, 0.90, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  if (opacity < 0.01) return null;

  /* ---- Audio-driven parameters ---- */
  const rotSpeed = 0.005 + slowEnergy * 0.008 * tempoFactor;
  const rainIntensity = interpolate(bass, [0.02, 0.3], [0.25, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowBrightness = 0.3 + energy * 0.6;
  const pulseFactor = 1 + beatDecay * 0.35;
  const hue = chromaHue; // tint wireframe + rain

  /* ---- Cube geometry ---- */
  const boxCx = width / 2;
  const boxCy = height * 0.36;
  const bobY = Math.sin(cycleFrame * 0.018 * tempoFactor) * 8;
  const boxSize = 64; // half-edge length in pixels

  const rotY = cycleFrame * rotSpeed;
  const rotX = 0.35 + Math.sin(cycleFrame * 0.009 * tempoFactor) * 0.12;

  // 8 cube vertices: unit cube from -1 to 1
  const corners: [number, number, number][] = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];

  const projected = corners.map(([x, y, z]) => project3D(x, y, z, rotY, rotX, boxSize));

  // 12 cube edges
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  // Cube bounding box in screen space
  const cubeScreenTop = Math.min(...projected.map((p) => p.py)) + boxCy + bobY;
  const cubeScreenBottom = Math.max(...projected.map((p) => p.py)) + boxCy + bobY;
  const cubeScreenLeft = Math.min(...projected.map((p) => p.px)) + boxCx;
  const cubeScreenRight = Math.max(...projected.map((p) => p.px)) + boxCx;
  const cubeScreenWidth = cubeScreenRight - cubeScreenLeft;
  const cubeScreenHeight = cubeScreenBottom - cubeScreenTop;

  /* ---- Color helpers ---- */
  const wireHue = hue;
  const rainHue = (hue + 180) % 360; // complementary or shifted — rain is cooler
  const rainHueActual = interpolate(hue, [0, 360], [185, 215], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }); // Keep rain in blue-cyan range, subtly modulated by chromaHue

  const wireColor = (a: number) => `hsla(${wireHue}, 50%, ${65 + glowBrightness * 20}%, ${a})`;
  const rainColor = (a: number, brightnessShift = 0) =>
    `hsla(${rainHueActual + brightnessShift}, 80%, ${65 + brightnessShift * 0.3}%, ${a})`;

  /* ---- SVG filter IDs ---- */
  const filterId = `box-rain-glow-${frame % 10000}`;
  const reflectGradId = `box-rain-reflect-${frame % 10000}`;

  /* ---- Visible drops ---- */
  const visibleInternal = Math.floor(NUM_INTERNAL_DROPS * rainIntensity);
  const visibleExternal = Math.floor(NUM_EXTERNAL_DROPS * rainIntensity * 0.7);

  /* ---- Ripple state (deterministic from frame) ---- */
  const ripples: { x: number; age: number; maxAge: number; size: number }[] = [];
  const rippleRng = seeded(cycleFrame * 7 + 13);
  for (let i = 0; i < MAX_RIPPLES; i++) {
    const age = (cycleFrame + Math.floor(rippleRng() * 60)) % 45;
    const maxAge = 40;
    if (age < maxAge && rainIntensity > 0.3) {
      ripples.push({
        x: cubeScreenLeft + rippleRng() * cubeScreenWidth,
        age,
        maxAge,
        size: 3 + rippleRng() * 8,
      });
    } else {
      rippleRng(); // consume to keep deterministic
    }
  }

  /* ---- Render ---- */
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        <defs>
          {/* Soft glow filter for the cube */}
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={4 + beatDecay * 6} result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Gradient for ground reflection fade */}
          <linearGradient id={reflectGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={0.18 * glowBrightness} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* ============ AMBIENT GLOW ============ */}
        <ellipse
          cx={boxCx}
          cy={boxCy + bobY}
          rx={boxSize * 2.8 * pulseFactor}
          ry={boxSize * 2.2 * pulseFactor}
          fill={`hsla(${wireHue}, 40%, 60%, ${0.04 + energy * 0.06})`}
          style={{ filter: `blur(${40 + beatDecay * 20}px)` }}
        />

        {/* ============ EXTERNAL RAIN (behind cube) ============ */}
        {externalDrops.slice(0, visibleExternal).map((drop, i) => {
          const elapsed = cycleFrame - drop.phase;
          if (elapsed < 0) return null;

          const fallDist = height * 1.1;
          const dropY = ((elapsed * drop.speed * 0.6) % fallDist);
          const dropX = drop.x * width + dropY * drop.windDrift;

          if (dropY > height + 20) return null;

          const fadeAlpha = drop.brightness * rainIntensity *
            interpolate(dropY, [0, 60, height - 80, height], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

          return (
            <line
              key={`ext-${i}`}
              x1={dropX}
              y1={dropY}
              x2={dropX - drop.windDrift * 3}
              y2={dropY - drop.length}
              stroke={rainColor(fadeAlpha * 0.4)}
              strokeWidth={1}
              strokeLinecap="round"
            />
          );
        })}

        {/* ============ INTERNAL RAIN (inside cube) ============ */}
        {internalDrops.slice(0, visibleInternal).map((drop, i) => {
          const elapsed = cycleFrame - drop.phase;
          if (elapsed < 0) return null;

          // Project the drop's 3D position within the cube
          const cubeInternalHeight = cubeScreenHeight * 0.92;
          const fallCycle = cubeInternalHeight / (drop.speed * 0.5);
          const dropLocalY = ((elapsed * drop.speed * 0.5) % cubeInternalHeight);

          // 3D position: x and z from drop seed, y animates downward
          const normalizedY = -1 + (dropLocalY / cubeInternalHeight) * 2; // -1 top to 1 bottom
          const proj = project3D(drop.x, normalizedY, drop.z, rotY, rotX, boxSize);

          const screenX = proj.px + boxCx;
          const screenY = proj.py + boxCy + bobY;

          // Depth-based alpha: farther = dimmer (simulates seeing through transparent walls)
          const depthAlpha = interpolate(proj.depth, [-boxSize, boxSize], [0.4, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const fadeAlpha = drop.brightness * rainIntensity * depthAlpha *
            interpolate(dropLocalY, [0, 8, cubeInternalHeight - 8, cubeInternalHeight],
              [0.2, 1, 1, 0.3], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

          // Scale drop length by depth
          const depthScale = interpolate(proj.depth, [-boxSize, boxSize], [0.6, 1.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <g key={`int-${i}`}>
              {/* Soft glow trail */}
              <line
                x1={screenX}
                y1={screenY}
                x2={screenX}
                y2={screenY - drop.length * depthScale}
                stroke={rainColor(fadeAlpha * 0.3, -10)}
                strokeWidth={3.5}
                strokeLinecap="round"
                style={{ filter: "blur(2px)" }}
              />
              {/* Core raindrop */}
              <line
                x1={screenX}
                y1={screenY}
                x2={screenX}
                y2={screenY - drop.length * depthScale}
                stroke={rainColor(fadeAlpha * 0.8)}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              {/* Bright head */}
              <circle
                cx={screenX}
                cy={screenY}
                r={1.2 * depthScale}
                fill={rainColor(fadeAlpha * 0.9, 10)}
              />
            </g>
          );
        })}

        {/* ============ WIREFRAME CUBE — 3-layer edges ============ */}
        <g filter={`url(#${filterId})`}>
          {edges.map(([a, b], i) => {
            const ax = projected[a].px + boxCx;
            const ay = projected[a].py + boxCy + bobY;
            const bx = projected[b].px + boxCx;
            const by = projected[b].py + boxCy + bobY;

            // Edge depth: average of the two endpoints
            const edgeDepth = (projected[a].depth + projected[b].depth) / 2;
            const depthBrightness = interpolate(edgeDepth, [-boxSize, boxSize], [0.6, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <g key={`edge-${i}`}>
                {/* Layer 1: Outer glow — wide, soft, tinted */}
                <line
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke={wireColor(0.15 * pulseFactor * depthBrightness)}
                  strokeWidth={8}
                  strokeLinecap="round"
                  style={{ filter: "blur(4px)" }}
                />
                {/* Layer 2: Main wire — medium, solid */}
                <line
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke={wireColor(0.6 * pulseFactor * depthBrightness)}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                {/* Layer 3: Inner bright core — thin, high luminance */}
                <line
                  x1={ax} y1={ay} x2={bx} y2={by}
                  stroke={`hsla(${wireHue}, 30%, ${85 + beatDecay * 10}%, ${0.9 * pulseFactor * depthBrightness})`}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Corner vertices: small bright dots */}
          {projected.map((p, i) => {
            const depthBrightness = interpolate(p.depth, [-boxSize, boxSize], [0.5, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <circle
                key={`corner-${i}`}
                cx={p.px + boxCx}
                cy={p.py + boxCy + bobY}
                r={2.5 * pulseFactor}
                fill={`hsla(${wireHue}, 40%, 90%, ${0.9 * depthBrightness})`}
              />
            );
          })}
        </g>

        {/* ============ FLOOR RIPPLES ============ */}
        {ripples.map((ripple, i) => {
          const rippleProgress = ripple.age / ripple.maxAge;
          const rippleAlpha = interpolate(rippleProgress, [0, 0.2, 1], [0, 0.5, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * rainIntensity;
          const rippleRadius = ripple.size * (0.5 + rippleProgress * 2);

          return (
            <ellipse
              key={`ripple-${i}`}
              cx={ripple.x}
              cy={cubeScreenBottom + 1}
              rx={rippleRadius}
              ry={rippleRadius * 0.35}
              fill="none"
              stroke={rainColor(rippleAlpha * 0.6)}
              strokeWidth={0.8}
            />
          );
        })}

        {/* ============ GROUND REFLECTION ============ */}
        <g
          opacity={0.12 + energy * 0.08}
          style={{ filter: "blur(3px)" }}
        >
          {/* Reflected cube — flipped vertically below the cube's bottom */}
          {edges.map(([a, b], i) => {
            // Mirror Y around cubeScreenBottom
            const reflectY = (py: number) => cubeScreenBottom + (cubeScreenBottom - (py + boxCy + bobY)) * -0.6 + 20;

            const ax = projected[a].px + boxCx;
            const ay = reflectY(projected[a].py);
            const bx = projected[b].px + boxCx;
            const by = reflectY(projected[b].py);

            return (
              <line
                key={`reflect-edge-${i}`}
                x1={ax} y1={ay} x2={bx} y2={by}
                stroke={wireColor(0.15 * pulseFactor)}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Reflected ambient pool */}
          <ellipse
            cx={boxCx}
            cy={cubeScreenBottom + cubeScreenHeight * 0.4}
            rx={cubeScreenWidth * 0.8}
            ry={cubeScreenHeight * 0.25}
            fill={`hsla(${wireHue}, 30%, 50%, ${0.06 + beatDecay * 0.12})`}
            style={{ filter: "blur(12px)" }}
          />
        </g>

        {/* ============ CUBE FLOOR GLOW (splash accumulation) ============ */}
        <ellipse
          cx={boxCx}
          cy={cubeScreenBottom + 2}
          rx={cubeScreenWidth * 0.55}
          ry={4 + bass * 4}
          fill={rainColor(0.12 * rainIntensity)}
          style={{ filter: "blur(6px)" }}
        />
      </svg>
    </div>
  );
};
