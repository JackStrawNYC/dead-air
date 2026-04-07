/**
 * TicketStub — Layer 7 (Artifact)
 * Authentic vintage Grateful Dead concert ticket from the 70s/80s era.
 * Aged paper, torn perforation edge, period typography, coffee stain patina.
 * Tier B | Tags: dead-culture, retro | dutyCycle: 15 | energyBand: any
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";

// ─── Timing ─────────────────────────────────────────────────────────────────
const CYCLE_FRAMES = 900;   // 30s between appearances
const ON_FRAMES = 135;      // 4.5s visible
const FADE_FRAMES = 30;
const STAGGER_START = 300;  // 10s initial delay

// ─── Dimensions ─────────────────────────────────────────────────────────────
const TICKET_W = 340;
const TICKET_H = 150;
const STUB_W = 60;
const MARGIN = 50;

// ─── Era-appropriate pricing ────────────────────────────────────────────────
const ERA_PRICES: Record<string, string[]> = {
  "60s": ["$3.50", "$4.00", "$4.50", "$5.00"],
  "70s": ["$6.50", "$7.50", "$8.50", "$9.50"],
  "80s": ["$12.50", "$14.50", "$15.00", "$16.50"],
  "90s": ["$22.50", "$25.00", "$27.50", "$30.00"],
};

// ─── Clamp helper ───────────────────────────────────────────────────────────
const clampOpts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Torn perforation SVG path ──────────────────────────────────────────────
function buildTornEdgePath(h: number, rng: () => number): string {
  const segs = 24, segH = h / segs;
  const pts: string[] = ["M 0 0"];
  for (let i = 1; i <= segs; i++) {
    const y = i * segH, midY = y - segH * 0.5;
    const depth = 2 + rng() * 5, dir = i % 2 === 0 ? 1 : -1;
    if (i % 3 === 0) {
      pts.push(`L ${dir} ${midY - 3}`, `A 3 3 0 0 ${dir > 0 ? 1 : 0} ${dir} ${midY + 3}`, `L 0 ${y}`);
    } else {
      pts.push(`L ${dir * depth} ${midY}`, `L ${dir * depth * 0.3} ${midY + segH * 0.25}`, `L 0 ${y}`);
    }
  }
  return pts.join(" ");
}

// ─── Mini SVG components ────────────────────────────────────────────────────
const LightningBolt: React.FC<{x:number;y:number;size:number;color:string;opacity:number}> = ({x,y,size:s,color,opacity}) => (
  <svg width={s*1.2} height={s*2} viewBox="0 0 12 20" style={{position:"absolute",left:x,top:y,opacity}}>
    <polygon points="7,0 0,11 5,11 4,20 12,8 6.5,8" fill={color}/>
  </svg>
);

const Stealie: React.FC<{x:number;y:number;size:number;color:string;opacity:number}> = ({x,y,size,color,opacity}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{position:"absolute",left:x,top:y,opacity}}>
    <circle cx="12" cy="12" r="11" fill="none" stroke={color} strokeWidth="1.5"/>
    <line x1="1" y1="12" x2="23" y2="12" stroke={color} strokeWidth="1"/>
    <polyline points="10,4 8,12 14,12 12,20" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const Barcode: React.FC<{seed:number;width:number;height:number;color:string;opacity:number}> = ({seed,width:w,height:h,color,opacity}) => {
  const rng = seeded(seed + 7777);
  const bars: React.ReactNode[] = [];
  let xPos = 0;
  const unit = w / 60;
  for (let i = 0; i < 30; i++) {
    const bw = unit * (rng() > 0.5 ? 2 : 1), gw = unit * (rng() > 0.6 ? 1.5 : 1);
    bars.push(<rect key={i} x={xPos} y={0} width={bw} height={h} fill={color}/>);
    xPos += bw + gw;
  }
  return <svg width={w} height={h} style={{opacity}}>{bars}</svg>;
};

// ─── Dog-ear clip paths (one per corner) ────────────────────────────────────
const dogEarClips = (s: number) => [
  `polygon(${s}px 0,100% 0,100% 100%,0 100%,0 ${s}px)`,
  `polygon(0 0,calc(100% - ${s}px) 0,100% ${s}px,100% 100%,0 100%)`,
  `polygon(0 0,100% 0,100% 100%,${s}px 100%,0 calc(100% - ${s}px))`,
  `polygon(0 0,100% 0,100% calc(100% - ${s}px),calc(100% - ${s}px) 100%,0 100%)`,
];
const dogEarAngles = [135, 225, 45, 315];
const dogEarPos = (c:number,s:number) => {
  const h: Record<string,number> = {};
  h[c < 2 ? "top" : "bottom"] = 0;
  h[c % 2 === 0 ? "left" : "right"] = 0;
  return { ...h, width: s, height: s };
};

// ─── Component ──────────────────────────────────────────────────────────────
interface Props { frames: EnhancedFrameData[] }

export const TicketStub: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ctx = useShowContext();
  const audio = useAudioSnapshot(frames);

  // Master stagger fade
  const masterFade = interpolate(frame, [STAGGER_START, STAGGER_START + 60], [0, 1],
    { ...clampOpts, easing: Easing.out(Easing.cubic) });
  const delayedFrame = frame - STAGGER_START;
  if (delayedFrame < 0) return null;

  const cycleFrame = delayedFrame % CYCLE_FRAMES;
  if (cycleFrame >= ON_FRAMES) return null;

  const fadeIn = interpolate(cycleFrame, [0, FADE_FRAMES], [0, 1],
    { ...clampOpts, easing: Easing.out(Easing.cubic) });
  const fadeOut = interpolate(cycleFrame, [ON_FRAMES - FADE_FRAMES, ON_FRAMES], [1, 0],
    { ...clampOpts, easing: Easing.in(Easing.cubic) });
  const masterOpacity = 0.08 * masterFade * Math.min(fadeIn, fadeOut);
  if (masterOpacity < 0.005) return null;

  // ── Show context ──
  const venue = (ctx?.venueShort ?? "Concert").toUpperCase();
  const venueLoc = ctx?.venueLocation ?? "";
  const date = ctx?.dateShort ?? "";
  const dateLong = ctx?.date ?? "";
  const showBand = ctx?.bandName ?? "Grateful Dead";
  const showSeed = ctx?.showSeed ?? 19770508;
  const era = ctx?.era ?? "70s";

  // ── Seeded deterministic ticket data ──
  const rng = seeded(showSeed + 888);
  const corner = Math.floor(rng() * 4);
  const ticketNum = String(Math.floor(rng() * 90000) + 10000);
  const secLetter = String.fromCharCode(65 + Math.floor(rng() * 8));
  const rowNum = Math.floor(rng() * 30) + 1;
  rng(); // consume seat
  const isGA = rng() > 0.55;
  const prices = ERA_PRICES[era] ?? ERA_PRICES["70s"];
  const price = prices[Math.floor(rng() * prices.length)];
  const showTime = rng() > 0.5 ? "8:00 PM" : "7:30 PM";
  const doorTime = rng() > 0.5 ? "DOORS 6:30" : "DOORS 7:00";
  const serial = `${Math.floor(rng() * 900) + 100}-${ticketNum}`;

  // Coffee stain (seeded position + radius)
  const stainX = 40 + rng() * (TICKET_W - 120);
  const stainY = 20 + rng() * (TICKET_H - 80);
  const stainR = 25 + rng() * 20;

  // Dog-ear
  const deCorner = Math.floor(rng() * 4);
  const deSize = 8 + rng() * 6;

  // Torn edge
  const tornPath = buildTornEdgePath(TICKET_H, seeded(showSeed + 999));

  // ── Positioning ──
  const isRight = corner % 2 === 1, isBottom = corner >= 2;
  const tx = isRight ? width - TICKET_W - MARGIN : MARGIN;
  const ty = isBottom ? height - TICKET_H - MARGIN : MARGIN;
  const baseRot = -2.5 + rng() * 5;

  // ── Audio reactivity ──
  const { energy, beatDecay, chromaHue } = audio;
  const jitterX = Math.sin(frame * 0.07) * 0.4 * (0.3 + energy * 0.7);
  const jitterY = Math.cos(frame * 0.09) * 0.3 * (0.3 + energy * 0.7);
  const rotation = baseRot + Math.sin(frame * 0.05) * 0.3 + beatDecay * 0.4;
  const accentColor = `hsl(${chromaHue}, 45%, 55%)`;
  const accentFaint = `hsla(${chromaHue}, 35%, 50%, ${0.4 + beatDecay * 0.2})`;

  // ── Ink / paper palette ──
  const paperBase = "hsl(38,55%,82%)", paperEdge = "hsl(35,50%,72%)", paperDark = "hsl(32,45%,65%)";
  const ink = "hsl(20,30%,18%)", inkFaded = "hsl(20,25%,30%)", inkLight = "hsl(20,20%,42%)";
  const borderCol = `hsl(20,35%,${28 + beatDecay * 5}%)`;
  const perfCol = "hsl(25,30%,55%)";

  // Shared text styles
  const serif = "'Georgia','Times New Roman',serif";
  const mono = "'Courier New',monospace";

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{
        position: "absolute", left: tx + jitterX, top: ty + jitterY,
        width: TICKET_W, height: TICKET_H, opacity: masterOpacity,
        transform: `rotate(${rotation}deg) scale(${1 + beatDecay * 0.08})`,
        transformOrigin: "center", mixBlendMode: "screen",
        filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
      }}>
        {/* ── Ticket body ── */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 3, overflow: "hidden",
          clipPath: dogEarClips(deSize)[deCorner],
          background: `linear-gradient(135deg,${paperBase} 0%,hsl(36,52%,79%) 25%,${paperBase} 50%,hsl(34,48%,76%) 75%,${paperEdge} 100%)`,
        }}>
          {/* Paper fiber texture */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            background: "repeating-linear-gradient(0deg,transparent,transparent 2px,hsla(30,20%,60%,0.04) 2px,hsla(30,20%,60%,0.04) 3px)" }}/>
          {/* Vertical grain */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            background: "repeating-linear-gradient(90deg,transparent,transparent 4px,hsla(35,15%,55%,0.02) 4px,hsla(35,15%,55%,0.02) 5px)" }}/>
          {/* Yellowed edge vignette */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse at center,transparent 50%,hsla(35,50%,55%,0.12) 85%,hsla(30,45%,45%,0.2) 100%)" }}/>
          {/* Coffee stain watermark */}
          <div style={{
            position: "absolute", left: stainX - stainR, top: stainY - stainR,
            width: stainR * 2, height: stainR * 2, borderRadius: "50%", transform: "rotate(15deg)",
            background: `radial-gradient(ellipse at 45% 45%,hsla(25,60%,35%,0.06) 0%,hsla(25,55%,40%,0.03) 40%,transparent 70%)`,
            boxShadow: `inset 0 0 ${stainR * 0.3}px ${stainR * 0.05}px hsla(25,50%,30%,0.04)`,
            pointerEvents: "none",
          }}/>

          {/* Double border frame */}
          <div style={{ position: "absolute", inset: 3, border: `1.5px solid ${borderCol}`, borderRadius: 2, pointerEvents: "none" }}/>
          <div style={{ position: "absolute", inset: 7, border: `0.5px solid ${inkLight}`, borderRadius: 1, pointerEvents: "none" }}/>

          {/* Corner flourishes */}
          {[{ left: 9, top: 9 }, { right: STUB_W + 9, top: 9 }, { left: 9, bottom: 9 }, { right: STUB_W + 9, bottom: 9 }].map((pos, i) => (
            <div key={i} style={{
              position: "absolute", ...pos, width: 6, height: 6,
              borderTop: i < 2 ? `1px solid ${inkLight}` : "none",
              borderBottom: i >= 2 ? `1px solid ${inkLight}` : "none",
              borderLeft: i % 2 === 0 ? `1px solid ${inkLight}` : "none",
              borderRight: i % 2 === 1 ? `1px solid ${inkLight}` : "none",
            }}/>
          ))}

          {/* Torn perforation edge */}
          <svg width={12} height={TICKET_H} viewBox={`-6 0 12 ${TICKET_H}`}
            style={{ position: "absolute", right: STUB_W - 3, top: 0 }}>
            <path d={tornPath} fill="none" stroke={perfCol} strokeWidth="0.8" strokeDasharray="2,3" opacity={0.6}/>
            {Array.from({ length: 12 }).map((_, i) => (
              <circle key={i} cx={0} cy={6 + i * ((TICKET_H - 12) / 11)} r={1.2} fill={perfCol} opacity={0.35}/>
            ))}
          </svg>

          {/* ── MAIN CONTENT (left of perforation) ── */}
          <div style={{
            position: "absolute", left: 14, top: 12, right: STUB_W + 14, bottom: 12,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            {/* Top: band + venue */}
            <div>
              <div style={{ fontFamily: serif, fontSize: 16, fontWeight: "bold", letterSpacing: 4,
                color: ink, textAlign: "center", lineHeight: 1.1, textTransform: "uppercase",
                textShadow: `0 0 1px ${inkFaded}` }}>
                {showBand.toUpperCase()}
              </div>
              <div style={{ margin: "3px auto", width: "80%", height: 1,
                background: `linear-gradient(90deg,transparent,${inkLight},transparent)` }}/>
              <div style={{ fontFamily: serif, fontSize: 10, letterSpacing: 2, color: inkFaded,
                textAlign: "center", textTransform: "uppercase", lineHeight: 1.2 }}>
                {venue.toUpperCase()}
              </div>
              <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: 1, color: inkLight,
                textAlign: "center", lineHeight: 1.3 }}>
                {venueLoc.toUpperCase()}
              </div>
            </div>

            {/* Middle: date, time, admission */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
              <div>
                <div style={{ fontFamily: serif, fontSize: 11, fontWeight: "bold", color: ink, letterSpacing: 1 }}>
                  {dateLong.toUpperCase()}
                </div>
                <div style={{ fontFamily: mono, fontSize: 8, color: inkLight, letterSpacing: 1 }}>
                  {showTime} &bull; {doorTime}
                </div>
              </div>
              <LightningBolt x={0} y={0} size={10} color={accentColor} opacity={0.5 + beatDecay * 0.3}/>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontSize: 8, fontWeight: "bold", color: ink, letterSpacing: 1.5 }}>
                  {isGA ? "GENERAL ADMISSION" : `SEC ${secLetter} ROW ${rowNum}`}
                </div>
                <div style={{ fontFamily: serif, fontSize: 10, fontWeight: "bold", color: inkFaded, letterSpacing: 0.5 }}>
                  {price}
                </div>
              </div>
            </div>

            {/* Bottom: stealie, fine print, barcode */}
            <div>
              <div style={{ position: "relative", height: 18, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Stealie x={-10} y={-2} size={16} color={accentFaint} opacity={0.6}/>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ fontFamily: mono, fontSize: 5.5, color: inkLight, letterSpacing: 0.8, opacity: 0.7 }}>
                  NO REFUNDS &bull; NO EXCHANGES
                </div>
                <div style={{ position: "relative" }}>
                  <Barcode seed={showSeed} width={55} height={10} color={inkFaded} opacity={0.5}/>
                  <div style={{ fontFamily: mono, fontSize: 5, color: inkLight, textAlign: "center",
                    letterSpacing: 1.5, marginTop: 1, opacity: 0.6 }}>
                    {serial}
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 5.5, color: inkLight, letterSpacing: 0.8,
                  opacity: 0.7, textAlign: "right" }}>
                  NO CAMERAS &bull; NO RECORDING
                </div>
              </div>
            </div>
          </div>

          {/* ── TEAR-OFF STUB (right of perforation) ── */}
          <div style={{
            position: "absolute", right: 0, top: 0, width: STUB_W, height: TICKET_H,
            display: "flex", flexDirection: "column", justifyContent: "center",
            alignItems: "center", padding: "8px 4px",
          }}>
            <div style={{ position: "absolute", inset: "5px 4px 5px 8px",
              border: `0.5px solid ${inkLight}`, borderRadius: 1, opacity: 0.5 }}/>
            <div style={{ fontFamily: serif, fontSize: 7, fontWeight: "bold", color: ink,
              letterSpacing: 2, writingMode: "vertical-rl", textOrientation: "mixed",
              transform: "rotate(180deg)", textAlign: "center", lineHeight: 1.4 }}>
              ADMIT ONE
            </div>
            <div style={{ fontFamily: mono, fontSize: 6, color: inkLight, letterSpacing: 1,
              writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 6, opacity: 0.6 }}>
              #{ticketNum}
            </div>
            <div style={{ fontFamily: mono, fontSize: 5, color: inkLight, writingMode: "vertical-rl",
              transform: "rotate(180deg)", marginTop: 4, opacity: 0.5, letterSpacing: 0.5 }}>
              {date}
            </div>
          </div>

          {/* Dog-ear fold shadow */}
          <div style={{
            position: "absolute", ...(dogEarPos(deCorner, deSize) as React.CSSProperties),
            background: `linear-gradient(${dogEarAngles[deCorner]}deg,${paperDark} 0%,transparent 100%)`,
            opacity: 0.2,
          }}/>
        </div>
      </div>
    </div>
  );
};
