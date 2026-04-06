/**
 * LotScene — A+++ Shakedown Street parking-lot panorama.
 *
 * Sacred ground for Deadheads: the lot before and after the show.
 * 16 varied silhouette figures across a wide panoramic scene:
 *   - Spinner (twirling with flowing skirt/arms)
 *   - Vendor seated at a blanket with wares
 *   - Guitar player (seated, acoustic guitar, strumming arm)
 *   - Dancing couple (arms around each other, swaying)
 *   - Sign holder ("Miracle!")
 *   - Dog (small quadruped trotting)
 *   - Hula hooper (circular motion)
 *   - Standing with arm up (peace sign)
 *   - Walking figures (mid-stride)
 *   - VW bus in background (small, establishing shot)
 *
 * Environment: string of festoon lights overhead (catenary curve with
 * glowing bulbs), ground line with grass tufts, parking-lot texture.
 *
 * Audio reactivity:
 *   - Energy drives activity level (more movement, faster spins)
 *   - BeatDecay for bob/bounce on each figure
 *   - ChromaHue for glow/light color
 *   - TempoFactor for parallax pan speed
 *   - Bass for ground-level pulse
 *
 * Gentle parallax pan: scene drifts slowly sideways, wrapping.
 * Deterministic via mulberry32 PRNG.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useShowContext } from "../data/ShowContext";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type SilhouetteFC = React.FC<{
  height: number;
  color: string;
  t: number;       // normalized time 0-1 (loops)
  energy: number;  // 0-1 audio energy
}>;

/* ================================================================== */
/*  Silhouette SVGs — proper body paths, not stick figures             */
/* ================================================================== */

/** Standing figure with one arm raised in peace sign */
const PeaceSign: SilhouetteFC = ({ height, color, t, energy }) => {
  const armWave = Math.sin(t * Math.PI * 2) * 3 * energy;
  return (
    <svg width={height * 0.38} height={height} viewBox="0 0 38 100" fill={color}>
      <circle cx="19" cy="9" r="8" />
      <path d="M12,18 Q10,17 10,22 L10,45 Q10,50 15,50 L23,50 Q28,50 28,45 L28,22 Q28,17 26,18 Z" />
      {/* Left arm relaxed */}
      <path d="M10,24 Q4,28 3,40 Q2,44 5,44 Q8,43 9,38 L12,28" />
      {/* Right arm raised with peace V */}
      <g transform={`rotate(${-10 + armWave} 26 24)`}>
        <path d="M26,24 Q30,18 31,6 Q31,3 29,3 Q27,4 27,7 L26,18" />
        <path d="M28,8 L32,2 Q33,0 31,0 Q29,1 27,6" />
        <path d="M27,8 L24,2 Q23,0 25,0 Q27,1 28,6" />
      </g>
      {/* Legs */}
      <path d="M14,48 L12,78 Q11,84 14,84 L18,84 Q20,84 19,78 L17,55" />
      <path d="M22,48 L24,78 Q25,84 22,84 L18,84 Q16,84 17,78 L19,55" />
      {/* Feet */}
      <ellipse cx="14" cy="85" rx="5" ry="2.5" />
      <ellipse cx="24" cy="85" rx="5" ry="2.5" />
    </svg>
  );
};

/** Spinner — twirling with flowing skirt and outstretched arms */
const Spinner: SilhouetteFC = ({ height, color, t, energy }) => {
  const spin = t * Math.PI * 4;
  const skirtFlare = 8 + energy * 6;
  const armSwing = Math.sin(spin) * 20;
  return (
    <svg width={height * 0.55} height={height} viewBox="0 0 55 100" fill={color}>
      <circle cx="27" cy="10" r="8" />
      {/* Hair flowing */}
      <path d="M20,6 Q15,2 12,8 Q14,12 19,10" opacity="0.8" />
      {/* Torso */}
      <path d="M20,18 Q18,17 18,22 L19,42 L35,42 L36,22 Q36,17 34,18 Z" />
      {/* Left arm outstretched */}
      <g transform={`rotate(${-50 + armSwing} 20 24)`}>
        <path d="M20,24 L6,30 Q3,31 4,34 Q5,36 8,35 L20,28" />
      </g>
      {/* Right arm outstretched */}
      <g transform={`rotate(${50 - armSwing} 34 24)`}>
        <path d="M34,24 L48,30 Q51,31 50,34 Q49,36 46,35 L34,28" />
      </g>
      {/* Flowing skirt — bell shape that flares with energy */}
      <path d={`M19,42 Q${27 - skirtFlare},90 ${27 - skirtFlare - 2},92 L${27 + skirtFlare + 2},92 Q${27 + skirtFlare},90 35,42 Z`} />
      {/* Skirt fabric folds */}
      <path d={`M24,42 Q22,70 ${22 - skirtFlare * 0.3},90`} stroke={color} strokeWidth="1.5" fill="none" opacity="0.3" />
      <path d={`M30,42 Q32,70 ${32 + skirtFlare * 0.3},90`} stroke={color} strokeWidth="1.5" fill="none" opacity="0.3" />
      {/* Feet peeking under skirt */}
      <ellipse cx={27 - skirtFlare * 0.2} cy="93" rx="4" ry="2" />
      <ellipse cx={27 + skirtFlare * 0.2} cy="93" rx="4" ry="2" />
    </svg>
  );
};

