/**
 * GospelChurch — A+++ small white country church at sunset.
 *
 * Built for "And We Bid You Goodnight" — the Dead's gospel a cappella closer.
 * A reverent, peaceful scene: a tiny clapboard church on a hill, stained-glass
 * windows lit from within by a candle-bright congregation, a bell tolling in
 * the steeple under a cross, a winding dirt path through grass, a picket
 * fence, simple wooden grave markers behind the church, distant mountain
 * silhouette, and a sunset sky giving way to first stars and a soft heavenly
 * shaft of light from above.
 *
 * Audio reactivity:
 *   - slowEnergy   → sunset glow intensity, sky warmth
 *   - vocalEnergy  → stained glass illumination (the choir is inside)
 *   - beatDecay    → bell rings on each beat (toll halo + swing impulse)
 *   - onsetEnvelope→ heavenly shaft brightness flash
 *   - chromaHue    → sky tint (warm peach ↔ violet dusk)
 *   - energy       → star twinkle + grass shimmer
 *   - musicalTime  → bell pendulum phase
 *   - tempoFactor  → bell swing frequency
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Cycle timing — long, reverent visibility                           */
/* ------------------------------------------------------------------ */

const CYCLE_TOTAL = 2100;       // 70s
const VISIBLE_DURATION = 720;   // 24s on-screen

/* ------------------------------------------------------------------ */
/*  Deterministic helpers — no seeded() needed, fixed layout           */
/* ------------------------------------------------------------------ */

const STARS: { x: number; y: number; r: number; phase: number }[] = [
  { x: 0.08, y: 0.06, r: 1.4, phase: 0.10 },
  { x: 0.14, y: 0.13, r: 1.0, phase: 1.30 },
  { x: 0.22, y: 0.04, r: 1.6, phase: 0.70 },
  { x: 0.31, y: 0.18, r: 0.9, phase: 2.20 },
  { x: 0.41, y: 0.08, r: 1.2, phase: 1.90 },
  { x: 0.55, y: 0.05, r: 1.5, phase: 0.40 },
  { x: 0.62, y: 0.14, r: 1.0, phase: 2.80 },
  { x: 0.71, y: 0.07, r: 1.3, phase: 0.55 },
  { x: 0.80, y: 0.16, r: 1.1, phase: 1.70 },
  { x: 0.88, y: 0.09, r: 1.4, phase: 0.95 },
  { x: 0.94, y: 0.18, r: 0.9, phase: 2.45 },
  { x: 0.05, y: 0.21, r: 0.8, phase: 1.10 },
];

