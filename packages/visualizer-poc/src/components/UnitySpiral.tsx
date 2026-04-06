/**
 * UnitySpiral — Sacred Fibonacci spiral of consciousness expansion.
 * Layer 2, tier B, tags: cosmic, dead-culture.
 *
 * Triple-arm golden spiral with traveling luminous dots, sacred geometry
 * overlay (inscribed pentagon/pentagram), center mandala with concentric
 * rings and radiating lines, and 32 golden-angle marker dots with
 * connecting filaments. Every element breathes with audio.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                     */
/* ------------------------------------------------------------------ */

/** HSL (h 0-1, s 0-1, l 0-1) to hex string */
function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const hex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Convenience: hue 0-1 to hex with default saturation/lightness */
function hueToHex(h: number, s = 0.85, l = 0.6): string {
  return hslToHex(h, s, l);
}

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = Math.PI * 2 / (PHI * PHI); // ~137.5 degrees
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/*  Spiral math                                                         */
/* ------------------------------------------------------------------ */

/** Point on a golden logarithmic spiral at parameter t */
function spiralPoint(t: number, scale: number): [number, number] {
  const a = 2;
  const r = a * Math.pow(PHI, t / TAU) * scale;
  return [r * Math.cos(t), r * Math.sin(t)];
}

/** Compute a smooth cubic-bezier SVG path along the spiral */
function buildSpiralPath(
  cx: number,
  cy: number,
  scale: number,
  maxT: number,
  steps: number,
): string {
  // Sample many points, then fit cubic bezier segments through every 3
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxT;
    const [sx, sy] = spiralPoint(t, scale);
    pts.push([cx + sx, cy + sy]);
  }

  // Build cubic bezier path using Catmull-Rom to Bezier conversion
  const d: string[] = [`M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`];

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length - 1, i + 1)];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom tangents scaled by 1/6 for smooth cubic Bezier
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`,
    );
  }

  return d.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Pentagon / Pentagram geometry                                       */
/* ------------------------------------------------------------------ */

function pentagonPoints(cx: number, cy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * TAU) / 5;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

function polygonPath(pts: [number, number][]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + " Z";
}

function pentagramPath(pts: [number, number][]): string {
  // Connect every other vertex: 0-2-4-1-3-0
  const order = [0, 2, 4, 1, 3];
  return order
    .map((idx, i) => `${i === 0 ? "M" : "L"} ${pts[idx][0].toFixed(2)} ${pts[idx][1].toFixed(2)}`)
    .join(" ") + " Z";
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const UnitySpiral: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const musicalTime = snap.musicalTime;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  /* ---- Interpolated parameters ---- */

  const opacity = interpolate(energy, [0.02, 0.35], [0.15, 0.45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const spiralScale = interpolate(slowEnergy, [0.02, 0.3], [0.55, 1.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bassGlow = interpolate(snap.bass, [0.05, 0.4], [2, 18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const breathScale = 1 + slowEnergy * 0.04 + Math.sin(frame * 0.015) * 0.01;
  const onsetPulse = 1 + snap.onsetEnvelope * 0.06;
  const rotation = (frame / 30) * 0.8 * tempoFactor;

  /* ---- Colors ---- */

  const warmHue = chromaHue;
  const coolHue = chromaHue + 0.45;
  const complementHue = chromaHue + 0.5;
  const accentHue = chromaHue + 0.2;

  const mainWarm = hueToHex(warmHue, 0.9, 0.55);
  const mainCool = hueToHex(coolHue, 0.8, 0.5);
  const secondaryColor = hueToHex(complementHue, 0.7, 0.55);
  const tertiaryColor = hueToHex(chromaHue + 0.15, 0.4, 0.65);
  const accentColor = hueToHex(accentHue, 0.85, 0.6);
  const centerColor = hueToHex(chromaHue + 0.1, 0.95, 0.7);

  /* ---- Geometry ---- */

  const size = Math.min(width, height) * 0.38;
  const cx = 100;
  const cy = 100;
  const totalTurns = 4.5;
  const maxT = totalTurns * TAU;
  const pathSteps = 160;
  const baseScale = spiralScale * 3;

  // Primary spiral path (smooth cubic bezier)
  const primaryPath = buildSpiralPath(cx, cy, baseScale, maxT, pathSteps);

  // Secondary spiral: offset by golden angle
  const secondaryPath = buildSpiralPath(cx, cy, baseScale * 0.97, maxT * 0.92, pathSteps);

  // Tertiary spiral: faint, slightly smaller
  const tertiaryPath = buildSpiralPath(cx, cy, baseScale * 0.93, maxT * 0.85, Math.floor(pathSteps * 0.8));

  /* ---- Gradient IDs ---- */
  const gradId = `spiral-grad-${frame % 2}`; // stable enough for SVG
  const glowId = `center-glow-${frame % 2}`;

  /* ---- Traveling dots (24 dots with glow halos) ---- */

  const dotCount = 24;
  const travelDots: React.ReactNode[] = [];

  for (let i = 0; i < dotCount; i++) {
    const phase = (i / dotCount) * maxT;
    // Musical time drives travel, inner dots faster (smaller phase = inner = faster multiplier)
    const speedMultiplier = 1.0 + (1.0 - i / dotCount) * 0.6;
    const travelT = ((phase + musicalTime * 0.8 * speedMultiplier) % maxT + maxT) % maxT;
    const [dx, dy] = spiralPoint(travelT, baseScale);
    const dotX = cx + dx;
    const dotY = cy + dy;

    const progress = travelT / maxT; // 0 = center, 1 = outer
    const baseDotR = 0.8 + progress * 1.4 + beatDecay * 0.6;
    const haloR = baseDotR * 3.0;
    // Brighter near center
    const dotBrightness = 0.8 - progress * 0.35 + energy * 0.25;
    const haloBrightness = 0.15 + (1.0 - progress) * 0.2 + beatDecay * 0.1;

    const dotHue = chromaHue + i * 0.03;
    const dotCol = hueToHex(dotHue, 0.9, 0.65);
    const haloCol = hueToHex(dotHue, 0.7, 0.5);

    travelDots.push(
      <React.Fragment key={`tdot-${i}`}>
        {/* Soft glow halo */}
        <circle
          cx={dotX}
          cy={dotY}
          r={haloR}
          fill={haloCol}
          opacity={haloBrightness}
          filter="url(#dotBlur)"
        />
        {/* Bright core */}
        <circle
          cx={dotX}
          cy={dotY}
          r={baseDotR}
          fill={dotCol}
          opacity={dotBrightness}
        />
      </React.Fragment>,
    );
  }

  /* ---- Golden ratio markers (32) with connecting lines ---- */

  const markerCount = 32;
  const markers: { x: number; y: number }[] = [];
  const markerNodes: React.ReactNode[] = [];
  const connectorNodes: React.ReactNode[] = [];

  for (let i = 0; i < markerCount; i++) {
    const t = i * GOLDEN_ANGLE * 1.9;
    if (t > maxT) break;
    const [mx, my] = spiralPoint(t, baseScale);
    const px = cx + mx;
    const py = cy + my;
    markers.push({ x: px, y: py });

    const markerPulse = 0.15 + slowEnergy * 0.2 + Math.sin(musicalTime * 0.5 + i * 0.3) * 0.08;

    markerNodes.push(
      <circle
        key={`mk-${i}`}
        cx={px}
        cy={py}
        r={0.9 + beatDecay * 0.4}
        fill={accentColor}
        opacity={markerPulse}
      />,
    );
  }

  // Subtle connecting lines between sequential markers
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i];
    const b = markers[i + 1];
    connectorNodes.push(
      <line
        key={`conn-${i}`}
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={accentColor}
        strokeWidth="0.25"
        opacity={0.06 + slowEnergy * 0.06}
      />,
    );
  }

  /* ---- Sacred geometry: pentagon + pentagram ---- */

  const pentaRadius = baseScale * 6.5;
  const pentaPts = pentagonPoints(cx, cy, pentaRadius);
  const pentaRotation = musicalTime * 0.3; // gentle rotation with music

  /* ---- Center mandala ---- */

  const centerOrbR = 3.5 + beatDecay * 3.0 + slowEnergy * 1.0;
  const ringRadii = [centerOrbR * 1.8, centerOrbR * 2.8, centerOrbR * 4.0];
  const radiatingLineCount = 12;

  const mandalaNodes: React.ReactNode[] = [];

  // Concentric rings
  ringRadii.forEach((r, idx) => {
    const ringOpacity = 0.08 + beatDecay * 0.12 - idx * 0.015;
    mandalaNodes.push(
      <circle
        key={`ring-${idx}`}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={centerColor}
        strokeWidth={0.5 - idx * 0.1}
        opacity={Math.max(0.03, ringOpacity)}
        strokeDasharray={idx === 2 ? "1.5 2" : undefined}
      />,
    );
  });

  // Radiating lines from center
  for (let i = 0; i < radiatingLineCount; i++) {
    const angle = (i / radiatingLineCount) * TAU + musicalTime * 0.15;
    const innerR = centerOrbR * 1.2;
    const outerR = ringRadii[2] * 1.1;
    const lineOpacity = 0.04 + beatDecay * 0.08 + Math.sin(musicalTime + i * 0.5) * 0.03;
    mandalaNodes.push(
      <line
        key={`radial-${i}`}
        x1={cx + innerR * Math.cos(angle)}
        y1={cy + innerR * Math.sin(angle)}
        x2={cx + outerR * Math.cos(angle)}
        y2={cy + outerR * Math.sin(angle)}
        stroke={centerColor}
        strokeWidth="0.3"
        opacity={Math.max(0.02, lineOpacity)}
      />,
    );
  }

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
          transform: `rotate(${rotation}deg) scale(${breathScale * onsetPulse})`,
          opacity,
          filter: `drop-shadow(0 0 ${bassGlow}px ${mainWarm})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          <defs>
            {/* Gradient along spiral: warm center to cool edge */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={mainWarm} />
              <stop offset="50%" stopColor={hueToHex(chromaHue + 0.2, 0.85, 0.55)} />
              <stop offset="100%" stopColor={mainCool} />
            </linearGradient>

            {/* Radial glow for center orb */}
            <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={centerColor} stopOpacity="0.95" />
              <stop offset="40%" stopColor={centerColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor={centerColor} stopOpacity="0" />
            </radialGradient>

            {/* Blur filter for dot halos */}
            <filter id="dotBlur" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.2" />
            </filter>

            {/* Glow filter for center mandala */}
            <filter id="centerGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.5" />
            </filter>
          </defs>

          {/* ---- Sacred geometry: pentagon + pentagram ---- */}
          <g
            transform={`rotate(${pentaRotation}, ${cx}, ${cy})`}
            opacity={0.04 + slowEnergy * 0.04}
          >
            <path
              d={polygonPath(pentaPts)}
              stroke={secondaryColor}
              strokeWidth="0.4"
              fill="none"
            />
            <path
              d={pentagramPath(pentaPts)}
              stroke={secondaryColor}
              strokeWidth="0.25"
              fill="none"
              strokeDasharray="2 3"
            />
          </g>

          {/* ---- Tertiary spiral (faintest, depth layer) ---- */}
          <g
            transform={`rotate(${137.5 * 2}, ${cx}, ${cy})`}
            opacity={0.06 + slowEnergy * 0.06}
          >
            <path
              d={tertiaryPath}
              stroke={tertiaryColor}
              strokeWidth="0.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>

          {/* ---- Secondary spiral (golden angle offset) ---- */}
          <g
            transform={`rotate(137.5, ${cx}, ${cy})`}
            opacity={0.12 + slowEnergy * 0.14}
          >
            <path
              d={secondaryPath}
              stroke={secondaryColor}
              strokeWidth="0.7"
              fill="none"
              strokeLinecap="round"
            />
          </g>

          {/* ---- Primary spiral (thick, gradient stroke) ---- */}
          <path
            d={primaryPath}
            stroke={`url(#${gradId})`}
            strokeWidth={1.6 + beatDecay * 0.5}
            fill="none"
            opacity={0.35 + slowEnergy * 0.35}
            strokeLinecap="round"
          />

          {/* ---- Marker connectors ---- */}
          {connectorNodes}

          {/* ---- Golden ratio markers ---- */}
          {markerNodes}

          {/* ---- Traveling dots with glow halos ---- */}
          {travelDots}

          {/* ---- Center mandala: radiating lines + rings ---- */}
          {mandalaNodes}

          {/* ---- Center mandala: glow orb (filtered) ---- */}
          <circle
            cx={cx}
            cy={cy}
            r={centerOrbR * 2.2}
            fill={`url(#${glowId})`}
            opacity={0.25 + beatDecay * 0.35}
            filter="url(#centerGlow)"
          />

          {/* ---- Center mandala: bright core orb ---- */}
          <circle
            cx={cx}
            cy={cy}
            r={centerOrbR}
            fill={centerColor}
            opacity={0.5 + beatDecay * 0.35 + energy * 0.15}
          />

          {/* ---- Center mandala: innermost highlight ---- */}
          <circle
            cx={cx}
            cy={cy}
            r={centerOrbR * 0.4}
            fill="#ffffff"
            opacity={0.15 + beatDecay * 0.25}
          />
        </svg>
      </div>
    </div>
  );
};