/** Vendor seated on ground with blanket of wares */
const Vendor: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.75} height={height} viewBox="0 0 75 100" fill={color}>
    {/* Hat (wide-brimmed) */}
    <ellipse cx="22" cy="18" rx="14" ry="3.5" />
    <path d="M14,18 Q14,8 22,8 Q30,8 30,18" />
    {/* Head */}
    <circle cx="22" cy="24" r="8" />
    {/* Torso (seated, leaning slightly forward) */}
    <path d="M14,32 L13,55 L31,55 L30,32 Q30,30 22,30 Q14,30 14,32 Z" />
    {/* Left arm reaching toward wares */}
    <path d="M14,36 Q8,42 10,52 Q11,55 14,53 L16,44" />
    {/* Right arm resting on knee */}
    <path d="M30,36 Q34,42 33,50 Q32,53 30,51 L29,44" />
    {/* Legs crossed */}
    <path d="M14,53 Q10,60 8,66 Q6,70 10,70 Q16,70 20,62 L22,55" />
    <path d="M30,53 Q34,60 36,66 Q38,70 34,70 Q28,70 24,62 L22,55" />
    {/* Blanket */}
    <rect x="38" y="62" width="34" height="20" rx="2" opacity="0.6" />
    {/* Wares on blanket — small items */}
    <circle cx="45" cy="60" r="3" opacity="0.5" />
    <rect x="50" y="58" width="5" height="6" rx="1" opacity="0.5" />
    <circle cx="60" cy="60" r="2.5" opacity="0.5" />
    <rect x="64" y="58" width="4" height="5" rx="1" opacity="0.5" />
    <circle cx="48" cy="56" r="2" opacity="0.4" />
    <rect x="55" y="55" width="6" height="4" rx="1" opacity="0.4" />
  </svg>
);

/** Guitar player seated with acoustic guitar, strumming */
const GuitarPlayer: SilhouetteFC = ({ height, color, t, energy }) => {
  const strum = Math.sin(t * Math.PI * 12) * 2 * (0.3 + energy * 0.7);
  return (
    <svg width={height * 0.6} height={height} viewBox="0 0 60 100" fill={color}>
      {/* Head */}
      <circle cx="22" cy="18" r="8" />
      {/* Hair */}
      <path d="M15,14 Q14,8 20,6 Q26,5 28,10 Q30,14 28,18" opacity="0.8" />
      {/* Torso (seated, slightly hunched over guitar) */}
      <path d="M14,26 Q12,28 13,50 L31,50 Q32,28 30,26 Q26,24 22,24 Q18,24 14,26 Z" />
      {/* Left arm on neck (fretting) */}
      <path d="M14,32 Q8,34 6,38 Q4,40 6,42 L14,42 Q14,38 14,36" />
      {/* Right arm strumming */}
      <g transform={`rotate(${strum} 30 36)`}>
        <path d="M30,32 Q36,38 38,46 Q39,48 36,48 Q34,47 33,44 L30,38" />
      </g>
      {/* Guitar body */}
      <ellipse cx="36" cy="50" rx="12" ry="16" opacity="0.7" />
      <ellipse cx="36" cy="48" rx="8" ry="10" opacity="0.5" />
      {/* Guitar neck */}
      <rect x="4" y="38" width="30" height="3" rx="1" opacity="0.6" transform="rotate(-8 19 39)" />
      {/* Sound hole */}
      <circle cx="36" cy="48" r="3" opacity="0.3" />
      {/* Legs */}
      <path d="M15,48 Q10,58 8,68 Q6,72 10,72 Q16,72 18,64 L20,52" />
      <path d="M28,48 Q32,58 34,64 Q35,68 32,68 Q28,66 26,60 L24,52" />
      {/* Feet */}
      <ellipse cx="9" cy="73" rx="5" ry="2.5" />
      <ellipse cx="33" cy="69" rx="5" ry="2.5" />
    </svg>
  );
};

