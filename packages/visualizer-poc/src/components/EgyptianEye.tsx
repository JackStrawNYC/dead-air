/**
 * EgyptianEye -- Eye of Horus with Dead bolt detailing.
 * Egypt '78 culture reference. Classic Egyptian proportions
 * with 13-point lightning bolt as pupil. Richly detailed iris,
 * hieroglyphic border with ankhs, djed pillars, scarab, water pattern.
 * Layer 2 Sacred, Tier B. Slow rotation on beat.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

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

/* ------------------------------------------------------------------ */
/*  SVG sub-component: the full Eye of Horus with hieroglyphic border */
/* ------------------------------------------------------------------ */
const EyeOfHorusSVG: React.FC<{
  size: number;
  primaryColor: string;
  accentColor: string;
  glyphColor: string;
  irisGlow: number;
  pupilDilation: number;
  boltFlash: number;
  irisRotation: number;
  chromaHue: number;
  beatDecay: number;
}> = ({
  size,
  primaryColor,
  accentColor,
  glyphColor,
  irisGlow,
  pupilDilation,
  boltFlash,
  irisRotation,
  chromaHue,
  beatDecay,
}) => {
  /* Iris: concentric rings with rainbow segments */
  const irisInner = 10 + pupilDilation * 2;
  const irisMid = 22;
  const irisOuter = 30;
  const segCount = 16;

  const irisSegments: React.ReactNode[] = [];
  for (let i = 0; i < segCount; i++) {
    const segHue = (chromaHue + i / segCount) % 1;
    const a0 = (i / segCount) * Math.PI * 2;
    const a1 = ((i + 1) / segCount) * Math.PI * 2;
    const outerR = irisOuter;
    const innerR = irisMid;
    const x1 = Math.cos(a0) * outerR;
    const y1 = Math.sin(a0) * outerR;
    const x2 = Math.cos(a1) * outerR;
    const y2 = Math.sin(a1) * outerR;
    const x3 = Math.cos(a1) * innerR;
    const y3 = Math.sin(a1) * innerR;
    const x4 = Math.cos(a0) * innerR;
    const y4 = Math.sin(a0) * innerR;
    irisSegments.push(
      <path
        key={`os${i}`}
        d={`M${x4} ${y4} L${x1} ${y1} A${outerR} ${outerR} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${innerR} ${innerR} 0 0 0 ${x4} ${y4}`}
        fill={hueToHex(segHue, 0.7, 0.5)}
        opacity={0.5 + irisGlow * 0.35}
      />,
    );
  }
  /* Inner iris ring segments */
  for (let i = 0; i < segCount; i++) {
    const segHue = (chromaHue + 0.5 + i / segCount) % 1;
    const a0 = (i / segCount) * Math.PI * 2;
    const a1 = ((i + 1) / segCount) * Math.PI * 2;
    const outerR = irisMid;
    const innerR2 = irisInner;
    const x1 = Math.cos(a0) * outerR;
    const y1 = Math.sin(a0) * outerR;
    const x2 = Math.cos(a1) * outerR;
    const y2 = Math.sin(a1) * outerR;
    const x3 = Math.cos(a1) * innerR2;
    const y3 = Math.sin(a1) * innerR2;
    const x4 = Math.cos(a0) * innerR2;
    const y4 = Math.sin(a0) * innerR2;
    irisSegments.push(
      <path
        key={`is${i}`}
        d={`M${x4} ${y4} L${x1} ${y1} A${outerR} ${outerR} 0 0 1 ${x2} ${y2} L${x3} ${y3} A${innerR2} ${innerR2} 0 0 0 ${x4} ${y4}`}
        fill={hueToHex(segHue, 0.9, 0.45)}
        opacity={0.4 + irisGlow * 0.4}
      />,
    );
  }

  /* Radial iris lines */
  const radialLines: React.ReactNode[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const r1 = irisInner + 1;
    const r2 = irisOuter - 1;
    radialLines.push(
      <line
        key={`rl${i}`}
        x1={Math.cos(angle) * r1}
        y1={Math.sin(angle) * r1}
        x2={Math.cos(angle) * r2}
        y2={Math.sin(angle) * r2}
        stroke={accentColor}
        strokeWidth="0.6"
        opacity={0.25 + irisGlow * 0.2}
      />,
    );
  }

  /* 13-point bolt dots around pupil */
  const boltRing: React.ReactNode[] = [];
  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * Math.PI * 2 - Math.PI / 2;
    const r = irisInner - 2;
    boltRing.push(
      <circle
        key={`br${i}`}
        cx={Math.cos(angle) * r}
        cy={Math.sin(angle) * r}
        r={1 + boltFlash * 0.5}
        fill={accentColor}
        opacity={0.4 + boltFlash * 0.5}
      />,
    );
  }

  /* Pupil radius based on dilation */
  const pupilR = 8 + pupilDilation * 6;

  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 340 255"
      fill="none"
    >
      <defs>
        <radialGradient id="irisGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accentColor} stopOpacity={0.5 * irisGlow} />
          <stop offset="60%" stopColor={primaryColor} stopOpacity={0.2 * irisGlow} />
          <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="boltGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity={0.6 * boltFlash} />
          <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* ================================================================ */}
      {/*  HIEROGLYPHIC BORDER                                             */}
      {/* ================================================================ */}

      {/* Decorative frame lines */}
      <rect
        x="8" y="8" width="324" height="239"
        rx="4" ry="4"
        stroke={glyphColor} strokeWidth="1.5" fill="none" opacity="0.25"
      />
      <rect
        x="14" y="14" width="312" height="227"
        rx="3" ry="3"
        stroke={glyphColor} strokeWidth="0.8" fill="none" opacity="0.18"
      />

      {/* --- Ankh symbols at four corners --- */}
      {[
        { x: 24, y: 24 },
        { x: 316, y: 24 },
        { x: 24, y: 231 },
        { x: 316, y: 231 },
      ].map((pos, i) => (
        <g key={`ankh${i}`} transform={`translate(${pos.x},${pos.y})`} opacity="0.45">
          {/* Loop of ankh */}
          <ellipse cx={0} cy={-5} rx={4} ry={5.5} stroke={glyphColor} strokeWidth="1.4" fill="none" />
          {/* Vertical shaft */}
          <line x1={0} y1={0.5} x2={0} y2={14} stroke={glyphColor} strokeWidth="1.4" />
          {/* Horizontal bar */}
          <line x1={-5} y1={5} x2={5} y2={5} stroke={glyphColor} strokeWidth="1.3" />
          {/* Decorative serifs */}
          <line x1={-2} y1={14} x2={2} y2={14} stroke={glyphColor} strokeWidth="1" />
        </g>
      ))}

      {/* --- Djed pillars on left and right sides --- */}
      {[
        { x: 18, y: 90 },
        { x: 18, y: 150 },
        { x: 322, y: 90 },
        { x: 322, y: 150 },
      ].map((pos, i) => (
        <g key={`djed${i}`} transform={`translate(${pos.x},${pos.y})`} opacity="0.4">
          {/* Central column */}
          <line x1={0} y1={-14} x2={0} y2={14} stroke={glyphColor} strokeWidth="2" />
          {/* Horizontal ribs */}
          {[-10, -5, 0, 5, 10].map((yy, j) => (
            <line key={j} x1={-4.5} y1={yy} x2={4.5} y2={yy} stroke={glyphColor} strokeWidth="1.1" />
          ))}
          {/* Base */}
          <rect x={-5} y={12} width={10} height={3} rx={1} stroke={glyphColor} strokeWidth="0.8" fill="none" />
        </g>
      ))}

      {/* --- Scarab beetle at top center --- */}
      <g transform="translate(170, 18)" opacity="0.5">
        {/* Body */}
        <ellipse cx={0} cy={3} rx={8} ry={5} stroke={glyphColor} strokeWidth="1.2" fill="none" />
        {/* Head */}
        <circle cx={0} cy={-3} r={3.5} stroke={glyphColor} strokeWidth="1" fill="none" />
        {/* Wings spread */}
        <path d="M-8 3 C-14 -2 -18 -4 -22 0 C-20 4 -14 6 -8 5" stroke={glyphColor} strokeWidth="0.9" fill="none" />
        <path d="M8 3 C14 -2 18 -4 22 0 C20 4 14 6 8 5" stroke={glyphColor} strokeWidth="0.9" fill="none" />
        {/* Wing detail lines */}
        <path d="M-10 1 C-14 -1 -17 -2 -19 0" stroke={glyphColor} strokeWidth="0.6" fill="none" />
        <path d="M10 1 C14 -1 17 -2 19 0" stroke={glyphColor} strokeWidth="0.6" fill="none" />
        {/* Legs */}
        <line x1={-5} y1={7} x2={-8} y2={11} stroke={glyphColor} strokeWidth="0.7" />
        <line x1={5} y1={7} x2={8} y2={11} stroke={glyphColor} strokeWidth="0.7" />
        <line x1={-3} y1={8} x2={-5} y2={12} stroke={glyphColor} strokeWidth="0.7" />
        <line x1={3} y1={8} x2={5} y2={12} stroke={glyphColor} strokeWidth="0.7" />
        {/* Sun disc above */}
        <circle cx={0} cy={-8} r={2.5} fill={glyphColor} opacity="0.35" />
      </g>

      {/* --- Mini eye glyphs between border elements (top) --- */}
      {[65, 110, 155, 200, 245].map((gx, i) => (
        <g key={`teye${i}`} transform={`translate(${gx}, 18)`} opacity="0.35">
          <path d="M-6 0 Q0 -4 6 0 Q0 3 -6 0" stroke={glyphColor} strokeWidth="0.9" fill="none" />
          <circle cx={0} cy={0} r={1.5} fill={glyphColor} opacity="0.5" />
        </g>
      ))}

      {/* --- Mini eye glyphs between border elements (bottom) --- */}
      {[65, 110, 155, 200, 245].map((gx, i) => (
        <g key={`beye${i}`} transform={`translate(${gx}, 240)`} opacity="0.3">
          <path d="M-6 0 Q0 -4 6 0 Q0 3 -6 0" stroke={glyphColor} strokeWidth="0.9" fill="none" />
          <circle cx={0} cy={0} r={1.5} fill={glyphColor} opacity="0.5" />
        </g>
      ))}

      {/* --- Wavy water pattern along bottom --- */}
      <g opacity="0.3">
        {[0, 1, 2].map((row) => (
          <path
            key={`wave${row}`}
            d={`M30 ${232 + row * 5} ${Array.from({ length: 14 })
              .map((_, j) => {
                const wx = 30 + j * 20;
                const wy = 232 + row * 5 + (j % 2 === 0 ? -2.5 : 2.5);
                return `Q${wx + 10} ${wy} ${wx + 20} ${232 + row * 5}`;
              })
              .join(" ")}`}
            stroke={glyphColor}
            strokeWidth="0.7"
            fill="none"
          />
        ))}
      </g>

      {/* --- Top border hieroglyphic band (ankhs + djeds between scarab) --- */}
      {[50, 90, 250, 290].map((gx, i) => (
        <g key={`tband${i}`} transform={`translate(${gx}, 10)`} opacity="0.3">
          {i % 2 === 0 ? (
            <>
              {/* Mini ankh */}
              <ellipse cx={0} cy={2} rx={2.5} ry={3.5} stroke={glyphColor} strokeWidth="0.8" fill="none" />
              <line x1={0} y1={5.5} x2={0} y2={12} stroke={glyphColor} strokeWidth="0.8" />
              <line x1={-3} y1={8} x2={3} y2={8} stroke={glyphColor} strokeWidth="0.7" />
            </>
          ) : (
            <>
              {/* Mini djed */}
              <line x1={0} y1={0} x2={0} y2={12} stroke={glyphColor} strokeWidth="1" />
              {[3, 6, 9].map((yy, j) => (
                <line key={j} x1={-3} y1={yy} x2={3} y2={yy} stroke={glyphColor} strokeWidth="0.6" />
              ))}
            </>
          )}
        </g>
      ))}

      {/* ================================================================ */}
      {/*  MAIN EYE OF HORUS                                               */}
      {/* ================================================================ */}

      {/* --- Thick brow line above the eye --- */}
      <path
        d="M55 85 Q110 32 170 42 Q230 32 285 85"
        stroke={primaryColor}
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.75"
      />
      {/* Brow detail line (double stroke) */}
      <path
        d="M62 80 Q115 38 170 47 Q225 38 278 80"
        stroke={primaryColor}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* --- Upper eyelid -- sweeping almond curve --- */}
      <path
        d="M48 108 Q100 50 170 60 Q240 50 292 108"
        stroke={primaryColor}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Upper lid inner detail */}
      <path
        d="M58 106 Q110 58 170 66 Q230 58 282 106"
        stroke={primaryColor}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* --- Lower eyelid --- */}
      <path
        d="M48 108 Q100 140 170 135 Q240 140 292 108"
        stroke={primaryColor}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Lower lid inner detail */}
      <path
        d="M60 109 Q110 133 170 129 Q230 133 280 109"
        stroke={primaryColor}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity="0.3"
      />

      {/* Eye white fill with subtle gradient */}
      <path
        d="M52 108 Q105 55 170 63 Q235 55 288 108 Q235 138 170 132 Q105 138 52 108"
        fill="white"
        opacity="0.06"
      />

      {/* ================================================================ */}
      {/*  IRIS + PUPIL GROUP (centered, rotating)                         */}
      {/* ================================================================ */}
      <g transform={`translate(170, 100) rotate(${irisRotation})`}>
        {/* Iris glow backdrop */}
        <circle cx={0} cy={0} r={irisOuter + 5} fill="url(#irisGlowGrad)" />

        {/* Outer iris ring */}
        <circle
          cx={0} cy={0} r={irisOuter}
          stroke={primaryColor} strokeWidth="2.5" fill="none"
          opacity={0.7 + irisGlow * 0.2}
        />
        {/* Mid iris ring */}
        <circle
          cx={0} cy={0} r={irisMid}
          stroke={accentColor} strokeWidth="1.5" fill="none"
          opacity={0.5 + irisGlow * 0.3}
        />
        {/* Inner iris ring */}
        <circle
          cx={0} cy={0} r={irisInner}
          stroke={accentColor} strokeWidth="1.2" fill="none"
          opacity={0.4 + irisGlow * 0.3}
        />

        {/* Rainbow iris segments (outer + inner rings) */}
        {irisSegments}

        {/* Radial iris detail lines */}
        {radialLines}

        {/* 13-point bolt ring around pupil */}
        {boltRing}

        {/* --- Pupil background --- */}
        <circle cx={0} cy={0} r={pupilR} fill="#080808" />
        <circle cx={0} cy={0} r={pupilR * 0.85} fill="#0a0a0a" />

        {/* --- 13-POINT LIGHTNING BOLT PUPIL (Dead twist!) --- */}
        <g opacity={0.7 + boltFlash * 0.3}>
          {/* Bolt glow */}
          <circle cx={0} cy={0} r={pupilR * 0.9} fill="url(#boltGlowGrad)" />
          {/* Main 13-point bolt shape */}
          <path
            d={(() => {
              const pts: string[] = [];
              for (let i = 0; i < 13; i++) {
                const angle = (i / 13) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 === 0 ? pupilR * 0.8 : pupilR * 0.4;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`);
              }
              return pts.join(" ") + " Z";
            })()}
            fill={accentColor}
            opacity={0.85 + boltFlash * 0.15}
          />
          {/* Inner bolt detail (smaller, brighter) */}
          <path
            d={(() => {
              const pts: string[] = [];
              for (let i = 0; i < 13; i++) {
                const angle = (i / 13) * Math.PI * 2 - Math.PI / 2;
                const r = i % 2 === 0 ? pupilR * 0.5 : pupilR * 0.25;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(2)} ${py.toFixed(2)}`);
              }
              return pts.join(" ") + " Z";
            })()}
            fill="white"
            opacity={0.15 + boltFlash * 0.35}
          />
          {/* Center dot */}
          <circle cx={0} cy={0} r={1.5 + boltFlash} fill="white" opacity={0.4 + boltFlash * 0.4} />
        </g>

        {/* Iris inner glow ring pulsing with beat */}
        <circle
          cx={0} cy={0} r={irisInner + 1}
          stroke={accentColor} strokeWidth={1.5 + irisGlow * 2}
          fill="none"
          opacity={irisGlow * 0.5}
        />
      </g>

      {/* Specular highlights (fixed, outside rotation group) */}
      <ellipse cx={160} cy={92} rx={4} ry={2.8} fill="white" opacity="0.45" />
      <circle cx={180} cy={96} r={2} fill="white" opacity="0.25" />

      {/* ================================================================ */}
      {/*  EYE COSMETIC LINE (Horus tail -- extends left)                  */}
      {/* ================================================================ */}
      <path
        d="M48 108 L22 128 L30 115"
        stroke={primaryColor}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tail extension detail */}
      <path
        d="M30 115 L18 122"
        stroke={primaryColor}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* ================================================================ */}
      {/*  FALCON MARKING (right side of eye)                              */}
      {/* ================================================================ */}
      <path
        d="M200 132 C208 142 220 148 232 145 C244 142 250 132 245 122"
        stroke={primaryColor}
        strokeWidth="2.5"
        fill="none"
        opacity="0.5"
        strokeLinecap="round"
      />
      {/* Falcon detail inner curve */}
      <path
        d="M205 135 C212 143 222 146 230 143"
        stroke={primaryColor}
        strokeWidth="1.2"
        fill="none"
        opacity="0.3"
        strokeLinecap="round"
      />
      {/* Falcon feather strokes */}
      {[0, 1, 2].map((j) => (
        <path
          key={`ff${j}`}
          d={`M${210 + j * 10} ${140 + j * 1.5} C${215 + j * 10} ${148 + j} ${220 + j * 10} ${147 + j} ${222 + j * 10} ${143 + j}`}
          stroke={primaryColor}
          strokeWidth="0.8"
          fill="none"
          opacity="0.25"
        />
      ))}

      {/* ================================================================ */}
      {/*  TEAR/CHEEK MARKING (wadjet -- curved line below with spiral)    */}
      {/* ================================================================ */}
      {/* Main tear drop line */}
      <path
        d="M148 135 C142 152 135 170 138 188"
        stroke={primaryColor}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* Secondary parallel tear line */}
      <path
        d="M152 137 C147 153 141 168 143 183"
        stroke={primaryColor}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* Spiral at bottom of tear */}
      <path
        d="M138 188 C142 196 148 198 150 192 C152 186 146 183 142 186 C138 189 140 194 145 195"
        stroke={primaryColor}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Tear drop fill */}
      <path
        d="M138 188 C140 196 146 198 148 192 C146 188 140 187 138 188"
        fill={primaryColor}
        opacity="0.2"
      />

      {/* Wadjet cross-bar detail */}
      <path
        d="M135 160 L155 155"
        stroke={primaryColor}
        strokeWidth="1.5"
        fill="none"
        opacity="0.3"
        strokeLinecap="round"
      />
      <path
        d="M133 172 L150 168"
        stroke={primaryColor}
        strokeWidth="1"
        fill="none"
        opacity="0.22"
        strokeLinecap="round"
      />

      {/* ================================================================ */}
      {/*  DECORATIVE ELEMENTS: side glyphs along left/right borders       */}
      {/* ================================================================ */}
      {/* Left side hieroglyphs */}
      {[55, 85, 115, 145, 175, 205].map((gy, i) => (
        <g key={`lg${i}`} transform={`translate(20, ${gy})`} opacity="0.28">
          {i % 3 === 0 && (
            <>
              {/* Was scepter */}
              <path d="M-2 -6 L0 -2 L2 -6" stroke={glyphColor} strokeWidth="0.8" fill="none" />
              <line x1={0} y1={-2} x2={0} y2={8} stroke={glyphColor} strokeWidth="0.9" />
              <path d="M-2 8 L2 8" stroke={glyphColor} strokeWidth="0.7" />
            </>
          )}
          {i % 3 === 1 && (
            <>
              {/* Feather of Maat */}
              <ellipse cx={0} cy={0} rx={2} ry={7} stroke={glyphColor} strokeWidth="0.7" fill="none" />
              <line x1={0} y1={-7} x2={0} y2={7} stroke={glyphColor} strokeWidth="0.5" />
            </>
          )}
          {i % 3 === 2 && (
            <>
              {/* Lotus */}
              <path d="M0 6 L0 -2" stroke={glyphColor} strokeWidth="0.8" />
              <path d="M0 -2 C-4 -6 -2 -9 0 -7 C2 -9 4 -6 0 -2" stroke={glyphColor} strokeWidth="0.7" fill="none" />
            </>
          )}
        </g>
      ))}

      {/* Right side hieroglyphs */}
      {[55, 85, 115, 145, 175, 205].map((gy, i) => (
        <g key={`rg${i}`} transform={`translate(320, ${gy})`} opacity="0.28">
          {i % 3 === 0 && (
            <>
              {/* Cobra (uraeus simplified) */}
              <path d="M0 6 C0 -2 -3 -6 0 -8 C3 -6 2 -4 0 -2" stroke={glyphColor} strokeWidth="0.8" fill="none" />
              <circle cx={0} cy={-8} r={1.2} fill={glyphColor} opacity="0.5" />
            </>
          )}
          {i % 3 === 1 && (
            <>
              {/* Reed */}
              <line x1={0} y1={-7} x2={0} y2={7} stroke={glyphColor} strokeWidth="0.6" />
              <path d="M0 -7 C-3 -5 -2 -3 0 -4" stroke={glyphColor} strokeWidth="0.5" fill="none" />
              <path d="M0 -4 C3 -2 2 0 0 -1" stroke={glyphColor} strokeWidth="0.5" fill="none" />
            </>
          )}
          {i % 3 === 2 && (
            <>
              {/* Sun disc */}
              <circle cx={0} cy={0} r={3.5} stroke={glyphColor} strokeWidth="0.7" fill="none" />
              <circle cx={0} cy={0} r={1.5} fill={glyphColor} opacity="0.3" />
              {/* Horns */}
              <path d="M-3.5 1 C-6 -4 -4 -8 0 -6" stroke={glyphColor} strokeWidth="0.6" fill="none" />
              <path d="M3.5 1 C6 -4 4 -8 0 -6" stroke={glyphColor} strokeWidth="0.6" fill="none" />
            </>
          )}
        </g>
      ))}

      {/* ================================================================ */}
      {/*  BOTTOM BORDER: scarabs, eyes, and wave motifs                   */}
      {/* ================================================================ */}
      {[45, 95, 145, 195, 245, 295].map((gx, i) => (
        <g key={`bbg${i}`} transform={`translate(${gx}, 246)`} opacity="0.32">
          {i % 3 === 0 && (
            <>
              {/* Mini scarab */}
              <ellipse cx={0} cy={0} rx={5} ry={3} stroke={glyphColor} strokeWidth="0.9" fill="none" />
              <path d="M-5 0 C-8 -3 -7 -5 -4 -2" stroke={glyphColor} strokeWidth="0.7" fill="none" />
              <path d="M5 0 C8 -3 7 -5 4 -2" stroke={glyphColor} strokeWidth="0.7" fill="none" />
            </>
          )}
          {i % 3 === 1 && (
            <>
              {/* Mini eye */}
              <path d="M-6 0 Q0 -4 6 0 Q0 3.5 -6 0" stroke={glyphColor} strokeWidth="0.9" fill="none" />
              <circle cx={0} cy={0} r={1.8} fill={glyphColor} opacity="0.45" />
            </>
          )}
          {i % 3 === 2 && (
            <>
              {/* Ankh mini */}
              <ellipse cx={0} cy={-2.5} rx={2} ry={3} stroke={glyphColor} strokeWidth="0.7" fill="none" />
              <line x1={0} y1={0.5} x2={0} y2={6} stroke={glyphColor} strokeWidth="0.7" />
              <line x1={-2.5} y1={3} x2={2.5} y2={3} stroke={glyphColor} strokeWidth="0.6" />
            </>
          )}
        </g>
      ))}

      {/* Beat-reactive shimmer ring around the whole eye */}
      <ellipse
        cx={170} cy={100}
        rx={55 + beatDecay * 8} ry={35 + beatDecay * 5}
        stroke={accentColor}
        strokeWidth={0.5 + beatDecay * 2}
        fill="none"
        opacity={beatDecay * 0.3}
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
interface Props {
  frames: EnhancedFrameData[];
}

