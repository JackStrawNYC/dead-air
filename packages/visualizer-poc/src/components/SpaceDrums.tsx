/**
 * SpaceDrums — A+++ cosmic void portal for Space/Drums percussion exploration.
 *
 * Central black hole portal with pulsing event horizon rim. 3 spiraling accretion
 * disk particle streams being drawn inward. 24 orbiting debris fragments at varied
 * distances. Distant star field backdrop. 3 nebula-like cosmic dust wisps. 8 spectral
 * smear bands radiating outward like sonic ripples from drum hits. Concentric bass
 * drone rings expanding from the void on sub-bass hits. Floating in the void.
 *
 * Audio mapping:
 *   drumBeat     → portal rim pulse brightness + accretion stream speed
 *   drumOnset    → spectral ripple burst + debris orbit kick
 *   bass         → concentric ring expansion + void depth breathing
 *   spaceScore   → void radius growth + star field brightness inversion
 *   chromaHue    → accretion stream color + nebula tint
 *   energy       → overall brightness ceiling (inverted gate: fades at high energy)
 *   slowEnergy   → nebula opacity drift
 *   beatDecay    → rim afterglow decay
 *   dynamicRange → debris orbit eccentricity
 *   tempoFactor  → animation speed scaling
 *
 * Cycle: 85s (2550 frames), 20s (600 frames) visible window.
 * Inverted energy gate: this overlay fades OUT above 0.25 — it belongs in the quiet void.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";
import { seeded } from "../utils/seededRandom";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccretionParticle {
  angle: number;        // starting angle on spiral arm
  radius: number;       // starting orbital radius (0-1 normalized)
  speed: number;        // angular velocity multiplier
  size: number;         // particle radius in px
  brightness: number;   // 0-1 opacity multiplier
  spiralArm: number;    // which arm (0, 1, 2)
  phase: number;        // phase offset for wobble
  decayRate: number;    // how fast it fades near the void
}

interface Debris {
  orbitRadius: number;  // distance from center (px)
  angle: number;        // starting angle
  speed: number;        // angular velocity
  size: number;         // fragment size
  elongation: number;   // aspect ratio for non-circular shapes
  rotation: number;     // self-rotation speed
  rotPhase: number;     // rotation phase offset
  hueShift: number;     // per-debris color variation
  opacity: number;      // base opacity
  eccentricity: number; // orbit eccentricity (0=circle, 0.5=ellipse)
  eccPhase: number;     // eccentricity angle offset
}

interface Star {
  x: number;            // 0-1 screen position
  y: number;            // 0-1 screen position
  size: number;         // star radius
  brightness: number;   // 0-1 base brightness
  twinkleFreq: number;  // twinkle speed
  twinklePhase: number; // phase offset
  hue: number;          // star color hue
}

interface Nebula {
  cx: number;           // center x (0-1)
  cy: number;           // center y (0-1)
  rx: number;           // x-radius
  ry: number;           // y-radius
  hue: number;          // nebula color
  rotation: number;     // degrees
  driftSpeed: number;   // slow drift multiplier
  driftPhase: number;   // drift phase
}

interface BassRing {
  triggerPhase: number; // phase offset for staggered triggers
  maxRadius: number;    // maximum expansion radius
  thickness: number;    // ring stroke width
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NUM_ACCRETION = 45;
const NUM_DEBRIS = 24;
const NUM_STARS = 80;
const NUM_NEBULAE = 3;
const NUM_RIPPLE_BANDS = 8;
const NUM_BASS_RINGS = 5;
const CYCLE = 2550;    // 85s at 30fps
const DURATION = 600;  // 20s visible
const CL = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

/* ------------------------------------------------------------------ */
/*  Seeded generation                                                  */
/* ------------------------------------------------------------------ */

function generateAccretion(seed: number): AccretionParticle[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_ACCRETION }, () => {
    const arm = Math.floor(rng() * 3);
    return {
      angle: rng() * Math.PI * 2,
      radius: 0.15 + rng() * 0.85,
      speed: 0.3 + rng() * 1.2,
      size: 0.8 + rng() * 2.5,
      brightness: 0.3 + rng() * 0.7,
      spiralArm: arm,
      phase: rng() * Math.PI * 2,
      decayRate: 0.5 + rng() * 1.5,
    };
  });
}

