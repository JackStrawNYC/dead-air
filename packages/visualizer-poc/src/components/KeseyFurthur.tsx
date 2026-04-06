/**
 * KeseyFurthur — A+++ overlay rendering Ken Kesey's Merry Pranksters bus
 * "Furthur" cruising across the frame in full psychedelic glory.
 *
 * Historical context:
 *   "Furthur" (originally spelled "Furthur", later "Further") was a 1939
 *   International Harvester school bus painted in wild Day-Glo psychedelic
 *   patterns by Ken Kesey and the Merry Pranksters in 1964. It was the
 *   vehicle for the Acid Tests — the prototype Grateful Dead crucible.
 *   Kesey himself was at Veneta on 8/27/72 (the legendary Sunshine Daydream
 *   show). When this overlay drops, every Deadhead loses their mind.
 *
 * Visual elements:
 *   - Full IH 1939 school bus silhouette: boxy body, rounded roof, long hood,
 *     V-split windshield, 9 side windows, 6 wheels (front + dual rear),
 *     curved rear, roof rack with luggage
 *   - Wild psychedelic paint job: 6 SVG radial gradients flowing across the
 *     body, every window painted differently, spirals/swirls/eyes/peace signs
 *     hand-painted on the panels, full rainbow palette that slowly cycles
 *   - "FURTHUR" hand-painted destination sign above the windshield (crooked,
 *     imperfect, just like the original)
 *   - "ACID TEST" lettering on the side panel
 *   - Atmospheric: dust cloud trail, heat shimmer rising from road,
 *     soft glow halo around the entire bus
 *
 * Audio reactivity:
 *   - tempoFactor → bus driving speed
 *   - energy → color saturation, glow halo radius
 *   - beatDecay → suspension bounce amplitude
 *   - chromaHue → entire palette hue rotation
 *   - bass → wheel rotation speed
 *   - onsetEnvelope → headlight flash
 *   - musicalTime → continuous swirl/spiral animation phase
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Constants — bus geometry and animation                             */
/* ------------------------------------------------------------------ */

const BUS_WIDTH = 720;
const BUS_HEIGHT = 320;

// Internal SVG viewBox dimensions — body is laid out in this space
const VB_W = 360;
const VB_H = 160;

// One full screen-crossing in frames at tempoFactor=1
const CROSS_FRAMES = 540; // ~18s at 30fps
// Cycle length: cross + offscreen pause
const CYCLE_FRAMES = 720;

/* ------------------------------------------------------------------ */
/*  Color palette helpers — psychedelic rainbow that hue-shifts        */
/* ------------------------------------------------------------------ */

const psychColor = (baseHue: number, hueShift: number, sat: number, light: number, alpha = 1): string =>
  `hsla(${(baseHue + hueShift) % 360}, ${sat}%, ${light}%, ${alpha})`;

// Six base hues spaced around the wheel for the panel gradients
const PANEL_HUES = [0, 35, 60, 130, 220, 290];

/* ------------------------------------------------------------------ */
/*  Spiral / Eye / Peace decals                                        */
/* ------------------------------------------------------------------ */

const HandSpiral: React.FC<{ cx: number; cy: number; r: number; color: string; phase: number }> = ({
  cx, cy, r, color, phase,
}) => {
  const turns = 3;
  const segs = 36;
  const pts: string[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2 + phase;
    const rr = r * t;
    pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
  }
  return (
    <polyline
      points={pts.join(" ")}
      stroke={color}
      strokeWidth="1.4"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.75"
    />
  );
};

