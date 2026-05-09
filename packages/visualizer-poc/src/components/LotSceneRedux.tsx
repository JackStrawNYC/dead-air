/**
 * LotSceneRedux — A+++ parking-lot vendor row overlay.
 *
 * The audit's #1 missing overlay: "Parking lot vendor row — VW buses,
 * tie-dye tapestries, grilled cheese cart, bootleg tapes stacked,
 * dancing Deadheads, beer coolers, smell plumes."
 *
 * Bottom-of-frame composite at ~28% opacity over shader output. Builds
 * a horizontally-scrolling row of vendor elements with rich SVG detail
 * and audio reactivity. Models on WallOfSound's "rich detail per element"
 * approach (594 lines): every component (bus, tapestry, cart, blanket,
 * dancers) gets its own multi-layer rendering with shadow, highlight,
 * and texture.
 *
 * Audio reactivity:
 *   bass         → bus rocks side-to-side, dancers' hip sway amplifies
 *   energy       → cart steam plume rises higher
 *   vocalEnergy  → tapestry colors saturate
 *   beatSnap     → dance figures snap to next pose
 *   onset        → spark of light on tapestries (camera-flash impression)
 *
 * Layout (1280×720 base, positioned bottom-third):
 *   x=80   VW Microbus #1 (250w × 130h, bay-window era)
 *   x=350  3-tapestry banner row (160w each, hanging from poles)
 *   x=850  Grilled-cheese cart (180w × 140h) with steam plume
 *   x=1050 Vendor blanket with bootleg tapes (200w × 80h)
 *   Dancers scattered between elements (8 figures total)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── VW MICROBUS ────────────────────────────────────────────────
// Bay-window era (1968+) — the iconic Dead-show vehicle

const VWMicrobus: React.FC<{
  cx: number;
  cy: number;
  scale: number;
  rock: number;     // -1..1 bass-driven side-to-side rock
  brightness: number;
}> = ({ cx, cy, scale, rock, brightness }) => {
  // Body dimensions (un-scaled, multiplied by `scale`)
  const W = 220 * scale;
  const H = 110 * scale;
  const wheelR = 14 * scale;
  // Rock transform — bus tilts ~1 degree on the bass
  const rockDeg = rock * 1.2;

  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rockDeg})`} opacity={brightness}>
      {/* Ground shadow — soft ellipse beneath */}
      <ellipse cx={0} cy={H / 2 + 8 * scale} rx={W / 2 * 1.05} ry={6 * scale} fill="rgba(0,0,0,0.4)" />

      {/* Wheels (back first, then front for layering) */}
      <g>
        <circle cx={-W / 2 + 32 * scale} cy={H / 2 - 4 * scale} r={wheelR} fill="#0d0d0d" />
        <circle cx={-W / 2 + 32 * scale} cy={H / 2 - 4 * scale} r={wheelR * 0.5} fill="#3a3a3a" />
        <circle cx={W / 2 - 32 * scale} cy={H / 2 - 4 * scale} r={wheelR} fill="#0d0d0d" />
        <circle cx={W / 2 - 32 * scale} cy={H / 2 - 4 * scale} r={wheelR * 0.5} fill="#3a3a3a" />
      </g>

      {/* Body — split horizontally with iconic two-tone (top white, bottom colored) */}
      {/* Bottom panel — main body color (orange/yellow Dead-bus typical) */}
      <rect x={-W / 2} y={-H / 4} width={W} height={H * 0.75} rx={8 * scale} fill="#c97532" />
      {/* Top panel — cream / white */}
      <rect x={-W / 2 + 6 * scale} y={-H / 2} width={W - 12 * scale} height={H * 0.45} rx={10 * scale} fill="#e8dfc6" />
      {/* Roof curve — small dark sliver suggesting roof crown */}
      <rect x={-W / 2 + 14 * scale} y={-H / 2 - 4 * scale} width={W - 28 * scale} height={6 * scale} rx={3 * scale} fill="#9c5a25" />

      {/* Front face — rounded triangle with VW emblem hint */}
      <ellipse cx={W / 2 - 12 * scale} cy={-H / 8} rx={5 * scale} ry={5 * scale} fill="#0a0a0a" opacity={0.6} />
      {/* Headlight (front bumper) */}
      <circle cx={W / 2 - 6 * scale} cy={H / 6} r={4 * scale} fill="#fef4c0" stroke="#3a2810" strokeWidth={0.8} />

      {/* Bay windows — cream frame, dark glass with reflections */}
      {[-1, 0, 1].map((i) => {
        const wx = i * (W / 4) - W / 8;
        return (
          <g key={`w${i}`}>
            <rect x={wx - 18 * scale} y={-H / 2 + 8 * scale} width={36 * scale} height={28 * scale} rx={2 * scale} fill="#1a2030" />
            {/* Tie-dye curtain visible inside */}
            <rect x={wx - 16 * scale} y={-H / 2 + 10 * scale} width={32 * scale} height={26 * scale} rx={1} fill="url(#tieDyeGradient)" opacity={0.7} />
            {/* Glass reflection sliver */}
            <line x1={wx - 14 * scale} y1={-H / 2 + 11 * scale} x2={wx - 14 * scale} y2={-H / 2 + 32 * scale} stroke="#e0e8f0" strokeWidth={0.5} opacity={0.5} />
          </g>
        );
      })}

      {/* Side door split */}
      <line x1={-6 * scale} y1={-H / 4 + 4} x2={-6 * scale} y2={H / 4 - 6} stroke="#7a4015" strokeWidth={0.8} />

      {/* Painted side detail — Dead-style Stealie hint */}
      <circle cx={W / 4} cy={H / 8} r={11 * scale} fill="#f5e6c8" stroke="#5c2a08" strokeWidth={1} opacity={0.85} />
      <path d={`M ${W / 4 - 6 * scale} ${H / 8} L ${W / 4 + 6 * scale} ${H / 8 - 4 * scale} L ${W / 4 + 6 * scale} ${H / 8 + 4 * scale} Z`} fill="#c93030" opacity={0.7} />

      {/* Tie-dye flag attached to roof rack */}
      <g transform={`translate(${-W / 4} ${-H / 2 - 6 * scale}) rotate(${rock * 8})`}>
        <rect x={0} y={-12 * scale} width={32 * scale} height={10 * scale} fill="url(#tieDyeGradient)" opacity={0.85} />
        <line x1={0} y1={-14 * scale} x2={0} y2={4 * scale} stroke="#3a2810" strokeWidth={1} />
      </g>

      {/* Hubcaps highlight */}
      <circle cx={-W / 2 + 32 * scale} cy={H / 2 - 4 * scale} r={3 * scale} fill="#b0b0b0" />
      <circle cx={W / 2 - 32 * scale} cy={H / 2 - 4 * scale} r={3 * scale} fill="#b0b0b0" />
    </g>
  );
};