function generateDebris(seed: number): Debris[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_DEBRIS }, () => ({
    orbitRadius: 90 + rng() * 320,
    angle: rng() * Math.PI * 2,
    speed: 0.15 + rng() * 0.6,
    size: 1.5 + rng() * 5,
    elongation: 1 + rng() * 2.5,
    rotation: (rng() - 0.5) * 0.04,
    rotPhase: rng() * Math.PI * 2,
    hueShift: (rng() - 0.5) * 40,
    opacity: 0.25 + rng() * 0.5,
    eccentricity: 0.05 + rng() * 0.25,
    eccPhase: rng() * Math.PI * 2,
  }));
}

function generateStars(seed: number): Star[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_STARS }, () => ({
    x: rng(),
    y: rng(),
    size: 0.4 + rng() * 1.8,
    brightness: 0.15 + rng() * 0.6,
    twinkleFreq: 0.01 + rng() * 0.04,
    twinklePhase: rng() * Math.PI * 2,
    hue: rng() < 0.3 ? 200 + rng() * 60 : rng() < 0.6 ? 30 + rng() * 30 : 0,
  }));
}

function generateNebulae(seed: number): Nebula[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_NEBULAE }, () => ({
    cx: 0.15 + rng() * 0.7,
    cy: 0.15 + rng() * 0.7,
    rx: 0.12 + rng() * 0.2,
    ry: 0.08 + rng() * 0.15,
    hue: 220 + rng() * 80,
    rotation: rng() * 360,
    driftSpeed: 0.0003 + rng() * 0.001,
    driftPhase: rng() * Math.PI * 2,
  }));
}

