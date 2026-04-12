/**
 * Psychedelic SVG Filter Library
 *
 * Reusable SVG <defs> filter stacks that transform flat vector art into
 * textured, organic, 60s/70s psychedelic poster visuals. Drop these into
 * any overlay's <svg><defs> to add:
 *
 * - Organic distortion (feTurbulence + feDisplacementMap)
 * - Ink wash / watercolor texture
 * - Paper grain / halftone
 * - Rich glow bleeding
 * - Edge roughening for hand-drawn feel
 * - Film stock grain
 * - Liquid light show wobble
 *
 * Usage:
 *   import { PsychedelicDefs, FILTER_IDS } from "./psychedelic-filters";
 *   <svg>
 *     <PsychedelicDefs prefix="bp" frame={frame} energy={energy} />
 *     <g filter={`url(#${FILTER_IDS.inkWash("bp")})`}>...</g>
 *   </svg>
 */

import React from "react";

/* ------------------------------------------------------------------ */
/*  Filter ID helpers — prefix avoids collision between overlays       */
/* ------------------------------------------------------------------ */

export const FILTER_IDS = {
  /** Organic shape distortion — makes vectors look hand-drawn */
  organicDistort: (p: string) => `${p}-organic-distort`,
  /** Heavier distortion for liquid/psychedelic wobble */
  liquidDistort: (p: string) => `${p}-liquid-distort`,
  /** Ink wash texture — paper-like surface on fills */
  inkWash: (p: string) => `${p}-ink-wash`,
  /** Film grain — analog noise overlay */
  filmGrain: (p: string) => `${p}-film-grain`,
  /** Rich glow bleed — light bleeding out from bright areas */
  glowBleed: (p: string) => `${p}-glow-bleed`,
  /** Halftone dot pattern — vintage print aesthetic */
  halftone: (p: string) => `${p}-halftone`,
  /** Edge roughen — stroke/edge organic roughening */
  edgeRoughen: (p: string) => `${p}-edge-roughen`,
  /** Watercolor bleed — soft wet-edge effect */
  watercolorBleed: (p: string) => `${p}-watercolor-bleed`,
  /** Combined poster treatment — distort + ink + grain in one pass */
  posterize: (p: string) => `${p}-posterize`,
} as const;

/* ------------------------------------------------------------------ */
/*  Gradient/pattern IDs                                               */
/* ------------------------------------------------------------------ */

export const PATTERN_IDS = {
  /** Noise texture fill — use as a secondary fill layer */
  noiseTexture: (p: string) => `${p}-noise-tex`,
  /** Paper texture — warm off-white grain */
  paperTexture: (p: string) => `${p}-paper-tex`,
} as const;

/* ------------------------------------------------------------------ */
/*  Component Props                                                    */
/* ------------------------------------------------------------------ */

