/**
 * SegueCrossfade — smooth dual-render crossfade for song-to-song segues.
 *
 * Supports multiple transition styles:
 *   "dissolve"         — clean eased opacity crossfade (default)
 *   "morph"            — extended 5s crossfade with brightness dip at midpoint
 *   "flash"            — white flash at midpoint, incoming snaps in
 *   "void"             — outgoing fades to black, incoming from black
 *   "radial_wipe"      — clip-path circle expanding from center reveals incoming
 *   "distortion_morph" — SVG feTurbulence warp peaks at midpoint then fades
 *   "luminance_key"    — screen blend: bright areas of incoming appear first
 *
 * Safe for Remotion's offline rendering (frame-by-frame, not real-time).
 * Both scenes create separate AudioReactiveCanvas instances.
 */

import React from "react";
import { Easing } from "remotion";
import type { TransitionStyle } from "../data/song-identities";

interface Props {
  /** Progress through the crossfade: 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  /** Transition style (default: "dissolve") */
  style?: TransitionStyle;
}

const ease = Easing.inOut(Easing.ease);
const cubicEase = Easing.inOut(Easing.cubic);

/**
 * Inline SVG filter for distortion_morph. Uses feTurbulence + feDisplacementMap
 * to warp the scene content. Intensity peaks at progress=0.5 and returns to 0
 * at both endpoints, creating a psychedelic warp between scenes.
 *
 * The filter ID is namespaced to avoid collisions with other SVG content.
 */
