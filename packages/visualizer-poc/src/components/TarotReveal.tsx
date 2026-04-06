/**
 * TarotReveal — A+++ mystical tarot card overlay with rich Dead-themed illustrations.
 *
 * Ornate double border with corner flourishes and aged parchment background gradient.
 * Card back: intricate mandala pattern with concentric geometry.
 * Card face: 4 rotating Dead-themed designs:
 *   - The Fool (XIII): dancing skeleton with top hat
 *   - The Sun (XIX): stealie with radiating sun rays
 *   - The Moon (XVIII): crescent moon with howling wolf silhouette
 *   - Death (XIII): skeleton astride a horse
 *
 * Card flip animation between back and face with perspective illusion.
 * Mystical glow emanating from card edges, pulsing with beatDecay.
 * Floating dust/sparkle motes orbit the card, driven by energy.
 * slowEnergy drives card flip timing, chromaHue tints the mystical glow,
 * energy drives sparkle intensity and count.
 *
 * Cycle: 60s (1800 frames), 14s (420 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 1800;
const DURATION = 420;

/* ---------- Card art renderers ---------- */

interface TarotCard {
  name: string;
  numeral: string;
  renderSymbol: (cx: number, cy: number, size: number, frame: number, hue: number) => React.ReactNode;
}

/** The Fool — dancing skeleton with top hat, one foot raised, arms wide */
function renderFool(cx: number, cy: number, size: number, frame: number, hue: number): React.ReactNode {
  const s = size * 0.38;
  const dance = Math.sin(frame * 0.06) * 8;
  const armSwing = Math.sin(frame * 0.08) * 15;
  const legKick = Math.abs(Math.sin(frame * 0.07)) * 12;
  const tint = `hsl(${hue}, 40%, 80%)`;
  const bone = `hsl(${(hue + 30) % 360}, 20%, 90%)`;
  return (
    <g transform={`translate(${cx}, ${cy + dance * 0.3})`}>
      {/* Top hat */}
      <rect x={-s * 0.22} y={-s * 0.95} width={s * 0.44} height={s * 0.3} rx={2} fill="rgba(30,10,50,0.9)" stroke={tint} strokeWidth={0.8} />
      <rect x={-s * 0.32} y={-s * 0.67} width={s * 0.64} height={s * 0.06} rx={1} fill="rgba(30,10,50,0.9)" stroke={tint} strokeWidth={0.8} />
      {/* Hat band */}
      <rect x={-s * 0.2} y={-s * 0.78} width={s * 0.4} height={s * 0.04} fill={tint} opacity={0.6} />
      {/* Skull */}
      <ellipse cx={0} cy={-s * 0.5} rx={s * 0.18} ry={s * 0.2} fill={bone} opacity={0.85} />
      {/* Eye sockets */}
      <ellipse cx={-s * 0.07} cy={-s * 0.54} rx={s * 0.04} ry={s * 0.05} fill="rgba(20,5,40,0.9)" />
      <ellipse cx={s * 0.07} cy={-s * 0.54} rx={s * 0.04} ry={s * 0.05} fill="rgba(20,5,40,0.9)" />
      {/* Nose triangle */}
      <polygon points={`0,${-s * 0.47} ${-s * 0.025},${-s * 0.42} ${s * 0.025},${-s * 0.42}`} fill="rgba(20,5,40,0.7)" />
      {/* Jaw / grin */}
      <path d={`M ${-s * 0.1} ${-s * 0.38} Q 0 ${-s * 0.32} ${s * 0.1} ${-s * 0.38}`} fill="none" stroke="rgba(20,5,40,0.7)" strokeWidth={0.8} />
      {/* Spine / torso */}
      <line x1={0} y1={-s * 0.3} x2={0} y2={s * 0.15} stroke={bone} strokeWidth={2} opacity={0.8} />
      {/* Ribs */}
      {[-0.18, -0.08, 0.02].map((ry, i) => (
        <React.Fragment key={`rib-${i}`}>
          <path d={`M ${-s * 0.15} ${s * ry} Q 0 ${s * (ry + 0.04)} ${s * 0.15} ${s * ry}`} fill="none" stroke={bone} strokeWidth={1.2} opacity={0.6} />
        </React.Fragment>
      ))}
      {/* Arms — swinging outward */}
      <line x1={0} y1={-s * 0.2} x2={-s * 0.35} y2={-s * 0.05 + armSwing * 0.3} stroke={bone} strokeWidth={1.8} opacity={0.8} strokeLinecap="round" />
      <line x1={-s * 0.35} y1={-s * 0.05 + armSwing * 0.3} x2={-s * 0.45} y2={-s * 0.2 + armSwing * 0.5} stroke={bone} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
      <line x1={0} y1={-s * 0.2} x2={s * 0.35} y2={-s * 0.05 - armSwing * 0.3} stroke={bone} strokeWidth={1.8} opacity={0.8} strokeLinecap="round" />
      <line x1={s * 0.35} y1={-s * 0.05 - armSwing * 0.3} x2={s * 0.45} y2={-s * 0.2 - armSwing * 0.5} stroke={bone} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
      {/* Pelvis */}
      <ellipse cx={0} cy={s * 0.18} rx={s * 0.1} ry={s * 0.04} fill={bone} opacity={0.6} />
      {/* Legs — one kicking */}
      <line x1={0} y1={s * 0.18} x2={-s * 0.12} y2={s * 0.5} stroke={bone} strokeWidth={1.8} opacity={0.8} strokeLinecap="round" />
      <line x1={-s * 0.12} y1={s * 0.5} x2={-s * 0.15} y2={s * 0.72} stroke={bone} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
      <line x1={0} y1={s * 0.18} x2={s * 0.15} y2={s * 0.4 - legKick * 0.2} stroke={bone} strokeWidth={1.8} opacity={0.8} strokeLinecap="round" />
      <line x1={s * 0.15} y1={s * 0.4 - legKick * 0.2} x2={s * 0.25} y2={s * 0.55 - legKick * 0.4} stroke={bone} strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
      {/* Rose in hand */}
      <circle cx={-s * 0.47} cy={-s * 0.22 + armSwing * 0.5} r={s * 0.05} fill="rgba(200,40,60,0.7)" />
      <line x1={-s * 0.47} y1={-s * 0.17 + armSwing * 0.5} x2={-s * 0.47} y2={-s * 0.05 + armSwing * 0.5} stroke="rgba(60,120,40,0.6)" strokeWidth={1} />
    </g>
  );
}

