/**
 * BumperStickers -- A+++ vintage Grateful Dead parking-lot bumper stickers.
 *
 * 6-8 stickers drifting across the screen at varying speeds and angles,
 * each a hand-worn rounded rectangle with:
 *   - Aged/weathered gradient background with subtle wear texture
 *   - Border with slight peel lifting at one corner
 *   - Dead-themed slogans in vintage serif/handwritten type
 *   - Decorative icon element (mini stealie, bolt, bear, rose)
 *   - Gentle rotation, tilt, and bobble
 *   - Worn vintage patina: edge fraying, desaturation, scratches
 *
 * Audio: energy drives drift speed, beatDecay for subtle bobble,
 * chromaHue tints sticker backgrounds, tempoFactor for movement pacing.
 * Deterministic via mulberry32 PRNG.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";
import { BAND_CONFIG } from "../data/band-config";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STICKER_TEXTS = [
  "WHAT A LONG STRANGE TRIP IT'S BEEN",
  "STEAL YOUR FACE",
  BAND_CONFIG.bandName.toUpperCase(),
  "FURTHER",
  "NOT ALL WHO WANDER ARE LOST",
  "NFA",
  `${(BAND_CONFIG.musicians[0] ?? "JERRY").split(" ")[0].toUpperCase()} LIVES`,
  "KEEP ON TRUCKIN'",
];

/** Icon type for each sticker — cycles through decorative elements */
type IconKind = "stealie" | "bolt" | "bear" | "rose";
const ICON_CYCLE: IconKind[] = ["stealie", "bolt", "bear", "rose", "stealie", "bolt", "bear", "rose"];

/** Vintage palette — muted, sun-faded tones like real parking-lot stickers */
const STICKER_PALETTES: Array<{ bg: string; border: string; text: string }> = [
  { bg: "#C94C4C", border: "#8B3232", text: "#FFF5E1" },  // faded red
  { bg: "#D4A843", border: "#8B7223", text: "#2B1D0E" },  // dusty gold
  { bg: "#5B8A72", border: "#3D5E4D", text: "#FFF8F0" },  // sage green
  { bg: "#6B5B95", border: "#4A3D6B", text: "#F0E8FF" },  // muted purple
  { bg: "#D27D4A", border: "#8B5230", text: "#FFF5E1" },  // burnt orange
  { bg: "#4A7C8B", border: "#2E5560", text: "#F0FAFF" },  // faded teal
  { bg: "#8B6E5A", border: "#5C4A3D", text: "#FFF8F0" },  // worn brown
  { bg: "#B55B7A", border: "#7A3D53", text: "#FFF0F5" },  // dusty rose
];

/** Motion drift types */
type DriftType = "slow_lr" | "slow_rl" | "gentle_arc" | "diagonal_down" | "diagonal_up" | "lazy_float";
const DRIFT_TYPES: DriftType[] = [
  "slow_lr", "slow_rl", "gentle_arc", "diagonal_down", "diagonal_up", "lazy_float",
];

/** How many stickers are on screen simultaneously */
const STICKER_COUNT = 7;
/** Base cycle: stickers recycle every N frames */
const STICKER_CYCLE = 900;  // 30s at 30fps
/** How long a sticker is visible (drift across) */
const STICKER_LIFETIME = 600; // 20s
/** Stagger so they don't all appear at once */
const STICKER_STAGGER = 130;

/* ------------------------------------------------------------------ */
/*  Schedule                                                           */
/* ------------------------------------------------------------------ */

interface ScheduledSticker {
  id: number;
  textIndex: number;
  paletteIndex: number;
  iconKind: IconKind;
  driftType: DriftType;
  startFrame: number;
  yBand: number;       // 0-1 vertical band
  baseTilt: number;     // degrees
  fontSize: number;
  sizeScale: number;    // 0.85-1.15
  wearSeed: number;     // drives unique wear pattern
  peelCorner: number;   // 0-3 which corner peels
}

