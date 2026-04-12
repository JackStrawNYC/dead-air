/**
 * PlayingCards — A+++ classic Bicycle-style poker hand spread on green felt.
 *
 * 5 cards arranged as a fanned hand in the lower-center of the frame, against
 * a dark green felt poker table with subtle ambient overhead light. Each card
 * has:
 *   - Proper traditional Bicycle styling: white face, ornate corner indices
 *     (rank + suit pip), gold border, subtle texture
 *   - For face cards (J/Q/K): silhouetted illustration of the royal figure
 *     (NO smiley emoji faces) — vintage line-art-style portrait silhouettes
 *   - Center pip patterns for number cards
 *   - Realistic cast shadows
 *   - Slight perspective tilt
 *
 * The hand is: Ace of Spades, King of Hearts, Queen of Diamonds, Jack of Clubs,
 * 10 of Diamonds — a classic poker straight flush feel.
 *
 * Audio reactivity:
 *   slowEnergy → spotlight warmth + glow
 *   energy     → card glow / saturation
 *   beatDecay  → subtle pulse
 *   bass       → dust/smoke drift
 *   onsetEnvelope → spark sparkle
 *   chromaHue  → felt tint
 *   tempoFactor → drift speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;

type Suit = "spade" | "heart" | "diamond" | "club";
type Rank = "A" | "K" | "Q" | "J" | "10";

interface CardSpec {
  rank: Rank;
  suit: Suit;
  rotation: number;
  xOffset: number;
  yOffset: number;
}

const HAND: CardSpec[] = [
  { rank: "A", suit: "spade",   rotation: -22, xOffset: -0.21, yOffset: 0.05 },
  { rank: "K", suit: "heart",   rotation: -11, xOffset: -0.10, yOffset: 0.01 },
  { rank: "Q", suit: "diamond", rotation:   0, xOffset:  0.00, yOffset: -0.01 },
  { rank: "J", suit: "club",    rotation:  11, xOffset:  0.10, yOffset: 0.01 },
  { rank: "10",suit: "diamond", rotation:  22, xOffset:  0.21, yOffset: 0.05 },
];

const SUIT_COLOR: Record<Suit, string> = {
  spade: "#0a0a0a",
  club: "#0a0a0a",
  heart: "#b8141a",
  diamond: "#b8141a",
};

interface SmokeWisp { x: number; speed: number; phase: number; size: number; lifeOff: number; }
interface DustMote { x: number; y: number; r: number; speed: number; phase: number; }

function buildSmokeWisps(): SmokeWisp[] {
  const rng = seeded(771_133);
  return Array.from({ length: 6 }, () => ({
    x: 0.10 + rng() * 0.80,
    speed: 0.15 + rng() * 0.20,
    phase: rng() * Math.PI * 2,
    size: 26 + rng() * 22,
    lifeOff: rng() * 220,
  }));
}

function buildDust(): DustMote[] {
  const rng = seeded(884_002);
  return Array.from({ length: 28 }, () => ({
    x: rng(),
    y: 0.20 + rng() * 0.60,
    r: 1.0 + rng() * 1.8,
    speed: 0.005 + rng() * 0.018,
    phase: rng() * Math.PI * 2,
  }));
}

interface Props { frames: EnhancedFrameData[]; }

/* ─── Suit pip drawing helpers ─── */
const Pip: React.FC<{ suit: Suit; cx: number; cy: number; size: number; color: string }> = ({
  suit, cx, cy, size, color,
}) => {
  if (suit === "spade") {
    return (
      <path d={`M ${cx} ${cy - size}
        Q ${cx - size * 0.9} ${cy - size * 0.10} ${cx - size * 0.50} ${cy + size * 0.30}
        Q ${cx - size * 0.20} ${cy + size * 0.55} ${cx} ${cy + size * 0.20}
        Q ${cx + size * 0.20} ${cy + size * 0.55} ${cx + size * 0.50} ${cy + size * 0.30}
        Q ${cx + size * 0.9} ${cy - size * 0.10} ${cx} ${cy - size} Z
        M ${cx - size * 0.20} ${cy + size * 0.45}
        L ${cx + size * 0.20} ${cy + size * 0.45}
        L ${cx + size * 0.30} ${cy + size * 0.85}
        L ${cx - size * 0.30} ${cy + size * 0.85} Z`}
        fill={color} />
    );
  }
  if (suit === "club") {
    return (
      <g fill={color}>
        <circle cx={cx} cy={cy - size * 0.45} r={size * 0.40} />
        <circle cx={cx - size * 0.45} cy={cy + size * 0.10} r={size * 0.40} />
        <circle cx={cx + size * 0.45} cy={cy + size * 0.10} r={size * 0.40} />
        <path d={`M ${cx - size * 0.20} ${cy + size * 0.30}
          L ${cx + size * 0.20} ${cy + size * 0.30}
          L ${cx + size * 0.34} ${cy + size * 0.85}
          L ${cx - size * 0.34} ${cy + size * 0.85} Z`} />
      </g>
    );
  }
  if (suit === "heart") {
    return (
      <path d={`M ${cx} ${cy + size * 0.85}
        Q ${cx - size * 0.95} ${cy + size * 0.10}
          ${cx - size * 0.80} ${cy - size * 0.40}
        Q ${cx - size * 0.55} ${cy - size * 0.85}
          ${cx} ${cy - size * 0.30}
        Q ${cx + size * 0.55} ${cy - size * 0.85}
          ${cx + size * 0.80} ${cy - size * 0.40}
        Q ${cx + size * 0.95} ${cy + size * 0.10}
          ${cx} ${cy + size * 0.85} Z`}
        fill={color} />
    );
  }
  // diamond
  return (
    <path d={`M ${cx} ${cy - size}
      L ${cx + size * 0.65} ${cy}
      L ${cx} ${cy + size}
      L ${cx - size * 0.65} ${cy} Z`}
      fill={color} />
  );
};