const HandEye: React.FC<{ cx: number; cy: number; r: number; color: string; pupilColor: string }> = ({
  cx, cy, r, color, pupilColor,
}) => (
  <g opacity="0.78">
    {/* Almond eye outline */}
    <path
      d={`M${cx - r} ${cy} Q${cx} ${cy - r * 0.7} ${cx + r} ${cy} Q${cx} ${cy + r * 0.7} ${cx - r} ${cy} Z`}
      fill="#FFF8E1"
      stroke={color}
      strokeWidth="1.2"
    />
    {/* Iris */}
    <circle cx={cx} cy={cy} r={r * 0.42} fill={color} />
    {/* Pupil */}
    <circle cx={cx} cy={cy} r={r * 0.18} fill={pupilColor} />
    {/* Lash flicks */}
    <line x1={cx - r * 0.85} y1={cy - r * 0.15} x2={cx - r * 1.05} y2={cy - r * 0.4} stroke={color} strokeWidth="0.7" strokeLinecap="round" />
    <line x1={cx + r * 0.85} y1={cy - r * 0.15} x2={cx + r * 1.05} y2={cy - r * 0.4} stroke={color} strokeWidth="0.7" strokeLinecap="round" />
  </g>
);

const PeaceSign: React.FC<{ cx: number; cy: number; r: number; color: string }> = ({
  cx, cy, r, color,
}) => (
  <g opacity="0.78">
    <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth="1.6" fill="none" />
    <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={color} strokeWidth="1.4" />
    <line x1={cx} y1={cy} x2={cx - r * 0.72} y2={cy + r * 0.72} stroke={color} strokeWidth="1.4" />
    <line x1={cx} y1={cy} x2={cx + r * 0.72} y2={cy + r * 0.72} stroke={color} strokeWidth="1.4" />
  </g>
);

/* ------------------------------------------------------------------ */
/*  Dust cloud trail — billowing puffs behind the bus                  */
/* ------------------------------------------------------------------ */

