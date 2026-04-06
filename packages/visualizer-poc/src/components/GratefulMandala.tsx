/**
 * GratefulMandala — sacred kaleidoscopic mandala with concentric rings of
 * Grateful Dead iconography. Layer 2, tier A, tags: dead-culture, psychedelic.
 *
 * Structure (outside → center):
 *   Ring 1 (outer): 8 mini stealies (skull dome + bolt outline) at cardinal/ordinal positions
 *   Ring 2: 8 decorative elements alternating roses & lightning bolts, thin connecting arcs
 *   Ring 3: ornamental dashed circle with dot markers and petal shapes
 *   Ring 4 (inner): 8-pointed star with radiating lines
 *   Center: detailed stealie (skull dome, glowing eye sockets, bolt)
 *
 * Each ring rotates at its own speed/direction. Breathing scale from slowEnergy.
 * beatDecay → eye glow, onsetEnvelope → bolt core flash, chromaHue → palette,
 * energy → opacity + glow intensity.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue to an HSL string with configurable saturation/lightness */
function hslFromHue(h: number, s = 0.85, l = 0.6): string {
  const hue = (((h % 1) + 1) % 1) * 360;
  return `hsl(${hue.toFixed(1)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%)`;
}

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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

/* ------------------------------------------------------------------ */
/*  Sub-components: mini stealie, rose, mini bolt, petal              */
/* ------------------------------------------------------------------ */

/** Mini stealie: skull dome outline + bolt through center */
const MiniStealie: React.FC<{
  cx: number;
  cy: number;
  r: number;
  skullColor: string;
  boltColor: string;
  skullOpacity: number;
  boltOpacity: number;
}> = ({ cx, cy, r, skullColor, boltColor, skullOpacity, boltOpacity }) => {
  const domeR = r * 0.85;
  const jawY = cy + r * 0.25;
  return (
    <g>
      {/* Skull dome */}
      <path
        d={`M ${cx - domeR} ${jawY}
            A ${domeR} ${domeR * 1.1} 0 1 1 ${cx + domeR} ${jawY}
            Q ${cx + domeR * 0.5} ${cy + r * 0.7} ${cx} ${cy + r * 0.8}
            Q ${cx - domeR * 0.5} ${cy + r * 0.7} ${cx - domeR} ${jawY} Z`}
        stroke={skullColor}
        strokeWidth="0.8"
        fill="none"
        opacity={skullOpacity}
      />
      {/* Eye sockets */}
      <ellipse
        cx={cx - r * 0.28}
        cy={cy - r * 0.05}
        rx={r * 0.15}
        ry={r * 0.12}
        stroke={skullColor}
        strokeWidth="0.5"
        fill="none"
        opacity={skullOpacity * 0.8}
      />
      <ellipse
        cx={cx + r * 0.28}
        cy={cy - r * 0.05}
        rx={r * 0.15}
        ry={r * 0.12}
        stroke={skullColor}
        strokeWidth="0.5"
        fill="none"
        opacity={skullOpacity * 0.8}
      />
      {/* Bolt through skull */}
      <polyline
        points={`${cx},${cy - r * 0.7} ${cx - r * 0.15},${cy} ${cx + r * 0.1},${cy + r * 0.05} ${cx - r * 0.05},${cy + r * 0.7}`}
        stroke={boltColor}
        strokeWidth="1.0"
        fill="none"
        strokeLinejoin="bevel"
        opacity={boltOpacity}
      />
    </g>
  );
};

/** Decorative rose (simplified 5-petal) */
const MiniRose: React.FC<{
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
}> = ({ cx, cy, r, color, opacity }) => {
  const petals: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * r * 0.55;
    const py = cy + Math.sin(angle) * r * 0.55;
    petals.push(
      <ellipse
        key={i}
        cx={px}
        cy={py}
        rx={r * 0.38}
        ry={r * 0.22}
        transform={`rotate(${(angle * 180) / Math.PI + 90}, ${px}, ${py})`}
        stroke={color}
        strokeWidth="0.6"
        fill="none"
        opacity={opacity * 0.7}
      />,
    );
  }
  return (
    <g>
      {petals}
      {/* Rose center */}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.15}
        fill={color}
        opacity={opacity * 0.5}
      />
    </g>
  );
};