const SIDE_WINDOWS_X = [0.30, 0.46, 0.62]; // 3 along visible side wall
const GRAVE_MARKERS = [
  { dx: -0.13, dy: 0.02, h: 22, lean: -2 },
  { dx: -0.07, dy: 0.04, h: 18, lean: 1 },
  { dx: 0.06,  dy: 0.03, h: 24, lean: 0 },
  { dx: 0.13,  dy: 0.05, h: 19, lean: -3 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GospelChurch: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  /* ----------------- Cycle gating ----------------- */
  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;

  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.94;
  if (masterOpacity < 0.01) return null;

  /* ----------------- Audio drives ----------------- */
  const sunsetGlow = interpolate(snap.slowEnergy, [0.02, 0.30], [0.55, 1.05], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const choirLight = interpolate(snap.vocalEnergy, [0.0, 0.55], [0.20, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bellRing = snap.beatDecay; // 0..1 with each beat
  const heavenFlash = interpolate(snap.onsetEnvelope, [0, 0.6], [0.55, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hueShift = interpolate(snap.chromaHue, [0, 360], [-22, 22]);
  const starTwinkle = 0.5 + snap.energy * 0.5;
  const grassShimmer = 0.85 + snap.energy * 0.6;

  /* Bell pendulum: musicalTime drives the phase, tempoFactor scales freq */
  const bellPhase = snap.musicalTime * Math.PI * (0.5 + tempoFactor * 0.4);
  const bellAngle =
    Math.sin(bellPhase) * 14 +           // base swing
    Math.sin(frame * 0.04) * 2 +         // subtle secondary
    bellRing * 6;                         // beat-impulse kick

  /* ----------------- Sky / sunset palette ----------------- */
  // Top-of-sky (deepest dusk → indigo)
  const topR = Math.round(38 + sunsetGlow * 14 + hueShift * 0.3);
  const topG = Math.round(28 + sunsetGlow * 8 - hueShift * 0.2);
  const topB = Math.round(70 + sunsetGlow * 12 - hueShift * 0.8);
  // Mid-sky (lavender / violet)
  const midR = Math.round(108 + sunsetGlow * 38 + hueShift * 0.6);
  const midG = Math.round(74 + sunsetGlow * 22);
  const midB = Math.round(112 + sunsetGlow * 18 - hueShift * 0.6);
  // Horizon-sky (warm peach / orange)
  const horR = Math.round(232 + sunsetGlow * 16 + hueShift * 0.4);
  const horG = Math.round(150 + sunsetGlow * 46);
  const horB = Math.round(96 + sunsetGlow * 22 - hueShift * 0.5);

  const skyTop = `rgb(${topR}, ${topG}, ${topB})`;
  const skyMid = `rgb(${midR}, ${midG}, ${midB})`;
  const skyHor = `rgb(${horR}, ${horG}, ${horB})`;

  /* ----------------- Layout ----------------- */
  const groundY = height * 0.78;
  const horizonY = height * 0.62;
  const churchCx = width * 0.50;
  const churchBaseY = groundY - 4;
  const churchW = Math.min(width, height) * 0.22;
  const churchH = Math.min(width, height) * 0.18;
  const churchLeft = churchCx - churchW / 2;
  const churchRight = churchCx + churchW / 2;
  const churchRoofPeak = churchBaseY - churchH;

  // Steeple over the entrance front
  const steepleW = churchW * 0.20;
  const steepleBaseY = churchRoofPeak - 4;
  const steepleH = churchH * 0.85;
  const steepleTopY = steepleBaseY - steepleH;
  const steepleLeft = churchCx - steepleW / 2;
  const steepleRight = churchCx + steepleW / 2;
  const bellHousingTop = steepleTopY + steepleH * 0.10;
  const bellHousingH = steepleH * 0.30;
  const spireBaseY = bellHousingTop + bellHousingH;
  const spireTopY = steepleTopY;
  const crossY = steepleTopY - 18;

  /* ----------------- Mesa / mountain silhouette path ----------------- */
  const mountainPath =
    `M 0 ${horizonY + 2} ` +
    `L ${width * 0.04} ${horizonY - 6} ` +
    `L ${width * 0.10} ${horizonY - 26} ` +
    `L ${width * 0.16} ${horizonY - 38} ` +
    `L ${width * 0.22} ${horizonY - 22} ` +
    `L ${width * 0.30} ${horizonY - 8} ` +
    `L ${width * 0.38} ${horizonY - 18} ` +
    `L ${width * 0.46} ${horizonY - 36} ` +
    `L ${width * 0.54} ${horizonY - 30} ` +
    `L ${width * 0.62} ${horizonY - 14} ` +
    `L ${width * 0.70} ${horizonY - 22} ` +
    `L ${width * 0.78} ${horizonY - 44} ` +
    `L ${width * 0.84} ${horizonY - 30} ` +
    `L ${width * 0.92} ${horizonY - 12} ` +
    `L ${width} ${horizonY - 4} ` +
    `L ${width} ${horizonY + 30} L 0 ${horizonY + 30} Z`;

  /* ----------------- Sub-renderers ----------------- */

  // Plank texture for white church walls (subtle vertical lines)
  const renderPlanks = (
    x: number, y: number, w: number, h: number, key: string,
  ) => {
    const planks: React.ReactNode[] = [];
    const PLANK_COUNT = 8;
    const pw = w / PLANK_COUNT;
    for (let i = 1; i < PLANK_COUNT; i++) {
      const px = x + i * pw;
      planks.push(
        <line
          key={`${key}-pl-${i}`}
          x1={px}
          y1={y + 2}
          x2={px}
          y2={y + h - 2}
          stroke="rgba(140,120,100,0.35)"
          strokeWidth={0.7}
        />,
      );
    }
    return planks;
  };

  // Stained glass window (radial design)
  const renderStainedGlass = (
    cx: number, cy: number, w: number, h: number, seed: number, key: string,
  ) => {
    const inner = `rgba(255, ${Math.round(220 + choirLight * 35)}, ${Math.round(140 + choirLight * 70)}, ${0.55 + choirLight * 0.4})`;
    const blue = `rgba(${Math.round(120 + choirLight * 60)}, ${Math.round(170 + choirLight * 50)}, 230, ${0.5 + choirLight * 0.4})`;
    const red = `rgba(220, ${Math.round(60 + choirLight * 40)}, ${Math.round(60 + choirLight * 30)}, ${0.5 + choirLight * 0.4})`;
    return (
      <g key={key}>
        {/* Frame */}
        <rect
          x={cx - w / 2 - 1.5}
          y={cy - h / 2 - 1.5}
          width={w + 3}
          height={h + 3}
          rx={w * 0.5}
          fill="rgba(40,28,18,0.9)"
        />
        {/* Glass panel — arched (rounded top) */}
        <path
          d={`M ${cx - w / 2} ${cy + h / 2}
              L ${cx - w / 2} ${cy - h / 2 + w * 0.5}
              Q ${cx} ${cy - h / 2 - w * 0.1} ${cx + w / 2} ${cy - h / 2 + w * 0.5}
              L ${cx + w / 2} ${cy + h / 2} Z`}
          fill={inner}
        />
        {/* Cross mullion */}
        <line
          x1={cx} y1={cy - h / 2 + 2}
          x2={cx} y2={cy + h / 2 - 2}
          stroke="rgba(40,28,18,0.85)"
          strokeWidth={1.2}
        />
        <line
          x1={cx - w / 2 + 2} y1={cy + (seed % 2 === 0 ? -2 : 4)}
          x2={cx + w / 2 - 2} y2={cy + (seed % 2 === 0 ? -2 : 4)}
          stroke="rgba(40,28,18,0.85)"
          strokeWidth={1.0}
        />
        {/* Colored quadrants */}
        <circle cx={cx - w * 0.22} cy={cy - h * 0.18} r={w * 0.14} fill={blue} />
        <circle cx={cx + w * 0.22} cy={cy - h * 0.18} r={w * 0.14} fill={red} />
        <circle cx={cx} cy={cy + h * 0.20} r={w * 0.16} fill={inner} />
        {/* Inner candle glow */}
        <circle
          cx={cx}
          cy={cy}
          r={w * 0.28}
          fill={`rgba(255, 240, 180, ${choirLight * 0.55})`}
          style={{ mixBlendMode: "screen" as const }}
        />
      </g>
    );
  };

  // Round rose window over the front entrance
  const renderRoseWindow = (cx: number, cy: number, r: number) => {
    const segments: React.ReactNode[] = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      const colorIdx = i % 4;
      const colors = [
        `rgba(255, 200, 120, ${0.5 + choirLight * 0.4})`,
        `rgba(120, 170, 230, ${0.5 + choirLight * 0.4})`,
        `rgba(220, 80, 70, ${0.5 + choirLight * 0.4})`,
        `rgba(255, 230, 150, ${0.5 + choirLight * 0.4})`,
      ];
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      segments.push(
        <path
          key={`rose-${i}`}
          d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`}
          fill={colors[colorIdx]}
          stroke="rgba(40,28,18,0.85)"
          strokeWidth={0.8}
        />,
      );
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={r + 2} fill="rgba(40,28,18,0.9)" />
        {segments}
        <circle cx={cx} cy={cy} r={r * 0.22} fill={`rgba(255,240,180,${0.6 + choirLight * 0.4})`} />
        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="rgba(40,28,18,0.9)" strokeWidth={1.4} />
      </g>
    );
  };

  // Wall colors — warm-light side and cool-shadow side
  const wallLitR = Math.round(245 + sunsetGlow * 8 + hueShift * 0.3);
  const wallLitG = Math.round(232 + sunsetGlow * 12);
  const wallLitB = Math.round(210 + sunsetGlow * 10 - hueShift * 0.4);
  const wallShadR = Math.round(180 - sunsetGlow * 6);
  const wallShadG = Math.round(178 - sunsetGlow * 4);
  const wallShadB = Math.round(196 + sunsetGlow * 6);
  const wallLit = `rgb(${wallLitR}, ${wallLitG}, ${wallLitB})`;
  const wallShad = `rgb(${wallShadR}, ${wallShadG}, ${wallShadB})`;
  const roofColor = "rgba(50,38,28,0.96)";
  const roofShad = "rgba(28,20,14,0.96)";
  const trimColor = "rgba(56,40,28,0.95)";

  /* ----------------- Path winding to church ----------------- */
  const pathLeftX = width * 0.18;
  const pathStartY = height * 0.96;
  const pathEndX = churchCx - 4;
  const pathEndY = churchBaseY + 2;
  const pathPoly =
    `M ${pathLeftX - 22} ${pathStartY} ` +
    `Q ${width * 0.30} ${height * 0.88} ${width * 0.36} ${height * 0.82} ` +
    `T ${pathEndX - 6} ${pathEndY} ` +
    `L ${pathEndX + 6} ${pathEndY} ` +
    `Q ${width * 0.42} ${height * 0.85} ${width * 0.38} ${height * 0.90} ` +
    `T ${pathLeftX + 22} ${pathStartY} Z`;

  /* ----------------- Tree silhouettes ----------------- */
  const renderTree = (cx: number, baseY: number, h: number, sway: number, key: string) => {
    return (
      <g key={key} transform={`translate(${cx}, ${baseY})`}>
        <rect x={-2} y={-h * 0.30} width={4} height={h * 0.30} fill="rgba(20,14,10,0.95)" />
        <ellipse cx={0 + sway} cy={-h * 0.45} rx={h * 0.28} ry={h * 0.22} fill="rgba(20,14,10,0.95)" />
        <ellipse cx={-h * 0.18 + sway * 0.6} cy={-h * 0.55} rx={h * 0.20} ry={h * 0.18} fill="rgba(20,14,10,0.95)" />
        <ellipse cx={h * 0.18 + sway * 0.6} cy={-h * 0.58} rx={h * 0.18} ry={h * 0.16} fill="rgba(20,14,10,0.95)" />
        <ellipse cx={0 + sway * 0.4} cy={-h * 0.72} rx={h * 0.16} ry={h * 0.14} fill="rgba(20,14,10,0.95)" />
      </g>
    );
  };

  const treeSway1 = Math.sin(frame * 0.022) * 1.2;
  const treeSway2 = Math.sin(frame * 0.017 + 1.8) * 1.0;
  const treeSway3 = Math.sin(frame * 0.025 + 0.6) * 1.4;

  /* ----------------- Picket fence ----------------- */
  const renderFence = () => {
    const pickets: React.ReactNode[] = [];
    const fenceY = groundY + 14;
    const fenceLeft = churchLeft - 60;
    const fenceRight = churchRight + 60;
    const PICKET_COUNT = 24;
    const stride = (fenceRight - fenceLeft) / PICKET_COUNT;
    for (let i = 0; i < PICKET_COUNT; i++) {
      const x = fenceLeft + i * stride;
      // Skip the ones in front of the path entry
      if (x > pathEndX - 30 && x < pathEndX + 30) continue;
      pickets.push(
        <path
          key={`pk-${i}`}
          d={`M ${x} ${fenceY} L ${x} ${fenceY - 14} L ${x + 1.5} ${fenceY - 17} L ${x + 3} ${fenceY - 14} L ${x + 3} ${fenceY} Z`}
          fill="rgba(245,240,225,0.92)"
          stroke="rgba(120,100,80,0.6)"
          strokeWidth={0.4}
        />,
      );
    }
    return (
      <g>
        {/* Horizontal rails */}
        <line
          x1={fenceLeft} y1={fenceY - 4}
          x2={pathEndX - 30} y2={fenceY - 4}
          stroke="rgba(245,240,225,0.85)" strokeWidth={1.2}
        />
        <line
          x1={pathEndX + 30} y1={fenceY - 4}
          x2={fenceRight} y2={fenceY - 4}
          stroke="rgba(245,240,225,0.85)" strokeWidth={1.2}
        />
        <line
          x1={fenceLeft} y1={fenceY - 11}
          x2={pathEndX - 30} y2={fenceY - 11}
          stroke="rgba(245,240,225,0.85)" strokeWidth={1.0}
        />
        <line
          x1={pathEndX + 30} y1={fenceY - 11}
          x2={fenceRight} y2={fenceY - 11}
          stroke="rgba(245,240,225,0.85)" strokeWidth={1.0}
        />
        {pickets}
      </g>
    );
  };

  /* ----------------- Cemetery markers behind the church ----------------- */
  const renderGraves = () => {
    return (
      <g>
        {GRAVE_MARKERS.map((g, i) => {
          const gx = churchCx + g.dx * width;
          const gy = churchBaseY - 8 + g.dy * height;
          return (
            <g key={`grave-${i}`} transform={`translate(${gx}, ${gy}) rotate(${g.lean})`}>
              <ellipse cx={0} cy={3} rx={6} ry={1.6} fill="rgba(0,0,0,0.4)" />
              <rect x={-1.5} y={-g.h} width={3} height={g.h} fill="rgba(225,215,195,0.85)" />
              <rect x={-5} y={-g.h * 0.66} width={10} height={3} fill="rgba(225,215,195,0.85)" />
            </g>
          );
        })}
      </g>
    );
  };

  /* ----------------- Front door ----------------- */
  const doorW = churchW * 0.14;
  const doorH = churchH * 0.32;
  const doorTopY = churchBaseY - doorH;
  const doorCx = churchCx;

  /* ----------------- Bell rendering ----------------- */
  const bellCx = (steepleLeft + steepleRight) / 2;
  const bellCy = bellHousingTop + bellHousingH * 0.45;
  const bellPivotY = bellHousingTop + bellHousingH * 0.10;
  const bellW = steepleW * 0.55;
  const bellH = bellHousingH * 0.55;

  /* Heavenly shaft path: cone descending from top-of-screen onto steeple */
  const haloY = crossY - 30;
  const shaftOpacity = heavenFlash * 0.55;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          willChange: "opacity",
        }}
      >
        <defs>
          {/* Sky gradient — top dusk to horizon peach */}
          <linearGradient id="gospel-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="38%" stopColor={skyMid} />
            <stop offset="78%" stopColor={skyHor} />
            <stop offset="100%" stopColor={skyHor} />
          </linearGradient>

          {/* Heavenly shaft gradient */}
          <linearGradient id="gospel-shaft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(255,250,220,${shaftOpacity})`} />
            <stop offset="50%" stopColor={`rgba(255,240,200,${shaftOpacity * 0.55})`} />
            <stop offset="100%" stopColor="rgba(255,240,200,0)" />
          </linearGradient>

          {/* Sunset glow behind mountains */}
          <radialGradient id="gospel-sunglow" cx="0.5" cy="0.7" r="0.65">
            <stop offset="0%" stopColor={`rgba(255,200,140,${0.5 * sunsetGlow})`} />
            <stop offset="55%" stopColor={`rgba(255,150,100,${0.18 * sunsetGlow})`} />
            <stop offset="100%" stopColor="rgba(255,150,100,0)" />
          </radialGradient>

          {/* Window inner halo (radial) */}
          <radialGradient id="gospel-windowglow">
            <stop offset="0%" stopColor={`rgba(255,240,190,${choirLight * 0.5})`} />
            <stop offset="100%" stopColor="rgba(255,240,190,0)" />
          </radialGradient>

          {/* Bell ring halo when struck */}
          <radialGradient id="gospel-bellring">
            <stop offset="0%" stopColor={`rgba(255,240,200,${bellRing * 0.65})`} />
            <stop offset="100%" stopColor="rgba(255,240,200,0)" />
          </radialGradient>
        </defs>

        {/* ============== SKY ============== */}
        <rect x={0} y={0} width={width} height={horizonY + 30} fill="url(#gospel-sky)" />

        {/* Sun glow behind the mountains */}
        <ellipse
          cx={width * 0.50}
          cy={horizonY + 8}
          rx={width * 0.55}
          ry={height * 0.32}
          fill="url(#gospel-sunglow)"
        />

        {/* Stars */}
        <g>
          {STARS.map((s, i) => {
            const tw = 0.55 + Math.sin(frame * 0.06 + s.phase) * 0.35 * starTwinkle;
            return (
              <circle
                key={`star-${i}`}
                cx={s.x * width}
                cy={s.y * height}
                r={s.r}
                fill={`rgba(255,250,230,${tw})`}
              />
            );
          })}
        </g>

        {/* Heavenly shaft from above onto church */}
        <path
          d={`M ${churchCx - 60} 0 L ${churchCx + 60} 0 L ${churchCx + 30} ${haloY + 10} L ${churchCx - 30} ${haloY + 10} Z`}
          fill="url(#gospel-shaft)"
          style={{ mixBlendMode: "screen" as const }}
        />
        {/* Halo cap above cross */}
        <circle
          cx={churchCx}
          cy={haloY}
          r={26 + heavenFlash * 8}
          fill={`rgba(255,250,220,${heavenFlash * 0.35})`}
          style={{ mixBlendMode: "screen" as const }}
        />

        {/* ============== DISTANT MOUNTAINS ============== */}
        <path d={mountainPath} fill="rgba(28,22,38,0.92)" />
        {/* Closer ridge — slightly lighter */}
        <path
          d={
            `M 0 ${horizonY + 12} ` +
            `L ${width * 0.18} ${horizonY + 4} ` +
            `L ${width * 0.32} ${horizonY - 4} ` +
            `L ${width * 0.46} ${horizonY + 6} ` +
            `L ${width * 0.58} ${horizonY - 2} ` +
            `L ${width * 0.72} ${horizonY + 8} ` +
            `L ${width * 0.86} ${horizonY + 2} ` +
            `L ${width} ${horizonY + 10} ` +
            `L ${width} ${horizonY + 30} L 0 ${horizonY + 30} Z`
          }
          fill="rgba(38,28,46,0.9)"
        />

        {/* ============== GROUND / GRASS ============== */}
        <rect
          x={0}
          y={horizonY + 28}
          width={width}
          height={height - (horizonY + 28)}
          fill="rgba(34,42,28,0.95)"
        />
        {/* Grass shimmer band — subtle ↑ from energy */}
        <rect
          x={0}
          y={horizonY + 30}
          width={width}
          height={height * 0.05}
          fill={`rgba(78, 92, 50, ${0.35 * grassShimmer})`}
        />

        {/* ============== TREES ============== */}
        {renderTree(width * 0.10, groundY + 6, 130, treeSway1, "tree-l1")}
        {renderTree(width * 0.18, groundY + 4, 110, treeSway2 * 0.8, "tree-l2")}
        {renderTree(width * 0.86, groundY + 6, 140, treeSway3, "tree-r1")}
        {renderTree(width * 0.93, groundY + 4, 100, treeSway1 * 0.6, "tree-r2")}

        {/* ============== PATH ============== */}
        <path d={pathPoly} fill="rgba(120,90,60,0.85)" />
        {/* Path edge highlight */}
        <path
          d={`M ${pathLeftX} ${pathStartY - 4} Q ${width * 0.34} ${height * 0.86} ${pathEndX - 2} ${pathEndY - 4}`}
          stroke="rgba(160,120,80,0.65)"
          strokeWidth={1.2}
          fill="none"
        />

        {/* ============== CEMETERY (behind church) ============== */}
        {renderGraves()}

        {/* ============== CHURCH BUILDING ============== */}
        {/* Drop shadow on grass */}
        <ellipse
          cx={churchCx + 12}
          cy={churchBaseY + 6}
          rx={churchW * 0.65}
          ry={6}
          fill="rgba(0,0,0,0.45)"
        />

        {/* Main body (lit side gradient) */}
        <rect
          x={churchLeft}
          y={churchRoofPeak}
          width={churchW}
          height={churchH}
          fill={wallLit}
        />
        {/* Shadow strip on left (cooler) */}
        <rect
          x={churchLeft}
          y={churchRoofPeak}
          width={churchW * 0.22}
          height={churchH}
          fill={wallShad}
          opacity={0.85}
        />
        {/* Plank lines */}
        {renderPlanks(churchLeft, churchRoofPeak, churchW, churchH, "wall")}

        {/* Side stained glass windows (3 along visible wall) */}
        {SIDE_WINDOWS_X.map((fx, i) => {
          const wx = churchLeft + fx * churchW;
          const wy = churchRoofPeak + churchH * 0.45;
          return renderStainedGlass(wx, wy, churchW * 0.07, churchH * 0.36, i, `sw-${i}`);
        })}

        {/* Front door — arched, slightly open with warm interior glow spilling out */}
        <path
          d={`M ${doorCx - doorW / 2} ${churchBaseY}
              L ${doorCx - doorW / 2} ${doorTopY + doorW * 0.4}
              Q ${doorCx} ${doorTopY - doorW * 0.1} ${doorCx + doorW / 2} ${doorTopY + doorW * 0.4}
              L ${doorCx + doorW / 2} ${churchBaseY} Z`}
          fill="rgba(48,28,16,0.96)"
        />
        {/* Door interior warm glow (slit, subtly responsive to vocal/choir) */}
        <path
          d={`M ${doorCx - 4} ${churchBaseY - 2}
              L ${doorCx - 4} ${doorTopY + doorW * 0.5}
              Q ${doorCx} ${doorTopY + doorW * 0.1} ${doorCx + 4} ${doorTopY + doorW * 0.5}
              L ${doorCx + 4} ${churchBaseY - 2} Z`}
          fill={`rgba(255, 230, 170, ${0.55 + choirLight * 0.4})`}
        />
        {/* Door step */}
        <rect
          x={doorCx - doorW * 0.6}
          y={churchBaseY - 1}
          width={doorW * 1.2}
          height={4}
          fill="rgba(180,160,140,0.92)"
        />
        <rect
          x={doorCx - doorW * 0.7}
          y={churchBaseY + 3}
          width={doorW * 1.4}
          height={4}
          fill="rgba(160,140,120,0.9)"
        />
        {/* Door knob */}
        <circle cx={doorCx + doorW * 0.32} cy={doorTopY + doorH * 0.55} r={1.2} fill="rgba(220,180,80,0.9)" />

        {/* Round rose window above the door */}
        {renderRoseWindow(doorCx, doorTopY - churchH * 0.10, churchW * 0.06)}

        {/* Roof — pitched, dark */}
        <path
          d={`M ${churchLeft - 4} ${churchRoofPeak + 4}
              L ${churchCx} ${churchRoofPeak - churchH * 0.32}
              L ${churchRight + 4} ${churchRoofPeak + 4} Z`}
          fill={roofColor}
        />
        {/* Roof shadow side */}
        <path
          d={`M ${churchLeft - 4} ${churchRoofPeak + 4}
              L ${churchCx} ${churchRoofPeak - churchH * 0.32}
              L ${churchCx} ${churchRoofPeak + 4} Z`}
          fill={roofShad}
        />
        {/* Roof trim */}
        <line
          x1={churchLeft - 4} y1={churchRoofPeak + 4}
          x2={churchRight + 4} y2={churchRoofPeak + 4}
          stroke={trimColor} strokeWidth={1.6}
        />

        {/* ============== STEEPLE / BELL TOWER ============== */}
        {/* Steeple base box */}
        <rect
          x={steepleLeft}
          y={steepleBaseY - steepleH * 0.10}
          width={steepleW}
          height={steepleH * 0.10 + 4}
          fill={wallLit}
        />
        <rect
          x={steepleLeft}
          y={steepleBaseY - steepleH * 0.10}
          width={steepleW * 0.30}
          height={steepleH * 0.10 + 4}
          fill={wallShad}
          opacity={0.85}
        />

        {/* Bell housing — louvered open box */}
        <rect
          x={steepleLeft}
          y={bellHousingTop}
          width={steepleW}
          height={bellHousingH}
          fill="rgba(28,18,12,0.96)"
        />
        {/* Louver slats */}
        {[0, 1, 2, 3].map(i => (
          <line
            key={`louver-${i}`}
            x1={steepleLeft + 2}
            y1={bellHousingTop + (bellHousingH * (i + 1)) / 5}
            x2={steepleRight - 2}
            y2={bellHousingTop + (bellHousingH * (i + 1)) / 5 - 2}
            stroke="rgba(180,160,130,0.55)"
            strokeWidth={1.0}
          />
        ))}

        {/* Bell ring halo behind bell — pulses on each beat */}
        <circle
          cx={bellCx}
          cy={bellCy}
          r={bellW * 1.5}
          fill="url(#gospel-bellring)"
          style={{ mixBlendMode: "screen" as const }}
        />

        {/* Bell — swings from pivot */}
        <g transform={`rotate(${bellAngle}, ${bellCx}, ${bellPivotY})`}>
          {/* Yoke / mount line */}
          <line
            x1={bellCx} y1={bellPivotY - 2}
            x2={bellCx} y2={bellCy - bellH * 0.5}
            stroke="rgba(140,110,60,0.95)" strokeWidth={1.2}
          />
          {/* Bell body — bell-curve shape */}
          <path
            d={`M ${bellCx - bellW / 2} ${bellCy + bellH * 0.5}
                Q ${bellCx - bellW * 0.55} ${bellCy} ${bellCx - bellW * 0.42} ${bellCy - bellH * 0.42}
                Q ${bellCx - bellW * 0.20} ${bellCy - bellH * 0.55} ${bellCx} ${bellCy - bellH * 0.55}
                Q ${bellCx + bellW * 0.20} ${bellCy - bellH * 0.55} ${bellCx + bellW * 0.42} ${bellCy - bellH * 0.42}
                Q ${bellCx + bellW * 0.55} ${bellCy} ${bellCx + bellW / 2} ${bellCy + bellH * 0.5}
                Q ${bellCx} ${bellCy + bellH * 0.62} ${bellCx - bellW / 2} ${bellCy + bellH * 0.5} Z`}
            fill={`rgba(${Math.round(190 + bellRing * 50)}, ${Math.round(150 + bellRing * 40)}, 60, 0.96)`}
            stroke="rgba(80,60,20,0.95)"
            strokeWidth={0.8}
          />
          {/* Bell highlight */}
          <ellipse
            cx={bellCx - bellW * 0.18}
            cy={bellCy - bellH * 0.10}
            rx={bellW * 0.10}
            ry={bellH * 0.18}
            fill="rgba(255,230,140,0.5)"
          />
          {/* Clapper */}
          <line
            x1={bellCx} y1={bellCy - bellH * 0.30}
            x2={bellCx} y2={bellCy + bellH * 0.55}
            stroke="rgba(40,28,12,0.95)" strokeWidth={1.4}
          />
          <circle cx={bellCx} cy={bellCy + bellH * 0.55} r={2.4} fill="rgba(40,28,12,0.95)" />
        </g>

        {/* Subtle ringing motion lines (visible when bellRing > 0.3) */}
        {bellRing > 0.25 && (
          <g opacity={Math.min(1, (bellRing - 0.25) * 2.5)}>
            <path
              d={`M ${bellCx - bellW * 0.85} ${bellCy} Q ${bellCx - bellW * 1.0} ${bellCy + 2} ${bellCx - bellW * 0.95} ${bellCy + 6}`}
              stroke="rgba(255,240,180,0.75)" strokeWidth={0.9} fill="none"
            />
            <path
              d={`M ${bellCx + bellW * 0.85} ${bellCy} Q ${bellCx + bellW * 1.0} ${bellCy + 2} ${bellCx + bellW * 0.95} ${bellCy + 6}`}
              stroke="rgba(255,240,180,0.75)" strokeWidth={0.9} fill="none"
            />
          </g>
        )}

        {/* Spire — tapered pyramid */}
        <path
          d={`M ${steepleLeft} ${spireBaseY}
              L ${churchCx} ${spireTopY - 4}
              L ${steepleRight} ${spireBaseY} Z`}
          fill={roofColor}
        />
        {/* Spire shadow side */}
        <path
          d={`M ${steepleLeft} ${spireBaseY}
              L ${churchCx} ${spireTopY - 4}
              L ${churchCx} ${spireBaseY} Z`}
          fill={roofShad}
        />

        {/* Cross at very top */}
        <g>
          <rect
            x={churchCx - 1}
            y={crossY}
            width={2.2}
            height={20}
            fill="rgba(28,18,10,0.98)"
          />
          <rect
            x={churchCx - 6}
            y={crossY + 5}
            width={12}
            height={2.2}
            fill="rgba(28,18,10,0.98)"
          />
          {/* Tiny gold rim from heavenly light */}
          <rect
            x={churchCx - 1}
            y={crossY}
            width={2.2}
            height={20}
            fill={`rgba(255,230,170,${heavenFlash * 0.6})`}
          />
          <rect
            x={churchCx - 6}
            y={crossY + 5}
            width={12}
            height={2.2}
            fill={`rgba(255,230,170,${heavenFlash * 0.6})`}
          />
        </g>

        {/* ============== PICKET FENCE ============== */}
        {renderFence()}

        {/* ============== Soft warm interior light spill in front of door ============== */}
        <ellipse
          cx={doorCx}
          cy={churchBaseY + 6}
          rx={doorW * 1.1}
          ry={8}
          fill={`rgba(255,220,150,${0.30 + choirLight * 0.30})`}
          style={{ mixBlendMode: "screen" as const }}
        />

        {/* Window outer halos — appears stronger as choir sings */}
        {SIDE_WINDOWS_X.map((fx, i) => {
          const wx = churchLeft + fx * churchW;
          const wy = churchRoofPeak + churchH * 0.45;
          return (
            <circle
              key={`halo-${i}`}
              cx={wx}
              cy={wy}
              r={churchW * 0.10}
              fill="url(#gospel-windowglow)"
              style={{ mixBlendMode: "screen" as const }}
            />
          );
        })}
      </svg>
    </div>
  );
};