function generateSchedule(totalFrames: number, masterSeed: number): ScheduledSticker[] {
  const rng = seeded(masterSeed);
  const stickers: ScheduledSticker[] = [];
  let id = 0;

  for (let slot = 0; slot < STICKER_COUNT; slot++) {
    let startFrame = 60 + slot * STICKER_STAGGER;
    while (startFrame < totalFrames) {
      stickers.push({
        id: id++,
        textIndex: Math.floor(rng() * STICKER_TEXTS.length),
        paletteIndex: Math.floor(rng() * STICKER_PALETTES.length),
        iconKind: ICON_CYCLE[slot % ICON_CYCLE.length],
        driftType: DRIFT_TYPES[Math.floor(rng() * DRIFT_TYPES.length)],
        startFrame,
        yBand: 0.1 + rng() * 0.7,
        baseTilt: -6 + rng() * 12,
        fontSize: 14 + Math.floor(rng() * 6),
        sizeScale: 0.85 + rng() * 0.3,
        wearSeed: rng() * 1000,
        peelCorner: Math.floor(rng() * 4),
      });
      startFrame += STICKER_CYCLE + Math.floor(rng() * 300);
    }
  }

  return stickers;
}

/* ------------------------------------------------------------------ */
/*  Motion                                                             */
/* ------------------------------------------------------------------ */

interface DriftState {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  opacity: number;
}

