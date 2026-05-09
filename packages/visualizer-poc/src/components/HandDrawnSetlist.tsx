/**
 * HandDrawnSetlist — A+++ tape-trader's setlist artifact (replaces the
 * dropped Garcia-Quote-Cards concept per user feedback).
 *
 * A small yellow legal-pad fragment with hand-scrawled setlist, segue
 * arrows, strikethroughs, doodles. The actual artifact every Dead taper
 * carried. Less corny than text-quote overlays, more authentic to the
 * culture.
 *
 * Subtle audio reactivity (intentionally minimal — this is paper, not
 * a screen):
 *   beatSnap     → tiny page-corner flutter (taper's hand bumps the pad)
 *   energy       → ink saturation deepens (more pressure)
 *   onset        → occasional pen-tap dot near current line
 *
 * Layout: small corner artifact, ~22% opacity. Tilts ~3-5 degrees.
 * Position: lower-left or upper-right (alternates by show seed).
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";

interface SetlistLine {
  text: string;
  // Special markup:
  //   "->"  appended → segue arrow rendered after text
  //   "*"   prefix   → song crossed out (audible / planned but skipped)
  //   ":"   prefix   → set heading (Set 1, Set 2, Encore)
  doodle?: "stealie" | "rose" | "bolt" | "star";
}

// Default setlist if no per-show data passed — representative Dead show
const DEFAULT_LINES: SetlistLine[] = [
  { text: "Set 1" },
  { text: "Promised Land" },
  { text: "TLEO" },
  { text: "M&MU ->" },
  { text: "Half-Step", doodle: "rose" },
  { text: "Looks Like Rain" },
  { text: "Peggy-O" },
  { text: "Music Never Stopped" },
  { text: "" },
  { text: "Set 2" },
  { text: "Bertha ->" },
  { text: "Good Lovin'" },
  { text: "Loser" },
  { text: "Estimated ->", doodle: "bolt" },
  { text: "Eyes ->" },
  { text: "Samson" },
  { text: "He's Gone ->" },
  { text: "NFA -> Truckin'" },
  { text: "" },
  { text: "E: Terrapin", doodle: "stealie" },
];

interface Props {
  frames: EnhancedFrameData[];
  setlist?: SetlistLine[];
  /** 0..1 highlight position into the setlist; the line at this fraction
   *  glows slightly. Default: derived from showProgress */
  highlightProgress?: number;
}

const InkDoodle: React.FC<{ kind: NonNullable<SetlistLine["doodle"]>; cx: number; cy: number; }> = ({ kind, cx, cy }) => {
  if (kind === "stealie") {
    return (
      <g transform={`translate(${cx} ${cy})`}>
        <circle cx={0} cy={0} r={5} fill="none" stroke="#1a1a3a" strokeWidth={0.6} />
        <path d="M -3 -1 L 1 -1 L -1 1 L 2 1 L -1 3" stroke="#c92020" strokeWidth={0.6} fill="none" />
      </g>
    );
  }
  if (kind === "rose") {
    return (
      <g transform={`translate(${cx} ${cy})`}>
        <circle cx={0} cy={0} r={2.5} fill="#a01530" opacity={0.7} />
        <circle cx={-2} cy={-1} r={2} fill="#a01530" opacity={0.5} />
        <circle cx={2} cy={-1} r={2} fill="#a01530" opacity={0.5} />
        <line x1={0} y1={3} x2={0} y2={6} stroke="#3a5a0a" strokeWidth={0.5} />
      </g>
    );
  }
  if (kind === "bolt") {
    return (
      <path
        d={`M ${cx - 2} ${cy - 4} L ${cx + 1} ${cy - 1} L ${cx - 0.5} ${cy} L ${cx + 2} ${cy + 4} L ${cx - 1} ${cy + 1} L ${cx + 0.5} ${cy} Z`}
        fill="#d0a020"
        stroke="#5a3a00"
        strokeWidth={0.3}
      />
    );
  }
  // star
  return (
    <text x={cx} y={cy + 2} fontFamily="serif" fontSize={6} fill="#1a1a3a" textAnchor="middle">★</text>
  );
};

