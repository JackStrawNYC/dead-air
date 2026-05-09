/**
 * AcidTestProjection — A+++ overlay simulating liquid-light-show
 * artifacts as if projected on a wall behind the band.
 *
 * Audit gap: "Acid Test Projection — Liquid light show: oil/water drops
 * under heat lamp, kaleidoscope wheels, color gels, strobes, projected
 * feedback loops."
 *
 * Different from oil_projector shader (planetarium dome of the projection
 * mechanism). This is the VIEW you'd see at an Acid Test — actual oil
 * drops + kaleidoscope folds + color-wheel rotation, layered atop any
 * shader output. Hand-painted feel: blobby color shapes, morphing edges,
 * layered transparencies.
 *
 * Audio reactivity:
 *   energy        → drop count + brightness
 *   bass          → drop merge (fewer, bigger blobs)
 *   beatSnap      → strobe flash (briefly desaturates frame)
 *   chromaHue     → color gel rotation
 *   harmonicTension → drop morph speed
 *   onsetEnvelope → feedback ring pulse
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── OIL DROP ────────────────────────────────────────────────────
// A morphing color blob with blurred edges

const OilDrop: React.FC<{
  cx: number;
  cy: number;
  baseR: number;
  morphPhase: number;   // 0..2pi shape morph
  driftAmt: number;     // 0..1 wobble
  hue: string;
  innerHue: string;
  alpha: number;
}> = ({ cx, cy, baseR, morphPhase, driftAmt, hue, innerHue, alpha }) => {
  // Asymmetric morph — radius varies around the blob's perimeter
  const segments = 16;
  const points: string[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const morphR = baseR * (1
      + Math.sin(a * 3 + morphPhase) * 0.18 * driftAmt
      + Math.cos(a * 5 + morphPhase * 1.3) * 0.10 * driftAmt
    );
    const px = cx + Math.cos(a) * morphR;
    const py = cy + Math.sin(a) * morphR;
    points.push(`${px},${py}`);
  }
  return (
    <g>
      {/* Outer soft glow */}
      <polygon points={points.join(" ")} fill={hue} opacity={alpha * 0.45} filter="url(#blur8)" />
      {/* Mid */}
      <polygon points={points.join(" ")} fill={hue} opacity={alpha * 0.7} filter="url(#blur4)" />
      {/* Inner hot core */}
      <circle cx={cx} cy={cy} r={baseR * 0.5} fill={innerHue} opacity={alpha * 0.85} filter="url(#blur2)" />
      <circle cx={cx} cy={cy} r={baseR * 0.2} fill="#ffffff" opacity={alpha * 0.6} />
    </g>
  );
};

// ─── COLOR-WHEEL GEL ─────────────────────────────────────────────
// Rotating multi-color halo

const ColorWheel: React.FC<{
  cx: number;
  cy: number;
  r: number;
  rotation: number;
  alpha: number;
}> = ({ cx, cy, r, rotation, alpha }) => {
  const sliceColors = ["#e34050", "#f5b020", "#30a050", "#5a98c0", "#9c5ac0", "#e08040"];
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotation})`} opacity={alpha}>
      {sliceColors.map((c, i) => {
        const a1 = (i / sliceColors.length) * Math.PI * 2;
        const a2 = ((i + 1) / sliceColors.length) * Math.PI * 2;
        const x1 = Math.cos(a1) * r;
        const y1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const y2 = Math.sin(a2) * r;
        const largeArc = a2 - a1 > Math.PI ? 1 : 0;
        return (
          <path
            key={i}
            d={`M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
            fill={c}
            opacity={0.65}
            filter="url(#blur4)"
          />
        );
      })}
      {/* Hub */}
      <circle cx={0} cy={0} r={r * 0.12} fill="#1a1a1a" />
    </g>
  );
};

// ─── KALEIDOSCOPE FOLD ───────────────────────────────────────────
// Triangular wedge mirrored 6-fold around center