/** The Sun — stealie with radiating sun rays */
function renderSun(cx: number, cy: number, size: number, frame: number, hue: number): React.ReactNode {
  const s = size * 0.36;
  const rotation = frame * 0.15;
  const pulseR = 1 + Math.sin(frame * 0.04) * 0.05;
  const rayCount = 16;
  const warmHue = (hue + 30) % 360;
  return (
    <g>
      {/* Outer sun rays — alternating long/short, rotating */}
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        {Array.from({ length: rayCount }, (_, i) => {
          const angle = (i / rayCount) * Math.PI * 2;
          const long = i % 2 === 0;
          const rInner = s * 0.52 * pulseR;
          const rOuter = s * (long ? 0.95 : 0.72) * pulseR;
          const halfW = (long ? 0.06 : 0.04) * s;
          const a1 = angle - halfW / rInner;
          const a2 = angle + halfW / rInner;
          const x1 = cx + Math.cos(a1) * rInner;
          const y1 = cy + Math.sin(a1) * rInner;
          const x2 = cx + Math.cos(a2) * rInner;
          const y2 = cy + Math.sin(a2) * rInner;
          const xTip = cx + Math.cos(angle) * rOuter;
          const yTip = cy + Math.sin(angle) * rOuter;
          return (
            <polygon
              key={`ray-${i}`}
              points={`${x1},${y1} ${xTip},${yTip} ${x2},${y2}`}
              fill={`hsla(${warmHue}, 70%, ${long ? 65 : 55}%, ${long ? 0.7 : 0.5})`}
            />
          );
        })}
      </g>
      {/* Stealie circle */}
      <circle cx={cx} cy={cy} r={s * 0.45 * pulseR} fill="rgba(25,10,55,0.95)" stroke={`hsla(${warmHue}, 60%, 65%, 0.8)`} strokeWidth={2} />
      {/* Lightning bolt through skull */}
      <path
        d={`M ${cx - s * 0.04} ${cy - s * 0.35} L ${cx - s * 0.1} ${cy - s * 0.05} L ${cx + s * 0.02} ${cy - s * 0.08} L ${cx - s * 0.04} ${cy + s * 0.15} L ${cx + s * 0.1} ${cy + s * 0.02} L ${cx - s * 0.02} ${cy + s * 0.05} L ${cx + s * 0.04} ${cy + s * 0.32}`}
        fill="none"
        stroke={`hsla(${warmHue}, 80%, 70%, 0.9)`}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Skull outline */}
      <ellipse cx={cx} cy={cy - s * 0.05} rx={s * 0.28} ry={s * 0.3} fill="none" stroke={`hsla(${warmHue}, 40%, 85%, 0.5)`} strokeWidth={1} />
      {/* Eye sockets */}
      <circle cx={cx - s * 0.1} cy={cy - s * 0.1} r={s * 0.06} fill={`hsla(${warmHue}, 60%, 70%, 0.4)`} />
      <circle cx={cx + s * 0.1} cy={cy - s * 0.1} r={s * 0.06} fill={`hsla(${warmHue}, 60%, 70%, 0.4)`} />
      {/* Jaw */}
      <path d={`M ${cx - s * 0.15} ${cy + s * 0.08} Q ${cx} ${cy + s * 0.25} ${cx + s * 0.15} ${cy + s * 0.08}`} fill="none" stroke={`hsla(${warmHue}, 40%, 80%, 0.4)`} strokeWidth={1} />
    </g>
  );
}