/** Dancing couple — arms around each other, swaying */
const DancingCouple: SilhouetteFC = ({ height, color, t, energy }) => {
  const sway = Math.sin(t * Math.PI * 2) * 4 * (0.4 + energy * 0.6);
  return (
    <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
      <g transform={`rotate(${sway} 25 90)`}>
        {/* Person 1 (left) — slightly taller */}
        <circle cx="17" cy="10" r="7" />
        <path d="M10,17 Q9,20 10,40 L24,40 Q25,20 24,17 Q20,15 17,15 Q14,15 10,17 Z" />
        {/* Person 1 left arm free */}
        <path d="M10,22 Q4,28 3,36 Q2,39 5,38 Q7,37 8,34 L11,26" />
        {/* Person 1 right arm around person 2 */}
        <path d="M24,22 Q28,24 32,24 Q34,25 34,28 L30,28 Q26,28 24,26" opacity="0.85" />

        {/* Person 2 (right) — slightly shorter */}
        <circle cx="33" cy="12" r="6.5" />
        {/* Long hair */}
        <path d="M28,8 Q26,4 30,2 Q36,2 38,8 Q40,14 38,20 Q36,18 35,14" opacity="0.7" />
        <path d="M26,17 Q25,20 26,40 L38,40 Q39,20 38,17 Q35,15 33,15 Q30,15 26,17 Z" />
        {/* Person 2 left arm around person 1 */}
        <path d="M26,22 Q22,24 18,24 Q16,25 16,28 L20,28 Q24,28 26,26" opacity="0.85" />
        {/* Person 2 right arm free */}
        <path d="M38,22 Q44,28 45,36 Q46,39 43,38 Q41,37 40,34 L38,26" />

        {/* Legs — person 1 */}
        <path d="M12,38 L10,70 Q9,76 13,76 L16,76 Q18,76 17,70 L16,45" />
        <path d="M20,38 L21,70 Q22,76 19,76 L18,76" />
        {/* Legs — person 2 */}
        <path d="M28,38 L27,70 Q26,76 29,76 L30,76" />
        <path d="M36,38 L38,70 Q39,76 35,76 L32,76 Q30,76 31,70 L32,45" />
        {/* Feet */}
        <ellipse cx="12" cy="77" rx="4.5" ry="2" />
        <ellipse cx="20" cy="77" rx="4.5" ry="2" />
        <ellipse cx="28" cy="77" rx="4.5" ry="2" />
        <ellipse cx="37" cy="77" rx="4.5" ry="2" />
      </g>
    </svg>
  );
};

/** Sign holder — "MIRACLE" sign held overhead */
const SignHolder: SilhouetteFC = ({ height, color, t, energy }) => {
  const signBob = Math.sin(t * Math.PI * 3) * 2 * energy;
  return (
    <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
      {/* Sign */}
      <g transform={`translate(0, ${signBob})`}>
        <rect x="10" y="0" width="32" height="16" rx="2" opacity="0.85" />
        {/* Sign stick */}
        <rect x="24" y="14" width="3" height="20" rx="1" opacity="0.7" />
      </g>
      {/* Head */}
      <circle cx="25" cy="28" r="7.5" />
      {/* Torso */}
      <path d="M18,35 Q16,37 17,58 L33,58 Q34,37 32,35 Q28,33 25,33 Q22,33 18,35 Z" />
      {/* Left arm up holding sign */}
      <g transform={`translate(0, ${signBob * 0.5})`}>
        <path d="M18,38 Q14,32 14,24 Q13,20 16,20 Q18,21 18,24 L19,34" />
      </g>
      {/* Right arm up holding sign */}
      <g transform={`translate(0, ${signBob * 0.5})`}>
        <path d="M32,38 Q36,32 36,24 Q37,20 34,20 Q32,21 32,24 L31,34" />
      </g>
      {/* Legs */}
      <path d="M19,56 L17,80 Q16,86 20,86 L23,86 Q25,86 24,80 L22,60" />
      <path d="M29,56 L31,80 Q32,86 28,86 L25,86 Q23,86 24,80 L26,60" />
      <ellipse cx="18" cy="87" rx="5" ry="2.5" />
      <ellipse cx="30" cy="87" rx="5" ry="2.5" />
    </svg>
  );
};

