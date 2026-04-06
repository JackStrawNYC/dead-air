/**
 * BootlegLabel -- taper culture bootleg cassette J-card insert.
 *
 * A+++ quality: full J-card structure with fold lines, aged thermal paper,
 * paper grain texture, hand-lettered typography with per-letter wobble,
 * hand-drawn stealie sketch, peace sign doodle, "NOT FOR SALE" stamp,
 * cassette spine text, running tape counter, and audio-reactive accents.
 *
 * Always visible at low opacity (0.3-0.42). Bottom-right corner.
 * Deterministic via mulberry32 PRNG seeded per frame + show.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext, type ShowContextValue } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── Layout constants ─────────────────────────────────────────────────────────
const CARD_W = 290;
const CARD_H = 370;
const CARD_RADIUS = 4;
const SPINE_W = 18;
const FOLD_Y_TOP = 95;
const FOLD_Y_BOTTOM = 275;
const PAD_X = 16;
const PAD_Y = 12;

// ─── Clamp helper ────────────────────────────────────────────────────────────
const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Generation chain vocabulary ──────────────────────────────────────────────
const GEN_CHAINS = [
  "Master > 1st",
  "Master > 1st > 2nd",
  "Master > 1st > 2nd > 3rd",
  "AUD > 1st",
  "SBD > 1st > 2nd",
];

// ─── Taper name vocabulary (used when no ctx.taperInfo) ──────────────────────
const TAPER_NAMES = [
  "Jerry Moore",
  "Charlie Miller",
  "Dan Healy",
  "Betty Cantor-Jackson",
  "Rob Eaton",
  "Dick Latvala",
  "Dave Lemieux",
];

// ─── Tape brands ──────────────────────────────────────────────────────────────
const TAPE_BRANDS = [
  "MAXELL UDXL-II C90",
  "TDK SA-X C90",
  "DENON HD8 C90",
  "SONY UX-PRO C90",
  "MAXELL XL-IIS C90",
  "TDK MA-XG C90",
];

// ─── Build label data from context ────────────────────────────────────────────

interface LabelData {
  bandName: string;
  venue: string;
  location: string;
  date: string;
  dateShort: string;
  taperName: string;
  genChain: string;
  tapeBrand: string;
  songs: string[];
}

function buildLabelData(ctx: ShowContextValue | null, showRng: () => number): LabelData {
  const pickFrom = <T,>(arr: T[]): T => arr[Math.floor(showRng() * arr.length)];

  if (!ctx) {
    return {
      bandName: "GRATEFUL DEAD",
      venue: "Live Recording",
      location: "Unknown Venue",
      date: "Audience Tape",
      dateShort: "??/??/??",
      taperName: pickFrom(TAPER_NAMES),
      genChain: pickFrom(GEN_CHAINS),
      tapeBrand: pickFrom(TAPE_BRANDS),
      songs: ["Bertha", "Truckin'", "Sugar Magnolia"],
    };
  }

  // Extract taper name from taperInfo if available
  const taperParts = ctx.taperInfo ? ctx.taperInfo.split(" — ") : [];
  const chainRaw = taperParts[0] ?? "";
  const taperRaw = taperParts[1] ?? taperParts[0] ?? "";

  // Pull song titles from setlist sets
  const songs: string[] = [];
  for (const set of ctx.setlistSets) {
    for (const s of set.songs) {
      songs.push(s);
    }
  }

  return {
    bandName: ctx.bandName.toUpperCase(),
    venue: ctx.venueShort || ctx.venue,
    location: ctx.venueLocation,
    date: ctx.date,
    dateShort: ctx.dateShort,
    taperName: taperRaw || `Recorded by ${pickFrom(TAPER_NAMES)}`,
    genChain: chainRaw || pickFrom(GEN_CHAINS),
    tapeBrand: pickFrom(TAPE_BRANDS),
    songs: songs.length > 0 ? songs : ["Bertha", "Truckin'", "Sugar Magnolia"],
  };
}

// ─── SVG: Stealie sketch (simple circle + 13-point bolt outline) ─────────────

const StealieSketch: React.FC<{ size: number; color: string; rng: () => number }> = ({
  size, color, rng,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  // Wobble the circle slightly for hand-drawn feel
  const wobblePoints = 24;
  const circleD = Array.from({ length: wobblePoints }, (_, i) => {
    const a = (i / wobblePoints) * Math.PI * 2;
    const wobR = r + (rng() - 0.5) * 1.2;
    const x = cx + Math.cos(a) * wobR;
    const y = cy + Math.sin(a) * wobR;
    return i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";

  // 13-point lightning bolt (simplified, hand-drawn wobble)
  const boltW = size * 0.22;
  const boltH = size * 0.55;
  const bx = cx - boltW * 0.5;
  const by = cy - boltH * 0.5;
  const w = (v: number) => v + (rng() - 0.5) * 0.8;
  const boltD = [
    `M ${w(bx + boltW * 0.4)} ${w(by)}`,
    `L ${w(bx + boltW * 0.7)} ${w(by + boltH * 0.38)}`,
    `L ${w(bx + boltW * 0.5)} ${w(by + boltH * 0.38)}`,
    `L ${w(bx + boltW * 0.85)} ${w(by + boltH * 0.62)}`,
    `L ${w(bx + boltW * 0.55)} ${w(by + boltH * 0.62)}`,
    `L ${w(bx + boltW * 0.65)} ${w(by + boltH)}`,
    `L ${w(bx + boltW * 0.3)} ${w(by + boltH * 0.58)}`,
    `L ${w(bx + boltW * 0.5)} ${w(by + boltH * 0.58)}`,
    `L ${w(bx + boltW * 0.15)} ${w(by + boltH * 0.38)}`,
    `L ${w(bx + boltW * 0.38)} ${w(by + boltH * 0.38)}`,
    "Z",
  ].join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <path d={circleD} fill="none" stroke={color} strokeWidth={0.8} opacity={0.7} />
      <path d={boltD} fill="none" stroke={color} strokeWidth={0.7} opacity={0.6} />
    </svg>
  );
};

// ─── SVG: Peace sign doodle ──────────────────────────────────────────────────

const PeaceSign: React.FC<{ size: number; color: string; rng: () => number }> = ({
  size, color, rng,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  // Wobbled circle
  const pts = 20;
  const cD = Array.from({ length: pts }, (_, i) => {
    const a = (i / pts) * Math.PI * 2;
    const wr = r + (rng() - 0.5) * 0.8;
    const x = cx + Math.cos(a) * wr;
    const y = cy + Math.sin(a) * wr;
    return i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";

  const w = (v: number) => v + (rng() - 0.5) * 0.5;
  // Vertical line + two angled lines
  const linesD = [
    `M ${w(cx)} ${w(cy - r)} L ${w(cx)} ${w(cy + r)}`,
    `M ${w(cx)} ${w(cy)} L ${w(cx - r * 0.7)} ${w(cy + r * 0.7)}`,
    `M ${w(cx)} ${w(cy)} L ${w(cx + r * 0.7)} ${w(cy + r * 0.7)}`,
  ].join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <path d={cD} fill="none" stroke={color} strokeWidth={0.7} opacity={0.5} />
      <path d={linesD} fill="none" stroke={color} strokeWidth={0.6} opacity={0.45} />
    </svg>
  );
};

// ─── Hand-lettered text (per-letter Y wobble + spacing variance) ─────────────

const HandLettered: React.FC<{
  text: string;
  fontSize: number;
  color: string;
  letterSpacing: number;
  fontWeight: number | string;
  fontStyle?: string;
  rng: () => number;
  wobbleAmount?: number;
}> = ({ text, fontSize, color, letterSpacing, fontWeight, fontStyle, rng, wobbleAmount = 0.8 }) => {
  return (
    <div style={{ display: "flex", alignItems: "baseline", whiteSpace: "nowrap" }}>
      {text.split("").map((char, i) => {
        const yOff = (rng() - 0.5) * wobbleAmount;
        const xOff = (rng() - 0.5) * 0.4;
        const rotOff = (rng() - 0.5) * 0.6;
        return (
          <span
            key={i}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize,
              fontWeight,
              fontStyle: fontStyle || "normal",
              color,
              letterSpacing: char === " " ? letterSpacing + 1 : letterSpacing,
              transform: `translate(${xOff}px, ${yOff}px) rotate(${rotOff}deg)`,
              display: "inline-block",
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

// ─── Paper grain texture (CSS-only subtle noise) ─────────────────────────────

function paperGrainCSS(seed: number): string {
  // Build a layered radial-gradient "noise" from deterministic positions
  const rng = seeded(seed + 7777);
  const dots: string[] = [];
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * 100);
    const y = Math.floor(rng() * 100);
    const r = 0.5 + rng() * 1.0;
    const a = 0.015 + rng() * 0.025;
    dots.push(
      `radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(0,0,0,${a.toFixed(3)}) 50%, transparent 100%)`,
    );
  }
  return dots.join(", ");
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  frames: EnhancedFrameData[];
}

export const BootlegLabel: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = useShowContext();
  const snap = useAudioSnapshot(frames);
  const { energy, bass, beatDecay, chromaHue, highs, mids } = snap;

  // Show-stable seed for deterministic details
  const showSeed = ctx?.showSeed ?? 50877;
  const showRng = useMemo(() => seeded(showSeed + 3301), [showSeed]);

  // Build label data once per show
  const labelData = useMemo(() => buildLabelData(ctx, seeded(showSeed + 3301)), [ctx, showSeed]);

  // Paper grain background (computed once per show)
  const grainBg = useMemo(() => paperGrainCSS(showSeed), [showSeed]);

  // ─── Opacity envelope ───
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.3, 0.42], CL);
  const fadeIn = interpolate(frame, [0, 90], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(frame, [durationInFrames - 90, durationInFrames], [1, 0], {
    ...CL, easing: Easing.in(Easing.cubic),
  });
  const opacity = baseOpacity * fadeIn * fadeOut;
  if (opacity < 0.01) return null;

  // ─── Per-frame jitter ───
  const rng = seeded(frame * 31 + 508);
  const jitterX = (rng() - 0.5) * 1.4;
  const jitterY = (rng() - 0.5) * 1.4;

  // ─── Audio-reactive effects ───
  const scalePulse = 1 + bass * 0.012 + beatDecay * 0.006;
  const bassJitterX = (seeded(frame * 47 + 191)() - 0.5) * bass * 2.5;
  const bassJitterY = (seeded(frame * 53 + 271)() - 0.5) * bass * 2.5;

  // ChromaHue tints decorative accents
  const accentHue = chromaHue;
  const accentColor = `hsla(${accentHue}, 35%, 55%, 0.45)`;
  const accentColorFaint = `hsla(${accentHue}, 25%, 50%, 0.2)`;

  // ─── Tape counter ───
  const totalSecs = Math.floor(frame / fps);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const counterStr = `${String(mins).padStart(3, "0")}:${String(secs).padStart(2, "0")}`;
  // Tenths digit flickers
  const tenths = Math.floor((frame % fps) / (fps / 10));
  const counterFull = `${counterStr}.${tenths}`;

  // ─── Color palette (aged thermal paper) ───
  const paperBgTop = "rgba(28, 34, 24, 0.62)";
  const paperBgBot = "rgba(22, 28, 19, 0.58)";
  const textPrimary = "rgba(165, 200, 155, 0.92)";
  const textSecondary = "rgba(145, 178, 135, 0.72)";
  const textDim = "rgba(130, 162, 120, 0.55)";
  const borderMain = "rgba(140, 175, 130, 0.3)";
  const foldLineColor = "rgba(130, 165, 120, 0.15)";
  const stampRed = "rgba(180, 50, 40, 0.35)";

  // ─── Deterministic per-frame rngs for decorations ───
  const stealieRng = seeded(showSeed + 1111);
  const peaceRng = seeded(showSeed + 2222);
  const letterRng = seeded(frame * 13 + showSeed);

  // ─── Songs to display (fit ~8-10 on the card) ───
  const maxSongs = 9;
  const displaySongs = labelData.songs.slice(0, maxSongs);

  // ─── Energy-reactive faint paper "pulse" (scale on the card itself) ───
  const paperBreath = 1 + energy * 0.003;

  // ─── "NOT FOR SALE" stamp rotation (show-stable) ───
  const stampRng = seeded(showSeed + 4444);
  const stampRotation = -8 + stampRng() * 16; // -8 to +8 degrees
  const stampOffsetX = 10 + stampRng() * 30;
  const stampOffsetY = 20 + stampRng() * 40;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          opacity,
          transform: `translate(${jitterX + bassJitterX}px, ${jitterY + bassJitterY}px) scale(${scalePulse * paperBreath})`,
          transformOrigin: "bottom right",
          willChange: "transform, opacity",
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* ─── Spine text (vertical, along left edge) ─── */}
        <div
          style={{
            width: SPINE_W,
            height: CARD_H,
            background: `linear-gradient(180deg, ${paperBgTop}, ${paperBgBot})`,
            border: `1px solid ${borderMain}`,
            borderRight: "none",
            borderRadius: `${CARD_RADIUS}px 0 0 ${CARD_RADIUS}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: "rotate(180deg)",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 7.5,
              fontWeight: 700,
              letterSpacing: 2,
              color: textSecondary,
              whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}
          >
            {labelData.bandName} {labelData.dateShort}
          </div>
        </div>

        {/* ─── Main J-card body ─── */}
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: `0 ${CARD_RADIUS}px ${CARD_RADIUS}px 0`,
            border: `1px solid ${borderMain}`,
            background: `linear-gradient(175deg, ${paperBgTop} 0%, ${paperBgBot} 100%)`,
            backgroundImage: grainBg,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ─── Paper grain overlay (faint horizontal lines) ─── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 3px,
                rgba(120, 150, 110, 0.018) 3px,
                rgba(120, 150, 110, 0.018) 4px
              )`,
              pointerEvents: "none",
            }}
          />

          {/* ─── Fold line (top) ─── */}
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              top: FOLD_Y_TOP,
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${foldLineColor} 15%, ${foldLineColor} 85%, transparent 100%)`,
              pointerEvents: "none",
            }}
          />
          {/* Fold line (bottom) */}
          <div
            style={{
              position: "absolute",
              left: 8,
              right: 8,
              top: FOLD_Y_BOTTOM,
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${foldLineColor} 15%, ${foldLineColor} 85%, transparent 100%)`,
              pointerEvents: "none",
            }}
          />

          {/* ─── TOP PANEL: Band name + venue + date ─── */}
          <div style={{ padding: `${PAD_Y}px ${PAD_X}px 6px ${PAD_X}px`, flexShrink: 0 }}>
            {/* Band name — hand-lettered */}
            <HandLettered
              text={labelData.bandName}
              fontSize={15}
              color={textPrimary}
              letterSpacing={2.5}
              fontWeight={700}
              rng={seeded(showSeed + 8888)}
              wobbleAmount={1.0}
            />

            {/* Venue */}
            <div style={{ marginTop: 4 }}>
              <HandLettered
                text={labelData.venue}
                fontSize={10.5}
                color={textSecondary}
                letterSpacing={0.5}
                fontWeight={400}
                rng={seeded(showSeed + 9999)}
                wobbleAmount={0.5}
              />
            </div>

            {/* Location + Date */}
            <div style={{ marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <HandLettered
                text={labelData.location}
                fontSize={9.5}
                color={textDim}
                letterSpacing={0.3}
                fontWeight={400}
                rng={seeded(showSeed + 1234)}
                wobbleAmount={0.4}
              />
              <span
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 9.5,
                  color: textSecondary,
                  letterSpacing: 0.5,
                  marginLeft: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {labelData.dateShort}
              </span>
            </div>

            {/* Stealie sketch (top-right corner) */}
            <div style={{ position: "absolute", top: 8, right: PAD_X - 2 }}>
              <StealieSketch size={32} color={accentColor} rng={stealieRng} />
            </div>
          </div>

          {/* ─── MIDDLE PANEL: Song list ─── */}
          <div
            style={{
              flex: 1,
              padding: `4px ${PAD_X}px`,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Numbered song lines */}
            {displaySongs.map((song, i) => {
              const lineRng = seeded(frame * 17 + i * 113 + showSeed);
              const lineJitter = (lineRng() - 0.5) * 0.6;
              // Highs make the current-ish song text slightly brighter
              const songProgress = frame / durationInFrames;
              const songIdx = Math.floor(songProgress * labelData.songs.length);
              const isActive = i === Math.min(songIdx, displaySongs.length - 1);

              return (
                <div
                  key={i}
                  style={{
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: 9,
                    color: isActive ? textPrimary : textDim,
                    lineHeight: 1.55,
                    transform: `translateX(${lineJitter}px)`,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: CARD_W - PAD_X * 2 - 8,
                    transition: "color 0.5s ease",
                  }}
                >
                  <span style={{ display: "inline-block", width: 16, textAlign: "right", marginRight: 4, color: textDim, fontSize: 8 }}>
                    {i + 1}.
                  </span>
                  {song}
                </div>
              );
            })}
            {labelData.songs.length > maxSongs && (
              <div
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 8,
                  color: textDim,
                  marginTop: 1,
                  paddingLeft: 20,
                  fontStyle: "italic",
                }}
              >
                +{labelData.songs.length - maxSongs} more...
              </div>
            )}

            {/* Peace sign doodle (bottom-left of song area) */}
            <div style={{ position: "absolute", bottom: 2, left: PAD_X }}>
              <PeaceSign size={18} color={accentColorFaint} rng={peaceRng} />
            </div>
          </div>

          {/* ─── BOTTOM PANEL: Taper credit + generation chain + tape brand ─── */}
          <div
            style={{
              padding: `4px ${PAD_X}px ${PAD_Y}px ${PAD_X}px`,
              flexShrink: 0,
              position: "relative",
            }}
          >
            {/* Taper credit */}
            <div
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: 8.5,
                fontStyle: "italic",
                color: textDim,
                letterSpacing: 0.3,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: CARD_W - PAD_X * 2 - 60,
              }}
            >
              {labelData.taperName}
            </div>

            {/* Generation chain */}
            <div
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: 8,
                color: textDim,
                letterSpacing: 0.4,
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{labelData.genChain}</span>
              <span style={{ opacity: 0.4, fontSize: 7 }}>{labelData.tapeBrand}</span>
            </div>

            {/* Divider */}
            <div
              style={{
                width: "100%",
                height: 1,
                background: `linear-gradient(90deg, ${borderMain} 0%, ${foldLineColor} 50%, ${borderMain} 100%)`,
                marginTop: 5,
                marginBottom: 4,
              }}
            />

            {/* Counter row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {/* Tape counter (digital-style) */}
              <div
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  color: textSecondary,
                  letterSpacing: 2,
                  // Subtle mids-reactive brightness
                  opacity: 0.6 + mids * 0.4,
                  // Slight beat-sync glow
                  textShadow: beatDecay > 0.3
                    ? `0 0 ${2 + beatDecay * 3}px ${accentColorFaint}`
                    : "none",
                }}
              >
                {counterFull}
              </div>

              <span
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 8,
                  color: textDim,
                  letterSpacing: 1.5,
                  opacity: 0.5,
                }}
              >
                SIDE A
              </span>
            </div>
          </div>

          {/* ─── "NOT FOR SALE" stamp overlay ─── */}
          <div
            style={{
              position: "absolute",
              top: stampOffsetY,
              right: stampOffsetX,
              transform: `rotate(${stampRotation}deg)`,
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 3,
              color: stampRed,
              border: `1.5px solid ${stampRed}`,
              borderRadius: 2,
              padding: "2px 6px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              // Slightly faded / worn appearance
              opacity: 0.7 + beatDecay * 0.15,
              textTransform: "uppercase",
            }}
          >
            NOT FOR SALE
          </div>

          {/* ─── Chroma accent strip (thin line along top, hue-reactive) ─── */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 1.5,
              background: `linear-gradient(90deg, transparent 5%, ${accentColorFaint} 30%, ${accentColor} 50%, ${accentColorFaint} 70%, transparent 95%)`,
              opacity: 0.5 + highs * 0.5,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
};
