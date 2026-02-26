/**
 * SceneCrossfade — opacity-blended transition between two visual modes.
 * Renders both outgoing and incoming scenes during crossfade period.
 * 90-frame (3s) crossfade duration.
 */

import React from "react";
import { interpolate } from "remotion";

interface Props {
  /** Progress through the crossfade: 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
}

export const SceneCrossfade: React.FC<Props> = ({ progress, outgoing, incoming }) => {
  const outOpacity = interpolate(progress, [0, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const inOpacity = interpolate(progress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Outgoing scene */}
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
      {/* Incoming scene */}
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