export const HandDrawnSetlist: React.FC<Props> = ({ frames, setlist, highlightProgress }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);

  const lines = setlist && setlist.length > 0 ? setlist : DEFAULT_LINES;
  const energy = Math.min(1, audio?.energy ?? 0);
  const beatSnap = Math.min(1, audio?.drumOnset ?? 0);
  const onsetVal = Math.min(1, audio?.onsetEnvelope ?? 0);

  // Page tilt — slight clockwise tilt, micro-flutter on beatSnap
  const baseTilt = -4.2;  // degrees
  const flutter = beatSnap * 0.4;
  const tilt = baseTilt + flutter;

  // Ink saturation
  const inkAlpha = 0.78 + energy * 0.18;

  // Layout: small page in lower-left corner
  const PAGE_W = 200;
  const PAGE_H = 290;
  const cx = 130;
  const cy = height - 175;

  // Page-curl drift on beatSnap
  const cornerFlick = beatSnap * 1.5;

  // Highlight which line is "current"
  const hlIdx = highlightProgress != null
    ? Math.floor(highlightProgress * (lines.length - 1))
    : Math.floor((frame / 600) % lines.length);

  // Line spacing
  const lineH = 12.5;
  const startY = -PAGE_H / 2 + 22;

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.24 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="legalPadBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4e8a0" />
            <stop offset="50%" stopColor="#f0e090" />
            <stop offset="100%" stopColor="#e8d878" />
          </linearGradient>
          <filter id="paperRough">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="5" />
            <feColorMatrix values="0 0 0 0 0.06  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0.06 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>

        <g transform={`translate(${cx} ${cy}) rotate(${tilt})`}>
          {/* Drop shadow */}
          <rect
            x={-PAGE_W / 2 + 2}
            y={-PAGE_H / 2 + 3}
            width={PAGE_W}
            height={PAGE_H}
            fill="rgba(0,0,0,0.45)"
            rx={1}
          />

          {/* Yellow legal pad page */}
          <rect
            x={-PAGE_W / 2}
            y={-PAGE_H / 2}
            width={PAGE_W}
            height={PAGE_H}
            fill="url(#legalPadBg)"
            stroke="#a08020"
            strokeWidth={0.6}
          />

          {/* Red top-margin line (legal pad signature) */}
          <line
            x1={-PAGE_W / 2 + 24}
            y1={-PAGE_H / 2}
            x2={-PAGE_W / 2 + 24}
            y2={PAGE_H / 2}
            stroke="#c83030"
            strokeWidth={0.7}
            opacity={0.6}
          />

          {/* Faint horizontal lines */}
          {Array.from({ length: 22 }).map((_, i) => (
            <line
              key={i}
              x1={-PAGE_W / 2 + 6}
              y1={-PAGE_H / 2 + 18 + i * 12.5}
              x2={PAGE_W / 2 - 6}
              y2={-PAGE_H / 2 + 18 + i * 12.5}
              stroke="#7a6a30"
              strokeWidth={0.3}
              opacity={0.45}
            />
          ))}

          {/* Three hole-punch dots (left margin) */}
          {[-PAGE_H / 2 + 30, 0, PAGE_H / 2 - 30].map((py, i) => (
            <circle key={i} cx={-PAGE_W / 2 + 8} cy={py} r={2.5} fill="#c8b888" />
          ))}

          {/* Hand-drawn page header — band name + date */}
          <text
            x={-PAGE_W / 2 + 30}
            y={-PAGE_H / 2 + 12}
            fontFamily="Caveat, Comic Sans MS, cursive"
            fontSize={11}
            fill={`rgba(20,20,60,${inkAlpha})`}
            fontStyle="italic"
            transform="rotate(-1)"
          >
            GD - Englishtown
          </text>
          <text
            x={PAGE_W / 2 - 20}
            y={-PAGE_H / 2 + 12}
            fontFamily="Caveat, Comic Sans MS, cursive"
            fontSize={9}
            fill={`rgba(20,20,60,${inkAlpha * 0.85})`}
            textAnchor="end"
            transform="rotate(1)"
          >
            9/3/77
          </text>

          {/* Setlist lines */}
          {lines.map((line, i) => {
            const y = startY + i * lineH;
            const isHL = i === hlIdx;
            const isHeading = line.text.startsWith("Set ") || line.text.startsWith("E:");
            const isCrossed = line.text.startsWith("*");
            const cleanText = line.text.replace(/^\*/, "");
            const hasArrow = cleanText.endsWith("->");
            const renderText = hasArrow ? cleanText.slice(0, -2).trim() : cleanText;

            // Each line gets a slight handwriting wobble per-character
            const wobbleSeed = (i * 17) % 7;
            const wobbleY = Math.sin(i * 1.3) * 0.6;

            return (
              <g key={i} transform={`translate(0 ${wobbleY})`}>
                {/* Text */}
                {!isHeading && line.text !== "" && (
                  <text
                    x={-PAGE_W / 2 + 32}
                    y={y}
                    fontFamily="Caveat, Comic Sans MS, cursive"
                    fontSize={isHL ? 11 : 10}
                    fill={isHL ? `rgba(120,30,20,${inkAlpha})` : `rgba(20,20,60,${inkAlpha})`}
                    fontWeight={isHL ? "bold" : "normal"}
                    transform={`rotate(${(wobbleSeed % 3) - 1} ${-PAGE_W / 2 + 32} ${y})`}
                  >
                    {renderText}
                  </text>
                )}

                {/* Heading: bigger, underlined */}
                {isHeading && (
                  <g>
                    <text
                      x={-PAGE_W / 2 + 30}
                      y={y}
                      fontFamily="Caveat, Comic Sans MS, cursive"
                      fontSize={12}
                      fill={`rgba(20,20,60,${inkAlpha})`}
                      fontWeight="bold"
                    >
                      {cleanText}
                    </text>
                    <line
                      x1={-PAGE_W / 2 + 30}
                      y1={y + 2}
                      x2={-PAGE_W / 2 + 30 + cleanText.length * 7}
                      y2={y + 2}
                      stroke={`rgba(20,20,60,${inkAlpha})`}
                      strokeWidth={0.8}
                    />
                  </g>
                )}

                {/* Strikethrough (crossed out — song dropped from setlist) */}
                {isCrossed && (
                  <line
                    x1={-PAGE_W / 2 + 28}
                    y1={y - 3}
                    x2={-PAGE_W / 2 + 30 + renderText.length * 6}
                    y2={y - 3}
                    stroke={`rgba(20,20,60,${inkAlpha * 0.8})`}
                    strokeWidth={0.9}
                  />
                )}

                {/* Segue arrow */}
                {hasArrow && (
                  <text
                    x={-PAGE_W / 2 + 30 + renderText.length * 6 + 6}
                    y={y}
                    fontFamily="Caveat, cursive"
                    fontSize={11}
                    fill={`rgba(40,40,80,${inkAlpha})`}
                    fontWeight="bold"
                  >
                    →
                  </text>
                )}

                {/* Doodle next to line */}
                {line.doodle && (
                  <InkDoodle kind={line.doodle} cx={PAGE_W / 2 - 14} cy={y - 3} />
                )}

                {/* Pen-tap dot from current onset */}
                {isHL && onsetVal > 0.4 && (
                  <circle
                    cx={-PAGE_W / 2 + 28}
                    cy={y}
                    r={1.2 + onsetVal * 1.5}
                    fill={`rgba(40,40,80,${onsetVal * 0.6})`}
                  />
                )}
              </g>
            );
          })}

          {/* Margin doodles — coffee ring stain, "Mickey solo??" scrawl */}
          <g transform="translate(70 80) rotate(8)">
            <ellipse cx={0} cy={0} rx={11} ry={8} fill="none" stroke="#5a2a0a" strokeWidth={0.6} opacity={0.3} />
            <ellipse cx={1} cy={1} rx={9} ry={6} fill="none" stroke="#5a2a0a" strokeWidth={0.4} opacity={0.25} />
          </g>

          {/* Bottom margin: "1st time? new bridge?" notes */}
          <text
            x={-PAGE_W / 2 + 30}
            y={PAGE_H / 2 - 12}
            fontFamily="Caveat, cursive"
            fontSize={7}
            fill={`rgba(40,40,80,${inkAlpha * 0.7})`}
            fontStyle="italic"
            transform="rotate(-2)"
          >
            ~ 150,000 ppl ~
          </text>

          {/* Page corner flutter — small triangle that lifts on beat */}
          <path
            d={`M ${PAGE_W / 2 - 8} ${PAGE_H / 2} L ${PAGE_W / 2} ${PAGE_H / 2 - cornerFlick} L ${PAGE_W / 2} ${PAGE_H / 2}`}
            fill="#e8d878"
            stroke="#a08020"
            strokeWidth={0.4}
          />
        </g>
      </svg>
    </div>
  );
};
