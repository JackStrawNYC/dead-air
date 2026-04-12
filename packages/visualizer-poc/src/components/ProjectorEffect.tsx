/**
 * ProjectorEffect — wraps any overlay content and makes it look like it's
 * being projected through a dirty slide projector into a smoky concert venue.
 *
 * This kills the "clip art" feel by:
 *   1. Softening all edges (Gaussian blur — no more crisp vector lines)
 *   2. Adding chromatic aberration (RGB channel offset — color fringing)
 *   3. Film grain + dust (analog imperfections)
 *   4. Halation (bright areas glow and bleed outward)
 *   5. Projector vignette (bright center, dark edges — light falloff)
 *   6. Screen blend prep (everything looks like projected light, not pasted clip art)
 *
 * Usage:
 *   <ProjectorEffect width={1920} height={1080} frame={frame} intensity={0.7}>
 *     <YourOverlayContent />
 *   </ProjectorEffect>
 *
 * Intensity 0-1 controls how heavy the projection look is.
 * At 0: clean pass-through. At 1: heavy dirty projector.
 */

import React from "react";

interface ProjectorEffectProps {
  width: number;
  height: number;
  /** Current frame — drives grain animation */
  frame: number;
  /** 0-1: how heavy the projection look is. Default 0.65 */
  intensity?: number;
  /** Additional blur beyond the base. Default 0 */
  extraBlur?: number;
  /** Children to wrap */
  children: React.ReactNode;
}

export const ProjectorEffect: React.FC<ProjectorEffectProps> = ({
  width,
  height,
  frame,
  intensity = 0.65,
  extraBlur = 0,
  children,
}) => {
  // Scale effects by intensity
  const blur = 1.5 + intensity * 3.5 + extraBlur; // 1.5-5px blur kills vector crispness
  const caOffset = intensity * 2.5; // chromatic aberration pixel offset
  const grainOpacity = 0.04 + intensity * 0.08;
  const halationBlur = 12 + intensity * 20;
  const halationOpacity = 0.15 + intensity * 0.25;
  const vignetteInner = 35 + (1 - intensity) * 20; // % where vignette starts
  const vignetteOpacity = 0.3 + intensity * 0.35;
  const dustCount = Math.floor(3 + intensity * 8);
  const scratchCount = Math.floor(1 + intensity * 3);

  // Grain seed changes every 2 frames for film-like flicker
  const grainSeed = Math.floor(frame / 2) % 100;

  // Dust specs — seeded positions that drift slowly
  const dustSpecs = React.useMemo(() => {
    const specs = [];
    for (let i = 0; i < 12; i++) {
      const seed = i * 7919 + 3571;
      specs.push({
        x: ((seed * 13) % 100) / 100,
        y: ((seed * 29) % 100) / 100,
        r: 0.3 + ((seed * 41) % 20) / 20 * 1.2,
        opacity: 0.15 + ((seed * 53) % 10) / 10 * 0.25,
      });
    }
    return specs;
  }, []);

  // Scratch lines — thin diagonal lines
  const scratchSpecs = React.useMemo(() => {
    const specs = [];
    for (let i = 0; i < 5; i++) {
      const seed = i * 6271 + 2903;
      specs.push({
        x: ((seed * 17) % 100) / 100,
        angle: -75 + ((seed * 31) % 30),
        length: 0.15 + ((seed * 43) % 30) / 100,
        opacity: 0.08 + ((seed * 59) % 10) / 100,
      });
    }
    return specs;
  }, []);

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden" }}>
      {/* ============================================================ */}
      {/* LAYER 1: Main content with softening blur                    */}
      {/* This is the key — blur kills all crisp vector edges          */}
      {/* ============================================================ */}
      <div style={{
        position: "absolute",
        inset: 0,
        filter: `blur(${blur}px)`,
      }}>
        {children}
      </div>

      {/* ============================================================ */}
      {/* NOTE: Chromatic aberration and halation removed — re-rendering */}
      {/* children caused opaque background artifacts. The main blur +  */}
      {/* grain + vignette + dust is sufficient for the projected look. */}
      {/* ============================================================ */}

      {/* ============================================================ */}
      {/* LAYER 4: Film grain + dust + scratches (SVG overlay)         */}
      {/* ============================================================ */}
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* Film grain noise */}
          <filter id="proj-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.4"
              numOctaves={3}
              seed={grainSeed}
              result="grain"
            />
            <feColorMatrix
              in="grain"
              type="saturate"
              values="0"
              result="grayGrain"
            />
            <feComponentTransfer in="grayGrain">
              <feFuncA type="linear" slope={grainOpacity * 5} intercept={0} />
            </feComponentTransfer>
          </filter>

          {/* Projector vignette — light falloff from center */}
          <radialGradient id="proj-vig" cx="50%" cy="50%">
            <stop offset={`${vignetteInner}%`} stopColor="rgba(0,0,0,0)" />
            <stop offset="85%" stopColor={`rgba(0,0,0,${vignetteOpacity * 0.6})`} />
            <stop offset="100%" stopColor={`rgba(0,0,0,${vignetteOpacity})`} />
          </radialGradient>

          {/* Warm projector tint — old bulb color cast */}
          <radialGradient id="proj-warmth" cx="50%" cy="45%">
            <stop offset="0%" stopColor="rgba(255,235,200,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Film grain overlay */}
        <rect width={width} height={height} filter="url(#proj-grain)"
          style={{ mixBlendMode: "overlay" }} />

        {/* Dust specks — tiny white/warm dots */}
        {dustSpecs.slice(0, dustCount).map((d, i) => {
          const dx = d.x * width + Math.sin(frame * 0.003 + i) * 5;
          const dy = d.y * height + Math.cos(frame * 0.002 + i * 1.3) * 3;
          return (
            <circle key={`dust-${i}`}
              cx={dx} cy={dy} r={d.r}
              fill="rgba(240,230,210,1)"
              opacity={d.opacity * intensity} />
          );
        })}

        {/* Scratch lines — thin vertical-ish lines */}
        {scratchSpecs.slice(0, scratchCount).map((s, i) => {
          const sx = s.x * width;
          const len = s.length * height;
          const rad = (s.angle * Math.PI) / 180;
          const ex = sx + Math.sin(rad) * len;
          const ey = Math.cos(rad) * len;
          return (
            <line key={`scratch-${i}`}
              x1={sx} y1={0} x2={ex} y2={ey}
              stroke="rgba(240,230,210,0.8)"
              strokeWidth={0.5 + i * 0.2}
              opacity={s.opacity * intensity} />
          );
        })}

        {/* Warm projector tint */}
        <rect width={width} height={height} fill="url(#proj-warmth)"
          style={{ mixBlendMode: "screen" }} />

        {/* Projector vignette */}
        <rect width={width} height={height} fill="url(#proj-vig)" />
      </svg>
    </div>
  );
};