/** Small lightning bolt icon */
const MiniBolt: React.FC<{
  cx: number;
  cy: number;
  h: number;
  color: string;
  opacity: number;
}> = ({ cx, cy, h, color, opacity }) => (
  <polyline
    points={`${cx + h * 0.08},${cy - h * 0.5} ${cx - h * 0.12},${cy + h * 0.05} ${cx + h * 0.08},${cy + h * 0.05} ${cx - h * 0.08},${cy + h * 0.5}`}
    stroke={color}
    strokeWidth="1.0"
    fill="none"
    strokeLinejoin="bevel"
    opacity={opacity}
  />
);

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GratefulMandala: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const beatDecay = snap.beatDecay;
  const onsetEnvelope = snap.onsetEnvelope;
  const tempoFactor = useTempoFactor();

  /* ---- derived values ---- */

  // Opacity: 0.25-0.65 (tier A — more prominent)
  const opacity = interpolate(energy, [0.02, 0.35], [0.25, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Breathing scale from slowEnergy
  const breathe = interpolate(slowEnergy, [0.02, 0.3], [0.88, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const onsetScale = 1 + onsetEnvelope * 0.04;

  // Bass glow
  const bassGlow = interpolate(snap.bass, [0.05, 0.4], [4, 28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eye glow driven by beatDecay
  const eyeGlow = interpolate(beatDecay, [0, 0.6], [0.15, 0.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bolt core flash driven by onsetEnvelope
  const boltFlash = interpolate(onsetEnvelope, [0, 0.5], [0.4, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arm extension: breathes with slowEnergy
  const armExtension = interpolate(slowEnergy, [0.02, 0.3], [0.75, 1.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Size
  const baseSize = Math.min(width, height) * 0.34;
  const size = baseSize * breathe;

  /* ---- per-ring rotations (degrees) ---- */
  const t = frame / 30; // seconds

  // Outer ring: slow CCW
  const outerRot = -t * 0.8 * tempoFactor;
  // 2nd ring: moderate CW
  const ring2Rot = t * 1.4 * tempoFactor;
  // 3rd ring (ornamental): very slow CCW
  const ring3Rot = -t * 0.5 * tempoFactor;
  // Inner star: slow CW
  const starRot = t * 1.0 * tempoFactor + beatDecay * 3;
  // Center stealie: very slow CW
  const centerRot = t * 0.3 * tempoFactor;

  /* ---- palette (chromaHue-driven) ---- */
  const mainColor = hueToHex(chromaHue);
  const secondColor = hueToHex(chromaHue + 0.12);
  const thirdColor = hueToHex(chromaHue + 0.25);
  const boltColor = hueToHex(chromaHue + 0.4);
  const roseColor = hueToHex(chromaHue + 0.55);
  const accentColor = hueToHex(chromaHue + 0.08);
  const mainHSL = hslFromHue(chromaHue, 0.85, 0.6);
  const glowHSL = hslFromHue(chromaHue + 0.12, 0.9, 0.65);

  /* ---- radii ---- */
  const CX = 100;
  const CY = 100;
  const outerR = 82 * armExtension;
  const ring2R = 60 * armExtension;
  const ring3R = 44 * armExtension;
  const starOuterR = 32 * armExtension;
  const starInnerR = 14;
  const centerStealieR = 12;

  const N = 8; // element count per ring

  /* ================================================================ */
  /*  Ring 1 (outer): 8 mini stealies                                 */
  /* ================================================================ */
  const outerElements: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    const sx = CX + Math.cos(angle) * outerR;
    const sy = CY + Math.sin(angle) * outerR;
    outerElements.push(
      <MiniStealie
        key={`outer-stealie-${i}`}
        cx={sx}
        cy={sy}
        r={7 + beatDecay * 1.5}
        skullColor={thirdColor}
        boltColor={boltColor}
        skullOpacity={0.45 + energy * 0.35}
        boltOpacity={boltFlash}
      />,
    );
  }

  // Thin connecting arcs between outer stealies
  const outerArcs: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * Math.PI * 2;
    const a2 = ((i + 1) / N) * Math.PI * 2;
    const midAngle = (a1 + a2) / 2;
    const arcR = outerR * 0.92;
    const x1 = CX + Math.cos(a1) * arcR;
    const y1 = CY + Math.sin(a1) * arcR;
    const x2 = CX + Math.cos(a2) * arcR;
    const y2 = CY + Math.sin(a2) * arcR;
    // Control point pushed inward slightly for curved arcs
    const cpR = arcR * 0.82;
    const cpx = CX + Math.cos(midAngle) * cpR;
    const cpy = CY + Math.sin(midAngle) * cpR;
    outerArcs.push(
      <path
        key={`outer-arc-${i}`}
        d={`M ${x1},${y1} Q ${cpx},${cpy} ${x2},${y2}`}
        stroke={accentColor}
        strokeWidth="0.5"
        fill="none"
        opacity={0.2 + slowEnergy * 0.15}
      />,
    );
  }

  // Dot chains along arc paths
  const dotChains: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * Math.PI * 2;
    const a2 = ((i + 1) / N) * Math.PI * 2;
    const dotCount = 5;
    for (let d = 1; d < dotCount; d++) {
      const t2 = d / dotCount;
      const angle = a1 + (a2 - a1) * t2;
      const dr = outerR * 0.92 - Math.sin(t2 * Math.PI) * outerR * 0.1;
      dotChains.push(
        <circle
          key={`dot-${i}-${d}`}
          cx={CX + Math.cos(angle) * dr}
          cy={CY + Math.sin(angle) * dr}
          r={0.8}
          fill={accentColor}
          opacity={0.25 + slowEnergy * 0.2}
        />,
      );
    }
  }

  /* ================================================================ */
  /*  Ring 2: alternating roses & mini bolts + connecting arcs         */
  /* ================================================================ */
  const ring2Elements: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    const ex = CX + Math.cos(angle) * ring2R;
    const ey = CY + Math.sin(angle) * ring2R;
    if (i % 2 === 0) {
      ring2Elements.push(
        <MiniRose
          key={`ring2-rose-${i}`}
          cx={ex}
          cy={ey}
          r={5.5 + slowEnergy * 2}
          color={roseColor}
          opacity={0.4 + energy * 0.3}
        />,
      );
    } else {
      ring2Elements.push(
        <MiniBolt
          key={`ring2-bolt-${i}`}
          cx={ex}
          cy={ey}
          h={9 + onsetEnvelope * 3}
          color={boltColor}
          opacity={boltFlash * 0.85}
        />,
      );
    }
  }

  // Thin arcs connecting ring 2 elements
  const ring2Arcs: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * Math.PI * 2;
    const a2 = ((i + 1) / N) * Math.PI * 2;
    const midA = (a1 + a2) / 2;
    const r = ring2R;
    const x1 = CX + Math.cos(a1) * r;
    const y1 = CY + Math.sin(a1) * r;
    const x2 = CX + Math.cos(a2) * r;
    const y2 = CY + Math.sin(a2) * r;
    const cpR2 = r * 0.85;
    const cpx2 = CX + Math.cos(midA) * cpR2;
    const cpy2 = CY + Math.sin(midA) * cpR2;
    ring2Arcs.push(
      <path
        key={`ring2-arc-${i}`}
        d={`M ${x1},${y1} Q ${cpx2},${cpy2} ${x2},${y2}`}
        stroke={secondColor}
        strokeWidth="0.4"
        fill="none"
        opacity={0.15 + slowEnergy * 0.15}
        strokeDasharray="2 2"
      />,
    );
  }

  /* ================================================================ */
  /*  Petal-like shapes between ring 2 and ring 3                     */
  /* ================================================================ */
  const petals: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const angle = ((i + 0.5) / N) * Math.PI * 2; // offset between elements
    const innerPt = ring3R + 2;
    const outerPt = ring2R - 3;
    const midR = (innerPt + outerPt) / 2;
    const spread = 0.12;

    const tipX = CX + Math.cos(angle) * outerPt;
    const tipY = CY + Math.sin(angle) * outerPt;
    const baseX = CX + Math.cos(angle) * innerPt;
    const baseY = CY + Math.sin(angle) * innerPt;
    const cp1x = CX + Math.cos(angle - spread) * midR;
    const cp1y = CY + Math.sin(angle - spread) * midR;
    const cp2x = CX + Math.cos(angle + spread) * midR;
    const cp2y = CY + Math.sin(angle + spread) * midR;

    petals.push(
      <path
        key={`petal-${i}`}
        d={`M ${baseX},${baseY} Q ${cp1x},${cp1y} ${tipX},${tipY} Q ${cp2x},${cp2y} ${baseX},${baseY} Z`}
        stroke={secondColor}
        strokeWidth="0.5"
        fill={secondColor}
        fillOpacity={0.06 + energy * 0.08}
        opacity={0.3 + slowEnergy * 0.25}
      />,
    );
  }

  /* ================================================================ */
  /*  Ring 3: ornamental dashed circle with dot markers               */
  /* ================================================================ */
  const ring3Dots: React.ReactNode[] = [];
  const dotCount3 = 32;
  for (let i = 0; i < dotCount3; i++) {
    const angle = (i / dotCount3) * Math.PI * 2;
    const isMarker = i % 4 === 0;
    ring3Dots.push(
      <circle
        key={`ring3-dot-${i}`}
        cx={CX + Math.cos(angle) * ring3R}
        cy={CY + Math.sin(angle) * ring3R}
        r={isMarker ? 1.2 : 0.6}
        fill={isMarker ? mainColor : accentColor}
        opacity={isMarker ? 0.5 + beatDecay * 0.3 : 0.25 + slowEnergy * 0.15}
      />,
    );
  }

  /* ================================================================ */
  /*  Ring 4 (inner): 8-pointed star with radiating lines             */
  /* ================================================================ */
  const starArms: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    const halfStep = Math.PI / N;

    // Outer tip
    const tipX = CX + Math.cos(angle) * starOuterR;
    const tipY = CY + Math.sin(angle) * starOuterR;
    // Inner notches
    const leftX = CX + Math.cos(angle - halfStep) * starInnerR;
    const leftY = CY + Math.sin(angle - halfStep) * starInnerR;
    const rightX = CX + Math.cos(angle + halfStep) * starInnerR;
    const rightY = CY + Math.sin(angle + halfStep) * starInnerR;

    const armColor = i % 2 === 0 ? mainColor : secondColor;

    starArms.push(
      <polygon
        key={`star-arm-${i}`}
        points={`${leftX},${leftY} ${tipX},${tipY} ${rightX},${rightY}`}
        fill={armColor}
        fillOpacity={0.12 + energy * 0.15}
        stroke={armColor}
        strokeWidth="0.8"
        opacity={0.35 + energy * 0.3}
      />,
    );

    // Radiating line extending from tip outward
    const lineEnd = starOuterR + 6;
    const leX = CX + Math.cos(angle) * lineEnd;
    const leY = CY + Math.sin(angle) * lineEnd;
    starArms.push(
      <line
        key={`radiate-${i}`}
        x1={tipX}
        y1={tipY}
        x2={leX}
        y2={leY}
        stroke={accentColor}
        strokeWidth="0.5"
        opacity={0.2 + beatDecay * 0.25}
      />,
    );
  }

  /* ================================================================ */
  /*  Center: detailed stealie                                         */
  /* ================================================================ */
  const csr = centerStealieR;

  // Skull dome path
  const skullDomeD = `
    M ${CX - csr * 0.7} ${CY + csr * 0.15}
    A ${csr * 0.8} ${csr * 0.9} 0 1 1 ${CX + csr * 0.7} ${CY + csr * 0.15}
    Q ${CX + csr * 0.4} ${CY + csr * 0.65} ${CX} ${CY + csr * 0.75}
    Q ${CX - csr * 0.4} ${CY + csr * 0.65} ${CX - csr * 0.7} ${CY + csr * 0.15}
    Z
  `;

  // Eye socket positions
  const eyeLX = CX - csr * 0.28;
  const eyeRX = CX + csr * 0.28;
  const eyeY = CY - csr * 0.05;
  const eyeRx = csr * 0.15;
  const eyeRy = csr * 0.12;

  // Center bolt (13-point zigzag)
  const boltTop = CY - csr * 0.75;
  const boltBot = CY + csr * 0.75;
  const centerBoltD = `
    M ${CX} ${boltTop}
    L ${CX + csr * 0.15} ${CY - csr * 0.2}
    L ${CX - csr * 0.08} ${CY - csr * 0.15}
    L ${CX + csr * 0.1} ${CY + csr * 0.1}
    L ${CX - csr * 0.12} ${CY + csr * 0.15}
    L ${CX} ${boltBot}
  `;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

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
          transform: `scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${bassGlow}px ${mainHSL}) drop-shadow(0 0 ${bassGlow * 1.4}px ${glowHSL})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
          <defs>
            {/* Eye glow filter */}
            <filter id="mandala-eye-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={1.5 + beatDecay * 3} />
            </filter>
            {/* Center radial glow */}
            <radialGradient id="mandala-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={mainColor} stopOpacity={0.2 + energy * 0.25} />
              <stop offset="100%" stopColor={mainColor} stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* ---- Ring 1 (outer): stealies + arcs + dots ---- */}
          <g transform={`rotate(${outerRot}, ${CX}, ${CY})`}>
            {outerArcs}
            {dotChains}
            {outerElements}
          </g>

          {/* ---- Ring 2: roses & bolts + arcs ---- */}
          <g transform={`rotate(${ring2Rot}, ${CX}, ${CY})`}>
            {ring2Arcs}
            {ring2Elements}
          </g>

          {/* ---- Petals between rings 2 & 3 ---- */}
          <g transform={`rotate(${ring2Rot * 0.5}, ${CX}, ${CY})`}>
            {petals}
          </g>

          {/* ---- Ring 3: ornamental dashed circle + dots ---- */}
          <g transform={`rotate(${ring3Rot}, ${CX}, ${CY})`}>
            <circle
              cx={CX}
              cy={CY}
              r={ring3R}
              stroke={mainColor}
              strokeWidth="0.6"
              fill="none"
              opacity={0.2 + slowEnergy * 0.2}
              strokeDasharray="3 2 1 2"
            />
            {ring3Dots}
          </g>

          {/* ---- Ring 4 (inner): 8-pointed star + radiating lines ---- */}
          <g transform={`rotate(${starRot}, ${CX}, ${CY})`}>
            {starArms}
            {/* Inner boundary ring around the star */}
            <circle
              cx={CX}
              cy={CY}
              r={starOuterR + 3}
              stroke={secondColor}
              strokeWidth="0.6"
              fill="none"
              opacity={0.2 + beatDecay * 0.2}
            />
          </g>

          {/* ---- Center stealie ---- */}
          <g transform={`rotate(${centerRot}, ${CX}, ${CY})`}>
            {/* Ambient glow behind skull */}
            <circle
              cx={CX}
              cy={CY}
              r={csr * 1.2}
              fill="url(#mandala-center-glow)"
            />

            {/* Skull dome outline */}
            <path
              d={skullDomeD}
              stroke={mainColor}
              strokeWidth="1.0"
              fill="none"
              opacity={0.55 + energy * 0.3}
            />

            {/* Nose hint */}
            <line
              x1={CX}
              y1={CY + csr * 0.1}
              x2={CX}
              y2={CY + csr * 0.3}
              stroke={mainColor}
              strokeWidth="0.5"
              opacity={0.3 + energy * 0.2}
            />

            {/* Eye socket glow layers (behind the outlines) */}
            <ellipse
              cx={eyeLX}
              cy={eyeY}
              rx={eyeRx * 1.8}
              ry={eyeRy * 1.8}
              fill={boltColor}
              opacity={eyeGlow * 0.35}
              filter="url(#mandala-eye-glow)"
            />
            <ellipse
              cx={eyeRX}
              cy={eyeY}
              rx={eyeRx * 1.8}
              ry={eyeRy * 1.8}
              fill={boltColor}
              opacity={eyeGlow * 0.35}
              filter="url(#mandala-eye-glow)"
            />

            {/* Eye socket outlines */}
            <ellipse
              cx={eyeLX}
              cy={eyeY}
              rx={eyeRx}
              ry={eyeRy}
              stroke={thirdColor}
              strokeWidth="0.7"
              fill={boltColor}
              fillOpacity={eyeGlow * 0.3}
              opacity={0.6 + beatDecay * 0.3}
            />
            <ellipse
              cx={eyeRX}
              cy={eyeY}
              rx={eyeRx}
              ry={eyeRy}
              stroke={thirdColor}
              strokeWidth="0.7"
              fill={boltColor}
              fillOpacity={eyeGlow * 0.3}
              opacity={0.6 + beatDecay * 0.3}
            />

            {/* Center bolt */}
            <path
              d={centerBoltD}
              stroke={boltColor}
              strokeWidth="1.2"
              fill="none"
              strokeLinejoin="bevel"
              opacity={boltFlash}
            />
            {/* Bolt core (bright on onset) */}
            <path
              d={centerBoltD}
              stroke="#ffffff"
              strokeWidth="0.5"
              fill="none"
              strokeLinejoin="bevel"
              opacity={onsetEnvelope * 0.6}
            />
          </g>

          {/* ---- Outermost boundary ring ---- */}
          <circle
            cx={CX}
            cy={CY}
            r={outerR + 8}
            stroke={mainColor}
            strokeWidth="1.2"
            fill="none"
            opacity={0.18 + beatDecay * 0.18}
          />
          {/* Second outer boundary (wider, fainter) */}
          <circle
            cx={CX}
            cy={CY}
            r={outerR + 12}
            stroke={accentColor}
            strokeWidth="0.5"
            fill="none"
            opacity={0.1 + slowEnergy * 0.1}
            strokeDasharray="1 3"
          />
        </svg>
      </div>
    </div>
  );
};
