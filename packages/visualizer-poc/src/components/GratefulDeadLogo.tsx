/**
 * GratefulDeadLogo — the iconic "GRATEFUL DEAD" word art.
 * Layer 7, tier A, tags: dead-culture, typography, hero.
 *
 * NOT a neon sign (see NeonDeadSign / WallOfSound). This overlay renders the
 * actual LOGO typography as bespoke SVG paths in the spirit of Roger Dean
 * and 70s rock-poster art — flowing curves, rounded organic shapes, slight
 * asymmetry from letter to letter, the unmistakable thick-stemmed G, the
 * connected DEAD with overlapping crossbars.
 *
 * Render layers (back to front):
 *   1. Drop-shadow ghost of both lines (offset, blurred)
 *   2. Outer outline stroke (contrast color)
 *   3. Main filled letter body with vertical rainbow gradient
 *   4. Top bevel highlight (3D inner-light edge)
 *   5. Per-letter chromatic offset for prismatic shimmer
 *   6. Decorative bezier underline flourish + star punctuation
 *   7. Onset white-flash overlay
 *
 * Audio mapping:
 *   - energy        -> overall opacity + outer glow radius
 *   - beatDecay     -> uniform letter scale pulse
 *   - chromaHue     -> rotates the rainbow gradient through the spectrum
 *   - onsetEnvelope -> bright white pop on attacks
 *   - tempoFactor   -> gentle Y-axis floating oscillation speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Color utilities                                                    */
/* ------------------------------------------------------------------ */

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6) % 6;
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/* ------------------------------------------------------------------ */
/*  Custom Roger Dean-style letter SVG paths                            */
/*                                                                     */
/*  Each letter is drawn in a 60x80 cell. Paths use thick filled       */
/*  shapes — not strokes — so we get true organic-curved letterforms.  */
/*  Cell origin is top-left; baseline is at y=70.                      */
/* ------------------------------------------------------------------ */

const LETTER_PATHS: Record<string, string> = {
  // G — fat curved bowl with the iconic horizontal tongue
  G: "M 50 22 C 50 8 36 4 28 4 C 14 4 6 18 6 38 C 6 58 14 70 28 70 C 40 70 50 64 52 52 L 52 38 L 32 38 L 32 46 L 42 46 L 42 50 C 40 58 34 62 28 62 C 18 62 14 52 14 38 C 14 22 18 12 28 12 C 36 12 42 16 42 22 Z",
  // R — round bowl with kicked-out leg
  R: "M 8 6 L 8 70 L 16 70 L 16 44 L 22 44 L 38 70 L 48 70 L 30 42 C 40 40 46 32 46 22 C 46 12 38 6 28 6 Z M 16 14 L 26 14 C 34 14 38 18 38 24 C 38 32 34 36 26 36 L 16 36 Z",
  A: "M 4 70 L 22 6 L 32 6 L 50 70 L 42 70 L 36 50 L 18 50 L 12 70 Z M 21 42 L 33 42 L 27 18 Z",
  T: "M 4 6 L 50 6 L 50 14 L 31 14 L 31 70 L 23 70 L 23 14 L 4 14 Z",
  E: "M 8 6 L 48 6 L 48 14 L 16 14 L 16 32 L 42 32 L 42 40 L 16 40 L 16 62 L 50 62 L 50 70 L 8 70 Z",
  F: "M 8 6 L 48 6 L 48 14 L 16 14 L 16 34 L 42 34 L 42 42 L 16 42 L 16 70 L 8 70 Z",
  U: "M 8 6 L 16 6 L 16 48 C 16 58 20 62 27 62 C 34 62 38 58 38 48 L 38 6 L 46 6 L 46 50 C 46 64 38 70 27 70 C 16 70 8 64 8 50 Z",
  L: "M 8 6 L 16 6 L 16 62 L 48 62 L 48 70 L 8 70 Z",
  D: "M 8 6 L 26 6 C 42 6 52 18 52 38 C 52 58 42 70 26 70 L 8 70 Z M 16 14 L 16 62 L 25 62 C 36 62 44 54 44 38 C 44 22 36 14 25 14 Z",
};

