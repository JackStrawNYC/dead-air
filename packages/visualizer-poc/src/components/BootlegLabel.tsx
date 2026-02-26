/**
 * BootlegLabel -- taper culture bootleg cassette J-card label.
 * Styled like a handwritten cassette label with greenish thermal paper tint.
 * Always visible at low opacity (0.3-0.4). Bottom-right corner.
 * Slight jitter/noise for authentic handheld feel.
 * Deterministic via mulberry32 PRNG.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";

// -- Label text lines (fallback when no context) ---------------------------

interface LabelLine {
  text: string;
  style: "title" | "venue" | "date" | "spacer" | "chain" | "taper";
}

const DEFAULT_LABEL_LINES: LabelLine[] = [
  { text: "GRATEFUL DEAD", style: "title" },
  { text: "Cornell University - Barton Hall", style: "venue" },
  { text: "Ithaca, NY  5/8/77", style: "date" },
  { text: "", style: "spacer" },
  { text: "SBD > Master Reel > Cassette", style: "chain" },
  { text: "Betty Boards", style: "taper" },
];

function buildLabelLines(ctx: ReturnType<typeof useShowContext>): LabelLine[] {
  if (!ctx) return DEFAULT_LABEL_LINES;

  // Split taper info into chain + taper lines if it contains " — "
  const taperParts = ctx.taperInfo ? ctx.taperInfo.split(" — ") : [];
  const chainLine = taperParts[0] ?? "";
  const taperLine = taperParts[1] ?? taperParts[0] ?? "";

  return [
    { text: ctx.bandName.toUpperCase(), style: "title" },
    { text: ctx.venue, style: "venue" },
    { text: `${ctx.venueLocation}  ${ctx.dateShort}`, style: "date" },
    { text: "", style: "spacer" },
    ...(chainLine ? [{ text: chainLine, style: "chain" as const }] : []),
    ...(taperLine && taperLine !== chainLine
      ? [{ text: taperLine, style: "taper" as const }]
      : []),
  ];
}

// -- Component --------------------------------------------------------------

interface Props {
  frames: EnhancedFrameData[];
}

export const BootlegLabel: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ctx = useShowContext();
  const labelLines = useMemo(() => buildLabelLines(ctx), [ctx]);

  // Rolling energy (75-frame window each side)
  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let energySum = 0;
  let energyCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    energySum += frames[i].rms;
    energyCount++;
  }
  const energy = energyCount > 0 ? energySum / energyCount : 0;

  // Base opacity: 0.3 - 0.4, slightly reactive to energy
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade in at start of composition
  const fadeInOpacity = interpolate(frame, [0, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Fade out near very end
  const fadeOutOpacity = interpolate(
    frame,
    [durationInFrames - 90, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.in(Easing.cubic),
    },
  );

  const opacity = baseOpacity * fadeInOpacity * fadeOutOpacity;

  if (opacity < 0.01) return null;

  // Per-frame jitter for authentic handheld feel (1px offset)
  const rng = seeded(frame * 31 + 508);
  const jitterX = (rng() - 0.5) * 1.6;
  const jitterY = (rng() - 0.5) * 1.6;

  // Very subtle scale pulse tied to low-frequency energy
  const lowEnergy = frames[idx]?.sub ?? 0;
  const scalePulse = 1 + lowEnergy * 0.008;

  // Tape counter (like a real deck counter)
  const counterValue = Math.floor(frame / 30);
  const counterMins = Math.floor(counterValue / 60);
  const counterSecs = counterValue % 60;
  const counterStr = `${String(counterMins).padStart(2, "0")}:${String(counterSecs).padStart(2, "0")}`;

  // Greenish thermal paper color
  const textColor = "rgba(160, 195, 150, 0.9)";
  const dimColor = "rgba(140, 175, 130, 0.6)";
  const borderColor = "rgba(140, 175, 130, 0.35)";

  const renderLine = (
    line: { text: string; style: string },
    lineIdx: number,
  ) => {
    if (line.style === "spacer") {
      return <div key={lineIdx} style={{ height: 6 }} />;
    }

    // Per-line micro jitter
    const lineRng = seeded(frame * 17 + lineIdx * 113);
    const lineJitterX = (lineRng() - 0.5) * 0.8;

    let fontSize = 11;
    let fontWeight: number | string = 400;
    let letterSpacing = 1;
    let color = textColor;

    switch (line.style) {
      case "title":
        fontSize = 14;
        fontWeight = 700;
        letterSpacing = 3;
        break;
      case "venue":
        fontSize = 11;
        fontWeight = 400;
        letterSpacing = 0.5;
        break;
      case "date":
        fontSize = 11;
        fontWeight = 400;
        letterSpacing = 1;
        break;
      case "chain":
        fontSize = 9;
        fontWeight = 400;
        letterSpacing = 0.3;
        color = dimColor;
        break;
      case "taper":
        fontSize = 10;
        fontWeight = 400;
        letterSpacing = 0.5;
        color = dimColor;
        break;
    }

    return (
      <div
        key={lineIdx}
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize,
          fontWeight,
          fontStyle: line.style === "taper" ? "italic" : "normal",
          letterSpacing,
          color,
          lineHeight: 1.5,
          transform: `translateX(${lineJitterX}px)`,
          whiteSpace: "nowrap",
        }}
      >
        {line.text}
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: 22,
          right: 22,
          opacity,
          transform: `translate(${jitterX}px, ${jitterY}px) scale(${scalePulse})`,
          willChange: "transform, opacity",
        }}
      >
        {/* Cassette label body */}
        <div
          style={{
            border: `1px solid ${borderColor}`,
            borderRadius: 3,
            padding: "10px 16px 8px 16px",
            background: "rgba(15, 20, 12, 0.55)",
            minWidth: 210,
          }}
        >
          {/* Label lines */}
          {labelLines.map((line, i) => renderLine(line, i))}

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: 1,
              background: borderColor,
              marginTop: 6,
              marginBottom: 4,
            }}
          />

          {/* Counter row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 9,
              color: dimColor,
              letterSpacing: 1,
            }}
          >
            <span>{counterStr}</span>
            <span style={{ opacity: 0.6 }}>SIDE A</span>
          </div>
        </div>
      </div>
    </div>
  );
};
