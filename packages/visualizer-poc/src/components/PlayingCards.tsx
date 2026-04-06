/**
 * PlayingCards — Casino tableau for "Deal" / gambling-themed Dead songs.
 *
 * "Don't you let that deal go down" — the Dead loved gambling imagery (Loser,
 * Stagger Lee, Jack Straw, Deal, Candyman). This overlay arranges 6 Dead-themed
 * playing cards across a green-felt casino table with poker chips, a tumbling
 * die, cigar smoke wisps, and a warm overhead spotlight.
 *
 * Cards: Ace of Spades (death card), King of Hearts (suicide king),
 * Jack of Diamonds (Jack Straw!), Queen of Hearts, Stealie Joker, and a face-down
 * card with a stealie/rose back pattern.
 *
 * Audio Reactivity:
 *   - energy        → card glow intensity, spotlight brightness, master opacity
 *   - beatDecay     → poker chip stack pulse
 *   - onsetEnvelope → triggers card flip animations
 *   - chromaHue     → tints the felt background
 *   - bass          → drives tumbling die rotation + bounce height
 *   - tempoFactor   → master rotation/drift speed
 *
 * Cycle: 50s, 14s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 1500;
const DURATION = 420;
const FADE = 36;
const NUM_CARDS = 6;
const CARD_W = 150;
const CARD_H = 210;

type Suit = "spade" | "heart" | "diamond";
type Rank = "A" | "K" | "Q" | "J" | "JOKER" | "BACK";
interface CardSpec { rank: Rank; suit: Suit; face: "up" | "down" }

const CARDS: CardSpec[] = [
  { rank: "A", suit: "spade", face: "up" },
  { rank: "K", suit: "heart", face: "up" },
  { rank: "J", suit: "diamond", face: "up" },
  { rank: "Q", suit: "heart", face: "up" },
  { rank: "JOKER", suit: "spade", face: "up" },
  { rank: "BACK", suit: "spade", face: "down" },
];

const SUIT_COLOR: Record<Suit, string> = { spade: "#0a0a0a", heart: "#c01a1a", diamond: "#c01a1a" };
const SUIT_GLYPH: Record<Suit, string> = { spade: "♠", heart: "♥", diamond: "♦" };

const CHIP_COLORS: [string, string, string][] = [
  ["#c01a1a", "#7a0c0c", "#ffffff"],
  ["#1a3fc0", "#0c1a7a", "#ffffff"],
  ["#1a8a2a", "#0c5018", "#ffffff"],
  ["#0a0a0a", "#222222", "#dddddd"],
  ["#d4a017", "#8a6a0c", "#ffffff"],
];

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, -0.5], [0.5, 0.5]],
  3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
  6: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5]],
};

interface Props { frames: EnhancedFrameData[] }

export const PlayingCards: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  const layout = React.useMemo(() => {
    const r = seeded(7842);
    const cards = CARDS.map((card, i) => {
      const t = (i + 0.5) / NUM_CARDS;
      return {
        card,
        cx: 0.18 + t * 0.66 + (r() - 0.5) * 0.04,
        cy: 0.46 + (r() - 0.5) * 0.16 + Math.sin(t * Math.PI) * -0.06,
        baseRot: (t - 0.5) * 35 + (r() - 0.5) * 14,
        bobFreq: 0.6 + r() * 0.7,
        bobPhase: r() * Math.PI * 2,
        bobAmp: 6 + r() * 8,
        rotFreq: 0.25 + r() * 0.4,
        rotPhase: r() * Math.PI * 2,
        rotAmp: 2 + r() * 3,
        flipPhase: r() * Math.PI * 2,
        flipFreq: 0.7 + r() * 0.6,
        sparklePhase: r() * Math.PI * 2,
        scale: 0.92 + r() * 0.18,
      };
    });
    const chipStacks = Array.from({ length: 4 }).map(() => ({
      cx: 0.08 + r() * 0.84,
      cy: 0.78 + (r() - 0.5) * 0.1,
      height: 3 + Math.floor(r() * 5),
      radius: 28 + r() * 6,
      color: CHIP_COLORS[Math.floor(r() * CHIP_COLORS.length)],
      wobblePhase: r() * Math.PI * 2,
    }));
    const smokeWisps = Array.from({ length: 5 }).map(() => ({
      cx: 0.12 + r() * 0.76,
      driftFreq: 0.15 + r() * 0.2,
      driftPhase: r() * Math.PI * 2,
      driftAmp: 18 + r() * 22,
      lifeOffset: r() * 200,
      lifeDuration: 220 + r() * 140,
      width: 28 + r() * 18,
    }));
    const die = {
      startX: 0.72 + r() * 0.1,
      bouncePhase: r() * Math.PI * 2,
      driftAmp: 14 + r() * 10,
    };
    return { cards, chipStacks, smokeWisps, die };
  }, []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const fadeIn = interpolate(cycleFrame, [0, FADE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(cycleFrame, [DURATION - FADE, DURATION], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const baseOpacity = Math.min(fadeIn, fadeOut);
  if (baseOpacity < 0.01) return null;

  const t = cycleFrame / 30;
  const energyGlow = 4 + snap.energy * 22;
  const chipPulse = 1 + snap.beatDecay * 0.18;
  const onset = snap.onsetEnvelope;
  const bass = snap.bass;
  const hueShift = (snap.chromaHue / 360) * 36 - 18;
  const opacity = baseOpacity * (0.78 + Math.min(0.22, snap.energy * 0.6));
  const spotlightStrength = 0.55 + snap.energy * 0.25;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", opacity, willChange: "opacity" }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ filter: `hue-rotate(${hueShift}deg)` }}>
        <defs>
          <radialGradient id="pc-felt" cx="50%" cy="55%" r="75%">
            <stop offset="0%" stopColor="#0e5b2e" stopOpacity={0.55} />
            <stop offset="55%" stopColor="#0a3e1f" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#03150a" stopOpacity={0.6} />
          </radialGradient>
          <radialGradient id="pc-spot" cx="50%" cy="20%" r="65%" fx="50%" fy="18%">
            <stop offset="0%" stopColor="#fff5d6" stopOpacity={spotlightStrength} />
            <stop offset="40%" stopColor="#e8c98a" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pc-back" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#c41e3a" stopOpacity={1} />
            <stop offset="65%" stopColor="#7a0c1c" stopOpacity={1} />
            <stop offset="100%" stopColor="#3a040c" stopOpacity={1} />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={width} height={height} fill="url(#pc-felt)" />
        <ellipse cx={width * 0.5} cy={height * 0.55} rx={width * 0.55} ry={height * 0.45} fill="none" stroke="#03100a" strokeWidth={3} opacity={0.25} />
        <rect x={0} y={0} width={width} height={height} fill="url(#pc-spot)" />

        {/* Cigar smoke */}
        {layout.smokeWisps.map((w, i) => {
          const localT = (cycleFrame + w.lifeOffset) % w.lifeDuration;
          const lifeP = localT / w.lifeDuration;
          const sx = w.cx * width + Math.sin(t * w.driftFreq + w.driftPhase) * w.driftAmp;
          const sy = 0.85 * height - lifeP * height * 0.7;
          const wispR = w.width * (1 + lifeP * 1.6);
          return (
            <ellipse key={`smoke-${i}`} cx={sx} cy={sy} rx={wispR} ry={wispR * 0.7}
              fill="#e8e3d8" opacity={Math.sin(lifeP * Math.PI) * 0.18} style={{ filter: "blur(8px)" }} />
          );
        })}

        {/* Poker chip stacks */}
        {layout.chipStacks.map((stack, si) => {
          const sx = stack.cx * width + Math.sin(t * 0.7 + stack.wobblePhase) * 1.2;
          const sy = stack.cy * height;
          const sp = chipPulse + Math.sin(t * 2 + stack.wobblePhase) * 0.03;
          const [face, edge, stripe] = stack.color;
          return (
            <g key={`chips-${si}`} transform={`translate(${sx}, ${sy})`}>
              <ellipse cx={0} cy={6} rx={stack.radius * 1.1 * sp} ry={stack.radius * 0.32 * sp} fill="#000000" opacity={0.4} style={{ filter: "blur(2.5px)" }} />
              {Array.from({ length: stack.height }).map((_, ci) => {
                const cy = -ci * 6;
                const r = stack.radius * sp;
                return (
                  <g key={`chip-${si}-${ci}`}>
                    <ellipse cx={0} cy={cy + 3} rx={r} ry={r * 0.3} fill={edge} opacity={0.92} />
                    <ellipse cx={0} cy={cy} rx={r} ry={r * 0.3} fill={face} stroke={edge} strokeWidth={1.2} opacity={0.96} />
                    {[-1, -0.5, 0, 0.5, 1].map((p, pi) => (
                      <rect key={`s-${si}-${ci}-${pi}`} x={p * r * 0.85 - 1.5} y={cy - r * 0.32} width={3} height={r * 0.2} fill={stripe} opacity={0.85} />
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Tumbling die — bass-driven */}
        {(() => {
          const dieSize = 38;
          const dieX = layout.die.startX * width + Math.sin(t * 0.96 + layout.die.bouncePhase) * layout.die.driftAmp;
          const dieBounce = Math.abs(Math.sin(t * (1.6 + bass * 4) + layout.die.bouncePhase));
          const dieY = height * 0.74 - dieBounce * (28 + bass * 70);
          const dieRot = t * (60 + bass * 240) * (tempoFactor || 1);
          const faceVal = (Math.floor(t * (4 + bass * 12)) % 6) + 1;
          const halfD = dieSize / 2;
          return (
            <g transform={`translate(${dieX}, ${dieY}) rotate(${dieRot})`} style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))" }}>
              <rect x={-halfD} y={-halfD} width={dieSize} height={dieSize} rx={6} ry={6} fill="#fdfaf2" stroke="#1a1208" strokeWidth={1.4} />
              {PIPS[faceVal].map((p, pi) => (
                <circle key={`dp-${pi}`} cx={p[0] * halfD * 0.62} cy={p[1] * halfD * 0.62} r={dieSize * 0.09} fill="#1a1208" />
              ))}
            </g>
          );
        })()}

        {/* Playing cards */}
        {layout.cards
          .map((c, i) => ({ ...c, originalIndex: i }))
          .sort((a, b) => Math.abs(b.cx - 0.5) - Math.abs(a.cx - 0.5))
          .map((cardObj) => {
            const i = cardObj.originalIndex;
            const cx = cardObj.cx * width;
            const bob = Math.sin(t * cardObj.bobFreq * (tempoFactor || 1) + cardObj.bobPhase) * cardObj.bobAmp;
            const cy = cardObj.cy * height + bob;
            const rot = cardObj.baseRot + Math.sin(t * cardObj.rotFreq + cardObj.rotPhase) * cardObj.rotAmp;
            const flipsThisCard = i === 0 || i === 4 || i === 5;
            const flipPhase = t * cardObj.flipFreq * 0.5 + cardObj.flipPhase + onset * 4;
            const flipAmount = flipsThisCard ? Math.sin(flipPhase) * (0.3 + onset * 0.7) : 0;
            const scaleX = Math.cos(flipAmount * Math.PI);
            const showingFront = cardObj.card.face === "up" ? scaleX >= 0 : scaleX < 0;
            const absScaleX = Math.max(0.04, Math.abs(scaleX));
            const sparklePhase = t * 0.8 + cardObj.sparklePhase;
            const sparkleX = Math.cos(sparklePhase) * (CARD_W * 0.3) * cardObj.scale;
            const sparkleY = Math.sin(sparklePhase * 1.3) * (CARD_H * 0.3) * cardObj.scale;
            const sparkleOp = 0.35 + snap.energy * 0.45;
            const cardW = CARD_W * cardObj.scale;
            const cardH = CARD_H * cardObj.scale;
            return (
              <g key={`card-${i}`}
                transform={`translate(${cx}, ${cy}) rotate(${rot}) scale(${absScaleX}, 1)`}
                style={{ filter: `drop-shadow(0 0 ${energyGlow}px rgba(255,230,150,${0.35 + snap.energy * 0.4})) drop-shadow(0 6px 8px rgba(0,0,0,0.6))` }}>
                {showingFront
                  ? <CardFront card={cardObj.card} cardW={cardW} cardH={cardH} />
                  : <CardBack cardW={cardW} cardH={cardH} />}
                <circle cx={sparkleX} cy={sparkleY} r={2 + snap.energy * 3} fill="#fffbe5" opacity={sparkleOp} />
                <circle cx={sparkleX} cy={sparkleY} r={6 + snap.energy * 6} fill="#fffbe5" opacity={sparkleOp * 0.35} style={{ filter: "blur(3px)" }} />
              </g>
            );
          })}
      </svg>
    </div>
  );
};

/* ---------- CardFront: rank+suit corners + center figure ---------- */
const CardFront: React.FC<{ card: CardSpec; cardW: number; cardH: number }> = ({ card, cardW, cardH }) => {
  const halfW = cardW / 2, halfH = cardH / 2;
  const isJoker = card.rank === "JOKER";
  const color = isJoker ? "#1a1a1a" : SUIT_COLOR[card.suit];
  const glyph = isJoker ? "★" : SUIT_GLYPH[card.suit];
  const rankLabel = isJoker ? "JKR" : card.rank;
  const fS = cardW * 0.13, sS = cardW * 0.11;

  return (
    <g>
      <rect x={-halfW} y={-halfH} width={cardW} height={cardH} rx={cardW * 0.07} ry={cardW * 0.07} fill="#fdfaf2" stroke="#1a1208" strokeWidth={1.6} />
      <rect x={-halfW + cardW * 0.05} y={-halfH + cardW * 0.05} width={cardW - cardW * 0.1} height={cardH - cardW * 0.1} rx={cardW * 0.04} ry={cardW * 0.04} fill="none" stroke={color} strokeWidth={0.9} opacity={0.4} />

      {/* Top-left corner */}
      <text x={-halfW + cardW * 0.1} y={-halfH + cardW * 0.18} fontSize={fS} fontFamily="Georgia, serif" fontWeight="bold" fill={color} textAnchor="middle">{rankLabel}</text>
      <text x={-halfW + cardW * 0.1} y={-halfH + cardW * 0.32} fontSize={sS} fill={color} textAnchor="middle">{glyph}</text>

      {/* Bottom-right corner (rotated 180°) */}
      <g transform={`rotate(180, ${halfW - cardW * 0.1}, ${halfH - cardW * 0.18})`}>
        <text x={halfW - cardW * 0.1} y={halfH - cardW * 0.18} fontSize={fS} fontFamily="Georgia, serif" fontWeight="bold" fill={color} textAnchor="middle">{rankLabel}</text>
        <text x={halfW - cardW * 0.1} y={halfH - cardW * 0.04} fontSize={sS} fill={color} textAnchor="middle">{glyph}</text>
      </g>

      {/* Center decoration */}
      {card.rank === "A" && (
        <text x={0} y={cardW * 0.18} fontSize={cardW * 0.7} fill={color} textAnchor="middle">{glyph}</text>
      )}
      {(card.rank === "K" || card.rank === "Q" || card.rank === "J") && (
        <FigureFace rank={card.rank} color={color} glyph={glyph} cardW={cardW} cardH={cardH} />
      )}
      {card.rank === "JOKER" && <StealieJoker cardW={cardW} cardH={cardH} />}
    </g>
  );
};

/* ---------- FigureFace: King / Queen / Jack ---------- */
const FigureFace: React.FC<{ rank: "K" | "Q" | "J"; color: string; glyph: string; cardW: number; cardH: number }> = ({ rank, color, glyph, cardW, cardH }) => {
  const cy = -cardH * 0.02;
  const hr = cardW * 0.18;
  return (
    <g>
      <rect x={-cardW * 0.32} y={-cardH * 0.32} width={cardW * 0.64} height={cardH * 0.64} rx={cardW * 0.04} ry={cardW * 0.04} fill="none" stroke={color} strokeWidth={0.7} opacity={0.35} />
      <circle cx={0} cy={cy} r={hr} fill="#f5e6c8" stroke={color} strokeWidth={1.2} />

      {rank === "K" && (
        <>
          <path d={`M ${-hr * 1.05} ${cy - hr * 0.85} L ${-hr * 0.6} ${cy - hr * 1.6} L ${-hr * 0.25} ${cy - hr * 0.95} L 0 ${cy - hr * 1.7} L ${hr * 0.25} ${cy - hr * 0.95} L ${hr * 0.6} ${cy - hr * 1.6} L ${hr * 1.05} ${cy - hr * 0.85} Z`} fill="#d4a017" stroke={color} strokeWidth={1.1} />
          <circle cx={-hr * 0.6} cy={cy - hr * 1.45} r={2.2} fill="#c01a1a" />
          <circle cx={0} cy={cy - hr * 1.55} r={2.6} fill="#1a3fc0" />
          <circle cx={hr * 0.6} cy={cy - hr * 1.45} r={2.2} fill="#1a8a2a" />
          <path d={`M ${-hr * 0.7} ${cy + hr * 0.4} Q 0 ${cy + hr * 1.4} ${hr * 0.7} ${cy + hr * 0.4} Z`} fill="#d8d2c4" stroke={color} strokeWidth={0.8} />
        </>
      )}
      {rank === "Q" && (
        <>
          <path d={`M ${-hr * 0.95} ${cy - hr * 0.95} Q 0 ${cy - hr * 1.55} ${hr * 0.95} ${cy - hr * 0.95}`} fill="none" stroke="#d4a017" strokeWidth={2.2} />
          <circle cx={0} cy={cy - hr * 1.35} r={2.4} fill="#c01a1a" />
          <circle cx={-hr * 0.55} cy={cy - hr * 1.18} r={1.8} fill="#1a3fc0" />
          <circle cx={hr * 0.55} cy={cy - hr * 1.18} r={1.8} fill="#1a3fc0" />
          <path d={`M ${-hr * 1.1} ${cy} Q ${-hr * 1.4} ${cy + hr * 0.9} ${-hr * 0.6} ${cy + hr * 1.05}`} fill="#6b3812" stroke={color} strokeWidth={0.8} />
          <path d={`M ${hr * 1.1} ${cy} Q ${hr * 1.4} ${cy + hr * 0.9} ${hr * 0.6} ${cy + hr * 1.05}`} fill="#6b3812" stroke={color} strokeWidth={0.8} />
        </>
      )}
      {rank === "J" && (
        <>
          <path d={`M ${-hr * 1.05} ${cy - hr * 0.5} Q ${-hr * 0.9} ${cy - hr * 1.4} ${hr * 0.6} ${cy - hr * 1.3} L ${hr * 1.0} ${cy - hr * 0.6} Z`} fill="#1a8a2a" stroke={color} strokeWidth={1.1} />
          <line x1={hr * 0.6} y1={cy - hr * 1.3} x2={hr * 1.2} y2={cy - hr * 1.85} stroke="#fdfaf2" strokeWidth={1.5} />
          <path d={`M ${-hr * 1.05} ${cy} Q ${-hr * 1.2} ${cy + hr * 0.8} ${-hr * 0.5} ${cy + hr * 0.9}`} fill="#a06a2a" stroke={color} strokeWidth={0.7} />
        </>
      )}

      {/* Eyes / nose / mouth */}
      <circle cx={-hr * 0.32} cy={cy - hr * 0.05} r={1.6} fill={color} />
      <circle cx={hr * 0.32} cy={cy - hr * 0.05} r={1.6} fill={color} />
      <line x1={0} y1={cy + hr * 0.05} x2={0} y2={cy + hr * 0.22} stroke={color} strokeWidth={0.9} />
      <path d={`M ${-hr * 0.22} ${cy + hr * 0.4} Q 0 ${cy + hr * 0.5} ${hr * 0.22} ${cy + hr * 0.4}`} fill="none" stroke={color} strokeWidth={1.0} />

      {/* Collar */}
      <path d={`M ${-hr * 1.4} ${cy + hr * 1.6} Q ${-hr * 0.5} ${cy + hr * 1.0} 0 ${cy + hr * 1.05} Q ${hr * 0.5} ${cy + hr * 1.0} ${hr * 1.4} ${cy + hr * 1.6} L ${hr * 1.4} ${cy + hr * 2.0} L ${-hr * 1.4} ${cy + hr * 2.0} Z`} fill={color === "#c01a1a" ? "#c01a1a" : "#1a1a1a"} opacity={0.85} stroke={color} strokeWidth={1.0} />

      {/* Suit accents */}
      <text x={-cardW * 0.28} y={cardH * 0.34} fontSize={cardW * 0.13} fill={color} textAnchor="middle">{glyph}</text>
      <text x={cardW * 0.28} y={-cardH * 0.24} fontSize={cardW * 0.13} fill={color} textAnchor="middle">{glyph}</text>
    </g>
  );
};

/* ---------- StealieJoker: Joker with Steal-Your-Face center ---------- */
const StealieJoker: React.FC<{ cardW: number; cardH: number }> = ({ cardW, cardH }) => {
  const r = cardW * 0.27;
  return (
    <g>
      <circle cx={0} cy={0} r={r} fill="#c01a1a" stroke="#1a1208" strokeWidth={1.2} />
      <path d={`M 0 ${-r} A ${r} ${r} 0 0 0 0 ${r} Z`} fill="#1a3fc0" />
      <path d={`M ${-r * 0.4} ${-r * 0.7} L ${r * 0.15} ${-r * 0.05} L ${-r * 0.1} ${r * 0.05} L ${r * 0.4} ${r * 0.75} L ${-r * 0.05} ${r * 0.15} L ${r * 0.15} ${-r * 0.05} Z`} fill="#fdfaf2" stroke="#1a1208" strokeWidth={0.9} />
      <text x={0} y={cardH * 0.36} fontSize={cardW * 0.09} fontFamily="Georgia, serif" fontStyle="italic" fill="#1a1208" textAnchor="middle">JOKER</text>
      <text x={0} y={-cardH * 0.32} fontSize={cardW * 0.09} fontFamily="Georgia, serif" fontStyle="italic" fill="#1a1208" textAnchor="middle">WILD</text>
    </g>
  );
};

/* ---------- CardBack: stealie/rose decorative pattern ---------- */
const CardBack: React.FC<{ cardW: number; cardH: number }> = ({ cardW, cardH }) => {
  const halfW = cardW / 2, halfH = cardH / 2;
  return (
    <g>
      <rect x={-halfW} y={-halfH} width={cardW} height={cardH} rx={cardW * 0.07} ry={cardW * 0.07} fill="url(#pc-back)" stroke="#1a1208" strokeWidth={1.6} />
      <rect x={-halfW + cardW * 0.06} y={-halfH + cardW * 0.06} width={cardW - cardW * 0.12} height={cardH - cardW * 0.12} rx={cardW * 0.04} ry={cardW * 0.04} fill="none" stroke="#d4a017" strokeWidth={1.5} opacity={0.9} />
      <rect x={-halfW + cardW * 0.085} y={-halfH + cardW * 0.085} width={cardW - cardW * 0.17} height={cardH - cardW * 0.17} rx={cardW * 0.03} ry={cardW * 0.03} fill="none" stroke="#d4a017" strokeWidth={0.6} opacity={0.55} />

      {/* Center stealie medallion */}
      <circle cx={0} cy={0} r={cardW * 0.22} fill="#fdfaf2" stroke="#d4a017" strokeWidth={1.4} />
      <circle cx={0} cy={0} r={cardW * 0.2} fill="#c01a1a" />
      <path d={`M 0 ${-cardW * 0.2} A ${cardW * 0.2} ${cardW * 0.2} 0 0 0 0 ${cardW * 0.2} Z`} fill="#1a3fc0" />
      <path d={`M ${-cardW * 0.08} ${-cardW * 0.13} L ${cardW * 0.03} ${-cardW * 0.01} L ${-cardW * 0.02} ${cardW * 0.01} L ${cardW * 0.08} ${cardW * 0.14} L ${-cardW * 0.01} ${cardW * 0.03} L ${cardW * 0.03} ${-cardW * 0.01} Z`} fill="#fdfaf2" stroke="#1a1208" strokeWidth={0.6} />

      {/* Corner roses */}
      {[
        [-halfW + cardW * 0.18, -halfH + cardW * 0.18],
        [halfW - cardW * 0.18, -halfH + cardW * 0.18],
        [-halfW + cardW * 0.18, halfH - cardW * 0.18],
        [halfW - cardW * 0.18, halfH - cardW * 0.18],
      ].map((pt, i) => (
        <g key={`rose-${i}`} transform={`translate(${pt[0]}, ${pt[1]})`}>
          <circle r={cardW * 0.05} fill="#d4a017" opacity={0.9} />
          <circle r={cardW * 0.035} fill="#c01a1a" />
          <circle r={cardW * 0.018} fill="#fdfaf2" opacity={0.85} />
        </g>
      ))}

      {/* Diagonal pattern lines */}
      {[-0.6, -0.3, 0, 0.3, 0.6].map((s, i) => (
        <line key={`d-${i}`} x1={-halfW + cardW * 0.1} y1={s * cardH * 0.4} x2={halfW - cardW * 0.1} y2={s * cardH * 0.4 + cardH * 0.05} stroke="#d4a017" strokeWidth={0.4} opacity={0.25} />
      ))}
    </g>
  );
};
