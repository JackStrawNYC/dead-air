/**
 * Ikat — Blurred-edge geometric textile pattern.
 * Vertical stripes with intentionally fuzzy/feathered edges (characteristic
 * of ikat weaving). Diamond/chevron patterns formed by color shifts.
 * Colors: warm reds, oranges, creams with indigo accents.
 * Pattern slowly shifts/breathes. Energy drives blur amount and pattern scale.
 * Cycle: 70s, 20s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE = 2100; // 70s at 30fps
const DURATION = 600; // 20s visible
const STRIPE_COUNT = 16;
const DIAMOND_ROWS = 8;

const IKAT_COLORS = [
  "#C73032", // warm red
  "#E87D2A", // orange
  "#F5E6C8", // cream
  "#1B1464", // indigo
  "#D4483B", // terracotta red
  "#F0C050", // saffron
  "#EDDCB1", // light cream
  "#2D1B69", // dark indigo
  "#A0522D", // sienna
  "#E8C87A", // wheat
];

interface StripeData {
  colorIdx: number;
  widthRatio: number;
  blurSeed: number;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const Ikat: React.FC<Props> = ({ frames }) => {
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

  const stripes = React.useMemo(() => {
    const rng = seeded(70_020_004);
    return Array.from({ length: STRIPE_COUNT }, (): StripeData => ({
      colorIdx: Math.floor(rng() * IKAT_COLORS.length),
      widthRatio: 0.6 + rng() * 0.8,
      blurSeed: rng() * 1000,
    }));
  }, []);

  const diamondSeeds = React.useMemo(() => {
    const rng = seeded(70_020_005);
    return Array.from({ length: DIAMOND_ROWS * STRIPE_COUNT }, () => rng());
  }, []);

  // Cycle gating
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.12, 0.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (masterOpacity < 0.01) return null;

  // Ikat blur amount: more energy = more blur (characteristic of the technique)
  const blurAmount = interpolate(energy, [0.02, 0.3], [1.5, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pattern breathing
  const breathe = 1 + energy * 0.05 * Math.sin(frame * 0.03);
  const patternScale = breathe;

  // Stripe width calculation
  const totalWidthRatio = stripes.reduce((sum, s) => sum + s.widthRatio, 0);
  const stripeUnit = width / totalWidthRatio;

  // Vertical shift for animation
  const vertShift = frame * 0.3 * (0.5 + energy);

  // Build stripe elements
  const stripeElements: React.ReactNode[] = [];
  let xPos = 0;

  for (let si = 0; si < STRIPE_COUNT; si++) {
    const stripe = stripes[si];
    const stripeWidth = stripe.widthRatio * stripeUnit * patternScale;
    const color = IKAT_COLORS[stripe.colorIdx];

    // Main stripe
    stripeElements.push(
      <rect
        key={`stripe-${si}`}
        x={xPos - stripeWidth * 0.05}
        y={-20}
        width={stripeWidth * 1.1}
        height={height + 40}
        fill={color}
        opacity={0.6}
      />
    );

    // Diamond/chevron overlay within stripe
    const diamondHeight = (height / DIAMOND_ROWS) * patternScale;
    for (let di = 0; di < DIAMOND_ROWS; di++) {
      const seedVal = diamondSeeds[di * STRIPE_COUNT + si];
      if (seedVal < 0.4) continue; // not all cells get diamonds

      const dy = di * diamondHeight + (vertShift % diamondHeight);
      const cx = xPos + stripeWidth / 2;
      const cy = dy;
      const dw = stripeWidth * 0.35;
      const dh = diamondHeight * 0.4;

      // Diamond accent color
      const accentIdx = (stripe.colorIdx + 3) % IKAT_COLORS.length;
      const accentColor = IKAT_COLORS[accentIdx];

      // Diamond path
      stripeElements.push(
        <path
          key={`diamond-${si}-${di}`}
          d={`M ${cx} ${cy - dh} L ${cx + dw} ${cy} L ${cx} ${cy + dh} L ${cx - dw} ${cy} Z`}
          fill={accentColor}
          opacity={0.5}
        />
      );

      // Chevron lines above/below diamond
      if (seedVal > 0.7) {
        const chevH = dh * 0.3;
        stripeElements.push(
          <path
            key={`chevron-${si}-${di}`}
            d={`M ${cx - dw * 0.8} ${cy - dh - chevH} L ${cx} ${cy - dh} L ${cx + dw * 0.8} ${cy - dh - chevH}`}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.5}
            opacity={0.4}
          />
        );
      }
    }

    xPos += stripeWidth;
  }

  // Fuzzy edge lines between stripes (the hallmark of ikat)
  const edgeLines: React.ReactNode[] = [];
  let edgeX = 0;
  for (let si = 0; si < STRIPE_COUNT; si++) {
    const stripeWidth = stripes[si].widthRatio * stripeUnit * patternScale;
    edgeX += stripeWidth;

    // Wavy edge line
    let edgePath = "";
    const segments = 20;
    for (let s = 0; s <= segments; s++) {
      const y = (s / segments) * (height + 40) - 20;
      const wobble = Math.sin(y * 0.02 + frame * 0.01 + si * 2) * (3 + energy * 5);
      if (s === 0) {
        edgePath = `M ${edgeX + wobble} ${y}`;
      } else {
        edgePath += ` L ${edgeX + wobble} ${y}`;
      }
    }

    edgeLines.push(
      <path
        key={`edge-${si}`}
        d={edgePath}
        fill="none"
        stroke="rgba(27, 20, 100, 0.3)"
        strokeWidth={blurAmount * 0.8}
        opacity={0.5}
      />
    );
  }

  const filterId = "ikat-blur";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          filter: `drop-shadow(0 0 4px rgba(199, 48, 50, 0.2))`,
        }}
      >
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={`${blurAmount} 0.5`} />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`}>
          {stripeElements}
        </g>
        {edgeLines}
      </svg>
    </div>
  );
};
