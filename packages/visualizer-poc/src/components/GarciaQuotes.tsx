/**
 * GarciaQuotes — A+++ reverent presentation of Jerry Garcia's words.
 *
 * Ornate double-line border with corner flourishes, aged parchment background,
 * oversized decorative quotation marks, typewriter reveal with blinking cursor,
 * attribution with ornamental separator, floating dust motes, warm glow aura,
 * and full vignette. Audio-gated to quiet/spacey passages only.
 */

import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { BAND_CONFIG } from "../data/band-config";
import { useAudioSnapshot } from "./parametric/audio-helpers";

const QUOTES = BAND_CONFIG.quotes.map((q) => q.text);
const CHARS_PER_FRAME = 0.5;
const CURSOR_BLINK_PERIOD = 20;
const DUST_MOTE_COUNT = 5;
const ATTRIBUTION = BAND_CONFIG.musicians[0] ?? "Jerry Garcia";

/* ─── Helper: absolute-positioned div ─── */
const abs = (extra: React.CSSProperties): React.CSSProperties => ({
  position: "absolute", pointerEvents: "none", ...extra,
});

/* ─── SVG Corner Flourish (one quadrant, mirrored per corner) ─── */
const CornerFlourish: React.FC<{ opacity: number; color: string }> = ({ opacity, color }) => (
  <svg width="80" height="80" viewBox="0 0 80 80" style={{ opacity }}>
    <path d="M 4 4 Q 4 40 40 40 Q 40 4 76 4" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    <path d="M 10 10 Q 10 36 36 36 Q 36 10 62 10" fill="none" stroke={color} strokeWidth="0.6" strokeLinecap="round" />
    <path d="M 6 6 C 8 2 12 2 14 6 C 16 10 12 14 8 12" fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
  </svg>
);

/** Positions a flourish at the given corner with the right mirror transform. */
const PlacedFlourish: React.FC<{
  corner: "tl" | "tr" | "bl" | "br"; opacity: number; color: string;
}> = ({ corner, opacity, color }) => {
  const pos: React.CSSProperties =
    corner === "tl" ? { left: -12, top: -12 } :
    corner === "tr" ? { right: -12, top: -12, transform: "scaleX(-1)" } :
    corner === "bl" ? { left: -12, bottom: -12, transform: "scaleY(-1)" } :
    /* br */          { right: -12, bottom: -12, transform: "scale(-1,-1)" };
  return (
    <div style={abs(pos)}>
      <CornerFlourish opacity={opacity} color={color} />
    </div>
  );
};

/* ─── Ornamental Separator (thin rule with center diamond) ─── */
const OrnamentalRule: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => {
  const line: React.CSSProperties = { width: 60, height: 0, borderTop: `0.8px solid ${color}` };
  const diamond: React.CSSProperties = {
    width: 6, height: 6, transform: "rotate(45deg)", border: `0.8px solid ${color}`,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, marginBottom: 10, opacity }}>
      <div style={line} /><div style={diamond} /><div style={line} />
    </div>
  );
};

/* ─── Stealie Mini Sketch ─── */
const StealieSketch: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" style={{ opacity, verticalAlign: "middle", marginLeft: 6 }}>
    <circle cx="12" cy="10" r="8" fill="none" stroke={color} strokeWidth="1" />
    <path d="M 12 2 L 10 10 L 14 10 L 12 18" fill="none" stroke={color} strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

/* ─── Dust Motes ─── */
interface DustMote { x0: number; y0: number; driftX: number; driftY: number; size: number; phase: number; speed: number; }

function generateDustMotes(seed: number): DustMote[] {
  const rng = seeded(seed);
  return Array.from({ length: DUST_MOTE_COUNT }, () => ({
    x0: rng() * 0.8 + 0.1,
    y0: rng() * 0.6 + 0.2,
    driftX: (rng() - 0.5) * 0.15,
    driftY: (rng() - 0.5) * 0.08,
    size: rng() * 1.5 + 0.8,
    phase: rng() * Math.PI * 2,
    speed: rng() * 0.02 + 0.01,
  }));
}

