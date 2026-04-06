/**
 * SpinningYinYang — Triple-layered yin-yang symbol with sacred geometry backdrop.
 *
 * The yin-yang appears on countless Dead bootleg covers, taper artwork, and
 * t-shirts — a direct nod to the band's eastern philosophy influence (Garcia's
 * interest in Buddhism, the Acid Tests' Zen undertones, the Egypt '78 trip).
 *
 * Visual composition:
 *   - 3 nested yin-yangs at different scales rotating at different speeds
 *     (background largest/slowest CCW, mid medium CW, foreground smallest/fastest CCW)
 *   - Each yin-yang has: outer stroke ring, classic S-curve division, two
 *     half-domes with bevel gradients, two opposite-color "eye" dots
 *   - Decorative ring of 8 compass-point dots
 *   - Sacred geometry hexagram (Star of David / two triangles) lightly inscribed
 *   - Soft radial halo glow behind the whole assembly
 *
 * Audio reactivity:
 *   - energy: 0..1 saturation crossfade from B&W classic to chromatic psychedelic
 *   - slowEnergy: drives breathing scale (slow drift, ~6s window)
 *   - chromaHue: feeds the "dark" half hue when in chromatic mode
 *   - beatDecay: pulses the 8 compass dots and the central halo glow
 *   - musicalTime: drives the *phase* of rotation so the yin-yangs lock to
 *     the beat grid rather than wall-clock frames
 *   - tempoFactor (TempoContext): scales rotation rate so faster songs spin faster
 *
 * Cycle: 80s repeat, 22s visible window, 18s stagger offset.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE = 2400;          // 80 seconds at 30fps
const DURATION = 660;        // 22 seconds visible
const STAGGER_OFFSET = 540;  // 18s stagger

interface Props {
  frames: EnhancedFrameData[];
}

/* ------------------------------------------------------------------ */
/*  Single yin-yang renderer                                          */
/* ------------------------------------------------------------------ */

interface YinYangProps {
  radius: number;
  rotation: number;
  lightColor: string;
  darkColor: string;
  lightHighlight: string;
  darkHighlight: string;
  strokeColor: string;
  strokeWidth: number;
  glowColor: string;
  glowSize: number;
  opacity: number;
  beatPulse: number;
}