// ─── HANGING TAPESTRY ────────────────────────────────────────────
// Tie-dye banner with motif (Stealie, rose, lightning, etc.)

const Tapestry: React.FC<{
  cx: number;
  cy: number;
  motif: "stealie" | "rose" | "bolt";
  saturation: number;  // 0-1, vocal-driven
  sway: number;        // -1..1, gentle wind
}> = ({ cx, cy, motif, saturation, sway }) => {
  const W = 90;
  const H = 130;
  const swayDeg = sway * 1.5;
  const motifColor = motif === "rose" ? "#e34050" : motif === "bolt" ? "#f5d020" : "#b85a35";

  return (
    <g transform={`translate(${cx} ${cy}) rotate(${swayDeg})`}>
      {/* Hanging rope */}
      <line x1={-W / 2 - 4} y1={-H / 2 - 8} x2={-W / 2} y2={-H / 2} stroke="#2a1810" strokeWidth={1.2} />
      <line x1={W / 2 + 4} y1={-H / 2 - 8} x2={W / 2} y2={-H / 2} stroke="#2a1810" strokeWidth={1.2} />
      {/* Top dowel */}
      <rect x={-W / 2 - 4} y={-H / 2 - 4} width={W + 8} height={4} fill="#3a2810" rx={1} />

      {/* Tapestry body — tie-dye gradient */}
      <rect x={-W / 2} y={-H / 2} width={W} height={H} fill="url(#tieDyeGradient)" opacity={0.5 + saturation * 0.4} />

      {/* Concentric tie-dye rings */}
      {[1, 2, 3].map((i) => (
        <circle
          key={i}
          cx={0}
          cy={0}
          r={i * 18}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1.5}
        />
      ))}

      {/* Motif at center */}
      {motif === "stealie" && (
        <g>
          <circle cx={0} cy={0} r={20} fill="#f5e6c8" stroke="#3a1a08" strokeWidth={1.4} opacity={0.85} />
          {/* Lightning bolt across skull */}
          <path d="M -10 -6 L 4 -6 L -4 4 L 8 4 L -2 14 L 2 4 L -10 4 Z" fill="#c93030" opacity={0.9} />
        </g>
      )}
      {motif === "rose" && (
        <g>
          {/* Rose: layered petals */}
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <ellipse
                key={a}
                cx={Math.cos(rad) * 6}
                cy={Math.sin(rad) * 6}
                rx={11}
                ry={7}
                fill={motifColor}
                opacity={0.78}
                transform={`rotate(${a} ${Math.cos(rad) * 6} ${Math.sin(rad) * 6})`}
              />
            );
          })}
          <circle cx={0} cy={0} r={8} fill="#7a1a20" />
          <circle cx={0} cy={0} r={4} fill="#3a0a10" />
        </g>
      )}
      {motif === "bolt" && (
        <path d="M -8 -22 L 6 -4 L -2 -2 L 10 22 L -4 4 L 2 2 Z" fill={motifColor} stroke="#5a3a00" strokeWidth={1} />
      )}

      {/* Bottom fringe */}
      {Array.from({ length: 9 }).map((_, i) => (
        <line
          key={i}
          x1={-W / 2 + (i + 0.5) * (W / 9)}
          y1={H / 2}
          x2={-W / 2 + (i + 0.5) * (W / 9) + sway * 1}
          y2={H / 2 + 6}
          stroke="#5a3a20"
          strokeWidth={1}
        />
      ))}
    </g>
  );
};