/** Center pip pattern for number cards */
const CardPips: React.FC<{ rank: Rank; suit: Suit; cardW: number; cardH: number; color: string }> = ({
  rank, suit, cardW, cardH, color,
}) => {
  if (rank === "10") {
    // 10 pips: 4 in left column, 4 in right column, 2 in center top/bottom
    const ps = cardW * 0.10;
    const positions: [number, number, boolean][] = [
      [-0.25, -0.32, false], [0.25, -0.32, false],
      [-0.25, -0.10, false], [0.25, -0.10, false],
      [0, -0.21, false],
      [-0.25, 0.10, true], [0.25, 0.10, true],
      [-0.25, 0.32, true], [0.25, 0.32, true],
      [0, 0.21, true],
    ];
    return (
      <g>
        {positions.map(([px, py, flip], i) => (
          <g key={i} transform={flip ? `translate(${px * cardW} ${py * cardH}) rotate(180)` : `translate(${px * cardW} ${py * cardH})`}>
            <Pip suit={suit} cx={0} cy={0} size={ps} color={color} />
          </g>
        ))}
      </g>
    );
  }
  if (rank === "A") {
    // Big single center pip
    return <Pip suit={suit} cx={0} cy={0} size={cardW * 0.34} color={color} />;
  }
  return null;
};

