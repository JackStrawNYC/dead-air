/**
 * SegueCrossfade — smooth dual-render crossfade for song-to-song segues.
 *
 * Supports multiple transition styles:
 *   "dissolve" — clean eased opacity crossfade (default)
 *   "morph"    — extended 5s crossfade with brightness dip at midpoint
 *   "flash"    — white flash at midpoint, incoming snaps in
 *   "void"     — outgoing fades to black, incoming from black
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

export const SegueCrossfade: React.FC<Props> = ({ progress, outgoing, incoming, style = "dissolve" }) => {
  const t = Math.max(0, Math.min(1, progress));

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
