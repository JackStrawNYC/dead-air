/**
 * UncleSam — Uncle Sam skeleton pointing at camera ("I WANT YOU… to follow the Dead").
 *
 * A+++ richly detailed SVG skeleton figure in full Uncle Sam regalia:
 *   - Skull with cranium sutures, deep eye sockets with inner glow, cheekbones,
 *     nasal cavity, defined jaw, 10 individual teeth
 *   - Tall top hat with brim, hat band, 3 SVG polygon stars, red/white stripes
 *   - Vertebral spine (7 segments), 4-pair rib cage with sternum, pelvis
 *   - Arms with humerus, radius/ulna, wrist bones — right arm POINTING with
 *     prominent extended index finger (3 bone segments), other fingers curled
 *   - Legs with femur, knee joint, tibia/fibula, foot bones, boot detail
 *   - Ghostly dashed coat tails suggesting the Uncle Sam suit
 *   - Triple-layer neon glow with chromaHue-driven dynamic color
 *
 * Dramatic entrance: zoom from 0.3x → 1.2x, hold, breathe with energy.
 * Audio: energy gates (>0.2), chromaHue drives glow, onsetEnvelope adds flash,
 *        beatDecay pulses eye glow, peakApproaching for early activation.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

// ── Timing ──────────────────────────────────────────────────────────
const APPEAR_DURATION = 180; // 6s zoom-in
const APPEAR_HOLD = 180; // 6s hold at full presence
const APPEAR_CYCLE = APPEAR_DURATION + APPEAR_HOLD;

// ── Palettes ────────────────────────────────────────────────────────
const NEON_PALETTES = [
  { primary: "#FF1744", accent: "#00E5FF", hat: "#651FFF", stars: "#FFD700", stripe: "#FF8A80" },
  { primary: "#FF00FF", accent: "#76FF03", hat: "#FF1493", stars: "#00FFFF", stripe: "#FF80AB" },
  { primary: "#FF4500", accent: "#ADFF2F", hat: "#DA70D6", stars: "#FFD700", stripe: "#FFAB91" },
  { primary: "#00FF7F", accent: "#FF69B4", hat: "#00CED1", stars: "#FFEA00", stripe: "#B9F6CA" },
];

// ── SVG Helper: 5-pointed star polygon ──────────────────────────────
function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 2) * -1 + (Math.PI / 5) * i;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

// ═══════════════════════════════════════════════════════════════════
//  UncleSamSkeleton — richly detailed SVG
// ═══════════════════════════════════════════════════════════════════

const UncleSamSkeleton: React.FC<{
  size: number;
  primary: string;
  accent: string;
  hatColor: string;
  starColor: string;
  stripeColor: string;
  eyeGlow: number; // 0–1, driven by beatDecay
  onsetFlash: number; // 0–1, driven by onsetEnvelope
}> = ({ size, primary, accent, hatColor, starColor, stripeColor, eyeGlow, onsetFlash }) => {
  const eyeBright = 0.5 + eyeGlow * 0.5;
  const flashBoost = 1 + onsetFlash * 0.4;

  return (
    <svg
      width={size}
      height={size * 1.6}
      viewBox="0 0 160 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ═══ TOP HAT ═══ */}
      {/* Hat body — tall cylinder */}
      <rect x="48" y="2" width="54" height="48" rx="4" fill={hatColor} opacity="0.85" />
      {/* Hat top highlight */}
      <rect x="52" y="4" width="46" height="4" rx="2" fill="white" opacity="0.08" />
      {/* Hat brim — wide ellipse */}
      <ellipse cx="75" cy="50" rx="42" ry="9" fill={hatColor} opacity="0.9" />
      {/* Brim underside shadow */}
      <ellipse cx="75" cy="52" rx="40" ry="7" fill="black" opacity="0.15" />
      {/* Hat band */}
      <rect x="48" y="36" width="54" height="10" fill={accent} opacity="0.7" />
      {/* Band highlight line */}
      <line x1="50" y1="41" x2="100" y2="41" stroke="white" strokeWidth="0.5" opacity="0.2" />
      {/* 3 stars on hat band */}
      {[60, 75, 90].map((sx, i) => (
        <polygon
          key={i}
          points={starPoints(sx, 41, 4.5, 2)}
          fill={starColor}
          opacity={0.85 + onsetFlash * 0.15}
        />
      ))}
      {/* Red/white stripe details on hat body */}
      {[6, 12, 18, 24, 30].map((sy, i) => (
        <line
          key={sy}
          x1="50"
          y1={sy}
          x2="100"
          y2={sy}
          stroke={i % 2 === 0 ? stripeColor : "white"}
          strokeWidth="1.8"
          opacity={i % 2 === 0 ? 0.3 : 0.1}
        />
      ))}

      {/* ═══ SKULL ═══ */}
      {/* Cranium dome */}
      <ellipse cx="75" cy="70" rx="20" ry="22" fill={primary} opacity="0.85" />
      {/* Cranium suture lines — coronal & sagittal */}
      <path d="M 58 64 Q 67 58 75 56 Q 83 58 92 64" stroke={primary} strokeWidth="0.8" opacity="0.3" fill="none" />
      <line x1="75" y1="50" x2="75" y2="68" stroke={primary} strokeWidth="0.6" opacity="0.2" />
      {/* Temporal suture (left) */}
      <path d="M 57 68 Q 60 75 58 80" stroke={primary} strokeWidth="0.6" opacity="0.2" fill="none" />
      {/* Temporal suture (right) */}
      <path d="M 93 68 Q 90 75 92 80" stroke={primary} strokeWidth="0.6" opacity="0.2" fill="none" />

      {/* Deep eye sockets */}
      <ellipse cx="65" cy="68" rx="7" ry="7.5" fill="black" opacity="0.65" />
      <ellipse cx="85" cy="68" rx="7" ry="7.5" fill="black" opacity="0.65" />
      {/* Socket rim highlights */}
      <ellipse cx="65" cy="66" rx="7.5" ry="6" fill="none" stroke={primary} strokeWidth="0.8" opacity="0.3" />
      <ellipse cx="85" cy="66" rx="7.5" ry="6" fill="none" stroke={primary} strokeWidth="0.8" opacity="0.3" />
      {/* Inner eye glow — pulses with beatDecay */}
      <circle cx="65" cy="69" r="2.8" fill={accent} opacity={eyeBright * 0.8} />
      <circle cx="85" cy="69" r="2.8" fill={accent} opacity={eyeBright * 0.8} />
      {/* Tiny pupil bright spot */}
      <circle cx="65" cy="68" r="1" fill="white" opacity={eyeBright * 0.5} />
      <circle cx="85" cy="68" r="1" fill="white" opacity={eyeBright * 0.5} />

      {/* Cheekbones — pronounced angular lines */}
      <line x1="56" y1="72" x2="50" y2="65" stroke={primary} strokeWidth="2.2" opacity="0.45" strokeLinecap="round" />
      <line x1="94" y1="72" x2="100" y2="65" stroke={primary} strokeWidth="2.2" opacity="0.45" strokeLinecap="round" />
      {/* Zygomatic arch (below cheekbone) */}
      <path d="M 56 73 Q 52 76 54 80" stroke={primary} strokeWidth="1.2" opacity="0.25" fill="none" />
      <path d="M 94 73 Q 98 76 96 80" stroke={primary} strokeWidth="1.2" opacity="0.25" fill="none" />

      {/* Nasal cavity — inverted heart shape */}
      <path
        d="M 75 74 L 72 80 Q 73 82 75 82 Q 77 82 78 80 Z"
        fill="black"
        opacity="0.55"
      />
      {/* Nasal bone ridge */}
      <line x1="75" y1="62" x2="75" y2="74" stroke={primary} strokeWidth="1" opacity="0.3" />

      {/* Jaw / mandible */}
      <path
        d="M 58 78 Q 58 92 66 94 L 84 94 Q 92 92 92 78"
        stroke={primary}
        strokeWidth="2.5"
        opacity="0.7"
        fill="none"
      />
      {/* Chin */}
      <ellipse cx="75" cy="95" rx="5" ry="3" fill={primary} opacity="0.4" />

      {/* ── Teeth: 10 individual teeth ── */}
      {/* Upper teeth row (background) */}
      <rect x="61" y="83" width="28" height="5" rx="1" fill={primary} opacity="0.6" />
      {/* Individual upper teeth */}
      {[62, 65, 68, 71, 74, 77, 80, 83, 86].map((tx, i) => (
        <React.Fragment key={`ut${i}`}>
          <rect x={tx} y="83" width="2.4" height="5" rx="0.5" fill={primary} opacity="0.75" />
          <line x1={tx + 1.2} y1="83" x2={tx + 1.2} y2="88" stroke="black" strokeWidth="0.4" opacity="0.3" />
        </React.Fragment>
      ))}
      {/* Lower teeth row */}
      <rect x="63" y="88.5" width="24" height="4" rx="1" fill={primary} opacity="0.5" />
      {/* Individual lower teeth */}
      {[64, 67, 70, 73, 76, 79, 82, 85].map((tx, i) => (
        <React.Fragment key={`lt${i}`}>
          <rect x={tx} y="88.5" width="2.2" height="4" rx="0.5" fill={primary} opacity="0.6" />
          <line x1={tx + 1.1} y1="88.5" x2={tx + 1.1} y2="92.5" stroke="black" strokeWidth="0.3" opacity="0.25" />
        </React.Fragment>
      ))}

      {/* ═══ SPINE — 7 vertebrae ═══ */}
      {[99, 106, 113, 120, 127, 134, 141].map((vy, i) => (
        <React.Fragment key={`v${i}`}>
          {/* Vertebral body */}
          <ellipse cx="75" cy={vy} rx="4.5" ry="3" fill={primary} opacity="0.55" />
          {/* Spinous process (rear bump) */}
          <circle cx="75" cy={vy - 2} r="1.5" fill={primary} opacity="0.35" />
          {/* Disc space between vertebrae */}
          {i < 6 && (
            <line x1="71" y1={vy + 3} x2="79" y2={vy + 3} stroke={primary} strokeWidth="0.5" opacity="0.2" />
          )}
        </React.Fragment>
      ))}

      {/* ═══ RIB CAGE — 4 pairs with sternum ═══ */}
      {/* Sternum — central bone */}
      <line x1="75" y1="98" x2="75" y2="132" stroke={primary} strokeWidth="2" opacity="0.4" />
      {/* Manubrium (top of sternum) */}
      <ellipse cx="75" cy="98" rx="5" ry="2" fill={primary} opacity="0.35" />
      {/* Rib pairs — left and right curves from sternum to spine */}
      {[102, 110, 118, 126].map((ry, i) => {
        const spread = 22 + i * 1.5;
        const droop = 3 + i * 1.5;
        return (
          <React.Fragment key={`rib${i}`}>
            {/* Left rib */}
            <path
              d={`M 75 ${ry} Q ${75 - spread * 0.6} ${ry - 2} ${75 - spread} ${ry + droop}`}
              stroke={primary}
              strokeWidth="2.2"
              opacity={0.5 - i * 0.03}
              fill="none"
              strokeLinecap="round"
            />
            {/* Right rib */}
            <path
              d={`M 75 ${ry} Q ${75 + spread * 0.6} ${ry - 2} ${75 + spread} ${ry + droop}`}
              stroke={primary}
              strokeWidth="2.2"
              opacity={0.5 - i * 0.03}
              fill="none"
              strokeLinecap="round"
            />
            {/* Rib cartilage tip (slightly brighter) */}
            <circle cx={75 - spread} cy={ry + droop} r="1.2" fill={primary} opacity="0.3" />
            <circle cx={75 + spread} cy={ry + droop} r="1.2" fill={primary} opacity="0.3" />
          </React.Fragment>
        );
      })}

      {/* ═══ PELVIS — hip bone shape ═══ */}
      <path
        d="M 55 148 Q 60 140 75 144 Q 90 140 95 148 Q 92 156 75 158 Q 58 156 55 148 Z"
        fill={primary}
        opacity="0.45"
      />
      {/* Iliac crest detail */}
      <path
        d="M 57 148 Q 66 143 75 145 Q 84 143 93 148"
        stroke={primary}
        strokeWidth="1.2"
        opacity="0.3"
        fill="none"
      />
      {/* Sacrum */}
      <ellipse cx="75" cy="150" rx="4" ry="6" fill={primary} opacity="0.3" />

      {/* ═══ LEFT ARM (at side, relaxed) ═══ */}
      {/* Humerus */}
      <line x1="55" y1="102" x2="38" y2="126" stroke={primary} strokeWidth="4" strokeLinecap="round" />
      {/* Elbow joint */}
      <circle cx="38" cy="126" r="3" fill={primary} opacity="0.5" />
      {/* Radius */}
      <line x1="38" y1="126" x2="30" y2="152" stroke={primary} strokeWidth="3.5" strokeLinecap="round" />
      {/* Ulna (slightly offset) */}
      <line x1="38" y1="126" x2="33" y2="153" stroke={primary} strokeWidth="2.5" opacity="0.4" strokeLinecap="round" />
      {/* Wrist bones — carpal cluster */}
      <circle cx="30" cy="153" r="2" fill={primary} opacity="0.5" />
      <circle cx="33" cy="154" r="1.5" fill={primary} opacity="0.4" />
      <circle cx="28" cy="155" r="1.5" fill={primary} opacity="0.35" />
      {/* Left hand — relaxed with finger hints */}
      <line x1="30" y1="155" x2="27" y2="162" stroke={primary} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="30" y1="155" x2="30" y2="163" stroke={primary} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <line x1="31" y1="155" x2="33" y2="162" stroke={primary} strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
      <line x1="28" y1="155" x2="24" y2="160" stroke={primary} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />

      {/* ═══ RIGHT ARM — POINTING AT VIEWER ═══ */}
      {/* Humerus — extends outward */}
      <line x1="95" y1="102" x2="118" y2="90" stroke={primary} strokeWidth="4.5" strokeLinecap="round" />
      {/* Elbow joint */}
      <circle cx="118" cy="90" r="3.5" fill={primary} opacity="0.55" />
      {/* Radius — forearm reaching toward camera */}
      <line x1="118" y1="90" x2="140" y2="76" stroke={primary} strokeWidth="4" strokeLinecap="round" />
      {/* Ulna (parallel offset) */}
      <line x1="118" y1="90" x2="138" y2="79" stroke={primary} strokeWidth="2.5" opacity="0.4" strokeLinecap="round" />
      {/* Wrist bones */}
      <circle cx="140" cy="76" r="2.5" fill={primary} opacity="0.55" />
      <circle cx="138" cy="78" r="1.8" fill={primary} opacity="0.4" />
      <circle cx="141" cy="78" r="1.5" fill={primary} opacity="0.35" />

      {/* ── POINTING INDEX FINGER — 3 bone segments, prominent ── */}
      {/* Metacarpal (palm to knuckle) */}
      <line x1="141" y1="74" x2="146" y2="62" stroke={accent} strokeWidth="4.5" strokeLinecap="round" opacity={flashBoost * 0.9} />
      {/* Proximal phalanx */}
      <line x1="146" y1="62" x2="150" y2="50" stroke={accent} strokeWidth="4" strokeLinecap="round" opacity={flashBoost * 0.85} />
      {/* Knuckle joint */}
      <circle cx="146" cy="62" r="2" fill={accent} opacity="0.5" />
      {/* Distal phalanx — fingertip */}
      <line x1="150" y1="50" x2="152" y2="40" stroke={accent} strokeWidth="3.5" strokeLinecap="round" opacity={flashBoost} />
      {/* Joint between proximal and distal */}
      <circle cx="150" cy="50" r="1.8" fill={accent} opacity="0.45" />
      {/* Fingertip glow */}
      <circle cx="152" cy="39" r="2.5" fill={accent} opacity={0.4 + onsetFlash * 0.5} />

      {/* Other fingers — curled toward palm */}
      {/* Middle finger curled */}
      <path d="M 139 74 Q 137 68 134 66 Q 131 68 132 72" stroke={primary} strokeWidth="2.5" strokeLinecap="round" opacity="0.55" fill="none" />
      {/* Ring finger curled */}
      <path d="M 138 76 Q 134 72 131 71 Q 128 73 130 77" stroke={primary} strokeWidth="2.2" strokeLinecap="round" opacity="0.5" fill="none" />
      {/* Pinky curled */}
      <path d="M 137 78 Q 133 76 130 76 Q 128 78 129 81" stroke={primary} strokeWidth="2" strokeLinecap="round" opacity="0.45" fill="none" />
      {/* Thumb tucked */}
      <path d="M 142 77 Q 144 80 142 83 Q 140 82 139 79" stroke={primary} strokeWidth="2.2" strokeLinecap="round" opacity="0.5" fill="none" />

      {/* ═══ LEGS ═══ */}
      {/* Left leg */}
      {/* Femur */}
      <line x1="66" y1="156" x2="56" y2="190" stroke={primary} strokeWidth="4" strokeLinecap="round" />
      {/* Knee joint */}
      <circle cx="56" cy="190" r="3.5" fill={primary} opacity="0.5" />
      {/* Tibia */}
      <line x1="56" y1="190" x2="50" y2="224" stroke={primary} strokeWidth="3.5" strokeLinecap="round" />
      {/* Fibula (thinner, parallel) */}
      <line x1="56" y1="190" x2="53" y2="223" stroke={primary} strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      {/* Ankle */}
      <circle cx="50" cy="225" r="2.5" fill={primary} opacity="0.45" />

      {/* Right leg */}
      {/* Femur */}
      <line x1="84" y1="156" x2="94" y2="190" stroke={primary} strokeWidth="4" strokeLinecap="round" />
      {/* Knee joint */}
      <circle cx="94" cy="190" r="3.5" fill={primary} opacity="0.5" />
      {/* Tibia */}
      <line x1="94" y1="190" x2="100" y2="224" stroke={primary} strokeWidth="3.5" strokeLinecap="round" />
      {/* Fibula */}
      <line x1="94" y1="190" x2="97" y2="223" stroke={primary} strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      {/* Ankle */}
      <circle cx="100" cy="225" r="2.5" fill={primary} opacity="0.45" />

      {/* ═══ BOOTS with stripe accents ═══ */}
      {/* Left boot */}
      <path
        d="M 42 228 Q 38 226 36 230 Q 34 236 38 240 L 58 240 Q 60 236 56 228 Z"
        fill={primary}
        opacity="0.7"
      />
      {/* Boot heel */}
      <rect x="38" y="238" width="6" height="4" rx="1" fill={primary} opacity="0.5" />
      {/* Boot stripes */}
      <line x1="40" y1="233" x2="56" y2="233" stroke={accent} strokeWidth="1.5" opacity="0.45" />
      <line x1="39" y1="236" x2="57" y2="236" stroke={stripeColor} strokeWidth="1" opacity="0.3" />
      {/* Boot toe detail */}
      <ellipse cx="42" cy="237" rx="5" ry="3" fill={primary} opacity="0.35" />

      {/* Right boot */}
      <path
        d="M 92 228 Q 90 226 88 230 Q 86 236 90 240 L 110 240 Q 112 236 108 228 Z"
        fill={primary}
        opacity="0.7"
      />
      {/* Boot heel */}
      <rect x="106" y="238" width="6" height="4" rx="1" fill={primary} opacity="0.5" />
      {/* Boot stripes */}
      <line x1="92" y1="233" x2="108" y2="233" stroke={accent} strokeWidth="1.5" opacity="0.45" />
      <line x1="91" y1="236" x2="109" y2="236" stroke={stripeColor} strokeWidth="1" opacity="0.3" />
      {/* Boot toe detail */}
      <ellipse cx="108" cy="237" rx="5" ry="3" fill={primary} opacity="0.35" />

      {/* Foot bones visible through boot (ghostly) */}
      {[42, 46, 50].map((fx) => (
        <line key={`lf${fx}`} x1={fx} y1="230" x2={fx + 1} y2="238" stroke={primary} strokeWidth="0.8" opacity="0.15" />
      ))}
      {[96, 100, 104].map((fx) => (
        <line key={`rf${fx}`} x1={fx} y1="230" x2={fx + 1} y2="238" stroke={primary} strokeWidth="0.8" opacity="0.15" />
      ))}

      {/* ═══ COAT TAILS — ghostly dashed outline ═══ */}
      {/* Left coat tail */}
      <path
        d="M 55 130 Q 46 150 40 175 Q 36 192 34 210"
        stroke={primary}
        strokeWidth="2"
        opacity="0.2"
        fill="none"
        strokeDasharray="5 4"
      />
      {/* Left lapel edge */}
      <path
        d="M 60 100 Q 50 110 48 125"
        stroke={primary}
        strokeWidth="1.5"
        opacity="0.18"
        fill="none"
        strokeDasharray="3 3"
      />
      {/* Right coat tail */}
      <path
        d="M 95 130 Q 104 150 110 175 Q 114 192 116 210"
        stroke={primary}
        strokeWidth="2"
        opacity="0.2"
        fill="none"
        strokeDasharray="5 4"
      />
      {/* Right lapel edge */}
      <path
        d="M 90 100 Q 100 110 102 125"
        stroke={primary}
        strokeWidth="1.5"
        opacity="0.18"
        fill="none"
        strokeDasharray="3 3"
      />
      {/* Waist button suggestion */}
      <circle cx="75" cy="140" r="2" fill={accent} opacity="0.15" />

      {/* Coat collar / bow tie hint */}
      <path
        d="M 65 96 Q 70 93 75 96 Q 80 93 85 96"
        stroke={accent}
        strokeWidth="1.5"
        opacity="0.25"
        fill="none"
      />
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════════
//  UncleSam — orchestrator component
// ═══════════════════════════════════════════════════════════════════

