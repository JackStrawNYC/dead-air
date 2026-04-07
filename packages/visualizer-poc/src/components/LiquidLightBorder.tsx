/**
 * LiquidLightBorder — A+++ 60s-acid-test liquid light projector frame.
 *
 * Wraps the entire frame with a thick rainbow border of organic oil-projector
 * blobs (like Joshua Light Show / Headlights at the Fillmore). All four edges
 * are populated with 5-10 blobs each in distinct colors, drifting and morphing
 * slowly. The blobs use bezier-morphed outlines, concentric color rings, and
 * specular bevel highlights.
 *
 * Audio mapping:
 *   energy      → blob brightness + saturation
 *   slowEnergy  → morph rate (slow at quiet, faster when loud)
 *   beatDecay   → per-blob beat pulse
 *   bass        → blob expansion
 *   chromaHue   → palette rotation
 *   tempoFactor → drift speed
 *
 * Cycle: 50s visible per 80s.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 1500;
const BORDER_FRAC = 0.13;     // 13% of min dimension
const BLOBS_HORIZ = 9;
const BLOBS_VERT = 6;
const CONTROL_POINTS = 10;
const RING_COUNT = 4;

type Edge = "top" | "bottom" | "left" | "right";

interface BlobSpec {
  alongFrac: number;
  acrossFrac: number;
  baseHue: number;
  radius: number;        // fraction of border thickness
  morphPhases: number[];
  morphFreqs: number[];
  morphAmps: number[];
  driftFreq: number;
  driftPhase: number;
  driftAmp: number;
  lifePeriod: number;
  lifeOffset: number;
  beatGain: number;
  bevelAngle: number;
}

const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function generateEdgeBlobs(seed: number, count: number, edge: Edge): BlobSpec[] {
  const rng = seeded(seed);
  // Distribute hues across the rainbow per edge with offset
  const hueBase = edge === "top" ? 0 : edge === "right" ? 90 : edge === "bottom" ? 180 : 270;
  return Array.from({ length: count }, (_, i) => {
    const slot = (i + 0.5) / count;
    const jitter = (rng() - 0.5) * (0.6 / count);
    const morphPhases: number[] = [];
    const morphFreqs: number[] = [];
    const morphAmps: number[] = [];
    for (let p = 0; p < CONTROL_POINTS; p++) {
      morphPhases.push(rng() * Math.PI * 2);
      morphFreqs.push(0.014 + rng() * 0.022);
      morphAmps.push(0.18 + rng() * 0.32);
    }
    return {
      alongFrac: Math.max(0.04, Math.min(0.96, slot + jitter)),
      acrossFrac: 0.40 + rng() * 0.20,
      baseHue: (hueBase + i * (360 / count) + rng() * 30) % 360,
      radius: 0.85 + rng() * 0.55,
      morphPhases,
      morphFreqs,
      morphAmps,
      driftFreq: 0.0014 + rng() * 0.0030,
      driftPhase: rng() * Math.PI * 2,
      driftAmp: 0.04 + rng() * 0.08,
      lifePeriod: 360 + rng() * 540,
      lifeOffset: rng() * 1200,
      beatGain: 0.4 + rng() * 0.8,
      bevelAngle: rng() * Math.PI * 2,
    };
  });
}

function buildBlobPath(
  cx: number,
  cy: number,
  baseRadius: number,
  blob: BlobSpec,
  morphTime: number,
  bassBoost: number,
): string {
  const pts: { x: number; y: number }[] = [];
  for (let p = 0; p < CONTROL_POINTS; p++) {
    const ang = (p / CONTROL_POINTS) * Math.PI * 2;
    const wob =
      Math.sin(morphTime * blob.morphFreqs[p] + blob.morphPhases[p]) * blob.morphAmps[p] +
      Math.sin(morphTime * blob.morphFreqs[p] * 1.7 + blob.morphPhases[p] * 1.3) * blob.morphAmps[p] * 0.4;
    const r = baseRadius * (1 + wob + bassBoost * 0.18);
    pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
  }
  // Closed Catmull-Rom-style smooth path
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} `;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return d + "Z";
}

interface Props { frames: EnhancedFrameData[]; }

export const LiquidLightBorder: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.06], [0, 1], CL);
  const fadeOut = interpolate(progress, [0.93, 1], [1, 0], CL);
  const cycleOp = Math.min(fadeIn, fadeOut);
  if (cycleOp < 0.01) return null;

  const { energy, slowEnergy, beatDecay, chromaHue, bass } = snap;
  const energyOp = interpolate(energy, [0.0, 0.32], [0.55, 0.92], CL);
  const masterOp = energyOp * cycleOp;

  const morphRate = 0.6 + slowEnergy * 1.4;
  const driftTime = frame * tempoFactor;
  const morphTime = frame * morphRate;
  const bassPulse = interpolate(bass, [0, 0.6], [0, 0.45], CL);
  const baseHue = ((chromaHue % 360) + 360) % 360;

  const thickness = Math.round(Math.min(width, height) * BORDER_FRAC);

  // Pre-generate blob specs per edge
  const blobsTop = React.useMemo(() => generateEdgeBlobs(0xa11, BLOBS_HORIZ, "top"), []);
  const blobsBottom = React.useMemo(() => generateEdgeBlobs(0xb22, BLOBS_HORIZ, "bottom"), []);
  const blobsLeft = React.useMemo(() => generateEdgeBlobs(0xc33, BLOBS_VERT, "left"), []);
  const blobsRight = React.useMemo(() => generateEdgeBlobs(0xd44, BLOBS_VERT, "right"), []);

  function renderBlob(blob: BlobSpec, edge: Edge, idx: number): React.ReactNode {
    let cx: number;
    let cy: number;
    const driftAlong = Math.sin(driftTime * blob.driftFreq + blob.driftPhase) * blob.driftAmp;
    const driftAcross = Math.cos(driftTime * blob.driftFreq * 1.3 + blob.driftPhase * 1.7) * blob.driftAmp * 0.5;
    const along = Math.max(-0.04, Math.min(1.04, blob.alongFrac + driftAlong));
    const acrossPos = Math.max(0.20, Math.min(0.80, blob.acrossFrac + driftAcross));

    if (edge === "top") {
      cx = along * width;
      cy = acrossPos * thickness;
    } else if (edge === "bottom") {
      cx = along * width;
      cy = height - thickness + acrossPos * thickness;
    } else if (edge === "left") {
      cx = acrossPos * thickness;
      cy = along * height;
    } else {
      cx = width - thickness + acrossPos * thickness;
      cy = along * height;
    }

    // Birth/death cycle
    const lifePhase = ((frame + blob.lifeOffset) % blob.lifePeriod) / blob.lifePeriod;
    const lifeEnv = Math.sin(lifePhase * Math.PI);
    const lifeOp = Math.max(0.20, lifeEnv * 0.85 + 0.15);

    const beatBoost = beatDecay * blob.beatGain;
    const baseRadius = thickness * blob.radius * (0.85 + lifeEnv * 0.22) * (1 + beatBoost * 0.20);

    // Concentric rings
    const rings: React.ReactNode[] = [];
    for (let r = 0; r < RING_COUNT; r++) {
      const t = r / (RING_COUNT - 1);
      const ringRadius = baseRadius * (1 - t * 0.55);
      const ringPath = buildBlobPath(cx, cy, ringRadius, blob, morphTime + r * 9, bassPulse);
      const hue = (blob.baseHue + baseHue * 0.5 - 180 + (1 - t) * 60) % 360;
      const sat = 80 + 15 * Math.sin(t * Math.PI);
      const light = 42 + t * 38 + beatBoost * 10;
      const alpha = (0.35 + t * 0.45) * (0.85 + energy * 0.30);
      rings.push(
        <path key={`b-${edge}-${idx}-r${r}`}
          d={ringPath}
          fill={`hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, ${alpha.toFixed(3)})`}
          opacity={lifeOp}
          filter={r === 0 ? "url(#llb-halo)" : "url(#llb-soft)"} />,
      );
    }

    // Bevel highlight
    const bevelR = baseRadius * 0.62;
    const bevelOff = baseRadius * 0.32;
    const bevelCx = cx + Math.cos(blob.bevelAngle) * bevelOff;
    const bevelCy = cy + Math.sin(blob.bevelAngle) * bevelOff;

    return (
      <g key={`g-${edge}-${idx}`}>
        {rings}
        <ellipse cx={bevelCx} cy={bevelCy}
          rx={bevelR * 0.85} ry={bevelR * 0.55}
          fill="url(#llb-bevel)"
          opacity={lifeOp * (0.45 + beatBoost * 0.40)}
          transform={`rotate(${(blob.bevelAngle * 180) / Math.PI} ${bevelCx} ${bevelCy})`} />
        <circle cx={bevelCx - bevelR * 0.18} cy={bevelCy - bevelR * 0.22}
          r={Math.max(1.4, bevelR * 0.10)}
          fill={`hsla(${(blob.baseHue + 60) % 360}, 30%, 96%, ${0.85 * lifeOp})`} />
      </g>
    );
  }

  // Inner rectangle to mask the center (so border doesn't bleed inward visually)
  const inset = thickness * 0.92;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        opacity: masterOp,
        mixBlendMode: "screen",
      }}
    >
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="llb-halo" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="llb-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <filter id="llb-glint" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <radialGradient id="llb-bevel" cx="35%" cy="30%" r="55%">
            <stop offset="0%" stopColor="hsla(0, 0%, 100%, 0.85)" />
            <stop offset="40%" stopColor="hsla(0, 0%, 100%, 0.18)" />
            <stop offset="100%" stopColor="hsla(0, 0%, 100%, 0)" />
          </radialGradient>
          {/* Mask: white border, black inner area */}
          <mask id="llb-border-mask">
            <rect x={0} y={0} width={width} height={height} fill="white" />
            <rect x={inset} y={inset} width={width - inset * 2} height={height - inset * 2}
              fill="black" rx={thickness * 0.1} ry={thickness * 0.1} />
          </mask>
        </defs>

        {/* Soft background tint inside the border strip */}
        <g mask="url(#llb-border-mask)">
          <rect x={0} y={0} width={width} height={height}
            fill={`hsla(${(baseHue + 200) % 360}, 35%, 14%, 0.40)`} />

          {/* Top edge */}
          {blobsTop.map((b, i) => renderBlob(b, "top", i))}
          {/* Bottom edge */}
          {blobsBottom.map((b, i) => renderBlob(b, "bottom", i))}
          {/* Left edge */}
          {blobsLeft.map((b, i) => renderBlob(b, "left", i))}
          {/* Right edge */}
          {blobsRight.map((b, i) => renderBlob(b, "right", i))}

          {/* Bass-driven rim flash */}
          {bassPulse > 0.18 && (
            <rect x={0} y={0} width={width} height={height}
              fill={`hsla(${(baseHue + 40) % 360}, 60%, 80%, ${(bassPulse * 0.22).toFixed(3)})`} />
          )}
        </g>
      </svg>
    </div>
  );
};