/** The Moon — crescent with howling wolf silhouette */
function renderMoon(cx: number, cy: number, size: number, frame: number, hue: number): React.ReactNode {
  const s = size * 0.38;
  const moonHue = (hue + 200) % 360;
  const shimmer = Math.sin(frame * 0.03) * 0.1;
  // Small twinkling stars
  const starPositions = [
    { x: -0.7, y: -0.6, r: 2.2 }, { x: 0.6, y: -0.75, r: 1.8 },
    { x: -0.5, y: -0.85, r: 1.5 }, { x: 0.8, y: -0.4, r: 2 },
    { x: -0.85, y: -0.3, r: 1.3 }, { x: 0.3, y: -0.9, r: 1.6 },
    { x: -0.2, y: -0.95, r: 1.4 }, { x: 0.75, y: -0.65, r: 1.7 },
  ];
  return (
    <g>
      {/* Background stars */}
      {starPositions.map((star, si) => {
        const twinkle = 0.4 + Math.sin(frame * 0.05 + si * 1.7) * 0.4;
        return (
          <circle
            key={`mstar-${si}`}
            cx={cx + star.x * s}
            cy={cy + star.y * s}
            r={star.r}
            fill={`hsla(${moonHue + 40}, 30%, 90%, ${twinkle})`}
          />
        );
      })}
      {/* Crescent moon */}
      <circle cx={cx + s * 0.05} cy={cy - s * 0.35} r={s * 0.32} fill={`hsla(${moonHue}, 30%, 85%, ${0.7 + shimmer})`} />
      <circle cx={cx + s * 0.18} cy={cy - s * 0.4} r={s * 0.27} fill="rgba(20,8,50,0.98)" />
      {/* Moon surface detail */}
      <circle cx={cx - s * 0.05} cy={cy - s * 0.3} r={s * 0.04} fill={`hsla(${moonHue}, 20%, 75%, 0.3)`} />
      <circle cx={cx + s * 0.02} cy={cy - s * 0.42} r={s * 0.03} fill={`hsla(${moonHue}, 20%, 75%, 0.25)`} />
      {/* Wolf silhouette — sitting on ridge, head up howling */}
      <path
        d={`
          M ${cx - s * 0.35} ${cy + s * 0.55}
          L ${cx - s * 0.3} ${cy + s * 0.2}
          Q ${cx - s * 0.28} ${cy + s * 0.05} ${cx - s * 0.2} ${cy + s * 0.0}
          L ${cx - s * 0.18} ${cy - s * 0.15}
          Q ${cx - s * 0.17} ${cy - s * 0.22} ${cx - s * 0.13} ${cy - s * 0.18}
          L ${cx - s * 0.15} ${cy - s * 0.08}
          Q ${cx - s * 0.12} ${cy - s * 0.12} ${cx - s * 0.08} ${cy - s * 0.12}
          L ${cx - s * 0.05} ${cy - s * 0.05}
          Q ${cx - s * 0.02} ${cy + s * 0.02} ${cx} ${cy + s * 0.05}
          L ${cx + s * 0.02} ${cy + s * 0.15}
          Q ${cx + s * 0.05} ${cy + s * 0.35} ${cx + s * 0.08} ${cy + s * 0.55}
          Z
        `}
        fill="rgba(15,5,35,0.95)"
        stroke={`hsla(${moonHue}, 20%, 50%, 0.3)`}
        strokeWidth={0.5}
      />
      {/* Snout open howling */}
      <path
        d={`M ${cx - s * 0.15} ${cy - s * 0.08} L ${cx - s * 0.22} ${cy - s * 0.12} L ${cx - s * 0.18} ${cy - s * 0.05}`}
        fill="rgba(15,5,35,0.9)"
        stroke={`hsla(${moonHue}, 20%, 50%, 0.2)`}
        strokeWidth={0.4}
      />
      {/* Ground ridge */}
      <path
        d={`M ${cx - s * 0.9} ${cy + s * 0.55} Q ${cx - s * 0.5} ${cy + s * 0.48} ${cx} ${cy + s * 0.55} Q ${cx + s * 0.5} ${cy + s * 0.62} ${cx + s * 0.9} ${cy + s * 0.55}`}
        fill="rgba(15,5,35,0.8)"
        stroke={`hsla(${moonHue}, 15%, 40%, 0.3)`}
        strokeWidth={0.5}
      />
      {/* Wolf eye — tiny glint */}
      <circle cx={cx - s * 0.11} cy={cy - s * 0.1} r={1} fill={`hsla(${(hue + 50) % 360}, 60%, 70%, 0.8)`} />
    </g>
  );
}