interface PsychedelicDefsProps {
  /** Unique prefix for this overlay instance (avoids SVG ID collisions) */
  prefix: string;
  /** Current frame number — drives animated turbulence seed */
  frame: number;
  /** Audio energy (0-1) — drives distortion intensity */
  energy?: number;
  /** Bass level (0-1) — drives liquid wobble scale */
  bass?: number;
  /** Beat decay (0-1) — drives grain intensity pulse */
  beatDecay?: number;
  /** Base frequency for turbulence (lower = larger distortion). Default 0.012 */
  turbulenceFreq?: number;
  /** Which filter sets to include. Default: all */
  include?: Array<keyof typeof FILTER_IDS>;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export const PsychedelicDefs: React.FC<PsychedelicDefsProps> = ({
  prefix: p,
  frame,
  energy = 0.3,
  bass = 0.2,
  beatDecay = 0,
  turbulenceFreq = 0.012,
  include,
}) => {
  const shouldInclude = (key: keyof typeof FILTER_IDS) =>
    !include || include.includes(key);

  // Animated turbulence seed — slow drift so distortion breathes
  const seed = Math.floor(frame * 0.08) % 1000;
  // Energy-scaled distortion amounts
  const organicScale = 4 + energy * 6;
  const liquidScale = 10 + bass * 18 + energy * 8;
  const grainOpacity = 0.06 + beatDecay * 0.08;

  return (
    <>
      {/* ============================================================ */}
      {/* ORGANIC DISTORTION — subtle hand-drawn wobble                */}
      {/* feTurbulence creates Perlin noise, feDisplacementMap warps   */}
      {/* the source graphic through it. Low frequency = large gentle  */}
      {/* warps that make clean vectors look hand-drawn.               */}
      {/* ============================================================ */}
      {shouldInclude("organicDistort") && (
        <filter
          id={FILTER_IDS.organicDistort(p)}
          x="-5%" y="-5%" width="110%" height="110%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={turbulenceFreq}
            numOctaves={3}
            seed={seed}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={organicScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      )}

      {/* ============================================================ */}
      {/* LIQUID DISTORTION — heavy psychedelic wobble                  */}
      {/* Lower frequency, higher displacement for liquid light look    */}
      {/* ============================================================ */}
      {shouldInclude("liquidDistort") && (
        <filter
          id={FILTER_IDS.liquidDistort(p)}
          x="-10%" y="-10%" width="120%" height="120%"
        >
          <feTurbulence
            type="turbulence"
            baseFrequency={turbulenceFreq * 0.5}
            numOctaves={2}
            seed={seed}
            result="liquidNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="liquidNoise"
            scale={liquidScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      )}

      {/* ============================================================ */}
      {/* INK WASH — paper texture multiplied onto fills                */}
      {/* Creates a high-frequency turbulence noise, desaturates it,   */}
      {/* then composites over the source in multiply mode. Result:    */}
      {/* fills look like ink on textured paper, not flat digital.     */}
      {/* ============================================================ */}
      {shouldInclude("inkWash") && (
        <filter
          id={FILTER_IDS.inkWash(p)}
          x="0%" y="0%" width="100%" height="100%"
        >
          {/* Generate high-freq noise for paper texture */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves={5}
            seed={42}
            result="paperNoise"
          />
          {/* Desaturate the noise to grayscale */}
          <feColorMatrix
            in="paperNoise"
            type="saturate"
            values="0"
            result="grayNoise"
          />
          {/* Boost contrast: push noise toward white with dark crevices */}
          <feComponentTransfer in="grayNoise" result="contrastNoise">
            <feFuncR type="linear" slope="0.35" intercept="0.70" />
            <feFuncG type="linear" slope="0.35" intercept="0.70" />
            <feFuncB type="linear" slope="0.35" intercept="0.70" />
          </feComponentTransfer>
          {/* Multiply noise onto the source — darkens in noise valleys */}
          <feBlend in="SourceGraphic" in2="contrastNoise" mode="multiply" result="textured" />
          {/* Slight organic distortion on top */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={turbulenceFreq * 1.5}
            numOctaves={2}
            seed={seed}
            result="edgeNoise"
          />
          <feDisplacementMap
            in="textured"
            in2="edgeNoise"
            scale={organicScale * 0.5}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      )}

      {/* ============================================================ */}
      {/* FILM GRAIN — analog noise layer                              */}
      {/* Fine turbulence composited at low opacity over source.       */}
      {/* Beat-reactive: grain intensifies on transients.              */}
      {/* ============================================================ */}
      {shouldInclude("filmGrain") && (
        <filter
          id={FILTER_IDS.filmGrain(p)}
          x="0%" y="0%" width="100%" height="100%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.2"
            numOctaves={3}
            seed={frame % 60}
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="saturate"
            values="0"
            result="grayGrain"
          />
          <feComponentTransfer in="grayGrain" result="scaledGrain">
            <feFuncA type="linear" slope={grainOpacity * 4} intercept="0" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="scaledGrain" mode="overlay" />
        </filter>
      )}

      {/* ============================================================ */}
      {/* GLOW BLEED — light bleeding from bright areas                */}
      {/* Duplicates source, blurs heavily, composites in screen mode  */}
      {/* on top of original. Creates photographic light bloom.        */}
      {/* ============================================================ */}
      {shouldInclude("glowBleed") && (
        <filter
          id={FILTER_IDS.glowBleed(p)}
          x="-20%" y="-20%" width="140%" height="140%"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={8 + energy * 14}
            result="bloom"
          />
          <feColorMatrix
            in="bloom"
            type="matrix"
            values={`1 0 0 0 ${energy * 0.08}  0 1 0 0 ${energy * 0.06}  0 0 1 0 ${energy * 0.04}  0 0 0 ${0.4 + energy * 0.3} 0`}
            result="tintedBloom"
          />
          <feBlend in="SourceGraphic" in2="tintedBloom" mode="screen" />
        </filter>
      )}

      {/* ============================================================ */}
      {/* EDGE ROUGHEN — makes strokes/outlines look hand-drawn        */}
      {/* Displacement + morphological erode for rough edges           */}
      {/* ============================================================ */}
      {shouldInclude("edgeRoughen") && (
        <filter
          id={FILTER_IDS.edgeRoughen(p)}
          x="-3%" y="-3%" width="106%" height="106%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves={4}
            seed={seed}
            result="edgeNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeNoise"
            scale={3 + energy * 4}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      )}

      {/* ============================================================ */}
      {/* WATERCOLOR BLEED — soft diffuse edge bleeding                 */}
      {/* Blur + displacement creates wet-edge watercolor look          */}
      {/* ============================================================ */}
      {shouldInclude("watercolorBleed") && (
        <filter
          id={FILTER_IDS.watercolorBleed(p)}
          x="-8%" y="-8%" width="116%" height="116%"
        >
          {/* Soften edges first */}
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation="2.5"
            result="softened"
          />
          {/* Organic displacement for bleed edges */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.025"
            numOctaves={3}
            seed={seed}
            result="bleedNoise"
          />
          <feDisplacementMap
            in="softened"
            in2="bleedNoise"
            scale={6 + energy * 8}
            xChannelSelector="R"
            yChannelSelector="G"
            result="bled"
          />
          {/* Paper texture layer */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves={4}
            seed={7}
            result="paper"
          />
          <feColorMatrix
            in="paper"
            type="saturate"
            values="0"
            result="grayPaper"
          />
          <feComponentTransfer in="grayPaper" result="paperLayer">
            <feFuncR type="linear" slope="0.25" intercept="0.78" />
            <feFuncG type="linear" slope="0.25" intercept="0.78" />
            <feFuncB type="linear" slope="0.25" intercept="0.78" />
          </feComponentTransfer>
          <feBlend in="bled" in2="paperLayer" mode="multiply" />
        </filter>
      )}

      {/* ============================================================ */}
      {/* HALFTONE — vintage print dot pattern                         */}
      {/* Uses high-frequency turbulence + threshold to create dots    */}
      {/* ============================================================ */}
      {shouldInclude("halftone") && (
        <filter
          id={FILTER_IDS.halftone(p)}
          x="0%" y="0%" width="100%" height="100%"
        >
          <feTurbulence
            type="turbulence"
            baseFrequency="3.5"
            numOctaves={1}
            seed={0}
            result="dots"
          />
          <feColorMatrix
            in="dots"
            type="saturate"
            values="0"
            result="grayDots"
          />
          {/* Threshold to create dot pattern */}
          <feComponentTransfer in="grayDots" result="halftonePattern">
            <feFuncR type="discrete" tableValues="0 0 0.4 1 1" />
            <feFuncG type="discrete" tableValues="0 0 0.4 1 1" />
            <feFuncB type="discrete" tableValues="0 0 0.4 1 1" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="halftonePattern" mode="multiply" />
        </filter>
      )}

      {/* ============================================================ */}
      {/* POSTERIZE — combined treatment: distort + ink + grain         */}
      {/* All-in-one psychedelic poster art treatment                   */}
      {/* ============================================================ */}
      {shouldInclude("posterize") && (
        <filter
          id={FILTER_IDS.posterize(p)}
          x="-8%" y="-8%" width="116%" height="116%"
        >
          {/* Step 1: Organic distortion */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={turbulenceFreq}
            numOctaves={3}
            seed={seed}
            result="distortNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="distortNoise"
            scale={organicScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="distorted"
          />
          {/* Step 2: Paper texture */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.55"
            numOctaves={4}
            seed={42}
            result="posterPaper"
          />
          <feColorMatrix
            in="posterPaper"
            type="saturate"
            values="0"
            result="posterGray"
          />
          <feComponentTransfer in="posterGray" result="posterTex">
            <feFuncR type="linear" slope="0.30" intercept="0.73" />
            <feFuncG type="linear" slope="0.30" intercept="0.73" />
            <feFuncB type="linear" slope="0.30" intercept="0.73" />
          </feComponentTransfer>
          <feBlend in="distorted" in2="posterTex" mode="multiply" result="posterTextured" />
          {/* Step 3: Film grain */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.1"
            numOctaves={2}
            seed={frame % 60}
            result="posterGrain"
          />
          <feColorMatrix
            in="posterGrain"
            type="saturate"
            values="0"
            result="posterGrainGray"
          />
          <feComponentTransfer in="posterGrainGray" result="posterGrainScaled">
            <feFuncA type="linear" slope={grainOpacity * 3} intercept="0" />
          </feComponentTransfer>
          <feBlend in="posterTextured" in2="posterGrainScaled" mode="overlay" result="posterGrained" />
          {/* Step 4: Subtle glow bleed */}
          <feGaussianBlur
            in="posterGrained"
            stdDeviation={4 + energy * 6}
            result="posterBloom"
          />
          <feColorMatrix
            in="posterBloom"
            type="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${0.25 + energy * 0.2} 0`}
            result="posterBloomFaded"
          />
          <feBlend in="posterGrained" in2="posterBloomFaded" mode="screen" />
        </filter>
      )}

      {/* ============================================================ */}
      {/* NOISE TEXTURE PATTERN — use as a fill for texture layers      */}
      {/* ============================================================ */}
      <filter id={PATTERN_IDS.noiseTexture(p)} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.7"
          numOctaves={5}
          seed={42}
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>

      <filter id={PATTERN_IDS.paperTexture(p)} x="0%" y="0%" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.5"
          numOctaves={4}
          seed={7}
        />
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.2" intercept="0.82" />
          <feFuncG type="linear" slope="0.18" intercept="0.80" />
          <feFuncB type="linear" slope="0.16" intercept="0.78" />
        </feComponentTransfer>
      </filter>
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Standalone helper: inline noise rect for texture overlays          */
/* ------------------------------------------------------------------ */

interface NoiseLayerProps {
  width: number;
  height: number;
  /** Opacity of the noise layer. Default 0.08 */
  opacity?: number;
  /** Blend mode. Default "overlay" */
  blendMode?: string;
  /** Filter ID to use (from PATTERN_IDS) */
  filterId: string;
}

export const NoiseLayer: React.FC<NoiseLayerProps> = ({
  width,
  height,
  opacity = 0.08,
  blendMode = "overlay",
  filterId,
}) => (
  <rect
    width={width}
    height={height}
    filter={`url(#${filterId})`}
    opacity={opacity}
    style={{ mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"] }}
  />
);