const DistortionFilter: React.FC<{ progress: number }> = ({ progress }) => {
  // Bell curve: intensity peaks at midpoint (progress=0.5)
  const intensity = Math.sin(progress * Math.PI);
  const baseFrequency = (0.05 * intensity).toFixed(4);
  const displacementScale = (40 * intensity).toFixed(1);

  return (
    <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
      <defs>
        <filter id="segue-distortion-morph" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="turbulence"
            baseFrequency={baseFrequency}
            numOctaves={3}
            seed={42}
            result="turbulence"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="turbulence"
            scale={displacementScale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
};

export const SegueCrossfade: React.FC<Props> = ({ progress, outgoing, incoming, style = "dissolve" }) => {
  const t = Math.max(0, Math.min(1, progress));

  // ─── Spatial transitions (radial_wipe, distortion_morph, luminance_key) ───
  // These use different rendering strategies than opacity-based transitions.

  if (style === "radial_wipe") {
    // CSS clip-path circle expanding from center reveals the incoming scene.
    // Outgoing is fully visible underneath; incoming is clipped to a growing circle.
    const radius = t * 75; // 0% → 75% (75% covers corners of a rectangle)
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene — fully visible underneath */}
        <div style={{ position: "absolute", inset: 0 }}>
          {outgoing}
        </div>
        {/* Incoming scene — revealed by expanding clip circle */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `circle(${radius.toFixed(2)}% at 50% 50%)`,
          }}
        >
          {incoming}
        </div>
      </div>
    );
  }

  if (style === "distortion_morph") {
    // Both scenes cross-dissolve with cubic easing while an SVG turbulence
    // distortion filter warps the content, peaking at the midpoint.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    const intensity = Math.sin(t * Math.PI);
    const shouldFilter = intensity > 0.01;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* SVG filter definition (zero-size, invisible) */}
        {shouldFilter && <DistortionFilter progress={t} />}
        {/* Outgoing scene */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: outOp,
              filter: shouldFilter ? "url(#segue-distortion-morph)" : undefined,
            }}
          >
            {outgoing}
          </div>
        )}
        {/* Incoming scene */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              filter: shouldFilter ? "url(#segue-distortion-morph)" : undefined,
            }}
          >
            {incoming}
          </div>
        )}
      </div>
    );
  }

  if (style === "luminance_key") {
    // Screen blend: bright areas of the incoming scene appear first.
    // The outgoing scene fades out normally while the incoming scene uses
    // mix-blend-mode: screen so only luminant pixels punch through initially,
    // then opacity ramps to full to complete the reveal.
    const eased = ease(t);
    const outOp = 1 - eased;
    const inOp = eased;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene — normal opacity fade */}
        {outOp > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: outOp }}>
            {outgoing}
          </div>
        )}
        {/* Incoming scene — screen blend lets bright areas appear first */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              mixBlendMode: "screen",
            }}
          >
            {incoming}
          </div>
        )}
      </div>
    );
  }

  if (style === "kaleidoscope_dissolve") {
    // Kaleidoscope: rotational symmetry dissolve — fragments rotate into place.
    // Outgoing scene fractures and rotates out while incoming rotates in.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    // Rotation: outgoing rotates out, incoming rotates in
    const rotationDeg = eased * 60; // 0 → 60 degrees
    const scaleOut = 1 + eased * 0.3; // zoom out
    const scaleIn = 1.3 - eased * 0.3; // zoom in to normal
    // Clip polygon: hexagonal kaleidoscope facet
    const hexRadius = 50 + eased * 25; // expanding hex
    const hexPoints = Array.from({ length: 6 }, (_, i) => {
      const a = (i * 60 - 30 + rotationDeg * 0.5) * Math.PI / 180;
      return `${50 + hexRadius * Math.cos(a)}% ${50 + hexRadius * Math.sin(a)}%`;
    }).join(", ");

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: outOp,
              transform: `rotate(${rotationDeg.toFixed(1)}deg) scale(${scaleOut.toFixed(3)})`,
            }}
          >
            {outgoing}
          </div>
        )}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              transform: `rotate(${(-60 + rotationDeg).toFixed(1)}deg) scale(${scaleIn.toFixed(3)})`,
              clipPath: `polygon(${hexPoints})`,
            }}
          >
            {incoming}
          </div>
        )}
      </div>
    );
  }

  if (style === "prismatic_split") {
    // Prismatic split: scene splits into RGB channels that slide apart.
    // Outgoing separates into R/G/B strips, incoming assembles from strips.
    const eased = ease(t);
    const outOp = Math.max(0, 1 - eased * 1.5); // fades faster
    const inOp = Math.max(0, eased * 1.5 - 0.5); // appears later
    // Split offset: how far the color channels separate
    const splitPx = Math.sin(t * Math.PI) * 4; // peaks at midpoint (% units)

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {outOp > 0.01 && (
          <>
            {/* Red channel */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: outOp,
                transform: `translateX(${splitPx.toFixed(2)}%)`,
                mixBlendMode: "screen",
                filter: "saturate(3) hue-rotate(-30deg)",
              }}
            >
              {outgoing}
            </div>
            {/* Blue channel */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: outOp,
                transform: `translateX(${(-splitPx).toFixed(2)}%)`,
                mixBlendMode: "screen",
                filter: "saturate(3) hue-rotate(90deg)",
              }}
            >
              {outgoing}
            </div>
          </>
        )}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
            }}
          >
            {incoming}
          </div>
        )}
      </div>
    );
  }

  if (style === "chromatic_wipe") {
    // Chromatic wipe: diagonal gradient sweep with color fringing at the edge.
    // A diagonal line sweeps from top-left to bottom-right, revealing incoming.
    // The edge of the wipe has chromatic aberration (color fringe).
    const eased = cubicEase(t);
    // Diagonal progress: gradient angle at 135 degrees
    const gradientStop = eased * 120 - 10; // -10% to 110%
    const fringeWidth = 8; // % of screen for color fringe zone

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene — fully visible underneath */}
        <div style={{ position: "absolute", inset: 0 }}>
          {outgoing}
        </div>
        {/* Incoming scene — revealed by diagonal gradient mask */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            maskImage: `linear-gradient(135deg, black ${gradientStop.toFixed(1)}%, transparent ${(gradientStop + fringeWidth).toFixed(1)}%)`,
            WebkitMaskImage: `linear-gradient(135deg, black ${gradientStop.toFixed(1)}%, transparent ${(gradientStop + fringeWidth).toFixed(1)}%)`,
          }}
        >
          {incoming}
        </div>
        {/* Chromatic fringe at wipe edge */}
        {t > 0.05 && t < 0.95 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              maskImage: `linear-gradient(135deg, transparent ${(gradientStop - 2).toFixed(1)}%, white ${gradientStop.toFixed(1)}%, white ${(gradientStop + fringeWidth * 0.5).toFixed(1)}%, transparent ${(gradientStop + fringeWidth).toFixed(1)}%)`,
              WebkitMaskImage: `linear-gradient(135deg, transparent ${(gradientStop - 2).toFixed(1)}%, white ${gradientStop.toFixed(1)}%, white ${(gradientStop + fringeWidth * 0.5).toFixed(1)}%, transparent ${(gradientStop + fringeWidth).toFixed(1)}%)`,
              backgroundColor: `hsla(${(eased * 360).toFixed(0)}, 80%, 60%, 0.15)`,
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }

  if (style === "pixel_scatter") {
    // Pixel scatter: outgoing scene fragments into rectangular tiles that scatter
    // outward with rotation, revealing incoming behind.
    const eased = cubicEase(t);
    const outOp = Math.max(0, 1 - eased * 1.2);
    const inOp = eased;

    // Generate grid of fragment transforms
    const cols = 6;
    const rows = 4;
    const fragments: React.ReactNode[] = [];

    if (outOp > 0.01 && t > 0.02) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = (col + 0.5) / cols;
          const cy = (row + 0.5) / rows;
          // Direction away from center
          const dx = cx - 0.5;
          const dy = cy - 0.5;
          // Scatter distance increases with progress
          const scatter = eased * eased * 150; // px equivalent in %
          const rot = eased * (((col + row * cols) % 7) - 3) * 30; // rotation degrees
          const fragDelay = (col + row) / (cols + rows); // stagger
          const fragProgress = Math.max(0, (eased - fragDelay * 0.3) / 0.7);
          const translateX = dx * scatter * fragProgress;
          const translateY = dy * scatter * fragProgress;
          const fragOpacity = Math.max(0, 1 - fragProgress * 1.3);

          if (fragOpacity < 0.02) continue;

          fragments.push(
            <div
              key={`${row}-${col}`}
              style={{
                position: "absolute",
                left: `${(col / cols * 100).toFixed(2)}%`,
                top: `${(row / rows * 100).toFixed(2)}%`,
                width: `${(100 / cols).toFixed(2)}%`,
                height: `${(100 / rows).toFixed(2)}%`,
                overflow: "hidden",
                transform: `translate(${translateX.toFixed(1)}%, ${translateY.toFixed(1)}%) rotate(${rot.toFixed(1)}deg)`,
                opacity: fragOpacity,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${(-col / cols * 100).toFixed(2)}%`,
                  top: `${(-row / rows * 100).toFixed(2)}%`,
                  width: `${cols * 100}%`,
                  height: `${rows * 100}%`,
                }}
              >
                {outgoing}
              </div>
            </div>
          );
        }
      }
    }

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {/* Incoming scene visible behind fragments */}
        {inOp > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: inOp }}>
            {incoming}
          </div>
        )}
        {/* Outgoing scene as scattered fragments */}
        {t < 0.02 ? (
          <div style={{ position: "absolute", inset: 0 }}>
            {outgoing}
          </div>
        ) : (
          fragments
        )}
      </div>
    );
  }

  if (style === "interference_pattern") {
    // Moire interference: concentric ring masks on both scenes with complementary spacing.
    // As progress shifts ring spacing, moire interference creates psychedelic fringe at overlap.
    const eased = cubicEase(t);
    const outOp = Math.max(0, 1 - eased * 1.3);
    const inOp = Math.min(1, eased * 1.3);

    // Ring parameters
    const ringFreqOut = 30 + t * 20; // increasing frequency
    const ringFreqIn = 30 + (1 - t) * 20; // decreasing (complementary)
    const ringPhase = t * Math.PI * 4; // phase shift creates interference

    // Generate radial gradient ring masks as CSS
    const ringMaskOut = `repeating-radial-gradient(circle at 50% 50%, black 0px, black ${(100 / ringFreqOut).toFixed(2)}%, transparent ${(100 / ringFreqOut).toFixed(2)}%, transparent ${(200 / ringFreqOut).toFixed(2)}%)`;
    const ringMaskIn = `repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent ${(50 / ringFreqIn).toFixed(2)}%, black ${(50 / ringFreqIn).toFixed(2)}%, black ${(100 / ringFreqIn).toFixed(2)}%)`;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene with ring mask */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: outOp,
              maskImage: t > 0.1 && t < 0.9 ? ringMaskOut : undefined,
              WebkitMaskImage: t > 0.1 && t < 0.9 ? ringMaskOut : undefined,
            }}
          >
            {outgoing}
          </div>
        )}
        {/* Incoming scene with complementary ring mask */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              maskImage: t > 0.1 && t < 0.9 ? ringMaskIn : undefined,
              WebkitMaskImage: t > 0.1 && t < 0.9 ? ringMaskIn : undefined,
            }}
          >
            {incoming}
          </div>
        )}
        {/* Psychedelic fringe glow at overlap zone */}
        {t > 0.15 && t < 0.85 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 50% 50%, hsla(${(t * 720).toFixed(0)}, 60%, 50%, 0.08) 0%, transparent 70%)`,
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }

  if (style === "spiral_vortex") {
    // Logarithmic spiral reveal: incoming scene revealed through a rotating
    // logarithmic spiral SVG clip-path expanding from center.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    // Spiral parameters: radius grows, rotation accelerates with progress
    const maxRadius = 80; // % coverage
    const spiralRadius = eased * maxRadius;
    const rotationDeg = eased * eased * 720; // quadratic acceleration

    // Build spiral clip path as polygon points along a logarithmic spiral
    const spiralPoints: string[] = [];
    const segments = 60;
    for (let i = 0; i <= segments; i++) {
      const frac = i / segments;
      const angle = frac * Math.PI * 6 + (rotationDeg * Math.PI) / 180;
      const r = frac * spiralRadius;
      const x = 50 + r * Math.cos(angle);
      const y = 50 + r * Math.sin(angle);
      spiralPoints.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    // Close the spiral by connecting back through outer edge to fill
    // Add corner points to ensure full coverage at high progress
    if (eased > 0.5) {
      spiralPoints.push("100% 100%", "100% 0%", "0% 0%", "0% 100%", "100% 100%");
    }

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: outOp,
              transform: `rotate(${(-rotationDeg * 0.1).toFixed(1)}deg)`,
              transformOrigin: "center center",
            }}
          >
            {outgoing}
          </div>
        )}
        {/* Incoming scene — revealed through expanding spiral */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `circle(${spiralRadius.toFixed(1)}% at 50% 50%)`,
            }}
          >
            {incoming}
          </div>
        )}
        {/* Chromatic glow at leading edge */}
        {t > 0.05 && t < 0.9 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              clipPath: `circle(${(spiralRadius + 3).toFixed(1)}% at 50% 50%)`,
              backgroundColor: `hsla(${(t * 360).toFixed(0)}, 70%, 60%, 0.1)`,
              mixBlendMode: "screen",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }

  if (style === "feedback_dissolve") {
    // Recursive zoom tunnel: outgoing scene falls into itself (shrinking scale echoes)
    // while incoming emerges from the vanishing point.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    const echoCount = 5;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {/* Outgoing scene echoes (shrinking copies receding into center) */}
        {Array.from({ length: echoCount }, (_, i) => {
          const depth = (i + 1) / echoCount;
          const echoScale = 1 - depth * eased * 0.8; // shrink toward center
          const echoOpacity = outOp * (1 - depth * 0.7) * Math.max(0, 1 - eased * 1.5);
          if (echoOpacity < 0.02 || echoScale < 0.05) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: 0,
                opacity: echoOpacity,
                transform: `scale(${echoScale.toFixed(4)})`,
                transformOrigin: "center center",
              }}
            >
              {outgoing}
            </div>
          );
        })}
        {/* Main outgoing scene */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: outOp,
              transform: `scale(${(1 - eased * 0.3).toFixed(4)})`,
              transformOrigin: "center center",
            }}
          >
            {outgoing}
          </div>
        )}
        {/* Incoming scene — emerges from vanishing point */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              transform: `scale(${(0.3 + eased * 0.7).toFixed(4)})`,
              transformOrigin: "center center",
            }}
          >
            {incoming}
          </div>
        )}
      </div>
    );
  }

  if (style === "vine_grow") {
    // Vine tendrils grow from edges inward covering outgoing.
    // At center they part to reveal incoming.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    // Vine coverage: grows from edges toward center
    const coverage = eased * 100; // percentage
    // Use inset gradient mask to simulate vine coverage from all edges
    const insetPx = Math.max(0, 50 - coverage) ; // shrinking reveal window

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Outgoing scene */}
        {outOp > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: outOp }}>
            {outgoing}
          </div>
        )}
        {/* Incoming scene revealed through center gap */}
        {inOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: inOp,
              maskImage: `radial-gradient(ellipse ${(coverage * 0.8).toFixed(1)}% ${(coverage * 0.8).toFixed(1)}% at 50% 50%, black 0%, transparent 100%)`,
              WebkitMaskImage: `radial-gradient(ellipse ${(coverage * 0.8).toFixed(1)}% ${(coverage * 0.8).toFixed(1)}% at 50% 50%, black 0%, transparent 100%)`,
            }}
          >
            {incoming}
          </div>
        )}
        {/* Green vine overlay at edges */}
        {t > 0.05 && t < 0.95 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse 60% 60% at 50% 50%, transparent 0%, hsla(120, 40%, 20%, ${Math.sin(t * Math.PI) * 0.08}) 100%)`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }

  if (style === "particle_scatter") {
    // Outgoing disintegrates into circular particles with physics drift.
    const eased = cubicEase(t);
    const outOp = Math.max(0, 1 - eased * 1.3);
    const inOp = eased;

    // Particles: more organic circles than pixel_scatter's rectangles
    const cols = 8;
    const rows = 6;
    const particles: React.ReactNode[] = [];

    if (outOp > 0.01 && t > 0.02) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cx = (col + 0.5) / cols;
          const cy = (row + 0.5) / rows;
          const dx = cx - 0.5;
          const dy = cy - 0.5;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const fragDelay = dist * 0.5; // closer to center scatters later
          const fragProgress = Math.max(0, (eased - fragDelay) / (1 - fragDelay + 0.01));
          const scatter = fragProgress * fragProgress * 200;
          const translateX = dx * scatter;
          const translateY = dy * scatter + fragProgress * fragProgress * 50; // gravity
          const fragOpacity = Math.max(0, 1 - fragProgress * 1.4);
          const scale = 1 - fragProgress * 0.5;

          if (fragOpacity < 0.02) continue;

          particles.push(
            <div
              key={`${row}-${col}`}
              style={{
                position: "absolute",
                left: `${(col / cols * 100).toFixed(2)}%`,
                top: `${(row / rows * 100).toFixed(2)}%`,
                width: `${(100 / cols).toFixed(2)}%`,
                height: `${(100 / rows).toFixed(2)}%`,
                overflow: "hidden",
                borderRadius: "50%",
                transform: `translate(${translateX.toFixed(1)}%, ${translateY.toFixed(1)}%) scale(${scale.toFixed(3)})`,
                opacity: fragOpacity,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${(-col / cols * 100).toFixed(2)}%`,
                  top: `${(-row / rows * 100).toFixed(2)}%`,
                  width: `${cols * 100}%`,
                  height: `${rows * 100}%`,
                }}
              >
                {outgoing}
              </div>
            </div>
          );
        }
      }
    }

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {inOp > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: inOp }}>
            {incoming}
          </div>
        )}
        {t < 0.02 ? (
          <div style={{ position: "absolute", inset: 0 }}>
            {outgoing}
          </div>
        ) : (
          particles
        )}
      </div>
    );
  }

  if (style === "gravity_well") {
    // Outgoing scales toward center singularity. Flash at max compression.
    // Incoming expands outward from singularity.
    const eased = cubicEase(t);

    const isCompressing = t < 0.5;
    const compressionProgress = isCompressing ? t / 0.5 : 1;
    const expansionProgress = isCompressing ? 0 : (t - 0.5) / 0.5;

    const outScale = isCompressing ? 1 - cubicEase(compressionProgress) * 0.95 : 0.05;
    const outOp = isCompressing ? 1 : 0;
    const inScale = isCompressing ? 0.05 : 0.05 + cubicEase(expansionProgress) * 0.95;
    const inOp = isCompressing ? 0 : 1;

    // Flash at singularity (t ≈ 0.5)
    const flashIntensity = Math.exp(-((t - 0.5) * (t - 0.5)) / 0.005) * 0.4;

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {outOp > 0.01 && outScale > 0.02 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${outScale.toFixed(4)})`,
              transformOrigin: "center center",
              opacity: outOp,
              borderRadius: isCompressing && compressionProgress > 0.7 ? "50%" : undefined,
              overflow: "hidden",
            }}
          >
            {outgoing}
          </div>
        )}
        {inOp > 0.01 && inScale > 0.02 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${inScale.toFixed(4)})`,
              transformOrigin: "center center",
              opacity: inOp,
            }}
          >
            {incoming}
          </div>
        )}
        {/* Singularity flash */}
        {flashIntensity > 0.01 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 50% 50%, rgba(255, 255, 255, ${flashIntensity}) 0%, transparent 50%)`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  }

  if (style === "curtain_rise") {
    // Two curtain panels slide apart from center with fabric fold shadows.
    const eased = cubicEase(t);
    const outOp = 1 - eased;
    const inOp = eased;
    // Curtain opening: panels slide from center to edges
    const openPercent = eased * 55; // each panel slides 55% of width

    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Incoming scene behind curtains */}
        {inOp > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: inOp }}>
            {incoming}
          </div>
        )}
        {/* Left curtain panel */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "50%",
              height: "100%",
              overflow: "hidden",
              transform: `translateX(${-openPercent.toFixed(1)}%)`,
            }}
          >
            <div style={{ position: "absolute", inset: 0, width: "200%" }}>
              {outgoing}
            </div>
            {/* Fabric fold shadow */}
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 30,
                height: "100%",
                background: `linear-gradient(to left, rgba(0,0,0,${0.3 * outOp}), transparent)`,
                pointerEvents: "none",
              }}
            />
          </div>
        )}
        {/* Right curtain panel */}
        {outOp > 0.01 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "50%",
              height: "100%",
              overflow: "hidden",
              transform: `translateX(${openPercent.toFixed(1)}%)`,
            }}
          >
            <div style={{ position: "absolute", inset: 0, left: "-100%", width: "200%" }}>
              {outgoing}
            </div>
            {/* Fabric fold shadow */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 30,
                height: "100%",
                background: `linear-gradient(to right, rgba(0,0,0,${0.3 * outOp}), transparent)`,
                pointerEvents: "none",
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // ─── Original opacity-based transitions ───

  let outOpacity: number;
  let inOpacity: number;
  let flashOpacity = 0;
  let blackOpacity = 0;
  let brightnessDip = 1;

  switch (style) {
    case "morph": {
      // Extended crossfade with cubic easing and brightness dip at midpoint
      const eased = cubicEase(t);
      outOpacity = 1 - eased;
      inOpacity = eased;
      // Brightness dip: darkens at midpoint ("through darkness")
      brightnessDip = 1 - 0.3 * Math.sin(t * Math.PI);
      break;
    }

    case "flash": {
      // White flash at progress 0.5, incoming snaps in
      const eased = ease(t);
      if (t < 0.45) {
        outOpacity = 1;
        inOpacity = 0;
      } else if (t < 0.55) {
        // Flash zone
        const flashProgress = (t - 0.45) / 0.1;
        flashOpacity = 0.3 * Math.sin(flashProgress * Math.PI);
        outOpacity = 1 - flashProgress;
        inOpacity = flashProgress;
      } else {
        outOpacity = 0;
        inOpacity = 1;
      }
      break;
    }

    case "void": {
      // Outgoing fades to black (0-60%), incoming from black (40-100%)
      if (t < 0.6) {
        outOpacity = 1 - ease(t / 0.6);
        inOpacity = 0;
        blackOpacity = ease(t / 0.6);
      } else {
        outOpacity = 0;
        inOpacity = ease((t - 0.4) / 0.6);
        blackOpacity = 1 - ease((t - 0.4) / 0.6);
      }
      break;
    }

    case "dissolve":
    default: {
      // Clean eased opacity crossfade (original behavior)
      const eased = ease(t);
      outOpacity = 1 - eased;
      inOpacity = eased;
      break;
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {outOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: outOpacity,
            filter: brightnessDip < 0.99 ? `brightness(${brightnessDip.toFixed(3)})` : undefined,
          }}
        >
          {outgoing}
        </div>
      )}
      {inOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: inOpacity,
            filter: brightnessDip < 0.99 ? `brightness(${brightnessDip.toFixed(3)})` : undefined,
          }}
        >
          {incoming}
        </div>
      )}
      {/* White flash overlay */}
      {flashOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(255, 255, 255, ${flashOpacity})`,
            pointerEvents: "none",
          }}
        />
      )}
      {/* Black overlay for void transition */}
      {blackOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(0, 0, 0, ${blackOpacity})`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
