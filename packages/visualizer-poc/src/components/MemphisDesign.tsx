/**
 * MemphisDesign -- Bold 80s Memphis Group aesthetic.
 * Scattered squiggles, dots, triangles, and zigzag lines in clashing bright
 * colors (hot pink, electric blue, acid yellow, mint green). Random placement
 * and rotation. Shapes pop in one by one. Playful, anti-establishment design.
 * Energy drives pop-in rate. Cycle: 40s, 12s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1200;   // 40 seconds at 30fps
const DURATION = 360;  // 12 seconds visible

const MEMPHIS_COLORS = [
  "#FF1493", // hot pink
  "#00BFFF", // electric blue
  "#DFFF00", // acid yellow
  "#3EB489", // mint green
  "#FF6F61", // coral
  "#7B68EE", // medium slate blue
  "#FFD700", // gold
  "#FF4500", // orange-red
];

type ShapeType = "squiggle" | "dot" | "triangle" | "zigzag" | "cross" | "ring";
const SHAPE_TYPES: ShapeType[] = ["squiggle", "dot", "triangle", "zigzag", "cross", "ring"];

interface MemphisShape {
  type: ShapeType;
  x: number;       // 0-1 fraction
  y: number;       // 0-1 fraction
  rotation: number; // degrees
  scale: number;    // 0.5-1.5
  color: string;
  popFrame: number; // frame within DURATION when shape pops in
}

function generateShapes(seed: number): MemphisShape[] {
  const rng = seeded(seed);
  const count = 35;
  const shapes: MemphisShape[] = [];

  for (let i = 0; i < count; i++) {
    const typeIdx = Math.floor(rng() * SHAPE_TYPES.length);
    const colorIdx = Math.floor(rng() * MEMPHIS_COLORS.length);
    shapes.push({
      type: SHAPE_TYPES[typeIdx],
      x: 0.05 + rng() * 0.9,
      y: 0.05 + rng() * 0.9,
      rotation: rng() * 360,
      scale: 0.6 + rng() * 0.9,
      color: MEMPHIS_COLORS[colorIdx],
      popFrame: Math.floor(rng() * DURATION * 0.7), // staggered pop-in over first 70%
    });
  }

  // Sort by popFrame for sequential reveal
  shapes.sort((a, b) => a.popFrame - b.popFrame);
  return shapes;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const MemphisDesign: React.FC<Props> = ({ frames }) => {
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

  const shapes = React.useMemo(() => generateShapes(80588), []);

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.2], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  // Energy accelerates pop-in rate: higher energy = shapes appear sooner
  const popSpeedMult = interpolate(energy, [0.03, 0.3], [0.7, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  function renderShape(shape: MemphisShape, si: number) {
    // Adjusted pop-in time based on energy
    const adjustedPop = shape.popFrame / popSpeedMult;
    if (cycleFrame < adjustedPop) return null;

    // Pop-in scale animation
    const age = cycleFrame - adjustedPop;
    const popScale = interpolate(age, [0, 8], [0, 1.15], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });
    const settleScale = age > 8
      ? interpolate(age, [8, 16], [1.15, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        })
      : popScale;

    const finalScale = settleScale * shape.scale;
    const sx = shape.x * width;
    const sy = shape.y * height;
    const rot = shape.rotation + frame * 0.3;

    const size = 20;

    let shapeEl: React.ReactNode = null;

    switch (shape.type) {
      case "dot":
        shapeEl = (
          <circle cx={0} cy={0} r={size * 0.5} fill={shape.color} />
        );
        break;
      case "triangle":
        shapeEl = (
          <polygon
            points={`0,${-size * 0.6} ${size * 0.55},${size * 0.4} ${-size * 0.55},${size * 0.4}`}
            fill="none"
            stroke={shape.color}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        );
        break;
      case "squiggle": {
        const d = `M ${-size} 0 Q ${-size * 0.5} ${-size * 0.6}, 0 0 Q ${size * 0.5} ${size * 0.6}, ${size} 0`;
        shapeEl = (
          <path
            d={d}
            fill="none"
            stroke={shape.color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
        break;
      }
      case "zigzag": {
        const pts = `${-size},${size * 0.3} ${-size * 0.5},${-size * 0.3} 0,${size * 0.3} ${size * 0.5},${-size * 0.3} ${size},${size * 0.3}`;
        shapeEl = (
          <polyline
            points={pts}
            fill="none"
            stroke={shape.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
        break;
      }
      case "cross":
        shapeEl = (
          <g stroke={shape.color} strokeWidth={3} strokeLinecap="round">
            <line x1={-size * 0.5} y1={0} x2={size * 0.5} y2={0} />
            <line x1={0} y1={-size * 0.5} x2={0} y2={size * 0.5} />
          </g>
        );
        break;
      case "ring":
        shapeEl = (
          <circle cx={0} cy={0} r={size * 0.45} fill="none" stroke={shape.color} strokeWidth={3} />
        );
        break;
    }

    return (
      <g
        key={`shape-${si}`}
        transform={`translate(${sx}, ${sy}) rotate(${rot}) scale(${finalScale})`}
        opacity={0.8}
      >
        {shapeEl}
      </g>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity }}>
        {shapes.map((shape, si) => renderShape(shape, si))}
      </svg>
    </div>
  );
};
