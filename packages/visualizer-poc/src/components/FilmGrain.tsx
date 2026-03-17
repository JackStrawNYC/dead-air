/**
 * FilmGrain — era-specific film stock emulation with degradation effects.
 * Uses deterministic seeded random for Remotion compatibility.
 *
 * Film stock profiles:
 *   primal (1965-67)      — Kodak Tri-X 400: heavy grain, high contrast, warm amber
 *   classic (1968-79)     — Kodak Ektachrome: moderate grain, warm tones, natural
 *   hiatus (1975-76)      — Agfa CT18: cool blue cast, fine grain, muted
 *   touch_of_grey (1987-90) — Fuji Velvia: ultra-fine grain, vivid, clean
 *   revival (1991-95)     — Kodak Vision: modern fine grain, neutral
 *
 * Degradation suite:
 *   - Dust/scratches (SVG-based, era-scaled)
 *   - Frame flicker (opacity oscillation)
 *   - Gate weave (sub-pixel position jitter)
 *   - Chrominance noise (separate R/G/B grain channels via color filters)
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useShowContext } from "../data/ShowContext";

/** Film stock profile parameters */
interface FilmStock {
  /** Base grain frequency (higher = finer grain) */
  baseFrequency: number;
  /** Number of fractal octaves (more = more detailed grain) */
  numOctaves: number;
  /** Grain color tint: CSS filter hue-rotate + saturate */
  tintHueRotate: number;
  tintSaturate: number;
  /** Dust/scratch probability per frame (0-1) */
  dustFrequency: number;
  /** Frame flicker amplitude (0 = none, 0.15 = heavy) */
  flickerAmplitude: number;
  /** Gate weave amplitude in pixels */
  weaveAmplitude: number;
  /** Chrominance noise: separate grain for R/G/B channels */
  chrominanceNoise: boolean;
  /** Base blend mode */
  blendMode: string;
}

const FILM_STOCKS: Record<string, FilmStock> = {
  primal: {
    baseFrequency: 0.65,
    numOctaves: 3,
    tintHueRotate: 30,       // warm amber push
    tintSaturate: 0.8,
    dustFrequency: 0.4,      // frequent dust/scratches
    flickerAmplitude: 0.08,  // noticeable flicker
    weaveAmplitude: 1.2,     // visible gate instability
    chrominanceNoise: true,  // color grain separation
    blendMode: "overlay",
  },
  classic: {
    baseFrequency: 0.75,
    numOctaves: 4,
    tintHueRotate: 15,       // gentle warmth
    tintSaturate: 0.9,
    dustFrequency: 0.2,      // occasional dust
    flickerAmplitude: 0.04,  // subtle flicker
    weaveAmplitude: 0.8,     // mild gate weave
    chrominanceNoise: false,
    blendMode: "overlay",
  },
  hiatus: {
    baseFrequency: 0.85,
    numOctaves: 4,
    tintHueRotate: -15,      // cool blue push
    tintSaturate: 0.7,
    dustFrequency: 0.15,
    flickerAmplitude: 0.03,
    weaveAmplitude: 0.6,
    chrominanceNoise: false,
    blendMode: "overlay",
  },
  touch_of_grey: {
    baseFrequency: 0.95,
    numOctaves: 5,
    tintHueRotate: 0,        // neutral
    tintSaturate: 1.0,
    dustFrequency: 0.05,     // rare dust
    flickerAmplitude: 0.01,  // minimal flicker
    weaveAmplitude: 0.3,     // barely perceptible
    chrominanceNoise: false,
    blendMode: "overlay",
  },
  revival: {
    baseFrequency: 0.90,
    numOctaves: 4,
    tintHueRotate: 5,        // slight warmth
    tintSaturate: 0.95,
    dustFrequency: 0.03,     // very rare dust
    flickerAmplitude: 0.005, // near zero
    weaveAmplitude: 0.2,     // minimal
    chrominanceNoise: false,
    blendMode: "overlay",
  },
};

const DEFAULT_STOCK: FilmStock = FILM_STOCKS.classic;

interface Props {
  opacity?: number;
  /** Audio energy (0-1) for energy-aware breathing speed */
  energy?: number;
}

