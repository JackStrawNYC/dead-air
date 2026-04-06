/**
 * NeonDeadSign — "GRATEFUL DEAD" neon sign hanging on a dark wall.
 * Layer 7, tier B, tags: dead-culture, retro.
 *
 * A+++ quality neon sign overlay with full physical simulation:
 *
 *   Backing: Dark wood-textured rectangle with grain lines + knot details,
 *   beveled edges, Phillips-head mounting screws at all four corners.
 *
 *   Mount: Visible chain links from ceiling hooks to board top, with
 *   gentle pendulum sway synced to tempo.
 *
 *   Text: "GRATEFUL" (line 1) + "DEAD" (line 2) in authentic neon tube
 *   aesthetic. Each letter rendered as four SVG layers:
 *     1. Outer glow spread (blurred, saturated)
 *     2. Tube halo (wide stroke, mid-opacity)
 *     3. Main tube body (solid neon color)
 *     4. Inner bright core (near-white hot center)
 *
 *   Gas discharge: 60Hz sinusoidal buzz (2 cycles/frame at 30fps) with
 *   120Hz harmonic. Per-letter phase offset simulates tube differences.
 *
 *   Dying tubes: Seeded RNG picks ~1 letter per 12 seconds to dim to 15%
 *   over 8 frames, hold 4 frames, recover over 8 frames.
 *
 *   Indicator: "LIVE" box below the sign, blinking on a 60-frame cycle
 *   with its own gas buzz.
 *
 *   Wall glow: Radial gradient wash below the sign simulating light
 *   reflecting off the wall surface. Complement-colored secondary pool.
 *
 *   Audio mapping:
 *     - beatDecay -> tube brightness pulse
 *     - onsetEnvelope -> power surge (all tubes flare simultaneously)
 *     - chromaHue -> neon tube color (primary + complement for line 2)
 *     - energy -> overall sign brightness and glow radius
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

/** Convert HSL (h: 0-1, s: 0-1, l: 0-1) to hex string */
function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6) % 6;
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Neon tube color: high saturation, bright */
const neonColor = (h: number) => hslToHex(h, 0.95, 0.58);
/** Inner hot core: low saturation, near-white */
const coreColor = (h: number) => hslToHex(h, 0.3, 0.88);
/** Outer glow spread: high saturation, medium lightness */
const glowColor = (h: number) => hslToHex(h, 0.9, 0.45);

/* ------------------------------------------------------------------ */
/*  Gas discharge buzz                                                 */
/* ------------------------------------------------------------------ */

/**
 * Simulates 60Hz gas discharge oscillation. Returns brightness
 * multiplier in range ~0.90..1.00. Each letter gets a different
 * phase offset to simulate variations in tube pressure/length.
 */
function gasBuzz(frame: number, letterIndex: number): number {
  const phase = letterIndex * 0.47;
  const primary = Math.sin(frame * Math.PI * 4 + phase) * 0.04;
  const harmonic = Math.sin(frame * Math.PI * 8 + phase * 1.3) * 0.02;
  return 0.94 + primary + harmonic;
}

/* ------------------------------------------------------------------ */
/*  Dying tube effect                                                  */
/* ------------------------------------------------------------------ */

/**
 * One letter dims to 15% then recovers, ~1 per 12 one-second windows.
 * Fully deterministic via seeded PRNG.
 */
function tubeDying(frame: number, idx: number, total: number): number {
  const window = Math.floor(frame / 30);
  const rng = seeded(window * 97 + 5381);
  if (Math.floor(rng() * 12) !== 0) return 1.0;
  if (Math.floor(rng() * total) !== idx) return 1.0;
  const p = frame % 30;
  if (p < 8) return 1.0 - 0.85 * (p / 8);       // dim down
  if (p < 12) return 0.15;                        // hold dim
  if (p < 20) return 0.15 + 0.85 * ((p - 12) / 8); // recover
  return 1.0;
}

/* ------------------------------------------------------------------ */
/*  NeonLetter — four-layer tube rendering                             */
/* ------------------------------------------------------------------ */

