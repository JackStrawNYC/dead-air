/**
 * TransitionModePicker — 3-button segmented control for transition mode.
 */

import React from "react";
import { useVJStore, type TransitionModeType } from "../state/VJStore";

const MODES: { key: TransitionModeType; label: string }[] = [
  { key: "linear", label: "Linear" },
  { key: "beat_synced", label: "Beat Sync" },
  { key: "beat_pumped", label: "Beat Pump" },
];

export const TransitionModePicker: React.FC = () => {
  const transitionMode = useVJStore((s) => s.transitionMode);
  const setTransitionMode = useVJStore((s) => s.setTransitionMode);

  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
      {MODES.map(m => (
        <button
          key={m.key}
          onClick={() => setTransitionMode(m.key)}
          style={{
            flex: 1,
            background: transitionMode === m.key ? "rgba(100,200,255,0.2)" : "rgba(255,255,255,0.04)",
            border: transitionMode === m.key ? "1px solid rgba(100,200,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 4,
            color: transitionMode === m.key ? "#8cf" : "#666",
            padding: "3px 4px",
            cursor: "pointer",
            fontSize: 9,
            fontFamily: "'Inter', system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
};