/** Royal figure silhouette for face cards — NOT a smiley face */
const RoyalFigure: React.FC<{
  rank: "K" | "Q" | "J";
  suit: Suit;
  cardW: number;
  cardH: number;
  color: string;
}> = ({ rank, cardW, cardH, color }) => {
  // Half-portrait silhouette (head + torso) repeated mirrored top/bottom
  // Drawn as vintage line art with NO eyes/smile — all details are abstract
  // shapes. Half-circle medallion in center.
  const fillDk = "#1a1a1a";
  const fillGold = "#c8a04a";
  const fillRed = "#9a1620";
  const fillBlue = "#1a3a8a";

  function HalfPortrait({ flip }: { flip: boolean }) {
    return (
      <g transform={flip ? `scale(1 -1)` : ""}>
        {/* Crown / hat */}
        {rank === "K" && (
          <g>
            <path d={`M -${cardW * 0.20} -${cardH * 0.18}
              L -${cardW * 0.20} -${cardH * 0.10}
              L -${cardW * 0.14} -${cardH * 0.18}
              L -${cardW * 0.08} -${cardH * 0.08}
              L  ${cardW * 0.00} -${cardH * 0.20}
              L  ${cardW * 0.08} -${cardH * 0.08}
              L  ${cardW * 0.14} -${cardH * 0.18}
              L  ${cardW * 0.20} -${cardH * 0.10}
              L  ${cardW * 0.20} -${cardH * 0.18}
              L  ${cardW * 0.16} -${cardH * 0.05}
              L -${cardW * 0.16} -${cardH * 0.05} Z`}
              fill={fillGold} stroke={fillDk} strokeWidth={0.9} />
            <circle cx={-cardW * 0.14} cy={-cardH * 0.10} r={cardW * 0.012} fill={fillRed} />
            <circle cx={0} cy={-cardH * 0.13} r={cardW * 0.014} fill={fillBlue} />
            <circle cx={cardW * 0.14} cy={-cardH * 0.10} r={cardW * 0.012} fill={fillRed} />
          </g>
        )}
        {rank === "Q" && (
          <g>
            <path d={`M -${cardW * 0.18} -${cardH * 0.14}
              Q 0 -${cardH * 0.22} ${cardW * 0.18} -${cardH * 0.14}
              L ${cardW * 0.16} -${cardH * 0.05}
              L -${cardW * 0.16} -${cardH * 0.05} Z`}
              fill={fillGold} stroke={fillDk} strokeWidth={0.9} />
            <circle cx={0} cy={-cardH * 0.14} r={cardW * 0.018} fill={fillRed} />
            <circle cx={-cardW * 0.10} cy={-cardH * 0.10} r={cardW * 0.012} fill={fillBlue} />
            <circle cx={cardW * 0.10} cy={-cardH * 0.10} r={cardW * 0.012} fill={fillBlue} />
          </g>
        )}
        {rank === "J" && (
          <g>
            <path d={`M -${cardW * 0.18} -${cardH * 0.10}
              Q 0 -${cardH * 0.20} ${cardW * 0.18} -${cardH * 0.10}
              L ${cardW * 0.16} -${cardH * 0.04}
              L -${cardW * 0.16} -${cardH * 0.04} Z`}
              fill={fillRed} stroke={fillDk} strokeWidth={0.9} />
            <line x1={cardW * 0.18} y1={-cardH * 0.10} x2={cardW * 0.26} y2={-cardH * 0.18}
              stroke={fillGold} strokeWidth={1.6} />
            <circle cx={cardW * 0.26} cy={-cardH * 0.18} r={cardW * 0.012} fill={fillGold} />
          </g>
        )}
        {/* Head silhouette — solid oval (no eyes/smile) */}
        <ellipse cx={0} cy={-cardH * 0.02} rx={cardW * 0.12} ry={cardH * 0.05}
          fill="#e8d8a0" stroke={fillDk} strokeWidth={1.4} />
        {/* Hair / wig outline */}
        <path d={`M -${cardW * 0.14} -${cardH * 0.04}
          Q -${cardW * 0.10} ${cardH * 0.04} -${cardW * 0.04} ${cardH * 0.02}
          L ${cardW * 0.04} ${cardH * 0.02}
          Q ${cardW * 0.10} ${cardH * 0.04} ${cardW * 0.14} -${cardH * 0.04}`}
          stroke={fillDk} strokeWidth={1.6} fill="none" />
        {/* Beard / collar (K only) */}
        {rank === "K" && (
          <path d={`M -${cardW * 0.10} ${cardH * 0.01}
            Q 0 ${cardH * 0.06} ${cardW * 0.10} ${cardH * 0.01}
            L ${cardW * 0.08} ${cardH * 0.05}
            L -${cardW * 0.08} ${cardH * 0.05} Z`}
            fill="#e8e0c0" stroke={fillDk} strokeWidth={1.0} />
        )}
        {/* Robe / collar */}
        <path d={`M -${cardW * 0.20} ${cardH * 0.06}
          Q -${cardW * 0.10} ${cardH * 0.04} 0 ${cardH * 0.05}
          Q ${cardW * 0.10} ${cardH * 0.04} ${cardW * 0.20} ${cardH * 0.06}
          L ${cardW * 0.24} ${cardH * 0.18}
          L -${cardW * 0.24} ${cardH * 0.18} Z`}
          fill={color === "#b8141a" ? fillRed : fillBlue}
          stroke={fillDk} strokeWidth={1.2} />
        {/* Robe gold trim */}
        <path d={`M -${cardW * 0.20} ${cardH * 0.06}
          Q 0 ${cardH * 0.07} ${cardW * 0.20} ${cardH * 0.06}`}
          stroke={fillGold} strokeWidth={1.6} fill="none" />
        {/* Sword / scepter / flower (rank-specific) */}
        {rank === "K" && (
          <g>
            <line x1={-cardW * 0.22} y1={cardH * 0.18}
              x2={-cardW * 0.30} y2={-cardH * 0.04}
              stroke={fillGold} strokeWidth={1.8} />
            <circle cx={-cardW * 0.30} cy={-cardH * 0.04} r={cardW * 0.014} fill={fillGold} />
            <line x1={cardW * 0.22} y1={cardH * 0.18}
              x2={cardW * 0.32} y2={-cardH * 0.04}
              stroke="#a8a8a8" strokeWidth={2.4} />
            <line x1={cardW * 0.32} y1={-cardH * 0.04}
              x2={cardW * 0.34} y2={-cardH * 0.06}
              stroke={fillGold} strokeWidth={2.4} />
          </g>
        )}
        {rank === "Q" && (
          <g>
            <line x1={-cardW * 0.22} y1={cardH * 0.18}
              x2={-cardW * 0.30} y2={-cardH * 0.04}
              stroke={fillGold} strokeWidth={1.4} />
            <ellipse cx={-cardW * 0.30} cy={-cardH * 0.06} rx={cardW * 0.025} ry={cardW * 0.022}
              fill={fillRed} />
            <ellipse cx={-cardW * 0.27} cy={-cardH * 0.08} rx={cardW * 0.014} ry={cardW * 0.012}
              fill="#e8d8a0" />
          </g>
        )}
        {rank === "J" && (
          <g>
            <line x1={cardW * 0.20} y1={cardH * 0.16}
              x2={cardW * 0.32} y2={-cardH * 0.06}
              stroke={fillGold} strokeWidth={1.6} />
            <circle cx={cardW * 0.32} cy={-cardH * 0.06} r={cardW * 0.018} fill={fillBlue} />
          </g>
        )}
      </g>
    );
  }

  return (
    <g>
      {/* Diagonal divider line (classic face card has mirrored top/bottom) */}
      <line x1={-cardW * 0.36} y1={-cardH * 0.36}
        x2={cardW * 0.36} y2={cardH * 0.36}
        stroke={fillDk} strokeWidth={0.5} opacity={0.35} />
      {/* Top half */}
      <g transform={`translate(0 -${cardH * 0.18})`}>
        <HalfPortrait flip={false} />
      </g>
      {/* Bottom half (mirrored) */}
      <g transform={`translate(0 ${cardH * 0.18})`}>
        <HalfPortrait flip />
      </g>
    </g>
  );
};