/** Death — skeleton astride a horse, banner flowing */
function renderDeath(cx: number, cy: number, size: number, frame: number, hue: number): React.ReactNode {
  const s = size * 0.38;
  const sway = Math.sin(frame * 0.04) * 3;
  const bannerWave = Math.sin(frame * 0.06) * 5;
  const deathHue = (hue + 260) % 360;
  const bone = `hsla(${deathHue}, 15%, 88%, 0.85)`;
  const dark = "rgba(15,5,35,0.9)";
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      {/* Horse body */}
      <ellipse cx={s * 0.05} cy={s * 0.2} rx={s * 0.4} ry={s * 0.18} fill={dark} stroke={`hsla(${deathHue}, 20%, 50%, 0.4)`} strokeWidth={0.8} />
      {/* Horse neck */}
      <path d={`M ${-s * 0.2} ${s * 0.1} Q ${-s * 0.35} ${-s * 0.1} ${-s * 0.3} ${-s * 0.3}`} fill="none" stroke={dark} strokeWidth={s * 0.12} strokeLinecap="round" />
      {/* Horse head */}
      <ellipse cx={-s * 0.32} cy={-s * 0.38} rx={s * 0.1} ry={s * 0.12} fill={dark} stroke={`hsla(${deathHue}, 20%, 50%, 0.3)`} strokeWidth={0.6} transform={`rotate(-15 ${-s * 0.32} ${-s * 0.38})`} />
      {/* Horse eye */}
      <circle cx={-s * 0.36} cy={-s * 0.4} r={s * 0.02} fill={`hsla(${(hue + 10) % 360}, 50%, 60%, 0.7)`} />
      {/* Horse ears */}
      <line x1={-s * 0.28} y1={-s * 0.48} x2={-s * 0.25} y2={-s * 0.56} stroke={dark} strokeWidth={2} strokeLinecap="round" />
      <line x1={-s * 0.34} y1={-s * 0.48} x2={-s * 0.36} y2={-s * 0.56} stroke={dark} strokeWidth={2} strokeLinecap="round" />
      {/* Horse legs */}
      {[
        { x: -s * 0.25, back: false },
        { x: -s * 0.12, back: false },
        { x: s * 0.2, back: true },
        { x: s * 0.32, back: true },
      ].map((leg, li) => {
        const stride = Math.sin(frame * 0.05 + li * 1.5) * 4;
        return (
          <line
            key={`hleg-${li}`}
            x1={leg.x}
            y1={s * 0.35}
            x2={leg.x + stride}
            y2={s * 0.65}
            stroke={dark}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      })}
      {/* Horse tail */}
      <path d={`M ${s * 0.4} ${s * 0.15} Q ${s * 0.55} ${s * 0.1 + sway} ${s * 0.5} ${s * 0.3 + sway * 0.5}`} fill="none" stroke={dark} strokeWidth={2} strokeLinecap="round" />
      {/* Skeleton rider — torso */}
      <line x1={-s * 0.05} y1={s * 0.05} x2={-s * 0.05} y2={-s * 0.25 + sway * 0.2} stroke={bone} strokeWidth={2} strokeLinecap="round" />
      {/* Rider skull */}
      <circle cx={-s * 0.05} cy={-s * 0.35 + sway * 0.2} r={s * 0.09} fill={bone} />
      <circle cx={-s * 0.08} cy={-s * 0.37 + sway * 0.2} r={s * 0.025} fill={dark} />
      <circle cx={-s * 0.02} cy={-s * 0.37 + sway * 0.2} r={s * 0.025} fill={dark} />
      <path d={`M ${-s * 0.08} ${-s * 0.3 + sway * 0.2} L ${-s * 0.02} ${-s * 0.3 + sway * 0.2}`} stroke={dark} strokeWidth={0.8} />
      {/* Hood / cowl */}
      <path
        d={`M ${-s * 0.15} ${-s * 0.2 + sway * 0.2} Q ${-s * 0.05} ${-s * 0.5 + sway * 0.2} ${s * 0.06} ${-s * 0.2 + sway * 0.2}`}
        fill="none"
        stroke={`hsla(${deathHue}, 20%, 45%, 0.5)`}
        strokeWidth={1.2}
      />
      {/* Rider ribs */}
      {[-0.12, -0.05, 0.02].map((ry, i) => (
        <path key={`rrib-${i}`} d={`M ${-s * 0.15} ${s * ry + sway * 0.15} Q ${-s * 0.05} ${s * (ry + 0.03)} ${s * 0.05} ${s * ry + sway * 0.15}`} fill="none" stroke={bone} strokeWidth={1} opacity={0.6} />
      ))}
      {/* Rider arm holding scythe */}
      <line x1={-s * 0.05} y1={-s * 0.15 + sway * 0.15} x2={s * 0.2} y2={-s * 0.2 + sway * 0.3} stroke={bone} strokeWidth={1.5} strokeLinecap="round" />
      {/* Scythe handle */}
      <line x1={s * 0.18} y1={-s * 0.6 + sway * 0.2} x2={s * 0.22} y2={s * 0.3} stroke={`hsla(${deathHue}, 15%, 55%, 0.7)`} strokeWidth={1.5} strokeLinecap="round" />
      {/* Scythe blade */}
      <path
        d={`M ${s * 0.18} ${-s * 0.6 + sway * 0.2} Q ${s * 0.4} ${-s * 0.55 + sway * 0.2} ${s * 0.35} ${-s * 0.4 + sway * 0.2}`}
        fill="none"
        stroke={`hsla(${deathHue}, 30%, 75%, 0.8)`}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Banner from scythe */}
      <path
        d={`M ${s * 0.2} ${-s * 0.45 + sway * 0.2} Q ${s * 0.35} ${-s * 0.42 + bannerWave * 0.3} ${s * 0.45} ${-s * 0.48 + bannerWave * 0.5} Q ${s * 0.5} ${-s * 0.44 + bannerWave * 0.4} ${s * 0.55} ${-s * 0.5 + bannerWave * 0.6}`}
        fill="none"
        stroke={`hsla(${deathHue}, 40%, 60%, 0.5)`}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* Rose on ground */}
      <circle cx={s * 0.35} cy={s * 0.6} r={s * 0.04} fill="rgba(180,30,50,0.6)" />
      <line x1={s * 0.35} y1={s * 0.64} x2={s * 0.35} y2={s * 0.72} stroke="rgba(50,100,30,0.5)" strokeWidth={0.8} />
    </g>
  );
}

