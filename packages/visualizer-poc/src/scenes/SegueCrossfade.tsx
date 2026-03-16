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
