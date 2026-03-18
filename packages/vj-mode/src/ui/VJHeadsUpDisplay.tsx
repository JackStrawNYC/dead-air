/**
 * VJHeadsUpDisplay — minimal translucent HUD for VJ operator.
 * Shows scene name, energy meters, BPM, transition progress,
 * blackout/freeze/lock indicators, and MIDI status.
 */

import React from "react";
import { useVJStore } from "../state/VJStore";
import { VJ_SCENES } from "../scenes/scene-list";
import { isMIDIActive } from "./MIDIController";
import type { SmoothedAudioState } from "../audio/types";

interface Props {
  audioState?: SmoothedAudioState;
  transitionProgress?: number;
  isTransitioning?: boolean;
}

const meterStyle = (value: number, color: string): React.CSSProperties => ({
  width: `${Math.min(100, value * 100)}%`,
  height: "4px",
  backgroundColor: color,
  borderRadius: "2px",
  transition: "width 0.05s linear",
});

const meterTrackStyle: React.CSSProperties = {
  width: "60px",
  height: "4px",
  backgroundColor: "rgba(255,255,255,0.1)",
  borderRadius: "2px",
  overflow: "hidden",
};

export const VJHeadsUpDisplay: React.FC<Props> = ({
  audioState,
  transitionProgress = 0,
  isTransitioning = false,
}) => {
  const store = useVJStore();

  if (!store.showHUD) return null;

  const entry = VJ_SCENES[store.currentScene];
  const affinityBadge = entry?.energyAffinity ?? "?";
  const hasFeedback = entry?.feedback ?? false;
  const midi = isMIDIActive();
  const bpm = audioState?.tempo ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 1000,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: "10px",
        color: "rgba(255,255,255,0.7)",
        backgroundColor: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
        borderRadius: "6px",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        userSelect: "none",
        pointerEvents: "none",
        lineHeight: 1.4,
      }}
    >
      {/* Scene name + affinity */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ color: "#fff", fontWeight: 600 }}>
          {store.currentScene.replace(/_/g, " ")}
        </span>
        <span
          style={{
            fontSize: "8px",
            padding: "1px 4px",
            borderRadius: "3px",
            backgroundColor:
              affinityBadge === "high" ? "rgba(255,80,80,0.4)" :
              affinityBadge === "mid" ? "rgba(255,200,80,0.4)" :
              affinityBadge === "low" ? "rgba(80,180,255,0.4)" :
              "rgba(150,150,150,0.4)",
            color: "#fff",
          }}
        >
          {affinityBadge}
        </span>
        {hasFeedback && (
          <span style={{ fontSize: "8px", color: "rgba(180,120,255,0.8)" }}>FB</span>
        )}
      </div>

      {/* Audio meters */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ width: "24px" }}>BAS</span>
        <div style={meterTrackStyle}>
          <div style={meterStyle(audioState?.bass ?? 0, "#ff4444")} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ width: "24px" }}>MID</span>
        <div style={meterTrackStyle}>
          <div style={meterStyle(audioState?.mids ?? 0, "#ffaa44")} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ width: "24px" }}>HI</span>
        <div style={meterTrackStyle}>
          <div style={meterStyle(audioState?.highs ?? 0, "#44aaff")} />
        </div>
      </div>

      {/* BPM */}
      <div>
        <span style={{ color: "rgba(255,255,255,0.5)" }}>BPM </span>
        <span>{bpm > 40 ? bpm.toFixed(0) : "—"}</span>
      </div>

      {/* Transition progress */}
      {isTransitioning && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "24px" }}>TRN</span>
          <div style={{ ...meterTrackStyle, width: "60px" }}>
            <div style={meterStyle(transitionProgress, "#88ff88")} />
          </div>
        </div>
      )}

      {/* Status indicators */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {store.blackout && (
          <span style={{ color: "#ff4444", fontWeight: 600 }}>BLACKOUT</span>
        )}
        {store.freeze && (
          <span style={{ color: "#44ccff", fontWeight: 600 }}>FREEZE</span>
        )}
        {store.lockedScene && (
          <span style={{ color: "#ffaa44", fontWeight: 600 }}>LOCKED</span>
        )}
        {store.autoTransition && (
          <span style={{ color: "rgba(255,255,255,0.4)" }}>AUTO</span>
        )}
        {midi && (
          <span style={{ color: "#88ff88" }}>MIDI</span>
        )}
      </div>
    </div>
  );
};
