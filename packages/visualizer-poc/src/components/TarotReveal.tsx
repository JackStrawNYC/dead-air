/**
 * TarotReveal — A tarot card that flips to reveal its face. Card border is ornate
 * (decorative rect with inner rect). Face shows a simple symbolic illustration
 * (star, moon, sun, or wheel). Card rotates on Y-axis (scaleX for flip illusion).
 * Gold border, deep purple/indigo face. A new card each cycle. Energy drives flip speed.
 * Cycle: 60s (1800 frames), 14s (420 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1800; // 60s at 30fps
const DURATION = 420; // 14s visible

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Four tarot arcana with simple SVG symbols
interface TarotCard {
  name: string;
  renderSymbol: (cx: number, cy: number, size: number, frame: number) => React.ReactNode;
}

const CARDS: TarotCard[] = [
  {
    name: "The Star",
    renderSymbol: (cx, cy, size, frame) => {
      // 8-pointed star
      const points: string[] = [];
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? size * 0.4 : size * 0.18;
        points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
      }
      const rotation = Math.sin(frame * 0.01) * 5;
      return (
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          <polygon
            points={points.join(" ")}
            fill="rgba(255, 215, 100, 0.7)"
            stroke="rgba(255, 230, 150, 0.9)"
            strokeWidth={1.5}
          />
          {/* Small glow circle at center */}
          <circle cx={cx} cy={cy} r={size * 0.06} fill="rgba(255, 255, 200, 0.9)" />
        </g>
      );
    },
  },
  {
    name: "The Moon",
    renderSymbol: (cx, cy, size, _frame) => {
      // Crescent moon
      const r = size * 0.3;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="rgba(200, 210, 255, 0.6)" />
          <circle cx={cx + r * 0.35} cy={cy - r * 0.15} r={r * 0.8} fill="rgba(30, 15, 60, 1)" />
          {/* Stars around moon */}
          {[
            { x: cx - r * 1.2, y: cy - r * 0.8, s: 3 },
            { x: cx + r * 1.1, y: cy + r * 0.9, s: 2.5 },
            { x: cx - r * 0.5, y: cy + r * 1.3, s: 2 },
          ].map((star, si) => (
            <circle key={si} cx={star.x} cy={star.y} r={star.s} fill="rgba(200, 210, 255, 0.8)" />
          ))}
        </g>
      );
    },
  },
  {
    name: "The Sun",
    renderSymbol: (cx, cy, size, frame) => {
      const r = size * 0.2;
      const rayCount = 12;
      const rotation = frame * 0.3;
      return (
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="rgba(255, 200, 50, 0.8)" />
          {Array.from({ length: rayCount }, (_, i) => {
            const angle = (i / rayCount) * Math.PI * 2;
            const x1 = cx + Math.cos(angle) * (r + 4);
            const y1 = cy + Math.sin(angle) * (r + 4);
            const x2 = cx + Math.cos(angle) * (r + size * 0.2);
            const y2 = cy + Math.sin(angle) * (r + size * 0.2);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255, 200, 50, 0.7)"
                strokeWidth={i % 2 === 0 ? 2.5 : 1.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      );
    },
  },
  {
    name: "Wheel of Fortune",
    renderSymbol: (cx, cy, size, frame) => {
      const r = size * 0.3;
      const rotation = frame * 0.2;
      return (
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255, 215, 100, 0.7)" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke="rgba(255, 215, 100, 0.5)" strokeWidth={1.5} />
          <circle cx={cx} cy={cy} r={r * 0.15} fill="rgba(255, 215, 100, 0.6)" />
          {/* Spokes */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={cx + Math.cos(angle) * r * 0.15}
                y1={cy + Math.sin(angle) * r * 0.15}
                x2={cx + Math.cos(angle) * r}
                y2={cy + Math.sin(angle) * r}
                stroke="rgba(255, 215, 100, 0.5)"
                strokeWidth={1.2}
              />
            );
          })}
          {/* Cardinal symbols (simple marks) */}
          {[0, 1, 2, 3].map((qi) => {
            const angle = (qi / 4) * Math.PI * 2 - Math.PI / 2;
            const px = cx + Math.cos(angle) * (r + 10);
            const py = cy + Math.sin(angle) * (r + 10);
            return <circle key={qi} cx={px} cy={py} r={3} fill="rgba(255, 215, 100, 0.6)" />;
          })}
        </g>
      );
    },
  },
];

interface Props {
  frames: EnhancedFrameData[];
}