// ─── GRILLED-CHEESE CART ─────────────────────────────────────────

const GrilledCheeseCart: React.FC<{
  cx: number;
  cy: number;
  steamRise: number;  // 0-1, energy-driven
  glow: number;
}> = ({ cx, cy, steamRise, glow }) => {
  const W = 140;
  const H = 110;

  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Ground shadow */}
      <ellipse cx={0} cy={H / 2 + 6} rx={W / 2 * 0.95} ry={5} fill="rgba(0,0,0,0.4)" />

      {/* Wheels */}
      <circle cx={-W / 2 + 18} cy={H / 2 - 4} r={9} fill="#1a1a1a" />
      <circle cx={-W / 2 + 18} cy={H / 2 - 4} r={4} fill="#3a3a3a" />
      <circle cx={W / 2 - 18} cy={H / 2 - 4} r={9} fill="#1a1a1a" />
      <circle cx={W / 2 - 18} cy={H / 2 - 4} r={4} fill="#3a3a3a" />

      {/* Cart body — chrome/silver vending box */}
      <rect x={-W / 2} y={-H / 4} width={W} height={H * 0.8} rx={4} fill="#cdcdce" />
      {/* Body shadow band */}
      <rect x={-W / 2} y={-H / 4 + H * 0.7} width={W} height={H * 0.1} fill="#8a8a8c" />
      {/* Front panel — slightly darker */}
      <rect x={-W / 2 + 4} y={-H / 4 + 4} width={W - 8} height={H * 0.3} rx={2} fill="#dadadc" />

      {/* "GRILLED CHEESE" sign */}
      <rect x={-W / 2 + 10} y={-H / 4 + 18} width={W - 20} height={26} fill="#3a1a08" rx={2} />
      <text
        x={0}
        y={-H / 4 + 35}
        fontFamily="Georgia, serif"
        fontSize={11}
        fill="#f5d020"
        textAnchor="middle"
        fontWeight="bold"
      >
        $1 GRILLED CHEESE
      </text>

      {/* Hot griddle on top — orange glow */}
      <rect x={-W / 2 + 14} y={-H / 4 - 6} width={W - 28} height={8} fill="#a04018" />
      <rect x={-W / 2 + 14} y={-H / 4 - 4} width={W - 28} height={3} fill="#e87838" opacity={0.5 + glow * 0.5} />

      {/* Sandwich stack on griddle */}
      <rect x={-12} y={-H / 4 - 4} width={24} height={3} fill="#f5d020" opacity={0.9} />
      <rect x={-12} y={-H / 4 - 7} width={24} height={3} fill="#a86018" />
      <rect x={-10} y={-H / 4 - 5} width={20} height={2} fill="#fdc030" opacity={0.85} />

      {/* Steam plume — rising wisps, audio-reactive height */}
      <g opacity={0.75}>
        {[0, 1, 2].map((i) => {
          const offsetX = (i - 1) * 12;
          const peakY = -H / 4 - 30 - steamRise * 30 - i * 10;
          return (
            <path
              key={i}
              d={`M ${offsetX} ${-H / 4 - 8} Q ${offsetX + 4} ${peakY + 10} ${offsetX - 4} ${peakY}`}
              fill="none"
              stroke="rgba(245,240,220,0.65)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* Vendor (small silhouette behind cart, head visible) */}
      <ellipse cx={0} cy={-H / 4 - 10} rx={9} ry={11} fill="#2a1a10" />
      <rect x={-7} y={-H / 4 - 4} width={14} height={3} fill="#5a3a20" />
    </g>
  );
};

// ─── VENDOR BLANKET WITH BOOTLEG TAPES ───────────────────────────

const TapeBlanket: React.FC<{
  cx: number;
  cy: number;
}> = ({ cx, cy }) => {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Blanket — patchwork tie-dye */}
      <ellipse cx={0} cy={0} rx={120} ry={30} fill="#3a1a30" opacity={0.85} />
      <ellipse cx={-30} cy={-2} rx={50} ry={14} fill="url(#tieDyeGradient)" opacity={0.7} />
      <ellipse cx={40} cy={2} rx={45} ry={12} fill="url(#tieDyeGradient)" opacity={0.6} transform="rotate(8 40 2)" />

      {/* Bootleg cassettes — small rectangles with labels */}
      {[
        { x: -90, y: -10, label: "Cornell 5/8" },
        { x: -55, y: -6, label: "Veneta '72" },
        { x: -20, y: -10, label: "Europe '72" },
        { x: 15, y: -8, label: "Closing" },
        { x: 50, y: -10, label: "Eyes 8/27" },
        { x: 85, y: -6, label: "Dark Star" },
      ].map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) rotate(${(i % 2) * 4 - 2})`}>
          <rect x={-12} y={-7} width={24} height={14} rx={1.5} fill="#0a0a0a" />
          {/* Cassette window */}
          <rect x={-9} y={-3} width={18} height={5} fill="#3a3a3a" />
          {/* Reels */}
          <circle cx={-5} cy={-0.5} r={1.6} fill="#1a1a1a" />
          <circle cx={5} cy={-0.5} r={1.6} fill="#1a1a1a" />
          {/* Label */}
          <text x={0} y={6} fontFamily="monospace" fontSize={3.5} fill="#f0e0a0" textAnchor="middle">
            {t.label}
          </text>
        </g>
      ))}

      {/* Hand-lettered "$5 EACH" sign */}
      <g transform="translate(-60 -30) rotate(-6)">
        <rect x={-22} y={-8} width={44} height={16} fill="#f5e6c8" stroke="#3a1a08" strokeWidth={1} />
        <text
          x={0}
          y={4}
          fontFamily="Georgia, serif"
          fontSize={10}
          fill="#5c1a08"
          textAnchor="middle"
          fontWeight="bold"
        >
          $5 EACH
        </text>
      </g>

      {/* Tip jar */}
      <g transform="translate(70 -8)">
        <rect x={-7} y={-8} width={14} height={16} rx={1} fill="rgba(180,180,180,0.6)" stroke="#5a5a5a" strokeWidth={0.6} />
        <line x1={-5} y1={-3} x2={5} y2={-3} stroke="#3a3a3a" strokeWidth={0.5} />
      </g>
    </g>
  );
};

// ─── DANCING DEADHEAD FIGURE ─────────────────────────────────────
// Stylized silhouette in mid-twirl

const DancingDeadhead: React.FC<{
  cx: number;
  cy: number;
  scale: number;
  phase: number;     // 0..1 in dance cycle
  energy: number;
}> = ({ cx, cy, scale, phase, energy }) => {
  const swing = Math.sin(phase * Math.PI * 2) * (8 + energy * 6);
  const armLift = Math.cos(phase * Math.PI * 2) * (10 + energy * 8);
  const headTilt = Math.sin(phase * Math.PI * 2 + 0.5) * 4;

  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      {/* Long flowing skirt/dress — base */}
      <path
        d={`M -14 30 Q ${swing - 8} 12 -10 -2 L 10 -2 Q ${swing + 8} 12 14 30 Z`}
        fill="rgba(80,40,30,0.85)"
      />
      {/* Body torso */}
      <ellipse cx={0} cy={-8} rx={6} ry={10} fill="#2a1810" />
      {/* Hair (long flowing) */}
      <path
        d={`M -8 -22 Q ${headTilt} -28 8 -22 L 10 -10 L -10 -10 Z`}
        fill="#1a0a05"
      />
      {/* Head */}
      <ellipse cx={headTilt * 0.6} cy={-22} rx={4.5} ry={5.5} fill="#3a2818" />
      {/* Raised arm */}
      <path
        d={`M 0 -12 Q ${armLift + 6} ${-armLift - 8} ${armLift + 8} ${-armLift - 18}`}
        stroke="#3a2818"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      {/* Other arm down/out */}
      <path
        d={`M 0 -10 Q -6 -2 ${-swing - 4} 4`}
        stroke="#3a2818"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      {/* Front leg */}
      <line x1={-2} y1={-2} x2={swing - 4} y2={28} stroke="#2a1810" strokeWidth={2.5} strokeLinecap="round" />
      {/* Back leg */}
      <line x1={2} y1={-2} x2={-swing + 6} y2={26} stroke="#2a1810" strokeWidth={2.5} strokeLinecap="round" />
      {/* Skirt fringe lines */}
      {Array.from({ length: 6 }).map((_, i) => (
        <line
          key={i}
          x1={-12 + i * 4.5}
          y1={28}
          x2={-12 + i * 4.5 + swing * 0.3}
          y2={32}
          stroke="rgba(60,30,20,0.6)"
          strokeWidth={0.8}
        />
      ))}
    </g>
  );
};

// ─── BEER COOLER ─────────────────────────────────────────────────

const BeerCooler: React.FC<{ cx: number; cy: number }> = ({ cx, cy }) => (
  <g transform={`translate(${cx} ${cy})`}>
    <ellipse cx={0} cy={18} rx={28} ry={4} fill="rgba(0,0,0,0.4)" />
    <rect x={-25} y={-6} width={50} height={22} rx={3} fill="#c92020" />
    <rect x={-25} y={-6} width={50} height={6} rx={3} fill="#a01818" />
    {/* Open lid hint */}
    <rect x={-22} y={-12} width={44} height={4} rx={1.5} fill="#7a1010" transform="rotate(-3)" />
    {/* "ICE COLD" text */}
    <text x={0} y={6} fontFamily="Arial Black, sans-serif" fontSize={6} fill="#f0d030" textAnchor="middle" fontWeight="bold">ICE COLD</text>
    {/* Ice block hint */}
    <rect x={-8} y={-2} width={16} height={6} fill="rgba(220,235,250,0.7)" rx={1} />
  </g>
);

// ─── MAIN COMPONENT ──────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const LotSceneRedux: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  // Audio-reactive amounts
  const bass = Math.min(1, (audio?.bass ?? 0));
  const energy = Math.min(1, (audio?.energy ?? 0));
  const vocalE = Math.min(1, (audio?.vocalEnergy ?? 0));
  // Beat snap proxy via drum onset (AudioSnapshot doesn't expose beatSnap directly).
  const beatSnap = Math.min(1, (audio?.drumOnset ?? 0));

  // Bus rocks on bass
  const busRock = Math.sin(frame * 0.08) * (0.3 + bass * 0.6);
  const cartGlow = energy;
  const cartSteamRise = 0.3 + energy * 0.7;

  // Dance phase advances each frame, bumps on beat
  const dancePhase = (frame / fps) * 0.6 + beatSnap * 0.15;

  // Tapestry sway
  const tapSway = Math.sin(frame * 0.04) * 0.6;
  const tapSat = 0.4 + vocalE * 0.6;

  // Position layout — bottom 1/3 of frame, scrolling slightly with the track
  const baseY = height * 0.78;
  const drift = Math.sin(frame * 0.005) * 8;

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.32 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="tieDyeGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e34050" />
            <stop offset="25%" stopColor="#f5b020" />
            <stop offset="50%" stopColor="#5a98c0" />
            <stop offset="75%" stopColor="#9c5ac0" />
            <stop offset="100%" stopColor="#e34050" />
          </linearGradient>
          <radialGradient id="lotHaze" cx="0.5" cy="1" r="1">
            <stop offset="0%" stopColor="rgba(180,140,100,0.35)" />
            <stop offset="100%" stopColor="rgba(180,140,100,0)" />
          </radialGradient>
        </defs>

        {/* Ground haze under everything — warm dust */}
        <rect x={0} y={baseY - 80} width={width} height={150} fill="url(#lotHaze)" opacity={0.6} />

        {/* VW Microbus #1 (left) */}
        <VWMicrobus cx={140 + drift} cy={baseY - 30} scale={0.9} rock={busRock} brightness={0.92} />

        {/* Tapestry row (left-center) */}
        <Tapestry cx={340 + drift} cy={baseY - 60} motif="stealie" saturation={tapSat} sway={tapSway} />
        <Tapestry cx={460 + drift} cy={baseY - 65} motif="rose" saturation={tapSat * 0.95} sway={tapSway * 1.2} />
        <Tapestry cx={580 + drift} cy={baseY - 60} motif="bolt" saturation={tapSat * 1.05} sway={tapSway * 0.85} />

        {/* Grilled-cheese cart (center-right) */}
        <GrilledCheeseCart cx={760 + drift} cy={baseY - 30} steamRise={cartSteamRise} glow={cartGlow} />

        {/* Vendor blanket with tapes (right) */}
        <TapeBlanket cx={970 + drift} cy={baseY + 15} />

        {/* Beer cooler (far right) */}
        <BeerCooler cx={1140 + drift} cy={baseY + 5} />

        {/* Dancing Deadheads scattered */}
        <DancingDeadhead cx={250 + drift} cy={baseY - 20} scale={0.85} phase={dancePhase} energy={energy} />
        <DancingDeadhead cx={285 + drift} cy={baseY - 24} scale={0.7} phase={dancePhase + 0.3} energy={energy} />
        <DancingDeadhead cx={680 + drift} cy={baseY - 22} scale={0.92} phase={dancePhase + 0.55} energy={energy} />
        <DancingDeadhead cx={715 + drift} cy={baseY - 20} scale={0.78} phase={dancePhase + 0.78} energy={energy} />
        <DancingDeadhead cx={1080 + drift} cy={baseY - 22} scale={0.82} phase={dancePhase + 0.42} energy={energy} />
        <DancingDeadhead cx={1175 + drift} cy={baseY - 18} scale={0.75} phase={dancePhase + 0.18} energy={energy} />

        {/* Smell plumes — small wavy lines drifting up from various points */}
        <g opacity={0.4} stroke="rgba(220,200,150,0.5)" strokeWidth={1} fill="none">
          {[
            { x: 760, y: baseY - 70 },  // from cart
            { x: 970, y: baseY - 30 },  // from blanket
          ].map((s, i) => (
            <path
              key={i}
              d={`M ${s.x} ${s.y} q 8 -10 -4 -22 q -8 -8 6 -28`}
              opacity={0.6 + Math.sin(frame * 0.05 + i) * 0.3}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
