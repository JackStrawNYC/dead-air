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