export const EgyptianEye: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();
  const beatDecay = snap.beatDecay;

  const baseSize = Math.min(width, height) * 0.44;

  /* Breathe scale with slow energy */
  const breathe = interpolate(energy, [0.03, 0.3], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Slow, ponderous rotation -- ancient feel */
  const rotation =
    beatDecay * 3.5 + Math.sin((frame / 200) * tempoFactor) * 1.5;

  /* Overall opacity driven by energy */
  const opacity = interpolate(energy, [0.02, 0.3], [0.2, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Egyptian gold base, shifted by chroma */
  const primaryColor = hueToHex((chromaHue + 0.12) % 1, 0.75, 0.6);
  const accentColor = hueToHex(chromaHue, 0.8, 0.55);
  const glyphColor = hueToHex((chromaHue + 0.08) % 1, 0.5, 0.5);

  /* Iris glow pulsing with beat */
  const irisGlow = interpolate(beatDecay, [0, 1], [0.2, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Pupil dilation driven by energy */
  const pupilDilation = interpolate(energy, [0.0, 0.5], [0.0, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Bolt flash on onset */
  const boltFlash = interpolate(snap.onsetEnvelope, [0, 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Iris rotation -- slow cycle */
  const irisRotation = (frame / 30) * 6 * tempoFactor;

  /* Bass glow for drop-shadow */
  const bassGlow = 0.7 + snap.bass * 0.9;
  const glowRadius =
    interpolate(energy, [0.05, 0.3], [5, 25], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }) * bassGlow;

  const onsetScale = 1 + snap.onsetEnvelope * 0.03;
  const size = baseSize * breathe;

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
          transform: `rotate(${rotation}deg) scale(${breathe * onsetScale})`,
          opacity,
          filter: `drop-shadow(0 0 ${glowRadius}px ${primaryColor}) drop-shadow(0 0 ${glowRadius * 1.5}px ${accentColor})`,
          willChange: "transform, opacity, filter",
        }}
      >
        <EyeOfHorusSVG
          size={size}
          primaryColor={primaryColor}
          accentColor={accentColor}
          glyphColor={glyphColor}
          irisGlow={irisGlow}
          pupilDilation={pupilDilation}
          boltFlash={boltFlash}
          irisRotation={irisRotation}
          chromaHue={chromaHue}
          beatDecay={beatDecay}
        />
      </div>
    </div>
  );
};