const CARDS: TarotCard[] = [
  { name: "The Fool", numeral: "0", renderSymbol: renderFool },
  { name: "The Sun", numeral: "XIX", renderSymbol: renderSun },
  { name: "The Moon", numeral: "XVIII", renderSymbol: renderMoon },
  { name: "Death", numeral: "XIII", renderSymbol: renderDeath },
];

/* ---------- Card back mandala pattern ---------- */

function renderCardBackMandala(
  cardW: number,
  cardH: number,
  frame: number,
  hue: number,
  tempo: number,
): React.ReactNode {
  const cx = cardW / 2;
  const cy = cardH / 2;
  const mandalaR = Math.min(cardW, cardH) * 0.32;
  const rot = frame * 0.08 * tempo;
  const mandalaColor = `hsla(${(hue + 270) % 360}, 45%, 55%, 0.5)`;
  const mandalaColorFaint = `hsla(${(hue + 270) % 360}, 35%, 50%, 0.25)`;
  const goldMandala = `hsla(${(hue + 40) % 360}, 55%, 65%, 0.45)`;

  return (
    <g>
      {/* Concentric circles */}
      {[1.0, 0.75, 0.5, 0.28].map((scale, i) => (
        <circle
          key={`mc-${i}`}
          cx={cx}
          cy={cy}
          r={mandalaR * scale}
          fill="none"
          stroke={i % 2 === 0 ? mandalaColor : goldMandala}
          strokeWidth={i === 0 ? 1.5 : 0.8}
          strokeDasharray={i === 2 ? "3 2" : undefined}
        />
      ))}
      {/* Rotating petal geometry — outer ring */}
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const x1 = cx + Math.cos(angle) * mandalaR * 0.28;
          const y1 = cy + Math.sin(angle) * mandalaR * 0.28;
          const x2 = cx + Math.cos(angle) * mandalaR * 0.95;
          const y2 = cy + Math.sin(angle) * mandalaR * 0.95;
          const cpx = cx + Math.cos(angle + 0.3) * mandalaR * 0.65;
          const cpy = cy + Math.sin(angle + 0.3) * mandalaR * 0.65;
          return (
            <path
              key={`petal-${i}`}
              d={`M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`}
              fill="none"
              stroke={i % 3 === 0 ? goldMandala : mandalaColorFaint}
              strokeWidth={0.8}
            />
          );
        })}
      </g>
      {/* Counter-rotating inner petals */}
      <g transform={`rotate(${-rot * 1.3} ${cx} ${cy})`}>
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const r1 = mandalaR * 0.12;
          const r2 = mandalaR * 0.48;
          const spread = 0.2;
          const x0 = cx + Math.cos(angle) * r1;
          const y0 = cy + Math.sin(angle) * r1;
          const xL = cx + Math.cos(angle - spread) * r2;
          const yL = cy + Math.sin(angle - spread) * r2;
          const xR = cx + Math.cos(angle + spread) * r2;
          const yR = cy + Math.sin(angle + spread) * r2;
          return (
            <path
              key={`ipetal-${i}`}
              d={`M ${x0} ${y0} L ${xL} ${yL} A ${r2} ${r2} 0 0 1 ${xR} ${yR} Z`}
              fill={`hsla(${(hue + 260) % 360}, 30%, 40%, 0.12)`}
              stroke={mandalaColorFaint}
              strokeWidth={0.6}
            />
          );
        })}
      </g>
      {/* Center jewel */}
      <circle cx={cx} cy={cy} r={mandalaR * 0.1} fill={`hsla(${(hue + 40) % 360}, 50%, 60%, 0.4)`} />
      <circle cx={cx} cy={cy} r={mandalaR * 0.05} fill={`hsla(${(hue + 40) % 360}, 60%, 75%, 0.6)`} />
      {/* Diamond accents at cardinal points */}
      {[0, 1, 2, 3].map((qi) => {
        const angle = (qi / 4) * Math.PI * 2 - Math.PI / 2;
        const dx = cx + Math.cos(angle) * mandalaR * 0.87;
        const dy = cy + Math.sin(angle) * mandalaR * 0.87;
        const ds = 5;
        return (
          <polygon
            key={`diamond-${qi}`}
            points={`${dx},${dy - ds} ${dx + ds * 0.6},${dy} ${dx},${dy + ds} ${dx - ds * 0.6},${dy}`}
            fill={goldMandala}
            stroke={mandalaColor}
            strokeWidth={0.4}
          />
        );
      })}
    </g>
  );
}

