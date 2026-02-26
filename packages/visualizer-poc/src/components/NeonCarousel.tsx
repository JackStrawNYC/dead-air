/**
 * NeonCarousel -- Circular arrangement of 8-10 neon light shapes rotating
 * like a carousel viewed from above. Shapes alternate between stars, circles,
 * and diamonds. Each shape is a different neon color (hot pink, electric blue,
 * lime, gold). Trail/afterimage effect as shapes rotate. Rotation speed
 * driven by energy. Bright, fairground aesthetic.
 * Cycle: 35s (1050 frames), 10s (300 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

type ShapeType = "star" | "circle" | "diamond";

interface CarouselShape {
  type: ShapeType;
  color: string;
  glowColor: string;
  size: number;
  angleOffset: number; // radians from 0 position
  pulseFreq: number;
  pulsePhase: number;
}

const NEON_COLORS: { fill: string; glow: string }[] = [
  { fill: "#FF1493", glow: "rgba(255, 20, 147, 0.7)" },   // hot pink
  { fill: "#00BFFF", glow: "rgba(0, 191, 255, 0.7)" },    // electric blue
  { fill: "#7FFF00", glow: "rgba(127, 255, 0, 0.7)" },     // lime
  { fill: "#FFD700", glow: "rgba(255, 215, 0, 0.7)" },     // gold
  { fill: "#FF4500", glow: "rgba(255, 69, 0, 0.7)" },      // orange-red
  { fill: "#DA70D6", glow: "rgba(218, 112, 214, 0.7)" },   // orchid
  { fill: "#00FF7F", glow: "rgba(0, 255, 127, 0.7)" },     // spring green
  { fill: "#FF6347", glow: "rgba(255, 99, 71, 0.7)" },     // tomato
  { fill: "#40E0D0", glow: "rgba(64, 224, 208, 0.7)" },    // turquoise
  { fill: "#FFFF00", glow: "rgba(255, 255, 0, 0.7)" },     // yellow
];

const SHAPE_TYPES: ShapeType[] = ["star", "circle", "diamond"];

function generateShapes(seed: number): CarouselShape[] {
  const rng = seeded(seed);
  const count = 10;
  const shapes: CarouselShape[] = [];

  for (let i = 0; i < count; i++) {
    const colorPair = NEON_COLORS[i % NEON_COLORS.length];
    shapes.push({
      type: SHAPE_TYPES[i % SHAPE_TYPES.length],
      color: colorPair.fill,
      glowColor: colorPair.glow,
      size: 14 + rng() * 8,
      angleOffset: (i / count) * Math.PI * 2,
      pulseFreq: 0.04 + rng() * 0.06,
      pulsePhase: rng() * Math.PI * 2,
    });
  }

  return shapes;
}

function renderShape(type: ShapeType, cx: number, cy: number, size: number, color: string): React.ReactElement {
  switch (type) {
    case "star": {
      // 5-point star
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        points.push(`${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`);
      }
      return <polygon points={points.join(" ")} fill={color} />;
    }
    case "circle":
      return <circle cx={cx} cy={cy} r={size * 0.7} fill="none" stroke={color} strokeWidth={3} />;
    case "diamond": {
      const pts = `${cx},${cy - size} ${cx + size * 0.6},${cy} ${cx},${cy + size} ${cx - size * 0.6},${cy}`;
      return <polygon points={pts} fill={color} />;
    }
  }
}

const CYCLE = 1050; // 35s
const VISIBLE_DURATION = 300; // 10s
const CAROUSEL_RADIUS_FRAC = 0.18; // fraction of min(width, height)
const TRAIL_COUNT = 4; // number of afterimage trails

interface Props {
  frames: EnhancedFrameData[];
}

export const NeonCarousel: React.FC<Props> = ({ frames }) => {
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

  const shapes = React.useMemo(() => generateShapes(35197708), []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 30], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 30, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  // Rotation speed driven by energy
  const rotationSpeed = interpolate(energy, [0.02, 0.35], [0.01, 0.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseAngle = frame * rotationSpeed;
  const carouselRadius = Math.min(width, height) * CAROUSEL_RADIUS_FRAC;
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity * 0.8 }}>
        <defs>
          <filter id="neon-carousel-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {shapes.map((shape, si) => {
          const angle = baseAngle + shape.angleOffset;
          const pulse = 0.7 + Math.sin(frame * shape.pulseFreq + shape.pulsePhase) * 0.3;
          const sx = centerX + Math.cos(angle) * carouselRadius;
          const sy = centerY + Math.sin(angle) * carouselRadius;

          return (
            <g key={si}>
              {/* Afterimage trails */}
              {Array.from({ length: TRAIL_COUNT }, (_, ti) => {
                const trailAngle = angle - (ti + 1) * 0.08;
                const trailX = centerX + Math.cos(trailAngle) * carouselRadius;
                const trailY = centerY + Math.sin(trailAngle) * carouselRadius;
                const trailOpacity = (1 - (ti + 1) / (TRAIL_COUNT + 1)) * 0.3;
                const trailSize = shape.size * pulse * (0.8 - ti * 0.1);

                return (
                  <g key={`trail-${si}-${ti}`} opacity={trailOpacity}>
                    {renderShape(shape.type, trailX, trailY, trailSize, shape.glowColor)}
                  </g>
                );
              })}

              {/* Main shape */}
              <g
                opacity={pulse}
                filter="url(#neon-carousel-glow)"
                style={{ filter: `drop-shadow(0 0 8px ${shape.glowColor}) drop-shadow(0 0 16px ${shape.glowColor})` }}
              >
                {renderShape(shape.type, sx, sy, shape.size * pulse, shape.color)}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
