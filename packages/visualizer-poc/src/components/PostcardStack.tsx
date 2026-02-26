/**
 * PostcardStack -- 3-5 vintage postcards fanning out from center.
 * Each postcard is a rounded rectangle with a faint image area (gradient fill),
 * stamp (small decorated square in corner), postmark circle, and handwritten-style
 * address lines. Warm sepia/cream tones. Cards shuffle/rotate positions over time.
 * Energy drives shuffle speed. Cycle: 60s, 18s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

/** Seeded PRNG (mulberry32) */
function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 1800; // 60 seconds at 30fps
const DURATION = 540; // 18 seconds visible

const CARD_W = 260;
const CARD_H = 170;

const STAMP_COLORS = ["#8B4513", "#B22222", "#2E8B57", "#4B0082", "#CD853F"];
const IMAGE_GRADIENTS = [
  "linear-gradient(135deg, #D2B48C 0%, #C4A882 50%, #DEB887 100%)",
  "linear-gradient(135deg, #BC8F8F 0%, #D2B48C 50%, #F5DEB3 100%)",
  "linear-gradient(135deg, #8FBC8F 0%, #BDB76B 50%, #D2B48C 100%)",
  "linear-gradient(135deg, #B0C4DE 0%, #D2B48C 50%, #FAEBD7 100%)",
  "linear-gradient(135deg, #DEB887 0%, #DAA520 50%, #F5DEB3 100%)",
];

interface CardConfig {
  baseAngle: number;
  baseOffsetX: number;
  baseOffsetY: number;
  stampColor: string;
  imageGradient: string;
  addressLineCount: number;
  postmarkX: number;
  postmarkY: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const PostcardStack: React.FC<Props> = ({ frames }) => {
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

  const cards = React.useMemo(() => {
    const rng = seeded(77050801);
    const configs: CardConfig[] = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      configs.push({
        baseAngle: (rng() - 0.5) * 40,
        baseOffsetX: (rng() - 0.5) * 120,
        baseOffsetY: (rng() - 0.5) * 60,
        stampColor: STAMP_COLORS[Math.floor(rng() * STAMP_COLORS.length)],
        imageGradient: IMAGE_GRADIENTS[Math.floor(rng() * IMAGE_GRADIENTS.length)],
        addressLineCount: 3 + Math.floor(rng() * 2),
        postmarkX: CARD_W * 0.55 + rng() * 40,
        postmarkY: 15 + rng() * 25,
      });
    }
    return configs;
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const cx = width * 0.5;
  const cy = height * 0.5;

  // Energy drives shuffle speed (rotation oscillation)
  const shuffleSpeed = interpolate(energy, [0.03, 0.3], [0.3, 1.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowSize = interpolate(energy, [0.03, 0.3], [2, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(210, 180, 140, 0.6))`,
          willChange: "opacity",
        }}
      >
        {cards.map((card, ci) => {
          // Each card shuffles at different phase
          const shufflePhase = ci * 1.7 + 0.3;
          const angleOsc = Math.sin(cycleFrame * 0.008 * shuffleSpeed + shufflePhase) * 12;
          const xOsc = Math.sin(cycleFrame * 0.005 * shuffleSpeed + shufflePhase * 2.1) * 30;
          const yOsc = Math.cos(cycleFrame * 0.006 * shuffleSpeed + shufflePhase * 1.3) * 15;

          const cardX = cx + card.baseOffsetX + xOsc - CARD_W / 2;
          const cardY = cy + card.baseOffsetY + yOsc - CARD_H / 2;
          const cardAngle = card.baseAngle + angleOsc;

          const rng2 = seeded(ci * 1234 + 5678);

          return (
            <g
              key={`card-${ci}`}
              transform={`translate(${cardX + CARD_W / 2}, ${cardY + CARD_H / 2}) rotate(${cardAngle}) translate(${-CARD_W / 2}, ${-CARD_H / 2})`}
            >
              {/* Card body */}
              <rect
                x={0}
                y={0}
                width={CARD_W}
                height={CARD_H}
                rx={6}
                ry={6}
                fill="#F5F0E0"
                stroke="#C4A882"
                strokeWidth={1.5}
                opacity={0.9}
              />

              {/* Image area (left half) */}
              <rect
                x={8}
                y={8}
                width={CARD_W * 0.45}
                height={CARD_H - 16}
                rx={3}
                ry={3}
                fill="#D2B48C"
                opacity={0.4}
              />
              {/* Faint landscape lines in image area */}
              <line
                x1={12}
                y1={CARD_H * 0.55}
                x2={CARD_W * 0.43}
                y2={CARD_H * 0.5}
                stroke="#A0876C"
                strokeWidth={0.8}
                opacity={0.3}
              />
              <line
                x1={12}
                y1={CARD_H * 0.65}
                x2={CARD_W * 0.43}
                y2={CARD_H * 0.62}
                stroke="#A0876C"
                strokeWidth={0.6}
                opacity={0.25}
              />

              {/* Dividing line */}
              <line
                x1={CARD_W * 0.5}
                y1={12}
                x2={CARD_W * 0.5}
                y2={CARD_H - 12}
                stroke="#C4A882"
                strokeWidth={0.8}
                strokeDasharray="4 3"
                opacity={0.5}
              />

              {/* Stamp (top right) */}
              <rect
                x={CARD_W - 48}
                y={10}
                width={36}
                height={42}
                rx={2}
                ry={2}
                fill={card.stampColor}
                opacity={0.7}
              />
              {/* Stamp perforated border */}
              <rect
                x={CARD_W - 50}
                y={8}
                width={40}
                height={46}
                rx={2}
                ry={2}
                fill="none"
                stroke="#C4A882"
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0.5}
              />
              {/* Stamp denomination */}
              <text
                x={CARD_W - 30}
                y={38}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#F5F0E0"
                fontSize={9}
                fontFamily="serif"
                fontWeight="bold"
                opacity={0.8}
              >
                5c
              </text>

              {/* Postmark circle */}
              <circle
                cx={card.postmarkX}
                cy={card.postmarkY}
                r={18}
                fill="none"
                stroke="#8B4513"
                strokeWidth={1}
                opacity={0.25}
              />
              <circle
                cx={card.postmarkX}
                cy={card.postmarkY}
                r={13}
                fill="none"
                stroke="#8B4513"
                strokeWidth={0.5}
                opacity={0.2}
              />
              {/* Postmark date text */}
              <text
                x={card.postmarkX}
                y={card.postmarkY}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#8B4513"
                fontSize={6}
                fontFamily="serif"
                opacity={0.3}
              >
                MAY 8
              </text>

              {/* Address lines (right half) */}
              {Array.from({ length: card.addressLineCount }).map((_, li) => {
                const lineY = 70 + li * 18;
                const lineW = CARD_W * 0.35 - rng2() * 30;
                return (
                  <line
                    key={`line-${ci}-${li}`}
                    x1={CARD_W * 0.55}
                    y1={lineY}
                    x2={CARD_W * 0.55 + lineW}
                    y2={lineY + (rng2() - 0.5) * 2}
                    stroke="#8B7355"
                    strokeWidth={0.8}
                    opacity={0.35}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