const NeonLetter: React.FC<{
  char: string;
  x: number;
  y: number;
  fontSize: number;
  hue: number;
  frame: number;
  index: number;
  totalLetters: number;
  energy: number;
  beatDecay: number;
  onsetEnvelope: number;
}> = ({ char, x, y, fontSize, hue, frame, index, totalLetters,
        energy, beatDecay, onsetEnvelope }) => {
  const buzz = gasBuzz(frame, index);
  const dying = tubeDying(frame, index, totalLetters);
  const surge = 1.0 + onsetEnvelope * 0.35;
  const beatPulse = 1.0 + beatDecay * 0.15;
  const brightness = Math.min(buzz * dying * surge * beatPulse, 1.5);
  const opacity = Math.max(0, Math.min(1, (0.6 + energy * 0.4) * brightness));

  const tube = neonColor(hue);
  const hotCore = coreColor(hue);
  const outerGlow = glowColor(hue);
  const fp = {
    fontSize,
    fontFamily: "'Arial Black', 'Impact', sans-serif",
    fontWeight: "900" as const,
    textAnchor: "middle" as const,
  };

  return (
    <g opacity={opacity}>
      {/* L1: Outer glow — wide blurred saturated spread */}
      <text x={x} y={y} {...fp} fill={outerGlow} stroke={outerGlow}
        strokeWidth="8" opacity={0.2 * brightness}
        filter="url(#outerGlow)">{char}</text>
      {/* L2: Tube halo — wide stroke at mid opacity */}
      <text x={x} y={y} {...fp} fill="none" stroke={tube}
        strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
        opacity={0.5 * brightness}>{char}</text>
      {/* L3: Main tube body — solid neon */}
      <text x={x} y={y} {...fp} fill={tube} stroke={tube}
        strokeWidth="1.5" strokeLinecap="round"
        strokeLinejoin="round">{char}</text>
      {/* L4: Inner core — near-white hot center */}
      <text x={x} y={y} {...fp} fill={hotCore}
        opacity={0.7 * brightness}>{char}</text>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  LiveIndicator — blinking "LIVE" box                                */
/* ------------------------------------------------------------------ */

const LiveIndicator: React.FC<{
  cx: number; cy: number; frame: number; energy: number;
}> = ({ cx, cy, frame, energy }) => {
  const isOn = (frame % 60) < 42;
  const buzzMod = 0.95 + Math.sin(frame * Math.PI * 6) * 0.05;
  const op = isOn ? (0.7 + energy * 0.3) * buzzMod : 0.05;

  return (
    <g opacity={op}>
      <rect x={cx - 18} y={cy - 6} width="36" height="12" rx="2"
        fill="#ff3322" opacity="0.25" filter="url(#liveGlow)" />
      <rect x={cx - 16} y={cy - 5} width="32" height="10" rx="1.5"
        fill="none" stroke="#ff4433" strokeWidth="0.8" opacity="0.8" />
      <text x={cx} y={cy + 3.5} fontSize="7" fontWeight="900"
        fontFamily="'Arial Black', 'Impact', sans-serif"
        fill="#ff5544" textAnchor="middle" letterSpacing="1.5">LIVE</text>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  MountingScrew — Phillips head with shadow and bevel                */
/* ------------------------------------------------------------------ */

const MountingScrew: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <g>
    <circle cx={cx} cy={cy} r="4.5" fill="#0a0806" opacity="0.6" />
    <circle cx={cx} cy={cy} r="3.5" fill="#2a2220" />
    <circle cx={cx - 0.8} cy={cy - 0.8} r="2.8" fill="none"
      stroke="#4a3e38" strokeWidth="0.5" opacity="0.4" />
    <line x1={cx - 1.8} y1={cy} x2={cx + 1.8} y2={cy}
      stroke="#1a1412" strokeWidth="0.6" />
    <line x1={cx} y1={cy - 1.8} x2={cx} y2={cy + 1.8}
      stroke="#1a1412" strokeWidth="0.6" />
  </g>
);

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const NeonDeadSign: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const beatDecay = snap.beatDecay;
  const onsetEnvelope = snap.onsetEnvelope;
  const tempoFactor = useTempoFactor();

  // --- Audio-derived values ---
  const opacity = interpolate(energy, [0.02, 0.35], [0.15, 0.4], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const primaryHue = chromaHue;
  const compHue = (chromaHue + 0.5) % 1;
  const baseGlow = interpolate(energy, [0.05, 0.5], [4, 18], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const surgeGlow = baseGlow + onsetEnvelope * 12;
  const sway = interpolate(
    Math.sin(frame * 0.015 * tempoFactor), [-1, 1], [-1.2, 1.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const chainSway = Math.sin(frame * 0.015 * tempoFactor + 0.3) * 1.5;

  // --- Layout ---
  const VW = 360, VH = 160;
  const BX = 30, BY = 20, BW = 300, BH = 110;
  const CX = VW / 2;

  const L1 = "GRATEFUL", L2 = "DEAD";
  const TOTAL = L1.length + L2.length;
  const SP1 = 28, SP2 = 38, FS1 = 26, FS2 = 36;
  const Y1 = BY + 40, Y2 = BY + 80;
  const X1 = CX - ((L1.length - 1) * SP1) / 2;
  const X2 = CX - ((L2.length - 1) * SP2) / 2;

  const wallCol = neonColor(primaryHue);
  const wallOp = interpolate(energy, [0.05, 0.4], [0.03, 0.12], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }) + onsetEnvelope * 0.06;

  const svgW = Math.min(width * 0.48, 580);
  const svgH = svgW * ((VH + 30) / VW);
  const textFP = {
    fontFamily: "'Arial Black', 'Impact', sans-serif",
    fontWeight: "900" as const,
    textAnchor: "middle" as const,
  };

  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: height * 0.06,
    }}>
      <div style={{
        transform: `rotate(${sway}deg)`, opacity,
        willChange: "transform, opacity",
      }}>
        <svg width={svgW} height={svgH}
          viewBox={`0 0 ${VW} ${VH + 30}`} fill="none">
          <defs>
            {/* Wood grain SVG pattern */}
            <pattern id="woodGrain" patternUnits="userSpaceOnUse"
              width="200" height="200">
              <rect width="200" height="200" fill="#1a120a" />
              {Array.from({ length: 18 }, (_, i) => (
                <line key={i}
                  x1={0} y1={i * 11.5 + 2}
                  x2={180 + (i % 5) * 4}
                  y2={i * 11.5 + 2 + (i % 2 === 0 ? 0.8 : -0.5)}
                  stroke="#3a2a18"
                  strokeWidth={0.8 + (i % 3) * 0.4}
                  opacity={0.04 + (i % 3) * 0.02} />
              ))}
              <circle cx="140" cy="90" r="6" fill="none"
                stroke="#2a1c10" strokeWidth="0.5" opacity="0.06" />
              <circle cx="55" cy="150" r="4" fill="none"
                stroke="#2a1c10" strokeWidth="0.4" opacity="0.04" />
            </pattern>

            {/* SVG filters */}
            <filter id="outerGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic"
                stdDeviation={3 + surgeGlow * 0.2} />
            </filter>
            <filter id="neonBlur" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic"
                stdDeviation={2 + surgeGlow * 0.15} />
            </filter>
            <filter id="liveGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
            <filter id="boardShadow" x="-5%" y="-5%" width="115%" height="125%">
              <feDropShadow dx="3" dy="5" stdDeviation="4"
                floodColor="#000" floodOpacity="0.6" />
            </filter>
            <radialGradient id="wallGlow" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor={wallCol} stopOpacity={wallOp} />
              <stop offset="40%" stopColor={wallCol} stopOpacity={wallOp * 0.5} />
              <stop offset="100%" stopColor={wallCol} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ===== MOUNTING CHAINS ===== */}
          {[BX + 50, BX + BW - 50].map((anchor) => {
            const hookX = anchor + chainSway * 0.3;
            return (
              <React.Fragment key={`chain-${anchor}`}>
                <line x1={hookX} y1={2} x2={anchor} y2={BY + 2}
                  stroke="#4a4440" strokeWidth="1.2" opacity="0.6" />
                {[0, 1, 2, 3].map((j) => {
                  const t = (j + 0.5) / 4;
                  return (
                    <ellipse key={j}
                      cx={hookX + (anchor - hookX) * t}
                      cy={2 + t * BY}
                      rx="1.8" ry="2.5" fill="none"
                      stroke="#5a5550" strokeWidth="0.8" opacity="0.5" />
                  );
                })}
                <circle cx={hookX} cy={2} r="2"
                  fill="#3a3632" opacity="0.5" />
              </React.Fragment>
            );
          })}

          {/* ===== BACKING BOARD ===== */}
          <rect x={BX} y={BY} width={BW} height={BH} rx="3"
            fill="#1a120a" filter="url(#boardShadow)" />
          <rect x={BX} y={BY} width={BW} height={BH} rx="3"
            fill="url(#woodGrain)" />
          {/* Board edge bevels */}
          <line x1={BX + 3} y1={BY + 1} x2={BX + BW - 3} y2={BY + 1}
            stroke="#3a2e24" strokeWidth="0.8" opacity="0.3" />
          <line x1={BX + 3} y1={BY + BH - 1} x2={BX + BW - 3} y2={BY + BH - 1}
            stroke="#0a0604" strokeWidth="0.8" opacity="0.3" />
          <line x1={BX + 1} y1={BY + 3} x2={BX + 1} y2={BY + BH - 3}
            stroke="#0e0a06" strokeWidth="0.6" opacity="0.2" />
          <line x1={BX + BW - 1} y1={BY + 3} x2={BX + BW - 1} y2={BY + BH - 3}
            stroke="#2e2418" strokeWidth="0.6" opacity="0.15" />

          {/* ===== CORNER SCREWS ===== */}
          <MountingScrew cx={BX + 12} cy={BY + 12} />
          <MountingScrew cx={BX + BW - 12} cy={BY + 12} />
          <MountingScrew cx={BX + 12} cy={BY + BH - 12} />
          <MountingScrew cx={BX + BW - 12} cy={BY + BH - 12} />

          {/* ===== NEON BACKING GLOW ===== */}
          <g filter="url(#neonBlur)"
            opacity={0.3 + energy * 0.2 + onsetEnvelope * 0.15}>
            {L1.split("").map((ch, i) => (
              <text key={`bg1-${i}`} x={X1 + i * SP1} y={Y1}
                fontSize={FS1} {...textFP}
                fill={neonColor(primaryHue)}>{ch}</text>
            ))}
            {L2.split("").map((ch, i) => (
              <text key={`bg2-${i}`} x={X2 + i * SP2} y={Y2}
                fontSize={FS2} {...textFP}
                fill={neonColor(compHue)}>{ch}</text>
            ))}
          </g>

          {/* ===== TUBE MOUNTING CLIPS ===== */}
          {L1.split("").map((_, i) => i % 3 === 1 ? (
            <rect key={`clip1-${i}`}
              x={X1 + i * SP1 - 2} y={Y1 - FS1 * 0.6}
              width="4" height="3" rx="0.5"
              fill="#5a5248" opacity="0.25" />
          ) : null)}
          {L2.split("").map((_, i) => i % 2 === 0 ? (
            <rect key={`clip2-${i}`}
              x={X2 + i * SP2 - 2.5} y={Y2 - FS2 * 0.6}
              width="5" height="3.5" rx="0.5"
              fill="#5a5248" opacity="0.25" />
          ) : null)}

          {/* ===== NEON LETTERS: LINE 1 ===== */}
          {L1.split("").map((ch, i) => (
            <NeonLetter key={`n1-${i}`} char={ch}
              x={X1 + i * SP1} y={Y1} fontSize={FS1}
              hue={primaryHue} frame={frame} index={i}
              totalLetters={TOTAL} energy={energy}
              beatDecay={beatDecay} onsetEnvelope={onsetEnvelope} />
          ))}

          {/* ===== NEON LETTERS: LINE 2 ===== */}
          {L2.split("").map((ch, i) => (
            <NeonLetter key={`n2-${i}`} char={ch}
              x={X2 + i * SP2} y={Y2} fontSize={FS2}
              hue={compHue} frame={frame} index={i + L1.length}
              totalLetters={TOTAL} energy={energy}
              beatDecay={beatDecay} onsetEnvelope={onsetEnvelope} />
          ))}

          {/* ===== DECORATIVE NEON BORDER ===== */}
          <rect x={BX + 8} y={BY + 8} width={BW - 16} height={BH - 16}
            rx="2" fill="none" stroke={neonColor(primaryHue)} strokeWidth="1"
            opacity={(0.15 + energy * 0.15 + beatDecay * 0.05) * gasBuzz(frame, 99)} />
          <rect x={BX + 8} y={BY + 8} width={BW - 16} height={BH - 16}
            rx="2" fill="none" stroke={glowColor(primaryHue)} strokeWidth="3"
            opacity={0.06 + energy * 0.04} filter="url(#neonBlur)" />

          {/* ===== LIVE INDICATOR ===== */}
          <LiveIndicator cx={CX} cy={BY + BH + 12}
            frame={frame} energy={energy} />

          {/* ===== WALL-REFLECTED GLOW ===== */}
          <ellipse cx={CX} cy={BY + BH + 30}
            rx={BW * 0.55} ry="35" fill="url(#wallGlow)" />
          <ellipse cx={CX} cy={BY + BH + 15}
            rx={BW * 0.3} ry="14" fill={wallCol}
            opacity={wallOp * 0.4 + onsetEnvelope * 0.03} />
          <ellipse cx={CX + 15} cy={BY + BH + 25}
            rx={BW * 0.2} ry="10" fill={neonColor(compHue)}
            opacity={wallOp * 0.15} />
        </svg>
      </div>
    </div>
  );
};
