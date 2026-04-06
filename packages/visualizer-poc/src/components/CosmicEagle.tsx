/**
 * CosmicEagle -- Majestic spread-wing thunderbird / cosmic eagle.
 * Richly detailed: 3-layer feathered wings (primary, secondary, covert),
 * individual feather shafts and barb suggestions, fierce head with crest,
 * sharp beak, Stealie lightning-bolt eye, fan of spread tail feathers,
 * gripping talons, star field behind, cosmic dust trail.
 * Layer 5 Nature, Tier A+++. Gentle soaring undulation synced to slowEnergy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

function hueToHex(h: number, s = 0.85, l = 0.6): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ------------------------------------------------------------------ */
/*  Helper: feather path builder                                       */
/* ------------------------------------------------------------------ */

/** Build a single feather with central shaft and barb lines. */
function feather(
  x1: number, y1: number,
  x2: number, y2: number,
  barbLen: number,
  side: 1 | -1,
): { shaft: string; barbs: string[] } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len * side;
  const ny = dx / len * side;
  const shaft = `M${x1},${y1} L${x2},${y2}`;
  const barbs: string[] = [];
  const count = Math.max(3, Math.floor(len / 6));
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const bx = x1 + dx * t;
    const by = y1 + dy * t;
    barbs.push(`M${bx},${by} L${bx + nx * barbLen},${by + ny * barbLen}`);
  }
  return { shaft, barbs };
}

/* ------------------------------------------------------------------ */
/*  Star field background                                              */
/* ------------------------------------------------------------------ */

function starField(seed: number, count: number): Array<{ cx: number; cy: number; r: number; o: number }> {
  const stars: Array<{ cx: number; cy: number; r: number; o: number }> = [];
  let s = seed;
  const rng = () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    stars.push({
      cx: rng() * 500,
      cy: rng() * 340,
      r: 0.3 + rng() * 1.2,
      o: 0.2 + rng() * 0.6,
    });
  }
  return stars;
}

const STARS = starField(42, 80);

/* ------------------------------------------------------------------ */
/*  SVG eagle component                                                */
/* ------------------------------------------------------------------ */