function computeDrift(
  drift: DriftType,
  progress: number,
  screenW: number,
  screenH: number,
  yBand: number,
  wearSeed: number,
  baseTilt: number,
  energyMult: number,
  beatBobble: number,
): DriftState {
  // Fade envelope — slow ease in and out
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const p = progress;
  const speed = 0.7 + energyMult * 0.6; // energy makes them drift faster
  const adjP = Math.min(1, p * speed);
  const wobbleY = Math.sin(p * Math.PI * 4 + wearSeed) * 6 * (1 + beatBobble * 8);
  const wobbleRot = Math.sin(p * Math.PI * 3 + wearSeed * 0.7) * 1.5 * (1 + beatBobble * 3);

  switch (drift) {
    case "slow_lr": {
      const x = interpolate(adjP, [0, 1], [-0.15 * screenW, 1.15 * screenW], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const y = screenH * yBand + wobbleY;
      return { x, y, rotation: baseTilt + wobbleRot, scale: 1, opacity };
    }
    case "slow_rl": {
      const x = interpolate(adjP, [0, 1], [1.15 * screenW, -0.15 * screenW], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const y = screenH * yBand + wobbleY;
      return { x, y, rotation: baseTilt - wobbleRot, scale: 1, opacity };
    }
    case "gentle_arc": {
      const x = interpolate(adjP, [0, 1], [screenW * 0.05, screenW * 0.95], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const arcH = screenH * 0.15;
      const y = screenH * yBand - Math.sin(p * Math.PI) * arcH + wobbleY;
      return { x, y, rotation: baseTilt + wobbleRot + p * 4, scale: 1, opacity };
    }
    case "diagonal_down": {
      const x = interpolate(adjP, [0, 1], [-0.1 * screenW, 1.1 * screenW], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const y = interpolate(adjP, [0, 1], [screenH * 0.15, screenH * 0.75], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      }) + wobbleY;
      return { x, y, rotation: baseTilt + wobbleRot, scale: 1, opacity };
    }
    case "diagonal_up": {
      const x = interpolate(adjP, [0, 1], [1.1 * screenW, -0.1 * screenW], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });
      const y = interpolate(adjP, [0, 1], [screenH * 0.75, screenH * 0.2], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      }) + wobbleY;
      return { x, y, rotation: baseTilt - wobbleRot, scale: 1, opacity };
    }
    case "lazy_float": {
      const cx = screenW * (0.2 + yBand * 0.6);
      const wanderX = Math.sin(p * Math.PI * 1.5 + wearSeed) * screenW * 0.15;
      const wanderY = Math.cos(p * Math.PI * 1.8 + wearSeed * 0.5) * screenH * 0.1;
      const x = cx + wanderX;
      const y = screenH * yBand + wanderY + wobbleY;
      return { x, y, rotation: baseTilt + wobbleRot + Math.sin(p * Math.PI * 2) * 3, scale: 1, opacity };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  SVG Icons (inline, small decorative elements)                      */
/* ------------------------------------------------------------------ */

function StickerIcon({ kind, color, size }: { kind: IconKind; color: string; size: number }) {
  const s = size;

  switch (kind) {
    case "stealie":
      // Simplified skull circle with lightning bolt
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill="none" opacity={0.8} />
          <circle cx="9" cy="10" r="1.8" fill={color} opacity={0.7} />
          <circle cx="15" cy="10" r="1.8" fill={color} opacity={0.7} />
          <path d="M12 2 L13.5 10 L11 12 L13 14 L12 22" stroke={color} strokeWidth="1.2" fill="none" opacity={0.9} />
        </svg>
      );
    case "bolt":
      // Lightning bolt — the classic 13-point bolt
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M13 2 L5 14 L11 14 L10 22 L19 10 L13 10 Z"
            fill={color}
            opacity={0.75}
          />
        </svg>
      );
    case "bear":
      // Tiny dancing bear silhouette
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="7" r="3.5" fill={color} opacity={0.7} />
          <circle cx="9" cy="4.5" r="1.5" fill={color} opacity={0.6} />
          <circle cx="15" cy="4.5" r="1.5" fill={color} opacity={0.6} />
          <ellipse cx="12" cy="14" rx="4" ry="5" fill={color} opacity={0.7} />
          <line x1="8" y1="12" x2="5" y2="9" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
          <line x1="16" y1="12" x2="19" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
          <line x1="10" y1="18" x2="9" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
          <line x1="14" y1="18" x2="15" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
        </svg>
      );
    case "rose":
      // Simple rose — spiral with stem
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4 C14 4 16 6 16 8 C16 10 14 12 12 12 C10 12 8 10 8 8 C8 6 10 4 12 4 Z"
            fill={color}
            opacity={0.7}
          />
          <path
            d="M10 7 C11 6 13 6 14 7 C15 8 14 10 13 10 C12 10 11 9 10 7 Z"
            fill={color}
            opacity={0.5}
          />
          <line x1="12" y1="12" x2="12" y2="21" stroke={color} strokeWidth="1.2" opacity={0.5} />
          <path d="M12 16 C10 14 8 15 9 17" stroke={color} strokeWidth="0.8" fill="none" opacity={0.4} />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Sticker Component                                                  */
/* ------------------------------------------------------------------ */

interface StickerProps {
  sticker: ScheduledSticker;
  frame: number;
  screenW: number;
  screenH: number;
  energyMult: number;
  beatBobble: number;
  chromaShift: number;
  tempoFactor: number;
}

const SingleSticker: React.FC<StickerProps> = React.memo(({
  sticker,
  frame,
  screenW,
  screenH,
  energyMult,
  beatBobble,
  chromaShift,
}) => {
  const age = frame - sticker.startFrame;
  if (age < 0 || age >= STICKER_LIFETIME) return null;

  const progress = age / STICKER_LIFETIME;
  const state = computeDrift(
    sticker.driftType,
    progress,
    screenW,
    screenH,
    sticker.yBand,
    sticker.wearSeed,
    sticker.baseTilt,
    energyMult,
    beatBobble,
  );

  const finalOpacity = state.opacity * 0.88;
  if (finalOpacity < 0.01) return null;

  const palette = STICKER_PALETTES[sticker.paletteIndex];
  const text = STICKER_TEXTS[sticker.textIndex];

  // Chroma-tinted background: shift hue slightly based on audio
  const hueRotate = chromaShift * 0.15; // subtle tint, not overpowering

  // Wear pattern from seed — unique per sticker
  const wearRng = seeded(Math.floor(sticker.wearSeed));
  const scratchAngle = wearRng() * 180;
  const scratchOffset = 20 + wearRng() * 60;
  const wearOpacity = 0.06 + wearRng() * 0.08;
  const edgeFray = 0.5 + wearRng() * 1.5;

  // Peel effect — one corner lifts slightly
  const peelCorners = ["2px", "2px", "2px", "2px"]; // top-left, top-right, bottom-right, bottom-left
  const peelIdx = sticker.peelCorner;
  const peelBorderRadius = [...peelCorners];
  peelBorderRadius[peelIdx] = `${3 + Math.floor(wearRng() * 5)}px`;

  // Which corner gets the peel shadow
  const peelShadowX = (peelIdx === 0 || peelIdx === 3) ? -2 : 2;
  const peelShadowY = (peelIdx < 2) ? -2 : 2;

  const stickerScale = sticker.sizeScale * state.scale;

  return (
    <div
      style={{
        position: "absolute",
        left: state.x,
        top: state.y,
        transform: `translate(-50%, -50%) rotate(${state.rotation}deg) scale(${stickerScale})`,
        opacity: finalOpacity,
        filter: `
          saturate(0.7)
          contrast(0.95)
          hue-rotate(${hueRotate}deg)
          drop-shadow(1px 2px 3px rgba(0,0,0,0.35))
        `,
        willChange: "transform, opacity",
      }}
    >
      {/* Main sticker body */}
      <div
        style={{
          position: "relative",
          background: `linear-gradient(
            135deg,
            ${palette.bg} 0%,
            ${palette.bg}DD 40%,
            ${palette.bg}BB 70%,
            ${palette.bg}99 100%
          )`,
          borderRadius: peelBorderRadius.join(" "),
          padding: "8px 18px 8px 14px",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: `1.5px solid ${palette.border}`,
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.15),
            inset 0 -1px 0 rgba(0,0,0,0.15),
            ${peelShadowX}px ${peelShadowY}px 4px rgba(0,0,0,0.2)
          `,
          overflow: "hidden",
        }}
      >
        {/* Wear texture overlay — subtle scratches and aging */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `
              repeating-linear-gradient(
                ${scratchAngle}deg,
                transparent,
                transparent ${scratchOffset}%,
                rgba(255,255,255,${wearOpacity}) ${scratchOffset + 0.5}%,
                transparent ${scratchOffset + 1}%
              )
            `,
            borderRadius: "inherit",
            mixBlendMode: "overlay",
          }}
        />

        {/* Edge fraying — uneven border simulation */}
        <div
          style={{
            position: "absolute",
            inset: -edgeFray,
            pointerEvents: "none",
            border: `${edgeFray}px solid rgba(255,255,255,0.04)`,
            borderRadius: peelBorderRadius.join(" "),
            filter: "blur(0.5px)",
          }}
        />

        {/* Peel corner highlight — slight lift on one corner */}
        <div
          style={{
            position: "absolute",
            width: 14,
            height: 14,
            background: `linear-gradient(
              ${peelIdx < 2 ? "135deg" : "315deg"},
              rgba(255,255,255,0.2) 0%,
              transparent 60%
            )`,
            pointerEvents: "none",
            ...(peelIdx === 0 ? { top: 0, left: 0 } :
              peelIdx === 1 ? { top: 0, right: 0 } :
              peelIdx === 2 ? { bottom: 0, right: 0 } :
              { bottom: 0, left: 0 }),
          }}
        />

        {/* Decorative icon */}
        <StickerIcon
          kind={sticker.iconKind}
          color={palette.text}
          size={sticker.fontSize + 4}
        />

        {/* Text */}
        <span
          style={{
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: sticker.fontSize,
            fontWeight: 700,
            color: palette.text,
            textShadow: `0 1px 1px rgba(0,0,0,0.2)`,
            letterSpacing: text.length > 15 ? 0.3 : 1.2,
            lineHeight: 1.1,
            textTransform: text === text.toUpperCase() ? "none" : "uppercase",
            opacity: 0.92,
          }}
        >
          {text}
        </span>
      </div>

      {/* Adhesive residue shadow — the rectangle's sticky outline */}
      <div
        style={{
          position: "absolute",
          inset: -1,
          borderRadius: peelBorderRadius.join(" "),
          border: "1px solid rgba(0,0,0,0.08)",
          pointerEvents: "none",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Main Overlay                                                       */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const BumperStickers: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  // Audio-driven parameters
  const energyMult = interpolate(snap.energy, [0.03, 0.3], [0.6, 1.4], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const beatBobble = snap.beatDecay; // 0-1 exponential decay from beats
  const chromaShift = snap.chromaHue; // 0-360 hue angle

  // Generate deterministic schedule once
  const schedule = React.useMemo(
    () => generateSchedule(durationInFrames, 50877),
    [durationInFrames],
  );

  // Collect active stickers (multiple on screen at once)
  const activeStickers: ScheduledSticker[] = [];
  for (const sticker of schedule) {
    const age = frame - sticker.startFrame;
    if (age >= -30 && age < STICKER_LIFETIME + 30) {
      activeStickers.push(sticker);
    }
    // Early exit: if we've passed well beyond this sticker's window
    // and stickers are sorted by startFrame, no need to check further back
    // But schedule isn't sorted by start frame (interleaved slots), so check all
  }

  if (activeStickers.length === 0) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {activeStickers.map((sticker) => (
        <SingleSticker
          key={sticker.id}
          sticker={sticker}
          frame={frame}
          screenW={width}
          screenH={height}
          energyMult={energyMult}
          beatBobble={beatBobble}
          chromaShift={chromaShift}
          tempoFactor={tempoFactor}
        />
      ))}
    </div>
  );
};