/** Deterministic hash for frame-based randomness */
function frameHash(frame: number, salt: number): number {
  const x = Math.sin(frame * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export const FilmGrain: React.FC<Props> = ({ opacity = 0.10, energy = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const showCtx = useShowContext();
  const era = showCtx?.era ?? "";
  const stock = FILM_STOCKS[era] ?? DEFAULT_STOCK;

  // feTurbulence seed changes every frame for grain variation
  const grainSeed = frame * 31337;

  // Energy-aware breathing: peaks pulse fast (1.5s/45fr), quiet drifts slow (3.5s/105fr)
  const energyFactor = Math.max(0, Math.min(1, (energy - 0.03) / 0.27));
  const breathePeriod = 45 + (1 - energyFactor) * 60;
  const breathe = 0.90 + 0.10 * Math.sin(frame * Math.PI / breathePeriod);

  // Frame flicker: random opacity variation per frame
  const flickerVal = frameHash(frame, 7) * 2 - 1; // -1 to 1
  const flicker = 1 + flickerVal * stock.flickerAmplitude;

  const finalOpacity = opacity * breathe * flicker;

  // Gate weave — sub-pixel offset simulating projector gate instability
  const weaveX = Math.sin(frame * 0.037) * stock.weaveAmplitude;
  const weaveY = Math.cos(frame * 0.029) * stock.weaveAmplitude * 0.75;

  // Dust/scratch determination (deterministic per-frame)
  const showDust = frameHash(frame, 42) < stock.dustFrequency;
  const scratchX = showDust ? frameHash(frame, 99) * 100 : 0; // % position

  // Filter string for color tinting
  const tintFilter = stock.tintHueRotate !== 0 || stock.tintSaturate !== 1
    ? `hue-rotate(${stock.tintHueRotate}deg) saturate(${stock.tintSaturate})`
    : undefined;

  return (
    <>
      {/* Primary grain layer */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: finalOpacity,
          pointerEvents: "none",
          zIndex: 90,
          mixBlendMode: stock.blendMode as React.CSSProperties["mixBlendMode"],
          transform: `translate(${weaveX.toFixed(2)}px, ${weaveY.toFixed(2)}px)`,
          willChange: "transform",
          filter: tintFilter,
        }}
      >
        <filter id={`grain-${frame}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency={stock.baseFrequency.toFixed(2)}
            numOctaves={stock.numOctaves}
            seed={grainSeed}
            stitchTiles="stitch"
          />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter={`url(#grain-${frame})`}
          opacity="0.5"
        />
      </svg>

      {/* Chrominance noise: separate color grain channels (primal era only) */}
      {stock.chrominanceNoise && (
        <svg
          width={width}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            opacity: finalOpacity * 0.3,
            pointerEvents: "none",
            zIndex: 91,
            mixBlendMode: "color",
            filter: `hue-rotate(${(frame * 7 % 360)}deg)`,
          }}
        >
          <filter id={`chroma-grain-${frame}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency={(stock.baseFrequency * 1.5).toFixed(2)}
              numOctaves={2}
              seed={grainSeed + 7777}
              stitchTiles="stitch"
            />
          </filter>
          <rect
            width="100%"
            height="100%"
            filter={`url(#chroma-grain-${frame})`}
            opacity="0.4"
          />
        </svg>
      )}

      {/* Dust and scratches */}
      {showDust && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 92,
          }}
        >
          {/* Vertical scratch line */}
          <div
            style={{
              position: "absolute",
              left: `${scratchX.toFixed(1)}%`,
              top: 0,
              width: "1px",
              height: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              opacity: 0.4 + frameHash(frame, 13) * 0.4,
            }}
          />
          {/* Dust specks: 2-4 small circles */}
          {Array.from({ length: 2 + Math.floor(frameHash(frame, 55) * 3) }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${(frameHash(frame, i * 100 + 200) * 100).toFixed(1)}%`,
                top: `${(frameHash(frame, i * 100 + 300) * 100).toFixed(1)}%`,
                width: `${(1 + frameHash(frame, i * 100 + 400) * 2).toFixed(0)}px`,
                height: `${(1 + frameHash(frame, i * 100 + 400) * 2).toFixed(0)}px`,
                borderRadius: "50%",
                backgroundColor: `rgba(255, 255, 255, ${(0.05 + frameHash(frame, i * 100 + 500) * 0.1).toFixed(2)})`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};