const EagleSVG: React.FC<{
  size: number;
  primaryColor: string;
  featherColor: string;
  secondaryColor: string;
  accentColor: string;
  eyeColor: string;
  dustColor: string;
  starColor: string;
  wingAngle: number;
  eyePulse: number;
  dustPhase: number;
  starTwinkle: number;
}> = ({
  size,
  primaryColor,
  featherColor,
  secondaryColor,
  accentColor,
  eyeColor,
  dustColor,
  starColor,
  wingAngle,
  eyePulse,
  dustPhase,
  starTwinkle,
}) => {
  const wLift = wingAngle * 14;

  /* -- primary feather tips (7 per wing) -- */
  const leftPrimaries: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const rightPrimaries: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const baseX = 120 - t * 95;
    const baseY = 72 - t * 28;
    const tipX = baseX - 12 - t * 6;
    const tipY = baseY - 14 - t * 4;
    leftPrimaries.push({ x1: baseX, y1: baseY, x2: tipX, y2: tipY });
    rightPrimaries.push({
      x1: 500 - baseX,
      y1: baseY,
      x2: 500 - tipX,
      y2: tipY,
    });
  }

  /* -- secondary feather row (6 per wing) -- */
  const leftSecondaries: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const rightSecondaries: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const baseX = 135 - t * 70;
    const baseY = 85 - t * 18;
    const tipX = baseX - 8 - t * 4;
    const tipY = baseY + 10 + t * 3;
    leftSecondaries.push({ x1: baseX, y1: baseY, x2: tipX, y2: tipY });
    rightSecondaries.push({
      x1: 500 - baseX,
      y1: baseY,
      x2: 500 - tipX,
      y2: tipY,
    });
  }

  /* -- covert feather row (8 per wing, smaller) -- */
  const leftCoverts: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const rightCoverts: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const baseX = 155 - t * 55;
    const baseY = 100 - t * 12;
    const tipX = baseX - 5;
    const tipY = baseY + 6;
    leftCoverts.push({ x1: baseX, y1: baseY, x2: tipX, y2: tipY });
    rightCoverts.push({
      x1: 500 - baseX,
      y1: baseY,
      x2: 500 - tipX,
      y2: tipY,
    });
  }

  /* -- tail feathers (6) -- */
  const tailFeathers: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = -0.5 + (i / 5) * 1.0; // spread from -0.5 to 0.5 radians
    const len = 40 + Math.abs(angle) * 8;
    tailFeathers.push({
      x1: 250,
      y1: 210,
      x2: 250 + Math.sin(angle) * len * 0.5,
      y2: 210 + Math.cos(angle) * len,
    });
  }

  /* -- cosmic dust trail particles -- */
  const dustParticles: Array<{ cx: number; cy: number; r: number; o: number }> = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const spread = Math.sin(t * Math.PI) * 60;
    const xBase = 80 + t * 340;
    const yBase = 110 + Math.sin(t * 3 + dustPhase) * 15;
    dustParticles.push({
      cx: xBase + Math.sin(dustPhase + i * 1.7) * spread * 0.3,
      cy: yBase + Math.cos(dustPhase * 0.7 + i * 2.1) * spread * 0.2 + 20,
      r: 0.8 + Math.sin(dustPhase + i) * 0.5,
      o: 0.15 + Math.sin(dustPhase * 0.5 + i * 0.9) * 0.1,
    });
  }

  return (
    <svg width={size} height={size * 0.68} viewBox="0 0 500 340" fill="none">
      <defs>
        <radialGradient id="eagle-eye-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={eyeColor} stopOpacity={0.9 * eyePulse} />
          <stop offset="60%" stopColor={eyeColor} stopOpacity={0.3 * eyePulse} />
          <stop offset="100%" stopColor={eyeColor} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="eagle-dust-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={dustColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={dustColor} stopOpacity="0" />
        </radialGradient>
        <filter id="eagle-neon">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="eagle-eye-bloom">
          <feGaussianBlur stdDeviation="4" result="bloom" />
          <feMerge>
            <feMergeNode in="bloom" />
            <feMergeNode in="bloom" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ======= Star field background ======= */}
      {STARS.map((star, i) => (
        <circle
          key={`star-${i}`}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          fill={starColor}
          opacity={star.o * (0.6 + 0.4 * Math.sin(starTwinkle + i * 1.3))}
        />
      ))}

      {/* ======= Cosmic dust trail behind wings ======= */}
      <ellipse cx="250" cy="140" rx="180" ry="40" fill="url(#eagle-dust-glow)" opacity="0.3" />
      {dustParticles.map((p, i) => (
        <circle
          key={`dust-${i}`}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill={dustColor}
          opacity={p.o}
        />
      ))}

      {/* ======= LEFT WING ======= */}
      <g transform={`translate(0, ${-wLift})`} filter="url(#eagle-neon)">
        {/* Wing silhouette outline */}
        <path
          d={`M250,120 C220,100 180,78 140,60 C110,48 75,38 45,35 C30,34 18,40 15,52 C18,65 35,72 55,78 C42,82 25,88 15,98 C15,108 30,110 50,108 C38,115 22,122 18,132 C22,140 42,135 65,125 C90,118 125,112 165,115 L250,120 Z`}
          stroke={primaryColor}
          strokeWidth="2"
          fill={primaryColor}
          fillOpacity="0.06"
          strokeLinejoin="round"
        />

        {/* Covert feathers (smallest, closest to body) */}
        {leftCoverts.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 3, 1);
          return (
            <g key={`lc-${i}`} opacity="0.4">
              <path d={ft.shaft} stroke={secondaryColor} strokeWidth="0.8" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={secondaryColor} strokeWidth="0.4" opacity="0.5" />
              ))}
            </g>
          );
        })}

        {/* Secondary feathers (middle layer, overlapping) */}
        {leftSecondaries.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 5, 1);
          return (
            <g key={`ls-${i}`} opacity="0.55">
              <path d={ft.shaft} stroke={featherColor} strokeWidth="1.2" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={featherColor} strokeWidth="0.5" opacity="0.6" />
              ))}
            </g>
          );
        })}

        {/* Primary feathers (longest, at wingtips) */}
        {leftPrimaries.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 7, 1);
          return (
            <g key={`lp-${i}`} opacity="0.75">
              <path d={ft.shaft} stroke={primaryColor} strokeWidth="1.5" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={featherColor} strokeWidth="0.6" opacity="0.55" />
              ))}
              {/* Feather tip accent */}
              <circle cx={f.x2} cy={f.y2} r="1.2" fill={accentColor} opacity="0.5" />
            </g>
          );
        })}

        {/* Wing chevron pattern (geometric accents) */}
        <path d="M55,62 L85,55 L115,62" stroke={accentColor} strokeWidth="0.8" opacity="0.3" fill="none" />
        <path d="M45,78 L80,70 L115,78" stroke={accentColor} strokeWidth="0.8" opacity="0.3" fill="none" />
        <path d="M40,95 L75,87 L110,95" stroke={accentColor} strokeWidth="0.8" opacity="0.25" fill="none" />
        <path d="M45,112 L80,104 L115,112" stroke={accentColor} strokeWidth="0.8" opacity="0.2" fill="none" />
      </g>

      {/* ======= RIGHT WING (mirrored) ======= */}
      <g transform={`translate(0, ${-wLift})`} filter="url(#eagle-neon)">
        <path
          d={`M250,120 C280,100 320,78 360,60 C390,48 425,38 455,35 C470,34 482,40 485,52 C482,65 465,72 445,78 C458,82 475,88 485,98 C485,108 470,110 450,108 C462,115 478,122 482,132 C478,140 458,135 435,125 C410,118 375,112 335,115 L250,120 Z`}
          stroke={primaryColor}
          strokeWidth="2"
          fill={primaryColor}
          fillOpacity="0.06"
          strokeLinejoin="round"
        />

        {/* Coverts */}
        {rightCoverts.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 3, -1);
          return (
            <g key={`rc-${i}`} opacity="0.4">
              <path d={ft.shaft} stroke={secondaryColor} strokeWidth="0.8" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={secondaryColor} strokeWidth="0.4" opacity="0.5" />
              ))}
            </g>
          );
        })}

        {/* Secondaries */}
        {rightSecondaries.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 5, -1);
          return (
            <g key={`rs-${i}`} opacity="0.55">
              <path d={ft.shaft} stroke={featherColor} strokeWidth="1.2" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={featherColor} strokeWidth="0.5" opacity="0.6" />
              ))}
            </g>
          );
        })}

        {/* Primaries */}
        {rightPrimaries.map((f, i) => {
          const ft = feather(f.x1, f.y1, f.x2, f.y2, 7, -1);
          return (
            <g key={`rp-${i}`} opacity="0.75">
              <path d={ft.shaft} stroke={primaryColor} strokeWidth="1.5" fill="none" />
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={featherColor} strokeWidth="0.6" opacity="0.55" />
              ))}
              <circle cx={f.x2} cy={f.y2} r="1.2" fill={accentColor} opacity="0.5" />
            </g>
          );
        })}

        {/* Wing chevrons */}
        <path d="M445,62 L415,55 L385,62" stroke={accentColor} strokeWidth="0.8" opacity="0.3" fill="none" />
        <path d="M455,78 L420,70 L385,78" stroke={accentColor} strokeWidth="0.8" opacity="0.3" fill="none" />
        <path d="M460,95 L425,87 L390,95" stroke={accentColor} strokeWidth="0.8" opacity="0.25" fill="none" />
        <path d="M455,112 L420,104 L385,112" stroke={accentColor} strokeWidth="0.8" opacity="0.2" fill="none" />
      </g>

      {/* ======= BODY ======= */}
      <g filter="url(#eagle-neon)">
        {/* Torso shape -- streamlined */}
        <path
          d="M232,112 C238,104 250,98 262,104 C268,112 270,135 268,160 C265,178 258,195 250,200 C242,195 235,178 232,160 C230,135 232,118 232,112 Z"
          stroke={primaryColor}
          strokeWidth="2"
          fill={primaryColor}
          fillOpacity="0.07"
        />

        {/* Chest feather texture -- overlapping scale pattern */}
        {[0, 1, 2, 3, 4].map((row) => {
          const y = 120 + row * 14;
          const w = 10 - row * 0.8;
          const count = 3 + (row < 3 ? 1 : 0);
          return Array.from({ length: count }, (_, col) => {
            const xOff = (col - (count - 1) / 2) * (w * 1.1);
            const cx = 250 + xOff;
            return (
              <path
                key={`chest-${row}-${col}`}
                d={`M${cx},${y} C${cx - w * 0.5},${y + 5} ${cx - w * 0.3},${y + 10} ${cx},${y + 12} C${cx + w * 0.3},${y + 10} ${cx + w * 0.5},${y + 5} ${cx},${y}`}
                stroke={featherColor}
                strokeWidth="0.7"
                fill="none"
                opacity={0.35 - row * 0.04}
              />
            );
          });
        })}

        {/* Body center line */}
        <line x1="250" y1="108" x2="250" y2="195" stroke={accentColor} strokeWidth="0.5" opacity="0.2" />

        {/* Geometric diamond accents down body */}
        <path d="M244,130 L250,125 L256,130 L250,135 Z" stroke={accentColor} strokeWidth="0.8" opacity="0.35" fill="none" />
        <path d="M245,148 L250,143 L255,148 L250,153 Z" stroke={accentColor} strokeWidth="0.8" opacity="0.3" fill="none" />
        <path d="M246,165 L250,161 L254,165 L250,169 Z" stroke={accentColor} strokeWidth="0.7" opacity="0.25" fill="none" />
      </g>

      {/* ======= HEAD ======= */}
      <g filter="url(#eagle-neon)">
        {/* Head shape */}
        <ellipse cx="250" cy="100" rx="14" ry="16" stroke={primaryColor} strokeWidth="2.2" fill={primaryColor} fillOpacity="0.05" />

        {/* Head plumage texture */}
        <path d="M240,94 C243,92 247,91 250,91" stroke={featherColor} strokeWidth="0.6" opacity="0.3" fill="none" />
        <path d="M260,94 C257,92 253,91 250,91" stroke={featherColor} strokeWidth="0.6" opacity="0.3" fill="none" />
        <path d="M241,98 C244,97 248,96 250,96" stroke={featherColor} strokeWidth="0.5" opacity="0.25" fill="none" />
        <path d="M259,98 C256,97 252,96 250,96" stroke={featherColor} strokeWidth="0.5" opacity="0.25" fill="none" />

        {/* Sharp beak -- hooked raptor beak */}
        <path
          d="M250,114 L243,126 C244,127 247,126 250,124 C253,126 256,127 257,126 L250,114 Z"
          stroke={primaryColor}
          strokeWidth="1.8"
          fill={primaryColor}
          fillOpacity="0.12"
          strokeLinejoin="round"
        />
        {/* Beak ridge line */}
        <line x1="250" y1="114" x2="250" y2="124" stroke={primaryColor} strokeWidth="0.8" opacity="0.4" />
        {/* Beak hook */}
        <path d="M250,114 C248,116 246,119 244,122" stroke={primaryColor} strokeWidth="1" opacity="0.5" fill="none" />
        <path d="M250,114 C252,116 254,119 256,122" stroke={primaryColor} strokeWidth="1" opacity="0.5" fill="none" />

        {/* ── Head crest / plume (5 feathers) ── */}
        <path d="M244,86 L238,70 L241,76" stroke={primaryColor} strokeWidth="1.3" fill="none" />
        <path d="M247,85 L243,68 L246,74" stroke={primaryColor} strokeWidth="1.3" fill="none" />
        <path d="M250,84 L250,65 L252,72" stroke={primaryColor} strokeWidth="1.4" fill="none" />
        <path d="M253,85 L257,68 L254,74" stroke={primaryColor} strokeWidth="1.3" fill="none" />
        <path d="M256,86 L262,70 L259,76" stroke={primaryColor} strokeWidth="1.3" fill="none" />
        {/* Crest feather barbs */}
        <path d="M238,70 L235,73 L240,72" stroke={featherColor} strokeWidth="0.7" opacity="0.4" fill="none" />
        <path d="M250,65 L247,68 L252,68" stroke={featherColor} strokeWidth="0.7" opacity="0.4" fill="none" />
        <path d="M262,70 L265,73 L260,72" stroke={featherColor} strokeWidth="0.7" opacity="0.4" fill="none" />
      </g>

      {/* ======= STEALIE EYE (lightning bolt through eye -- Dead twist) ======= */}
      <g filter="url(#eagle-eye-bloom)">
        {/* Eye glow halo */}
        <circle cx="250" cy="97" r="12" fill="url(#eagle-eye-glow)" />

        {/* Eye outer ring */}
        <circle cx="250" cy="97" r="7.5" stroke={eyeColor} strokeWidth="1.8" fill="none" />
        <circle cx="250" cy="97" r="7.5" fill={eyeColor} opacity={0.12 * eyePulse} />

        {/* Iris detail -- concentric ring */}
        <circle cx="250" cy="97" r="5" stroke={eyeColor} strokeWidth="0.8" opacity="0.5" fill="none" />

        {/* Iris radial lines */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={`iris-${deg}`}
              x1={250 + Math.cos(rad) * 3}
              y1={97 + Math.sin(rad) * 3}
              x2={250 + Math.cos(rad) * 6.5}
              y2={97 + Math.sin(rad) * 6.5}
              stroke={eyeColor}
              strokeWidth="0.4"
              opacity="0.3"
            />
          );
        })}

        {/* 13-point lightning bolt through pupil (Stealie signature) */}
        <path
          d="M248,89 L251,94 L249,94 L252,97 L249.5,97 L253,102 L250,102 L254,107 L251,100 L253,100 L250,97 L252,97 L249,92 L251,92 Z"
          fill={eyeColor}
          opacity={0.85 * eyePulse}
        />

        {/* Horizontal dividing line (Stealie skull reference) */}
        <line x1="242" y1="97" x2="258" y2="97" stroke={eyeColor} strokeWidth="0.9" opacity={0.45 * eyePulse} />

        {/* Fierce eye highlight */}
        <circle cx="248" cy="95" r="1" fill={eyeColor} opacity={0.7 * eyePulse} />
      </g>

      {/* ======= TAIL FEATHERS (6, fanned out) ======= */}
      <g filter="url(#eagle-neon)">
        {tailFeathers.map((tf, i) => {
          const ft = feather(tf.x1, tf.y1, tf.x2, tf.y2, 5, i < 3 ? 1 : -1);
          return (
            <g key={`tail-${i}`}>
              {/* Feather body outline */}
              <path
                d={`M${tf.x1},${tf.y1} Q${(tf.x1 + tf.x2) / 2 + (i < 3 ? -4 : 4)},${(tf.y1 + tf.y2) / 2} ${tf.x2},${tf.y2}`}
                stroke={primaryColor}
                strokeWidth="1.6"
                fill="none"
                opacity="0.7"
              />
              {/* Central shaft */}
              <path d={ft.shaft} stroke={featherColor} strokeWidth="1" fill="none" opacity="0.5" />
              {/* Barbs */}
              {ft.barbs.map((b, j) => (
                <path key={j} d={b} stroke={featherColor} strokeWidth="0.5" opacity="0.35" />
              ))}
              {/* Feather tip */}
              <circle cx={tf.x2} cy={tf.y2} r="1" fill={accentColor} opacity="0.4" />
            </g>
          );
        })}

        {/* Tail chevron bands */}
        <path d="M238,228 L250,222 L262,228" stroke={accentColor} strokeWidth="0.7" opacity="0.25" fill="none" />
        <path d="M235,238 L250,232 L265,238" stroke={accentColor} strokeWidth="0.6" opacity="0.2" fill="none" />
      </g>

      {/* ======= TALONS (2 feet, 3 clawed toes each) ======= */}
      <g filter="url(#eagle-neon)">
        {/* Left foot */}
        <g>
          {/* Leg */}
          <path d="M242,195 L236,218" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.6" />
          {/* Ankle joint */}
          <circle cx="236" cy="218" r="2" stroke={primaryColor} strokeWidth="1" fill="none" opacity="0.5" />
          {/* Toe 1 -- outer, curled grip */}
          <path d="M236,218 C230,224 226,230 224,234 C223,236 222,237 221,236" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M221,236 L219,232" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" /> {/* claw */}
          {/* Toe 2 -- center */}
          <path d="M236,218 C234,226 233,233 233,238 C233,240 232,241 231,240" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M231,240 L230,236" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Toe 3 -- inner */}
          <path d="M236,218 C238,225 240,232 242,237 C243,239 243,240 242,239" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M242,239 L243,235" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Toe joint knuckles */}
          <circle cx="228" cy="228" r="0.8" fill={primaryColor} opacity="0.3" />
          <circle cx="234" cy="230" r="0.8" fill={primaryColor} opacity="0.3" />
          <circle cx="240" cy="229" r="0.8" fill={primaryColor} opacity="0.3" />
        </g>

        {/* Right foot */}
        <g>
          <path d="M258,195 L264,218" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.6" />
          <circle cx="264" cy="218" r="2" stroke={primaryColor} strokeWidth="1" fill="none" opacity="0.5" />
          {/* Toe 1 */}
          <path d="M264,218 C270,224 274,230 276,234 C277,236 278,237 279,236" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M279,236 L281,232" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Toe 2 */}
          <path d="M264,218 C266,226 267,233 267,238 C267,240 268,241 269,240" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M269,240 L270,236" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Toe 3 */}
          <path d="M264,218 C262,225 260,232 258,237 C257,239 257,240 258,239" stroke={primaryColor} strokeWidth="1.3" fill="none" opacity="0.6" />
          <path d="M258,239 L257,235" stroke={primaryColor} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Knuckles */}
          <circle cx="272" cy="228" r="0.8" fill={primaryColor} opacity="0.3" />
          <circle cx="266" cy="230" r="0.8" fill={primaryColor} opacity="0.3" />
          <circle cx="260" cy="229" r="0.8" fill={primaryColor} opacity="0.3" />
        </g>
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const CosmicEagle: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue / 360;
  const bass = snap.bass;

  const baseSize = Math.min(width, height) * 0.52;

  /* -- Soaring wing undulation driven by slowEnergy -- */
  const soarCycle = Math.sin(frame / 40 * tempoFactor) * 0.5 + 0.5; // 0..1
  const wingAngle = interpolate(slowEnergy, [0.03, 0.25], [0.3, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }) * (0.7 + soarCycle * 0.3);

  /* -- Gentle vertical bob (soaring feel) -- */
  const flapY = Math.sin(frame / 50 * tempoFactor) * 4 * (0.4 + slowEnergy * 0.6);
  const tilt = Math.sin(frame / 90 * tempoFactor) * 1.5;

  /* -- Breathing scale driven by energy -- */
  const breathe = interpolate(energy, [0.03, 0.35], [0.94, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Onset punch -- */
  const onsetScale = 1 + snap.onsetEnvelope * 0.025;

  /* -- Eye glow pulses on beat -- */
  const eyePulse = interpolate(beatDecay, [0, 1], [0.5, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Overlay opacity -- */
  const opacity = interpolate(energy, [0.02, 0.3], [0.22, 0.52], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Colors: chromaHue-driven -- */
  const primaryColor = hueToHex(chromaHue, 0.6, 0.6);
  const featherColor = hueToHex((chromaHue + 0.08) % 1, 0.55, 0.52);
  const secondaryColor = hueToHex((chromaHue + 0.04) % 1, 0.5, 0.48);
  const accentColor = hueToHex((chromaHue + 0.5) % 1, 0.5, 0.55);
  const eyeColor = hueToHex((chromaHue + 0.15) % 1, 0.85, 0.62);
  const dustColor = hueToHex((chromaHue + 0.6) % 1, 0.4, 0.5);
  const starColor = hueToHex((chromaHue + 0.25) % 1, 0.3, 0.7);

  /* -- Glow radius scales with energy and bass -- */
  const bassGlow = 0.6 + bass * 0.8;
  const glowRadius =
    interpolate(energy, [0.05, 0.35], [5, 22], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * bassGlow;

  /* -- Cosmic dust phase -- */
  const dustPhase = (frame / 30) * tempoFactor;
  const starTwinkle = (frame / 15) * tempoFactor;

  const size = baseSize * breathe;

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
          transform: `translateY(${flapY}px) rotate(${tilt}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor}) drop-shadow(0 0 ${glowRadius * 1.5}px ${eyeColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <EagleSVG
          size={size}
          primaryColor={primaryColor}
          featherColor={featherColor}
          secondaryColor={secondaryColor}
          accentColor={accentColor}
          eyeColor={eyeColor}
          dustColor={dustColor}
          starColor={starColor}
          wingAngle={wingAngle}
          eyePulse={eyePulse}
          dustPhase={dustPhase}
          starTwinkle={starTwinkle}
        />
      </div>
    </div>
  );
};
