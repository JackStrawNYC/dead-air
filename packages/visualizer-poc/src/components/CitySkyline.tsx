/**
 * CitySkyline -- Animated city skyline silhouette across bottom of screen.
 * 15-20 buildings of varying heights and widths. Some buildings have small lit
 * window rectangles that flicker on/off. Neon signs on rooftops glow and pulse
 * with energy. Dark building shapes with warm window lights. Occasional airplane
 * light crossing sky above. Cycle: 65s (1950 frames), 20s (600 frames) visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

interface WindowData {
  relX: number; // relative to building
  relY: number;
  width: number;
  height: number;
  flickerFreq: number;
  flickerPhase: number;
  isLit: boolean; // initial state
}

interface BuildingData {
  x: number;
  width: number;
  height: number;
  windows: WindowData[];
  hasNeonSign: boolean;
  neonColor: string;
  neonFreq: number;
  neonPhase: number;
}

interface AirplaneData {
  spawnFrame: number;
  y: number;
  speed: number;
  goingRight: boolean;
}

function generateBuildings(seed: number, screenWidth: number, screenHeight: number): BuildingData[] {
  const rng = seeded(seed);
  const buildings: BuildingData[] = [];
  const count = 18;

  let currentX = -10;
  for (let i = 0; i < count; i++) {
    const buildingWidth = 40 + rng() * 80;
    const buildingHeight = screenHeight * (0.1 + rng() * 0.32);
    const gap = rng() * 8;

    // Windows
    const windows: WindowData[] = [];
    const cols = Math.floor(buildingWidth / 18);
    const rows = Math.floor(buildingHeight / 22);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng() > 0.6) {
          windows.push({
            relX: 6 + c * (buildingWidth - 12) / Math.max(cols, 1),
            relY: 8 + r * (buildingHeight - 16) / Math.max(rows, 1),
            width: 6 + rng() * 4,
            height: 8 + rng() * 4,
            flickerFreq: 0.01 + rng() * 0.05,
            flickerPhase: rng() * Math.PI * 2,
            isLit: rng() > 0.3,
          });
        }
      }
    }

    const neonColors = [
      "rgba(255, 50, 80, 0.9)",
      "rgba(50, 200, 255, 0.9)",
      "rgba(255, 200, 50, 0.9)",
      "rgba(200, 50, 255, 0.9)",
      "rgba(50, 255, 150, 0.9)",
    ];

    buildings.push({
      x: currentX,
      width: buildingWidth,
      height: buildingHeight,
      windows,
      hasNeonSign: rng() > 0.65,
      neonColor: neonColors[Math.floor(rng() * neonColors.length)],
      neonFreq: 0.04 + rng() * 0.06,
      neonPhase: rng() * Math.PI * 2,
    });

    currentX += buildingWidth + gap;
  }

  return buildings;
}

function generateAirplanes(seed: number): AirplaneData[] {
  const rng = seeded(seed);
  const planes: AirplaneData[] = [];
  // Pre-schedule planes over 108000 frames (1 hour)
  for (let f = 0; f < 108000; f += 900 + Math.floor(rng() * 600)) {
    planes.push({
      spawnFrame: f,
      y: 0.05 + rng() * 0.25,
      speed: 0.8 + rng() * 1.2,
      goingRight: rng() > 0.5,
    });
  }
  return planes;
}

const CYCLE = 1950; // 65s
const VISIBLE_DURATION = 600; // 20s

interface Props {
  frames: EnhancedFrameData[];
}

export const CitySkyline: React.FC<Props> = ({ frames }) => {
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

  const buildings = React.useMemo(() => generateBuildings(65197708, width, height), [width, height]);
  const airplanes = React.useMemo(() => generateAirplanes(65317708), []);

  const cycleFrame = frame % CYCLE;
  const isVisible = cycleFrame < VISIBLE_DURATION;

  const fadeIn = isVisible
    ? interpolate(cycleFrame, [0, 60], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      })
    : 0;
  const fadeOut = isVisible
    ? interpolate(cycleFrame, [VISIBLE_DURATION - 60, VISIBLE_DURATION], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const masterOpacity = Math.min(fadeIn, fadeOut);

  if (!isVisible || masterOpacity < 0.01) return null;

  const neonPulse = interpolate(energy, [0.05, 0.3], [0.4, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Find active airplane
  const activePlane = airplanes.find((p) => {
    const elapsed = frame - p.spawnFrame;
    return elapsed >= 0 && elapsed < 600; // 20s crossing
  });

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity }}>
        <defs>
          <filter id="city-neon-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Airplane light */}
        {activePlane && (() => {
          const elapsed = frame - activePlane.spawnFrame;
          const progress = elapsed / 600;
          const planeX = activePlane.goingRight
            ? interpolate(progress, [0, 1], [-20, width + 20], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : interpolate(progress, [0, 1], [width + 20, -20], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
          const planeY = activePlane.y * height;
          // Blinking light
          const blink = Math.sin(frame * 0.15) > 0.3 ? 1 : 0.1;

          return (
            <g>
              <circle cx={planeX} cy={planeY} r={2} fill={`rgba(255, 50, 50, ${blink})`} />
              <circle cx={planeX} cy={planeY} r={6} fill={`rgba(255, 50, 50, ${blink * 0.3})`}
                style={{ filter: "blur(3px)" }} />
              {/* White nav light */}
              <circle cx={planeX + (activePlane.goingRight ? -8 : 8)} cy={planeY} r={1.5}
                fill={`rgba(255, 255, 255, ${0.5 + blink * 0.3})`} />
            </g>
          );
        })()}

        {/* Buildings */}
        {buildings.map((building, bi) => {
          const bx = building.x;
          const by = height - building.height;

          return (
            <g key={bi}>
              {/* Building body */}
              <rect
                x={bx}
                y={by}
                width={building.width}
                height={building.height + 5}
                fill="rgba(8, 8, 15, 0.92)"
              />

              {/* Windows */}
              {building.windows.map((win, wi) => {
                const flicker = Math.sin(frame * win.flickerFreq + win.flickerPhase);
                const isOn = win.isLit ? flicker > -0.7 : flicker > 0.85;
                if (!isOn) return null;

                const warmth = 0.7 + flicker * 0.15;

                return (
                  <rect
                    key={wi}
                    x={bx + win.relX}
                    y={by + win.relY}
                    width={win.width}
                    height={win.height}
                    fill={`rgba(255, 220, 140, ${warmth})`}
                    style={{ filter: "blur(0.5px)" }}
                  />
                );
              })}

              {/* Neon sign on rooftop */}
              {building.hasNeonSign && (
                <g>
                  <rect
                    x={bx + building.width * 0.2}
                    y={by - 12}
                    width={building.width * 0.6}
                    height={10}
                    rx={2}
                    fill="none"
                    stroke={building.neonColor}
                    strokeWidth={1.5}
                    opacity={
                      neonPulse * (0.5 + Math.sin(frame * building.neonFreq + building.neonPhase) * 0.5)
                    }
                    filter="url(#city-neon-glow)"
                  />
                  {/* Inner glow line */}
                  <line
                    x1={bx + building.width * 0.3}
                    y1={by - 7}
                    x2={bx + building.width * 0.7}
                    y2={by - 7}
                    stroke={building.neonColor}
                    strokeWidth={2}
                    opacity={
                      neonPulse * (0.6 + Math.sin(frame * building.neonFreq + building.neonPhase + 0.5) * 0.4)
                    }
                    strokeLinecap="round"
                    filter="url(#city-neon-glow)"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