const KaleidoFold: React.FC<{
  cx: number;
  cy: number;
  r: number;
  rotation: number;
  alpha: number;
  hueA: string;
  hueB: string;
}> = ({ cx, cy, r, rotation, alpha, hueA, hueB }) => {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotation})`} opacity={alpha}>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * 360;
        return (
          <g key={i} transform={`rotate(${a})`}>
            {/* Wedge — triangle from origin */}
            <path
              d={`M 0 0 L ${r * 0.95} ${-r * 0.18} L ${r * 0.7} ${r * 0.25} Z`}
              fill={i % 2 === 0 ? hueA : hueB}
              opacity={0.55}
              filter="url(#blur2)"
            />
            {/* Inner accent */}
            <circle cx={r * 0.55} cy={0} r={r * 0.12} fill="#ffffff" opacity={0.4} filter="url(#blur2)" />
          </g>
        );
      })}
    </g>
  );
};

// ─── FEEDBACK RING ───────────────────────────────────────────────
// Concentric rings simulating projector feedback loop

const FeedbackRings: React.FC<{
  cx: number;
  cy: number;
  rMax: number;
  pulse: number;       // 0..1 ring pulse on onset
  hue: string;
}> = ({ cx, cy, rMax, pulse, hue }) => {
  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const r = (i / 6) * rMax * (1 + pulse * 0.15);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={hue}
            strokeWidth={2}
            opacity={(0.45 - i * 0.05) * (0.5 + pulse * 0.5)}
            filter="url(#blur2)"
          />
        );
      })}
    </g>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const AcidTestProjection: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  const energy = Math.min(1, audio?.energy ?? 0);
  const bass = Math.min(1, audio?.bass ?? 0);
  const beatSnap = Math.min(1, audio?.drumOnset ?? 0);
  const onset = Math.min(1, audio?.onsetEnvelope ?? 0);
  const harmT = Math.min(1, audio?.harmonicTension ?? 0);
  const chromaHue = audio?.chromaHue ?? 0;

  // Strobe flash — fires briefly on big beat snaps
  const strobe = beatSnap > 0.6 ? Math.min(1, (beatSnap - 0.6) * 2.5) : 0;

  // Drop morph speed — bass drives it (more bass = slower / heavier drops)
  const morphPhase = frame * (0.04 + harmT * 0.08);

  // Color rotation
  const wheelRot = frame * 0.6;

  // 6 oil drops drifting around the frame
  const drops = [
    { x: width * 0.3, y: height * 0.35, baseR: 90, hue: "#e34050", inner: "#f5d030" },
    { x: width * 0.65, y: height * 0.55, baseR: 110, hue: "#5a98c0", inner: "#a0d8f0" },
    { x: width * 0.45, y: height * 0.7, baseR: 80, hue: "#9c5ac0", inner: "#f08aff" },
    { x: width * 0.78, y: height * 0.3, baseR: 75, hue: "#f5b020", inner: "#fef088" },
    { x: width * 0.22, y: height * 0.62, baseR: 100, hue: "#30c050", inner: "#a0f088" },
    { x: width * 0.55, y: height * 0.4, baseR: 65, hue: "#e08040", inner: "#fed098" },
  ];

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.30 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", mixBlendMode: "screen" }}>
        <defs>
          <filter id="blur8">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="blur4">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="blur2">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* Strobe flash — briefly whites out the frame on beat-snap peaks */}
        {strobe > 0.05 && (
          <rect x={0} y={0} width={width} height={height} fill="#ffffff" opacity={strobe * 0.45} />
        )}

        {/* Color wheels — 2 rotating gel disks at opposing positions */}
        <ColorWheel cx={width * 0.18} cy={height * 0.25} r={140} rotation={wheelRot} alpha={0.4 + energy * 0.3} />
        <ColorWheel cx={width * 0.82} cy={height * 0.75} r={120} rotation={-wheelRot * 1.2} alpha={0.4 + energy * 0.3} />

        {/* Kaleidoscope folds — 2 rotating in opposite directions */}
        <KaleidoFold
          cx={width * 0.5}
          cy={height * 0.5}
          r={Math.min(width, height) * 0.45}
          rotation={frame * 0.4}
          alpha={0.45 + energy * 0.35}
          hueA="#e34050"
          hueB="#5a98c0"
        />
        <KaleidoFold
          cx={width * 0.5}
          cy={height * 0.5}
          r={Math.min(width, height) * 0.32}
          rotation={-frame * 0.65}
          alpha={0.35 + energy * 0.3}
          hueA="#9c5ac0"
          hueB="#30a050"
        />

        {/* Feedback rings — pulse from center on onset */}
        <FeedbackRings
          cx={width * 0.5}
          cy={height * 0.5}
          rMax={Math.min(width, height) * 0.40}
          pulse={onset}
          hue="#f0e0a0"
        />

        {/* Oil drops — drift slightly with sin/cos */}
        {drops.map((d, i) => {
          const driftX = Math.sin(frame * 0.01 + i * 1.7) * 30;
          const driftY = Math.cos(frame * 0.012 + i * 1.3) * 22;
          // Bass merges drops — pull toward center
          const mergePullX = (width / 2 - d.x) * bass * 0.12;
          const mergePullY = (height / 2 - d.y) * bass * 0.12;
          return (
            <OilDrop
              key={i}
              cx={d.x + driftX + mergePullX}
              cy={d.y + driftY + mergePullY}
              baseR={d.baseR * (1 + bass * 0.12)}
              morphPhase={morphPhase + i}
              driftAmt={1.0}
              hue={d.hue}
              innerHue={d.inner}
              alpha={0.55 + energy * 0.25}
            />
          );
        })}

        {/* Vignette darkening — focuses attention center */}
        <radialGradient id="acidVignette" cx="0.5" cy="0.5" r="0.7">
          <stop offset="50%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
        </radialGradient>
        <rect x={0} y={0} width={width} height={height} fill="url(#acidVignette)" />
      </svg>
    </div>
  );
};
