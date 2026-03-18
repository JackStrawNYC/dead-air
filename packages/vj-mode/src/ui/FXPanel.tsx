/**
 * FXPanel — toggle grid + sliders for VJ PostProcess effects.
 * Collapsible section with 11 FX toggles and 2 continuous controls.
 */

import React, { useState } from "react";
import { useVJStore, type GrainStrength } from "../state/VJStore";

const GRAIN_LABELS: Record<GrainStrength, string> = {
  none: "N",
  low: "L",
  mid: "M",
  high: "H",
};

interface FXToggle {
  label: string;
  key: string;
  storeKey: keyof ReturnType<typeof useVJStore.getState>;
  action: string;
}

const FX_TOGGLES: FXToggle[] = [
  { label: "Bloom", key: "bloom", storeKey: "fxBloom", action: "setFxBloom" },
  { label: "Flare", key: "flare", storeKey: "fxFlare", action: "setFxFlare" },
  { label: "Halation", key: "halation", storeKey: "fxHalation", action: "setFxHalation" },
  { label: "CA", key: "ca", storeKey: "fxCA", action: "setFxCA" },
  { label: "Flood", key: "flood", storeKey: "fxStageFlood", action: "setFxStageFlood" },
  { label: "Pulse", key: "pulse", storeKey: "fxBeatPulse", action: "setFxBeatPulse" },
  { label: "CRT", key: "crt", storeKey: "fxCRT", action: "setFxCRT" },
  { label: "3D", key: "anaglyph", storeKey: "fxAnaglyph", action: "setFxAnaglyph" },
  { label: "Cycle", key: "cycle", storeKey: "fxPaletteCycle", action: "setFxPaletteCycle" },
  { label: "Thermal", key: "thermal", storeKey: "fxThermalShimmer", action: "setFxThermalShimmer" },
];

export const FXPanel: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const store = useVJStore();

  const activeFxCount = FX_TOGGLES.filter(fx => store[fx.storeKey] as boolean).length
    + (store.fxGrain !== "none" ? 1 : 0);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          color: "#888",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ fontSize: 8 }}>{collapsed ? "\u25B6" : "\u25BC"}</span>
        FX ({activeFxCount})
      </div>

      {!collapsed && (
        <>
          {/* Toggle grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            marginBottom: 10,
          }}>
            {FX_TOGGLES.map(fx => {
              const active = store[fx.storeKey] as boolean;
              return (
                <button
                  key={fx.key}
                  onClick={() => (store as any)[fx.action](!active)}
                  style={{
                    background: active ? "rgba(100,255,100,0.15)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(100,255,100,0.35)" : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    color: active ? "#8f8" : "#666",
                    padding: "4px 2px",
                    cursor: "pointer",
                    fontSize: 9,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    textAlign: "center",
                  }}
                >
                  {fx.label}
                </button>
              );
            })}

            {/* Grain cycles through N/L/M/H */}
            <button
              onClick={() => store.cycleGrainStrength()}
              style={{
                background: store.fxGrain !== "none" ? "rgba(100,255,100,0.15)" : "rgba(255,255,255,0.04)",
                border: store.fxGrain !== "none" ? "1px solid rgba(100,255,100,0.35)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 4,
                color: store.fxGrain !== "none" ? "#8f8" : "#666",
                padding: "4px 2px",
                cursor: "pointer",
                fontSize: 9,
                fontFamily: "'Inter', system-ui, sans-serif",
                textAlign: "center",
              }}
            >
              Grain:{GRAIN_LABELS[store.fxGrain]}
            </button>
          </div>

          {/* Bloom Threshold slider */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ fontSize: 10, color: "#aaa" }}>
              Bloom Thresh: {store.fxBloomThreshold.toFixed(2)}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={store.fxBloomThreshold * 100}
              onChange={(e) => store.setFxBloomThreshold(Number(e.target.value) / 100)}
              style={{ width: "100%" }}
            />
          </div>

          {/* Feedback Decay slider */}
          <div>
            <label style={{ fontSize: 10, color: "#aaa" }}>
              Feedback Decay: {store.fxFeedbackDecay.toFixed(2)}
            </label>
            <input
              type="range"
              min={80}
              max={100}
              value={store.fxFeedbackDecay * 100}
              onChange={(e) => store.setFxFeedbackDecay(Number(e.target.value) / 100)}
              style={{ width: "100%" }}
            />
          </div>
        </>
      )}
    </div>
  );
};