/* ─── Oversized Decorative Quote Mark ─── */
const QuoteMark: React.FC<{ char: string; color: string; style: React.CSSProperties }> = ({ char, color, style }) => (
  <div style={abs({
    fontFamily: "'Playfair Display', Georgia, serif", fontSize: 120, lineHeight: 1,
    color, userSelect: "none", ...style,
  })}>
    {char}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Main Component                                                        */
/* ═══════════════════════════════════════════════════════════════════════ */

interface Props { frames: EnhancedFrameData[]; }

export const GarciaQuotes: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const { energy, slowEnergy, spaceScore, chromaHue } = snap;

  // Energy gate: quotes only during quiet/spacey passages
  const isQuiet = (spaceScore ?? 0) > 0.4 || energy < 0.15;
  if (!isQuiet) return null;

  // Pick a quote deterministically per ~30s window
  const quoteSlot = Math.floor(frame / 900);
  const rng = seeded(quoteSlot * 41 + 19420801);
  const quote = QUOTES[Math.floor(rng() * QUOTES.length)];

  // Typewriter reveal
  const visibleCount = Math.min(Math.floor(frame * CHARS_PER_FRAME), quote.length);
  const visibleText = quote.slice(0, visibleCount);
  const isFullyTyped = visibleCount >= quote.length;

  // Cursor: blinks while typing, fades after fully typed
  const cursorPhase = Math.sin((frame / CURSOR_BLINK_PERIOD) * Math.PI * 2);
  const cursorBlink = interpolate(cursorPhase, [-1, 1], [0.2, 0.9]);
  const cursorFade = isFullyTyped
    ? interpolate(frame - quote.length / CHARS_PER_FRAME, [0, fps * 1.5], [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;

  // Audio-driven modulation
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
  const fadeOpacity = interpolate(energy, [0.02, 0.12], [0.95, 0.55], clamp);
  const breatheScale = interpolate(slowEnergy, [0.02, 0.25], [0.98, 1.02], clamp);
  const warmHue = interpolate(chromaHue ?? 30, [0, 360], [25, 45], clamp);

  // Palette
  const borderColor = `hsla(${warmHue}, 35%, 65%, 0.35)`;
  const flourishColor = `hsla(${warmHue}, 30%, 60%, 0.3)`;
  const textColor = "rgba(255, 245, 225, 0.85)";
  const attrColor = "rgba(255, 245, 225, 0.5)";
  const glowColor = `hsla(${warmHue}, 45%, 55%, 0.12)`;
  const qmColor = `hsla(${warmHue}, 25%, 55%, 0.08)`;

  // Entrance (first 2s)
  const entrance = interpolate(frame, [0, fps * 2], [0, 1],
    { ...clamp, easing: Easing.out(Easing.cubic) });
  const entranceY = interpolate(entrance, [0, 1], [12, 0]);
  const compositeOpacity = fadeOpacity * entrance;

  // Dust motes (deterministic per slot)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const dustMotes = useMemo(() => generateDustMotes(quoteSlot * 73 + 8011977), [quoteSlot]);

  // Attribution fade-in after typing completes
  const attrOpacity = isFullyTyped
    ? interpolate(frame - quote.length / CHARS_PER_FRAME, [0, fps * 0.8], [0, 1],
        { ...clamp, easing: Easing.out(Easing.cubic) })
    : 0;

  const serif = "'Playfair Display', Georgia, serif";

  return (
    <div style={abs({ inset: 0, overflow: "hidden" })}>

      {/* ─── Full-Frame Vignette ─── */}
      <div style={abs({
        inset: 0,
        background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)",
      })} />

      {/* ─── Floating Dust Motes ─── */}
      {dustMotes.map((m, i) => {
        const t = frame * m.speed + m.phase;
        const mx = m.x0 + Math.sin(t) * m.driftX;
        const my = m.y0 + Math.cos(t * 0.7) * m.driftY;
        const mo = interpolate(Math.sin(t * 1.3 + i), [-1, 1], [0.03, 0.12]) * compositeOpacity;
        return (
          <div key={i} style={abs({
            left: `${mx * 100}%`, top: `${my * 100}%`,
            width: m.size, height: m.size, borderRadius: "50%",
            backgroundColor: `hsla(${warmHue}, 40%, 75%, ${mo})`,
            boxShadow: `0 0 ${m.size * 3}px hsla(${warmHue}, 40%, 70%, ${mo * 0.6})`,
          })} />
        );
      })}

      {/* ─── Main Quote Frame ─── */}
      <div style={{
        position: "absolute", bottom: "10%", left: "50%",
        transform: `translateX(-50%) translateY(${entranceY}px) scale(${breatheScale})`,
        maxWidth: "70%", minWidth: "40%",
        opacity: compositeOpacity, padding: "48px 56px",
      }}>

        {/* Warm glow aura */}
        <div style={abs({
          inset: -40, borderRadius: 24,
          background: `radial-gradient(ellipse at 50% 50%, ${glowColor}, transparent 70%)`,
          filter: "blur(30px)",
        })} />

        {/* Aged parchment background */}
        <div style={abs({
          inset: 0, borderRadius: 6,
          background: `radial-gradient(ellipse at 50% 40%, rgba(180,140,80,0.06), rgba(120,90,50,0.03) 60%, rgba(60,40,20,0.015) 100%)`,
        })} />

        {/* Double-line border (outer + inner) */}
        <div style={abs({ inset: 0, borderRadius: 6, border: `1px solid ${borderColor}` })} />
        <div style={abs({ inset: 5, borderRadius: 4, border: `0.5px solid ${borderColor}` })} />

        {/* Corner flourishes */}
        <PlacedFlourish corner="tl" opacity={compositeOpacity} color={flourishColor} />
        <PlacedFlourish corner="tr" opacity={compositeOpacity} color={flourishColor} />
        <PlacedFlourish corner="bl" opacity={compositeOpacity} color={flourishColor} />
        <PlacedFlourish corner="br" opacity={compositeOpacity} color={flourishColor} />

        {/* Oversized decorative quotation marks */}
        <QuoteMark char={"\u201C"} color={qmColor} style={{ top: 8, left: 16 }} />
        <QuoteMark char={"\u201D"} color={qmColor} style={{ bottom: -10, right: 20 }} />

        {/* ─── Quote Text with Typewriter Reveal ─── */}
        <div style={{
          position: "relative", zIndex: 1,
          fontFamily: serif, fontSize: 20, fontStyle: "italic",
          color: textColor,
          textShadow: `0 0 24px hsla(${warmHue}, 40%, 60%, 0.15), 0 1px 2px rgba(0,0,0,0.3)`,
          lineHeight: 1.75, letterSpacing: 0.4, textAlign: "center",
        }}>
          {visibleText}
          {/* Typing cursor */}
          <span style={{
            display: "inline-block", width: 1.5, height: "1em",
            backgroundColor: textColor, marginLeft: 2, verticalAlign: "text-bottom",
            opacity: cursorBlink * cursorFade,
          }} />
        </div>

        {/* Ornamental separator */}
        <OrnamentalRule color={borderColor} opacity={isFullyTyped ? 1 : 0} />

        {/* Attribution */}
        <div style={{
          position: "relative", zIndex: 1, textAlign: "center",
          fontFamily: serif, fontSize: 12, fontStyle: "italic",
          color: attrColor, letterSpacing: 2.5, opacity: attrOpacity,
        }}>
          {"— "}{ATTRIBUTION.toUpperCase()}
          <StealieSketch color={attrColor} opacity={0.6} />
        </div>
      </div>
    </div>
  );
};