const PlayingCard: React.FC<{
  card: CardSpec;
  cardW: number;
  cardH: number;
}> = ({ card, cardW, cardH }) => {
  const halfW = cardW / 2;
  const halfH = cardH / 2;
  const color = SUIT_COLOR[card.suit];
  const cornerRank = card.rank === "10" ? "10" : card.rank;
  const cornerFs = cardW * 0.18;
  const cornerSs = cardW * 0.13;

  return (
    <g>
      {/* White card background */}
      <rect x={-halfW} y={-halfH} width={cardW} height={cardH}
        rx={cardW * 0.07} ry={cardW * 0.07}
        fill="#fdfaf2" stroke="#1a1208" strokeWidth={2} />
      {/* Inner gold border */}
      <rect x={-halfW + cardW * 0.05} y={-halfH + cardW * 0.05}
        width={cardW - cardW * 0.10} height={cardH - cardW * 0.10}
        rx={cardW * 0.04} ry={cardW * 0.04}
        fill="none" stroke="#b8941a" strokeWidth={0.9} opacity={0.55} />
      {/* Subtle paper texture (cross-hatch lines) */}
      {[0.10, 0.30, 0.50, 0.70, 0.90].map((y, i) => (
        <line key={`tex-${i}`}
          x1={-halfW + cardW * 0.07} y1={-halfH + cardH * y}
          x2={halfW - cardW * 0.07} y2={-halfH + cardH * y}
          stroke="#d8c8a0" strokeWidth={0.3} opacity={0.25} />
      ))}

      {/* Top-left corner: rank + suit */}
      <text x={-halfW + cardW * 0.13} y={-halfH + cardW * 0.22}
        fontSize={cornerFs} fontFamily="Georgia, serif" fontWeight="bold"
        fill={color} textAnchor="middle">{cornerRank}</text>
      <g transform={`translate(${-halfW + cardW * 0.13} ${-halfH + cardW * 0.36})`}>
        <Pip suit={card.suit} cx={0} cy={0} size={cornerSs} color={color} />
      </g>

      {/* Bottom-right corner: rotated rank + suit */}
      <g transform={`rotate(180 ${halfW - cardW * 0.13} ${halfH - cardW * 0.22})`}>
        <text x={halfW - cardW * 0.13} y={halfH - cardW * 0.22}
          fontSize={cornerFs} fontFamily="Georgia, serif" fontWeight="bold"
          fill={color} textAnchor="middle">{cornerRank}</text>
        <g transform={`translate(${halfW - cardW * 0.13} ${halfH - cardW * 0.08})`}>
          <Pip suit={card.suit} cx={0} cy={0} size={cornerSs} color={color} />
        </g>
      </g>

      {/* Center: pips for A/10, royal figure for J/Q/K */}
      {(card.rank === "A" || card.rank === "10") && (
        <CardPips rank={card.rank} suit={card.suit} cardW={cardW} cardH={cardH} color={color} />
      )}
      {(card.rank === "J" || card.rank === "Q" || card.rank === "K") && (
        <g>
          {/* Frame around royal figure */}
          <rect x={-cardW * 0.34} y={-cardH * 0.40}
            width={cardW * 0.68} height={cardH * 0.80}
            rx={cardW * 0.03}
            fill="none" stroke={color} strokeWidth={1.2} opacity={0.45} />
          <RoyalFigure rank={card.rank} suit={card.suit} cardW={cardW} cardH={cardH} color={color} />
        </g>
      )}
    </g>
  );
};