/** Dog — small quadruped trotting along */
const Dog: SilhouetteFC = ({ height, color, t, energy }) => {
  const h = height * 0.45;
  const trot = Math.sin(t * Math.PI * 6) * 4 * (0.3 + energy * 0.5);
  const tailWag = Math.sin(t * Math.PI * 8) * 15;
  return (
    <svg width={h * 1.6} height={h} viewBox="0 0 80 50" fill={color}>
      {/* Body */}
      <ellipse cx="38" cy="24" rx="24" ry="11" />
      {/* Chest (slightly wider) */}
      <ellipse cx="52" cy="26" rx="10" ry="12" />
      {/* Head */}
      <circle cx="62" cy="16" r="8" />
      {/* Snout */}
      <ellipse cx="70" cy="18" rx="5" ry="3.5" />
      <circle cx="72" cy="17" r="1.5" opacity="0.4" /> {/* nose */}
      {/* Ears (floppy) */}
      <path d="M57,10 Q54,4 52,8 Q53,12 56,12" />
      <path d="M65,10 Q67,4 69,8 Q68,12 65,12" />
      {/* Tail */}
      <g transform={`rotate(${tailWag} 16 22)`}>
        <path d="M16,22 Q8,14 6,8 Q5,5 8,6 Q10,8 12,14 L15,20" />
      </g>
      {/* Front legs (trotting) */}
      <g transform={`rotate(${trot} 50 34)`}>
        <rect x="48" y="33" width="4" height="14" rx="2" />
      </g>
      <g transform={`rotate(${-trot} 56 34)`}>
        <rect x="54" y="33" width="4" height="14" rx="2" />
      </g>
      {/* Back legs (trotting) */}
      <g transform={`rotate(${-trot} 30 34)`}>
        <rect x="28" y="33" width="4" height="14" rx="2" />
      </g>
      <g transform={`rotate(${trot} 36 34)`}>
        <rect x="34" y="33" width="4" height="14" rx="2" />
      </g>
    </svg>
  );
};

/** Hula hooper — circular hoop orbiting torso */
const HulaHooper: SilhouetteFC = ({ height, color, t, energy }) => {
  const hoopAngle = t * Math.PI * 6;
  const hoopY = 38 + Math.sin(hoopAngle) * 2;
  const hoopRx = 18 + Math.cos(hoopAngle) * 4;
  const hoopRy = 3 + Math.abs(Math.sin(hoopAngle)) * 5;
  const hipSway = Math.sin(hoopAngle) * 3 * (0.5 + energy * 0.5);
  return (
    <svg width={height * 0.5} height={height} viewBox="0 0 50 100" fill={color}>
      {/* Head */}
      <circle cx="25" cy="10" r="7.5" />
      {/* Hair (tied up) */}
      <path d="M20,5 Q18,0 22,0 Q28,0 30,5" opacity="0.7" />
      <circle cx="25" cy="3" r="3" opacity="0.6" />
      {/* Torso with slight hip sway */}
      <g transform={`translate(${hipSway}, 0)`}>
        <path d="M18,18 Q16,20 17,46 L33,46 Q34,20 32,18 Q28,16 25,16 Q22,16 18,18 Z" />
        {/* Arms out slightly for balance */}
        <path d="M18,22 Q10,26 6,32 Q4,35 7,36 Q9,35 10,33 L16,26" />
        <path d="M32,22 Q40,26 44,32 Q46,35 43,36 Q41,35 40,33 L34,26" />
        {/* Hula hoop */}
        <ellipse cx="25" cy={hoopY} rx={hoopRx} ry={hoopRy}
          fill="none" stroke={color} strokeWidth="2.5" opacity="0.8" />
      </g>
      {/* Legs (slightly apart for balance) */}
      <path d="M19,44 L16,74 Q15,80 19,80 L22,80 Q24,80 23,74 L21,50" />
      <path d="M29,44 L32,74 Q33,80 29,80 L26,80 Q24,80 25,74 L27,50" />
      <ellipse cx="17" cy="81" rx="5" ry="2.5" />
      <ellipse cx="31" cy="81" rx="5" ry="2.5" />
    </svg>
  );
};