/* Per-letter horizontal advance widths (kerned for organic flow) */
const ADVANCE: Record<string, number> = {
  G: 56, R: 50, A: 52, T: 50, E: 52, F: 50, U: 50, L: 50, D: 56,
};

/* ------------------------------------------------------------------ */
/*  Letter — single rendered glyph with bevel + outline + gradient     */
/* ------------------------------------------------------------------ */

const Letter: React.FC<{
  char: string;
  x: number;
  y: number;
  scale: number;
  hueOffset: number;
  outlineColor: string;
  highlightOpacity: number;
  flashAlpha: number;
}> = ({ char, x, y, scale, hueOffset, outlineColor, highlightOpacity, flashAlpha }) => {
  const path = LETTER_PATHS[char];
  if (!path) return null;
  const fillId = `gd-fill-${char}-${hueOffset.toFixed(3)}`;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <linearGradient id={fillId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={hslToHex(hueOffset, 0.95, 0.62)} />
          <stop offset="35%" stopColor={hslToHex(hueOffset + 0.05, 0.92, 0.55)} />
          <stop offset="70%" stopColor={hslToHex(hueOffset + 0.10, 0.92, 0.46)} />
          <stop offset="100%" stopColor={hslToHex(hueOffset + 0.14, 0.88, 0.36)} />
        </linearGradient>
      </defs>
      {/* outline stroke */}
      <path d={path} fill="none" stroke={outlineColor}
        strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* main fill */}
      <path d={path} fill={`url(#${fillId})`} />
      {/* top bevel highlight — narrow bright stroke clipped to glyph */}
      <path d={path} fill="none" stroke="#fff8e8"
        strokeWidth="1.0" strokeLinejoin="round" strokeLinecap="round"
        opacity={highlightOpacity * 0.55} />
      {/* white onset flash overlay */}
      {flashAlpha > 0.01 && (
        <path d={path} fill="#ffffff" opacity={flashAlpha} />
      )}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Decorative star — five-point flourish punctuation                  */
/* ------------------------------------------------------------------ */

const Star: React.FC<{ cx: number; cy: number; r: number; color: string }> =
  ({ cx, cy, r, color }) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.42;
      pts.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
    }
    return (
      <polygon points={pts.join(" ")} fill={color} opacity="0.85" />
    );
  };

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const GratefulDeadLogo: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const beatDecay = snap.beatDecay;
  const chromaHue = snap.chromaHue / 360;
  const onsetEnvelope = snap.onsetEnvelope;
  const tempoFactor = useTempoFactor();

  /* --- Audio-derived envelope --- */
  const opacity = interpolate(energy, [0.02, 0.4], [0.18, 0.78], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const beatPulse = 1.0 + beatDecay * 0.06;
  const flashAlpha = Math.min(0.55, onsetEnvelope * 0.55);
  const glowRadius = interpolate(energy, [0.05, 0.5], [3, 14], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  }) + onsetEnvelope * 6;
  const highlightOpacity = 0.55 + onsetEnvelope * 0.4;

  /* --- Floating motion --- */
  const floatY = Math.sin(frame * 0.018 * tempoFactor) * 4;
  const floatRot = Math.sin(frame * 0.012 * tempoFactor + 0.9) * 0.6;

  /* --- Layout --- */
  const VW = 720;
  const VH = 360;
  const TOP_LINE = "GRATEFUL";
  const BOT_LINE = "DEAD";
  const TOP_SCALE = 1.05;
  const BOT_SCALE = 1.85;

  /* Compute total widths (kerned with -3px overlap for organic connect) */
  const KERN = -3;
  const topWidthsRaw = TOP_LINE.split("").reduce(
    (acc, c) => acc + (ADVANCE[c] ?? 50) * TOP_SCALE + KERN,
    0,
  ) - KERN;
  const botWidthsRaw = BOT_LINE.split("").reduce(
    (acc, c) => acc + (ADVANCE[c] ?? 50) * BOT_SCALE + KERN,
    0,
  ) - KERN;

  const topStartX = (VW - topWidthsRaw) / 2;
  const botStartX = (VW - botWidthsRaw) / 2;
  const topY = 30;
  const botY = 130;

  /* Outline color: complement of chroma hue, dark and rich */
  const outlineColor = hslToHex((chromaHue + 0.5) % 1, 0.5, 0.10);
  /* Decoration color follows chroma directly */
  const decorColor = hslToHex(chromaHue, 0.85, 0.55);
  const decorBright = hslToHex((chromaHue + 0.08) % 1, 0.95, 0.70);

  /* Place letters of a line */
  const placeLine = (
    line: string,
    startX: number,
    y: number,
    scaleBase: number,
    hueBase: number,
    keyPrefix: string,
  ) => {
    const elements: React.ReactNode[] = [];
    let cursor = startX;
    line.split("").forEach((ch, i) => {
      const adv = (ADVANCE[ch] ?? 50) * scaleBase;
      // slight per-letter sway and hue offset for prismatic effect
      const wobble = Math.sin(frame * 0.04 + i * 1.7) * 0.02;
      const localScale = scaleBase * (1 + wobble) * beatPulse;
      const hueOffset = (hueBase + i * 0.045) % 1;
      elements.push(
        <Letter
          key={`${keyPrefix}-${i}`}
          char={ch}
          x={cursor}
          y={y}
          scale={localScale}
          hueOffset={hueOffset}
          outlineColor={outlineColor}
          highlightOpacity={highlightOpacity}
          flashAlpha={flashAlpha}
        />,
      );
      cursor += adv + KERN;
    });
    return elements;
  };

  /* Drop-shadow ghost copy of a line */
  const placeShadow = (
    line: string,
    startX: number,
    y: number,
    scaleBase: number,
  ) => {
    const elements: React.ReactNode[] = [];
    let cursor = startX;
    line.split("").forEach((ch, i) => {
      const adv = (ADVANCE[ch] ?? 50) * scaleBase;
      const localScale = scaleBase * beatPulse;
      const path = LETTER_PATHS[ch];
      if (path) {
        elements.push(
          <g key={`sh-${i}`}
            transform={`translate(${cursor + 4} ${y + 6}) scale(${localScale})`}>
            <path d={path} fill="#000" opacity="0.55" />
          </g>,
        );
      }
      cursor += adv + KERN;
    });
    return elements;
  };

  /* Decorative underline flourish — bezier sweep with end curls */
  const underlineY = botY + 165;
  const ulLeft = botStartX - 18;
  const ulRight = botStartX + botWidthsRaw + 18;
  const ulMid = (ulLeft + ulRight) / 2;
  const flourishD =
    `M ${ulLeft} ${underlineY} ` +
    `C ${ulLeft - 14} ${underlineY - 24}, ${ulLeft + 18} ${underlineY + 18}, ${ulMid - 40} ${underlineY + 4} ` +
    `S ${ulMid + 40} ${underlineY - 4}, ${ulRight - 18} ${underlineY + 4} ` +
    `C ${ulRight + 18} ${underlineY + 18}, ${ulRight + 14} ${underlineY - 24}, ${ulRight} ${underlineY}`;

  const svgW = Math.min(width * 0.62, 900);
  const svgH = svgW * (VH / VW);

  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        transform: `translateY(${floatY}px) rotate(${floatRot}deg)`,
        opacity,
        willChange: "transform, opacity",
      }}>
        <svg width={svgW} height={svgH}
          viewBox={`0 0 ${VW} ${VH}`} fill="none">
          <defs>
            <filter id="gdLogoOuterGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={glowRadius} />
            </filter>
            <filter id="gdLogoShadowBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" />
            </filter>
            <radialGradient id="gdLogoHaloGrad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor={decorColor}
                stopOpacity={0.15 + energy * 0.18 + onsetEnvelope * 0.12} />
              <stop offset="55%" stopColor={decorColor}
                stopOpacity={0.05 + energy * 0.06} />
              <stop offset="100%" stopColor={decorColor} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ===== HALO BACKDROP ===== */}
          <ellipse cx={VW / 2} cy={VH * 0.5}
            rx={VW * 0.55} ry={VH * 0.45}
            fill="url(#gdLogoHaloGrad)" />

          {/* ===== DROP SHADOW GHOSTS ===== */}
          <g filter="url(#gdLogoShadowBlur)">
            {placeShadow(TOP_LINE, topStartX, topY, TOP_SCALE)}
            {placeShadow(BOT_LINE, botStartX, botY, BOT_SCALE)}
          </g>

          {/* ===== OUTER COLORED GLOW PASS ===== */}
          <g filter="url(#gdLogoOuterGlow)" opacity={0.55 + onsetEnvelope * 0.3}>
            {placeLine(TOP_LINE, topStartX, topY, TOP_SCALE, chromaHue, "tg")}
            {placeLine(BOT_LINE, botStartX, botY, BOT_SCALE,
              (chromaHue + 0.12) % 1, "bg")}
          </g>

          {/* ===== TOP LINE: "GRATEFUL" ===== */}
          {placeLine(TOP_LINE, topStartX, topY, TOP_SCALE, chromaHue, "t")}

          {/* ===== STAR PUNCTUATION (between lines) ===== */}
          <Star cx={topStartX - 14} cy={topY + 42}
            r={6 + beatDecay * 2.5} color={decorBright} />
          <Star cx={topStartX + topWidthsRaw + 14} cy={topY + 42}
            r={6 + beatDecay * 2.5} color={decorBright} />

          {/* ===== BOTTOM LINE: "DEAD" (larger) ===== */}
          {placeLine(BOT_LINE, botStartX, botY, BOT_SCALE,
            (chromaHue + 0.12) % 1, "b")}

          {/* ===== UNDERLINE FLOURISH ===== */}
          <path d={flourishD} fill="none" stroke={outlineColor}
            strokeWidth="6" strokeLinecap="round" />
          <path d={flourishD} fill="none" stroke={decorBright}
            strokeWidth="3.2" strokeLinecap="round"
            opacity={0.85 + beatDecay * 0.15} />
          <path d={flourishD} fill="none" stroke="#fff8e8"
            strokeWidth="1.2" strokeLinecap="round"
            opacity={0.5 + onsetEnvelope * 0.5} />

          {/* End-curl decorative dots */}
          <circle cx={ulLeft - 14} cy={underlineY - 24}
            r={3.5 + beatDecay * 1.5}
            fill={decorBright} opacity="0.9" />
          <circle cx={ulRight + 14} cy={underlineY - 24}
            r={3.5 + beatDecay * 1.5}
            fill={decorBright} opacity="0.9" />
          <circle cx={ulLeft - 14} cy={underlineY - 24} r="1.2"
            fill="#fff8e8" opacity={0.6 + onsetEnvelope * 0.4} />
          <circle cx={ulRight + 14} cy={underlineY - 24} r="1.2"
            fill="#fff8e8" opacity={0.6 + onsetEnvelope * 0.4} />

          {/* ===== SMALL DECORATIVE STARS ABOVE TOP LINE ===== */}
          <Star cx={VW / 2 - 6} cy={topY - 14}
            r={4 + onsetEnvelope * 2} color={decorBright} />
          <Star cx={VW / 2 - 24} cy={topY - 6}
            r={2.5} color={decorColor} />
          <Star cx={VW / 2 + 12} cy={topY - 8}
            r={2.5} color={decorColor} />

          {/* ===== ONSET WHITE FLASH FULL OVERLAY ===== */}
          {flashAlpha > 0.05 && (
            <rect x="0" y="0" width={VW} height={VH}
              fill="#ffffff" opacity={flashAlpha * 0.12} />
          )}
        </svg>
      </div>
    </div>
  );
};
