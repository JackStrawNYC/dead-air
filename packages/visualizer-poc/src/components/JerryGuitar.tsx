/**
 * JerryGuitar — Jerry Garcia's Tiger guitar, lovingly detailed.
 * Double-cutaway body with tiger stripe pattern, pickguard, 2 humbuckers
 * with pole pieces, bridge with saddles, tailpiece, knobs, toggle, jack,
 * fretboard with dot markers, 6 vibrating strings, shaped headstock
 * with tuning pegs and nut.
 *
 * Audio: mids drive string vibration amplitude, otherEnergy boosts
 * visibility, tempoFactor scales vibration frequency, beatDecay pulses
 * glow, chromaHue drives color palette. Continuous rendering — rotation
 * engine controls visibility externally.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utility                                                      */
/* ------------------------------------------------------------------ */

/** Map 0-1 hue to an HSL-derived hex string */
function hueToHex(h: number, s = 0.85, l = 0.6): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hueToRgba(h: number, a: number, s = 0.85, l = 0.6): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) {
    r = c;
    g = x;
  } else if (sector === 1) {
    r = x;
    g = c;
  } else if (sector === 2) {
    g = c;
    b = x;
  } else if (sector === 3) {
    g = x;
    b = c;
  } else if (sector === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return `rgba(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)},${a})`;
}

/* ------------------------------------------------------------------ */
/*  Geometry constants                                                 */
/* ------------------------------------------------------------------ */

// String positions — 6 strings, high E (0) to low E (5)
const STRING_COUNT = 6;
const STRING_SPACING = 5.6;
const STRING_BASE_Y = 138;

// Fret marker positions along x-axis (3,5,7,9 = single dot; 12 = double)
const SINGLE_FRET_X = [188, 206, 222, 236];
const DOUBLE_FRET_X = 250;