/* ---------- Sparkle motes ---------- */

interface Mote {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  phase: number;
  drift: number;
}

function generateMotes(seed: number, count: number): Mote[] {
  const rng = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: rng() * Math.PI * 2,
    radius: 0.55 + rng() * 0.5,
    speed: 0.003 + rng() * 0.008,
    size: 1 + rng() * 2.5,
    phase: rng() * Math.PI * 2,
    drift: (rng() - 0.5) * 0.01,
  }));
}

/* ---------- Corner flourish ---------- */

function renderCornerFlourish(
  x: number,
  y: number,
  sx: number,
  sy: number,
  color: string,
  idx: number,
): React.ReactNode {
  return (
    <g key={`fl-${idx}`} transform={`translate(${x}, ${y}) scale(${sx}, ${sy})`}>
      {/* Main curl */}
      <path
        d="M 0 0 Q 12 0 14 6 Q 16 12 10 14 Q 6 15 4 12"
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Inner spiral */}
      <path
        d="M 2 2 Q 8 1 10 5 Q 12 9 7 10"
        fill="none"
        stroke={color}
        strokeWidth={0.7}
        opacity={0.6}
        strokeLinecap="round"
      />
      {/* Dot accent */}
      <circle cx={6} cy={7} r={1.2} fill={color} opacity={0.5} />
      {/* Extending tendril */}
      <path
        d="M 14 6 Q 18 3 22 5"
        fill="none"
        stroke={color}
        strokeWidth={0.6}
        opacity={0.4}
        strokeLinecap="round"
      />
      <path
        d="M 10 14 Q 8 18 10 22"
        fill="none"
        stroke={color}
        strokeWidth={0.6}
        opacity={0.4}
        strokeLinecap="round"
      />
    </g>
  );
}

/* ---------- Aged parchment gradient defs ---------- */

function renderDefs(cardW: number, cardH: number, hue: number, glowIntensity: number): React.ReactNode {
  const glowHue = (hue + 30) % 360;
  return (
    <defs>
      {/* Parchment face gradient */}
      <radialGradient id="tarot-parchment" cx="50%" cy="40%" r="65%">
        <stop offset="0%" stopColor={`hsla(${(hue + 35) % 360}, 25%, 22%, 0.98)`} />
        <stop offset="50%" stopColor="rgba(28,12,55,0.97)" />
        <stop offset="100%" stopColor="rgba(15,5,35,0.99)" />
      </radialGradient>
      {/* Parchment back gradient */}
      <radialGradient id="tarot-back" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor="rgba(35,18,65,0.95)" />
        <stop offset="100%" stopColor="rgba(18,6,42,0.98)" />
      </radialGradient>
      {/* Edge glow filter */}
      <filter id="tarot-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceGraphic" stdDeviation={4 + glowIntensity * 6} result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values={`0 0 0 0 ${0.5 + Math.sin(glowHue * Math.PI / 180) * 0.3}  0 0 0 0 ${0.3 + Math.cos(glowHue * Math.PI / 180) * 0.2}  0 0 0 0 ${0.6}  0 0 0 ${0.3 + glowIntensity * 0.4} 0`}
        />
      </filter>
      {/* Sparkle filter */}
      <filter id="tarot-sparkle" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={1.5} />
      </filter>
      {/* Parchment texture noise — simulated with fractal circles */}
      <pattern id="tarot-aged" x={0} y={0} width={cardW} height={cardH} patternUnits="userSpaceOnUse">
        {Array.from({ length: 20 }, (_, i) => {
          const rng = seeded(i * 31 + 7);
          return (
            <circle
              key={`age-${i}`}
              cx={rng() * cardW}
              cy={rng() * cardH}
              r={2 + rng() * 8}
              fill={`rgba(${140 + rng() * 40}, ${100 + rng() * 30}, ${60 + rng() * 20}, ${0.02 + rng() * 0.03})`}
            />
          );
        })}
      </pattern>
    </defs>
  );
}

/* ---------- Main component ---------- */

interface Props {
  frames: EnhancedFrameData[];
}