/** Walking figure — mid-stride with natural arm swing */
const Walker: SilhouetteFC = ({ height, color, t, energy }) => {
  const stride = Math.sin(t * Math.PI * 4) * 12 * (0.4 + energy * 0.4);
  const armSwing = Math.sin(t * Math.PI * 4) * 15;
  return (
    <svg width={height * 0.4} height={height} viewBox="0 0 40 100" fill={color}>
      {/* Head */}
      <circle cx="20" cy="10" r="7.5" />
      {/* Torso */}
      <path d="M13,18 Q12,20 13,48 L27,48 Q28,20 27,18 Q24,16 20,16 Q16,16 13,18 Z" />
      {/* Arms swinging (opposite to legs) */}
      <g transform={`rotate(${-armSwing} 14 22)`}>
        <path d="M14,22 Q8,30 6,40 Q5,43 8,42 Q10,41 10,38 L13,28" />
      </g>
      <g transform={`rotate(${armSwing} 26 22)`}>
        <path d="M26,22 Q32,30 34,40 Q35,43 32,42 Q30,41 30,38 L27,28" />
      </g>
      {/* Legs striding */}
      <g transform={`rotate(${stride} 18 46)`}>
        <path d="M16,46 L14,74 Q13,80 17,80 L19,80 Q21,80 20,74 L18,52" />
        <ellipse cx="15" cy="81" rx="5" ry="2.5" />
      </g>
      <g transform={`rotate(${-stride} 22 46)`}>
        <path d="M22,46 L24,74 Q25,80 21,80 L19,80 Q17,80 18,74 L20,52" />
        <ellipse cx="23" cy="81" rx="5" ry="2.5" />
      </g>
    </svg>
  );
};

/** Standing figure with hands in pockets — casual */
const StandingCasual: SilhouetteFC = ({ height, color }) => (
  <svg width={height * 0.36} height={height} viewBox="0 0 36 100" fill={color}>
    {/* Head */}
    <circle cx="18" cy="10" r="7.5" />
    {/* Beanie */}
    <path d="M11,8 Q11,2 18,2 Q25,2 25,8" />
    <rect x="10" y="6" width="16" height="3" rx="1" />
    {/* Torso */}
    <path d="M11,18 Q10,20 11,50 L25,50 Q26,20 25,18 Q22,16 18,16 Q14,16 11,18 Z" />
    {/* Arms — hands in pockets */}
    <path d="M11,24 Q6,30 7,40 Q8,44 11,42 L12,34" />
    <path d="M25,24 Q30,30 29,40 Q28,44 25,42 L24,34" />
    {/* Pockets (slight indent at hips) */}
    <path d="M11,40 Q9,42 11,44" fill="none" stroke={color} strokeWidth="1" />
    <path d="M25,40 Q27,42 25,44" fill="none" stroke={color} strokeWidth="1" />
    {/* Legs */}
    <path d="M13,48 L12,78 Q11,84 15,84 L18,84 Q20,84 19,78 L17,54" />
    <path d="M23,48 L24,78 Q25,84 21,84 L18,84 Q16,84 17,78 L19,54" />
    <ellipse cx="13" cy="85" rx="5" ry="2.5" />
    <ellipse cx="23" cy="85" rx="5" ry="2.5" />
  </svg>
);

/** Standing dancing figure — grooving with whole body */
const Groover: SilhouetteFC = ({ height, color, t, energy }) => {
  const groove = Math.sin(t * Math.PI * 4) * 5 * (0.3 + energy * 0.7);
  const armPump = Math.sin(t * Math.PI * 4 + 1) * 10;
  return (
    <svg width={height * 0.42} height={height} viewBox="0 0 42 100" fill={color}>
      <g transform={`translate(${groove * 0.3}, 0)`}>
        {/* Head */}
        <circle cx="21" cy="10" r="7.5" />
        {/* Torso with groove lean */}
        <path d="M14,18 Q12,20 13,48 L29,48 Q30,20 28,18 Q24,16 21,16 Q18,16 14,18 Z" />
        {/* Left arm pumping */}
        <g transform={`rotate(${-30 + armPump} 14 24)`}>
          <path d="M14,24 Q8,28 6,36 Q5,39 8,38 Q10,37 10,34 L13,28" />
        </g>
        {/* Right arm up */}
        <g transform={`rotate(${-40 - armPump * 0.5} 28 24)`}>
          <path d="M28,24 Q34,20 36,14 Q37,11 34,12 Q32,13 32,16 L29,22" />
        </g>
      </g>
      {/* Legs (slight bounce) */}
      <path d="M15,46 L14,76 Q13,82 17,82 L19,82 Q21,82 20,76 L18,52" />
      <path d="M25,46 L26,76 Q27,82 23,82 L21,82 Q19,82 20,76 L22,52" />
      <ellipse cx="15" cy="83" rx="5" ry="2.5" />
      <ellipse cx="25" cy="83" rx="5" ry="2.5" />
    </svg>
  );
};

