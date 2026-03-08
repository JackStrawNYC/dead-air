/**
 * SegueCrossfade — smooth dual-render opacity crossfade for song-to-song segues.
 *
 * Unlike SceneCrossfade (flash→blackout→eruption for within-song transitions),
 * this renders both shaders simultaneously with a clean eased opacity crossfade.
 * No flash, no blackout — just one scene dissolving into the next.
 *
 * Safe for Remotion's offline rendering (frame-by-frame, not real-time).
 * Both scenes create separate AudioReactiveCanvas instances.
 */

import React from "react";
import { Easing } from "remotion";

interface Props {
  /** Progress through the crossfade: 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
}

const ease = Easing.inOut(Easing.ease);

export const SegueCrossfade: React.FC<Props> = ({ progress, outgoing, incoming }) => {
  const t = Math.max(0, Math.min(1, progress));
  const eased = ease(t);
  const outOpacity = 1 - eased;
  const inOpacity = eased;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {outOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: outOpacity,
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
          }}
        >
          {incoming}
        </div>
      )}
    </div>
  );
};