export const TarotReveal: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Determine which card to show this cycle (deterministic per cycle index)
  const cycleIndex = Math.floor(frame / CYCLE);
  const rng = mulberry32(cycleIndex * 777 + 1234);
  const cardIdx = Math.floor(rng() * CARDS.length);
  const card = CARDS[cardIdx];

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.9, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.35, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Card dimensions
  const cardW = 140;
  const cardH = 220;
  const cardX = width * 0.15;
  const cardY = height * 0.35;

  // Flip animation: card flips during the first 30% of visibility
  // Energy drives flip speed
  const flipSpeed = interpolate(energy, [0.02, 0.3], [0.8, 2.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flipProgress = interpolate(progress * flipSpeed, [0, 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  // scaleX simulates Y-axis rotation: 1 -> 0 (edge) -> -1 (back = face)
  // We go from back (scaleX=1) through edge (0) to face (scaleX=1 but showing face)
  const flipAngle = flipProgress * Math.PI; // 0 to PI
  const scaleX = Math.cos(flipAngle);
  const showFace = flipProgress > 0.5;

  // Gentle hover (floating card feeling)
  const hoverY = Math.sin(frame * 0.02) * 6;
  const hoverRotation = Math.sin(frame * 0.015) * 1.5;

  // Gold border color
  const goldBase = "rgba(218, 175, 60, 0.8)";
  const goldBright = "rgba(255, 215, 80, 0.9)";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 12px rgba(218, 175, 60, 0.3)) drop-shadow(0 0 30px rgba(100, 50, 180, 0.15))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cardX + cardW / 2}, ${cardY + cardH / 2 + hoverY}) rotate(${hoverRotation}) scale(${Math.abs(scaleX)}, 1) translate(${-cardW / 2}, ${-cardH / 2})`}>
          {!showFace ? (
            // Card back
            <>
              {/* Outer border */}
              <rect
                x={0}
                y={0}
                width={cardW}
                height={cardH}
                rx={6}
                fill="rgba(25, 10, 55, 0.9)"
                stroke={goldBase}
                strokeWidth={3}
              />
              {/* Inner border */}
              <rect
                x={8}
                y={8}
                width={cardW - 16}
                height={cardH - 16}
                rx={3}
                fill="none"
                stroke={goldBase}
                strokeWidth={1.5}
              />
              {/* Decorative cross-hatch pattern on back */}
              {Array.from({ length: 8 }, (_, i) => {
                const step = (cardW - 24) / 8;
                return (
                  <React.Fragment key={`back-${i}`}>
                    <line
                      x1={12 + i * step}
                      y1={12}
                      x2={12 + i * step}
                      y2={cardH - 12}
                      stroke="rgba(100, 60, 180, 0.3)"
                      strokeWidth={0.5}
                    />
                    <line
                      x1={12}
                      y1={12 + i * ((cardH - 24) / 8)}
                      x2={cardW - 12}
                      y2={12 + i * ((cardH - 24) / 8)}
                      stroke="rgba(100, 60, 180, 0.3)"
                      strokeWidth={0.5}
                    />
                  </React.Fragment>
                );
              })}
              {/* Center diamond */}
              <polygon
                points={`${cardW / 2},${cardH * 0.3} ${cardW * 0.65},${cardH / 2} ${cardW / 2},${cardH * 0.7} ${cardW * 0.35},${cardH / 2}`}
                fill="none"
                stroke={goldBright}
                strokeWidth={1.5}
              />
            </>
          ) : (
            // Card face
            <>
              {/* Outer border */}
              <rect
                x={0}
                y={0}
                width={cardW}
                height={cardH}
                rx={6}
                fill="rgba(20, 8, 50, 0.95)"
                stroke={goldBase}
                strokeWidth={3}
              />
              {/* Inner decorative border */}
              <rect
                x={8}
                y={8}
                width={cardW - 16}
                height={cardH - 16}
                rx={3}
                fill="none"
                stroke={goldBase}
                strokeWidth={1}
              />
              {/* Corner flourishes */}
              {[
                { x: 14, y: 14, sx: 1, sy: 1 },
                { x: cardW - 14, y: 14, sx: -1, sy: 1 },
                { x: 14, y: cardH - 14, sx: 1, sy: -1 },
                { x: cardW - 14, y: cardH - 14, sx: -1, sy: -1 },
              ].map((c, ci) => (
                <g key={`flourish-${ci}`} transform={`translate(${c.x}, ${c.y}) scale(${c.sx}, ${c.sy})`}>
                  <path
                    d="M 0 0 Q 8 0 8 8"
                    fill="none"
                    stroke={goldBright}
                    strokeWidth={1}
                  />
                </g>
              ))}

              {/* Card symbol */}
              {card.renderSymbol(cardW / 2, cardH * 0.45, Math.min(cardW, cardH) * 0.4, frame)}

              {/* Card name at bottom */}
              <text
                x={cardW / 2}
                y={cardH - 22}
                textAnchor="middle"
                fill={goldBright}
                fontSize={11}
                fontFamily="serif"
                letterSpacing={1.5}
              >
                {card.name.toUpperCase()}
              </text>

              {/* Roman numeral at top */}
              <text
                x={cardW / 2}
                y={28}
                textAnchor="middle"
                fill={goldBright}
                fontSize={13}
                fontFamily="serif"
              >
                {["XVII", "XVIII", "XIX", "X"][cardIdx]}
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};