interface Props {
  frames: EnhancedFrameData[];
}

export const UncleSam: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const { energy, chromaHue, onsetEnvelope, beatDecay, peakApproaching } = snap;

  // ── Gate: only appear during high energy or imminent peak ──
  if (energy < 0.2 && (peakApproaching ?? 0) < 0.7) return null;

  // ── Cycle timing ──
  const cycleIndex = Math.floor(frame / APPEAR_CYCLE);
  const cycleFrame = frame % APPEAR_CYCLE;
  const inZoom = cycleFrame < APPEAR_DURATION;
  const progress = inZoom ? cycleFrame / APPEAR_DURATION : 1;

  // ── Deterministic palette ──
  const rng = seeded(cycleIndex * 67 + 1776);
  const palette = NEON_PALETTES[Math.floor(rng() * NEON_PALETTES.length)];

  // ── Zoom: 0.3 → 1.2 with cubic bezier, then hold + energy breathing ──
  const zoomScale = interpolate(
    progress,
    [0, 0.4, 0.75, 1],
    [0.3, 0.85, 1.1, 1.2],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    },
  );
  // Subtle energy-driven breathing during hold phase
  const holdBreath = inZoom ? 0 : Math.sin(cycleFrame * 0.04 * tempoFactor) * 0.03 + (energy - 0.2) * 0.12;
  const scale = zoomScale + holdBreath;

  // ── Opacity: fade in, then energy-modulated presence ──
  const fadeIn = interpolate(progress, [0, 0.15, 0.3], [0, 0.5, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const energyOpacity = interpolate(energy, [0.2, 0.35, 0.7], [0.65, 0.85, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = fadeIn * energyOpacity;

  // ── Position: center with slow menacing drift ──
  const driftX = Math.sin(progress * Math.PI * 0.5) * width * 0.02;
  const driftY = Math.cos(progress * Math.PI * 0.3) * height * 0.01;
  const centerX = width * 0.5 + driftX;
  const centerY = height * 0.44 + driftY;

  // ── Menacing tilt — initial lean, then settle with slight sway ──
  const entryTilt = interpolate(progress, [0, 0.2, 0.5, 0.8, 1], [8, 3, 0, -1, -2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const holdSway = inZoom ? 0 : Math.sin(cycleFrame * 0.025 * tempoFactor) * 1.5;
  const tilt = entryTilt + holdSway;

  // ── Triple-layer neon glow ──
  const baseGlow = interpolate(progress, [0, 0.4, 1], [8, 25, 45], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowIntensity = baseGlow + onsetEnvelope * 20;

  // Color driven by music — chromaHue + onset flash
  const hueShift = chromaHue + onsetEnvelope * 60;
  const dynamicGlow = `hsl(${hueShift}, 100%, ${55 + beatDecay * 20}%)`;

  const charSize = 220;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: centerX,
          top: centerY,
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${tilt}deg)`,
          opacity,
          filter: [
            `drop-shadow(0 0 ${glowIntensity * 0.6}px ${palette.primary})`,
            `drop-shadow(0 0 ${glowIntensity}px ${dynamicGlow})`,
            `drop-shadow(0 0 ${glowIntensity * 1.8}px ${palette.accent})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
        }}
      >
        <UncleSamSkeleton
          size={charSize}
          primary={palette.primary}
          accent={palette.accent}
          hatColor={palette.hat}
          starColor={palette.stars}
          stripeColor={palette.stripe}
          eyeGlow={beatDecay}
          onsetFlash={onsetEnvelope}
        />
      </div>
    </div>
  );
};
