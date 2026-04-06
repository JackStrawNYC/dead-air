/**
 * SpaceTimeLattice — A+++ perspective grid that warps with bass.
 * Layer 4, tier B, tags: cosmic, psychedelic.
 *
 * 10x8 grid of dots connected by lines forming a warping lattice.
 * Each dot: bright core + soft glow halo. Warp toward center on bass hits
 * (gravitational lensing effect). Concentric ripple rings emanating from
 * warp center. Grid lines have gradient opacity (brighter near center).
 * Perspective depth (dots farther from center are smaller/dimmer).
 * Subtle secondary grid offset behind main grid for depth.
 *
 * Audio mapping:
 *   bass        → warp intensity (gravitational pull)
 *   energy      → dot brightness + overall opacity
 *   chromaHue   → palette hue
 *   beatDecay   → ripple ring timing + dot pulse
 *   slowEnergy  → ambient drift speed
 *   mids        → secondary grid visibility
 *   centroid    → glow halo size
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue to an HSL string with configurable saturation/lightness/alpha */
function hsl(h: number, s: number, l: number, a = 1): string {
  const hue = (((h % 1) + 1) % 1) * 360;
  return `hsla(${hue}, ${Math.round(s)}%, ${Math.round(l)}%, ${a.toFixed(3)})`;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLS = 10;
const ROWS = 8;
const VIEW_W = 400;
const VIEW_H = 320;
const CENTER_X = VIEW_W / 2;
const CENTER_Y = VIEW_H / 2;
const MAX_DIST = Math.sqrt(CENTER_X * CENTER_X + CENTER_Y * CENTER_Y);
const MARGIN_X = 25;
const MARGIN_Y = 20;

/** Number of concentric ripple rings */
const NUM_RIPPLES = 5;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const SpaceTimeLattice: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const bass = snap.bass;
  const mids = snap.mids;
  const beatDecay = snap.beatDecay;
  const centroid = snap.centroid;
  const chromaHue = snap.chromaHue / 360; // normalize to 0-1
  const tempoFactor = useTempoFactor();

  /* --- master opacity --- */
  const opacity = interpolate(energy, [0.02, 0.4], [0.1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- warp (gravitational lensing) --- */
  const warpStrength = interpolate(bass, [0.04, 0.55], [0, 0.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* --- animation clock --- */
  const drift = frame * 0.005 * tempoFactor;

  /* --- warped position calculator --- */
  const getWarpedPos = (col: number, row: number): [number, number] => {
    const baseX = MARGIN_X + (col / (COLS - 1)) * (VIEW_W - MARGIN_X * 2);
    const baseY = MARGIN_Y + (row / (ROWS - 1)) * (VIEW_H - MARGIN_Y * 2);

    const dx = baseX - CENTER_X;
    const dy = baseY - CENTER_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normDist = dist / MAX_DIST;

    // Gravitational pull toward center — stronger at edges
    const pullFactor = warpStrength * normDist * normDist;
    let wx = baseX - dx * pullFactor;
    let wy = baseY - dy * pullFactor;

    // Radial ripple wave
    const ripple = Math.sin(dist * 0.06 - drift * 4) * slowEnergy * 3.5;
    const angle = Math.atan2(dy, dx);
    wx += Math.cos(angle) * ripple;
    wy += Math.sin(angle) * ripple;

    // Subtle tangential twist on bass
    const twist = warpStrength * 0.03 * dist;
    wx += -Math.sin(angle) * twist;
    wy += Math.cos(angle) * twist;

    return [wx, wy];
  };

  /* --- pre-compute all grid positions --- */
  const positions: [number, number][][] = [];
  for (let r = 0; r < ROWS; r++) {
    positions[r] = [];
    for (let c = 0; c < COLS; c++) {
      positions[r][c] = getWarpedPos(c, r);
    }
  }

  /* --- secondary (shadow) grid — offset behind main for depth --- */
  const secondaryOpacity = interpolate(mids, [0.05, 0.35], [0.04, 0.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const secOffset = 3 + slowEnergy * 2; // pixels offset

  const secondaryPositions: [number, number][][] = [];
  for (let r = 0; r < ROWS; r++) {
    secondaryPositions[r] = [];
    for (let c = 0; c < COLS; c++) {
      const [px, py] = positions[r][c];
      secondaryPositions[r][c] = [px + secOffset, py + secOffset];
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Build SVG elements                                               */
  /* ---------------------------------------------------------------- */

  const elements: React.ReactNode[] = [];

  /* --- Secondary grid lines (behind main) --- */
  const secLineColor = hsl(chromaHue + 0.08, 50, 40, secondaryOpacity);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const [x1, y1] = secondaryPositions[r][c];
      const [x2, y2] = secondaryPositions[r][c + 1];
      elements.push(
        <line key={`sh-${r}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={secLineColor} strokeWidth="0.4" />,
      );
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const [x1, y1] = secondaryPositions[r][c];
      const [x2, y2] = secondaryPositions[r + 1][c];
      elements.push(
        <line key={`sv-${r}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={secLineColor} strokeWidth="0.4" />,
      );
    }
  }

  /* --- Main grid lines — gradient opacity (brighter near center) --- */
  const buildLineOpacity = (x1: number, y1: number, x2: number, y2: number): number => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dist = Math.sqrt((mx - CENTER_X) ** 2 + (my - CENTER_Y) ** 2);
    const normDist = dist / MAX_DIST;
    // Near center = brighter, edges = dimmer
    const proximityBoost = 1 - normDist * 0.7;
    return (0.15 + slowEnergy * 0.15 + energy * 0.1) * proximityBoost;
  };

  const mainLineColor = chromaHue + 0.15;

  // Horizontal lines
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const [x1, y1] = positions[r][c];
      const [x2, y2] = positions[r][c + 1];
      const lineOp = buildLineOpacity(x1, y1, x2, y2);
      elements.push(
        <line key={`h-${r}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={hsl(mainLineColor, 75, 55, lineOp)}
          strokeWidth={0.5 + energy * 0.4} />,
      );
    }
  }

  // Vertical lines
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const [x1, y1] = positions[r][c];
      const [x2, y2] = positions[r + 1][c];
      const lineOp = buildLineOpacity(x1, y1, x2, y2);
      elements.push(
        <line key={`v-${r}-${c}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={hsl(mainLineColor, 75, 55, lineOp)}
          strokeWidth={0.5 + energy * 0.4} />,
      );
    }
  }

  /* --- Concentric ripple rings emanating from warp center --- */
  for (let i = 0; i < NUM_RIPPLES; i++) {
    // Each ring expands outward, staggered in time
    const ripplePhase = ((drift * 2.5 + i / NUM_RIPPLES) % 1);
    const rippleRadius = ripplePhase * MAX_DIST * 0.9;
    // Fade in then out: peak at 30-50% expansion
    const rippleAlpha = interpolate(ripplePhase, [0, 0.15, 0.4, 0.85, 1], [0, 0.35, 0.25, 0.08, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * beatDecay * 1.8;

    if (rippleAlpha > 0.01 && rippleRadius > 2) {
      elements.push(
        <circle key={`ripple-${i}`}
          cx={CENTER_X} cy={CENTER_Y} r={rippleRadius}
          fill="none"
          stroke={hsl(chromaHue + 0.05, 80, 65, rippleAlpha)}
          strokeWidth={1 + beatDecay * 1.5}
        />,
      );
    }
  }

  /* --- Intersection dots: bright core + soft glow halo --- */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [px, py] = positions[r][c];
      const dx = px - CENTER_X;
      const dy = py - CENTER_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normDist = dist / MAX_DIST;

      /* Perspective depth: farther from center = smaller & dimmer */
      const depthScale = 1 - normDist * 0.55;
      const depthDim = 0.4 + (1 - normDist) * 0.6;

      const baseBrightness = interpolate(energy, [0.05, 0.5], [0.3, 0.95], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      const dotBrightness = baseBrightness * depthDim;

      /* Core radius pulses on beat */
      const coreRadius = (1.2 + beatDecay * 1.8) * depthScale;
      /* Halo radius responds to centroid (brightness) */
      const haloRadius = (3 + centroid * 4 + beatDecay * 2.5) * depthScale;
      const haloAlpha = dotBrightness * 0.25;

      /* Per-dot hue micro-variation based on grid position */
      const dotHue = chromaHue + (c * 0.008) + (r * 0.005);
      const dotLightness = 60 + beatDecay * 20;

      // Soft glow halo (rendered first, behind core)
      if (haloAlpha > 0.01) {
        elements.push(
          <circle key={`halo-${r}-${c}`}
            cx={px} cy={py} r={haloRadius}
            fill={hsl(dotHue, 70, dotLightness + 10, haloAlpha)}
            style={{ filter: "blur(2px)" }}
          />,
        );
      }

      // Bright core
      elements.push(
        <circle key={`core-${r}-${c}`}
          cx={px} cy={py} r={coreRadius}
          fill={hsl(dotHue, 85, dotLightness, dotBrightness)}
        />,
      );
    }
  }

  /* --- Center glow — gravitational singularity point --- */
  const centerGlowR = 8 + bass * 18 + beatDecay * 6;
  const centerGlowAlpha = 0.15 + bass * 0.3 + beatDecay * 0.15;
  elements.push(
    <circle key="center-glow"
      cx={CENTER_X} cy={CENTER_Y} r={centerGlowR}
      fill={hsl(chromaHue, 90, 75, centerGlowAlpha)}
      style={{ filter: `blur(${6 + bass * 10}px)` }}
    />,
  );

  /* --- Gentle overall rotation --- */
  const rotation = drift * 1.8;

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
          transform: `rotate(${rotation}deg)`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={width * 0.92}
          height={height * 0.92}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          fill="none"
          style={{ mixBlendMode: "screen" }}
        >
          {elements}
        </svg>
      </div>
    </div>
  );
};
