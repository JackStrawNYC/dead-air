/**
 * ScenePicker — 4x4 grid of scene thumbnails with energy affinity badges.
 */

import React from "react";
import { useVJStore } from "../state/VJStore";
import { VJ_SCENE_LIST } from "../scenes/scene-list";
import type { VisualMode } from "@visualizer/data/types";

const ENERGY_COLORS: Record<string, string> = {
  low: "#4488ff",
  mid: "#44cc44",
  high: "#ff4444",
  any: "#888",
};

const LABEL_MAP: Partial<Record<VisualMode, string>> = {
  liquid_light: "Liquid Light",
  oil_projector: "Oil Projector",
  concert_lighting: "Concert",
  lo_fi_grain: "Lo-Fi Grain",
  particle_nebula: "Nebula",
  stark_minimal: "Minimal",
  tie_dye: "Tie Dye",
  cosmic_dust: "Cosmic Dust",
  vintage_film: "Vintage",
  cosmic_voyage: "Voyage",
  inferno: "Inferno",
  deep_ocean: "Deep Ocean",
  aurora: "Aurora",
  crystal_cavern: "Crystal",
  fluid_light: "Fluid Light",
  void_light: "Void Light",
  fractal_flames: "Fractal Flames",
  feedback_recursion: "Feedback",
  truchet_tiling: "Truchet",
  diffraction_rings: "Diffraction",
};

export const ScenePicker: React.FC = () => {
  const currentScene = useVJStore((s) => s.currentScene);
  const setScene = useVJStore((s) => s.setCurrentScene);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
        Scenes
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
        }}
      >
        {VJ_SCENE_LIST.map((entry, i) => {
          const isActive = entry.mode === currentScene;
          return (
            <button
              key={entry.mode}
              onClick={() => setScene(entry.mode)}
              style={{
                background: isActive ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
                border: isActive ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "6px 2px",
                cursor: "pointer",
                color: "#fff",
                fontSize: 9,
                textAlign: "center",
                position: "relative",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: isActive ? 600 : 400 }}>
                {i < 10 ? `${(i + 1) % 10}` : ""} {LABEL_MAP[entry.mode] ?? entry.mode}
              </div>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: ENERGY_COLORS[entry.energyAffinity],
                  position: "absolute",
                  top: 2,
                  right: 2,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