export const TarotReveal: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    energy,
    slowEnergy,
    beatDecay,
    chromaHue,
  } = audio;

  // Card selection — deterministic per cycle
  const cycleIndex = Math.floor(frame / CYCLE);
  const rng = seeded(cycleIndex * 777 + 1234);
  const cardIdx = Math.floor(rng() * CARDS.length);
  const card = CARDS[cardIdx];

  // Motes — deterministic per cycle, count driven by energy
  const moteCount = Math.round(interpolate(energy, [0.02, 0.4], [8, 22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  const motes = React.useMemo(() => generateMotes(cycleIndex * 999 + 42, 24), [cycleIndex]);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade in/out
  const fadeIn = interpolate(progress, [0, 0.07], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.02, 0.25], [0.4, 0.75], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;
  if (opacity < 0.01) return null;

  // Card dimensions
  const cardW = 160;
  const cardH = 245;
  const cardX = width * 0.14;
  const cardY = height * 0.32;

  // Flip animation driven by slowEnergy
  const flipSpeed = interpolate(slowEnergy, [0.02, 0.25], [0.7, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flipProgress = interpolate(progress * flipSpeed, [0.05, 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const flipAngle = flipProgress * Math.PI;
  const scaleX = Math.cos(flipAngle);
  const showFace = flipProgress > 0.5;

  // Gentle hover — tempo-scaled
  const hoverY = Math.sin(frame * 0.018 * tempoFactor) * 5;
  const hoverRotation = Math.sin(frame * 0.013 * tempoFactor) * 1.8;

  // Mystical glow intensity — pulses with beatDecay
  const glowIntensity = interpolate(beatDecay, [0, 1], [0.15, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Color theming
  const hue = chromaHue;
  const goldHue = (hue + 35) % 360;
  const gold = `hsla(${goldHue}, 60%, 62%, 0.85)`;
  const goldBright = `hsla(${goldHue}, 65%, 72%, 0.95)`;
  const goldFaint = `hsla(${goldHue}, 50%, 55%, 0.4)`;

  // Glow color — tinted by chromaHue
  const glowColor = `hsla(${(hue + 20) % 360}, 55%, 55%, ${0.15 + glowIntensity * 0.35})`;
  const glowColorOuter = `hsla(${(hue + 280) % 360}, 40%, 45%, ${0.08 + glowIntensity * 0.15})`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          willChange: "opacity",
        }}
      >
        {renderDefs(cardW, cardH, hue, glowIntensity)}

        {/* Mystical glow behind card — pulses with beatDecay */}
        <ellipse
          cx={cardX + cardW / 2}
          cy={cardY + cardH / 2 + hoverY}
          rx={cardW * 0.7 + glowIntensity * 15}
          ry={cardH * 0.6 + glowIntensity * 12}
          fill={glowColor}
          filter="url(#tarot-glow)"
        />
        <ellipse
          cx={cardX + cardW / 2}
          cy={cardY + cardH / 2 + hoverY}
          rx={cardW * 0.9 + glowIntensity * 20}
          ry={cardH * 0.75 + glowIntensity * 18}
          fill={glowColorOuter}
          filter="url(#tarot-glow)"
        />

        {/* Floating sparkle motes */}
        {motes.slice(0, moteCount).map((mote, mi) => {
          const a = mote.angle + frame * mote.speed * tempoFactor + mote.drift * frame;
          const r = mote.radius * Math.min(cardW, cardH) * 0.65;
          const mx = cardX + cardW / 2 + Math.cos(a) * r;
          const my = cardY + cardH / 2 + Math.sin(a) * r + hoverY;
          const twinkle = 0.3 + Math.sin(frame * 0.08 + mote.phase) * 0.5 + energy * 0.3;
          const moteSize = mote.size * (0.5 + energy * 0.8);
          const moteHue = (hue + mi * 25) % 360;
          return (
            <circle
              key={`mote-${mi}`}
              cx={mx}
              cy={my}
              r={moteSize}
              fill={`hsla(${moteHue}, 50%, 80%, ${Math.max(0, Math.min(1, twinkle))})`}
              filter="url(#tarot-sparkle)"
            />
          );
        })}

        {/* Card body — transformed for flip + hover */}
        <g
          transform={`translate(${cardX + cardW / 2}, ${cardY + cardH / 2 + hoverY}) rotate(${hoverRotation}) scale(${Math.abs(scaleX)}, 1) translate(${-cardW / 2}, ${-cardH / 2})`}
        >
          {!showFace ? (
            /* ===== CARD BACK ===== */
            <>
              {/* Card base */}
              <rect x={0} y={0} width={cardW} height={cardH} rx={8} fill="url(#tarot-back)" stroke={gold} strokeWidth={3} />
              {/* Outer decorative border */}
              <rect x={6} y={6} width={cardW - 12} height={cardH - 12} rx={5} fill="none" stroke={gold} strokeWidth={1.2} />
              {/* Inner decorative border */}
              <rect x={14} y={14} width={cardW - 28} height={cardH - 28} rx={3} fill="none" stroke={goldFaint} strokeWidth={0.8} strokeDasharray="4 3" />

              {/* Corner flourishes on back */}
              {[
                { x: 10, y: 10, sx: 1, sy: 1 },
                { x: cardW - 10, y: 10, sx: -1, sy: 1 },
                { x: 10, y: cardH - 10, sx: 1, sy: -1 },
                { x: cardW - 10, y: cardH - 10, sx: -1, sy: -1 },
              ].map((c, ci) => renderCornerFlourish(c.x, c.y, c.sx, c.sy, gold, ci + 10))}

              {/* Mandala pattern */}
              {renderCardBackMandala(cardW, cardH, frame, hue, tempoFactor)}

              {/* Aged texture overlay */}
              <rect x={8} y={8} width={cardW - 16} height={cardH - 16} rx={4} fill="url(#tarot-aged)" />
            </>
          ) : (
            /* ===== CARD FACE ===== */
            <>
              {/* Card base with parchment */}
              <rect x={0} y={0} width={cardW} height={cardH} rx={8} fill="url(#tarot-parchment)" stroke={gold} strokeWidth={3} />
              {/* Aged texture */}
              <rect x={2} y={2} width={cardW - 4} height={cardH - 4} rx={7} fill="url(#tarot-aged)" />
              {/* Outer decorative border */}
              <rect x={6} y={6} width={cardW - 12} height={cardH - 12} rx={5} fill="none" stroke={gold} strokeWidth={1.5} />
              {/* Inner decorative border */}
              <rect x={14} y={14} width={cardW - 28} height={cardH - 28} rx={3} fill="none" stroke={goldFaint} strokeWidth={0.8} />

              {/* Corner flourishes */}
              {[
                { x: 10, y: 10, sx: 1, sy: 1 },
                { x: cardW - 10, y: 10, sx: -1, sy: 1 },
                { x: 10, y: cardH - 10, sx: 1, sy: -1 },
                { x: cardW - 10, y: cardH - 10, sx: -1, sy: -1 },
              ].map((c, ci) => renderCornerFlourish(c.x, c.y, c.sx, c.sy, goldBright, ci))}

              {/* Decorative horizontal rules above and below symbol area */}
              <line x1={24} y1={42} x2={cardW - 24} y2={42} stroke={goldFaint} strokeWidth={0.6} />
              <path
                d={`M ${cardW * 0.3} 42 Q ${cardW * 0.5} 38 ${cardW * 0.7} 42`}
                fill="none"
                stroke={gold}
                strokeWidth={0.6}
                opacity={0.5}
              />
              <line x1={24} y1={cardH - 42} x2={cardW - 24} y2={cardH - 42} stroke={goldFaint} strokeWidth={0.6} />
              <path
                d={`M ${cardW * 0.3} ${cardH - 42} Q ${cardW * 0.5} ${cardH - 46} ${cardW * 0.7} ${cardH - 42}`}
                fill="none"
                stroke={gold}
                strokeWidth={0.6}
                opacity={0.5}
              />

              {/* Roman numeral at top */}
              <text
                x={cardW / 2}
                y={34}
                textAnchor="middle"
                fill={goldBright}
                fontSize={12}
                fontFamily="serif"
                letterSpacing={2}
                fontWeight="bold"
              >
                {card.numeral}
              </text>

              {/* Card symbol illustration */}
              {card.renderSymbol(
                cardW / 2,
                cardH * 0.44,
                Math.min(cardW, cardH) * 0.42,
                frame,
                hue,
              )}

              {/* Card name at bottom */}
              <text
                x={cardW / 2}
                y={cardH - 24}
                textAnchor="middle"
                fill={goldBright}
                fontSize={10.5}
                fontFamily="serif"
                letterSpacing={2}
                fontWeight="bold"
              >
                {card.name.toUpperCase()}
              </text>

              {/* Small decorative dots flanking the name */}
              <circle cx={cardW * 0.2} cy={cardH - 26} r={1.5} fill={goldFaint} />
              <circle cx={cardW * 0.8} cy={cardH - 26} r={1.5} fill={goldFaint} />
              <circle cx={cardW * 0.15} cy={cardH - 26} r={1} fill={goldFaint} opacity={0.5} />
              <circle cx={cardW * 0.85} cy={cardH - 26} r={1} fill={goldFaint} opacity={0.5} />

              {/* Subtle numeral mirrored at bottom */}
              <text
                x={cardW / 2}
                y={cardH - 10}
                textAnchor="middle"
                fill={goldFaint}
                fontSize={8}
                fontFamily="serif"
                letterSpacing={1}
              >
                {card.numeral}
              </text>
            </>
          )}

          {/* Edge glow overlay — always visible, pulses with beatDecay */}
          <rect
            x={-2}
            y={-2}
            width={cardW + 4}
            height={cardH + 4}
            rx={10}
            fill="none"
            stroke={`hsla(${(hue + 20) % 360}, 50%, 60%, ${0.1 + glowIntensity * 0.25})`}
            strokeWidth={2 + glowIntensity * 3}
            filter="url(#tarot-glow)"
          />
        </g>
      </svg>
    </div>
  );
};