/** VW Bus — small background establishing shot */
const VWBus: SilhouetteFC = ({ height, color }) => {
  const w = height * 1.6;
  return (
    <svg width={w} height={height} viewBox="0 0 160 100" fill={color}>
      {/* Body */}
      <path d="M10,45 L10,85 Q10,90 15,90 L145,90 Q150,90 150,85 L150,45 Q150,25 130,25 L110,25 Q100,25 95,35 L90,45 Z" opacity="0.7" />
      {/* Roof rack */}
      <rect x="30" y="20" width="95" height="6" rx="2" opacity="0.5" />
      {/* Windows */}
      <rect x="100" y="32" width="38" height="22" rx="4" opacity="0.3" />
      <rect x="55" y="48" width="30" height="18" rx="3" opacity="0.3" />
      <rect x="18" y="48" width="30" height="18" rx="3" opacity="0.3" />
      {/* VW emblem circle */}
      <circle cx="80" cy="55" r="8" opacity="0.4" />
      {/* Headlight */}
      <circle cx="148" cy="60" r="5" opacity="0.4" />
      {/* Bumper */}
      <rect x="8" y="86" width="144" height="4" rx="2" opacity="0.5" />
      {/* Wheels */}
      <circle cx="35" cy="90" r="10" opacity="0.8" />
      <circle cx="35" cy="90" r="5" opacity="0.4" />
      <circle cx="125" cy="90" r="10" opacity="0.8" />
      <circle cx="125" cy="90" r="5" opacity="0.4" />
      {/* Peace sign bumper sticker */}
      <circle cx="60" cy="88" r="3" opacity="0.3" fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
};

/* ================================================================== */
/*  Figure registry                                                    */
/* ================================================================== */

const SILHOUETTES: SilhouetteFC[] = [
  PeaceSign, Spinner, Vendor, GuitarPlayer, DancingCouple,
  SignHolder, Dog, HulaHooper, Walker, StandingCasual,
  Groover, Walker,
];

/* ================================================================== */
/*  Figure layout config                                               */
/* ================================================================== */

interface FigureConfig {
  silhouetteIdx: number;
  xPosition: number;   // 0-1 across scene width
  height: number;       // px
  swayPhase: number;
  swayAmount: number;
  bobPhase: number;
  timeOffset: number;   // offsets the animation cycle
  depthScale: number;   // 0.7-1.0, smaller = further back
  yOffset: number;      // bottom offset for depth layering
}

function generateFigures(masterSeed: number): FigureConfig[] {
  const rng = seeded(masterSeed);
  const figures: FigureConfig[] = [];
  const count = 16;

  for (let i = 0; i < count; i++) {
    const depth = rng();
    const depthScale = 0.7 + depth * 0.3;
    figures.push({
      silhouetteIdx: Math.floor(rng() * SILHOUETTES.length),
      xPosition: (i / count) + (rng() - 0.5) * 0.035,
      height: 50 + Math.floor(rng() * 40),
      swayPhase: rng() * Math.PI * 2,
      swayAmount: 1.5 + rng() * 3.5,
      bobPhase: rng() * Math.PI * 2,
      timeOffset: rng() * Math.PI * 2,
      depthScale,
      yOffset: (1 - depth) * 12, // further back = higher up
    });
  }

  return figures;
}

/* ================================================================== */
/*  Festoon lights — catenary curve with glowing bulbs                 */
/* ================================================================== */

interface BulbConfig {
  x: number;
  y: number;
  size: number;
  hueOffset: number;
}

function generateFestoonLights(
  sceneWidth: number,
  masterSeed: number,
): { catenaryPath: string; bulbs: BulbConfig[] } {
  const rng = seeded(masterSeed + 7777);
  const numStrings = 3;
  const bulbs: BulbConfig[] = [];
  let catenaryPath = "";

  for (let s = 0; s < numStrings; s++) {
    const startX = s * (sceneWidth / numStrings) + rng() * 60;
    const endX = startX + sceneWidth / numStrings + rng() * 40;
    const sagY = 35 + rng() * 20; // how far down the catenary sags
    const topY = 10 + s * 8;
    const midX = (startX + endX) / 2;
    const midY = topY + sagY;

    catenaryPath += `M${startX},${topY} Q${midX},${midY} ${endX},${topY} `;

    // Place bulbs along the catenary
    const bulbCount = 6 + Math.floor(rng() * 4);
    for (let b = 0; b < bulbCount; b++) {
      const t = (b + 0.5) / bulbCount;
      // Quadratic bezier point
      const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
      const by = (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * midY + t * t * topY;
      bulbs.push({
        x: bx,
        y: by,
        size: 2 + rng() * 2,
        hueOffset: rng() * 120,
      });
    }
  }

  return { catenaryPath, bulbs };
}

/* ================================================================== */
/*  Grass tufts for ground line                                        */
/* ================================================================== */

function generateGrassTufts(sceneWidth: number, seed: number): Array<{ x: number; h: number; lean: number }> {
  const rng = seeded(seed + 3333);
  const tufts: Array<{ x: number; h: number; lean: number }> = [];
  const count = Math.floor(sceneWidth / 18);
  for (let i = 0; i < count; i++) {
    tufts.push({
      x: (i / count) * sceneWidth + (rng() - 0.5) * 12,
      h: 4 + rng() * 8,
      lean: (rng() - 0.5) * 6,
    });
  }
  return tufts;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

interface Props {
  frames: EnhancedFrameData[];
}

export const LotScene: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const ctx = useShowContext();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const masterSeed = ctx?.showSeed ?? 19770508;

  // -- Audio signals --
  const energy = audio.energy;
  const beatDecay = audio.beatDecay;
  const chromaHue = audio.chromaHue;
  const bass = audio.bass;

  // -- Visibility: show during low-to-mid energy (lot scene = chill vibe) --
  const visibilityFade = interpolate(energy, [0.04, 0.10, 0.30, 0.42], [0, 1, 1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const startFade = interpolate(frame, [0, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const opacity = visibilityFade * startFade * 0.75;
  if (opacity < 0.02) return null;

  // -- Layout --
  const sceneWidth = width * 2.2;
  const figures = React.useMemo(() => generateFigures(masterSeed), [masterSeed]);
  const festoon = React.useMemo(() => generateFestoonLights(sceneWidth, masterSeed), [sceneWidth, masterSeed]);
  const grassTufts = React.useMemo(() => generateGrassTufts(sceneWidth, masterSeed), [sceneWidth, masterSeed]);

  // -- Parallax pan: slow drift, tempo-scaled --
  const panSpeed = 0.015 * tempoFactor;
  const panProgress = ((frame * panSpeed) / durationInFrames) % 1;
  const panOffset = interpolate(panProgress, [0, 1], [0, -(sceneWidth - width)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // -- Sway intensity driven by energy --
  const swayMult = interpolate(energy, [0.05, 0.35], [0.3, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // -- Glow/light colors from chromaHue --
  const glowHue = chromaHue;
  const glowColor = `hsla(${glowHue}, 90%, 65%, ${0.5 + beatDecay * 0.3})`;
  const glowColorDim = `hsla(${glowHue}, 70%, 40%, ${0.3 + beatDecay * 0.2})`;
  const warmGlow = `hsla(${(glowHue + 30) % 360}, 80%, 55%, ${0.4 + beatDecay * 0.2})`;

  // -- Normalized time for animation loops --
  const tBase = (frame % 300) / 300;

  // -- Ground-level bass pulse --
  const groundPulse = 0.3 + bass * 0.4;

  // -- VW bus position (further back, slowly drifting) --
  const busX = sceneWidth * 0.72;
  const busScale = 0.35;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: sceneWidth,
          height: 160,
          transform: `translateX(${panOffset}px)`,
          opacity,
          willChange: "transform, opacity",
        }}
      >
        {/* ---- Festoon lights overhead ---- */}
        <svg
          width={sceneWidth}
          height={80}
          viewBox={`0 0 ${sceneWidth} 80`}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          {/* Catenary wire */}
          <path
            d={festoon.catenaryPath}
            fill="none"
            stroke={glowColorDim}
            strokeWidth="1.2"
            opacity={0.5 + beatDecay * 0.2}
          />
          {/* Glowing bulbs */}
          {festoon.bulbs.map((bulb, i) => {
            const bulbHue = (glowHue + bulb.hueOffset) % 360;
            const flicker = 0.6 + Math.sin(frame * 0.08 + i * 1.7) * 0.2 + beatDecay * 0.2;
            return (
              <g key={`bulb-${i}`}>
                {/* Outer glow */}
                <circle
                  cx={bulb.x}
                  cy={bulb.y}
                  r={bulb.size * 3}
                  fill={`hsla(${bulbHue}, 80%, 70%, ${flicker * 0.15})`}
                />
                {/* Inner glow */}
                <circle
                  cx={bulb.x}
                  cy={bulb.y}
                  r={bulb.size * 1.5}
                  fill={`hsla(${bulbHue}, 85%, 75%, ${flicker * 0.35})`}
                />
                {/* Bulb core */}
                <circle
                  cx={bulb.x}
                  cy={bulb.y}
                  r={bulb.size}
                  fill={`hsla(${bulbHue}, 90%, 85%, ${flicker * 0.7})`}
                />
              </g>
            );
          })}
        </svg>

        {/* ---- VW Bus in background ---- */}
        <div
          style={{
            position: "absolute",
            left: busX,
            bottom: 18,
            transform: `scale(${busScale})`,
            transformOrigin: "bottom center",
            opacity: 0.45,
            filter: `drop-shadow(0 0 4px ${glowColorDim})`,
          }}
        >
          <VWBus height={100} color="rgba(25, 20, 35, 0.75)" t={0} energy={0} />
        </div>

        {/* ---- Figures ---- */}
        {figures.map((fig, i) => {
          const Silhouette = SILHOUETTES[fig.silhouetteIdx];
          const x = fig.xPosition * sceneWidth;
          const scaledHeight = fig.height * fig.depthScale;

          // Per-figure animation time (offset so they don't sync)
          const tFig = ((frame % 300) / 300 + fig.timeOffset / (Math.PI * 2)) % 1;

          // Sway: gentle rotation
          const swayAngle =
            Math.sin(frame * 0.04 + fig.swayPhase) *
            fig.swayAmount * swayMult;

          // Beat-driven bob (vertical bounce)
          const bobAmount = interpolate(beatDecay, [0, 1], [0, -4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const bobY = bobAmount * Math.sin(fig.bobPhase + frame * 0.1);

          // Depth-based opacity (further back = more transparent)
          const depthOpacity = 0.65 + fig.depthScale * 0.35;

          // Individual glow hue offset for variety
          const figGlowHue = (glowHue + i * 25) % 360;
          const figGlow = `hsla(${figGlowHue}, 80%, 50%, ${0.4 + beatDecay * 0.3})`;
          const figGlowOuter = `hsla(${figGlowHue}, 70%, 40%, ${0.2 + beatDecay * 0.15})`;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                bottom: 8 + fig.yOffset,
                transformOrigin: "bottom center",
                transform: `rotate(${swayAngle}deg) translateY(${bobY}px) scale(${fig.depthScale})`,
                filter: `drop-shadow(0 0 2px ${figGlowOuter}) drop-shadow(0 0 5px ${figGlow})`,
                opacity: depthOpacity,
                willChange: "transform",
              }}
            >
              <Silhouette
                height={scaledHeight}
                color="rgba(18, 14, 28, 0.88)"
                t={tFig}
                energy={energy}
              />
            </div>
          );
        })}

        {/* ---- Ground line: parking lot / grass ---- */}
        <svg
          width={sceneWidth}
          height={30}
          viewBox={`0 0 ${sceneWidth} 30`}
          style={{ position: "absolute", bottom: 0, left: 0 }}
        >
          {/* Asphalt/ground gradient */}
          <defs>
            <linearGradient id="lot-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsla(${glowHue}, 20%, 15%, ${groundPulse})`} />
              <stop offset="100%" stopColor={`hsla(${glowHue}, 15%, 8%, ${groundPulse * 0.6})`} />
            </linearGradient>
          </defs>
          <rect x="0" y="8" width={sceneWidth} height="22" fill="url(#lot-ground)" />

          {/* Ground line glow */}
          <line
            x1="0" y1="8" x2={sceneWidth} y2="8"
            stroke={glowColor}
            strokeWidth="1.5"
            opacity={0.3 + beatDecay * 0.15}
          />

          {/* Grass tufts along the ground line */}
          {grassTufts.map((tuft, i) => {
            const tuftSway = Math.sin(frame * 0.02 + i * 0.8) * tuft.lean * 0.3;
            return (
              <g key={`tuft-${i}`} transform={`translate(${tuft.x}, 8)`}>
                <line
                  x1="0" y1="0" x2={tuft.lean + tuftSway} y2={-tuft.h}
                  stroke={`hsla(${(glowHue + 90) % 360}, 30%, 25%, 0.4)`}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                <line
                  x1="2" y1="0" x2={tuft.lean * 0.5 + tuftSway + 1} y2={-tuft.h * 0.8}
                  stroke={`hsla(${(glowHue + 100) % 360}, 25%, 22%, 0.35)`}
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <line
                  x1="-1" y1="0" x2={tuft.lean * 1.2 + tuftSway - 1} y2={-tuft.h * 0.6}
                  stroke={`hsla(${(glowHue + 80) % 360}, 28%, 20%, 0.3)`}
                  strokeWidth="0.8"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>

        {/* ---- Ambient ground fog ---- */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 24,
            background: `linear-gradient(to top, hsla(${glowHue}, 30%, 20%, ${0.15 + bass * 0.1}), transparent)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};