const DustTrail: React.FC<{
  x: number;
  y: number;
  phase: number;
  energy: number;
  hue: number;
  goingRight: boolean;
}> = ({ x, y, phase, energy, hue, goingRight }) => {
  const dir = goingRight ? -1 : 1;
  const puffs = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const drift = Math.sin(phase * 0.7 + i * 1.3);
    const rise = Math.cos(phase * 0.5 + i * 0.9);
    return {
      cx: x + dir * (15 + i * 22),
      cy: y - 4 + drift * 3 - i * 1.2,
      r: 8 + i * 2.5 + rise * 1.6,
      op: (1 - t) * 0.55 * (0.45 + energy * 0.55),
    };
  });
  return (
    <g>
      {puffs.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={`hsla(${(hue + 30) % 360}, 25%, 78%, ${p.op})`}
        />
      ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Heat shimmer — wavy lines rising from the road                     */
/* ------------------------------------------------------------------ */

const HeatShimmer: React.FC<{ x: number; y: number; phase: number; energy: number }> = ({
  x, y, phase, energy,
}) => {
  const lines = Array.from({ length: 6 }, (_, i) => {
    const lx = x - 30 + i * 12;
    const sway = Math.sin(phase * 1.4 + i * 0.8) * 4;
    return `M${lx} ${y} Q${lx + sway} ${y - 10} ${lx} ${y - 20} Q${lx - sway} ${y - 30} ${lx + sway * 0.5} ${y - 40}`;
  });
  return (
    <g opacity={0.25 + energy * 0.35}>
      {lines.map((d, i) => (
        <path key={i} d={d} stroke="hsla(40, 30%, 92%, 0.5)" strokeWidth="1" fill="none" />
      ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  The Furthur Bus — full IH 1939 school bus SVG                     */
/* ------------------------------------------------------------------ */

const FurthurBus: React.FC<{
  hueShift: number;
  saturation: number;
  bobOffset: number;
  tiltDeg: number;
  wheelSpin: number;
  headlightBrightness: number;
  swirlPhase: number;
}> = ({
  hueShift, saturation, bobOffset, tiltDeg, wheelSpin, headlightBrightness, swirlPhase,
}) => {
  // Generate window paint colors that hue-shift over time
  const windowPaints = [
    psychColor(PANEL_HUES[0], hueShift, saturation, 55),
    psychColor(PANEL_HUES[1], hueShift, saturation, 60),
    psychColor(PANEL_HUES[2], hueShift, saturation, 58),
    psychColor(PANEL_HUES[3], hueShift, saturation, 50),
    psychColor(PANEL_HUES[4], hueShift, saturation, 55),
    psychColor(PANEL_HUES[5], hueShift, saturation, 58),
    psychColor(PANEL_HUES[0] + 180, hueShift, saturation, 60),
    psychColor(PANEL_HUES[1] + 180, hueShift, saturation, 55),
    psychColor(PANEL_HUES[2] + 180, hueShift, saturation, 60),
  ];

  return (
    <svg width={BUS_WIDTH} height={BUS_HEIGHT} viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none">
      <defs>
        {/* Six flowing radial gradients across the body */}
        <radialGradient id="kf-grad-0" cx="15%" cy="40%" r="35%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[0], hueShift, saturation, 60)} stopOpacity="0.95" />
          <stop offset="60%" stopColor={psychColor(PANEL_HUES[1], hueShift, saturation, 55)} stopOpacity="0.5" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[2], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kf-grad-1" cx="35%" cy="60%" r="30%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[2], hueShift, saturation, 60)} stopOpacity="0.9" />
          <stop offset="60%" stopColor={psychColor(PANEL_HUES[3], hueShift, saturation, 55)} stopOpacity="0.45" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[4], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kf-grad-2" cx="55%" cy="35%" r="32%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[4], hueShift, saturation, 65)} stopOpacity="0.9" />
          <stop offset="60%" stopColor={psychColor(PANEL_HUES[5], hueShift, saturation, 55)} stopOpacity="0.45" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[0], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kf-grad-3" cx="75%" cy="55%" r="30%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[1], hueShift, saturation, 60)} stopOpacity="0.92" />
          <stop offset="60%" stopColor={psychColor(PANEL_HUES[2], hueShift, saturation, 55)} stopOpacity="0.5" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[3], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kf-grad-4" cx="20%" cy="80%" r="28%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[5], hueShift, saturation, 60)} stopOpacity="0.85" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[0], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kf-grad-5" cx="85%" cy="80%" r="28%">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[3], hueShift, saturation, 60)} stopOpacity="0.85" />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[4], hueShift, saturation, 50)} stopOpacity="0" />
        </radialGradient>

        {/* Roof gradient */}
        <linearGradient id="kf-roof" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={psychColor(PANEL_HUES[2], hueShift, saturation, 65)} />
          <stop offset="33%" stopColor={psychColor(PANEL_HUES[3], hueShift, saturation, 60)} />
          <stop offset="66%" stopColor={psychColor(PANEL_HUES[4], hueShift, saturation, 65)} />
          <stop offset="100%" stopColor={psychColor(PANEL_HUES[5], hueShift, saturation, 60)} />
        </linearGradient>

        {/* Headlight glow */}
        <radialGradient id="kf-headlight" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={`hsla(50, 90%, 96%, ${headlightBrightness})`} />
          <stop offset="40%" stopColor={`hsla(45, 80%, 80%, ${headlightBrightness * 0.6})`} />
          <stop offset="100%" stopColor="hsla(40, 70%, 70%, 0)" />
        </radialGradient>

        {/* Window glass gradient */}
        <linearGradient id="kf-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#B3E5FC" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#4FC3F7" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      <g transform={`translate(0, ${bobOffset}) rotate(${tiltDeg}, ${VB_W / 2}, ${VB_H / 2})`}>
        {/* ============================================================ */}
        {/*  HOOD — long classic American school bus snout (front-right)  */}
        {/* ============================================================ */}
        <path
          d="M268 78 L268 110 L348 110 L348 90 Q348 78 336 76 L292 70 Q278 70 268 78 Z"
          fill={psychColor(PANEL_HUES[0], hueShift, saturation, 55)}
          stroke="#1A1A1A"
          strokeWidth="1.4"
        />
        {/* Hood gradient overlay */}
        <path
          d="M268 78 L268 110 L348 110 L348 90 Q348 78 336 76 L292 70 Q278 70 268 78 Z"
          fill="url(#kf-grad-3)"
        />
        {/* Hood center crease */}
        <line x1="308" y1="72" x2="308" y2="110" stroke="#1A1A1A" strokeWidth="0.7" opacity="0.5" />

        {/* ============================================================ */}
        {/*  MAIN BODY — boxy rounded school bus shell                   */}
        {/* ============================================================ */}
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill={psychColor(PANEL_HUES[2], hueShift, saturation, 55)}
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />

        {/* Six flowing psychedelic gradient overlays across the body */}
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill="url(#kf-grad-0)"
        />
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill="url(#kf-grad-1)"
        />
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill="url(#kf-grad-2)"
        />
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill="url(#kf-grad-4)"
        />
        <path
          d="M28 36 Q28 28 36 28 L260 28 Q272 28 272 40 L272 110 L24 110 L24 44 Q24 36 28 36 Z"
          fill="url(#kf-grad-5)"
        />

        {/* ============================================================ */}
        {/*  ROOF — curved top with rainbow gradient                     */}
        {/* ============================================================ */}
        <path
          d="M28 36 Q28 18 50 18 L246 18 Q272 18 272 40 L272 36 L28 36 Z"
          fill="url(#kf-roof)"
          stroke="#1A1A1A"
          strokeWidth="1.4"
        />
        {/* Roof drip detail (rounded corner highlight) */}
        <path
          d="M30 34 Q30 22 50 22 L246 22 Q268 22 268 36"
          stroke="hsla(0, 0%, 100%, 0.35)"
          strokeWidth="0.8"
          fill="none"
        />

        {/* ============================================================ */}
        {/*  ROOF RACK — luggage and gear suggestion                     */}
        {/* ============================================================ */}
        {/* Rack rails */}
        <rect x="46" y="12" width="218" height="2.5" rx="1" fill="#3E2723" opacity="0.85" />
        <rect x="46" y="14" width="218" height="1" fill="#5D4037" opacity="0.6" />
        {/* Rack posts */}
        {[60, 100, 140, 180, 220, 256].map((px) => (
          <rect key={px} x={px} y={9.5} width="1.5" height="3" fill="#3E2723" opacity="0.8" />
        ))}
        {/* Luggage piles */}
        <rect x="64" y="6" width="28" height="6" rx="1" fill={psychColor(40, hueShift, 60, 35)} stroke="#2E1A0F" strokeWidth="0.5" />
        <rect x="100" y="4" width="36" height="8" rx="1.2" fill={psychColor(15, hueShift, 70, 40)} stroke="#2E1A0F" strokeWidth="0.5" />
        <rect x="146" y="6.5" width="22" height="5.5" rx="1" fill={psychColor(220, hueShift, 60, 40)} stroke="#2E1A0F" strokeWidth="0.5" />
        <rect x="174" y="3" width="44" height="9" rx="1.4" fill={psychColor(120, hueShift, 55, 35)} stroke="#2E1A0F" strokeWidth="0.5" />
        <rect x="224" y="6" width="30" height="6" rx="1" fill={psychColor(290, hueShift, 65, 38)} stroke="#2E1A0F" strokeWidth="0.5" />
        {/* Bedroll suggestion — rolled mat strapped on top */}
        <ellipse cx="170" cy="3" rx="48" ry="1.8" fill={psychColor(330, hueShift, 50, 60)} opacity="0.7" />

        {/* ============================================================ */}
        {/*  SIDE WINDOWS — 9 windows, each painted differently          */}
        {/* ============================================================ */}
        {windowPaints.map((paint, i) => {
          const wx = 32 + i * 25.5;
          return (
            <g key={i}>
              {/* Window frame painted with unique psychedelic color */}
              <rect
                x={wx}
                y={36}
                width={22}
                height={26}
                rx={1.5}
                fill={paint}
                stroke="#1A1A1A"
                strokeWidth="0.9"
              />
              {/* Glass overlay (semi-transparent) */}
              <rect
                x={wx + 1.5}
                y={37.5}
                width={19}
                height={23}
                rx={1}
                fill="url(#kf-glass)"
              />
              {/* Reflection streak */}
              <line
                x1={wx + 3}
                y1={39}
                x2={wx + 8}
                y2={37.8}
                stroke="#ffffff"
                strokeWidth="0.5"
                opacity="0.55"
                strokeLinecap="round"
              />
              {/* Window divider (small middle bar) */}
              <line
                x1={wx + 11}
                y1={37}
                x2={wx + 11}
                y2={61}
                stroke="#1A1A1A"
                strokeWidth="0.5"
                opacity="0.5"
              />
            </g>
          );
        })}

        {/* ============================================================ */}
        {/*  V-SPLIT WINDSHIELD on the hood/cab                          */}
        {/* ============================================================ */}
        {/* Left pane */}
        <path
          d="M276 60 L296 50 L296 80 L276 80 Z"
          fill="url(#kf-glass)"
          stroke="#1A1A1A"
          strokeWidth="1"
        />
        {/* Right pane */}
        <path
          d="M298 50 L320 60 L320 80 L298 80 Z"
          fill="url(#kf-glass)"
          stroke="#1A1A1A"
          strokeWidth="1"
        />
        {/* Center V divider */}
        <line x1="297" y1="49" x2="297" y2="80" stroke="#1A1A1A" strokeWidth="1.5" />
        {/* Reflection sparkle */}
        <line x1="280" y1="55" x2="288" y2="53" stroke="#ffffff" strokeWidth="0.7" opacity="0.6" strokeLinecap="round" />
        <line x1="304" y1="53" x2="314" y2="55" stroke="#ffffff" strokeWidth="0.7" opacity="0.6" strokeLinecap="round" />

        {/* ============================================================ */}
        {/*  "FURTHUR" DESTINATION SIGN above windshield                 */}
        {/* ============================================================ */}
        <g transform="rotate(-2.5 296 42)">
          {/* Sign background — slightly hand-painted offset rectangle */}
          <rect
            x="270"
            y="33"
            width="58"
            height="14"
            rx="1.5"
            fill={psychColor(50, hueShift, 80, 92)}
            stroke="#1A1A1A"
            strokeWidth="1.1"
          />
          {/* Hand-painted "FURTHUR" — letter shapes drawn as paths so they look painted */}
          <text
            x="299"
            y="44"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="11"
            fontWeight="900"
            fill="#1A0033"
            stroke={psychColor(280, hueShift, 80, 30)}
            strokeWidth="0.4"
            letterSpacing="0.6"
            style={{ fontStyle: "italic" }}
          >
            FURTHUR
          </text>
          {/* Rainbow underline accent */}
          <line
            x1="276"
            y1="46.5"
            x2="322"
            y2="46.5"
            stroke={psychColor(0, hueShift, 80, 55)}
            strokeWidth="0.7"
            opacity="0.7"
          />
        </g>

        {/* ============================================================ */}
        {/*  HAND-PAINTED DECORATIONS on body                            */}
        {/* ============================================================ */}
        {/* Three flowing spirals along the lower body */}
        <HandSpiral
          cx={60}
          cy={88}
          r={11}
          color={psychColor(PANEL_HUES[5], hueShift, 90, 25)}
          phase={swirlPhase}
        />
        <HandSpiral
          cx={140}
          cy={92}
          r={9}
          color={psychColor(PANEL_HUES[1], hueShift, 90, 22)}
          phase={-swirlPhase * 0.7}
        />
        <HandSpiral
          cx={220}
          cy={88}
          r={10}
          color={psychColor(PANEL_HUES[3], hueShift, 90, 25)}
          phase={swirlPhase * 1.3}
        />

        {/* Two hand-painted eyes peeking through the gradient swirls */}
        <HandEye
          cx={95}
          cy={84}
          r={7}
          color={psychColor(PANEL_HUES[2], hueShift, 95, 20)}
          pupilColor="#0D0D0D"
        />
        <HandEye
          cx={185}
          cy={86}
          r={7}
          color={psychColor(PANEL_HUES[4], hueShift, 95, 22)}
          pupilColor="#0D0D0D"
        />

        {/* Peace sign on the rear panel */}
        <PeaceSign
          cx={42}
          cy={68}
          r={9}
          color={psychColor(0, hueShift, 95, 95)}
        />

        {/* "ACID TEST" lettering on the side panel (between windows and bumper) */}
        <g transform="rotate(-1.5 145 100)">
          <rect
            x="108"
            y="93"
            width="78"
            height="11"
            rx="1.2"
            fill={psychColor(160, hueShift, 80, 88)}
            stroke="#1A1A1A"
            strokeWidth="0.7"
            opacity="0.85"
          />
          <text
            x="147"
            y="102"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="8.5"
            fontWeight="900"
            fill="#3E0066"
            letterSpacing="1.2"
            style={{ fontStyle: "italic" }}
          >
            ACID TEST
          </text>
        </g>

        {/* ============================================================ */}
        {/*  REAR — curved back with rear window                         */}
        {/* ============================================================ */}
        {/* Rear curve highlight */}
        <path
          d="M24 60 Q20 70 24 88"
          stroke="#1A1A1A"
          strokeWidth="0.7"
          fill="none"
          opacity="0.5"
        />
        {/* Small rear window (visible at back-left corner) */}
        <rect
          x="26"
          y="40"
          width="4"
          height="14"
          rx="0.6"
          fill="url(#kf-glass)"
          stroke="#1A1A1A"
          strokeWidth="0.6"
        />
        {/* Rear taillight */}
        <circle cx="27" cy="84" r="2.5" fill="#E53935" stroke="#1A1A1A" strokeWidth="0.5" />
        <circle cx="27" cy="84" r="1.2" fill="#FFCDD2" opacity="0.85" />

        {/* ============================================================ */}
        {/*  CHROME BUMPER — front and rear                              */}
        {/* ============================================================ */}
        {/* Front bumper */}
        <rect x="266" y="106" width="84" height="5" rx="1.5" fill="#BDBDBD" stroke="#1A1A1A" strokeWidth="0.6" />
        <line x1="270" y1="107.5" x2="346" y2="107.5" stroke="#ffffff" strokeWidth="0.6" opacity="0.5" />
        {/* Body bumper */}
        <rect x="22" y="106" width="252" height="5" rx="1.5" fill="#BDBDBD" stroke="#1A1A1A" strokeWidth="0.6" />
        <line x1="26" y1="107.5" x2="270" y2="107.5" stroke="#ffffff" strokeWidth="0.6" opacity="0.5" />

        {/* ============================================================ */}
        {/*  WHEELS — 6 wheels: front + dual rear                        */}
        {/* ============================================================ */}
        {/* Wheel positions: front-right (under hood), middle-rear (dual), back-left */}
        {[
          { cx: 312, cy: 122, r: 14 }, // Front (under hood)
          { cx: 220, cy: 122, r: 14 }, // Rear inner
          { cx: 246, cy: 122, r: 14 }, // Rear outer (dual)
          { cx: 60, cy: 122, r: 14 },  // Back-left inner
          { cx: 86, cy: 122, r: 14 },  // Back-left outer (dual)
        ].map((w, i) => (
          <g key={i}>
            {/* Tire */}
            <circle cx={w.cx} cy={w.cy} r={w.r} fill="#1A1A1A" stroke="#000" strokeWidth="0.6" />
            {/* Tire sidewall ring */}
            <circle cx={w.cx} cy={w.cy} r={w.r - 1.2} fill="none" stroke="#3D3D3D" strokeWidth="0.8" />
            {/* Hubcap */}
            <circle cx={w.cx} cy={w.cy} r={w.r * 0.55} fill="#9E9E9E" stroke="#616161" strokeWidth="0.5" />
            {/* Spinning spokes */}
            <g transform={`rotate(${wheelSpin + i * 30}, ${w.cx}, ${w.cy})`}>
              <line x1={w.cx - w.r * 0.5} y1={w.cy} x2={w.cx + w.r * 0.5} y2={w.cy} stroke="#616161" strokeWidth="1.1" />
              <line x1={w.cx} y1={w.cy - w.r * 0.5} x2={w.cx} y2={w.cy + w.r * 0.5} stroke="#616161" strokeWidth="1.1" />
              <line
                x1={w.cx - w.r * 0.35}
                y1={w.cy - w.r * 0.35}
                x2={w.cx + w.r * 0.35}
                y2={w.cy + w.r * 0.35}
                stroke="#757575"
                strokeWidth="0.7"
              />
              <line
                x1={w.cx + w.r * 0.35}
                y1={w.cy - w.r * 0.35}
                x2={w.cx - w.r * 0.35}
                y2={w.cy + w.r * 0.35}
                stroke="#757575"
                strokeWidth="0.7"
              />
            </g>
            {/* Hub center cap */}
            <circle cx={w.cx} cy={w.cy} r={1.6} fill="#E0E0E0" stroke="#424242" strokeWidth="0.4" />
          </g>
        ))}

        {/* ============================================================ */}
        {/*  HEADLIGHTS — round, with audio-driven glow halo             */}
        {/* ============================================================ */}
        {/* Glow halo */}
        <circle cx="346" cy="92" r="14" fill="url(#kf-headlight)" />
        {/* Lens housing */}
        <circle cx="346" cy="92" r="6" fill="hsl(50, 30%, 95%)" stroke="#1A1A1A" strokeWidth="0.9" />
        {/* Inner bright core */}
        <circle cx="346" cy="92" r="3.8" fill="hsl(55, 40%, 98%)" opacity={0.5 + headlightBrightness * 0.5} />
        {/* Lens cross-glint */}
        <line x1="343" y1="92" x2="349" y2="92" stroke="#FFFDE7" strokeWidth="0.4" opacity={headlightBrightness} />
        <line x1="346" y1="89" x2="346" y2="95" stroke="#FFFDE7" strokeWidth="0.4" opacity={headlightBrightness} />

        {/* ============================================================ */}
        {/*  GRILLE — vertical bars on the front of the hood             */}
        {/* ============================================================ */}
        <rect x="328" y="96" width="14" height="11" rx="0.6" fill="#2E2E2E" stroke="#1A1A1A" strokeWidth="0.5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1={329.5 + i * 2.6}
            y1={97}
            x2={329.5 + i * 2.6}
            y2={106}
            stroke="#9E9E9E"
            strokeWidth="0.5"
          />
        ))}

        {/* ============================================================ */}
        {/*  DOOR — entry door at rear of body                           */}
        {/* ============================================================ */}
        <rect
          x="252"
          y="36"
          width="18"
          height="68"
          rx="1"
          fill="none"
          stroke="#1A1A1A"
          strokeWidth="0.7"
          opacity="0.6"
        />
        {/* Door handle */}
        <circle cx="265" cy="74" r="1.2" fill="#E0E0E0" stroke="#1A1A1A" strokeWidth="0.4" />

        {/* ============================================================ */}
        {/*  BODY PANEL LINES — subtle detail divisions                  */}
        {/* ============================================================ */}
        <line x1="24" y1="68" x2="272" y2="68" stroke="#1A1A1A" strokeWidth="0.4" opacity="0.25" />
        <line x1="24" y1="92" x2="272" y2="92" stroke="#1A1A1A" strokeWidth="0.4" opacity="0.25" />
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  KeseyFurthur — master orchestrator                                 */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const KeseyFurthur: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue;
  const musicalTime = snap.musicalTime;
  const onsetEnvelope = snap.onsetEnvelope;
  const bass = snap.bass;

  // Driving cycle: bus enters from left, crosses screen, exits, pause, repeat
  const cyclePos = (frame * tempoFactor) % CYCLE_FRAMES;
  const crossing = cyclePos < CROSS_FRAMES;
  if (!crossing) return null;

  const crossProgress = cyclePos / CROSS_FRAMES;

  // Bus x position — left to right
  const startX = -BUS_WIDTH - 80;
  const endX = width + 80;
  const x = interpolate(crossProgress, [0, 1], [startX, endX], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Vertical centering with slight downward bias (bus drives along the lower-mid road)
  const yBase = height * 0.58 - BUS_HEIGHT / 2;

  // Suspension bounce — beatDecay drives bigger bounces
  const bobFreq = 0.045 + energy * 0.02;
  const bobAmp = 4 + beatDecay * 7 + energy * 4;
  const bob = Math.sin(frame * bobFreq * tempoFactor + musicalTime * 0.8) * bobAmp;

  // Body wobble — old suspension sway
  const tilt =
    Math.sin(frame * 0.025 * tempoFactor) * (1.2 + beatDecay * 1.8);

  // Wheel rotation — bass-driven
  const wheelBaseSpeed = 5 + bass * 22;
  const wheelSpin = (frame * wheelBaseSpeed * tempoFactor) % 360;

  // Headlight flash on onsets
  const hlBright = Math.min(1, 0.55 + onsetEnvelope * 0.55 + beatDecay * 0.15);

  // Color saturation tied to energy
  const saturation = Math.round(60 + energy * 35);

  // Hue shift cycles via chromaHue + slow musical time drift
  const hueShift = chromaHue + musicalTime * 8;

  // Swirl phase for spiral animation
  const swirlPhase = musicalTime * 1.4 + frame * 0.018;

  // Fade in/out at edges of cycle
  const fadeIn = interpolate(crossProgress, [0, 0.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(crossProgress, [0.95, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  // Atmospheric trail positions (in screen coords, anchored to bus)
  const dustX = x + 40;
  const dustY = yBase + BUS_HEIGHT * 0.78;
  const dustPhase = frame * 0.13;
  const heatX = x + BUS_WIDTH * 0.5;
  const heatY = yBase + BUS_HEIGHT * 0.92;

  // Glow halo — energy and chromaHue driven
  const glowR1 = 18 + energy * 35;
  const glowR2 = 40 + energy * 60;
  const haloFilter = [
    `drop-shadow(0 0 ${glowR1}px hsla(${chromaHue}, 80%, 60%, 0.55))`,
    `drop-shadow(0 0 ${glowR2}px hsla(${(chromaHue + 60) % 360}, 70%, 55%, 0.35))`,
  ].join(" ");

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        opacity,
      }}
    >
      {/* Heat shimmer rising from the road behind/under the bus */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <HeatShimmer x={heatX} y={heatY} phase={frame * 0.09} energy={energy} />
        <DustTrail
          x={dustX}
          y={dustY}
          phase={dustPhase}
          energy={energy}
          hue={chromaHue}
          goingRight={true}
        />
      </svg>

      {/* The bus itself — wrapped in glow filter */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: yBase + bob,
          width: BUS_WIDTH,
          height: BUS_HEIGHT,
          filter: haloFilter,
          willChange: "transform, left, top",
        }}
      >
        <FurthurBus
          hueShift={hueShift}
          saturation={saturation}
          bobOffset={0}
          tiltDeg={tilt}
          wheelSpin={wheelSpin}
          headlightBrightness={hlBright}
          swirlPhase={swirlPhase}
        />
      </div>
    </div>
  );
};