function generateBassRings(seed: number): BassRing[] {
  const rng = seeded(seed);
  return Array.from({ length: NUM_BASS_RINGS }, (_, i) => ({
    triggerPhase: (i / NUM_BASS_RINGS) * Math.PI * 2 + rng() * 0.3,
    maxRadius: 250 + rng() * 200,
    thickness: 1 + rng() * 2,
  }));
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function voidColor(chromaHue: number, spaceScore: number): { h: number; s: number; l: number } {
  const nh = ((chromaHue % 360) + 360) % 360;
  // Map chroma hue to deep void purple-blue range
  let h: number;
  if (nh < 120) h = interpolate(nh, [0, 120], [260, 290], CL);
  else if (nh < 240) h = interpolate(nh, [120, 240], [290, 240], CL);
  else h = interpolate(nh, [240, 360], [240, 260], CL);
  // Space score deepens and desaturates
  const s = interpolate(spaceScore, [0, 0.8], [55, 30], CL);
  const l = interpolate(spaceScore, [0, 0.8], [25, 12], CL);
  return { h, s, l };
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a.toFixed(4)})`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
}

export const SpaceDrums: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  /* ---- Seeded geometry ---- */
  const accretion = React.useMemo(() => generateAccretion(77_001), []);
  const debris = React.useMemo(() => generateDebris(77_002), []);
  const stars = React.useMemo(() => generateStars(77_003), []);
  const nebulae = React.useMemo(() => generateNebulae(77_004), []);
  const bassRings = React.useMemo(() => generateBassRings(77_005), []);

  /* ---- Timing gate ---- */
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;

  // Fade envelope: 10% in, hold, 12% out
  const fadeIn = interpolate(progress, [0, 0.10], [0, 1], {
    ...CL, easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    ...CL, easing: Easing.in(Easing.quad),
  });
  const envelope = Math.min(fadeIn, fadeOut) * 0.85;

  // Inverted energy gate: this belongs in the quiet void
  const energyGate = interpolate(snap.energy, [0.15, 0.28], [1, 0], CL);

  // Low opacity ceiling: max 0.55 (up from 0.4 for richer void)
  const masterOp = Math.min(envelope * energyGate, 0.55);
  if (masterOp < 0.01) return null;

  /* ---- Audio-reactive values ---- */
  const {
    drumBeat, drumOnset, bass, spaceScore, chromaHue,
    slowEnergy, beatDecay, dynamicRange, energy, flatness,
  } = snap;

  const t = frame * tempoFactor;
  const cx = width / 2;
  const cy = height / 2;

  // Void radius: bass + spaceScore driven (50-200px)
  const baseVoidR = interpolate(bass, [0.02, 0.35], [50, 140], CL);
  const spaceVoidBoost = interpolate(spaceScore, [0, 0.8], [0, 60], CL);
  const voidBreath = Math.sin(t * 0.006) * 8 * (1 + bass * 2);
  const voidRadius = (baseVoidR + spaceVoidBoost + voidBreath);

  // Event horizon rim brightness: drumBeat + beatDecay afterglow
  const rimPulse = interpolate(drumBeat, [0, 1], [0.15, 0.9], CL);
  const rimGlow = rimPulse + beatDecay * 0.3;
  const rimWidth = 1.5 + drumBeat * 3 + beatDecay * 1.5;

  // Accretion stream speed boost from drumBeat
  const accretionSpeed = 1 + drumBeat * 2.5 + drumOnset * 1.5;

  // Debris orbit kick from drumOnset
  const debrisKick = 1 + drumOnset * 4;

  // Form scale (entrance animation)
  const formScale = interpolate(progress, [0, 0.12], [0.15, 1], {
    ...CL, easing: Easing.out(Easing.cubic),
  });

  // Color palette
  const vc = voidColor(chromaHue, spaceScore);
  const accretionHue = ((chromaHue + 30) % 360);

  /* ================================================================ */
  /*  Render layers (back to front):                                   */
  /*  1. Star field  2. Nebula wisps  3. Bass drone rings              */
  /*  4. Spectral ripples  5. Accretion streams  6. Debris             */
  /*  7. Void gradient  8. Event horizon rim                           */
  /* ================================================================ */

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: masterOp, pointerEvents: "none" }}
      >
        <defs>
          {/* Central void radial gradient */}
          <radialGradient id="sd-void-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="1" />
            <stop offset="40%" stopColor={hsl(vc.h, vc.s * 0.3, 3)} stopOpacity="0.98" />
            <stop offset="65%" stopColor={hsl(vc.h, vc.s * 0.5, vc.l * 0.4)} stopOpacity="0.7" />
            <stop offset="82%" stopColor={hsl(vc.h, vc.s * 0.4, vc.l * 0.3)} stopOpacity="0.3" />
            <stop offset="100%" stopColor={hsl(vc.h, vc.s * 0.2, vc.l * 0.2)} stopOpacity="0" />
          </radialGradient>

          {/* Event horizon glow gradient */}
          <radialGradient id="sd-horizon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor={hsl(vc.h + 20, 70, 60)} stopOpacity="0" />
            <stop offset="88%" stopColor={hsl(vc.h + 20, 80, 70)} stopOpacity={0.2 * rimGlow} />
            <stop offset="95%" stopColor={hsl(vc.h + 10, 60, 50)} stopOpacity={0.08 * rimGlow} />
            <stop offset="100%" stopColor={hsl(vc.h, 40, 30)} stopOpacity="0" />
          </radialGradient>

          {/* Nebula glow gradients */}
          {nebulae.map((neb, ni) => (
            <radialGradient key={`ng-${ni}`} id={`sd-neb-${ni}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={hsl(neb.hue, 50, 35)} stopOpacity="0.35" />
              <stop offset="40%" stopColor={hsl(neb.hue + 15, 40, 25)} stopOpacity="0.18" />
              <stop offset="70%" stopColor={hsl(neb.hue + 30, 30, 18)} stopOpacity="0.06" />
              <stop offset="100%" stopColor={hsl(neb.hue, 20, 10)} stopOpacity="0" />
            </radialGradient>
          ))}

          {/* Blur filters */}
          <filter id="sd-blur-star"><feGaussianBlur stdDeviation="0.8" /></filter>
          <filter id="sd-blur-neb"><feGaussianBlur stdDeviation="35" /></filter>
          <filter id="sd-blur-ring"><feGaussianBlur stdDeviation="4" /></filter>
          <filter id="sd-blur-ripple"><feGaussianBlur stdDeviation="12" /></filter>
          <filter id="sd-blur-acc"><feGaussianBlur stdDeviation="2" /></filter>
          <filter id="sd-blur-debris"><feGaussianBlur stdDeviation="1" /></filter>
          <filter id="sd-blur-rim"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="sd-blur-void"><feGaussianBlur stdDeviation="15" /></filter>
          <filter id="sd-blur-glow"><feGaussianBlur stdDeviation="20" /></filter>
        </defs>

        {/* ======================== */}
        {/* LAYER 1: Distant star field */}
        {/* ======================== */}
        {stars.map((star, si) => {
          const sx = star.x * width;
          const sy = star.y * height;
          // Distance from center — stars near the void are dimmer (absorbed)
          const dx = sx - cx;
          const dy = sy - cy;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          const voidMask = interpolate(distFromCenter, [voidRadius * 1.5, voidRadius * 3], [0, 1], CL);
          // Twinkle
          const twinkle = 0.5 + 0.5 * Math.sin(t * star.twinkleFreq + star.twinklePhase);
          // Space score inverts star brightness (deeper void = dimmer field)
          const spaceInvert = interpolate(spaceScore, [0, 0.8], [1, 0.4], CL);
          const starOp = star.brightness * twinkle * voidMask * spaceInvert * formScale;
          if (starOp < 0.02) return null;

          const starColor = star.hue === 0
            ? hsla(0, 0, 85 + star.brightness * 15, starOp)
            : hsla(star.hue, 30, 75 + star.brightness * 20, starOp);

          return (
            <circle
              key={`star-${si}`}
              cx={sx}
              cy={sy}
              r={star.size * formScale}
              fill={starColor}
              filter="url(#sd-blur-star)"
            />
          );
        })}

        {/* ======================== */}
        {/* LAYER 2: Cosmic dust / nebula wisps */}
        {/* ======================== */}
        {nebulae.map((neb, ni) => {
          const nebDrift = Math.sin(t * neb.driftSpeed + neb.driftPhase) * 30;
          const nebDriftY = Math.cos(t * neb.driftSpeed * 0.7 + neb.driftPhase * 1.3) * 20;
          const nebX = neb.cx * width + nebDrift;
          const nebY = neb.cy * height + nebDriftY;
          const nebOp = interpolate(slowEnergy, [0.02, 0.2], [0.15, 0.4], CL) * formScale;
          const nebRot = neb.rotation + t * 0.003;

          return (
            <ellipse
              key={`neb-${ni}`}
              cx={nebX}
              cy={nebY}
              rx={neb.rx * width * formScale}
              ry={neb.ry * height * formScale}
              fill={`url(#sd-neb-${ni})`}
              opacity={nebOp}
              transform={`rotate(${nebRot.toFixed(2)}, ${nebX.toFixed(1)}, ${nebY.toFixed(1)})`}
              filter="url(#sd-blur-neb)"
            />
          );
        })}

        {/* ======================== */}
        {/* LAYER 3: Bass drone rings — concentric, expanding from void */}
        {/* ======================== */}
        {bassRings.map((ring, ri) => {
          // Each ring expands on bass hits at staggered phases
          const bassPhase = (t * 0.015 + ring.triggerPhase) % (Math.PI * 2);
          const expansion = Math.max(0, Math.sin(bassPhase));
          const ringRadius = voidRadius * formScale + expansion * ring.maxRadius * bass * 1.5;
          const ringOp = interpolate(expansion, [0.1, 0.5, 1.0], [0.35, 0.2, 0], CL) * bass * 2;
          if (ringOp < 0.01 || ringRadius < voidRadius * formScale * 0.8) return null;

          return (
            <circle
              key={`bass-ring-${ri}`}
              cx={cx}
              cy={cy}
              r={ringRadius}
              fill="none"
              stroke={hsla(vc.h - 10, 45, 35, ringOp)}
              strokeWidth={ring.thickness + bass * 2}
              filter="url(#sd-blur-ring)"
            />
          );
        })}

        {/* ======================== */}
        {/* LAYER 4: Spectral ripple bands — drum onset sonic waves */}
        {/* ======================== */}
        {Array.from({ length: NUM_RIPPLE_BANDS }, (_, ri) => {
          // Ripples expand outward from void on drum onsets, staggered in time
          const ripplePhase = ((t * 0.02 + ri * 0.8) % (Math.PI * 2));
          const rippleExpansion = Math.max(0, Math.sin(ripplePhase));
          const rippleR = voidRadius * formScale * 1.2 + rippleExpansion * (180 + ri * 40);
          const rippleAngle = (ri / NUM_RIPPLE_BANDS) * Math.PI * 2 + t * 0.002;

          // Arc rather than full circle — spectral smear bands radiating outward
          const arcSpan = 0.3 + flatness * 0.4; // wider arcs in tonal passages
          const startAngle = rippleAngle - arcSpan;
          const endAngle = rippleAngle + arcSpan;

          const x1 = cx + Math.cos(startAngle) * rippleR;
          const y1 = cy + Math.sin(startAngle) * rippleR;
          const x2 = cx + Math.cos(endAngle) * rippleR;
          const y2 = cy + Math.sin(endAngle) * rippleR;

          const rippleHue = vc.h + ri * 12;
          const rippleOp = interpolate(rippleExpansion, [0, 0.3, 1], [0, 0.25, 0.05], CL)
            * (0.3 + drumOnset * 2)
            * formScale;
          if (rippleOp < 0.01) return null;

          const largeArc = arcSpan > Math.PI / 2 ? 1 : 0;

          return (
            <path
              key={`ripple-${ri}`}
              d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rippleR.toFixed(1)} ${rippleR.toFixed(1)} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
              fill="none"
              stroke={hsla(rippleHue, 50, 40, rippleOp)}
              strokeWidth={2 + drumOnset * 3}
              strokeLinecap="round"
              filter="url(#sd-blur-ripple)"
            />
          );
        })}

        {/* ======================== */}
        {/* LAYER 5: Accretion disk — 3 spiraling particle streams */}
        {/* ======================== */}
        {accretion.map((p, pi) => {
          const armAngleOffset = (p.spiralArm / 3) * Math.PI * 2;
          // Particles spiral inward over time, reset when they reach the void
          const spiralTime = (t * 0.008 * p.speed * accretionSpeed + p.angle) % (Math.PI * 6);
          const spiralProgress = (spiralTime / (Math.PI * 6)); // 0-1 inward progress

          // Logarithmic spiral: r decreases as angle increases
          const maxR = (voidRadius * 3.5 + p.radius * 200) * formScale;
          const minR = voidRadius * formScale * 0.85;
          const r = maxR - spiralProgress * (maxR - minR);
          if (r < minR) return null;

          // Spiral angle
          const theta = armAngleOffset + spiralTime * 1.2 + p.phase;
          const wobble = Math.sin(t * 0.015 + p.phase * 3) * 5 * (r / maxR);

          const px = cx + (Math.cos(theta) * r) + wobble * Math.cos(theta + Math.PI / 2);
          const py = cy + (Math.sin(theta) * r) + wobble * Math.sin(theta + Math.PI / 2);

          // Brightness increases as particles approach the void (gravitational heating)
          const proximityGlow = interpolate(r, [minR, maxR * 0.5, maxR], [1, 0.5, 0.15], CL);
          const particleOp = p.brightness * proximityGlow * formScale;
          if (particleOp < 0.02) return null;

          // Color shifts from cool outer to hot inner (chromaHue tinted)
          const particleHue = interpolate(r, [minR, maxR], [accretionHue + 40, accretionHue - 20], CL);
          const particleLightness = interpolate(r, [minR, maxR * 0.3, maxR], [75, 50, 25], CL);
          const particleSat = interpolate(r, [minR, maxR], [80, 40], CL);

          return (
            <circle
              key={`acc-${pi}`}
              cx={px}
              cy={py}
              r={p.size * (0.5 + proximityGlow * 0.8) * formScale}
              fill={hsla(particleHue, particleSat, particleLightness, particleOp)}
              filter="url(#sd-blur-acc)"
            />
          );
        })}

        {/* Accretion disk glow bands — 3 arm trails */}
        {[0, 1, 2].map((arm) => {
          const points: string[] = [];
          const armOffset = (arm / 3) * Math.PI * 2;
          const segments = 60;

          for (let s = 0; s < segments; s++) {
            const sp = s / segments;
            const maxR = (voidRadius * 3.2) * formScale;
            const minR = voidRadius * formScale * 1.1;
            const r = maxR - sp * (maxR - minR);
            const theta = armOffset + sp * Math.PI * 3.5 + t * 0.005 * accretionSpeed;
            const x = cx + Math.cos(theta) * r;
            const y = cy + Math.sin(theta) * r;
            points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          }

          const trailHue = accretionHue + arm * 15;
          const trailOp = 0.06 + drumBeat * 0.12;

          return (
            <polyline
              key={`arm-trail-${arm}`}
              points={points.join(" ")}
              fill="none"
              stroke={hsla(trailHue, 60, 45, trailOp)}
              strokeWidth={2 + drumBeat * 2}
              strokeLinecap="round"
              filter="url(#sd-blur-acc)"
            />
          );
        })}

        {/* ======================== */}
        {/* LAYER 6: Orbiting debris fragments */}
        {/* ======================== */}
        {debris.map((d, di) => {
          const orbitSpeed = d.speed * debrisKick * tempoFactor;
          const angle = d.angle + t * 0.004 * orbitSpeed;

          // Elliptical orbit with dynamicRange-modulated eccentricity
          const ecc = d.eccentricity * (1 + dynamicRange * 1.5);
          const eccAngle = angle + d.eccPhase;
          const orbitR = d.orbitRadius * formScale * (1 - ecc * Math.cos(eccAngle));

          // Skip debris that would overlap the void
          if (orbitR < voidRadius * formScale * 1.2) return null;

          const dx = cx + Math.cos(angle) * orbitR;
          const dy = cy + Math.sin(angle) * orbitR;

          // Self-rotation for non-circular shapes
          const selfRot = d.rotPhase + t * d.rotation;

          // Distance-based fading (farther = dimmer)
          const maxOrbit = Math.min(width, height) * 0.45;
          const distFade = orbitR > maxOrbit ? 0 : 1 - (orbitR / maxOrbit) * 0.4;

          // Void-proximity glow: debris closer to the void gets brighter on edges
          const voidProximity = interpolate(
            orbitR, [voidRadius * formScale * 1.2, voidRadius * formScale * 3], [0.3, 0], CL,
          );

          const debrisHue = vc.h + d.hueShift;
          const debrisOp = d.opacity * distFade * formScale;
          if (debrisOp < 0.02) return null;

          // Elongated debris as rotated ellipses
          const debrisW = d.size * formScale;
          const debrisH = d.size * d.elongation * formScale;

          return (
            <g key={`debris-${di}`}>
              {/* Debris fragment */}
              <ellipse
                cx={dx}
                cy={dy}
                rx={debrisW}
                ry={debrisH}
                fill={hsla(debrisHue, 40, 35 + voidProximity * 20, debrisOp)}
                transform={`rotate(${(selfRot * 180 / Math.PI).toFixed(1)}, ${dx.toFixed(1)}, ${dy.toFixed(1)})`}
                filter="url(#sd-blur-debris)"
              />
              {/* Void-proximity rim glow on debris */}
              {voidProximity > 0.05 && (
                <ellipse
                  cx={dx}
                  cy={dy}
                  rx={debrisW * 1.6}
                  ry={debrisH * 1.6}
                  fill="none"
                  stroke={hsla(vc.h + 20, 60, 55, voidProximity * debrisOp * 0.6)}
                  strokeWidth={0.5}
                  transform={`rotate(${(selfRot * 180 / Math.PI).toFixed(1)}, ${dx.toFixed(1)}, ${dy.toFixed(1)})`}
                  filter="url(#sd-blur-debris)"
                />
              )}
            </g>
          );
        })}

        {/* ======================== */}
        {/* LAYER 7: Void gradient — deep black center with atmospheric edge */}
        {/* ======================== */}
        {/* Outer void atmosphere */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * 2.2 * formScale}
          fill="url(#sd-void-grad)"
        />
        {/* Inner absolute black */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale * 0.9}
          fill="#000000"
        />
        {/* Mid-void gradient transition */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale * 1.1}
          fill={hsla(vc.h, vc.s * 0.2, 2, 0.85)}
          filter="url(#sd-blur-void)"
        />

        {/* ======================== */}
        {/* LAYER 8: Event horizon rim — bright ring that pulses with drumBeat */}
        {/* ======================== */}
        {/* Outer rim glow (wide, soft) */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale * 1.15}
          fill="url(#sd-horizon-glow)"
        />
        {/* Primary event horizon ring */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale}
          fill="none"
          stroke={hsla(vc.h + 15, 70, 55 + drumBeat * 25, rimGlow * 0.7)}
          strokeWidth={rimWidth}
          filter="url(#sd-blur-rim)"
        />
        {/* Inner bright edge (sharper) */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale * 0.98}
          fill="none"
          stroke={hsla(vc.h + 25, 50, 70 + drumBeat * 20, rimGlow * 0.4)}
          strokeWidth={rimWidth * 0.4}
        />
        {/* Outer diffuse halo */}
        <circle
          cx={cx}
          cy={cy}
          r={voidRadius * formScale * 1.05}
          fill="none"
          stroke={hsla(vc.h + 5, 55, 40, rimGlow * 0.2)}
          strokeWidth={rimWidth * 2.5}
          filter="url(#sd-blur-glow)"
        />

        {/* Beat-flash: momentary bright pulse on strong drum hits */}
        {drumOnset > 0.4 && (
          <circle
            cx={cx}
            cy={cy}
            r={voidRadius * formScale * 1.02}
            fill="none"
            stroke={hsla(vc.h + 30, 80, 80, drumOnset * 0.5)}
            strokeWidth={1 + drumOnset * 4}
            filter="url(#sd-blur-rim)"
          />
        )}
      </svg>
    </div>
  );
};