// Pickup pole piece layout: 2 rows of 6
const POLE_PIECE_SPACING = 4.8;

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const JerryGuitar: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();
  const {
    energy,
    mids: midEnergy,
    chromaHue: chromaHueDeg,
    beatDecay,
    onsetEnvelope,
    otherEnergy,
    bass,
    highs,
  } = snap;

  // Convert 0-360 hue to 0-1
  const chromaHue = chromaHueDeg / 360;

  /* -- Energy gating -- */
  const energyGate = interpolate(energy, [0.05, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const otherBoost = interpolate(otherEnergy ?? 0, [0.05, 0.3], [0, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = energyGate * (0.5 + otherBoost);
  if (opacity < 0.01) return null;

  /* -- Animation parameters -- */
  const breathe = interpolate(energy, [0.05, 0.3], [0.96, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rotation = (frame / 30) * 1.8 * tempoFactor;

  /* -- Color palette from chroma hue -- */
  const bodyColor = hueToHex(chromaHue, 0.7, 0.55);
  const bodyDark = hueToHex(chromaHue, 0.6, 0.35);
  const glowColor = hueToHex(chromaHue + 0.08, 0.9, 0.65);
  const stringColor = hueToHex(chromaHue + 0.15, 0.5, 0.75);
  const stripeColor = hueToRgba(chromaHue + 0.05, 0.12, 0.8, 0.4);
  const accentColor = hueToHex(chromaHue + 0.3, 0.6, 0.5);
  const rimColor = hueToRgba(chromaHue + 0.1, 0.35 + beatDecay * 0.3);
  const fretColor = hueToRgba(chromaHue + 0.2, 0.25, 0.4, 0.65);

  /* -- String vibration -- */
  const vibAmp = interpolate(midEnergy, [0.02, 0.4], [0.3, 3.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* -- Glow from energy + onset flash + beat pulse -- */
  const baseGlow = interpolate(energy, [0.05, 0.3], [3, 12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowRadius = baseGlow + onsetEnvelope * 8 + beatDecay * 6;

  /* -- SVG sizing -- */
  const svgScale = Math.min(width, height) * 0.48;

  /* ================================================================ */
  /*  Build string paths with sinusoidal vibration                     */
  /* ================================================================ */
  const stringPaths: string[] = [];
  for (let si = 0; si < STRING_COUNT; si++) {
    const y = STRING_BASE_Y + si * STRING_SPACING;
    // Each string vibrates at a different frequency — lower strings slower, wider
    const freq = 3.5 + si * 0.9;
    const amp = vibAmp * (0.7 + si * 0.18);
    const points: string[] = [];
    // String runs from bridge (x=86) to nut (x=260)
    for (let x = 86; x <= 260; x += 2) {
      const t = (x - 86) / 174;
      // Vibration envelope: zero at endpoints, max at center
      const env = Math.sin(t * Math.PI);
      const dy =
        Math.sin(frame * 0.28 * freq * tempoFactor + x * 0.06 + si * 1.3) *
        amp *
        env;
      points.push(`${x},${(y + dy).toFixed(2)}`);
    }
    stringPaths.push(points.join(" "));
  }

  /* ================================================================ */
  /*  Tiger stripe paths on body                                       */
  /* ================================================================ */
  const tigerStripes = [
    "M 68,108 Q 80,115 95,112 Q 110,108 120,115",
    "M 58,125 Q 75,132 95,128 Q 115,124 130,130",
    "M 52,142 Q 72,150 92,146 Q 112,142 130,148",
    "M 55,158 Q 75,166 95,162 Q 112,158 128,164",
    "M 62,174 Q 78,180 95,177 Q 110,174 122,179",
    "M 72,188 Q 85,192 100,189 Q 112,186 120,190",
  ];

  /* ================================================================ */
  /*  Pickup pole pieces — 6 per row, 2 rows per humbucker            */
  /* ================================================================ */
  const renderPolePieces = (cx: number, cy: number) => {
    const pieces: React.ReactNode[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        pieces.push(
          <circle
            key={`pp-${cx}-${row}-${col}`}
            cx={cx - 12 + col * POLE_PIECE_SPACING}
            cy={cy - 2 + row * 4.5}
            r="1.2"
            fill={accentColor}
            opacity={0.6 + midEnergy * 0.3}
          />,
        );
      }
    }
    return pieces;
  };

  /* ================================================================ */
  /*  Bridge saddles — 6 individual saddles                            */
  /* ================================================================ */
  const bridgeSaddles: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const sy = STRING_BASE_Y + i * STRING_SPACING;
    bridgeSaddles.push(
      <rect
        key={`saddle-${i}`}
        x={82}
        y={sy - 1.5}
        width={5}
        height={3}
        rx={0.5}
        fill={accentColor}
        opacity={0.5}
      />,
    );
  }

  /* ================================================================ */
  /*  Tuning pegs — 3 per side of headstock                           */
  /* ================================================================ */
  const tuningPegs: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const py = STRING_BASE_Y - 1 + i * STRING_SPACING;
    // Pegs alternate left and right side of headstock
    const pegX = i < 3 ? 283 : 287;
    const pegY = i < 3 ? 133 + i * 8 : 133 + (i - 3) * 8;
    tuningPegs.push(
      <g key={`peg-${i}`}>
        {/* Peg shaft */}
        <rect
          x={pegX - 1}
          y={pegY - 1.5}
          width={8}
          height={3}
          rx={1}
          fill={bodyDark}
          opacity={0.6}
        />
        {/* Peg button */}
        <circle
          cx={pegX + 8}
          cy={pegY}
          r="2.5"
          fill={accentColor}
          opacity={0.55}
          stroke={bodyDark}
          strokeWidth={0.5}
        />
      </g>,
    );
  }

  /* ================================================================ */
  /*  Fret lines along the neck                                        */
  /* ================================================================ */
  const fretLines: React.ReactNode[] = [];
  const fretPositions = [172, 180, 188, 196, 206, 214, 222, 230, 236, 242, 250, 256, 260];
  for (let i = 0; i < fretPositions.length; i++) {
    const fx = fretPositions[i];
    fretLines.push(
      <line
        key={`fret-${i}`}
        x1={fx}
        y1={STRING_BASE_Y - 3}
        x2={fx}
        y2={STRING_BASE_Y + 5 * STRING_SPACING + 3}
        stroke={fretColor}
        strokeWidth={0.8}
      />,
    );
  }

  /* ================================================================ */
  /*  Knobs + toggle + jack                                            */
  /* ================================================================ */
  const knobRadius = 3.5;
  const knobPositions = [
    { cx: 62, cy: 180, label: "vol" },
    { cx: 75, cy: 190, label: "tone1" },
    { cx: 88, cy: 195, label: "tone2" },
  ];

  // Bass-reactive knob shimmer
  const knobShimmer = interpolate(bass, [0.05, 0.3], [0.3, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Highs-reactive pickup glow
  const pickupGlow = interpolate(highs, [0.05, 0.25], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          opacity,
          filter: [
            `drop-shadow(0 0 ${glowRadius}px ${bodyColor})`,
            `drop-shadow(0 0 ${glowRadius * 1.8}px ${glowColor})`,
            `drop-shadow(0 0 ${glowRadius * 0.5}px ${rimColor})`,
          ].join(" "),
          willChange: "transform, opacity, filter",
        }}
      >
        <svg
          width={svgScale}
          height={svgScale * 0.6}
          viewBox="0 0 320 200"
          fill="none"
        >
          {/* ======================================================= */}
          {/*  GUITAR BODY — double-cutaway Tiger shape                */}
          {/* ======================================================= */}
          <path
            d={[
              // Upper horn
              "M 105,95",
              "C 95,92 80,94 68,102",
              // Upper bout left curve
              "C 54,112 46,128 44,142",
              // Lower bout left
              "C 42,160 48,178 62,190",
              // Bottom curve
              "C 76,200 96,204 112,200",
              // Lower bout right
              "C 124,196 134,190 140,182",
              // Waist (cutaway) lower
              "C 146,174 148,164 146,156",
              // Cutaway right inner
              "C 144,146 146,136 150,128",
              // Cutaway right upper
              "C 154,120 150,110 142,104",
              // Upper bout right closing
              "C 134,98 122,94 115,95",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.3}
            stroke={bodyColor}
            strokeWidth={2}
          />

          {/* Rim lighting — beat-reactive */}
          <path
            d={[
              "M 105,95",
              "C 95,92 80,94 68,102",
              "C 54,112 46,128 44,142",
              "C 42,160 48,178 62,190",
              "C 76,200 96,204 112,200",
              "C 124,196 134,190 140,182",
              "C 146,174 148,164 146,156",
              "C 144,146 146,136 150,128",
              "C 154,120 150,110 142,104",
              "C 134,98 122,94 115,95",
              "Z",
            ].join(" ")}
            fill="none"
            stroke={rimColor}
            strokeWidth={1.5 + beatDecay * 1.5}
          />

          {/* ======================================================= */}
          {/*  TIGER STRIPES — the guitar's namesake                   */}
          {/* ======================================================= */}
          {tigerStripes.map((d, i) => (
            <path
              key={`stripe-${i}`}
              d={d}
              stroke={stripeColor}
              strokeWidth={2.5 + Math.sin(frame * 0.015 + i) * 0.5}
              fill="none"
              strokeLinecap="round"
            />
          ))}

          {/* ======================================================= */}
          {/*  PICKGUARD                                               */}
          {/* ======================================================= */}
          <path
            d={[
              "M 68,120",
              "C 60,128 56,145 58,158",
              "C 60,170 68,180 80,184",
              "C 92,188 108,186 118,180",
              "C 126,175 130,166 128,155",
              "L 128,130",
              "C 126,124 118,120 108,118",
              "C 95,116 78,116 68,120",
              "Z",
            ].join(" ")}
            fill={bodyDark}
            opacity={0.15}
          />

          {/* ======================================================= */}
          {/*  PICKUPS — 2 humbuckers with pole pieces                 */}
          {/* ======================================================= */}
          {/* Neck pickup */}
          <rect
            x={96}
            y={130}
            width={30}
            height={10}
            rx={2}
            fill={bodyDark}
            opacity={0.45}
            style={{
              filter:
                pickupGlow > 0.5
                  ? `drop-shadow(0 0 ${pickupGlow}px ${glowColor})`
                  : undefined,
            }}
          />
          <rect
            x={97}
            y={131}
            width={28}
            height={8}
            rx={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.4}
            opacity={0.4}
          />
          {renderPolePieces(111, 135)}

          {/* Bridge pickup */}
          <rect
            x={96}
            y={150}
            width={30}
            height={10}
            rx={2}
            fill={bodyDark}
            opacity={0.45}
            style={{
              filter:
                pickupGlow > 0.5
                  ? `drop-shadow(0 0 ${pickupGlow}px ${glowColor})`
                  : undefined,
            }}
          />
          <rect
            x={97}
            y={151}
            width={28}
            height={8}
            rx={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.4}
            opacity={0.4}
          />
          {renderPolePieces(111, 155)}

          {/* Pickup toggle switch */}
          <line
            x1={132}
            y1={128}
            x2={132}
            y2={140}
            stroke={accentColor}
            strokeWidth={1.2}
            opacity={0.5}
          />
          <circle cx={132} cy={130} r={1.8} fill={accentColor} opacity={0.6} />

          {/* ======================================================= */}
          {/*  BRIDGE with individual saddles + tailpiece              */}
          {/* ======================================================= */}
          {/* Bridge plate */}
          <rect
            x={80}
            y={STRING_BASE_Y - 5}
            width={8}
            height={STRING_SPACING * 5 + 10}
            rx={1}
            fill={bodyDark}
            opacity={0.35}
          />
          {/* Individual saddles */}
          {bridgeSaddles}

          {/* Tailpiece */}
          <rect
            x={70}
            y={STRING_BASE_Y - 2}
            width={6}
            height={STRING_SPACING * 5 + 4}
            rx={2}
            fill={bodyDark}
            opacity={0.3}
          />
          <rect
            x={71}
            y={STRING_BASE_Y - 1}
            width={4}
            height={STRING_SPACING * 5 + 2}
            rx={1.5}
            fill={accentColor}
            opacity={0.15}
          />

          {/* ======================================================= */}
          {/*  KNOBS (Volume + 2 Tone)                                 */}
          {/* ======================================================= */}
          {knobPositions.map((knob) => (
            <g key={knob.label}>
              {/* Knob body */}
              <circle
                cx={knob.cx}
                cy={knob.cy}
                r={knobRadius}
                fill={bodyDark}
                opacity={0.4 + knobShimmer * 0.2}
                stroke={accentColor}
                strokeWidth={0.6}
              />
              {/* Knob indicator line */}
              <line
                x1={knob.cx}
                y1={knob.cy}
                x2={knob.cx}
                y2={knob.cy - knobRadius + 0.8}
                stroke={accentColor}
                strokeWidth={0.6}
                opacity={0.5}
              />
              {/* Knob ring detail */}
              <circle
                cx={knob.cx}
                cy={knob.cy}
                r={knobRadius - 1}
                fill="none"
                stroke={accentColor}
                strokeWidth={0.3}
                opacity={0.3}
              />
            </g>
          ))}

          {/* Output jack */}
          <circle cx={56} cy={170} r={2.5} fill={bodyDark} opacity={0.4} />
          <circle
            cx={56}
            cy={170}
            r={1.5}
            fill="none"
            stroke={accentColor}
            strokeWidth={0.5}
            opacity={0.4}
          />

          {/* ======================================================= */}
          {/*  NECK                                                    */}
          {/* ======================================================= */}
          {/* Neck body */}
          <rect
            x={150}
            y={STRING_BASE_Y - 7}
            width={118}
            height={STRING_SPACING * 5 + 14}
            rx={2}
            fill={bodyColor}
            opacity={0.2}
            stroke={bodyColor}
            strokeWidth={0.8}
          />

          {/* Fretboard (slightly narrower, darker) */}
          <rect
            x={155}
            y={STRING_BASE_Y - 4}
            width={110}
            height={STRING_SPACING * 5 + 8}
            rx={1.5}
            fill={bodyDark}
            opacity={0.18}
          />

          {/* Fret lines */}
          {fretLines}

          {/* Single-dot fret markers (3rd, 5th, 7th, 9th) */}
          {SINGLE_FRET_X.map((fx) => (
            <circle
              key={`fmark-${fx}`}
              cx={fx}
              cy={STRING_BASE_Y + 2.5 * STRING_SPACING}
              r={1.8}
              fill={accentColor}
              opacity={0.35}
            />
          ))}

          {/* Double-dot 12th fret marker */}
          <circle
            cx={DOUBLE_FRET_X}
            cy={STRING_BASE_Y + 1.2 * STRING_SPACING}
            r={1.8}
            fill={accentColor}
            opacity={0.4}
          />
          <circle
            cx={DOUBLE_FRET_X}
            cy={STRING_BASE_Y + 3.8 * STRING_SPACING}
            r={1.8}
            fill={accentColor}
            opacity={0.4}
          />

          {/* Nut (between neck and headstock) */}
          <rect
            x={264}
            y={STRING_BASE_Y - 4}
            width={2.5}
            height={STRING_SPACING * 5 + 8}
            rx={0.5}
            fill={accentColor}
            opacity={0.45}
          />

          {/* ======================================================= */}
          {/*  HEADSTOCK                                               */}
          {/* ======================================================= */}
          <path
            d={[
              "M 267,130",
              "L 275,124",
              "C 280,120 288,118 294,122",
              "L 298,126",
              "C 300,130 300,135 298,140",
              "L 298,152",
              "C 300,157 300,162 298,166",
              "L 294,170",
              "C 288,174 280,172 275,168",
              "L 267,162",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.28}
            stroke={bodyColor}
            strokeWidth={1.2}
          />

          {/* Headstock face detail — lighter center */}
          <path
            d={[
              "M 270,133",
              "L 276,128",
              "C 280,125 286,124 290,127",
              "L 293,130",
              "C 294,134 294,138 293,142",
              "L 293,150",
              "C 294,154 294,158 293,162",
              "L 290,165",
              "C 286,168 280,167 276,164",
              "L 270,159",
              "Z",
            ].join(" ")}
            fill={bodyColor}
            opacity={0.1}
          />

          {/* Tuning pegs — 3 per side */}
          {tuningPegs}

          {/* String trees (2 small guides on headstock) */}
          <rect
            x={272}
            y={137}
            width={3}
            height={1.5}
            rx={0.5}
            fill={accentColor}
            opacity={0.4}
          />
          <rect
            x={272}
            y={153}
            width={3}
            height={1.5}
            rx={0.5}
            fill={accentColor}
            opacity={0.4}
          />

          {/* ======================================================= */}
          {/*  VIBRATING STRINGS                                       */}
          {/* ======================================================= */}
          {stringPaths.map((path, si) => {
            const thickness = 0.6 + si * 0.18;
            const stringGlow = 1.5 + midEnergy * 4;
            const stringOpacity = 0.5 + midEnergy * 0.4;
            return (
              <polyline
                key={`str-${si}`}
                points={path}
                stroke={stringColor}
                strokeWidth={thickness}
                fill="none"
                opacity={stringOpacity}
                style={{
                  filter: `drop-shadow(0 0 ${stringGlow}px ${stringColor})`,
                }}
              />
            );
          })}

          {/* String anchor points at bridge (small circles) */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`anchor-b-${i}`}
              cx={86}
              cy={STRING_BASE_Y + i * STRING_SPACING}
              r={0.8}
              fill={stringColor}
              opacity={0.5}
            />
          ))}

          {/* String anchor points at nut */}
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={`anchor-n-${i}`}
              cx={264}
              cy={STRING_BASE_Y + i * STRING_SPACING}
              r={0.7}
              fill={stringColor}
              opacity={0.4}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};
