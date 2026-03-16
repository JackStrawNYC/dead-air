/**
 * PalettePicker — HSL hue slider + saturation control + Dead-themed presets.
 */

import React from "react";
import { useVJStore } from "../state/VJStore";

export const PalettePicker: React.FC = () => {
  const primary = useVJStore((s) => s.palettePrimary);
  const saturation = useVJStore((s) => s.paletteSaturation);
  const setPrimary = useVJStore((s) => s.setPalettePrimary);
  const setSaturation = useVJStore((s) => s.setPaletteSaturation);
  const cyclePreset = useVJStore((s) => s.cyclePresetPalette);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        Palette
      </div>

      {/* Hue slider */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: "#aaa" }}>Hue: {Math.round(primary)}</label>
        <input
          type="range"
          min={0}
          max={360}
          value={primary}
          onChange={(e) => setPrimary(Number(e.target.value))}
          style={{
            width: "100%",
            height: 8,
            WebkitAppearance: "none",
            background: "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
            borderRadius: 4,
            outline: "none",
          }}
        />
      </div>

      {/* Saturation slider */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: "#aaa" }}>Saturation: {Math.round(saturation * 100)}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={saturation * 100}
          onChange={(e) => setSaturation(Number(e.target.value) / 100)}
          style={{ width: "100%" }}
        />
      </div>

      {/* Preset button */}
      <button
        onClick={cyclePreset}
        style={{
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 4,
          color: "#fff",
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 11,
          width: "100%",
        }}
      >
        Cycle Preset (P)
      </button>
    </div>
  );
};