const SingleYinYang: React.FC<YinYangProps> = ({
  radius: r,
  rotation,
  lightColor,
  darkColor,
  lightHighlight,
  darkHighlight,
  strokeColor,
  strokeWidth,
  glowColor,
  glowSize,
  opacity,
  beatPulse,
}) => {
  // Classic yin-yang geometry: a circle of radius r, divided by an S-curve.
  // The S-curve is composed of two semicircles of radius r/2, one bulging
  // upward (top half) and one bulging downward (bottom half).
  //
  // Path for the "dark" (taiji yang) half — it occupies the right side and
  // sweeps through the S-curve via two half-arcs of radius r/2:
  //   M (0, -r)                             — start at top
  //   A r r 0 1 1 (0, r)                    — outer arc CCW down right side to bottom
  //   A r/2 r/2 0 1 1 (0, 0)                — inner small arc CCW up left to center
  //   A r/2 r/2 0 1 0 (0, -r)               — inner small arc CW up left to top
  //   Z
  const halfPath = [
    `M 0 ${-r}`,
    `A ${r} ${r} 0 1 1 0 ${r}`,
    `A ${r / 2} ${r / 2} 0 1 1 0 0`,
    `A ${r / 2} ${r / 2} 0 1 0 0 ${-r}`,
    "Z",
  ].join(" ");

  // Eye dot radii — small circles in each lobe
  const eyeR = r * 0.16;
  const eyeOffset = r * 0.5;

  // Unique IDs for radial gradients (use rotation as a poor-man's hash so
  // multiple instances on screen don't collide)
  const idHash = Math.floor(Math.abs(rotation * 1000)) % 100000;
  const lightGradId = `yyLight-${idHash}`;
  const darkGradId = `yyDark-${idHash}`;
  const haloGradId = `yyHalo-${idHash}`;

  return (
    <g transform={`rotate(${rotation})`} opacity={opacity}>
      <defs>
        {/* Light-half radial gradient (bevel from highlight to base) */}
        <radialGradient id={lightGradId} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={lightHighlight} stopOpacity={1} />
          <stop offset="55%" stopColor={lightColor} stopOpacity={1} />
          <stop offset="100%" stopColor={lightColor} stopOpacity={0.85} />
        </radialGradient>
        {/* Dark-half radial gradient */}
        <radialGradient id={darkGradId} cx="50%" cy="65%" r="75%">
          <stop offset="0%" stopColor={darkHighlight} stopOpacity={1} />
          <stop offset="55%" stopColor={darkColor} stopOpacity={1} />
          <stop offset="100%" stopColor={darkColor} stopOpacity={0.9} />
        </radialGradient>
        {/* Halo radial behind whole symbol */}
        <radialGradient id={haloGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glowColor} stopOpacity={0.55 + beatPulse * 0.35} />
          <stop offset="60%" stopColor={glowColor} stopOpacity={0.12} />
          <stop offset="100%" stopColor={glowColor} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Soft radial halo behind */}
      <circle
        cx={0}
        cy={0}
        r={r * 1.55}
        fill={`url(#${haloGradId})`}
        style={{
          filter: `blur(${glowSize * 0.6}px)`,
        }}
      />

      {/* Light half (occupies left side by default, mirrored half) */}
      <g transform="scale(-1, 1)">
        <path
          d={halfPath}
          fill={`url(#${lightGradId})`}
          stroke={strokeColor}
          strokeWidth={strokeWidth * 0.4}
          strokeLinejoin="round"
        />
      </g>

      {/* Dark half */}
      <path
        d={halfPath}
        fill={`url(#${darkGradId})`}
        stroke={strokeColor}
        strokeWidth={strokeWidth * 0.4}
        strokeLinejoin="round"
      />

      {/* Outer thick stroke ring (the "border" of the symbol) */}
      <circle
        cx={0}
        cy={0}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
        }}
      />

      {/* Subtle inner highlight ring (sheen on the rim) */}
      <circle
        cx={0}
        cy={0}
        r={r * 0.97}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={strokeWidth * 0.25}
      />

      {/* Eye dots — opposite color of the half they sit in */}
      {/* Top eye sits in the dark half → light eye */}
      <circle
        cx={0}
        cy={-eyeOffset}
        r={eyeR}
        fill={lightHighlight}
        stroke={strokeColor}
        strokeWidth={strokeWidth * 0.25}
        style={{
          filter: `drop-shadow(0 0 ${glowSize * 0.5}px ${lightHighlight})`,
        }}
      />
      {/* Inner sparkle in top eye */}
      <circle
        cx={-eyeR * 0.25}
        cy={-eyeOffset - eyeR * 0.25}
        r={eyeR * 0.3}
        fill="rgba(255,255,255,0.9)"
      />

      {/* Bottom eye sits in the light half → dark eye */}
      <circle
        cx={0}
        cy={eyeOffset}
        r={eyeR}
        fill={darkHighlight}
        stroke={strokeColor}
        strokeWidth={strokeWidth * 0.25}
        style={{
          filter: `drop-shadow(0 0 ${glowSize * 0.5}px ${darkHighlight})`,
        }}
      />
      <circle
        cx={eyeR * 0.25}
        cy={eyeOffset - eyeR * 0.25}
        r={eyeR * 0.3}
        fill="rgba(0,0,0,0.6)"
      />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export const SpinningYinYang: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  // Periodic visibility window
  const effectiveFrame = Math.max(0, frame - STAGGER_OFFSET);
  const cycleFrame = effectiveFrame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Smooth fade in/out (long, breath-like)
  const fadeIn = interpolate(progress, [0, 0.14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(progress, [0.86, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibility = Math.min(fadeIn, fadeOut);

  // Energy modulates baseline opacity — but not too aggressively (this is
  // an ambient symbol, not a strobe element)
  const energyOpacity = interpolate(snap.energy, [0.04, 0.28], [0.18, 0.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterOpacity = visibility * energyOpacity;
  if (masterOpacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;
  const baseR = Math.min(width, height) * 0.22;

  // Slow breathing scale driven by slowEnergy (not pulse-y)
  const breatheScale = 1 + (snap.slowEnergy - 0.1) * 0.18;

  // Rotation phase locked to musicalTime so spin sits on the beat grid.
  // Each beat advances musicalTime by 1.0; we multiply to get degrees.
  // Layered speeds — different per layer, scaled by tempoFactor.
  const phaseBase = snap.musicalTime * 4 * tempoFactor;
  const rotationBack = -phaseBase * 1.0;       // CCW slow
  const rotationMid = phaseBase * 1.7;         // CW medium
  const rotationFront = -phaseBase * 2.6;      // CCW fast

  // Color treatment: classic B&W blends with chromatic psychedelic at high E.
  // saturationT = 0 → pure B&W; 1 → full chromatic.
  const saturationT = interpolate(snap.energy, [0.08, 0.32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chromatic palette derived from chromaHue (dominant pitch class)
  const darkHue = snap.chromaHue;
  const lightHue = (snap.chromaHue + 180) % 360; // complementary

  // Classic B&W endpoints
  const classicLight = "hsl(0, 0%, 96%)";
  const classicLightHi = "hsl(0, 0%, 100%)";
  const classicDark = "hsl(0, 0%, 8%)";
  const classicDarkHi = "hsl(0, 0%, 22%)";

  // Chromatic endpoints
  const chromaLightS = 70 + saturationT * 15;
  const chromaDarkS = 75 + saturationT * 15;
  const chromaLight = `hsl(${lightHue}, ${chromaLightS}%, 72%)`;
  const chromaLightHi = `hsl(${lightHue}, ${chromaLightS + 10}%, 86%)`;
  const chromaDark = `hsl(${darkHue}, ${chromaDarkS}%, 22%)`;
  const chromaDarkHi = `hsl(${darkHue}, ${chromaDarkS + 5}%, 38%)`;

  // Crossfade B&W → chromatic via color-mix style: emit two layered colors
  // by interpolating in HSL via simple string selection at low saturationT,
  // and chromatic at high. SVG can't blend strings — pick whichever side
  // dominates and let the radial gradient sell the depth.
  const lightColor = saturationT < 0.5 ? classicLight : chromaLight;
  const lightHighlight = saturationT < 0.5 ? classicLightHi : chromaLightHi;
  const darkColor = saturationT < 0.5 ? classicDark : chromaDark;
  const darkHighlight = saturationT < 0.5 ? classicDarkHi : chromaDarkHi;

  // Stroke color: a warm gold when chromatic, charcoal when B&W
  const strokeColor =
    saturationT < 0.5
      ? "rgba(20, 20, 20, 0.95)"
      : `hsl(${(darkHue + 30) % 360}, 60%, 25%)`;

  // Glow color rides the dominant pitch
  const glowColor =
    saturationT < 0.3
      ? "rgba(255, 240, 200, 0.7)"
      : `hsl(${darkHue}, 95%, 60%)`;

  // Beat pulse modulates the halo and dot brightness
  const beatPulse = snap.beatDecay;

  // Layer alpha — back faintest, front brightest
  const backOpacity = 0.35 + saturationT * 0.15;
  const midOpacity = 0.6 + saturationT * 0.15;
  const frontOpacity = 0.92;

  // Stroke widths scale with radius
  const baseStroke = Math.max(2, baseR * 0.045);

  // Glow intensity scales with energy
  const baseGlow = 6 + snap.energy * 14 + beatPulse * 6;

  // Compass dot ring radius (sits just outside the front yin-yang)
  const dotRingR = baseR * 0.78 * 1.18;
  const dotBaseSize = baseR * 0.022;

  // Hexagram (sacred geometry behind everything) inscribed in a slightly
  // larger radius. Two equilateral triangles, one upright, one inverted.
  const hexR = baseR * 1.42;
  const hexPath1 = [0, 1, 2]
    .map((i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      return `${Math.cos(a) * hexR} ${Math.sin(a) * hexR}`;
    })
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p}`)
    .join(" ") + " Z";
  const hexPath2 = [0, 1, 2]
    .map((i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      return `${Math.cos(a) * hexR} ${Math.sin(a) * hexR}`;
    })
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p}`)
    .join(" ") + " Z";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={width}
        height={height}
        style={{
          opacity: masterOpacity,
          mixBlendMode: "screen",
        }}
      >
        <g transform={`translate(${cx}, ${cy}) scale(${breatheScale})`}>
          {/* ------------------------------------------------------ */}
          {/*  Sacred geometry backdrop — hexagram (Star of David)   */}
          {/* ------------------------------------------------------ */}
          <g
            opacity={0.22 + beatPulse * 0.12}
            style={{ filter: `blur(${0.6 + snap.energy * 1.2}px)` }}
          >
            <path
              d={hexPath1}
              fill="none"
              stroke={glowColor}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            <path
              d={hexPath2}
              fill="none"
              stroke={glowColor}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            {/* Inscribed circle */}
            <circle
              cx={0}
              cy={0}
              r={hexR * 0.95}
              fill="none"
              stroke={glowColor}
              strokeWidth={0.6}
              opacity={0.7}
            />
          </g>

          {/* ------------------------------------------------------ */}
          {/*  Background yin-yang — largest, faintest, slowest CCW  */}
          {/* ------------------------------------------------------ */}
          <SingleYinYang
            radius={baseR * 1.25}
            rotation={rotationBack}
            lightColor={lightColor}
            darkColor={darkColor}
            lightHighlight={lightHighlight}
            darkHighlight={darkHighlight}
            strokeColor={strokeColor}
            strokeWidth={baseStroke * 1.1}
            glowColor={glowColor}
            glowSize={baseGlow * 1.4}
            opacity={backOpacity}
            beatPulse={beatPulse * 0.5}
          />

          {/* ------------------------------------------------------ */}
          {/*  Mid yin-yang — medium scale, medium speed, CW         */}
          {/* ------------------------------------------------------ */}
          <SingleYinYang
            radius={baseR * 0.95}
            rotation={rotationMid}
            lightColor={lightColor}
            darkColor={darkColor}
            lightHighlight={lightHighlight}
            darkHighlight={darkHighlight}
            strokeColor={strokeColor}
            strokeWidth={baseStroke * 1.0}
            glowColor={glowColor}
            glowSize={baseGlow * 1.1}
            opacity={midOpacity}
            beatPulse={beatPulse * 0.75}
          />

          {/* ------------------------------------------------------ */}
          {/*  Foreground yin-yang — smallest, brightest, fastest CCW*/}
          {/* ------------------------------------------------------ */}
          <SingleYinYang
            radius={baseR * 0.62}
            rotation={rotationFront}
            lightColor={lightColor}
            darkColor={darkColor}
            lightHighlight={lightHighlight}
            darkHighlight={darkHighlight}
            strokeColor={strokeColor}
            strokeWidth={baseStroke * 0.85}
            glowColor={glowColor}
            glowSize={baseGlow}
            opacity={frontOpacity}
            beatPulse={beatPulse}
          />

          {/* ------------------------------------------------------ */}
          {/*  8 compass-point dots around the outer ring            */}
          {/* ------------------------------------------------------ */}
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
            // Counter-rotate dots opposite the back layer for parallax feel
            const dotPhase = -rotationBack * (Math.PI / 180);
            const dx = Math.cos(a + dotPhase) * dotRingR;
            const dy = Math.sin(a + dotPhase) * dotRingR;
            // Each dot pulses with a stagger so they ripple around the ring
            const stagger = (i / 8) * Math.PI * 2;
            const dotPulse = 0.5 + 0.5 * Math.sin(snap.musicalTime * Math.PI + stagger);
            const dotSize = dotBaseSize * (1.4 + beatPulse * 1.8 + dotPulse * 0.4);
            const dotOpacity = 0.55 + beatPulse * 0.4 + dotPulse * 0.15;
            return (
              <circle
                key={`dot-${i}`}
                cx={dx}
                cy={dy}
                r={dotSize}
                fill={i % 2 === 0 ? lightHighlight : glowColor}
                opacity={Math.min(1, dotOpacity)}
                style={{
                  filter: `drop-shadow(0 0 ${4 + beatPulse * 8}px ${glowColor})`,
                }}
              />
            );
          })}

          {/* ------------------------------------------------------ */}
          {/*  Central halo — pulses on every beat                    */}
          {/* ------------------------------------------------------ */}
          <circle
            cx={0}
            cy={0}
            r={baseR * 0.08 * (1 + beatPulse * 0.6)}
            fill={glowColor}
            opacity={0.35 + beatPulse * 0.4}
            style={{
              filter: `blur(${4 + beatPulse * 8}px)`,
            }}
          />
        </g>
      </svg>
    </div>
  );
};
