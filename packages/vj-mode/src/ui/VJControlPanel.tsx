/**
 * VJControlPanel — transparent overlay sidebar, auto-hides during performance.
 */

import React from "react";
import { useVJStore } from "../state/VJStore";
import { ScenePicker } from "./ScenePicker";
import { PalettePicker } from "./PalettePicker";
import { AudioSourceSelector } from "./AudioSourceSelector";
import { FXPanel } from "./FXPanel";
import { TransitionModePicker } from "./TransitionModePicker";

interface Props {
  onMicConnect: () => void;
  onFileSelect: (url: string) => void;
}

export const VJControlPanel: React.FC<Props> = ({ onMicConnect, onFileSelect }) => {
  const showControls = useVJStore((s) => s.showControls);
  const autoTransition = useVJStore((s) => s.autoTransition);
  const setAutoTransition = useVJStore((s) => s.setAutoTransition);
  const transitionSpeed = useVJStore((s) => s.transitionSpeed);
  const setTransitionSpeed = useVJStore((s) => s.setTransitionSpeed);
  const resolution = useVJStore((s) => s.resolution);
  const setResolution = useVJStore((s) => s.setResolution);
  const jamDensity = useVJStore((s) => s.jamDensity);
  const setJamDensity = useVJStore((s) => s.setJamDensity);

  if (!showControls) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        color: "#fff",
        padding: 16,
        overflowY: "auto",
        zIndex: 100,
        borderRight: "1px solid rgba(255,255,255,0.1)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2 }}>DEAD AIR</div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>VJ MODE</div>
      </div>

      {/* Audio Source */}
      <AudioSourceSelector onMicConnect={onMicConnect} onFileSelect={onFileSelect} />

      {/* Scene Picker */}
      <ScenePicker />

      {/* Palette */}
      <PalettePicker />

      {/* FX Panel */}
      <FXPanel />

      {/* Transition */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          Transitions
        </div>
        <TransitionModePicker />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <label style={{ fontSize: 10, color: "#aaa", flex: 1 }}>Auto</label>
          <button
            onClick={() => setAutoTransition(!autoTransition)}
            style={{
              background: autoTransition ? "rgba(100,255,100,0.2)" : "rgba(255,255,255,0.05)",
              border: autoTransition ? "1px solid rgba(100,255,100,0.4)" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              color: "#fff",
              padding: "3px 10px",
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            {autoTransition ? "ON" : "OFF"} (Tab)
          </button>
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#aaa" }}>Speed: {transitionSpeed.toFixed(1)}s</label>
          <input
            type="range"
            min={50}
            max={1000}
            value={transitionSpeed * 100}
            onChange={(e) => setTransitionSpeed(Number(e.target.value) / 100)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Jam Density */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          Jam Density
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#aaa" }}>{(jamDensity * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={jamDensity * 100}
            onChange={(e) => setJamDensity(Number(e.target.value) / 100)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Performance */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
          Performance
        </div>
        <div>
          <label style={{ fontSize: 10, color: "#aaa" }}>Resolution: {Math.round(resolution * 100)}%</label>
          <input
            type="range"
            min={25}
            max={100}
            value={resolution * 100}
            onChange={(e) => setResolution(Number(e.target.value) / 100)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Keyboard shortcuts reference */}
      <div style={{ fontSize: 9, color: "#555", lineHeight: 1.6, marginTop: 20 }}>
        <div style={{ color: "#777", marginBottom: 4 }}>SHORTCUTS</div>
        <div>1-0: Select scene</div>
        <div>Space: Manual transition</div>
        <div>Tab: Toggle auto-transition</div>
        <div>[ / ]: Transition speed</div>
        <div>P: Cycle palette</div>
        <div>X: Toggle FX panel</div>
        <div>D: Toggle bloom</div>
        <div>V: Cycle grain</div>
        <div>Shift+T: Cycle transition mode</div>
        <div>F: Fullscreen</div>
        <div>G: FPS counter</div>
        <div>M: Toggle mic/file</div>
        <div>Esc: Hide controls</div>
      </div>
    </div>
  );
};
