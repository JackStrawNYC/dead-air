/**
 * PhilLesh — Layer 6 (Character)
 * A+++ bassist portrait: Phil Lesh with his iconic Alembic bass.
 * Detailed silhouette with glasses, clothing folds, finger positions,
 * full Alembic double-cutaway bass, 4 vibrating strings driven by bass
 * frequency, spotlight rim lighting, neon glow, stage floor reflection.
 * Tier A | Tags: dead-culture, organic | dutyCycle: 100 | energyBand: mid
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color Utilities                                                    */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue to an HSL string with configurable saturation and lightness */
function hsl(h: number, s = 0.7, l = 0.6, a = 1): string {
  const hDeg = (((h % 1) + 1) % 1) * 360;
  return `hsla(${hDeg.toFixed(1)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;
}

/** Map 0-1 hue to hex color */
function hueToHex(h: number): string {
  const s = 0.85;
  const l = 0.6;
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
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ------------------------------------------------------------------ */
/*  String Vibration Config (4 bass strings: G, D, A, E)               */
/* ------------------------------------------------------------------ */

const NUM_STRINGS = 4;
const STRING_SPACING = 5;

interface Props {
  frames: EnhancedFrameData[];
}

export const PhilLesh: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const {
    energy,
    bass: bassEnergy,
    chromaHue: chromaHueDeg,
    beatDecay,
    onsetEnvelope,
  } = snap;

  const chromaHue = chromaHueDeg / 360;

  /* ---------------------------------------------------------------- */
  /*  Visibility & Energy Gating                                       */
  /* ---------------------------------------------------------------- */

  const energyGate = interpolate(energy, [0.05, 0.12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bassBoost = interpolate(bassEnergy, [0.05, 0.35], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = energyGate * (0.55 + bassBoost);
  if (opacity < 0.01) return null;

  /* ---------------------------------------------------------------- */
  /*  Animation Parameters                                             */
  /* ---------------------------------------------------------------- */

  // Gentle body sway — bassist groove
  const sway = Math.sin(frame * 0.02 * tempoFactor) * 2.5 * (0.5 + bassEnergy * 0.5);
  const headTilt = Math.sin(frame * 0.015 * tempoFactor + 0.5) * 1.5;

  // Bass pulse: body breathes with low end
  const bassPulse = interpolate(bassEnergy, [0.0, 0.4], [1.0, 1.03], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Rim light intensity pulses with beat
  const rimIntensity = interpolate(beatDecay, [0, 1], [0.15, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Onset flash for spotlight flare
  const onsetFlash = onsetEnvelope * 0.4;

  // String vibration amplitude — bass frequencies are THE driver here
  const vibAmp = interpolate(bassEnergy, [0.02, 0.45], [0.3, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow radius from energy
  const glowRadius = interpolate(energy, [0.05, 0.35], [3, 14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) + onsetEnvelope * 10;

  /* ---------------------------------------------------------------- */
  /*  Colors                                                           */
  /* ---------------------------------------------------------------- */

  const primaryHue = chromaHue;
  const glowColor = hueToHex(primaryHue + 0.05);
  const rimColor = hsl(primaryHue + 0.08, 0.8, 0.65, rimIntensity + onsetFlash);
  const neonColor = hsl(primaryHue, 0.9, 0.7, 0.6 + beatDecay * 0.3);
  const bodyFill = hsl(primaryHue + 0.55, 0.15, 0.12, 0.85);
  const clothingFill = hsl(primaryHue + 0.55, 0.12, 0.15, 0.7);
  const skinTone = hsl(0.08, 0.25, 0.35, 0.65);
  const bassFill = hsl(primaryHue + 0.1, 0.5, 0.3, 0.7);
  const bassStroke = hsl(primaryHue + 0.1, 0.6, 0.5, 0.8);
  const stringColor = hsl(primaryHue + 0.15, 0.85, 0.7, 0.7 + bassEnergy * 0.3);
  const floorColor = hsl(primaryHue + 0.05, 0.4, 0.2, 0.15 + bassEnergy * 0.1);
  const spotlightColor = hsl(primaryHue + 0.03, 0.6, 0.7, 0.08 + onsetFlash * 0.12);

  /* ---------------------------------------------------------------- */
  /*  Bass String Paths (4 strings: G D A E)                           */
  /* ---------------------------------------------------------------- */

  // Strings run along the bass neck from bridge (~x=165) to nut (~x=70)
  const stringPaths = Array.from({ length: NUM_STRINGS }, (_, si) => {
    const baseY = 188 + si * STRING_SPACING;
    const freq = 2.5 + si * 0.8; // lower strings = lower frequency
    const amp = vibAmp * (1 + si * 0.25); // lower strings vibrate more
    const thickness = 0.6 + si * 0.25; // E string thickest
    const points: string[] = [];
    // From bridge to nut
    for (let x = 70; x <= 165; x += 1.5) {
      const t = (x - 70) / 95; // 0 to 1 along string
      // Vibration envelope: zero at endpoints, max in center
      const env = Math.sin(t * Math.PI);
      const dy = Math.sin(frame * 0.25 * freq * tempoFactor + x * 0.06 + si * 1.7) * amp * env;
      points.push(`${x},${baseY + dy}`);
    }
    return { points: points.join(" "), thickness };
  });

  /* ---------------------------------------------------------------- */
  /*  Bass Note Rings (radiating from bass body)                       */
  /* ---------------------------------------------------------------- */

  const rings = Array.from({ length: 5 }, (_, i) => {
    const age = ((frame - i * 18) % 100) / 100;
    const r = 15 + age * 80 * (0.3 + bassEnergy * 0.7);
    const ringOpacity = (1 - age * age) * 0.2 * bassEnergy;
    return { r, opacity: ringOpacity, age };
  });

  /* ---------------------------------------------------------------- */
  /*  Layout                                                           */
  /* ---------------------------------------------------------------- */

  const svgW = width;
  const svgH = height;
  // Phil positioned stage-left (viewer's left), lower portion
  const cx = width * 0.22;
  const cy = height * 0.58;
  const figureScale = Math.min(width, height) * 0.0032 * bassPulse;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={svgW}
        height={svgH}
        style={{ opacity, mixBlendMode: "screen" }}
        viewBox={`0 0 ${svgW} ${svgH}`}
      >
        <defs>
          {/* Spotlight gradient from above */}
          <radialGradient id="phil-spotlight" cx="50%" cy="0%" r="75%">
            <stop offset="0%" stopColor={spotlightColor} />
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Rim light gradient */}
          <radialGradient id="phil-rim" cx="30%" cy="20%" r="80%">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="70%" stopColor={rimColor} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Neon glow filter */}
          <filter id="phil-neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius * 0.6} result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius * 0.2} result="blur2" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="blur2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft glow for strings */}
          <filter id="phil-string-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={1.5 + bassEnergy * 3} result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Reflection gradient (for stage floor) */}
          <linearGradient id="phil-reflect-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ============================================================ */}
        {/*  SPOTLIGHT CONE                                               */}
        {/* ============================================================ */}
        <ellipse
          cx={cx}
          cy={cy - 40}
          rx={120 * figureScale}
          ry={180 * figureScale}
          fill={spotlightColor}
          opacity={0.3 + onsetFlash * 0.3}
        />

        {/* ============================================================ */}
        {/*  BASS NOTE RINGS                                              */}
        {/* ============================================================ */}
        {rings.map((ring, i) =>
          ring.opacity > 0.005 ? (
            <circle
              key={`ring-${i}`}
              cx={cx - 30 * figureScale}
              cy={cy + 10 * figureScale}
              r={ring.r * figureScale}
              fill="none"
              stroke={hsl(primaryHue + 0.02 * i, 0.6, 0.55, ring.opacity)}
              strokeWidth={1.2}
            />
          ) : null
        )}

        {/* ============================================================ */}
        {/*  MAIN FIGURE GROUP                                            */}
        {/* ============================================================ */}
        <g transform={`translate(${cx + sway}, ${cy}) scale(${figureScale})`}>

          {/* ------ STAGE FLOOR REFLECTION (flipped, faded) ------ */}
          <g transform="translate(0, 95) scale(1, -0.35)" opacity={0.12 + bassEnergy * 0.08}>
            {/* Reflected torso */}
            <path
              d="M -22,0 C -28,-25 -30,-55 -25,-80 L 25,-80 C 30,-55 28,-25 22,0 Z"
              fill={floorColor}
            />
            {/* Reflected head */}
            <circle cx={0} cy={-92} r={14} fill={floorColor} />
          </g>

          {/* ------ STAGE FLOOR LINE ------ */}
          <line
            x1={-80} y1={92} x2={80} y2={92}
            stroke={floorColor}
            strokeWidth={1}
            opacity={0.3}
          />
          {/* Floor highlight */}
          <ellipse
            cx={0} cy={94}
            rx={60} ry={4}
            fill={floorColor}
            opacity={0.2 + bassEnergy * 0.15}
          />

          {/* ------ LEGS ------ */}
          {/* Left leg */}
          <path
            d="M -10,45 L -14,85 C -14,88 -16,90 -18,90 L -8,90 C -6,90 -6,88 -7,85 Z"
            fill={bodyFill}
          />
          {/* Right leg */}
          <path
            d="M 10,45 L 13,85 C 13,88 15,90 17,90 L 7,90 C 5,90 5,88 6,85 Z"
            fill={bodyFill}
          />
          {/* Shoe details */}
          <ellipse cx={-13} cy={90} rx={7} ry={2.5} fill={bodyFill} />
          <ellipse cx={12} cy={90} rx={7} ry={2.5} fill={bodyFill} />

          {/* ------ TORSO ------ */}
          <path
            d="M -22,0 C -28,-8 -30,-20 -28,-35
               C -26,-50 -24,-60 -20,-70
               L 20,-70
               C 24,-60 26,-50 28,-35
               C 30,-20 28,-8 22,0
               Z"
            fill={bodyFill}
          />

          {/* Clothing fold lines — subtle horizontal creases */}
          {[-55, -40, -25, -10, 5, 20, 35].map((fy, i) => (
            <line
              key={`fold-${i}`}
              x1={-18 + i * 0.5}
              y1={fy}
              x2={18 - i * 0.5}
              y2={fy + Math.sin(i * 1.3) * 1.5}
              stroke={clothingFill}
              strokeWidth={0.5}
              opacity={0.25 + Math.sin(frame * 0.01 + i) * 0.05}
            />
          ))}

          {/* Shirt collar / neckline */}
          <path
            d="M -10,-68 C -5,-72 5,-72 10,-68"
            fill="none"
            stroke={clothingFill}
            strokeWidth={1}
          />

          {/* ------ SHOULDERS ------ */}
          <path
            d="M -20,-70 C -30,-72 -38,-68 -42,-60"
            fill="none"
            stroke={bodyFill}
            strokeWidth={8}
            strokeLinecap="round"
          />
          <path
            d="M 20,-70 C 30,-72 38,-68 42,-60"
            fill="none"
            stroke={bodyFill}
            strokeWidth={8}
            strokeLinecap="round"
          />

          {/* ------ NECK ------ */}
          <rect x={-6} y={-82} width={12} height={14} rx={3} fill={skinTone} />

          {/* ------ HEAD ------ */}
          <g transform={`rotate(${headTilt}, 0, -92)`}>
            {/* Head shape */}
            <ellipse cx={0} cy={-96} rx={14} ry={16} fill={skinTone} />

            {/* Hair suggestion — Phil's receding/thinning hair */}
            <path
              d="M -13,-103 C -14,-112 -8,-116 0,-117
                 C 8,-116 14,-112 13,-103"
              fill="none"
              stroke={hsl(0.08, 0.1, 0.3, 0.5)}
              strokeWidth={2.5}
            />
            {/* Side hair wisps */}
            <path
              d="M -14,-98 C -17,-100 -17,-105 -14,-107"
              fill="none"
              stroke={hsl(0.08, 0.1, 0.3, 0.35)}
              strokeWidth={1.5}
            />
            <path
              d="M 14,-98 C 17,-100 17,-105 14,-107"
              fill="none"
              stroke={hsl(0.08, 0.1, 0.3, 0.35)}
              strokeWidth={1.5}
            />

            {/* ------ GLASSES (Phil's iconic look) ------ */}
            {/* Left lens */}
            <rect
              x={-12} y={-100} width={10} height={8} rx={2}
              fill="none"
              stroke={hsl(0.6, 0.2, 0.5, 0.7)}
              strokeWidth={0.8}
            />
            {/* Right lens */}
            <rect
              x={2} y={-100} width={10} height={8} rx={2}
              fill="none"
              stroke={hsl(0.6, 0.2, 0.5, 0.7)}
              strokeWidth={0.8}
            />
            {/* Bridge between lenses */}
            <line
              x1={-2} y1={-96} x2={2} y2={-96}
              stroke={hsl(0.6, 0.2, 0.5, 0.6)}
              strokeWidth={0.6}
            />
            {/* Temple arms */}
            <line x1={-12} y1={-97} x2={-15} y2={-96} stroke={hsl(0.6, 0.2, 0.5, 0.5)} strokeWidth={0.5} />
            <line x1={12} y1={-97} x2={15} y2={-96} stroke={hsl(0.6, 0.2, 0.5, 0.5)} strokeWidth={0.5} />

            {/* Lens glint — subtle light reflection */}
            <circle cx={-5} cy={-98} r={1} fill="white" opacity={0.15 + onsetFlash * 0.2} />
            <circle cx={9} cy={-98} r={1} fill="white" opacity={0.12 + onsetFlash * 0.15} />

            {/* Nose hint */}
            <path
              d="M 0,-95 C 1,-92 2,-90 0,-88"
              fill="none"
              stroke={skinTone}
              strokeWidth={0.6}
              opacity={0.4}
            />

            {/* Mouth — slight concentrated expression */}
            <path
              d="M -4,-86 C -2,-85 2,-85 4,-86"
              fill="none"
              stroke={skinTone}
              strokeWidth={0.5}
              opacity={0.3}
            />

            {/* Ear hint (right side) */}
            <path
              d="M 14,-98 C 16,-97 17,-94 15,-92"
              fill="none"
              stroke={skinTone}
              strokeWidth={0.6}
              opacity={0.3}
            />
          </g>

          {/* ------ LEFT ARM (on fretboard) ------ */}
          {/* Upper arm */}
          <path
            d="M -38,-60 C -42,-50 -48,-40 -55,-30"
            fill="none"
            stroke={bodyFill}
            strokeWidth={7}
            strokeLinecap="round"
          />
          {/* Forearm reaching to fretboard */}
          <path
            d="M -55,-30 C -60,-22 -65,-15 -68,-5"
            fill="none"
            stroke={bodyFill}
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Left hand on fretboard */}
          <g transform="translate(-68, -2)">
            {/* Palm */}
            <ellipse cx={0} cy={0} rx={4} ry={5} fill={skinTone} />
            {/* Fingers pressing frets — 4 fingers curved over neck */}
            <path d="M -2,-4 C -3,-8 -2,-11 -1,-12" fill="none" stroke={skinTone} strokeWidth={1.5} strokeLinecap="round" />
            <path d="M 0,-4 C 0,-9 1,-12 1,-13" fill="none" stroke={skinTone} strokeWidth={1.5} strokeLinecap="round" />
            <path d="M 2,-4 C 3,-9 3,-12 3,-13" fill="none" stroke={skinTone} strokeWidth={1.5} strokeLinecap="round" />
            <path d="M 3,-3 C 5,-7 5,-10 5,-11" fill="none" stroke={skinTone} strokeWidth={1.3} strokeLinecap="round" />
            {/* Thumb behind neck */}
            <path d="M -3,2 C -5,4 -6,3 -5,1" fill="none" stroke={skinTone} strokeWidth={1.5} strokeLinecap="round" />
          </g>

          {/* ------ RIGHT ARM (plucking near bridge) ------ */}
          {/* Upper arm */}
          <path
            d="M 38,-60 C 40,-48 38,-38 32,-28"
            fill="none"
            stroke={bodyFill}
            strokeWidth={7}
            strokeLinecap="round"
          />
          {/* Forearm angled down to bass body */}
          <path
            d="M 32,-28 C 28,-18 22,-8 18,5"
            fill="none"
            stroke={bodyFill}
            strokeWidth={6}
            strokeLinecap="round"
          />
          {/* Right hand — plucking position near bridge/pickups */}
          <g transform="translate(16, 8)">
            {/* Palm resting on bass body */}
            <ellipse cx={0} cy={0} rx={4.5} ry={4} fill={skinTone} />
            {/* Index and middle fingers extended for plucking */}
            {/* They oscillate slightly with beat for realism */}
            <path
              d={`M -1,-3 C -2,-7 ${-1 + Math.sin(frame * 0.15 * tempoFactor) * bassEnergy * 1.5},-9 ${-1 + Math.sin(frame * 0.15 * tempoFactor) * bassEnergy},-10`}
              fill="none"
              stroke={skinTone}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            <path
              d={`M 1,-3 C 1,-7 ${2 + Math.sin(frame * 0.15 * tempoFactor + 1) * bassEnergy * 1.5},-9 ${2 + Math.sin(frame * 0.15 * tempoFactor + 1) * bassEnergy},-10`}
              fill="none"
              stroke={skinTone}
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            {/* Ring and pinky curled */}
            <path d="M 3,-2 C 4,-4 4,-5 3,-5" fill="none" stroke={skinTone} strokeWidth={1.2} strokeLinecap="round" />
            <path d="M 4,-1 C 5,-2 5,-3 4,-3" fill="none" stroke={skinTone} strokeWidth={1} strokeLinecap="round" />
            {/* Thumb anchored on pickup */}
            <path d="M -3,1 C -5,2 -7,2 -8,1" fill="none" stroke={skinTone} strokeWidth={1.5} strokeLinecap="round" />
          </g>

          {/* ====================================================== */}
          {/*  ALEMBIC BASS GUITAR                                     */}
          {/* ====================================================== */}
          <g transform="translate(-20, -10) rotate(-25, 0, 0)">
            {/* --- Bass body: Alembic double-cutaway (longer upper horn) --- */}
            <path
              d={[
                "M 50,175",          // start at upper horn tip
                "C 35,178 20,185 15,195",  // upper horn curve down
                "C 10,208 12,220 20,228",  // upper bout
                "C 28,235 40,240 55,242",  // bottom curve
                "C 65,243 75,240 82,235",  // lower bout right
                "C 88,228 90,218 88,210",  // waist curve
                "C 86,202 88,195 92,190",  // lower cutaway
                "C 88,182 80,175 70,173",  // upper cutaway
                "C 62,172 55,173 50,175",  // back to start
                "Z",
              ].join(" ")}
              fill={bassFill}
              stroke={bassStroke}
              strokeWidth={1.2}
            />

            {/* Body edge highlight — rim light effect */}
            <path
              d={[
                "M 50,175",
                "C 35,178 20,185 15,195",
                "C 10,208 12,220 20,228",
                "C 28,235 40,240 55,242",
              ].join(" ")}
              fill="none"
              stroke={rimColor}
              strokeWidth={0.8}
              opacity={0.5 + beatDecay * 0.3}
            />

            {/* --- Neck pickup --- */}
            <rect x={55} y={185} width={22} height={5} rx={1.5}
              fill={hsl(primaryHue + 0.1, 0.3, 0.22, 0.8)}
              stroke={bassStroke} strokeWidth={0.4}
            />
            {/* Pickup pole pieces */}
            {[0, 1, 2, 3].map((pp) => (
              <circle key={`npp-${pp}`} cx={59 + pp * 5} cy={187.5} r={0.8}
                fill={hsl(0, 0, 0.5, 0.5)} />
            ))}

            {/* --- Bridge pickup --- */}
            <rect x={55} y={198} width={22} height={5} rx={1.5}
              fill={hsl(primaryHue + 0.1, 0.3, 0.22, 0.8)}
              stroke={bassStroke} strokeWidth={0.4}
            />
            {/* Pickup pole pieces */}
            {[0, 1, 2, 3].map((pp) => (
              <circle key={`bpp-${pp}`} cx={59 + pp * 5} cy={200.5} r={0.8}
                fill={hsl(0, 0, 0.5, 0.5)} />
            ))}

            {/* --- Bridge --- */}
            <rect x={50} y={208} width={28} height={6} rx={1}
              fill={hsl(0.1, 0.15, 0.35, 0.7)}
              stroke={bassStroke} strokeWidth={0.4}
            />
            {/* Bridge saddles (4) */}
            {[0, 1, 2, 3].map((bs) => (
              <rect key={`bs-${bs}`} x={54 + bs * 6} y={209} width={3} height={4} rx={0.5}
                fill={hsl(0.1, 0.1, 0.45, 0.6)} />
            ))}

            {/* --- Tailpiece --- */}
            <rect x={52} y={216} width={24} height={3} rx={1}
              fill={hsl(0.1, 0.15, 0.3, 0.5)} />

            {/* --- Control knobs (Alembic has several) --- */}
            <circle cx={38} cy={218} r={3} fill={hsl(0.1, 0.15, 0.3, 0.5)} stroke={bassStroke} strokeWidth={0.3} />
            <circle cx={38} cy={228} r={3} fill={hsl(0.1, 0.15, 0.3, 0.5)} stroke={bassStroke} strokeWidth={0.3} />
            <circle cx={30} cy={223} r={2.5} fill={hsl(0.1, 0.15, 0.3, 0.4)} stroke={bassStroke} strokeWidth={0.3} />

            {/* --- Neck --- */}
            <rect x={70} y={181} width={100} height={18} rx={2}
              fill={hsl(0.08, 0.4, 0.25, 0.7)}
              stroke={bassStroke} strokeWidth={0.6}
            />

            {/* Fretboard (darker inlay) */}
            <rect x={72} y={183} width={96} height={14} rx={1}
              fill={hsl(0.08, 0.2, 0.15, 0.6)}
            />

            {/* Frets */}
            {[82, 92, 101, 109, 116, 123, 129, 135, 140, 145, 149, 153].map((fx, i) => (
              <line key={`fret-${i}`}
                x1={fx} y1={183} x2={fx} y2={197}
                stroke={hsl(0.1, 0.15, 0.55, 0.35)}
                strokeWidth={0.5}
              />
            ))}

            {/* Fret markers (dots) — positions 3, 5, 7, 9, 12 */}
            {[97, 113, 126, 138, 151].map((fx, i) => (
              <circle key={`fmark-${i}`}
                cx={fx} cy={190} r={i === 4 ? 0 : 1.2}
                fill={hsl(0.1, 0.1, 0.5, 0.35)}
              />
            ))}
            {/* Double dot at 12th fret */}
            <circle cx={151} cy={187} r={1} fill={hsl(0.1, 0.1, 0.5, 0.35)} />
            <circle cx={151} cy={193} r={1} fill={hsl(0.1, 0.1, 0.5, 0.35)} />

            {/* --- Headstock (Alembic distinctive pointed shape) --- */}
            <path
              d={[
                "M 170,180",
                "L 185,174",
                "C 192,172 196,174 195,180",
                "L 195,200",
                "C 196,206 192,208 185,206",
                "L 170,200",
                "Z",
              ].join(" ")}
              fill={hsl(0.08, 0.4, 0.25, 0.7)}
              stroke={bassStroke}
              strokeWidth={0.8}
            />

            {/* Alembic logo suggestion (tiny omega-like curve) */}
            <path
              d="M 180,188 C 178,186 180,184 183,184 C 186,184 188,186 186,188"
              fill="none"
              stroke={hsl(primaryHue, 0.5, 0.55, 0.3)}
              strokeWidth={0.5}
            />

            {/* Tuning machines (4 — 2 per side) */}
            <circle cx={190} cy={178} r={2.2} fill={hsl(0.1, 0.1, 0.4, 0.6)} stroke={bassStroke} strokeWidth={0.3} />
            <circle cx={190} cy={184} r={2.2} fill={hsl(0.1, 0.1, 0.4, 0.6)} stroke={bassStroke} strokeWidth={0.3} />
            <circle cx={190} cy={196} r={2.2} fill={hsl(0.1, 0.1, 0.4, 0.6)} stroke={bassStroke} strokeWidth={0.3} />
            <circle cx={190} cy={202} r={2.2} fill={hsl(0.1, 0.1, 0.4, 0.6)} stroke={bassStroke} strokeWidth={0.3} />

            {/* Tuning peg arms */}
            <line x1={192} y1={178} x2={197} y2={178} stroke={hsl(0.1, 0.1, 0.4, 0.5)} strokeWidth={1} />
            <line x1={192} y1={184} x2={197} y2={184} stroke={hsl(0.1, 0.1, 0.4, 0.5)} strokeWidth={1} />
            <line x1={192} y1={196} x2={197} y2={196} stroke={hsl(0.1, 0.1, 0.4, 0.5)} strokeWidth={1} />
            <line x1={192} y1={202} x2={197} y2={202} stroke={hsl(0.1, 0.1, 0.4, 0.5)} strokeWidth={1} />

            {/* --- Nut --- */}
            <rect x={168} y={182} width={2} height={16} rx={0.5}
              fill={hsl(0.12, 0.1, 0.7, 0.5)} />

            {/* ====================================================== */}
            {/*  VIBRATING STRINGS (4 bass strings)                     */}
            {/* ====================================================== */}
            {stringPaths.map((sp, si) => (
              <polyline
                key={`str-${si}`}
                points={sp.points}
                stroke={stringColor}
                strokeWidth={sp.thickness}
                fill="none"
                filter="url(#phil-string-glow)"
              />
            ))}

            {/* --- Strap button (top) --- */}
            <circle cx={50} cy={174} r={1.5}
              fill={hsl(0.1, 0.1, 0.4, 0.5)} />
            {/* --- Strap button (bottom) --- */}
            <circle cx={62} cy={243} r={1.5}
              fill={hsl(0.1, 0.1, 0.4, 0.5)} />
          </g>

          {/* ------ BASS STRAP (visible across chest) ------ */}
          <path
            d="M -15,-68 C -5,-55 5,-45 15,-35"
            fill="none"
            stroke={hsl(0.08, 0.2, 0.2, 0.4)}
            strokeWidth={3.5}
            strokeLinecap="round"
          />

          {/* ====================================================== */}
          {/*  NEON GLOW OUTLINE (around full figure)                  */}
          {/* ====================================================== */}
          <g filter="url(#phil-neon-glow)" opacity={0.3 + beatDecay * 0.25}>
            {/* Neon silhouette trace */}
            <path
              d={[
                "M 0,-112",                          // top of head
                "C -16,-112 -16,-80 -16,-80",        // left head
                "L -22,-70",                          // left shoulder
                "C -40,-72 -44,-60 -44,-58",          // shoulder curve
                "L -30,-20",                          // left torso
                "C -32,-5 -28,10 -24,45",             // hip
                "L -18,90",                           // left leg
                "L -8,90",                            // foot
                "L -7,45",                            // inner leg
                "L 6,45",                             // crotch
                "L 7,90",                             // right leg inner
                "L 17,90",                            // right foot
                "L 13,45",                            // right leg
                "C 28,10 32,-5 30,-20",               // right hip
                "L 44,-58",                           // right torso
                "C 44,-60 40,-72 22,-70",             // right shoulder
                "L 16,-80",                           // right neck
                "C 16,-80 16,-112 0,-112",            // right head back to top
                "Z",
              ].join(" ")}
              fill="none"
              stroke={neonColor}
              strokeWidth={1.2}
            />
          </g>

          {/* ====================================================== */}
          {/*  RIM LIGHT (edge lighting from back/side)                */}
          {/* ====================================================== */}
          <g opacity={rimIntensity}>
            {/* Left edge highlight */}
            <path
              d="M -16,-110 C -18,-100 -22,-72 -30,-55 C -38,-40 -32,-10 -28,20 C -26,40 -18,70 -18,88"
              fill="none"
              stroke={rimColor}
              strokeWidth={1.5}
              opacity={0.6}
            />
            {/* Right edge highlight (dimmer — light from left) */}
            <path
              d="M 16,-110 C 18,-100 22,-72 30,-55 C 36,-42 32,-10 28,20"
              fill="none"
              stroke={rimColor}
              strokeWidth={0.8}
              opacity={0.3}
            />
          </g>
        </g>

        {/* ============================================================ */}
        {/*  STAGE FLOOR AMBIENT GLOW                                     */}
        {/* ============================================================ */}
        <ellipse
          cx={cx}
          cy={cy + 95 * figureScale}
          rx={70 * figureScale}
          ry={8 * figureScale}
          fill={glowColor}
          opacity={0.06 + bassEnergy * 0.08}
        />
      </svg>
    </div>
  );
};