export const PlayingCards: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const wisps = React.useMemo(buildSmokeWisps, []);
  const dust = React.useMemo(buildDust, []);

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.90, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.95;
  if (masterOpacity < 0.01) return null;

  const warmth = interpolate(snap.slowEnergy, [0.0, 0.32], [0.20, 1.50], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardGlow = interpolate(snap.energy, [0.0, 0.30], [0.55, 1.0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pulse = 1 + snap.beatDecay * 0.12;
  const sparkle = snap.onsetEnvelope > 0.4 ? Math.min(1, (snap.onsetEnvelope - 0.3) * 1.6) : 0;

  const tintShift = snap.chromaHue - 180;
  const feltHueA = `hsl(${(140 + tintShift * 0.10) % 360}, 60%, 18%)`;
  const feltHueB = `hsl(${(150 + tintShift * 0.10) % 360}, 50%, 8%)`;

  const cardW = Math.min(width * 0.13, 220) * pulse;
  const cardH = cardW * 1.45;
  const handCx = width * 0.5;
  const handCy = height * 0.62;

  // Smoke wisps (cigar smoke)
  const wispNodes = wisps.map((w, i) => {
    const t = ((cycleFrame + w.lifeOff) % 320) / 320;
    const sx = w.x * width + Math.sin(frame * 0.012 + w.phase) * 18;
    const sy = (1 - t) * height * 0.85;
    const wr = w.size * (1 + t * 1.2);
    return (
      <ellipse key={`wisp-${i}`} cx={sx} cy={sy} rx={wr} ry={wr * 0.7}
        fill="#e8e3d8" opacity={Math.sin(t * Math.PI) * 0.16}
        filter="url(#pc-blur-lg)" />
    );
  });

  // Dust motes
  const dustNodes = dust.map((d, i) => {
    const flick = 0.5 + Math.sin(frame * d.speed + d.phase) * 0.5;
    return (
      <circle key={`dm-${i}`} cx={d.x * width} cy={d.y * height}
        r={d.r * (0.7 + flick * 0.6)}
        fill="rgba(255, 240, 200, 0.65)" opacity={0.30 * flick * warmth} />
    );
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <radialGradient id="pc-felt" cx="50%" cy="55%" r="80%">
            <stop offset="0%" stopColor={feltHueA} />
            <stop offset="55%" stopColor={feltHueB} />
            <stop offset="100%" stopColor="#03100a" />
          </radialGradient>
          <radialGradient id="pc-spot" cx="50%" cy="20%" r="65%">
            <stop offset="0%" stopColor="#fff5d6" stopOpacity={0.55 * warmth} />
            <stop offset="40%" stopColor="#e8c98a" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pc-vig">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.70)" />
          </radialGradient>
          <filter id="pc-blur-lg" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id="pc-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Felt background */}
        <rect width={width} height={height} fill="url(#pc-felt)" />

        {/* Inner felt boundary oval */}
        <ellipse cx={width / 2} cy={height * 0.55}
          rx={width * 0.55} ry={height * 0.48}
          fill="none" stroke="#03100a" strokeWidth={3} opacity={0.35} />
        <ellipse cx={width / 2} cy={height * 0.55}
          rx={width * 0.52} ry={height * 0.46}
          fill="none" stroke="rgba(255, 220, 140, 0.10)" strokeWidth={1} />

        {/* Overhead spotlight */}
        <rect width={width} height={height} fill="url(#pc-spot)" />

        {/* Cigar smoke */}
        {wispNodes}

        {/* Card shadows */}
        {HAND.map((card, i) => {
          const cx = handCx + card.xOffset * width;
          const cy = handCy + card.yOffset * height;
          return (
            <g key={`shadow-${i}`} transform={`translate(${cx + 8} ${cy + 14}) rotate(${card.rotation})`}>
              <rect x={-cardW / 2} y={-cardH / 2} width={cardW} height={cardH}
                rx={cardW * 0.07}
                fill="rgba(0, 0, 0, 0.55)" filter="url(#pc-shadow)" />
            </g>
          );
        })}

        {/* Cards (back to front so they overlap nicely) */}
        {HAND.map((card, i) => {
          const cx = handCx + card.xOffset * width;
          const cy = handCy + card.yOffset * height;
          const cardSway = Math.sin(frame * 0.012 * tempoFactor + i * 0.7) * 1.5;
          return (
            <g key={`card-${i}`}
              transform={`translate(${cx} ${cy + cardSway}) rotate(${card.rotation})`}
              style={{ filter: `drop-shadow(0 0 ${4 + cardGlow * 14}px hsla(45, 90%, 70%, ${0.30 + cardGlow * 0.25}))` }}>
              <PlayingCard card={card} cardW={cardW} cardH={cardH} />
            </g>
          );
        })}

        {/* Sparkle on onset */}
        {sparkle > 0.05 && (
          <ellipse cx={handCx} cy={handCy}
            rx={cardW * 4} ry={cardH * 1.5}
            fill={`hsla(45, 90%, 80%, ${sparkle * 0.18})`}
            filter="url(#pc-blur-lg)" />
        )}

        {/* Dust motes */}
        <g style={{ mixBlendMode: "screen" }}>{dustNodes}</g>

        {/* Vignette */}
        <rect width={width} height={height} fill="url(#pc-vig)" />
      </svg>
    </div>
  );
};
